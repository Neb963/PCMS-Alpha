"""S02 fixed-purpose, *unregistered* native backup stream engine.

No path, vault secret, native command or route is supplied by browser clients.
Production registration/promotion is forbidden until independent E-06 review.
The Python host process lives for one connectNative port, owns exactly one
incremental GCM context, and journals possible effects before dispatch.
"""
import base64
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile

from backup_stream_v2 import BackupError, EncryptedWriter, verify_two_pass, BUFFER

_ID = re.compile(r"^s02_[a-f0-9]{32}$")
_DIGEST = re.compile(r"^[a-f0-9]{64}$")
_ALLOWED = ("export.begin", "export.append", "export.finish",
            "archive.inspect", "archive.read", "backup.verify")
_MAX_CIPHERTEXT_READ = 49152


def _require(ok, code):
    if not ok:
        raise BackupError(code)


def _safe_root(root, create=False):
    """Root selected by trusted installation only; never from a message."""
    root = Path(root)
    if create:
        root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not root.exists():
        return None
    for folder in (root, *root.parents):
        if folder.exists():
            info = folder.lstat()
            _require(stat.S_ISDIR(info.st_mode) and
                     not stat.S_ISLNK(info.st_mode), "BACKUP_ROOT_UNSAFE")
    _require(not bool(root.stat().st_mode & 0o077), "BACKUP_ROOT_PERMISSIONS")
    return root


def _fsync_directory(folder):
    fd = os.open(folder, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0) |
                 getattr(os, "O_NOFOLLOW", 0))
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def _atomic_json(path, record):
    # Files are updated atomically, fail-closed on uncertain fsync/rename.
    raw = json.dumps(record, sort_keys=True, separators=(",", ":")).encode()
    fd, tmp = tempfile.mkstemp(prefix=".pcms-intent-", dir=path.parent)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(tmp, path)
        _fsync_directory(path.parent)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


def _read_json(path):
    try:
        fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    except FileNotFoundError:
        return None
    with os.fdopen(fd, "rb") as stream:
        info = os.fstat(stream.fileno())
        _require(stat.S_ISREG(info.st_mode) and info.st_size <= 8192 and
                 not bool(info.st_mode & 0o077), "BACKUP_LEDGER_UNSAFE")
        try:
            data = json.loads(stream.read().decode())
        except (ValueError, UnicodeError):
            raise BackupError("BACKUP_LEDGER_CORRUPT")
    _require(isinstance(data, dict) and data.get("schema") == 1 and
             isinstance(data.get("state"), str), "BACKUP_LEDGER_CORRUPT")
    return data


def _decode_fragment(value):
    _require(isinstance(value, str) and
             len(value) <= (BUFFER+2)//3*4+4 and
             re.fullmatch(r"(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?",
                          value) is not None, "BACKUP_FRAGMENT_INVALID")
    try:
        chunk = base64.b64decode(value, validate=True)
    except ValueError:
        raise BackupError("BACKUP_FRAGMENT_INVALID")
    _require(len(chunk) <= BUFFER, "BACKUP_FRAGMENT_INVALID")
    return chunk


class V2ArchiveHost:
    """Per-connection native session. State persists; encryption context does not."""

    def __init__(self, trusted_root, vault_get):
        self.root = Path(trusted_root)  # host-specified only
        self.vault_get = vault_get
        self.writer = None
        self.current = None

    def _paths(self, run_id):
        _require(isinstance(run_id, str) and _ID.fullmatch(run_id),
                 "BACKUP_RUN_ID_INVALID")
        return (self.root / (run_id + ".ledger"),
                self.root / (run_id + ".encrypted"))

    def _observe(self, run_id):
        ledger, _ = self._paths(run_id)
        root = _safe_root(self.root, create=False)
        if root is None:
            return None
        state = _read_json(ledger)
        if state is not None:
            _require(state["runId"] == run_id, "BACKUP_LEDGER_CORRUPT")
        return state

    def _write(self, state):
        ledger, _ = self._paths(state["runId"])
        _atomic_json(ledger, state)

    def action(self, message):
        try:
            _require(isinstance(message, dict) and
                     message.get("action") in _ALLOWED, "BACKUP_ACTION_DENIED")
            action = message["action"]
            schemas = {
                "export.begin": {"action","runId","cutDigest",
                                 "expectedPlaintextBytes","keyRef"},
                "export.append": {"action","runId","sequence","bytes","sha256"},
                "export.finish": {"action","runId","sequence","cutDigest"},
                "archive.inspect": {"action","runId"},
                "archive.read": {"action","runId","offset","length"},
                "backup.verify": {"action","runId","keyRef"}
            }
            _require(set(message) == schemas[action], "BACKUP_COMMAND_SCHEMA")
            if action == "export.begin":
                return self._begin(message)
            if action == "export.append":
                return self._append(message)
            if action == "export.finish":
                return self._finish(message)
            if action == "archive.inspect":
                return self._inspect(message)
            if action == "archive.read":
                return self._read(message)
            return self._verify(message)
        except (BackupError, OSError, ValueError, TypeError) as exc:
            code = str(exc)
            return {"ok":False,"code":code if re.fullmatch(r"BACKUP_[A-Z0-9_]{3,70}",code)
                    else "BACKUP_NATIVE_UNAVAILABLE"}

    def _begin(self, msg):
        run = msg["runId"]
        ledger, artifact = self._paths(run)
        _require(self.current is None and self.writer is None, "BACKUP_SESSION_BUSY")
        _require(msg["keyRef"] == "portable-recovery" and
                 _DIGEST.fullmatch(str(msg["cutDigest"])) and
                 type(msg["expectedPlaintextBytes"]) is int and
                 0 <= msg["expectedPlaintextBytes"] <= (1<<36)-32,
                 "BACKUP_BEGIN_INVALID")
        _safe_root(self.root,create=True)
        _require(_read_json(ledger) is None and not artifact.exists(),
                 "BACKUP_RUN_ALREADY_USED")
        # This lookup uses the existing Secret Service helper in a native process.
        secret = self.vault_get()
        _require(isinstance(secret,str) and len(secret)>=12,"BACKUP_VAULT_UNAVAILABLE")
        state={"schema":1,"runId":run,"cutDigest":msg["cutDigest"],
               "state":"CREATE_POSSIBLE","nextSequence":0,"last":None,
               "plaintextBytes":msg["expectedPlaintextBytes"],"acceptedBytes":0}
        self._write(state)  # durable possible-effect boundary BEFORE open.
        self.current = state
        try:
            self.writer=EncryptedWriter(artifact,secret,msg["expectedPlaintextBytes"])
        finally:
            secret = None
        state["state"]="OPEN_OBSERVED"
        self._write(state)
        return {"ok":True,"state":"OPEN_OBSERVED","runId":run}

    def _append(self,msg):
        run=msg["runId"];self._paths(run)
        state=self.current
        _require(state is not None and state["runId"]==run and self.writer is not None,
                 "BACKUP_SESSION_NOT_OWNED")
        _require(type(msg["sequence"]) is int and msg["sequence"]>=0 and
                 _DIGEST.fullmatch(str(msg["sha256"])),"BACKUP_APPEND_INVALID")
        data=_decode_fragment(msg["bytes"])
        digest=hashlib.sha256(data).hexdigest()
        _require(digest==msg["sha256"],"BACKUP_FRAGMENT_DIGEST_INVALID")
        if (msg["sequence"]==state["nextSequence"]-1 and
                state["state"]=="OPEN_OBSERVED" and state["last"]==
                {"sequence":msg["sequence"],"sha256":digest,"bytes":len(data)}):
            return {"ok":True,"state":"APPEND_OBSERVED",
                    "sequence":msg["sequence"],"acceptedBytes":state["acceptedBytes"],
                    "duplicate":True}
        _require(state["state"]=="OPEN_OBSERVED" and
                 msg["sequence"]==state["nextSequence"],"BACKUP_APPEND_UNCERTAIN")
        _require(state["acceptedBytes"]+len(data)<=state["plaintextBytes"],
                 "BACKUP_LENGTH_MISMATCH")
        state["state"]="APPEND_POSSIBLE"
        state["last"]={"sequence":msg["sequence"],"sha256":digest,"bytes":len(data)}
        self._write(state)
        self.writer.append(data)
        state["acceptedBytes"]+=len(data)
        state["nextSequence"]+=1
        state["state"]="OPEN_OBSERVED"
        self._write(state)
        return {"ok":True,"state":"APPEND_OBSERVED",
                "sequence":msg["sequence"],"acceptedBytes":state["acceptedBytes"],
                "duplicate":False}

    def _finish(self,msg):
        state=self.current;run=msg["runId"];self._paths(run)
        _require(state is not None and state["runId"]==run and
                 self.writer is not None, "BACKUP_SESSION_NOT_OWNED")
        _require(msg["cutDigest"]==state["cutDigest"] and
                 type(msg["sequence"]) is int and
                 msg["sequence"]==state["nextSequence"] and
                 state["state"]=="OPEN_OBSERVED" and
                 state["acceptedBytes"]==state["plaintextBytes"],
                 "BACKUP_FINISH_NOT_ADMISSIBLE")
        state["state"]="FINISH_POSSIBLE"
        self._write(state)
        receipt=self.writer.finish()
        self.writer=None
        state["state"]="WRITTEN_UNVERIFIED"
        self._write(state)
        self.current=None
        return {"ok":True,"state":state["state"],"bytes":receipt["bytes"]}

    def _inspect(self,msg):
        state=self._observe(msg["runId"])
        if state is None:
            return {"ok":False,"code":"BACKUP_NOT_TRACKED"}
        # Never disclose source, password, exact archive filesystem path or key.
        return {"ok":True,"state":state["state"],"runId":state["runId"],
                "acceptedBytes":state["acceptedBytes"],
                "expectedBytes":state["plaintextBytes"]}

    def _read(self,msg):
        state=self._observe(msg["runId"])
        _require(state is not None and state["state"]=="WRITTEN_UNVERIFIED",
                 "BACKUP_NOT_VERIFIED")
        _require(type(msg["offset"]) is int and type(msg["length"]) is int and
                 msg["offset"]>=0 and 0<msg["length"]<=_MAX_CIPHERTEXT_READ,
                 "BACKUP_READ_RANGE_INVALID")
        _,path=self._paths(msg["runId"])
        fd=os.open(path,os.O_RDONLY|getattr(os,"O_NOFOLLOW",0))
        with os.fdopen(fd,"rb") as file:
            info=os.fstat(file.fileno())
            _require(stat.S_ISREG(info.st_mode) and info.st_nlink==1,
                     "BACKUP_FILE_UNSAFE")
            file.seek(msg["offset"])
            data=file.read(msg["length"])
        return {"ok":True,"bytes":base64.b64encode(data).decode(),
                "offset":msg["offset"],"length":len(data),"eof":len(data)<msg["length"]}

    def _verify(self,msg):
        state=self._observe(msg["runId"])
        _require(state is not None and state["state"]=="WRITTEN_UNVERIFIED" and
                 msg["keyRef"]=="portable-recovery","BACKUP_NOT_VERIFIABLE")
        _,path=self._paths(msg["runId"])
        secret=self.vault_get()
        _require(isinstance(secret,str) and len(secret)>=12,"BACKUP_VAULT_UNAVAILABLE")
        try:
            receipt=verify_two_pass(path,secret)
        finally:
            secret=None
        # Do not promote to COMPLETE: donor/restore is separately required.
        return {"ok":True,"state":"AUTHENTICATED_INVENTORY_ONLY",**receipt}

    def close(self):
        if self.writer is not None:
            self.writer.abandon()
            self.writer=None
        self.current=None
        # Persisted APPEND_POSSIBLE / FINISH_POSSIBLE is never rolled back.
