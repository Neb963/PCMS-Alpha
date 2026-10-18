## 2026-10-18 — OPERATOR-APPROVED §9 RESOURCE DESIGN / CHANGED-CANDIDATE EVIDENCE PENDING

**Authority:** Gate B v1.1 §9 now contains the operator-approved technical supersession. It permits complete transactionally consistent aggregate canonical IndexedDB capture and inactive rehydration; it **does not** require O(U)-independent browser memory. The 50-Persona / 1,024-history / 64-MiB high-unique test is baseline evidence, **not a product account/history/source capacity limit**. No content-addressed storage conversion, crypto/wire relaxation, new phase or live provider permission. All security/identity/donor/history/retention/v1/R1–R6/B2/I17 conditions remain in force.

**Implemented on changed candidate; fresh exact-head verification REQUIRED:** v2 production capture meters the source cut as cumulative per-row JSON UTF-16 size *two bytes per code unit* within the existing five-store readonly transaction. It rejects exceeding a proportional operational memory allowance **before a native archive is created**, without omitting a row. This is a serialized-size **proxy** (neither browser heap/PSS nor precise peak RAM). An optional read-only native `resource.inspect` samples Linux MemAvailable and cgroup v2 available memory, selecting the smaller where both exist. Firefox `navigator.deviceMemory`, if exposed, is a coarse bucket; its absence is not made into a fictitious value. The admission budget defaults to 512 MiB UTF-16 proxy when no usable hints exist, or uses available OS memory / 6 and device bucket / 8 when available, subject to current operational 128 MiB–4 GiB proxy bounds. These are **temporary machine-resource safety limits, not fixture-sized permanent fleet ceilings or guarantees that memory allocation succeeds**; expand with measured OS/profile evidence, never by dropping source/history.

Before source capture and after obtaining the aggregate donor, Firefox `navigator.storage.estimate()` is checked where available: reported free space must cover the larger of 128 MiB and twice estimated staging bytes. Unsupported/unreliable quota is explicitly reported unknown, not invented. Restore's fresh-profile and tracked inactive-stage paths also preflight this quota **while the guard remains held**. The fixed native host samples destination `fstatvfs` available blocks **before run ledger, nonce reservation or encryption**, requiring approximately two expected plaintext lengths plus 64 MiB margin; existing successful files already consume disk and are not deleted to make room. Filesystem per-user quotas, external writers, cgroup differences and subsequent ENOSPC remain possible and must leave uncertainty/last-good intact. The native observer must never be confused with a JS heap measurement.

**Candidate H change:** the installed-Firefox/native/Secret-Service harness executes the actual `captureV2SourceCut` production coordinator (canonical snapshot, source audit, full encrypted donor, cookie/portable consistency, independent unchanged check) with an isolated **injected synthetic donor-read adapter**, then writes, reopens, authenticates and recovers the file. This is the production coordinator **code**, exercised from a disposable extension page; it is **not** proof that the real background's attached PersonaMonkey adapter captured an active donor atomically or that authorized live Perchance E-02 ran. The previous installed 50/1,024/64-MiB full donor+source inactive recovery and 6,144 byte proofs remain prior-head evidence until this candidate's exact H completes. Native deterministic 15 separate ~2-MiB qualified file / 14-retained / injected ENOSPC proof remains D, not a real filled filesystem or 14 simultaneously large archives.

**Outstanding review / promotion:** Check final same-candidate fast/baseline/Firefox/pcms-required CI and archived H data; analyze failures, quota/memory boundary and post-restore guard. Obtain E-06 format/security review under a **distinct, genuinely authorized reviewer identity** (not the PR author account). Production v2 stays OFF; original I17 quarantine unchanged; E-02 actual Perchance remains L-unavailable, not PASS. **Do not merge until applicable protected approval gates are satisfied.** This opening addendum supersedes older pre-decision claims below that persistent content-addressed storage or fixed 50/1,024/65-MiB ceilings are mandatory.

---

# S02 implementation and verification ledger — PARTIAL / E-06 HOLD

## 2026-10-18 — outcome-led B1 reassessment, measured B fixes, proposed GB-03 amendment (UNAPPROVED)

**Status and authority:** PR #24 remains DRAFT / UNMERGED. Production `reviewedV2` remains OFF; no operator host/profile change, no live Perchance E-02, no private `per-gens` mutation, no S03 and no replay of I17 quarantined batch `batch_e2c328e54f9c4a6ab89f1084134fde52` or slug `pcms-test-esr-chain-20261015-a01`. This entry supersedes earlier *engineering assertions* that content-addressed persistent storage was already shown mandatory. It does **not** amend the accepted Gate B v1.1 §9.1/§9.3 source-streaming requirement. A different authorized identity must approve exact-candidate E-06.

**Exact measured code:** `eedd7707e1d1ee2defc2928537fd9216edb04b4c`, [required run 39155789741](https://github.com/Neb963/PCMS-Alpha/actions/runs/39155789741) PASS: baseline, fast **405/405** (0 failed/skipped), installed Firefox, and pcms-required. Same-run packaged XPI SHA-256 `c799d6ce245bba4fdbc5b11ad449e00ff24f85f398136c5cc680bd4f488d1d19`. No independently approved E-06.

**Demonstrated defects, not architecture assumptions:**
1. An otherwise valid source-heavy native-v2 recovery failed in fresh Firefox at `BACKUP_TOO_LARGE`: `applyCanonicalSnapshot` reused the v1 64 MiB final readback. Fixed v2-only uncapped serialized transactional readback in `restore-idb.mjs`, retaining the v1 path.
2. The guarded background `APPLY_V2` lost its port at 28–34 seconds with 32 and 64 MiB generated unique assets. An attempted periodic browser-API timer did not prevent it. A second *read-only, identity-pinned* native-host connection held for the duration of already-authorized `APPLY_V2` prevented that disconnect; no replay, new command authority or automatic activation.
3. With donor Personas, cookies and portable stages independently OBSERVED, the canonical stage still returned `RESTORE_PARTIAL_HELD`; its readback reused `snapshotCanonical` and the v1 64 MiB cap. Fixed only the v2 stage branch to use `snapshotCanonicalV2(db,{serializedValues:true})`. Prior uncertain results were never declared successful.

**Actual installed Firefox + OS-native high-unique H-CI evidence:** 50 synthetic account/Persona entries, 1,024 historical records with candidate + previous source, **67,108,864 distinct generated binary asset bytes**, **134,217,728 referenced binary asset bytes**, plus distinct `main.pjs` and `index.html` bytes. Actual Firefox IndexedDB data were inserted, captured by production `snapshotCanonicalV2`, transactionally rechecked with `verifyCanonicalV2Unchanged`, encoded with the real v2 codec, sent through real native messaging, AES-GCM/OS Secret Service encrypted, independently authenticated twice on native disk, and recovered in two separate fresh installed Firefox profiles. **Important scope:** the harness supplies a synthetic PersonaMonkey donor envelope and does not call the production background `captureV2SourceCut` donor coordinator; it does *not* prove a live-provider/donor cross-component atomic cut or operator Fedora. H-CI final guarded donor-controller path created/read back **50 real Firefox containers**, **50 real cookie sets**, and OBSERVED `donor-personas`, `donor-cookies`, `donor-portable`, and `pcms-canonical`. **6,144 source-file instances** were byte-checked against independent original generators/manifests, with reliable removed-account exclusion, fresh UID remap, inactive controller and global restore hold. Wrong vault secret, native port interruption, missing review hold and wrong operator plan fail closed.

**Measured resources (single disposable GitHub Ubuntu/Firefox Developer Edition run; NOT universal maximum):** Firefox storage estimate before 49,152 B; after source insertion **283,065,760 B**, reported quota **10,737,418,240 B**; capture transaction **551 ms**; fixture insertion plus capture **285,150 ms**. Encrypted file **69,391,375 B** each, two actual encrypted native files **138,782,750 B**; independent restored Firefox profile **502,946,668 B**; source profile **362,822,736 B**; **14-file projection 971,479,250 B**, plus one new file **69,391,375 B** and protected restore-profile space. Available filesystem **90,012,266,496 B** during measurement. Peak *summed* sampled RSS **4,380,380 KiB** across up to 14 processes (shared pages double-counted; not peak JS heap/PSS); `performance.memory.usedJSHeapSize` was unavailable/null. A quota estimate is not a guaranteed operator quota and the 14-file projection is not 14 actual 69 MB files.

**Retention / quota D evidence:** The required Python/Node lane individually encrypted and independently decrypted/qualified **15 distinct files**, verified exactly 14 successful files are retained after one prunes, rejected uncertified files as retention candidates, and injected deterministic `ENOSPC` at an append boundary: no false success, uncertain ledger retained, no pruning of the last-good archive. This exercises roughly **2 MiB per actual D archive**, at least **28 MiB across 14 retained real ciphertext files**; it is *not* an observed real quota mount failure or 14 full-sized high-unique files. Historical R1–R6 and B2 corrections remain intact, subject to independent changed-candidate review.

**Decision: B — two concrete v2-only readback defects and a background lifetime defect required bounded implementation corrections, now passing the exercised H-CI chain.** C (fundamental persistent-storage redesign) is NOT demonstrated. Under measured limits the existing transactional-IDB design appears viable, which would support A *only if* the following explicit design amendment were approved and capacity admission independently checked.

**One narrow proposed GB-03 technical amendment — OPERATOR DECISION REQUIRED; not effective:** For source-bearing **v2 only**, permit a transactionally consistent complete in-memory IndexedDB canonical snapshot, drift recheck, and authenticated aggregate inactive rehydration *instead of total-U-independent capture/decode* for a **finite qualified fleet envelope** initially no larger than **50 account/Persona entries, 1,024 source histories, 65 MiB total distinct source bytes (including the measured 64 MiB assets), 130 MiB pre-dedup source references, and at most 1,075 canonical rows**. Preserve current per-frame/END/count restrictions and all v1/security/inactive/fail-closed rules. Permit expansion only following measured H-CI full-path proof and renewed review. Propose an **initial ≤512 MiB Firefox IDB-usage admission limit**, capacity accounting for source and encrypted recovery staging, plus free disk reservation of **14 qualified archives + incoming archive + protected staging space**, not merely the 14-file size. Both limits and a practical minimum machine-memory profile require explicit runtime admission/fail-closed tests **before activation**; the observed 4.18 GiB summed RSS is a measurement, not a claimed bound or platform requirement. Donor near the accepted 2 GiB limit, precise browser heap/PSS, 50+ actual real Personas, actual 14 high-unique on-disk files, true filesystem/IDB quota exhaustion and production donor-coordinator capture remain outside the demonstrated envelope. This proposal does not alter file crypto, header, frames, source completeness, retention, or the two-pass authentication model. If the operator declines this scoped O(U) exception, §9 remains authoritative and B1 stays OPEN; an O(U)-independent implementation is then required before approval, but a persistent content-addressed database still has not been proven to be the *only* mechanism.

**Acceptance impact:** Isolated D/B/H-CI demonstrates a recoverable finite workload; **GB-03 §9 B1 remains OPEN pending operator amendment or actual compliant implementation**. Formal independent exact-head E-06 approval and separately unavailable provider E-02 L remain NOT PASSED. Do not merge, enable production v2 or substitute H-CI for operator evidence.



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


## 2026-10-18 — exact changed-candidate integrated CI evidence (supersedes the earlier pending-proof statement)

**Proven pre-documentation code checkpoint:** `3ccfa0a282116e6d3fab5a5743ef93080ed8a856`; the documentation-only branch checkpoint tested was `56dcf1317bb7503d0005805a0108c82adc064f82`. Required CI [39138515377](https://github.com/Neb963/PCMS-Alpha/actions/runs/39138515377) **PASS**: fast **395/395**, baseline, installed Firefox and `pcms-required` all succeeded. Same-run XPI SHA-256 **`d0dd791ff0e6662d310dc0fc8fbbe53f319bfb03c308dc82d0333286bb7d5d94`** in fast packaging, B, and registered H-CI. Firefox Developer Edition **154.0b10** on a disposable GitHub runner. Later changes to these Markdown review documents do not constitute independently verified source/security changes and require a new exact-final-run readback.

**H-CI current candidate — observed:** actual registered native messaging host `local.pcms.backup_v2`, live D-Bus/Secret Service and real encrypted disk, host death/interrupted file not promoted, wrong OS key `BACKUP_AUTH_FAILED`, two independent native archives (1,075 rows each), independently reopened native file and newly installed fresh Firefox profile. The installed donor adapter created **50 distinct Firefox Persona containers and 50 cookie sets**; actual `donor-personas`, `donor-cookies`, `donor-portable`, `pcms-canonical` stages reported **OBSERVED**. Exact **1,024 historical source revisions**, **1,075 canonical rows**, UID remap, removal-history exclusion, native effect holds and **inactive** controller were verified. Operator-review-plan mismatch and missing durable restore guard denied donor effects. Sampled aggregate peak sum RSS **1,460,744 KiB** across up to 14 processes (double-counts shared pages). This is **H-CI isolated** with synthetic fleet, **not** operator Fedora H, not 1,000 generators' high-unique working set, and not Perchance provider L.

**B current candidate — observed:** persistent installed XPI, background restart, v1 compatibility, source/donor decoder, sealed IDB fragments and inactive restoration; heterogeneous fixture **50 accounts, 1,024 histories, 2,049 distinct blobs, 2,401,713 plaintext bytes, 49 IDB fragments and 5,021,696 bytes IDB usage delta**, source-heavy decode duration **3,437 ms** in disposable Firefox. This is not a high-unique-byte capacity budget.

**D current candidate — observed:** 395 Node tests passed with native adversarial cases. Heterogeneous native D: **50 accounts, 1,024 histories, 3,332 distinct blobs, 5,009,728 plaintext bytes, 5,009,794 ciphertext bytes, 422,705 donor encrypted bytes, native observed peak RSS 37,584 KiB, Node heap delta 27,096,504 bytes and RSS delta 69,513,216 bytes**, duration 4,460 ms. Repeated-source 170,306,956 pre-dedup bytes / 522,157 post-dedup bytes observed **+248,009,504 Node heap / +313,364,480 RSS** with 76 histories; numbers vary significantly between runs and are **not** a bounded-resource proof, formal baseline comparison or peak-process telemetry. Hardware core count, free RAM, filesystem quota and fleet disk headroom were not instrumented to the requested acceptance standard. Disk-exhaustion, large opaque donor near its bound, high-unique-volume and 14 simultaneously protected real source-heavy files are not demonstrated at this checkpoint.

**Status remains PARTIAL / B1 BLOCKED.** The reproducible current-candidate D/B/H-CI evidence closes important integration uncertainty and substantially supports B2, but cannot repair or override B1's whole-fleet export/import memory dependency. No E-06 independent approval, no operator H or E-02 L. Never label this as `READY FOR INDEPENDENT E-06 RE-REVIEW`.

**Architecture-critical B1 feasibility reconciliation:** current canonical source values embed repeated base64 history blobs inside IndexedDB rows, requiring clone of each entire cursor value; initial `snapshotCanonicalV2` retains the whole fleet, `compileV2` synthesizes aggregate maps and byte frames, and the v2 decoder plus I16 sanitizer/PersonaMonkey decoder require an aggregate canonical+donor object. A consistent short canonical/PersonaMonkey cut and genuinely O(buffer+reviewed working state) processing of arbitrary unique histories are not established merely by paging an IDB cursor. An implementation plan must introduce immutable content-addressed source storage and a versioned atomic cut manifest, with safe migration and single-source-writer/change fencing; export must make bounded digest/length passes, then stream verified source directly to existing native writer with fixed one-message AES-GCM. Restore must use authenticated bounded encrypted staging and a versioned inactive canonical transaction/rollback mechanism, keeping donor's actual serializer/validation and post-write source/digest readback. **Do not stage a plaintext archive to disk** or import half-decoded rows as authoritative. Because existing donor adapter can materialize up to 2 GiB and accepted CANONICAL rows can exceed 4 MiB even after dedup, these limits may need explicitly reconciled native/PersonaMonkey adapter changes and a narrow independently accepted wire continuation. Proposed choices: (A) preserve v2 envelope and extend internal canonical/source storage and donor adapters for the supported bounds, then separately authorize a versioned authenticated row-continuation grammar for genuinely overlarge inputs; (B) keep frozen v2 and refuse oversized inputs with an exact `UNSUPPORTED/HELD` diagnosis while seeking a product/security amendment. Silently truncating source, inventing record encryption or raising limits without a reviewed resource design is forbidden. No option has yet been formally adopted or implemented.


## 2026-10-18 — B2 engineering implementation and bounded-memory B1 partial reduction (current branch checkpoint)

**Actual status: PARTIAL / E-06 HOLD, not READY for independent approval.** Final [E-06 review #5563400179](https://github.com/Neb963/PCMS-Alpha/pull/24#pullrequestreview-5563400179) accepts the previously reviewed limited R1–R6 corrections, but identifies B1 and B2. These commits preserve the original draft PR and did not activate v2, install a host in an operator profile, mutate a provider or private generator repo, merge, start S03, or remove the I17 quarantined effect.

**B2 code:** `native/backup_v2_host.py` now checks all known salt/IV pairs from native ciphertext headers, journals and permanent owner-only per-pair reservation files while holding the pinned-root writer lock. CSPRNG salt/IV is generated for each attempt; journal and reservation are fsynced before GCM is initialized. A repeated pair or corrupt/incomplete collision history refuses new encryption, including after restart or uncertain ACK; prior ciphertext and last-good status survive. Added `native/tests/test_backup_v2_host.py` adversarial cases for successful and abandoned pair reuse, competing writers, cold restart, durable-reservation failure, corrupt history and old archive headers. These tests inject synthetic repeats; they make no claim about real CSPRNG collisions.

**B1 limited copy reduction:** `snapshotCanonicalV2` no longer gratuitously calls `structuredClone` on already IDB-cloned cursor values. `verifyCanonicalV2Unchanged` compares independent IndexedDB after-cut rows in one readonly transaction without building a **second** complete source snapshot; the production v2 `captureV2SourceCut` uses it. Added mutated/deleted after-cut regression. This does **not** change `compileV2`'s unique base64 collection, the initial all-row source snapshot, browser restoration aggregation, donor envelope memory, or the format limits. Thus **B1 IS NOT CLOSED.** A bounded encrypted source-cut/streaming plan and matching bounded atomic inactive rehydration must be engineered and measured before promotion; oversize valid records needing wire continuation require narrow design approval.

**Evidence:** earlier 170,307,124 pre-dedup source workload used ~701.5 MB extra Node heap at the frozen reviewed HEAD. The changed synthetic CI sample [39138094974](https://github.com/Neb963/PCMS-Alpha/actions/runs/39138094974) measured 170,306,956 pre-dedup, 522,157 v2 plaintext, +111,692,392 heap and +157,208,576 RSS after measurement/fixture changes, **not** a controlled like-for-like before/after comparison and **not** worst-case bounded-`U` evidence. That run's fast check failed because its Node wrapper still asserted the original native test count (not because the 26 new native test scenarios failed); corrected on the branch for a subsequent CI run. Never promote a failed/stale run to PASS.

**Completion matrix:** R1–R6 retained as prior scoped reviewed closures requiring final rerun; B2 candidate engineering implementation with deterministic test coverage, exact final-candidate checks pending; B1 OPEN; D subset seen in earlier runs but latest full green still pending; packaged B and registered H-CI of changed native host not yet proven; remote GIT readback required for final checkpoint; independent E-06 approval, operator-specific host/activation and E-02 live provider remain BLOCKED. Production v2 reviewed admission OFF. No unsupported file is qualified as successful backup or counted toward 14.

**Precise next engineering step:** implement immutable bounded-size encrypted source capture/unique-blob export AND bounded transactional staged restore, preserving donor adapter and full source closure; measure high-unique, oversized, large-donor, disk/quota/crash/retention cases, then obtain independent design authority if continued wire framing is necessary. Only then run exact HEAD D/B/H-CI/GIT, produce matching XPI hash and request a distinct authorized independent E-06 review. The original I17 uncertain batch `batch_e2c328e54f9c4a6ab89f1084134fde52` and slug `pcms-test-esr-chain-20261015-a01` retain absolute no-auto-CREATE/RENAME quarantine.


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
