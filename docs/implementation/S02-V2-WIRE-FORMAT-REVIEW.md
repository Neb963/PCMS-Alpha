# S02 v2 candidate A — frozen review proposal (NOT APPROVED)

**Authority:** Client v1.0.0 AC-17; Gate B v1.1 GB-03 / E-06. This specifies the byte grammar now emitted by the S02 branch for independent format/security review. It confers no permission to install the native host, modify original profiles or enable v2 backup. Legacy v1 import/export remains unchanged.

## Binary envelope

All numbers are unsigned big-endian. The first 50 bytes are exactly: magic 50 43 4d 53 42 4b 32 00 (PCMSBK2 plus NUL); version 02 (1 byte); algorithm/KDF ID 01 (1 byte); PBKDF2-SHA256 iterations 0003d090 (4 bytes, exactly 250000); OS CSPRNG salt (16 bytes); OS CSPRNG IV (12 bytes); exact plaintext length (8 bytes). The **entire header** is AES-GCM AAD. Follow with exactly that many bytes of ONE AES-256-GCM ciphertext message and a final 16-byte authentication tag, without trailing data. The NIST single-invocation bound is 2^36−32 plaintext bytes. Every new run gets a fresh salt/IV; never reuse an interrupted session's cipher context. No derived key in storage, diagnostics or ciphertext metadata.

## Authenticated plaintext framing

Each frame is 1-byte tag + 8-byte unsigned big-endian length + exactly length bytes. Valid order: BLOB* → CANONICAL* → DONOR → END. Unknown tags, unexpected ordering, trailing bytes and duplicate entries are invalid. Transport fragments may split these frames at arbitrary offsets. They are NOT separately encrypted or authenticated messages.

- **BLOB / tag 01:** 32 raw bytes of SHA-256 digest followed by original raw file bytes. ID equals SHA-256(raw bytes), including binary assets. At most one occurrence per digest; path is retained in the original source manifest rather than invented from a digest. Candidate frame limit 12 MiB + 32 bytes (matching current source-file bound).
- **CANONICAL / tag 02:** canonical sorted-key UTF-8 JSON with exactly store, key, value and refs. Store is one of entities, operations, events, meta, observations. Key and value retain the exact existing PCMS structured-clone taxonomy (including Undefined, Date, ArrayBuffer, typed arrays). Source-bearing records retain complete original/current/previous-good/candidate/history manifests and identifiers, but their original source blob base64 field is replaced by an exact one-key object with property __pcmsV2BlobRef and the lowercase content SHA-256 value. The refs array contains sorted unique source digests referenced by that row. Never infer bytes from merely a fingerprint. Candidate max 4 MiB per deduplicated metadata row; a legitimate larger record requires independently reviewed continuation, not truncation.
- **DONOR / tag 03:** exactly the original encrypted PersonaMonkey portable backup envelope as raw UTF-8 bytes. The native parser authenticates outer GCM and donor byte SHA; the unchanged donor decoder must independently decrypt and validate this inner envelope before restore. Maximum prototype frame 2 GiB; actual donor headroom is not yet measured.
- **END / tag ff:** UTF-8 sorted-key JSON with EXACTLY schema:2, canonicalRows, storeCounts (all five stores), uniqueBlobs, donorSections:1, sourceRefsSha256, rowDigestsSha256, donorSha256. sourceRefsSha256 hashes sorted lowercase referenced digests joined by LF; the referenced set must exactly equal actual BLOB IDs. rowDigestsSha256 hashes lowercase SHA-256 digests of CANONICAL raw frame payloads, in order, joined by LF. donorSha256 hashes exact DONOR bytes. At most 1 MiB END payload.

JSON key ordering follows JavaScript UTF-16 lexical key ordering. The native parser rejects duplicate and out-of-order object keys, invalid UTF-8, nonfinite number tokens, malformed/oversized frames, duplicate row identities, mismatched content digests and terminal inventory. Parser limits are checked from the header BEFORE metadata allocations: up to 100,000 CANONICAL rows and 100,000 unique blobs per candidate. These explicit resource bounds remain subject to real fleet sizing and independent review; none permit omitting evidence. Large numeric JSON canonicalization/interoperability and oversized legitimate single-record continuation remain review findings, not silently accepted constraints.

## Effect, verification and restoration boundary

The fixed-purpose native candidate uses host-selected root, fixed keyRef portable-recovery and the existing Secret Service vault callback; browser-supplied paths, arbitrary commands, native route operations, keys and shell are forbidden. The dedicated Gecko-ID host manifest is committed but NOT installed. A native connection owns a single live cipher context, with an owner-only OS flock across simultaneous host processes that is automatically released on process death (without clearing the uncertain effect journal). The host persists CREATE_POSSIBLE before file creation, APPEND_POSSIBLE before each bounded SHA-256-checked fragment, and FINISH_POSSIBLE before finalization. A lost ACK or process death never permits blind replay. Last-known-good and uncertain ciphertext are not automatically deleted. Read-only inspect never initializes a root, repairs, unlocks or creates an archive.

Verification independently opens the tracked ciphertext, authenticates ALL bytes to discard, then reopens the same file and decrypts again while validating frame/reference/donor-byte inventory and SHA-256 equality. This is authenticated inventory only, NOT restorable-fleet proof. A separate restore.begin repeats verification before allowing a second-pass bounded read stream. restore.read produces AUTHENTICATED_SECOND_PASS only after the final tag and unchanged file identity/digest. Interrupted or replaced files never promote partially staged plaintext.

The JavaScript v2 decoder rehydrates exact source base64 and uses the existing donor decoder. The read-only prepareInactiveV2 invokes existing I16 prepareRestoredCanonical to preserve uncertain operations and mark account identities, owner observations, prior approvals, leases and admission inactive. It does not directly activate provider, routing or Git effects. The original I17 batch and slug remain under no-automatic-CREATE/no-automatic-RENAME quarantine.

**Unresolved implementation:** both the original small-case whole-plaintext decoder and a second terminal-gated IndexedDB fragment decoder are present; the latter scans header-bounded frames and reconstructs source/donor/typed canonical state without buffering the whole plaintext archive. It still materializes all unique referenced blobs/canonical rows and the encrypted donor envelope to use PersonaMonkey's existing decoder. These aggregate allocations, real host installation/port authority, full source-heavy fresh-profile guarded donor/canonical apply, 14-file retention and activation proof have NOT been independently reviewed or host-verified. No v2 production activation or E-06 acceptance is claimed.

## Deterministic test-only interoperable vector

Passphrase: S02 isolated vector password.
Salt: 000102030405060708090a0b0c0d0e0f.
IV: 000102030405060708090a0b.
Plaintext hex: 5330322d4145532d47434d2d746573742d766563746f722d763100ff01.
Full 95-byte encrypted file hex:
50434d53424b320002010003d090000102030405060708090a0b0c0d0e0f000102030405060708090a0b000000000000001dc205af95bb20da760ead82265a77822702d401dd93c86757b9b8a6733b4e059c45349cb423505b51ac4f497889
File SHA-256: bdee3e26470109bf15263d891fd7d9289746bdd645e614df9bea5cc07a07e94c.
This vector must NEVER be used in an operator export.

## Independent E-06 review checklist — REQUIRED

The independent qualified reviewer must examine exact code and vectors for: binary grammar and integer/JSON resource bounds; AES-GCM single-message AAD/nonce/KDF lifecycle; no plaintext temporary file; first/second trust boundary; immutable disk readback and symlink/race defenses; fixed Gecko ID/host/keyring authority; journal and lost-ACK recovery; canonical/source/donor completeness; v1 backwards compatibility; UID/history/removal-aware inactive restore; original I17 quarantine; realistic 50+/1000+ capacity and 14 protected successful archives.

Synthetic CI D and installed Firefox B evidence — including bounded IDB staging and 50/1000 synthetic native disk roundtrip — do not self-certify format security. E-06 H (installed privileged host, OS vault and full source-heavy fresh-profile readback), independent review, fully connected donor+canonical apply and operator-level complete backup/restore remain outstanding. PR #24 must stay draft/unmerged until reviewed gates are met.
