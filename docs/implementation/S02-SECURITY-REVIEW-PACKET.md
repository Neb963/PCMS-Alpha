# S02 E-06 independent security review packet — NOT APPROVED


## 2026-10-18 — incremental pinned-cut writer and installed native H-CI proof (B1 still OPEN)

**Code checkpoint:** `67230ca6b0096326db6f46733b7e893aaea9b597`; [required workflow 39146461306](https://github.com/Neb963/PCMS-Alpha/actions/runs/39146461306) **PASS** (fast D 405/405, zero failed/skipped, baseline, packaged Firefox B, `pcms-required`). The exact same `pcms-alpha-i00.xpi` inner SHA-256 was `0d52c2d02daa48919ab65719be83be67105ea954afa17e29427a29d2db74cc57` in fast packaging, installed Firefox B and installed native-host H-CI; artifact ID `12144065042`. ZIP wrapper hash `99e1627794fd00269b11938b7070fd787ec3abb2e7c725e56d5c62ce837e8aaf` is not the inner XPI.

**New B1-compatible encoder component:** `src/ui/backup-v2-pinned-stream.mjs` implements a distinct metadata-only source export plan over an *externally pinned and replayable* source-cut interface. It retains SHA-256/length/count descriptors and bounded source-blob identity/row indices, not an aggregate source fleet or emitted CANONICAL buffers. The adapter must provide a reliable same-cut count witness, ordered complete row iteration, per-blob on-demand exact bytes and a versioned immutable `assertPinned` implementation. Each source is independently fingerprint-audited, every BLOB is SHA-256 validated before emission, each canonical record is regenerated and SHA-256 matched to its prepared descriptor, and the native writer's existing sequence/run/digest/AAD/retention protections are unchanged. Tests deny missing count evidence, truncated enumeration, missing histories, source drift, changed blob bytes and out-of-order keys. A byte-for-byte D oracle compares the new BLOB* CANONICAL* DONOR END stream with the frozen existing v2 framing; no new tags, GCM scheme or wire changes were introduced.

**Representative high-unique Node D (real generated assets, NOT a preloaded fixture):** 50 synthetic accounts, 1,024 complete historical source records, 2,048 truly distinct binary assets, 4,096 unique source blobs, 8,192 audited source references, **83,931,988 unique bytes**, **167,863,976 bytes referenced before deduplication**, **86,651,023 emitted plaintext bytes**, 14,440 fragments; observed sampled peak heap increase **27,623,672 bytes**, RSS increase **65,069,056 bytes**, 13,537 ms on Node **v22.16.0 Linux x64**. Acceptance assertions on this **encoder-only** synthetic run: peak additional heap below 256 MiB and RSS below 512 MiB, no source counts/bytes omitted. Hardware RAM/CPU/disk and browser IDB quota not measured in this Node trial; the measurements are not lifetime process maxima or a fleet memory guarantee.

**Genuine packaged installed H-CI:** Actual Firefox Developer Edition, registered `local.pcms.backup_v2` host, D-Bus/Secret Service, single-message AES-256-GCM on real filesystem. First source-heavy H archive used `pinnedCut` through the new guarded `exportV2Candidate` transport; second archive used the unchanged aggregate v2 transport. The first cut adapter is deliberately backed by an **already materialized synthetic snapshot**, with same-profile IDB unchanged verification: this tests complete installed streaming-writer/native/readback interoperability **but does NOT prove browser canonical source-cut boundedness or actual immutable source storage**. Both native ciphertexts independently reopened and qualified. The first archive then underwent full inactive third-profile I16/PersonaMonkey donor+cookie+portable+canonical restore: 50 actual new Persona containers, 50 cookie sets, 1,075 canonical rows, 1,024 exact histories, new UID decisions, newer-removal exclusion, operator-plan negatives, no route/session/approval/provider activation. Incomplete native file and wrong real OS vault secret did not promote. Sampled sum of RSS for up to 14 processes **1,471,760 KiB**, double-counting shared pages, not 14 retained archives or a disk-headroom budget.

**B1 not closed:** `captureV2SourceCut` still calls fleet-sized `snapshotCanonicalV2`, and the existing canonical IDB rows contain repeated inline base64 source. No production provider currently supplies the new **atomic immutable** source-cut interface; merely returning `true` from `assertPinned` in a fixture does not establish this property. `compileV2` legacy path is still aggregate. `restore-v2-stream-decode.mjs`, `restore-v2-prep.mjs`, I16 sanitizer/application and PersonaMonkey donor decoding still accumulate full unique source/donor/canonical state. A content-addressed versioned source storage/migration with source-writer CAS and short atomic cut, plus confidential pagewise authenticated recovery with fail-closed inactive cutover, remains mandatory. A legitimate over-4-MiB CANONICAL record, over-1-MiB END, over-2-GiB DONOR or 100k record/blob limit still requires explicit `UNSUPPORTED/HELD` and separately accepted narrow format continuation. No plaintext spill, lossy source omissions, per-chunk *archive* AEAD or unreviewed format promotion is authorized. Disk exhaustion, operator Fedora H, 14 real protected large ciphertext archives, near-bound donor, end-to-end high-U browser RSS/IDB and event-page termination remain unproven at these sizes.

**Finding matrix:** R1–R6 prior limited corrections retained (final changed-path independent review outstanding); B2 durable salt/IV pair fence retained with adversarial test evidence (final independent review outstanding); B1 encoder portion now D + installed H-CI proven for synthetic pinned input, **complete production B1 OPEN**. E-06 remains **CHANGES REQUIRED**, not READY or APPROVED. Production v2 review switch OFF, PR #24 draft/unmerged, no S03, no operator profile/host installation, no Perchance live E-02 L or private `per-gens` changes. Original I17 quarantine unchanged. The final *documentation-inclusive* HEAD and same-run required checks must be read back independently after this addendum.



## 2026-10-18 — B1 incremental allocation reduction, NOT closure

**Code checkpoint:** `ef05ed0596ae2499c5d363bbfc665a0fbcfc63f6`, exact-head [required CI 39141558901](https://github.com/Neb963/PCMS-Alpha/actions/runs/39141558901) **PASS** (fast **399/399**, 0 failed/skipped; baseline, installed Firefox, pcms-required all PASS). Installed B and genuine disposable native-host H-CI passed again with same-run inner XPI SHA-256 `3c1947e9dddcbddc4987ed3b1c4b86643b0518205375240f320a963abade011b`, artifact ID `12141493991`. H-CI still exercises 50 actual PersonaMonkey containers and cookie sets with 1,024 histories/1,075 canonical records, inactive donor+canonical readback. This is **not high-unique bounded-memory H-CI**.

**Changes:** `backup-source-closure.mjs` now accepts an asynchronous metadata/source row iterator, auditing and discarding source buffers individually. `backup-v2-codec.mjs` retains row index/length/digest descriptors instead of all encoded CANONICAL payload buffers and deterministically re-encodes each row during native emission, checking its prepared SHA-256. Regressions prove incremental auditor equivalence, rejection of late source corruption and refusal to emit a changed row after compilation. Existing v2 wire bytes, native encryption, donor adapter, source completeness and v1 API remain unchanged. This removes a redundant encoded-row allocation but **does not** remove the aggregate initial `snapshotCanonicalV2`, blob-index source string references, native preparation's fleet snapshot, or aggregate restore decoder/I16 sanitizer/donor working set.

**Blocking B1 contradiction:** The accepted GB-03 cut requires immutable source state and a consistent donor/PCMS revision boundary. Existing canonical records hold repeated inline base64 source; merely using paginated unversioned reads permits a mixed-generation backup, and whole-fleet rehydration on import shifts peak memory to the restorer. Safe completion requires (i) versioned content-addressed source records with atomic reference/epoch migration and all canonical writers fenced, (ii) bounded two-pass export with byte-exact audited digests and a protected donor cut, (iii) authenticated sealed transient restore staging followed by versioned inactive apply/rollback and donor readback, and (iv) measured high-unique fleet quota, heap/RSS and 14-file headroom. The current branch implements **none of that full integration**. Its 4 MiB CANONICAL / 1 MiB END / 2 GiB DONOR / 100k count bounds continue to reject overlarge legitimate state explicitly; any compatible format continuation requires separate accepted design authority. Neither untested wire changes nor plaintext spooling are authorized.

**Status: PARTIAL / E-06 HELD.** B2 and R1–R6 still require final changed-path independent review. No operator H, live E-02 L, independent E-06 approval, production-v2 admission, merge or S03. Do not re-label this checkpoint READY FOR RE-REVIEW solely from green CI.


## Exact-head integrated D/B/H-CI after B2 implementation — 2026-10-18

The new same-run [required workflow 39138515377](https://github.com/Neb963/PCMS-Alpha/actions/runs/39138515377) verified source/host-code checkpoint `3ccfa0a282116e6d3fab5a5743ef93080ed8a856` and doc-inclusive HEAD `56dcf1317bb7503d0005805a0108c82adc064f82`: **fast 395/395 PASS, baseline PASS, packaged Firefox PASS and pcms-required PASS**. Inner installed XPI SHA-256 `d0dd791ff0e6662d310dc0fc8fbbe53f319bfb03c308dc82d0333286bb7d5d94` is identical in native H-CI, packaged B and fast packaging. The installed native host was **actually registered** in a disposable GitHub runner with D-Bus/Secret Service. On the changed host code, native death, wrong-secret rejection, ciphertext independent disk reopen, 50 PersonaMonkey Persona creations, 50 cookie imports, portable donor and 1,075 canonical records including 1,024 histories passed fresh-profile readback with restored controller **INACTIVE**. These observations supersede the earlier dated statement that current-host H-CI had not been rerun. Peak sampled summed process RSS was 1,460,744 KiB/14 processes, not unique resident memory and not a capacity SLO.

**No approval implied:** even all-green integrated CI with real privileged disposable H-CI does **not** resolve B1's whole-source JS allocations or imply successful high-unique, near-limit donor, filesystem quota and 14 retained archives, or independently authorized E-06 approval. B2 is implemented and exercised in synthetic collision/failure tests, but still needs independent design/security assessment of its journal+nonce-history lifecycle. B1 remains blocking. No operator Fedora H, no live Perchance E-02 L. The changed security-sensitive candidate must be independently reviewed by a different authorized reviewer **after B1 is implemented and verified**, and the exact candidate checks rerun. All earlier reviewed and historical findings remain recorded below; keep draft/unmerged and production v2 OFF.


## October 18 re-review remediation checkpoint — B1 unresolved, B2 candidate pending exact-head proof

The controlling [final review #5563400179](https://github.com/Neb963/PCMS-Alpha/pull/24#pullrequestreview-5563400179) requested B1/B2 remediation. This is a **new implementation-author checkpoint**, never independent E-06 approval. Keep PR #24 draft/unmerged, `reviewedV2` production OFF, original I17 no-auto-CREATE/RENAME quarantine and v1 compatibility.

| Finding | Present engineering classification | Exact evidence / remaining obligation |
|---|---|---|
| R1 | Previous reviewed closure retained | Browser active claim releases only after protected terminal qualification; uncertain effects stay fenced. Must rerun current-candidate regressions. |
| R2 | Prior legacy-cap bypass retained; B1 not solved | Source-complete v2 does not inherit v1's 64 MiB archive cap. Whole-fleet snapshot/transformation still allocates proportional to source volume. |
| R3 | Previous reviewed closure retained | Reliable removal exclusions, explicit fresh inclusion, UID and IPv4/IPv6 exit decisions; no activation of imported identities. |
| R4 | Previous reviewed closure retained | Pinned root dirfd, no-follow/open identity and quarantine unlink; arbitrary malicious same-UID root interference remains an installation threat boundary. |
| R5 | Previous reviewed closure retained | Native/JS exact numeric/Unicode canonical lexical tests; no premature inventory qualification. |
| R6 | Previous reviewed closure retained | V2 reserved-key collisions reject incompatible inputs, v1 stays unchanged. |
| B1 | **BLOCKED** | No bounded-`U` source capture or restoration. No 50+/1,000+ high-unique, large-donor, interrupted and retained-14 measured full path on changed candidate. Implementation and possible approved format-continuation design are required. |
| B2 | Implemented as candidate; **exact-head full proof outstanding** | Owner-only permanent salt/IV reservation under writer lock, existing ledger/header scan, fsync-before-cipher, abandoned/lost-ACK history hold; synthetic injected duplicate after success/restart/abandon/competing writers/corrupt history. No claim of actual CSPRNG collision. |
| E-06 independent authority | **BLOCKED** | A different qualified authorized reviewer must assess final changed security-sensitive HEAD/tree. |
| Operator-H and E-02 L | **BLOCKED** | Historical isolated H-CI proof cannot be used as exact changed-candidate H; no operator Fedora host install or real Perchance L. |

**B2 threat/review questions:** collisions against retained and deleted-artifact reservation evidence; durable fsync/ledger ordering; orphan and partially written header handling; lock and dirfd confinement; owner-only registry permissions; permanently growing reservation inventory/corruption response. No browser-selected nonce, host path, key reference or command was added. Fail-closed unresolved history deliberately prevents fresh encryption when old pair evidence is ambiguous. Retention never deletes the reservation.

**B1 architecture/security requirements:** immutable source cut, all original/current/previous-good/candidate/unresolved-effect source and binary data, same actual donor adapters, bounded export/import heap and IDB quota, one intact single-message AES-GCM, no plaintext disk spill, atomic held recovery and independently compared post-write bytes. Existing format limits remain **explicit unsupported holds** and need a narrow authorized continuation proposal for legitimate excess, not silent policy relaxation. Historic 170 MB fixture was a repeated-source sample, not a high-unique bound; changed synthetic measurement in run 39138094974 is not a controlled before/after benchmark.

Prior H-CI contained actual registered host/Secret Service and fresh-profile donor+cookies+canonical readback, but the host bytes changed afterwards. Keep historical proof as history, not proof of this exact candidate. Do not treat a successful fast check, a synthetic native receipt or an implementation-author report as E-06 approval.


## S02 native-v2 complete donor application — superseding E-06 engineering evidence (2026-10-18)

**Verified code checkpoint:** `b2eb1357e6125e13a960f64fea3c274a948c9c69`;
[required CI run 39133529860](https://github.com/Neb963/PCMS-Alpha/actions/runs/39133529860):
fast PASS; baseline PASS; installed Firefox PASS; pcms-required PASS.
Packaged XPI SHA-256 `2256f216613060144eda5e594796be4aa9e6271f28016bb11ff373cd8ed212b5`.
**This section supersedes the earlier dated assertion below that a native-v2-file
to actual PersonaMonkey donor/cookie application had not been demonstrated.**
Those older records are retained as historical development/review evidence.

The now **demonstrated full H-CI chain** is: real registered Firefox v2
native-messaging host and actual OS Secret Service -> two actual filesystem
encrypted source/donor archives independently reopened -> a **third newly
installed Firefox Developer Edition profile** with no copied origin native
ledger -> native `archive.inspect` + separate authenticated disk verification
and full second-pass source/donor decoding -> exact operator-review-hash and
durable I16 restore-hold checks -> existing donor-controlled Persona creation,
state-manager preview/commit, Firefox cookie importer, portable state, atomic
canonical IndexedDB write and independent post-write reads. All four
`donor-personas`, `donor-cookies`, `donor-portable` and `pcms-canonical`
receipt groups were independently **OBSERVED**. The installed witness verified
**50 actual created Firefox Persona containers, 50 separate cookie sets,
1,075 canonical rows, 1,024 source histories and exact retained source bytes**.
The source-to-destination Persona UID mapping generated fresh destination
identities rather than inheriting source UID authority. An imported active
account was `VERIFICATION_PENDING` with identity cleared; a newer locally
removed account was excluded and its tombstone survived. The terminal was
`COMPLETE_INACTIVE`, guard held, activation `OFF`; no restored account,
route, session, publisher, approval or provider effect was authorized.

Negative controls in that **same genuine installed-host** witness denied
`APPLY_V2` without its durable hold and denied a wrong reviewed plan without
creating donor effects. An incomplete native file never promoted after port
termination; a substituted actual OS Secret Service key failed
`BACKUP_AUTH_FAILED` and correct-key reopen subsequently succeeded.
The combined browser+Python process sampling observed peak summed RSS of
**1,486,684 KiB** across up to 14 processes (double-counts shared pages,
not a unique-memory measurement or fleet guarantee). This is H-CI synthetic
data evidence, not actual operator Fedora or live Perchance/provider L.

**Production/review boundaries remain unchanged:** `reviewedV2` remains
OFF in production; no operator system/Firefox installation, real credential,
remote Perchance effect, Mullvad change, private `per-gens` writeback,
automatic restored-controller activation, merge or S03. V1 archive support
and the original I17 quarantine remain intact. The independent E-06
security/format approval remains **CHANGES REQUIRED** pending final
independent review of the exact current HEAD/tree, remaining R1–R6 risk
interpretation, memory/capacity limits, collision/adversarial coverage and
production admission policy. A complete working CI path does not replace
independent signoff or operator-native H evidence.


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


### E-06 exact-candidate test update — October 18, 2026

**Latest code checkpoint independently verifiable in GitHub:** commit
`1e8b6993bb6c54c5fe2eaf11748a8ce40f777c52`, tree
`8f817a510adcefee141445e3dfb77af332e7319f`,
[required CI 39126836197](https://github.com/Neb963/PCMS-Alpha/actions/runs/39126836197):
`fast` PASS, `baseline` PASS, installed `firefox` PASS,
`pcms-required` PASS. This is the verified *code-before-review-packet-update*
checkpoint; the PR HEAD/tree must be rechecked after this documentation
commit and all exact-candidate checks must still pass.

The disposable, real native-messaging H witness used the actual extension ID
`persona-route-manager@local`, the `local.pcms.backup_v2` host in a
registered Firefox Developer Edition profile, a real D-Bus Secret Service
keyring and the isolated fixed-purpose OS backup directory. It authenticated
and independently reopened two ciphertext files containing 50 synthetic
Personas, 1,024 complete history records, 2,048 source manifests and
1,075 canonical rows per native archive. In a genuinely distinct Firefox
profile, decoded donor records and guarded canonical restoration preserved
all source files while keeping the controller inactive. It additionally
verified that an active account UID is remapped into
`VERIFICATION_PENDING` without an imported identity, a newer reliable
destination removal excludes its historical archived account, and the
local removal tombstone survives replace.

**Real failure-boundary evidence in the same H run:** explicitly closing
the native process port after a durable `export.begin` left the incomplete
file unqualified and excluded from native retention; replacing the actual
Secret Service key caused `BACKUP_AUTH_FAILED`, left the good native
archive at `RECOVERY_VERIFIED`, and recovery with the restored correct
key succeeded. These are genuine OS host / keyring tests, not JS mock claims.
The 50/1024 workload showed a maximum sampled process RSS sum of
**1,444,396 KiB** across up to 14 observed processes (process RSS
double-counts shared pages; not PSS, VRAM or a 50+ fleet guarantee).
The packaged XPI digest was
`5675cdfd281b4fe9778ad1f0530e3a15da70b7236d6c44ec7e6f386336fc92fd`.

A deliberately malformed synthetic historical approval with no mandatory
release/source closure was rejected as `BACKUP_SOURCE_INCOMPLETE_RELEASE`
in run [39126672939](https://github.com/Neb963/PCMS-Alpha/actions/runs/39126672939).
The valid source fixture was restored; **the source validator was not relaxed**.
Separate established I16 B and R3/R5/R6 regression evidence covers approval
quarantine, source completeness, historical exclusions and numeric/clone
negative cases. Do not interpret the rejected fixture as a valid approval
import.

**Open acceptance boundary (do not misstate as PASS):** the fresh v2 H
witness decrypts/decodes the actual donor archive and restores the canonical
IndexedDB under I16 hold, but does not commit the decoded donor data through
PersonaMonkey's real donor-state/cookie importer in that fresh v2 session.
The older I16 B flow exercises actual guarded donor application independently,
not as a connected v2 host-to-donor pass. Also incomplete: independent formal
E-06 R1–R6 re-review of the new head/format, operator Fedora H, live Perchance
L (not authorized), stronger crash/concurrent-writer/terminal uncertainty H
beyond tested cases, and a supportable all-workload capacity ceiling. These
must remain visible to the final independent reviewer; **no production
activation, publication, network routes, private per-gens effects, merge or S03**.
The I17 quarantine remains unchanged.

**Verdict:** exact code test workflow PASS at the cited checkpoint;
**S02 FINAL ACCEPTANCE / E-06 SECURITY SIGNOFF: NOT GRANTED**.
