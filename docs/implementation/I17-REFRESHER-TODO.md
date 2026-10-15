# I17 — Source-Save Refresher: Implementation Checklist

**Owner:** next coding agent on `Neb963/PCMS-Alpha`, existing draft PR #20. **One phase: I17.**

**Operator objective:** a verified listed generator receives a controlled, non-executable PCMS-owned source-marker revision; PCMS performs a normal native Perchance save; independent persisted-source and recent-list observations are recorded separately. Once appropriately qualified, existing Refresher scheduling executes this bounded mechanism automatically. No imaginary `/api/refresh` dependency.

## Baseline / coordination

- [x] Read `PCMS-I17-Refresher-Agent-Prompt.md` in full, `AGENTS.md`, I17 authorization, `plan.json`, relevant `PHASES.md`, `AGENT-PROTOCOL.md`, `CI-ENGINEER.md`, signed Stage 2/3 and P54/P56 contracts, and discovery evidence.
- [x] Re-fetch main, I17 PR #20 head, CI, other agent activity, pending commits/local work; log exact SHAs. Last seen I17 head `4787240733862f114f38f133e31786a204cb3f4c`, main `34a5c48fbfac6c15ef86a453668b3b353402ab18`.
- [x] Preserve paused Supply recovery repair; do not reset/force-push or start a separate phase. Current B failure: `I06_EFFECT_IDB_PROBE_FAILED — RENAME admission INVALID_PARAMS`. Distinguish pre-existing CI fault from new Refresher regressions.
- [x] Confirm connected GitHub write permissions, early draft PR recovery notes and remote checkpoint procedure.

## Product authority — narrow additive amendment

- [x] Record dated operator clarification: refresh = approved behavior-preserving source-marker edit + native save + independent recent-list observation, not a special refresh API.
- [x] Supersede Stage 2 §5.1 code-change ban and Stage 2 §5.6 / Stage 5 P54-05 no-comment/no-op and `EXPLICIT_PROVIDER_REFRESH` restriction **only** for the controlled PCMS-owned marker under explicit consent and provider-permissibility limits.
- [x] Update current I17 authorization/current plan/test descriptions to reference the amendment. **Do not alter frozen signed source files or forge acceptance.**
- [x] Preserve all donor, ownership, human edit, exact source approval, journal, no-blind-retry, separate feed proof and P54-09 requirements.

## Source marker and exact provenance

- [x] Define one deterministic non-executable marker format, insertion location, per-generator consent and stable replacement algorithm; deny ambiguous/unsafe locations.
- [x] Add immutable functional base F fingerprint + exact pre/post full-manifest fingerprints + marker version/sequence + operation identity to canonical records.
- [x] Implement prepare/preview/verify transform with **only** marker bytes changed; never accumulate comments or alter executable PJS/HTML, assets, imports or source ownership.
- [x] Verify independently saved remote bytes, owner, privacy and source, not just `saveGenerator()` acknowledgement.
- [x] Keep Git F, tested F, deployed F-derived source and previous-good P distinguishable. Support later AI/staging/writeback/publication/restore drift checks **only** for precisely recognized marker-only derivations; unknown functional source drift holds.
- [x] Preserve old receipt/schema compatibility and interrupted-operation recovery. No blanket ignore-source-diff rule.

## Native adapter / donor / production wiring

- [x] Implement fixed `perchance-refresh.mjs` native MAIN-world guarded marker-save operation; prove human editor clean/solo, correct slug, owner, public listing, and source bytes before mutation.
- [x] Add one fixed donor-controlled executor through `overlay.mjs` and `persona-guard.mjs`; reuse existing exclusive lease and protected Persona. No arbitrary UI-selected script/tab/route, Direct fallback or second controller.
- [x] Implement `refreshAdapter.execute(claim)` + `refreshAdapter.readback(claim)` with independent provider saved-source and recent-list observations.
- [x] Revise `qualifyRefreshCandidate()` to admit only approved/versioned `GUARDED_SOURCE_SAVE` evidence, not arbitrary UI `true` flags; keep versioned method drift/revocation handling.
- [x] Wire **actual adapter**, scoped `refreshGate` and `qualificationFor` in packaged `src/runtime/entry.mjs`; verify registration remains synchronous across Firefox event-page wake.
- [x] Reuse `reserveAttempt`, `markDispatch`, `settleAttempt`, existing one alarm / one queue. Ensure `DISPATCH_POSSIBLE` is durable before possible remote save; duplicate alarms and crash never replay a possibly executed save.
- [x] Preserve bounded read-only reconciliation and causally accurate status when preflight fails before remote dispatch.

## Monitoring and scheduled fleet

- [x] Use existing `GET /api/getGeneratorList` with **exact slug** and complete fresh schema. Record save, persisted change, feed presence/rank, absence and UNKNOWN separately; do not parse raw HTML or infer ban/private/deletion from absence.
- [x] Show one eligible generator's explicitly authorized test action **in the same XPI** before fleet qualification.
- [x] Implement operator H-04 evidence verification and versioned per-target/method qualification; prevent UI-manufactured support evidence.
- [x] Enable opt-in recurring execution in the **same installed XPI** after defensible method proof and P54-09 resource evidence; no code rebuild after H-04.
- [x] Preserve 24h active / 72h sleep defaults, fairness, grace, capacity/hysteresis, global/account/generator Pauses and existing single coalesced alarm.
- [x] Rate limits, feed filtering, absent rank, unknown effects and quota exhaustion cause bounded re-observation/scoped holds, not repeated marker variations or unattended spam saves.

## UX and diagnostics

- [x] Refresher UI: eligible generator → exact marker diff → explicit scoped consent → one test → persisted source result → feed observation → qualify → optional recurring enable / Pause.
- [x] Show accurate nontechnical states, recent rank/time, source fingerprint and bounded next action; update Overview based on actual runtime status.
- [x] Add one-click **redacted diagnostic receipt**; no raw IPs, tokens, credential material or private source bytes.
- [x] Verify all buttons work, are keyboard accessible and survive delayed responses, tab closure and background wake without phantom commits.

## Tests and independent evidence

- [x] F/X positive: true production caller reaches a fixed effect ledger and exact marker-only full-byte save/readback; second refresh replaces marker, not appends.
- [x] F/X negatives: private/unlisted, wrong owner, Direct/unprotected or changed route, human/dirty/collaborative editor, bad anchor, stale functional source, Git/release mismatch, no provider support; **zero external writes**.
- [x] F/X uncertainty: IDB abort, lost save ACK, saved-but-not-persisted, saved-but-feed-absent, stale/partial/429 feed, duplicate alarm, cold wake, failed readback; no blind repeat.
- [x] Source-provenance regression: marker recognized precisely; altered code/assets or stale human approval held; previous-good/source recovery intact.
- [x] Scheduler load/stress: at least 50 accounts and 1,000 generators, oldest eligible, pause/grace/slot/capacity, no restart burst, bounded CPU/I/O/IDB and resource report without invented production rate allowances.
- [x] Packaged persistent Firefox B: installed combined XPI, real `entry.mjs` registration, donor-fixed execution, UI lifecycle, alarm wake; assert adapter cannot be absent or null. Donor regressions included.
- [ ] Restore `pcms-required` green **at exact head** without weakening gates; investigate pre-existing Supply B `RENAME admission INVALID_PARAMS` independently and minimally if needed.
- [ ] Confirm reproducible build twice, XPI Gecko ID `persona-route-manager@local`, SHA-256 and exact HEAD/CI correspondence; no live H PASS claimed.

## Operator H-04 (outside coding-agent environment)

- [x] Deliver short script for one explicitly approved, owned, listed generator: before source + feed, single safe marker save, independent source/visibility readback, redacted receipt, stop.
- [x] Define independent provider-permissibility/efficacy evidence needed for scope-limited recurring activation. Feed appearance once ≠ guaranteed repeated rank.
- [x] Provide in-XPI import/verify/promote/revoke path for legitimate H evidence; no second coding cycle required after successful proof.
- [x] Keep H-series and protected governance acceptance **pending** until real operator evidence and independent review.

## Publish / stop

- [x] Commit coherent increments via connected GitHub, verify remote branch HEAD/tree after each checkpoint, update this checklist with test IDs, observed outcomes and commit SHAs.
- [ ] Deliver complete combined XPI, SHA-256, capability report, exact CI F/X/B jobs, H-04 guide and one first-causal-failure diagnosis for any hold.
- [ ] Keep PR #20 draft, **do not merge** without required H/independent governance. Report `IN_PROGRESS_CHECKPOINTED` or `BLOCKED_SAFELY` truthfully; `MERGED_AND_VERIFIED` only after protected postmerge evidence.

### Completion gate

The code is **not done** if the packaged Refresher still has a null `refreshAdapter`, a permanent global `refreshGate` denial, missing fixed native donor execution, only shadow state/qualification UI, fabricated visibility, no exact-source reconciliation, or no executable post-H scheduling path.

**Source/effect/UI/recurring behavior must work end-to-end in the actual packaged XPI with isolated provider fixtures. Only real Perchance efficacy and acceptance remain operator-evidence questions.**


## Executed ledger — 2026-10-15

- Preflight: PR #20 draft HEAD `4787240733862f114f38f133e31786a204cb3f4c`; main `34a5c48fbfac6c15ef86a453668b3b353402ab18`. Clean public clone matches connector readback; connector reports push permission. Paused Supply repair retained.
- Existing CI run `38787289754`: baseline/fast PASS; firefox and pcms-required FAIL. First causal B error `I06_EFFECT_IDB_PROBE_FAILED: RENAME admission INVALID_PARAMS`, job `116602851041`. This predates the Refresher changes.
- Read operator prompt/checklist, root instructions, execution/CI contracts, I12/I14/I17 plan, I17 authorization, Stage 2 §5, Stage 3 source/release and F1/F2 amendment, Stage 5 P54/P56 contracts; extracted discovery source/save/feed evidence locally.
- Product amendment added before runtime edits. Frozen originals untouched. Checkpoint SHA is recorded in the following verified checkpoint, avoiding self-reference.
- Runtime, UI, qualification, F/X/B and final package remain IN PROGRESS. No H PASS or merge.

### Source-save implementation checkpoint (before UI/B verification)

- Amendment checkpoint verified remote HEAD/tree: `4cfa11108499e3eec378f38d4bfd0725d79f63e7` / `ec7d10cb2d981f47941d9eaae492992f7d67b2a8`.
- Added exact `html_prefix_v1` transform, immutable base/pre/post receipts, fixed native preflight/save, donor-owned editor/lease bridge, canonical consent, detached H-04 signature verification, same-XPI local resource sample, production entry wiring and scheduler/recovery integration. These are implemented, not yet packaged-B accepted.
- Executed 9 new F/X source-save tests and all 17 inherited I14 tests: PASS. Positive remote ledger distinguishes actual persisted bytes/feed from native ACK; negative signature/owner/editor/source/feed cases reject.
- Build succeeds; `check-stage7.py` verifies 29/29 original signed members. No donor source, Supply runtime, workflow or required-check changes.
- Full fast regression in progress. UI, true installed-Firefox execution, resource/failure matrix, operator guide and final reproducibility remain pending.
- Local pinned Firefox downloaded; geckodriver extraction hit container ownership metadata restriction after extracting binary. Use existing extracted binary/ownership-neutral extraction for local verification; CI setup unchanged.

- Serial full fast regression: **405/405 PASS**, ~4.8 s. An earlier overlapping standalone build collided with the suite's own packaging directory; serial execution resolves it without product/test changes.

### UI and packaged verification checkpoint

- Core checkpoint verified remote HEAD/tree: `402375d15b6c6c4cf09ebc9091fe079717758792` / `7e06d42354608958d38abaa57eb6495e2b726115`. Its CI baseline/fast/donor/reproducibility passed; Firefox retained the known Supply fixture failure, not a Refresher regression.
- Implemented existing-view marker diff/consent/test/read-only reconcile, source/feed receipts, detached-review key pin/import/revoke, target scheduling opt-in, local resource measurement and redacted export. Emergency diagnostics now allowlist the new scoped source-save mode while retaining historical shadow-mode semantics.
- Supply first-cause diagnosis: browser fixture throws on `PREFLIGHT_CREATE`, which the paused repair now correctly requires; Create fails and Rename receives undefined revision. Narrow fixture-only repair supplies v2 read-only preflight, and adds explicit Create failure diagnosis. Supply runtime remains byte-identical to baseline.
- Executed local persistent installed Firefox 154.0b10: same Gecko ID survives process restart, original Supply causal failure is passed, and real alarm/event-page cold wake passes. A later new-mode diagnostics mismatch was identified and repaired; full final B remains pending.
- Added a loopback-only TLS provider fixture and a real MAIN/ISOLATED injection probe for marker save, persisted/no-persist/feed/lost-ACK, same-XPI signed qualification and recurring replacement. No production provider writes or credentials. This container denies low-port binding and cannot start the isolated 443 fixture; mandatory independent GitHub Firefox verification will execute it on the normal runner. Never fall through to the real Perchance site.
- Frozen originals, donor sources, protected required workflow/permissions/aggregator remain unchanged. New package is still a candidate, not H accepted.

- UI/native-fixture checkpoint verified remote HEAD/tree: `8644a358061941857a466277274b71ada1c776f1` / `de3ebb34f6b8dbfa1e2d57836587908da46d708a`. Full local fast **406/406 PASS**.
- CI `38796525055`: baseline/fast/donor/build/reproducibility PASS; Firefox advanced through Supply, emergency export, native AI, Git and cold wake, then hit another historical `OBSERVE_NOW` providerEffects=OFF assertion. Changed only the expected capability projection; zero unqualified scope/dispatch assertions retained. New source-save injection probe moved early for cheaper causal feedback.
- Added real IDB-dispatch abort and dirty-editor no-save cases to the local HTTPS packaged probe. Added operator-only H-04 runbook and offline public-key/signature helper.
- Review also found refresh-tagged editor handoff must use its own fixed port: now it durably marks only the exact tagged tab human-owned and applies generator Pause. Active/human/dirty tabs are retained; native public-editor clean probe reused before closing a successful inactive PCMS tab.

### Canonical identity and downstream source authority

- Checkpoint `094c000583a2db769f4b4284df24403d45533e72` / tree `d4553ed3617e6e07d30a271858d738e899c511c5` verified remote. CI `38797548569`: baseline/fast/donor/reproducibility PASS; new early real-injection probe correctly caught canonical `public_` prefix versus raw native publicId mismatch before any save. Fixed native comparison and independent fixture IDs using the existing observer's actual convention; no weakened owner/target assertion.
- Full local fast **410/410 PASS**. Added publication/rollback stale-approval rejection for recognized marker bytes and restore revocation of marker consent, reviewer trust and recurring scope while preserving immutable history.
- Existing-update explicitly recognizes an exact verified marker derivation and returns `KNOWN_REFRESH_DERIVATION_RECONCILIATION_REQUIRED`; it cannot overwrite it under an old base-F/P approval. Historical source-link B is no longer misclassified as a new READY update merely because approved AI release F differs; explicit READY work still holds and original link/release bytes remain separate.
- Canonical pending intent is exposed in source receipts, including expected pre/post hashes; receipt reload remains read-only during in-flight execution. UI disables another test after an ambiguous reply and rejects private reviewer keys. Current operator/capability docs reference the new H-04 source-save procedure.

### Real packaged native and production-entry evidence

- Previous checkpoint `66e1ea11449e2e3b37fb96b42d949858f616f560` / tree `9deca54d25d29d7ce7566a506c651882b04347ae` verified remote; CI baseline/fast passed, native B exposed a readiness/context failure before saving.
- Replaced the low-port test-server dependency with an isolated high-port TLS server and a protected loopback CONNECT proxy. Only fixed fixture hosts terminate locally; global unmanaged Block remains enabled. This supersedes the earlier local port-443 limitation; local native B is now achievable. No donor route bypass, live DNS or production sockets.
- Firefox 154.0b10, persistently installed combined XPI after process restart: actual production command port/UI -> real donor shared lease/protected route -> fixed MAIN/ISOLATED injection -> native save -> independent source/feed receipt **PASS**. Inline keyboard focus and mismatched intent rejection also pass. Independent provider ledger records exactly one entry-point save; duplicate request rejected.
- Installed packaged fault matrix **PASS**: present, persisted-but-absent, no persistence despite ACK, lost ACK with independently proven persistence; dirty editor and actual IDB dispatch-commit abort each produce zero saves. Canonical DISPATCH_POSSIBLE is independently read before each native save.
- The same installed XPI verifies a pinned detached review, performs the 50-account/1,250-generator resource sample, opts in, and schedules sequence 2 by replacing exactly one marker. Canonical resource sample: 1,213,252 serialized bytes; observed Firefox eight-turn sample elapsed 125 ms in this isolated run (local measurement, no provider rate claim). Revocation/Pause are exercised.
- Firefox returns a just-created tab's transient about:blank document as complete as well as loading. The bounded readiness wait now accepts either under the exact owned tag/lease, never injects on blank, and still requires the exact target before preflight or effect. Focused F test covers both states.
- Strict source-receipt projection rejects nested token/source canaries. Permanent operation-ID intent/dispatch tombstones are committed with canonical state, alongside immutable successful marker receipts.
- Serial full fast suite **412/412 PASS** (~4.8 s). Full inherited Firefox regression, source-save process-cold recovery, independent final-head CI, final reproducibility and delivery remain in progress. H and independent governance acceptance remain pending.


### Complete operator-test execution and final-candidate verification

- Checkpoint `00ec59da5cdabf55ca2e9369d6090fb2508f48cb` / tree `ea242929ce70fe58701a7d25c9ec6eb5cce2e363` is independently green in [CI 38802195682](https://github.com/Neb963/PCMS-Alpha/actions/runs/38802195682): baseline `116653821298`, fast/donor/reproducibility `116653820746`, Firefox `116654282476`, pcms-required `116655337794`, all SUCCESS. It preserves the paused Supply runtime and all trust-root workflows.
- Local full installed-Firefox suite PASS, including new real production source-save process-cold recovery: concurrent commands admit exactly one native save; unavailable source readback retains DISPATCH_POSSIBLE; after full browser process restart the same intent resolves through independent READS ONLY. The separate provider ledger remains exactly one save, and each permanent intent/dispatch/success marker observation exists exactly once. Duplicate wakes/requests cannot replay it.
- Actual existing Refresher UI additionally PASS in the installed final package: keyboard focus, mismatch rejection, exact preview/consent/test, canonical reload, redacted receipt Blob export, canonical review challenge export, resource measurement, public-key pin, detached signed qualification import, target schedule enable/disable and revocation. Export contains no synthetic session token or functional source. No live H evidence is implied by synthetic reviewer keys.
- Hardened read-only reconciliation against changed released F, owner/account/Persona binding, authenticated principal, consent version and restore. A historical marker proof cannot be promoted into a new context even when a delayed readback arrives. New F/X matrix covers those independent negative contexts.
- Final serial fast **414/414 PASS** (~4.9 s), including the delivered offline Node key/sign helper against the production signature verifier and the below/at/above 80% storage-pressure no-save oracle. Final native/UI/cold-restart focused B PASS after the last runtime changes. Earlier full local B also passes all inherited Supply/AI/Git/release/backup/restore/scheduler/UI checks, real alarm and event-page wake.
- Local full B measured 50 accounts / 1,250 rows, observer read peak 2, canonical runtime snapshot 2,709,294 bytes, fleet observer scenario 3,820 ms; local eight-turn source resource sample 111–139 ms in observed runs. Independent checkpoint CI: 4,254 ms fleet observer scenario, 128 ms eight-turn source sample. These are isolated point samples, not peak memory/CPU, quota exhaustion proof, provider allowance or live SLO claims. Existing adversarial capacity/backpressure/quota/restore checks remain mandatory.
- Final package rebuilt twice identically: SHA-256 `17ae760d60c54c3a88069a5189428d2df986dc12aea0c81d10243e3b0fa80231`; Gecko ID `persona-route-manager@local`. Final exact-head required CI and external delivery binding are pending publication of this checkpoint; no merge or H PASS.

- Preflight cancellation now persists its safe causal hold and clears only the unconsumed preview. Source receipt/UI show the next bounded read-only observation time and remaining budget; failed or ambiguous native attempts remain consumed. No further runtime changes planned before exact-head CI.
