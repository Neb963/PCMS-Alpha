"""S02 isolated v2 format/crypto negative cases. D only, NOT live evidence."""
import hashlib
import json
import os
import pathlib
import struct
import sys
import tempfile
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
from backup_stream_v2 import (BackupError, EncryptedWriter, verify_two_pass,
                              frame, BLOB, CANONICAL, DONOR, END, BUFFER, _Inventory,
                              MAX_CANONICAL_FRAME, MAX_END_FRAME)


def make_payload(*, missing=False, duplicate=False, bad_ref=False, donor=True, extra=False):
    data = bytes(range(256)) * 360
    digest = hashlib.sha256(data).digest()
    refs = [hashlib.sha256(b'unknown').hexdigest()] if bad_ref else [digest.hex()]
    row = {"store": "meta", "key": "stage:a", "refs": refs,
           "value": {"candidate": {"blobs": [
               {"path": "src/example.bin",
                "base64": {"__pcmsV2BlobRef": refs[0]}}]}}}
    encoded = json.dumps(row, sort_keys=True, separators=(',', ':')).encode('utf8')
    donor_bytes = b'{"sealedPayload":"test-only-opaque"}'
    ids = set() if missing else {digest.hex()}
    end = {"schema": 2, "canonicalRows": 1,
           "storeCounts": {"entities": 0, "operations": 0, "events": 0,
                           "meta": 1, "observations": 0},
           "uniqueBlobs": 2 if duplicate else len(ids),
           "donorSections": 1 if donor else 0,
           "sourceRefsSha256": hashlib.sha256(
               '\n'.join(sorted(refs)).encode()).hexdigest(),
           "rowDigestsSha256": hashlib.sha256(
               hashlib.sha256(encoded).hexdigest().encode()).hexdigest(),
           "donorSha256": hashlib.sha256(donor_bytes if donor else b'').hexdigest()}
    items = []
    if not missing:
        items.append(frame(BLOB, digest + data))
        if duplicate:
            items.append(frame(BLOB, digest + data))
    items.append(frame(CANONICAL, encoded))
    if donor:
        items.append(frame(DONOR, donor_bytes))
    items.append(frame(END, json.dumps(end, sort_keys=True,
                                      separators=(',', ':')).encode()))
    if extra:
        items.append(frame(CANONICAL, encoded))
    return b''.join(items)


class TestBackupV2(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = os.path.join(self.tmp.name, 'archive.pcms')
        self.passphrase = 'correct recovery secret'

    def tearDown(self):
        self.tmp.cleanup()

    def seal(self, payload, step=BUFFER):
        writer = EncryptedWriter(self.path, self.passphrase, len(payload),
                                 _test_entropy=(bytes(range(16)), bytes(range(12))))
        for i in range(0, len(payload), step):
            writer.append(payload[i:i+step])
        return writer.finish()

    def denied(self, expected):
        with self.assertRaises(BackupError) as err:
            verify_two_pass(self.path, self.passphrase)
        self.assertEqual(str(err.exception), expected)

    def test_review_packet_fixed_crypto_vector_exact_interoperability(self):
        """Pinned review vector generated with an independently checked GCM implementation."""
        payload=bytes.fromhex(
            "5330322d4145532d47434d2d746573742d766563746f722d763100ff01")
        passphrase="S02 isolated vector password"
        expected=("50434d53424b320002010003d090000102030405060708090a0b0c0d0e0f"
                  "000102030405060708090a0b000000000000001d"
                  "c205af95bb20da760ead82265a77822702d401dd93c86757b9b8a6733b4e"
                  "059c45349cb423505b51ac4f497889")
        w=EncryptedWriter(self.path,passphrase,len(payload),
                          _test_entropy=(bytes(range(16)),bytes(range(12))))
        for p in range(0,len(payload),3):
            w.append(payload[p:p+3])
        self.assertEqual(w.finish()["status"],"WRITTEN_UNVERIFIED")
        file_bytes=pathlib.Path(self.path).read_bytes()
        self.assertEqual(file_bytes.hex(),expected)
        self.assertEqual(hashlib.sha256(file_bytes).hexdigest(),
                         "bdee3e26470109bf15263d891fd7d9289746bdd645e614df9bea5cc07a07e94c")

    def test_full_authentication_and_source_inventory(self):
        payload = make_payload()
        result = self.seal(payload, step=127)
        self.assertEqual(result['status'], 'WRITTEN_UNVERIFIED')
        proof = verify_two_pass(self.path, self.passphrase)
        self.assertEqual(proof['status'], 'AUTHENTICATED_SOURCE_INVENTORY')
        self.assertEqual(proof['uniqueBlobs'], 1)
        self.assertEqual(proof['sourceRefs'], 1)
        self.assertEqual(proof['sha256'],
                         hashlib.sha256(pathlib.Path(self.path).read_bytes()).hexdigest())

    def test_chunk_boundaries_do_not_change_ciphertext(self):
        payload = make_payload()
        self.seal(payload, 1)
        encrypted = pathlib.Path(self.path).read_bytes()
        pathlib.Path(self.path).unlink()
        self.seal(payload, BUFFER)
        self.assertEqual(encrypted, pathlib.Path(self.path).read_bytes())

    def test_bad_secret_ciphertext_tag_header_truncate_and_append(self):
        self.seal(make_payload())
        data = pathlib.Path(self.path).read_bytes()
        with self.assertRaisesRegex(BackupError, 'BACKUP_AUTH_FAILED'):
            verify_two_pass(self.path, 'bad-but-long-passphrase')
        for idx, expected in ((0, 'BACKUP_FORMAT_INVALID'),
                              (20, 'BACKUP_AUTH_FAILED'),
                              (len(data)-20, 'BACKUP_AUTH_FAILED'),
                              (len(data)-1, 'BACKUP_AUTH_FAILED')):
            bad = bytearray(data)
            bad[idx] ^= 1
            pathlib.Path(self.path).write_bytes(bad)
            self.denied(expected)
        for bad in (data[:-1], data+b'X', data[:8]):
            pathlib.Path(self.path).write_bytes(bad)
            with self.assertRaises(BackupError):
                verify_two_pass(self.path, self.passphrase)

    def test_missing_duplicate_wrong_blob_and_trailing_frame(self):
        for flags, expected in (({'missing': True}, 'BACKUP_INCOMPLETE'),
                                ({'duplicate': True}, 'BACKUP_BLOB_INVALID'),
                                ({'bad_ref': True}, 'BACKUP_INCOMPLETE'),
                                ({'donor': False}, 'BACKUP_FRAME_ORDER'),
                                ({'extra': True}, 'BACKUP_TRAILING_DATA')):
            self.seal(make_payload(**flags))
            self.denied(expected)
            pathlib.Path(self.path).unlink()

    def test_metadata_frame_limits_are_checked_on_header_before_allocation(self):
        for tag, limit, code in ((CANONICAL, MAX_CANONICAL_FRAME, "BACKUP_CANONICAL_LIMIT"),
                                 (END, MAX_END_FRAME, "BACKUP_END_LIMIT")):
            parser = _Inventory()
            with self.assertRaisesRegex(BackupError, code):
                parser.feed(struct.pack(">BQ", tag, limit + 1))
            self.assertEqual(len(parser.part), 0)
            parser = _Inventory()
            with self.assertRaisesRegex(BackupError, code):
                parser.feed(struct.pack(">BQ", tag, (1 << 64) - 1))
            self.assertEqual(len(parser.part), 0)

    def test_oversized_decrypted_metadata_is_denied_without_materializing_it(self):
        for tag, limit, code in ((CANONICAL, MAX_CANONICAL_FRAME, "BACKUP_CANONICAL_LIMIT"),
                                 (END, MAX_END_FRAME, "BACKUP_END_LIMIT")):
            data = struct.pack(">BQ", tag, limit + 1)
            self.seal(data)
            self.denied(code)
            pathlib.Path(self.path).unlink()

    def test_duplicate_or_noncanonical_json_is_denied_before_accepting_inventory(self):
        samples = [
            b'{"key":"a","refs":[],"store":"meta","value":{},"key":"a"}',
            b'{"store":"meta","key":"a","refs":[],"value":{}}',
            b'{"key":"a","refs":[],"store":"meta","value":{"x":NaN}}',
            b' {"key":"a","refs":[],"store":"meta","value":{}}',
            b'{"key":"a","refs":[],"store":"meta","value":{"b":1,"a":2}}'
        ]
        for raw in samples:
            parser = _Inventory()
            with self.assertRaisesRegex(BackupError,"BACKUP_CANONICAL_INVALID"):
                parser.feed(frame(CANONICAL,raw))
            self.assertEqual(parser.canonical,0)

    def test_r5_cross_runtime_js_lexical_json_admission(self):
        examples=[
            ('{"a":1}',True),('{"a":1.0}',False),('{"a":1e+0}',False),
            ('{"a":1e-7}',True),('{"a":0.000001}',True),
            ('{"a":1e-06}',False),('{"a":1e+21}',True),
            ('{"a":-0}',False),('{"a":9007199254740992}',True),
            ('{"a":9007199254740993}',False),
            ('{"a":-9007199254740992}',True),('{"a":1e309}',False),
            ('{"a":NaN}',False),('{"z":1,"a":2}',False),
            ('{"a":1,"a":2}',False),
            ('{"\\\\ud800":1}',False),
            ('{"\\\\ud83d\\\\ude00":1}',False),
            ('{"😀":1}',True),
            ('{"\\uE000":1,"😀":2}',False),
            ('{"😀":2,"\\uE000":1}',True)]
        for value,expected in examples:
            with self.subTest(value=value):
                try:
                    _Inventory._json(value.encode("utf-8"),"BACKUP_JSON_INVALID")
                    accepted=True
                except BackupError:
                    accepted=False
                self.assertEqual(accepted,expected)

    def test_short_finish_never_completes(self):
        w = EncryptedWriter(self.path, self.passphrase, 100)
        w.append(b'partial')
        with self.assertRaisesRegex(BackupError, 'BACKUP_LENGTH_MISMATCH'):
            w.finish()
        w.abandon()
        with self.assertRaises(BackupError):
            verify_two_pass(self.path, self.passphrase)

    def test_one_use_no_extra_bytes(self):
        w = EncryptedWriter(self.path, self.passphrase, 2)
        w.append(b'ok')
        with self.assertRaisesRegex(BackupError, 'BACKUP_LENGTH_MISMATCH'):
            w.append(b'X')
        w.finish()
        with self.assertRaisesRegex(BackupError, 'BACKUP_CONTEXT_SPENT'):
            w.append(b'a')
        with self.assertRaisesRegex(BackupError, 'BACKUP_CONTEXT_SPENT'):
            w.finish()
        self.assertFalse(os.stat(self.path).st_mode & 0o077)

    def test_symlink_read_and_existing_export_denied(self):
        self.seal(make_payload())
        with self.assertRaises(FileExistsError):
            EncryptedWriter(self.path, self.passphrase, 1)
        link = os.path.join(self.tmp.name, 'symlink')
        os.symlink(self.path, link)
        with self.assertRaises(BackupError):
            verify_two_pass(link, self.passphrase)


if __name__ == '__main__':
    unittest.main()
