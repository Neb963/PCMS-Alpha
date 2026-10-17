# S02 E-06 review packet — candidate A, NOT APPROVED

This is a review handoff for **a non-installed crypto spike**, not product acceptance. It must not be treated as the frozen reviewed v2 wire grammar. The authoritative requirements remain Client v1.0.0 AC-17, Gate B v1.1 §9 (GB-03) and `docs/implementation/SLICES.md`. Production still generates the backward-compatible 64 MiB v1 archive; the new operator read-only source-completeness check is not a recovery receipt.

## Exact candidate implementation

- Native module: `native/backup_stream_v2.py`, Python `cryptography` maintained AES-GCM Cipher update/finalize primitives, PBKDF2-SHA256/250,000. Does **not** supply a browser native messaging endpoint, persisted intent journal, vault ownership, source materializer, donor decoder or activation.
- Header: 8-byte magic `PCMSBK2\\0`; big-endian `>8sBBI16s12sQ`: version 2, AES-256-GCM algorithm ID 1, KDF iterations, 16-byte salt, 12-byte IV, exact plaintext byte count. Entire 50-byte header is GCM AAD. Single 16-byte tag at end. Plaintext length limited by `2^36−32` bytes. The encryption/decryption context processes arbitrary I/O fragments **as one GCM message**, never independently encrypted chunks.
- Prototype plaintext frames: big-endian `>BQ` (type 1 BLOB, 2 CANONICAL, 3 DONOR, 255 END; length then bytes). BLOB data is its raw 32-byte SHA-256 ID followed by the unique raw bytes. CANONICAL is provisional JSON of `{store, key, refs}` (not yet complete value serialization). DONOR is opaque and presently only counted, **not independently decoded**. END is provisional JSON of `{schema:2,canonicalRows,uniqueBlobs,donorSections,sourceRefs}`; sourceRefs must be exact unique set and all referenced IDs must exist.
- Writer opens a new file with exclusive creation, NOFOLLOW and mode 0600, accepts bounded fragments, checks declared length, fsyncs ciphertext and tag, returns `WRITTEN_UNVERIFIED`. A failed/interrupted candidate remains untrusted and cannot resume the cipher context; no automatic rename, replay or cleanup.
- Disk verifier: reopens actual ciphertext, SHA-256 hashes the file, authenticates all ciphertext to a discard sink, reopens the same file identity and decrypts again into a source-inventory parser, then checks the ciphertext digest again. **This does not yet validate donor recovery, reconstruct canonical values, materialize source paths, or restore a Firefox profile** and therefore cannot award E-06 PASS.
- Source preflight: `src/ui/backup-source-closure.mjs` recomputes all present historical adoption/stage/AI/release/existing-update source byte hashes and original/staged fingerprint domains, de-duplicates by digest and rejects omitted required sealed source. A read-only operator action in Settings reports pass or held status without disclosing slugs/source or mutating data.
- Legacy v1 import/export preserved: synthetic I12 historical releases without source bytes can still be **preserved in the v1 archive**, but must fail strict E-06 preflight; v1 UI explicitly says source completeness is not proven. No current v1 file is relabeled v2.

## Reviewer MUST evaluate prior to format promotion

1. Freeze a lossless binary canonical record grammar, blob/reference substitution and arbitrary valid IndexedDB structured-clone types, donor opaque payload/hash completeness, authenticated manifest and schema limits (not yet implemented).
2. Reject duplicate canonical keys, malformed UTF-8, unknown critical tags, zero/integer-overflow/bounds cases, duplicate/omitted/misordered source blobs and frames, incomplete donor, trailing data and ambiguous normalized paths, with tested streaming memory/resource limits. Current prototype does **not** meet all these cases.
3. Confirm correct single-message AES-GCM nonce/salt lifecycle, AAD/header/length checks, 2-pass trust boundary, entropy failure, resource limits, and inability to expose unauthenticated plaintext or replay uncertain append/finish after lost ACK.
4. Ensure host operation authentication, exact combined Gecko ID and key reference, fixed tracked artifact roots, no arbitrary file paths, read-only inspect with zero persistent mutation, protected v1 decoding, cross-process crash/restart and retention of uncertain runs.
5. Independently reproduce native test cases and cross-decrypt the deterministic, test-only fixed salt/IV AES-GCM vector with WebCrypto or another maintained implementation; explicitly reject test IV use for production.
6. Verify incremental real-source reader/dedup, stream buffers, index size, 14 retained successful files, actual fsync/tracked disk readback, full donor decode, complete source dependency closure, and safe inactive fresh-profile restore with one XPI/PersonaMonkey authority.

**Independent review status:** NOT_OBTAINED. No changes to donor original, CI trust roots, private `per-gens`, real browser profiles, protected routes or on-disk privileged host.

## Evidence boundaries

- `tests/i00-s02-source-closure.test.mjs`: D positive, historical, missing source, wrong byte/path, duplicate and v1 boundary checks.
- `tests/i00-s02-native.test.mjs` → `native/tests/test_backup_stream_v2.py`: D actual native module, filesystem reopens and tamper/interruption vectors under disposable CI runner, **not an installed privileged host**.
- `tests/i00-s02-crypto-interoperability.test.mjs`: D cross-library WebCrypto native ciphertext decryption and header/tag negatives.
- `scripts/browser-i00-smoke.py`: B installed packaged Firefox shows read-only recovery hold on incomplete historical fixture while unchanged v1 roundtrip and manual Downloads tier-2 still function (subject to exact candidate CI).
- H full native file/keyring/privileged host and fresh profile recovery: NOT_TESTED. L real provider source and GIT private generator writeback: NOT_AUTHORIZED/NOT_TESTED.

No v2 export is enabled by this PR. An independent format decision and completed host/restore implementation remain necessary **within S02** before its promotion/merge. S03 is not started.
