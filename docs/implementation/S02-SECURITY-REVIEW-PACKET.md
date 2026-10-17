# S02 E-06 independent security review packet — NOT APPROVED

This packet is the controlling handoff for **candidate**, not production format authority. Review [the exact proposed byte grammar](S02-V2-WIRE-FORMAT-REVIEW.md), the actual S02 PR #24 diff, its negative tests and the Client Contract v1.0.0 / Gate B §9 / AC-17 / E-06 oracle. An implementation author cannot self-certify a trust root or qualify E-06.

## Current candidate code and boundaries

- native/backup_stream_v2.py: single-message AES-GCM incremental encryptor/decryptor and two-pass real-file verifier. All original binary blobs and canonical/donor/end frame digests are authenticated; CANONICAL and END lengths checked before allocation. No per-fragment encryption or plaintext temp.
- native/backup_v2_host.py: **unregistered** Gecko-ID-specific fixed-purpose native candidate; existing Secret Service getter, owner-only fixed root, durable CREATE/APPEND/FINISH_POSSIBLE effect states, strict sequence and fragment hashes, no paths/keys/processes from clients, read-only inspect, tracked ciphertext read, authenticated whole-file verification and second-pass inert restore reader. An unknown ACK never authorizes replay. native/local.pcms.backup_v2.json is a template only; do not install.
- src/ui/backup-v2-codec.mjs: source-complete deterministic full raw frame serializer, SHA-256 raw blob dedup, exact source manifest/legacy structured-clone records and encrypted donor envelope; small-volume authenticated v2 decoder checks inventory and reconstructs binary source bytes. No v1 writer/reader behavior is changed.
- src/ui/restore-v2-frame-scanner.mjs + restore-v2-inactive-stage.mjs + restore-v2-stream-decode.mjs: header-bounded independent frame scanner, terminal-receipt-gated persisted IDB fragment staging, full source/row/END/donor inventory check and source rehydration without first allocating all plaintext. The donor envelope and rehydrated canonical rows/source blobs are nevertheless still materialized pending measured fleet memory proof.
- src/ui/restore-v2-prep.mjs: both small-volume and staged-stream source-complete **inactive** v2 preparation using the existing I16 canonical sanitizer, with exact native terminal-receipt/file-hash precondition. It does not apply donor/canonical records, admit a controller or activate provider/route/Git.
- src/ui/backup-source-closure.mjs and Settings: the production read-only audit of historical original/candidate/AI/release source, with a visible held outcome for incomplete legacy v1 history.
- scripts/browser-i00-smoke.py: real installed Firefox exercises the v2 codec and binary/donor reconstruction as well as legacy v1 and source-completeness hold. Does not install privileged native host or perform an H source-heavy restore.

## Independent review tasks

Examine exact wire/header/END grammar, UTF-16 JSON key sorting versus Python, unknown/duplicate/reordered/framing cases, integer overflow and variable-sized record continuation; verify PBKDF2/AES-GCM AAD/nonce/key handling, entropy and IV reuse, one-context-per-run and no plaintext temp. Inspect host Gecko boundary/vault origin/secret handling, symlink/TOCTOU and directory ownership, crashed or lost-ACK durable journal correctness, read-only nonmutation, digest/record/reference validation and effect-retention policy. Confirm donor decrypt/validation and exact raw source/UID/history/exclusion restoration; imported approvals/possible effects must remain historical. Review the OS/Firefox/Secret Service installation and original-profile isolation plan before H.

Deterministic test-only archive bytes and SHA-256 are in S02-V2-WIRE-FORMAT-REVIEW.md. The synthetic 50-account/1,000-history source-heavy disk and WebCrypto restore evidence, same-process native-host concurrency oracle, actual native executable stdio rejection, and persisted Firefox frame-stage readback are catalogued in S02-WIP.md. Existing tests include malformed headers/tag/ciphertext, duplicate metadata, missing referenced blobs, arbitrary transport fragmentation, bad passwords, native session lost ACK, cross-runtime JS->Python->WebCrypto->JS, and read-only source-history holds. No reviewer can infer real-H or L from these fixture proofs.

## Actual outstanding implementation — do NOT call E-06 PASS

1. **Browser/native production admission is not enabled**: no installed privileged v2 host, native extension background journal/lease admission and host-lifecycle B/H proof. Current host candidate is an isolated test/packaging interface; it is not a working operator command.
2. A second browser decoder now scans the persisted inactive IndexedDB fragment stream without an archive-sized plaintext buffer and reuses the existing I16 sanitizer, with D 50/1000 and B packaged Firefox synthetic-receipt evidence. **Still missing:** actual privileged native-port-to-Firefox stream wiring, live file/keyref readback, bounded aggregate blob/canonical/donor memory at worst-case fleet size, full v2 donor and multi-store application under genuine host evidence, and source-heavy UID/removal mapping with independent activation hold. Existing I16 v1 acceptance cannot be relabeled a v2 H proof.
3. Reassembled encrypted donor envelope, unique blob/row collections, 4 MiB per CANONICAL row and 2 GiB donor frame require measured headroom and reviewed continuation where genuine state exceeds those format-prototype limits; do not omit source or arbitrarily cap generator count to make tests pass.
4. Actual independently reopened file, OS keyring/native-port and full source-heavy *fresh-profile* H evidence is NOT_TESTED. Provider/Git live effects are not authorized and not necessary to prove the file parser.
5. Independent qualified format/security approval is NOT_OBTAINED. No approved external reviewer identified; authorship, CI green and automated parser tests do not constitute review.

**Promotion policy:** Keep PR #24 draft, v2 production OFF and original I17 CREATE/RENAME quarantined. Finish remaining S02 implementation and obtain independent review/host evidence before merge, then verify merged main/post-merge CI. S03 is not authorized or started.

## Independent E-06 review candidate: preliminary F1/F2/F3 remediation (October 17)

**Do not interpret preliminary PR #24 issue-comment feedback as security approval.** Findings F1, F2 and F3 were raised by a separate preliminary reviewer; this authoring iteration implemented the following checkable changes on the original draft branch.

| Finding | Production candidate location | Oracle / remaining reviewer task |
| --- | --- | --- |
| F1 — failed begin strands native lock | `native/backup_v2_host.py::_begin`, `EncryptedWriter.__init__` | Actual Python module tests: duplicate run, missing Secret Service password, exclusive open failure, failed partially written header, failed journal update after writer opened, same-process next distinct run, concurrent contexts, retained `CREATE_POSSIBLE` ledger and ciphertext, no replay. Verify that every OS/fdatasync exception path releases the lock and FD without concealing uncertain effects. |
| F2 — ledger and receipt provenance | `src/runtime/backup-auto-export.mjs`, `backup-auto-run.mjs`, `backup-v2-verify.mjs`, `restore-v2-candidate.mjs`, `src/ui/backup-v2-session.mjs`, `native/backup_v2_host.py` | Existing I15 durable scheduled and reviewed-only manual claim, actual PersonaMonkey/cookie/GM/canonical consistent source read, port-bound native `runId`, exact source + donor decode via volatile-sealed staging, native `archive.recovery.complete` exact SHA/qualifier and ledger tier-3 receipt. Review the trusted controller authorization, check failure/revocation between stages and inspect whether all guard/effect ownership proofs hold across cold restarts. |
| F3 — unrealistic homogeneous data | `tests/i00-s02-source-fleet.test.mjs`, installed Firefox `scripts/browser-i00-smoke.py` | Actual source-heavy fixtures with >1,000 distinct revisions, thousands unique binary assets, 50 PersonaMonkey donor identities/cookies/GM script sets, source-history and removal/exit evidence; native encrypted disk independent readback, JS donor/source decode, Firefox IndexedDB temporary-space readings, measured Node/native RSS. Reviewer must set and verify a realistic aggregate fleet budget. |

The source inventory's raw values and the donor envelope have no Perchance/provider/Git/route effects. Existing PersonaMonkey alone owns Persona identity and protected routing. Imported source publication approvals, possible effects and old exit claims are history, never admission. Provider L is NOT authorized/needed for the parser and host-format review. Engineering GitHub PR changes are not `per-gens` mutations.

### Important residual security issues for independent reviewer

1. **Filesystem/TOCTOU:** Root ancestor symlinks are rejected, generated filenames are fixed `s02_<hex>`, opened file identity and full-file hashes are checked across passes, and OS `flock` excludes another running host writer. However `os.open(path)` and path-based `os.unlink(path)` remain susceptible to malicious same-user symlink/rename races across separate directory operations; dirfd/`openat` or a reviewer-approved equivalent and adversarial rename tests are required before privileged registration. No independent implementation author may self-clear this hold.
2. **JSON exactness:** Native strict UTF-8/ordered keys rejects malformed metadata, negative zero is explicitly tagged in the v2-only finite-number domain and native rejects NaN/Infinity. JS additionally compares full raw payload to `canonicalJSON`, but exact cross-runtime numeric lexical/Unicode semantics still need independent format review. A legitimate oversized 4 MiB+ canonical row currently yields a named hold, not a source-complete backup; independently reviewed continuation is needed for fleets that encounter it.
3. **Bounded resource accounting:** Native BLOB and DONOR are length-checked without full DONOR accumulation, and CANONICAL/END are capped before allocation; the browser frame scanner does not materialize the *whole plaintext archive*. However the full unique raw source set, canonical rows and the donor encrypted envelope are eventually collected in the JS restore decoder; no user-visible claim of bounded **total** browser heap usage or true 50+/1,000+ host-load capacity may be made. Memory and temporary IDB disk reports are point measurements, not worst-case guarantees.
4. **Staging confidentiality and crash:** Firefox IndexedDB staging now encrypts every fragment using a nonextractable, transient AES-GCM key; a cold restart loses the key, leaving ciphertext-only unrecoverable staging. No plaintext persistent archive is allowed. The coordinator removes the transient stage on success, but abandoned encrypted stage cleanup/retention during long-running cancellations requires a reviewed policy and cold-restart evidence.
5. **Genuine host/route authority:** A host manifest exists as **UNINSTALLED TEMPLATE ONLY**, and the combined XPI contains unregistered candidate code. The product's protected background I15 candidate is permanently OFF by default until explicit independent approval and narrow privileged-host permission. No operator-native host installation, OS vault/write/readback H, native-port persistent Firefox cold-start test, source-heavy full donor/Persona fresh-profile reactivation hold, or signed E-06 reviewer approval has occurred.
6. **Retention provenance:** The native candidate only counts `RECOVERY_VERIFIED` entries after exact same-port source/donor decoding and fresh disk AEAD reopen. It protects 14 newest successful files and stops after any `DELETE_POSSIBLE` uncertain unlink; `AUTO_NATIVE` tier 3 results are separate from legacy I15 Downloads tier 2. The reviewer must verify no orphaned/falsely qualified archive can cause deletion, and that native per-day history and last-known-good remain valid across 500+ lifecycle events.
7. **Review independence:** No independent E-06 security/cryptography review has signed off on this frozen candidate. Self-run CI green, baseline security smoke, independent preliminary issue comments and cross-library crypto vectors do not constitute the required approval. E-01/E-04/E-08 remain governed by their separate boundaries.

### Required decision and proofs

A genuinely independent qualified reviewer should inspect the exact **current PR head/tree**, `docs/implementation/S02-V2-WIRE-FORMAT-REVIEW.md`, native parser/host, bundled candidate coordinator and all D/B tests. Review outcomes must explicitly mark each issue accepted/changes-requested with line-referenced findings. Only after security signoff and separately authorized **disposable** privileged-host installation can a host-H source-heavy complete recovery test be credited. The host must not be installed against a real operator profile under this authorization, and publication/live provider mutations remain out of scope.

**Current classification:** Safe code review candidate with named residual risks, E-06 INDEPENDENT REVIEW NOT OBTAINED, AC-17 source-complete full product workflow NOT ACCEPTED, PR #24 draft/unmerged, original I17 uncertainty quarantined, S03 not started.

## Independent review #5559457184 — remediation disposition for new candidate

Review source: https://github.com/Neb963/PCMS-Alpha/pull/24#pullrequestreview-5559457184 . The reviewed code at `cf8262d7db3348b968f203bd4cfc3d5367c8f60a` received CHANGES REQUIRED, not approval. The follow-on implementation uses **the same draft PR #24** and existing AES-GCM-A format.

| Finding | Corrective candidate | Exact gate/reviewer concern |
| --- | --- | --- |
| **R1 HIGH** | `createV2Ledger.advance` releases the active marker transactionally only on exact native-qualified terminal SHA and run; `retireUndispatched` preserves history; `reconcileV2QualifiedNative` independently authenticates a native already-completed file after lost ACK. Firefox B drives consecutive qualified sessions and a stale callback. | Confirm native/source complete qualification, exact sequence, lost ACK/restart and real 14-success fleet without marker deadlock |
| **R2 HIGH** | `snapshotCanonicalV2` cursor path bypasses v1 archive-size cap; strict source audits/double cut and native dedup remain. >64 MiB pre-dedup repeated source fixture and varied 50/1024 fleet verify identities. | **Residual:** current JS snapshot and complete decoder are not yet proven constant/strictly bounded total heap; valid >4 MiB canonical record holds without truncation; decide whether continuation/paged spool is required before production |
| **R3 HIGH** | `prepareRestoredCanonical` checks reliable newer destination tombstones and preserves removals/exits, historical orphan generator identity and inactive authority; fresh inclusion choice is explicit. | Verify actual original/fresh-profile mapping, UID/IPv4/IPv6 conflict, destination revalidation and donor inactive import |
| **R4 HIGH** | Native pinned owner-only root fd, dirfd-relative no-follow open, regular/single-link checks, atomic fsync ledgers and identity-fenced quarantine rename prior to unlink; retained ambiguous deletion holds. | **Residual:** no supported OS guarantee against hostile same-UID inode substitutions outside trusted root; privileged installation/root ownership still independently gated |
| **R5 MEDIUM** | Native lexical JSON comparison against IEEE-754 JS tokens; JS enforces Unicode validity and canonical bytes; D vectors exercise integers, exponents, -0, surrogate cases, ordering and malformed inputs. | Cross-runtime corner cases need independent signoff; maintain single crypto protocol |
| **R6 MEDIUM** | Compiler rejects literal reserved discriminator collisions before export; positive typed Date/undefined/binary and negative-zero roundtrip, legacy v1 unchanged. | Ensure no legitimate persisted older source has a reserved key; explicit hold is safe, not lossless acceptance |

**Evidence policy:** D native disposable roots and synthetic browser effect ledgers; B actual persistently installed packaged Firefox with synthetic native responses; H **NOT TESTED** for authorized installed privileged v2 host/vault/cold-restart; GIT limited to implementation PR effects; L provider/private-generator writes **NOT AUTHORIZED/NOT TESTED**. Do not assert S02/E-06 PASS or merge/enable host before genuinely independent approval.

The original I17 batch `batch_e2c328e54f9c4a6ab89f1084134fde52` and slug `pcms-test-esr-chain-20261015-a01` remain under absolute no-auto-CREATE/RENAME quarantine, including restored and migrated profiles. Unknown provider/native effects are not replayed.


## E-06 follow-up: installed native H recovery and production-entrypoint candidate (2026-10-17)

**Independent review status: CHANGES REQUIRED, still not approved.** This
section supersedes earlier statements that *no* disposable v2 host-H test had
ever run, but does not retroactively approve the frozen earlier review HEAD or
the subsequent source changes. Only an independent reviewer can close R1–R6
against the new exact PR HEAD/tree. PR #24 remains DRAFT/UNMERGED.

### Verified host-H precursor and exact scope

The GitHub-hosted ephemeral-runner witness at
[CI run 39071954993](https://github.com/Neb963/PCMS-Alpha/actions/runs/39071954993)
for commit `9809511b012fa09200fef96c248fcf88ce314955` passed its individual
privileged-host step, while its overall required CI run **FAILED** later in a
packaged-Firefox manual-concurrency test. The H step independently observed:

- Pinned Firefox Developer Edition 154.0b10, persistent XPI with actual Gecko
  ID `persona-route-manager@local`, registered
  `local.pcms.backup_v2` and `local.pcms.backup_vault`, an OS child host,
  disposable D-Bus and real Secret Service secret store/read. Everything ran
  beneath a freshly created temporary HOME and disposable profiles; no
  operator Fedora filesystem/profile, provider or production backup was used.
- Two actual authenticated, independently reopened native filesystem backups,
  each with **1,075 canonical rows**; the source-heavy fixture included **50
  synthetic account/Persona records** and **1,024 distinct stage histories**.
  The fresh-profile recovery independently inspected the qualified native
  terminal, authenticated its file again, decoded the real donor package with
  **50 synthetic Personas**, verified **2,048 referenced source manifests**
  and wrote/read back the prepared canonical stores in a separate installed
  Firefox profile under an actual durable I16 restore hold.
- The fresh profile remained `activation=OFF`, controller `INACTIVE`,
  with no inherited browser-native authority, provider effects, source
  publication, route assignment or account rebinding. The donor package was
  independently decrypted/decoded and held **for review**, not applied to
  PersonaMonkey's live donor container/profile controller.

**Evidence classification:** H-CI = genuine installed native messaging +
actual OS Secret Service + actual fixed-root disk readback and fresh-profile
*canonical* recovery with synthetic data. It is **not** operator-Fedora H,
real-persona live-route H, provider L, or full donor-controller application.
The terminal-review plan in the fresh H harness is a disclosed disposable
synthetic plan; it is not independent human review. B = packaged Firefox
application and negative guards with synthetic external receipts. D = native
filesystem and deterministic adversarial tests. Only the exact current
postdocumentation candidate CI can authorize a green required-workflow claim.

### Product wiring, admission and remaining signoff

- The installed I15 protected background port now recognizes
  `RUN_V2_MANUAL`. Both daily and manual paths share the actual source-cut
  and native recovery modules; success requires full native-qualified
  source/donor receipt, exact run/hash and inactivity. An inventory-only
  manual receipt no longer reports a success or retention credit.
- The **production** `reviewedV2` authority remains **false**; the command is
  denied with `BACKUP_V2_REVIEW_REQUIRED` even when an unrelated host is
  installed. CI's injected review authority is construction-only and not a
  user/storage/browser toggle. No auto activation or production installation.
- The v2 fresh-profile module requires a qualified native inspect receipt,
  separate disk authentication, another same-file native second pass, source
  closure, explicit archived-account inclusion choices and a pre-existing
  global I16 hold. Imported backup-native leases and receipts are inert
  historical facts; destination backup/retention provenance is protected.
- Pending E-06 independent closure: prove end-to-end *donor-controller*
  application in the fresh profile (versus decoded inactive donor data);
  review adversarial cross-profile credentials/Persona UID/removals/exit
  exclusions, native concurrency and post-crash installed-host recovery,
  same-UID storage races, large single-row/long-fleet memory limits and
  source-history completeness; verify 14-success retention with held uncertain
  files and final protected-head CI. Genuine Fedora and Perchance evidence
  remain unavailable and are not implied.

**Nonnegotiable holds:** v1 backward compatibility, original I17 unknown
batch `batch_e2c328e54f9c4a6ab89f1084134fde52` and slug
`pcms-test-esr-chain-20261015-a01` no-auto-CREATE/RENAME quarantine, no
private `per-gens` writeback, no provider effects, no production v2 host
activation, no S03 and no merge without new independent E-06 approval.
