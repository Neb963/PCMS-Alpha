"""S02 EXPERIMENTAL native v2 crypto core: not registered or production-enabled.

One incremental AES-256-GCM message, never independently keyed chunks.
The future privileged host adapter MUST select paths/credentials and own
run/cut journals; no untrusted extension page may supply arbitrary paths.
This unreviewed format is an implementation spike, NOT E-06 acceptance.
"""
import hashlib
import json
import math
import os
import stat
import struct
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes

MAGIC = b"PCMSBK2\x00"
HEADER = struct.Struct(">8sBBI16s12sQ")
FRAME = struct.Struct(">BQ")
TAG_BYTES = 16
ITERATIONS = 250000
ALGORITHM = 1
MAX_GCM_PLAINTEXT = (1 << 36) - 32
BUFFER = 65536
BLOB, CANONICAL, DONOR, END = 1, 2, 3, 255
# Limits apply before allocating or buffering untrusted decrypted metadata.
MAX_CANONICAL_FRAME = 4 * 1024 * 1024
MAX_END_FRAME = 1024 * 1024
MAX_BLOB_FRAME = 12 * 1024 * 1024 + 32
MAX_DONOR_FRAME = 2 * 1024 * 1024 * 1024
MAX_RECORDS = 100000
MAX_BLOBS = 100000


class BackupError(ValueError):
    """Sanitized code, not decrypted source or credentials."""


def _check(condition, code):
    if not condition:
        raise BackupError(code)


def _key(password, salt):
    _check(isinstance(password, str) and 12 <= len(password) and
           len(password.encode("utf-8")) <= 4096, "BACKUP_PASSPHRASE_INVALID")
    return PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt,
                     iterations=ITERATIONS).derive(password.encode("utf-8"))


def frame(tag, data):
    """Test/producer helper. Stream large blobs in production."""
    _check(tag in (BLOB, CANONICAL, DONOR, END) and isinstance(data, bytes),
           "BACKUP_FRAME_INVALID")
    return FRAME.pack(tag, len(data)) + data


def _fd_read(path):
    fd = os.open(path, os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0))
    try:
        info = os.fstat(fd)
        _check(stat.S_ISREG(info.st_mode) and info.st_nlink == 1,
               "BACKUP_FILE_UNSAFE")
    except BaseException:
        os.close(fd)
        raise
    return os.fdopen(fd, "rb")


def _write_all(fd, data):
    while data:
        count = os.write(fd, data)
        _check(count > 0, "BACKUP_DISK_WRITE_FAILED")
        data = data[count:]


class EncryptedWriter:
    """Single-use, exclusive ciphertext writer; never resumes a lost ACK."""

    def __init__(self, path, password, expected_bytes, *, _test_entropy=None):
        _check(isinstance(expected_bytes, int) and
               0 <= expected_bytes <= MAX_GCM_PLAINTEXT,
               "BACKUP_CRYPTO_LENGTH_INVALID")
        salt, iv = (_test_entropy if _test_entropy is not None else
                    (os.urandom(16), os.urandom(12)))
        _check(isinstance(salt, bytes) and len(salt) == 16 and
               isinstance(iv, bytes) and len(iv) == 12, "BACKUP_ENTROPY_INVALID")
        self.header = HEADER.pack(MAGIC, 2, ALGORITHM, ITERATIONS, salt, iv,
                                  expected_bytes)
        cipher = Cipher(algorithms.AES(_key(password, salt)), modes.GCM(iv))
        self.encryptor = cipher.encryptor()
        self.encryptor.authenticate_additional_data(self.header)
        self.fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL |
                          getattr(os, "O_NOFOLLOW", 0), 0o600)
        self.written = 0
        self.finished = False
        _write_all(self.fd, self.header)

    def append(self, plaintext):
        _check(not self.finished and self.fd is not None, "BACKUP_CONTEXT_SPENT")
        _check(isinstance(plaintext, bytes) and len(plaintext) <= BUFFER,
               "BACKUP_FRAGMENT_INVALID")
        _check(self.written + len(plaintext) <= HEADER.unpack(self.header)[-1],
               "BACKUP_LENGTH_MISMATCH")
        _write_all(self.fd, self.encryptor.update(plaintext))
        self.written += len(plaintext)

    def finish(self):
        _check(not self.finished and self.fd is not None, "BACKUP_CONTEXT_SPENT")
        _check(self.written == HEADER.unpack(self.header)[-1],
               "BACKUP_LENGTH_MISMATCH")
        self.finished = True
        _write_all(self.fd, self.encryptor.finalize())
        _write_all(self.fd, self.encryptor.tag)
        os.fsync(self.fd)
        os.close(self.fd)
        self.fd = None
        return {"status": "WRITTEN_UNVERIFIED", "bytes": self.written}

    def abandon(self):
        self.finished = True
        if self.fd is not None:
            os.close(self.fd)
            self.fd = None
        # Retain uncertain ciphertext for explicit observation only.


def _read_header(f):
    raw = f.read(HEADER.size)
    _check(len(raw) == HEADER.size, "BACKUP_TRUNCATED")
    magic, version, algorithm, kdf, salt, iv, length = HEADER.unpack(raw)
    _check(magic == MAGIC and version == 2 and algorithm == ALGORITHM and
           kdf == ITERATIONS and length <= MAX_GCM_PLAINTEXT,
           "BACKUP_FORMAT_INVALID")
    _check(os.fstat(f.fileno()).st_size == HEADER.size + length + TAG_BYTES,
           "BACKUP_LENGTH_MISMATCH")
    return raw, salt, iv, length


def _decrypt_chunks(f, password, consumer):
    header, salt, iv, length = _read_header(f)
    f.seek(HEADER.size + length)
    tag = f.read(TAG_BYTES)
    _check(len(tag) == TAG_BYTES, "BACKUP_TRUNCATED")
    dec = Cipher(algorithms.AES(_key(password, salt)),
                 modes.GCM(iv, tag)).decryptor()
    dec.authenticate_additional_data(header)
    f.seek(HEADER.size)
    remaining = length
    try:
        while remaining:
            block = f.read(min(BUFFER, remaining))
            _check(len(block) > 0, "BACKUP_TRUNCATED")
            remaining -= len(block)
            consumer(dec.update(block))
        consumer(dec.finalize())
    except InvalidTag as error:
        raise BackupError("BACKUP_AUTH_FAILED") from error


class _Inventory:
    """Bounded second-pass parser for S02 source-bearing v2 frame grammar.

    No CANONICAL/END accumulation beyond published frame limits. BLOB and DONOR
    contents are hashed incrementally. First-pass AEAD authenticates the entire
    file before any metadata is considered, second pass authenticates again.
    """

    STORES = ("entities", "operations", "events", "meta", "observations")

    def __init__(self):
        self.pending = bytearray()
        self.kind = None
        self.remaining = 0
        self.part = bytearray()
        self.blob_hash = None
        self.blob_id = bytearray()
        self.blobs = set()
        self.refs = set()
        self.canonical = 0
        self.canonical_hashes = []
        self.store_counts = {k: 0 for k in self.STORES}
        self.row_keys = set()
        self.last_row = None
        self.donor = 0
        self.donor_hash = hashlib.sha256()
        self.donor_bytes = 0
        self.phase = 0
        self.done = False
        self.terminal = None

    @staticmethod
    def _json(data, code):
        # Reject duplicate/non-lexical object keys, nonfinite numeric tokens
        # and invalid UTF-8. JS canonicalJSON orders keys by UTF-16 units.
        def ordered(pairs):
            keys=[key for key,_ in pairs]
            sorted_keys=sorted(keys,key=lambda x:x.encode("utf-16-be","surrogatepass"))
            _check(len(set(keys))==len(keys) and keys==sorted_keys,code)
            return dict(pairs)
        def finite(value):
            number=float(value)
            _check(math.isfinite(number),code)
            return number
        def no_constant(_):
            raise BackupError(code)
        try:
            raw=data.decode("utf-8")
            _check(raw and raw==raw.strip(),code)
            return json.loads(raw,object_pairs_hook=ordered,
                              parse_constant=no_constant,parse_float=finite)
        except (ValueError, UnicodeError, TypeError, OverflowError) as error:
            raise BackupError(code) from error

    @staticmethod
    def _paths(obj, depth=0):
        _check(depth <= 40, "BACKUP_CANONICAL_DEPTH")
        if isinstance(obj, list):
            for item in obj:
                yield from _Inventory._paths(item, depth + 1)
        elif isinstance(obj, dict):
            if "__pcmsV2BlobRef" in obj:
                _check(len(obj) == 1 and
                       isinstance(obj["__pcmsV2BlobRef"], str) and
                       len(obj["__pcmsV2BlobRef"]) == 64 and
                       all(c in "0123456789abcdef" for c in obj["__pcmsV2BlobRef"]),
                       "BACKUP_BLOB_REFERENCE_INVALID")
                yield obj["__pcmsV2BlobRef"]
            else:
                for entry in obj.values():
                    yield from _Inventory._paths(entry, depth + 1)

    def feed(self, data):
        view = memoryview(data)
        pos = 0
        while pos < len(view):
            _check(not self.done, "BACKUP_TRAILING_DATA")
            if self.kind is None:
                n = min(FRAME.size - len(self.pending), len(view) - pos)
                self.pending.extend(view[pos:pos+n])
                pos += n
                if len(self.pending) < FRAME.size:
                    continue
                self.kind, self.remaining = FRAME.unpack(self.pending)
                self.pending.clear()
                _check(self.kind in (BLOB, CANONICAL, DONOR, END),
                       "BACKUP_FRAME_INVALID")
                maxima = {BLOB: MAX_BLOB_FRAME, CANONICAL: MAX_CANONICAL_FRAME,
                          DONOR: MAX_DONOR_FRAME, END: MAX_END_FRAME}
                _check(1 <= self.remaining <= maxima[self.kind],
                       {BLOB:"BACKUP_BLOB_INVALID", CANONICAL:"BACKUP_CANONICAL_LIMIT",
                        DONOR:"BACKUP_DONOR_LIMIT",END:"BACKUP_END_LIMIT"}[self.kind])
                _check(self.kind != BLOB or self.remaining >= 32,
                       "BACKUP_BLOB_INVALID")
                _check(self.kind != BLOB or self.phase == 0,
                       "BACKUP_FRAME_ORDER")
                _check(self.kind != CANONICAL or self.phase <= 1,
                       "BACKUP_FRAME_ORDER")
                _check(self.kind != DONOR or self.phase <= 1,
                       "BACKUP_FRAME_ORDER")
                _check(self.kind != END or self.phase == 2,
                       "BACKUP_FRAME_ORDER")
                _check(self.kind != CANONICAL or self.canonical < MAX_RECORDS,
                       "BACKUP_RECORD_LIMIT")
                _check(self.kind != BLOB or len(self.blobs) < MAX_BLOBS,
                       "BACKUP_BLOB_LIMIT")
                if self.kind == BLOB:
                    self.blob_hash = hashlib.sha256()
                    self.blob_id.clear()
                elif self.kind == CANONICAL:
                    self.phase = 1
                elif self.kind == DONOR:
                    self.phase = 2
                self.part.clear()
            n = min(self.remaining, len(view)-pos)
            frag = view[pos:pos+n]
            pos += n
            self.remaining -= n
            if self.kind == BLOB:
                if len(self.blob_id) < 32:
                    m = min(32-len(self.blob_id), len(frag))
                    self.blob_id.extend(frag[:m])
                    frag = frag[m:]
                self.blob_hash.update(frag)
            elif self.kind == DONOR:
                self.donor_hash.update(frag)
                self.donor_bytes += len(frag)
            else:
                _check(len(self.part)+len(frag) <=
                       (MAX_CANONICAL_FRAME if self.kind == CANONICAL else MAX_END_FRAME),
                       "BACKUP_FRAME_MEMORY_LIMIT")
                self.part.extend(frag)
            if self.remaining == 0:
                self._finish_frame()
                self.kind = None

    def _finish_frame(self):
        if self.kind == BLOB:
            ident = self.blob_id.hex()
            _check(ident not in self.blobs and
                   self.blob_hash.digest() == bytes(self.blob_id),
                   "BACKUP_BLOB_INVALID")
            self.blobs.add(ident)
        elif self.kind == DONOR:
            self.donor += 1
            _check(self.donor == 1 and self.donor_bytes > 0,
                   "BACKUP_DONOR_INVALID")
        elif self.kind == CANONICAL:
            row = self._json(self.part, "BACKUP_CANONICAL_INVALID")
            _check(isinstance(row, dict) and set(row) ==
                   {"store","key","value","refs"} and
                   row["store"] in self.STORES and isinstance(row["refs"], list) and
                   len(set(row["refs"])) == len(row["refs"]) and
                   all(isinstance(name, str) and len(name) == 64 and
                       all(c in "0123456789abcdef" for c in name)
                       for name in row["refs"]),
                   "BACKUP_CANONICAL_INVALID")
            found = set(self._paths(row["value"]))
            _check(found == set(row["refs"]), "BACKUP_BLOB_REFERENCE_INVALID")
            self.refs.update(found)
            # Keys are structured-clone serialized identities; never merge
            # another record with the same store/key.
            key = json.dumps(row["key"],sort_keys=True,separators=(",",":"),ensure_ascii=False)
            identifier = (row["store"],key)
            _check(identifier not in self.row_keys, "BACKUP_DUPLICATE_ROW")
            self.row_keys.add(identifier)
            self.canonical += 1
            self.store_counts[row["store"]] += 1
            self.canonical_hashes.append(hashlib.sha256(self.part).hexdigest())
        else:
            _check(self.terminal is None, "BACKUP_DUPLICATE_END")
            self.terminal = self._json(self.part, "BACKUP_END_INVALID")
            self.done = True
            self.phase = 3

    def result(self):
        _check(self.done and self.kind is None and not self.pending,
               "BACKUP_INCOMPLETE")
        inv = self.terminal
        sha = lambda content: hashlib.sha256(content.encode("utf-8")).hexdigest()
        _check(isinstance(inv, dict) and set(inv) ==
               {"schema","canonicalRows","storeCounts","uniqueBlobs","donorSections",
                "sourceRefsSha256","rowDigestsSha256","donorSha256"} and
               inv["schema"] == 2 and inv["canonicalRows"] == self.canonical and
               inv["uniqueBlobs"] == len(self.blobs) and
               inv["donorSections"] == self.donor == 1 and
               inv["storeCounts"] == self.store_counts and
               self.refs == self.blobs and
               inv["sourceRefsSha256"] == sha("\n".join(sorted(self.refs))) and
               inv["rowDigestsSha256"] == sha("\n".join(self.canonical_hashes)) and
               inv["donorSha256"] == self.donor_hash.hexdigest(),
               "BACKUP_INCOMPLETE")
        return {"canonicalRows": self.canonical, "uniqueBlobs": len(self.blobs),
                "sourceRefs": len(self.refs), "donorBytes": self.donor_bytes}


def verify_two_pass(path, password):
    """Reopen real ciphertext, authenticate twice, validate referenced blobs.

    Still needs independent donor decoder, canonical-cut proof, source-path
    materialization, inactive fresh-profile restore and format review.
    """
    try:
        with _fd_read(path) as f:
            before = os.fstat(f.fileno())
            digest = hashlib.sha256()
            for part in iter(lambda: f.read(BUFFER), b""):
                digest.update(part)
            saved = digest.hexdigest()
            f.seek(0)
            _decrypt_chunks(f, password, lambda _: None)
            after = os.fstat(f.fileno())
            _check((before.st_dev, before.st_ino, before.st_size,
                    before.st_mtime_ns, before.st_ctime_ns) ==
                   (after.st_dev, after.st_ino, after.st_size,
                    after.st_mtime_ns, after.st_ctime_ns),
                   "BACKUP_FILE_CHANGED")
        with _fd_read(path) as f:
            second = os.fstat(f.fileno())
            _check((before.st_dev, before.st_ino, before.st_size,
                    before.st_mtime_ns, before.st_ctime_ns) ==
                   (second.st_dev, second.st_ino, second.st_size,
                    second.st_mtime_ns, second.st_ctime_ns),
                   "BACKUP_FILE_CHANGED")
            parser = _Inventory()
            _decrypt_chunks(f, password, parser.feed)
            inventory = parser.result()
            f.seek(0)
            digest = hashlib.sha256()
            for part in iter(lambda: f.read(BUFFER), b""):
                digest.update(part)
            _check(saved == digest.hexdigest(), "BACKUP_FILE_CHANGED")
            return {"status": "AUTHENTICATED_SOURCE_INVENTORY",
                    "sha256": saved, **inventory}
    except OSError as error:
        raise BackupError("BACKUP_DISK_UNAVAILABLE") from error
