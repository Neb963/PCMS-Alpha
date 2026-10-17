"""S02 fixed-purpose, *unregistered* native backup stream engine.

No path, vault secret, native command or route is supplied by browser clients.
Production registration/promotion is forbidden until independent E-06 review.
The Python host process lives for one connectNative port, owns exactly one
incremental GCM context, and journals possible effects before dispatch.
"""
import base64
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import struct
import sys
import time

# Support both the real standalone native executable and importable test module.
try:
    from .backup_stream_v2 import (BackupError, EncryptedWriter, verify_two_pass, BUFFER,
                                   _fd_read, _read_header, _key, TAG_BYTES, HEADER)
except ImportError:
    from backup_stream_v2 import (BackupError, EncryptedWriter, verify_two_pass, BUFFER,
                                  _fd_read, _read_header, _key, TAG_BYTES, HEADER)
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.exceptions import InvalidTag
try:
    from .backup_v2_retention import eligible_for_prune, qualified
except ImportError:
    from backup_v2_retention import eligible_for_prune, qualified

_ID = re.compile(r"^s02_[a-f0-9]{32}$")
_DIGEST = re.compile(r"^[a-f0-9]{64}$")
_ALLOWED = ("export.begin", "export.append", "export.finish",
            "archive.inspect", "archive.read", "backup.verify",
            "restore.begin", "restore.read", "restore.abort",
            "archive.recovery.complete", "archive.retention.plan",
            "archive.retention.prune")
_MAX_CIPHERTEXT_READ = 49152


def _require(ok, code):
    if not ok:
        raise BackupError(code)


def _safe_root(root, create=False):
    """Root selected by trusted installation only; never from a message."""
    # Path.resolve() would follow a symlink and silently bless its target.
    # Examine every existing component *before* creating any missing child.
    root = Path(os.path.abspath(root))
    ancestry = (*reversed(root.parents), root)
    for folder in ancestry:
        if folder.is_symlink():
            raise BackupError("BACKUP_ROOT_UNSAFE")
        if folder.exists():
            info = folder.lstat()
            _require(stat.S_ISDIR(info.st_mode) and
                     not stat.S_ISLNK(info.st_mode), "BACKUP_ROOT_UNSAFE")
    if create:
        root.mkdir(mode=0o700, parents=True, exist_ok=True)
    if not root.exists():
        return None
    for folder in ancestry:
        if folder.is_symlink() or not stat.S_ISDIR(folder.lstat().st_mode):
            raise BackupError("BACKUP_ROOT_UNSAFE")
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
        self.restore = None
        self._export_lock = None
        self._last_restore = None

    def _acquire_export_lock(self):
        # One OS-owned export context per fixed backup root, even when Firefox
        # opens two native ports/processes concurrently. flock releases on crash.
        _require(self._export_lock is None,"BACKUP_SESSION_BUSY")
        fd=os.open(self.root / ".export.lock",
                   os.O_RDWR | os.O_CREAT | getattr(os,"O_NOFOLLOW",0),0o600)
        try:
            info=os.fstat(fd)
            _require(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and
                     not bool(info.st_mode & 0o077),"BACKUP_LOCK_UNSAFE")
            try:
                fcntl.flock(fd,fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError as error:
                raise BackupError("BACKUP_SESSION_BUSY") from error
            self._export_lock=fd
        except BaseException:
            os.close(fd)
            raise

    def _release_export_lock(self):
        if self._export_lock is not None:
            os.close(self._export_lock)
            self._export_lock=None

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
                "backup.verify": {"action","runId","keyRef"},
                "restore.begin": {"action","runId","keyRef"},
                "restore.read": {"action","runId","sequence"},
                "restore.abort": {"action","runId"},
                "archive.recovery.complete": {"action","runId","sha256",
                                               "preparedSha256","status"},
                "archive.retention.plan": {"action"},
                "archive.retention.prune": {"action"}
            }
            _require(set(message) == schemas[action], "BACKUP_COMMAND_SCHEMA")
            dispatch={
                "export.begin":self._begin,
                "export.append":self._append,
                "export.finish":self._finish,
                "archive.inspect":self._inspect,
                "archive.read":self._read,
                "backup.verify":self._verify,
                "restore.begin":self._restore_begin,
                "restore.read":self._restore_read,
                "restore.abort":self._restore_abort,
                "archive.recovery.complete":self._qualify_recovery,
                "archive.retention.plan":self._retention_plan,
                "archive.retention.prune":self._retention_prune
            }
            result=dispatch[action](message) if "runId" in message else dispatch[action]()
            if result.get("ok") is True and "runId" in message:
                # Every native receipt is pinned to its initiating archive.
                _require(result.get("runId",message["runId"])==message["runId"],
                         "BACKUP_NATIVE_RUN_MISMATCH")
                return {**result,"runId":message["runId"]}
            return result
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
        self._acquire_export_lock()
        try:
            _require(_read_json(ledger) is None and not artifact.exists(),
                     "BACKUP_RUN_ALREADY_USED")
            # Vault lookup precedes the possible-effect write. The host retains
            # neither the secret nor a lock after an unavailable vault.
            secret = self.vault_get()
            _require(isinstance(secret,str) and len(secret)>=12,
                     "BACKUP_VAULT_UNAVAILABLE")
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
        except BaseException:
            # F1: no unsuccessful begin may leave this native connection
            # monopolizing the OS lock. An opened-but-unacknowledged writer is
            # abandoned (never finalized or retried); its CREATE_POSSIBLE
            # ledger and any ciphertext bytes remain for explicit inspection.
            if self.writer is not None:
                self.writer.abandon()
                self.writer = None
            self.current = None
            self._release_export_lock()
            raise

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
        self._last_restore=None
        self._release_export_lock()
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

    def _restore_begin(self,msg):
        _require(self.restore is None and self.writer is None,
                 "BACKUP_RESTORE_BUSY")
        state=self._observe(msg["runId"])
        _require(state is not None and state["state"] in
                 ("WRITTEN_UNVERIFIED","RECOVERY_VERIFIED") and
                 msg["keyRef"]=="portable-recovery","BACKUP_RESTORE_HELD")
        _,path=self._paths(msg["runId"])
        password=self.vault_get()
        _require(isinstance(password,str) and len(password)>=12,
                 "BACKUP_VAULT_UNAVAILABLE")
        # Independent first pass authenticates and validates complete v2
        # inventory; no source or identity is exposed before that.
        proof=verify_two_pass(path,password)
        self._last_restore=None
        file=_fd_read(path)
        try:
            info=os.fstat(file.fileno())
            header,salt,iv,length=_read_header(file)
            file.seek(HEADER.size+length)
            tag=file.read(TAG_BYTES)
            dec=Cipher(algorithms.AES(_key(password,salt)),
                       modes.GCM(iv,tag)).decryptor()
            dec.authenticate_additional_data(header)
            file.seek(HEADER.size)
            self.restore={"runId":msg["runId"],"file":file,
                          "identity":(info.st_dev,info.st_ino,info.st_size,
                                      info.st_mtime_ns,info.st_ctime_ns),
                          "sha256":proof["sha256"],"length":length,"offset":0,
                          "sequence":0,"decryptor":dec}
            return {"ok":True,"state":"INACTIVE_STAGING_REQUIRED",
                    "plaintextBytes":length,"sha256":proof["sha256"]}
        except BaseException:
            file.close()
            raise
        finally:
            password=None

    def _restore_read(self,msg):
        current=self.restore
        _require(current is not None and current["runId"]==msg["runId"] and
                 type(msg["sequence"]) is int and
                 msg["sequence"]==current["sequence"],
                 "BACKUP_RESTORE_SEQUENCE_INVALID")
        file=current["file"]
        try:
            data=file.read(min(_MAX_CIPHERTEXT_READ,
                               current["length"]-current["offset"]))
            if not data and current["offset"]<current["length"]:
                raise BackupError("BACKUP_RESTORE_TRUNCATED")
            current["offset"]+=len(data)
            decoded=current["decryptor"].update(data)
            complete=current["offset"]==current["length"]
            if complete:
                decoded+=current["decryptor"].finalize()
                before=current["identity"]
                now=os.fstat(file.fileno())
                _require(before==(now.st_dev,now.st_ino,now.st_size,
                                  now.st_mtime_ns,now.st_ctime_ns),
                         "BACKUP_RESTORE_FILE_CHANGED")
                file.seek(0)
                digest=hashlib.sha256()
                for part in iter(lambda:file.read(BUFFER),b""):
                    digest.update(part)
                _require(digest.hexdigest()==current["sha256"],
                         "BACKUP_RESTORE_FILE_CHANGED")
            current["sequence"]+=1
            response={"ok":True,"state":"AUTHENTICATED_SECOND_PASS" if complete
                      else "INACTIVE_STAGING_FRAGMENT",
                      "sequence":msg["sequence"],
                      "bytes":base64.b64encode(decoded).decode(),
                      "complete":complete}
            if complete:
                response["sha256"]=current["sha256"]
                self._last_restore={"runId":current["runId"],
                                    "sha256":current["sha256"]}
                file.close()
                self.restore=None
            return response
        except InvalidTag as error:
            file.close()
            self.restore=None
            raise BackupError("BACKUP_RESTORE_AUTH_FAILED") from error
        except BaseException:
            # A changed/truncated disk file or interrupted second pass must
            # discard this reader; never continue from an ambiguous offset.
            file.close()
            self.restore=None
            raise

    def _restore_abort(self,msg):
        current=self.restore
        _require(current is not None and current["runId"]==msg["runId"],
                 "BACKUP_RESTORE_NOT_OWNED")
        current["file"].close()
        self.restore=None
        return {"ok":True,"state":"RESTORE_READER_ABORTED"}

    def _qualify_recovery(self,msg):
        """Protected v2 coordinator confirms full donor/source decoder result.

        Never trust a GCM verification alone. This receipt is still a candidate
        until E-06 authorizes the same-XPI native-port authority and host proof.
        """
        run=msg["runId"]
        ledger, artifact=self._paths(run)
        previous=self._observe(run)
        _require(previous is not None and previous["state"]=="WRITTEN_UNVERIFIED" and
                 self._last_restore is not None and
                 self._last_restore["runId"]==run and
                 self._last_restore["sha256"]==msg["sha256"] and
                 isinstance(msg["preparedSha256"],str) and
                 _DIGEST.fullmatch(msg["preparedSha256"]) and
                 msg["status"] in ("INACTIVE_PREPARED_NOT_APPLIED",
                                   "READONLY_RECOVERY_VERIFIED"),
                 "BACKUP_RECOVERY_RECEIPT_REQUIRED")
        secret=self.vault_get()
        _require(isinstance(secret,str) and len(secret)>=12,
                 "BACKUP_VAULT_UNAVAILABLE")
        try:
            proof=verify_two_pass(artifact,secret)
        finally:
            secret=None
        _require(proof["sha256"]==msg["sha256"],"BACKUP_RECOVERY_FILE_CHANGED")
        # A completed, observed inactive decoder may qualify retention, but
        # cannot authorize Persona activation, provider/Git or replayed jobs.
        next_state={**previous,"state":"RECOVERY_VERIFIED",
                    "ciphertextSha256":msg["sha256"],
                    "preparedSha256":msg["preparedSha256"],
                    "verifiedAtNs":time.time_ns()}
        self._write(next_state)
        self._last_restore=None
        return {"ok":True,"state":"RECOVERY_VERIFIED","runId":run,
                "sha256":msg["sha256"],"activation":"OFF"}

    def _retained(self):
        if _safe_root(self.root,create=False) is None:
            return []
        ledgers=[]
        for name in os.listdir(self.root):
            if not name.endswith(".ledger"):
                continue
            run=name[:-7]
            _require(_ID.fullmatch(run) is not None,
                     "BACKUP_RETENTION_LEDGER_UNSAFE")
            row=_read_json(self.root/name)
            _require(row is not None and row.get("runId")==run,
                     "BACKUP_RETENTION_LEDGER_UNSAFE")
            if qualified(row):
                # An absent/moved/substituted successful file cannot count
                # towards 14 successes, nor authorize deleting the last good.
                _,cipher=self._paths(run)
                try:
                    info=cipher.lstat()
                except FileNotFoundError as error:
                    raise BackupError("BACKUP_RETENTION_INTEGRITY_HOLD") from error
                _require(stat.S_ISREG(info.st_mode) and info.st_nlink==1 and
                         info.st_uid==os.getuid() and info.st_size>66,
                         "BACKUP_RETENTION_INTEGRITY_HOLD")
            ledgers.append(row)
            _require(len(ledgers)<=100000,"BACKUP_RETENTION_CATALOG_LIMIT")
        return ledgers

    def _retention_plan(self):
        ledger=self._retained()
        _require(not any(r.get("state")=="DELETE_POSSIBLE" for r in ledger),
                 "BACKUP_RETENTION_UNCERTAIN_DELETE")
        options=eligible_for_prune(ledger)
        # No delete, unlock, vault lookup, recovery state change or path leak.
        return {"ok":True,"state":"PLAN_ONLY","qualified":len([
            v for v in ledger if qualified(v)]),
                "pruneCandidate":options[0]["runId"] if options else None}

    def _unlink_artifact(self, path):
        os.unlink(path)

    def _retention_prune(self):
        # This unregistered candidate is an actual bounded native disk effect;
        # allowed ONLY against isolated disposable test root pre-review.
        _require(self.writer is None and self.restore is None and
                 self._export_lock is None,"BACKUP_SESSION_BUSY")
        _require(_safe_root(self.root,create=False) is not None,
                 "BACKUP_RETENTION_NO_ROOT")
        self._acquire_export_lock()
        try:
            catalogue=self._retained()
            _require(not any(r.get("state")=="DELETE_POSSIBLE"
                             for r in catalogue),
                     "BACKUP_RETENTION_UNCERTAIN_DELETE")
            options=eligible_for_prune(catalogue)
            if not options:
                return {"ok":True,"state":"NO_ELIGIBLE_DELETE"}
            prior=options[0]
            ledger,artifact=self._paths(prior["runId"])
            password=self.vault_get()
            _require(isinstance(password,str) and len(password)>=12,
                     "BACKUP_VAULT_UNAVAILABLE")
            try:
                proof=verify_two_pass(artifact,password)
            finally:
                password=None
            _require(proof["sha256"]==prior["ciphertextSha256"],
                     "BACKUP_RETENTION_FILE_CHANGED")
            # Journal intent before unlink. A lost-ACK/OS error leaves a
            # DELETE_POSSIBLE state, never automatically reissues the unlink.
            self._write({**prior,"state":"DELETE_POSSIBLE"})
            self._unlink_artifact(artifact)
            _fsync_directory(self.root)
            self._write({**prior,"state":"REMOVED"})
            return {"ok":True,"state":"REMOVED","runId":prior["runId"]}
        finally:
            self._release_export_lock()

    def close(self):
        if self.restore is not None:
            self.restore["file"].close()
            self.restore=None
        if self.writer is not None:
            self.writer.abandon()
            self.writer=None
        self.current=None
        self._release_export_lock()
        # Persisted APPEND_POSSIBLE / FINISH_POSSIBLE is never rolled back.


# Bound stdio messages for this dedicated, persistently connected native port.
# This is NOT installed or registered by the S02 draft PR.
MAX_MESSAGE = 100000


def _recv(stream):
    header = stream.read(4)
    if not header:
        return None
    if len(header) != 4:
        return {"action": "invalid"}
    length = struct.unpack("<I", header)[0]
    if not (0 < length <= MAX_MESSAGE):
        # Fail closed; never attempt to consume an unbounded attacker length.
        return {"action": "invalid"}
    packet = stream.read(length)
    if len(packet) != length:
        return {"action": "invalid"}
    try:
        return json.loads(packet.decode("utf-8"))
    except (ValueError, UnicodeError):
        return {"action": "invalid"}


def _send(stream, response):
    raw = json.dumps(response, separators=(",", ":")).encode("utf-8")
    _require(len(raw) <= MAX_MESSAGE, "BACKUP_RESPONSE_TOO_LARGE")
    stream.write(struct.pack("<I", len(raw)) + raw)
    stream.flush()


def main():
    # Only the native-host installer chooses executable identity and data root;
    # browser messages cannot choose a filesystem directory or keyring scope.
    # No root created for read-only inspect. Never touch a personal profile.
    from backup_vault_host import action as vault_action
    root = Path.home() / ".local" / "share" / "pcms-alpha" / "backups"
    def vault():
        result = vault_action({"action": "get"})
        return result.get("passphrase") if result.get("ok") is True else None
    host = V2ArchiveHost(root, vault)
    try:
        while True:
            command = _recv(sys.stdin.buffer)
            if command is None:
                break
            response = host.action(command)
            _send(sys.stdout.buffer, response)
            if command == {"action": "invalid"}:
                break
    finally:
        host.close()


if __name__ == "__main__":
    main()
