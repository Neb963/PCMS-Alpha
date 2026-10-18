# S02 implementation and verification ledger — PARTIAL / E-06 HOLD

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


## Frozen authority and repository history

S02 continues on the original draft PR #24, branch `slice/S02-source-recovery-v2`, based on verified S01 squash merge `5fc070a1136b076d957581fd890d5b49f6ccda37`. The accepted Client Contract v1.0.0, AC/T/E matrix, Gate B v1.1 and `docs/implementation/SLICES.md` control implementation. PR #20 and original I17 uncertainty `batch_e2c328e54f9c4a6ab89f1084134fde52` / `pcms-test-esr-chain-20261015-a01` remain quarantined against automated CREATE/RENAME. This branch makes no protected-route, provider, private per-gens, original-profile or privileged native-host installation effect.

## Accepted operator journey

Export a complete source-bearing encrypted canonical+donor archive from an eligible controlled profile, independently open/authenticate/decrypt the exact ciphertext from disk, verify every source/asset/candidate/history dependency, and restore into a fresh profile with mapping/owner/route/exclusion and uncertain-effect holds; controller remains inactive pending verified activation. The v1 historical archive cannot be claimed as fully source-complete without its missing original bytes.

## S02 implementation facts (candidate branch, not merged)

- `src/ui/backup-source-closure.mjs`: read-only manifest and byte SHA audit for original, staged, historical, AI and release source; rejects incomplete material. Operators can request this without provider/Git/route effects. Legacy v1 export/decode is retained and explicitly not promoted to E-06 source-complete proof.
- `src/ui/backup-v2-codec.mjs`: deterministic source/donor/canonical framing with structured-clone taxonomy and digest-keyed binary blob dedup; exact donor encrypted envelope; full inventory validator/reconstructor for small authenticated test plaintext. Positive and mutation negatives run against its actual code.
- `native/backup_stream_v2.py`: one maintained-library incremental AES-256-GCM context with PBKDF2, authenticated binary header, bounded CANONICAL (4 MiB) / END (1 MiB) metadata before allocation, bounded BLOB/DONOR frames, duplicate/missing reference rejection, first-pass decrypt-to-discard and independent real disk second-pass authenticated inventory. A crypto/disk receipt is not full backup or restore acceptance.
- `native/backup_v2_host.py`: fixed-purpose, **uninstalled** separate native host proposal bound to exact extension ID in uninstalled manifest; existing vault secret lookup; tracked host-owned encrypted files; durable `CREATE_POSSIBLE`, `APPEND_POSSIBLE`, `FINISH_POSSIBLE`, read-only inspection and exact sequence/sha checked chunks; interrupted/ambiguous effects never retried. Fixed-root ancestor symlinks are rejected before mkdir; remaining TOCTOU/race risks are in reviewer checklist. Restore reader repeats full-file verification then emits bounded inactive fragments and only awards terminal authenticated completion after a second full pass.
- `src/ui/backup-v2-session.mjs`: guarded browser-side canonical intent and fixed native transport, tested in packaged Firefox with an independent **synthetic** native-effect ledger; not registered in production. Active incomplete attempts remain fenced across restart.
- `src/ui/restore-v2-inactive-stage.mjs`: standalone IndexedDB second-pass chunk staging. Rejects partial/preterminal visibility, revoked guard, wrong sequences or hashes; survives DB close/reopen. This does not itself decode/apply a fleet-scale archive or confer activation.
- `src/ui/restore-v2-prep.mjs`: requires exact terminal receipt and rehydrated bytes, decrypts donor through existing decoder, verifies source and uses existing I16 `prepareRestoredCanonical` to preserve uncertain operations and deny restored approval authority. The existing I16 guarded canonical write mechanism is reusable. The native v2 host is not installed or attached to full production restore UI.
- `docs/implementation/S02-V2-WIRE-FORMAT-REVIEW.md`: exact **review candidate** grammar, deterministic test-only AES-GCM vector and explicit limits. `docs/implementation/S02-SECURITY-REVIEW-PACKET.md` enumerates unresolved independent review and H proof.

## Verified evidence and honest distinctions

- Baseline exact-head candidate `9a426b1637e22612b982aefec72cba19b114b966`: CI [39042831544](https://github.com/Neb963/PCMS-Alpha/actions/runs/39042831544) **PASS** baseline, fast 367/367, packaged Firefox and required aggregator. Tested installed fully enabled XPI SHA-256 `86dcd6dc19cbee308f00037e491539ccc1a6e73a4204a942ccb64dd5d5835a82`. V2 source codec/donor, manual legacy backup, held source audit, browser IDB append fence, inactive staged-fragment evidence, v1 I16 fresh profile pass. A later S02-specific v2 fresh-profile canonical-write test passed on candidate `aaa142bb`; see the continuation checkpoint for its exact D/B scope.
- D: Native 11 AES-GCM/parser/format vectors and 8 native fixed-purpose host tests via required fast test wrappers, WebCrypto independent GCM interoperability, small source-containing cross-runtime native disk reopen, failure injections, prior stage tests. D's disposable native disk files are **not** installed privileged host H.
- B: Actual installed persistent Firefox packaged XPI, canonical durable operations, source audit and staged fragments. Synthetic native service used for browser journal test; not a native-host proof.
- H: Previous S01-owned disposable Firefox process exit/relaunch remains valid for its narrow ownership assertion. **No actual privileged v2 host installed with Secret Service**; no independently decrypted source-heavy actual host backup and full fresh-profile v2 donor/PCMS recovery acceptance.
- GIT: Ordinary engineering branch commits, PR and remote readback; **no** runtime private generator-repository mutations.
- L: No live provider writes authorized/tested; none are needed for crypto/protocol deterministic tests.

## Continuation checkpoint — additional safe evidence (2026-10-17)

The implementation proceeds on the SAME PR #24. The first independently checked continuation candidate is `aaa142bb0d67bd940022e7dd2ba06946434fbc71`, exact [CI 39046557019](https://github.com/Neb963/PCMS-Alpha/actions/runs/39046557019). Fast lane **374/374 PASS, zero skipped**, packaged persistently installed Firefox **PASS**. XPI SHA-256 `0a25d3431f52d2e056600a983518f5ea9f5c32ba015ac98ead17ae602b8f643e`. These results are D/B, not installed native host H or E-06 review.

New implementation/evidence since the earlier baseline:

- Cross-port *native export serialization* now uses a nonblocking OS `flock` against an owner-only fixed-root lock file. A second context cannot begin a competing export before the first closes, and the lock is released by process death. An uncertain original ciphertext/ledger is retained rather than retried.
- `src/ui/restore-v2-frame-scanner.mjs` rejects unbounded frame lengths from their 64-bit headers BEFORE allocating, scans arbitrary split boundaries and emits encrypted-donor plaintext fragments incrementally. `restore-v2-inactive-stage.mjs` makes this available only after held-terminal IndexedDB staging.
- `src/ui/restore-v2-stream-decode.mjs` reconstitutes complete typed canonical rows and original/history source bytes from staged frames, validates unique source and row identities, END inventory, donor byte hash, donor's own encrypted envelope and source closure. `prepareInactiveV2FromStage` then reuses existing I16 sanitization for UID rebinding and permission/approval/effect holds. Unlike the small-volume decoder, the scanner does not first allocate the **entire plaintext archive**.
- The format remains a **review candidate** rather than a fixed approved interop standard. The staged decoder still materializes referenced unique blobs/canonical records and reconstructs the opaque encrypted donor envelope in memory for its existing donor decoder. Its real fleet memory/IDB transaction behavior, giant legitimate single-record handling and separately reviewed numeric JSON canonicalization are NOT fully resolved.
- D source-heavy trial uses **50 synthetic accounts + 1,000 source-bearing historical records** (1,050 canonical rows), 3 exact deduplicated binary/text blobs, 2,113 bounded producer fragments and 1,937,052 source-bearing plaintext bytes. The actual native GCM writer persisted ciphertext; independent two-pass disk verifier returned `AUTHENTICATED_SOURCE_INVENTORY`; WebCrypto cross-decrypted and the bounded frame decoder rehydrated **all 1,050 rows**, including the last historical original asset and donor envelope. Measured point sample: ~1,911 ms, ~14.7 MB Node heap delta on runner; NOT a real 50-account authenticated-host performance guarantee.
- D actual `python3 native/backup_v2_host.py` stdio framing test verifies rejected path injection, read-only inspect without creating a home root, and no secret exposure. Native tests cover concurrent contexts, torn/lost ACK and fixed filesystem roots.
- B installed complete XPI: existing legacy-v1 export/restore remains intact; v2 read-only history hold, canonical source+donor frame decode, background-independent synthetic effect ledger, durable inactive IDB staged fragments, stage frame inspection, full staged source/donor preparation and guarded disposable fresh-profile inactive canonical source restore pass. Native host remains **unregistered**. The B source receipt is deliberately synthetic — not H or L.

Negative boundaries still enforced: a wrong passphrase or donor digest, missing source/asset, duplicated key/blob, malformed/unbounded canonical or END frame, revoked staging guard, stale sequence, partial terminal ACK, substituted file, conflicting Persona UID and old publication consent must HOLD. No reactivation, external provider write, private `per-gens` change, original profile migration or original I17 retry occurred.

## October 17 preliminary-review remediation — F1/F2/F3 and safe integration candidate

PR #24's existing independent **preliminary** issue comment (not E-06 format approval) identified F1 lock release, F2 coordinator/native receipt provenance, and F3 fleet-source diversity. The same branch addresses these findings; this ledger preserves residual authority holds, not an acceptance claim.

**F1 — unsuccessful begin and interrupted host:** `native/backup_v2_host.py` now unwinds every unsuccessful begin, including duplicate-run, unavailable OS vault, exclusive-file open failure, partial header write after exclusive creation, and loss of durable OPEN_OBSERVED ledger write *after* opening a cipher. All such attempts abandon the cipher context, release the OS `flock` synchronously in the same native connection and retain their existing `CREATE_POSSIBLE` ledger and all possibly written ciphertext. Native tests cover subsequent distinct-run success in the same process, competing-process writer exclusion, retained forensic bytes, FD closure, append lost ACK, second-pass reader interruption and no blind retry. Crashed contexts release only the OS lock, not uncertain history.

**F2 — production-path candidate without premature authority:** the **existing I15** native-vault/daily-store/source-consistency APIs now supply strict `captureV2SourceCut` (donor state/personas, GM values, scripts, cookies, canonical bytes, source/history preflight), a reviewed-only branch in `createAutoRunner` (default `reviewedV2=()=>false`), and a reviewed-only manual method on the same runner. Both use the existing verified donor adapters, canonical repository and native streaming ledger, not a second scheduler. The candidate never promotes `AUTHENTICATED_INVENTORY_ONLY` to complete or to a last-success day. Its run stays `HELD_UNCERTAIN` until complete recovery and independent approval, and a possible native attempt is never redispatched.

Native `archive.recovery.complete` now requires the **same live native port** to have completed exact-run authenticated second-pass disk reading, plus browser-provided prepared source/donor digest, and re-authenticates the same recorded ciphertext a third time before writing `RECOVERY_VERIFIED`. The protected `restore-v2-candidate.mjs` requires the real durable v2 ledger, matching run/cut/plaintext count/ciphertext SHA, the **outside-replaceable-IDB I16 global restore hold**, exact native run-bound `restore.begin/read` ACKs and terminal, a key obtained only from the existing I15 OS-vault native boundary, full typed canonical/source/donor decode and I16 inactive sanitizer. It never activates PersonaMonkey, user sessions, routes, Perchance or Git. The candidate coordinator is copied into the combined XPI but is **not registered as a production command**.

Browser staged source/donor bytes now persist only as **AES-256-GCM ciphertext** protected by a *nonextractable volatile per-run key*; no source/donor/plaintext chunk is left in IndexedDB. A browser/native-port restart loses the transient key, deliberately holding partial stage for review rather than replaying or reading it. Successful native-qualified staging deletes its temporary encrypted chunks/key. No long-term stage key is serialized. Qualifying a file for retention is not the same as proving fresh-profile import/activation safety.

**14-successful-file retention:** existing I15 browser Downloads tier-2 retention stays unchanged for legacy v1. The unregistered native candidate adds a fixed-root, externally journaled retention policy for **v2 recovery-qualified** ciphertext only: default 14, last-known-good protection, positive file ownership/presence checks, root exclusive `flock`, exact independent file SHA/GCM readback before unlink, durable `DELETE_POSSIBLE` before the unlink, and no blind retry after a lost deletion ACK. No ambiguous missing/moved/symlinked/colliding `RECOVERY_VERIFIED` file may authorize deletion. Native disposable-test file effects are **D only**; not installed on an operator machine.

**F3 — realistic source diversity:** in addition to the prior homogeneous 50/1000 regression, the revised D fleet fixture has **50 archived accounts, 1,024 distinct source revisions/historical records, 3,332 distinct raw byte blobs, full previous/current manifests, binary assets, 50 portable donor Personas, 50 actual encrypted Persona cookie sets, 50 portable userscripts and GM data**. Sample checked-in D evidence from fast CI before the final candidate: 1,074 canonical rows, 422,705 encrypted donor bytes, 5,009,728 plaintext bytes, 5,009,794 encrypted disk bytes, native peak RSS 39,896 KiB, Node heap delta 18,245,584 bytes, Node RSS delta 72,290,304 bytes, ~4,821ms. This is an observation from synthetic/disposable resources, not a host SLO or peak-allocation proof. Browser B fixture separately now creates 50 accounts and 1,024 diverse stage revisions, counts distinct raw asset SHA IDs, records temporary IndexedDB usage and staged readback. Do not call B PASS until exact-head run confirms it. Valid canonical data larger than the 4 MiB single-record prototype frame is explicitly held **without truncation** and needs an independently reviewed continuation design if encountered by the real fleet.

**Numeric/clone grammar:** v2 preserves finite IEEE-754 `-0` using a v2-only `__pcmsType:NumberNegativeZero` tagged value (unchanged legacy-v1 encoder). The shared decoder rehydrates `-0`; invalid NaN/+/-Infinity are rejected. JSON property sorting follows JavaScript UTF-16 code-unit ordering; Python requires ordered, unique strict UTF-8 keys and rejects nonfinite tokens. Complete exact numeric token canonicalization across languages, valid 4MiB+ continuation, file-root `openat`/TOCTOU elimination and full removal/exclusion/admission proof remain independent reviewer questions.

**Evidence tiers:** D = actual native modules/disposable filesystem, including tested successful and failed effects; B = actual packaged Firefox installed profile, with synthetic native receipts and disposable Firefox IndexedDB; H = privileged host/OS keyring and independently observed source-heavy recovered fresh profile **NOT TESTED**, L = real provider **NOT AUTHORIZED**, GIT = implementation branch/PR only. Review note is **PRELIMINARY FEEDBACK, NOT AN APPROVING E-06 SECURITY REVIEW**. Original I17 batch/slug retain their no-auto-CREATE/RENAME quarantine.

## Mandatory remaining work and promotion holds

1. **Format/security independent qualified reviewer:** must inspect exact envelope/grammar, parser bounds, IV/key/session lifecycle, file roots/symlinks, fixed extension/vault authority, uncertain ACK/cold restart, multi-pass plaintext trust, source/donor and v1 dispatch. Review is not obtained and may require code changes; no self-approval.
2. **Full product path:** v2 is not registered/activated; connect protected background coordinator to admitted source-cut/export/scheduled/manual backup, host and exact recovery receipts. Final state must be genuinely restorable, not only `AUTHENTICATED_SOURCE_INVENTORY`.
3. **Scale and complete restore:** current compiler uses full canonical/donor snapshot and the small-case decode uses whole plaintext. Browser chunk staging is bounded, but incremental fleet-scale canonical/donor interpretation and guarded multi-store inactive application, real account/Persona UID and removal-exclusion proof, all retained assets/lineage and a realistic 50+/1,000+ workload/memory/disk budget are not fully established. Do not omit history/source or introduce an unsupported capacity cap.
4. **H proof:** separately authorized isolated privileged native-host registration, OS-backed vault, independent on-disk reopened full source-heavy recovery and cold-restart/lost-ACK, plus actual fresh-profile inactive restore and reactivation hold. No original profile migration or live Perchance effect is prerequisite to doing the remaining synthetic/isolated work.
5. Review remaining ledger/concurrency/retention impacts. Keep last known-good among 14 successful automatic files; current prototype `AUTHENTICATED_INVENTORY_ONLY` is deliberately not a retention success and does not release the active fenced run.

**Completion classification:** S02 **PARTIAL**. Important safe D/B components are implemented; AC-17/E-02/E-06 complete source-heavy product acceptance is **NOT VERIFIED**. Keep PR #24 DRAFT/UNMERGED; do not begin S03. The precise next gate is independently approved E-06 review of the frozen candidate plus full installed/native/fresh-profile recovery evidence after missing production wiring is completed.

## Post-independent-review implementation checkpoint — R1–R6 (2026-10-17)

The independent `COMMENTED` review `5559457184` evaluated `cf8262d7d…` and required six fixes. This new branch-only candidate does **not** self-approve E-06.

- **R1** browser exact-run fenced terminal release, prepared-only explicit retirement, independently disk-authenticated lost-ACK terminal reconciliation. Existing I15 daily runner remains sole admission/scheduler. Native `RECOVERY_VERIFIED` source/donor receipt history and qualified 14-file pool remain durable.
- **R2** replace the legacy whole-archive 64 MiB validation at the v2 cut with a single-transaction cursor reader, all five stores, second unchanged-source check and preflight SHA/manifest closure. Synthetic >64 MiB pre-dedup repeated source fixture extends heterogeneous 50+/1,000+ fleet. **Not yet established:** strict bounded total JS heap for arbitrarily large fleets and a reviewed over-4 MiB row continuation. Unsupported inputs remain held.
- **R3** newer reliable destination account removals actually exclude archived accounts in merge and replace. Preserve orphan inventory as held historical evidence; fresh-profile inclusion is an explicit choice, and exit ownership/duplicate UID conflict causes HOLD. No imported activation or publication approval.
- **R4** pinned trusted root fd, nofollow dirfd-relative file/ledger operations, device+inode identity, quarantine move and uncertain deletion fencing; disposable native failure injection. Full hostile same-UID race guarantee and installed host H remain blocked.
- **R5** Python strict lexical finite IEEE-754/UTF-16 JSON matching JavaScript canonical decoder; rejection vectors for 1.0/exponent/large integer/surrogates. Published AES-GCM envelope unchanged.
- **R6** raw source clone reserved-key rejection; true Date/undefined/binary/-0 serialization restoration. Previously pre-serialized synthetic fixtures corrected rather than weakening collision protection.
- **Compatibility** I16 inactive-restore plan hashes durable Persona state/containers, not live/native status probes; real changed durable authority still invalidates reviewed plans. v1 archive compatibility and donor signed originals remain unchanged.
- **CI discipline** earlier first corrective branch runs diagnosed actual failed Native FD/quarantine tests, corrected with accurate identity/fd oracles, then diagnosed installed-Firefox I16 plan drift. All changes are coherent commits on **existing** PR #24; no protected CI strategy, developer hosts, real provider or production profile changed.

Exact up-to-date Git SHA/tree, XPI digest, final CI/Firefox outcome and pending re-review must be pinned on PR #24 after the final run and GitHub readback; this ledger makes no unsupported claim about still-pending checks. Status is **PARTIAL / NOT PROMOTED**. A different authorized independent reviewer must re-review the final code/format; privileged host testing separately requires narrow installation authority. Do not start S03.


## S02 E-06 continuation ledger — installed native, measured evidence (2026-10-17)

**Gate:** PARTIAL / independent E-06 still CHANGES REQUIRED. No merge, no
production activation, no S03. These are *separately tiered* evidence records;
do not convert a successful H step within a failed parent run into full CI PASS.

**Re-established starting point:** PR #24 draft, main
`5fc070a1136b076d957581fd890d5b49f6ccda37`, E-06 reviewed
`cf8262d7db3348b968f203bd4cfc3d5367c8f60a` followed by corrective
R1–R6 commits, source v2 native host and restored-canonical improvements.

**Observed actual completed evidence:**

| Tier / run | Actual observations | Limit |
| --- | --- | --- |
| D; fast tests on post-R1–R6 candidates | Diverse **50/1,024** source workload: **3,332** unique blobs, **5,009,728** plaintext bytes, **5,009,794** encrypted disk bytes, native high-water **42,512 KiB RSS**, Node process RSS delta **67,743,744 bytes**, approximately **5,699 ms**. | Node/native sampled separately, not simultaneous total or operator fleet guarantee. |
| D; >64 MiB pre-dedup fixture | **170,307,124** serialized pre-dedup bytes reduced to **522,157** V2 plaintext bytes with preserved 76 stage-history rows; observed Node heap increase **700,945,048 bytes**. | Explicit evidence of a large heap footprint; NOT a constant-memory claim. |
| B; installed source-heavy Firefox | 50 accounts, 1,024 historical records, 2,049 unique blobs, 2,401,713 plaintext bytes, 49 inactive IndexedDB fragments and approximately 5 MiB storage growth; controlled source rehydration and no activation. | B test uses a synthetic native terminal receipt, not native host-H. |
| H-CI; run [39071954993](https://github.com/Neb963/PCMS-Alpha/actions/runs/39071954993), head `9809511b012fa09200fef96c248fcf88ce314955` | Actual installed XPI SHA-256 `5675cdfd281b4fe9778ad1f0530e3a15da70b7236d6c44ec7e6f386336fc92fd`; two separately qualified/disk-reopened files, **1,075 canonical rows each**, 50 synthetic donor Personas and **2,048** audited historical source manifests restored into a second Firefox profile, canonical IndexedDB independently read back and I16 hold retained. OS D-Bus/Secret Service and dedicated native executable were genuine. | H **step PASSED** but parent CI **FAILED** later on a B harness concurrency assertion; this is NOT exact-head acceptance. Donor decoded/inactive, not applied to real PersonaMonkey controller. No real Fedora/provider data. |

**Implemented since the original review:** full native run/cut/file journal,
source closure and independently authenticated terminal; single-flight guarded
I15 daily and manually addressed v2 transport; review-fenced production
`RUN_V2_MANUAL`; actual host-vault/disk binding in disposable CI; fresh
profile no-origin-ledger native qualification and guarded canonical recovery;
destination file-retention truth wins over imported foreign receipts; automated
regressions for corrupt/mismatched frames, lost ACK, direct URI/root/path
injection, retained-history ambiguities, stale plan changes, concurrent
requests and wrong key. The synthetic manual/B harness now waits for an
observable dispatch handshake, not microtask polling.

**Current test infrastructure:** standard public GitHub-hosted runner and
existing required workflow; `scripts/s02-ci-native-host.py` creates an
owner-only temporary HOME, D-Bus session, real Secret Service, exact Firefox
Developer Edition and actual registered native manifests, and then destroys
the context. It also samples aggregate `/proc` per-process resident memory
during source-heavy recovery. Such a sum double counts shared pages, is not
PSS/VRAM, and will be reported **only from a completed exact-head CI log**;
there is no invented fleet ceiling.

**Incomplete/blocked:** exact post-documentation HEAD checks; independent
cryptographic/format/security signoff; installed-H crash/lost-ACK, many-writer
and 15-file retention adversarial proof beyond existing D/B cases; full
source-heavy *donor-controller application* and real UID/route inactivity
under fresh-profile import rather than donor decode alone; supportable
long-running aggregate memory upper bound and >4 MiB row continuation;
actual operator Fedora and Perchance effects. The native
`RECOVERY_VERIFIED` state does not transfer publish, route, session,
ownership, approval or controller authority.

**Quarantine and compatibility:** keep v1 read/restore, no automatic I17
CREATE/RENAME on batch `batch_e2c328e54f9c4a6ab89f1084134fde52`
or slug `pcms-test-esr-chain-20261015-a01`; no `per-gens` writeback or
live Perchance effect. PR remains draft; an independently qualified E-06
reviewer must decide the actual final head/tree and outstanding holds.


### S02 acceptance ledger entry — 2026-10-18, real installed-H negatives

Reference: code checkpoint `1e8b6993bb6c54c5fe2eaf11748a8ce40f777c52`,
tree `8f817a510adcefee141445e3dfb77af332e7319f`,
[CI #39126836197](https://github.com/Neb963/PCMS-Alpha/actions/runs/39126836197).
All four required jobs PASS at this code checkpoint; the exact post-ledger
documentation HEAD must have its own checks verified. XPI SHA-256
`5675cdfd281b4fe9778ad1f0530e3a15da70b7236d6c44ec7e6f386336fc92fd`.

- **H-CI verified:** actual installed Firefox/native messaging and D-Bus
  Secret Service; two genuinely encrypted and independently reopened native
  filesystem archives, each 1,075 canonical rows, 50 synthetic Personas,
  1,024 source histories / 2,048 source manifests, exact source bytes.
  Fresh-profile decoded donor + canonical restore under I16 durable hold:
  controller `INACTIVE`, activation `OFF`; explicit UID remap produced
  `VERIFICATION_PENDING` with no imported identity; newer local reliable
  removal excluded a historical account in replace mode while preserving
  its tombstone. Actual interrupted host port left an unqualified file;
  wrong OS Secret Service key returned `BACKUP_AUTH_FAILED` with qualified
  original file unchanged and subsequent correct-key reopen successful.
- **Resource observation (H, not a guarantee):** max sampled aggregate process
  RSS **1,444,396 KiB** across 14 observed processes; RSS may double-count
  shared shared library pages and does not establish a fleet ceiling.
  D-tier 170 MiB pre-dedup workload observed a large JS heap transient and
  remains a capacity risk.
- **Fail-closed rejected fixture:** incomplete historical release information
  returned `BACKUP_SOURCE_INCOMPLETE_RELEASE` prior to native export on
  [CI #39126672939](https://github.com/Neb963/PCMS-Alpha/actions/runs/39126672939).
  This is a valid negative, not a relaxed success or reviewed approval.
- **Other tier boundaries:** packaged B installed I16 donor/guarded restore,
  v1 compatibility and synthetic v2 negative policy remain distinct from
  H-CI; true operator Fedora and Perchance L not tested/authorized.

**Final E-06 hold:** no full fresh-profile v2 *donor-state/cookie controller
application* proved from the native file, only authenticated donor decoding
and real canonical restoration plus separate I16 donor application. Formal
independent E-06 security/format approval is still missing; no production
host registration/activation, remote effects, restored approval or controller
activation, merge or S03. Original I17 uncertainty quarantine retained.
