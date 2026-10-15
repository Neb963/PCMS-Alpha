# I17 — Source-Save Refresher: Implementation Checklist

**Owner:** next coding agent on `Neb963/PCMS-Alpha`, existing draft PR #20. **One phase: I17.**

**Operator objective:** a verified listed generator receives a controlled, non-executable PCMS-owned source-marker revision; PCMS performs a normal native Perchance save; independent persisted-source and recent-list observations are recorded separately. Once appropriately qualified, existing Refresher scheduling executes this bounded mechanism automatically. No imaginary `/api/refresh` dependency.

## Baseline / coordination

- [ ] Read `PCMS-I17-Refresher-Agent-Prompt.md` in full, `AGENTS.md`, I17 authorization, `plan.json`, relevant `PHASES.md`, `AGENT-PROTOCOL.md`, `CI-ENGINEER.md`, signed Stage 2/3 and P54/P56 contracts, and discovery evidence.
- [ ] Re-fetch main, I17 PR #20 head, CI, other agent activity, pending commits/local work; log exact SHAs. Last seen I17 head `4787240733862f114f38f133e31786a204cb3f4c`, main `34a5c48fbfac6c15ef86a453668b3b353402ab18`.
- [ ] Preserve paused Supply recovery repair; do not reset/force-push or start a separate phase. Current B failure: `I06_EFFECT_IDB_PROBE_FAILED — RENAME admission INVALID_PARAMS`. Distinguish pre-existing CI fault from new Refresher regressions.
- [ ] Confirm connected GitHub write permissions, early draft PR recovery notes and remote checkpoint procedure.

## Product authority — narrow additive amendment

- [ ] Record dated operator clarification: refresh = approved behavior-preserving source-marker edit + native save + independent recent-list observation, not a special refresh API.
- [ ] Supersede Stage 2 §5.1 code-change ban and Stage 2 §5.6 / Stage 5 P54-05 no-comment/no-op and `EXPLICIT_PROVIDER_REFRESH` restriction **only** for the controlled PCMS-owned marker under explicit consent and provider-permissibility limits.
- [ ] Update current I17 authorization/current plan/test descriptions to reference the amendment. **Do not alter frozen signed source files or forge acceptance.**
- [ ] Preserve all donor, ownership, human edit, exact source approval, journal, no-blind-retry, separate feed proof and P54-09 requirements.

## Source marker and exact provenance

- [ ] Define one deterministic non-executable marker format, insertion location, per-generator consent and stable replacement algorithm; deny ambiguous/unsafe locations.
- [ ] Add immutable functional base F fingerprint + exact pre/post full-manifest fingerprints + marker version/sequence + operation identity to canonical records.
- [ ] Implement prepare/preview/verify transform with **only** marker bytes changed; never accumulate comments or alter executable PJS/HTML, assets, imports or source ownership.
- [ ] Verify independently saved remote bytes, owner, privacy and source, not just `saveGenerator()` acknowledgement.
- [ ] Keep Git F, tested F, deployed F-derived source and previous-good P distinguishable. Support later AI/staging/writeback/publication/restore drift checks **only** for precisely recognized marker-only derivations; unknown functional source drift holds.
- [ ] Preserve old receipt/schema compatibility and interrupted-operation recovery. No blanket ignore-source-diff rule.

## Native adapter / donor / production wiring

- [ ] Implement fixed `perchance-refresh.mjs` native MAIN-world guarded marker-save operation; prove human editor clean/solo, correct slug, owner, public listing, and source bytes before mutation.
- [ ] Add one fixed donor-controlled executor through `overlay.mjs` and `persona-guard.mjs`; reuse existing exclusive lease and protected Persona. No arbitrary UI-selected script/tab/route, Direct fallback or second controller.
- [ ] Implement `refreshAdapter.execute(claim)` + `refreshAdapter.readback(claim)` with independent provider saved-source and recent-list observations.
- [ ] Revise `qualifyRefreshCandidate()` to admit only approved/versioned `GUARDED_SOURCE_SAVE` evidence, not arbitrary UI `true` flags; keep versioned method drift/revocation handling.
- [ ] Wire **actual adapter**, scoped `refreshGate` and `qualificationFor` in packaged `src/runtime/entry.mjs`; verify registration remains synchronous across Firefox event-page wake.
- [ ] Reuse `reserveAttempt`, `markDispatch`, `settleAttempt`, existing one alarm / one queue. Ensure `DISPATCH_POSSIBLE` is durable before possible remote save; duplicate alarms and crash never replay a possibly executed save.
- [ ] Preserve bounded read-only reconciliation and causally accurate status when preflight fails before remote dispatch.

## Monitoring and scheduled fleet

- [ ] Use existing `GET /api/getGeneratorList` with **exact slug** and complete fresh schema. Record save, persisted change, feed presence/rank, absence and UNKNOWN separately; do not parse raw HTML or infer ban/private/deletion from absence.
- [ ] Show one eligible generator's explicitly authorized test action **in the same XPI** before fleet qualification.
- [ ] Implement operator H-04 evidence verification and versioned per-target/method qualification; prevent UI-manufactured support evidence.
- [ ] Enable opt-in recurring execution in the **same installed XPI** after defensible method proof and P54-09 resource evidence; no code rebuild after H-04.
- [ ] Preserve 24h active / 72h sleep defaults, fairness, grace, capacity/hysteresis, global/account/generator Pauses and existing single coalesced alarm.
- [ ] Rate limits, feed filtering, absent rank, unknown effects and quota exhaustion cause bounded re-observation/scoped holds, not repeated marker variations or unattended spam saves.

## UX and diagnostics

- [ ] Refresher UI: eligible generator → exact marker diff → explicit scoped consent → one test → persisted source result → feed observation → qualify → optional recurring enable / Pause.
- [ ] Show accurate nontechnical states, recent rank/time, source fingerprint and bounded next action; update Overview based on actual runtime status.
- [ ] Add one-click **redacted diagnostic receipt**; no raw IPs, tokens, credential material or private source bytes.
- [ ] Verify all buttons work, are keyboard accessible and survive delayed responses, tab closure and background wake without phantom commits.

## Tests and independent evidence

- [ ] F/X positive: true production caller reaches a fixed effect ledger and exact marker-only full-byte save/readback; second refresh replaces marker, not appends.
- [ ] F/X negatives: private/unlisted, wrong owner, Direct/unprotected or changed route, human/dirty/collaborative editor, bad anchor, stale functional source, Git/release mismatch, no provider support; **zero external writes**.
- [ ] F/X uncertainty: IDB abort, lost save ACK, saved-but-not-persisted, saved-but-feed-absent, stale/partial/429 feed, duplicate alarm, cold wake, failed readback; no blind repeat.
- [ ] Source-provenance regression: marker recognized precisely; altered code/assets or stale human approval held; previous-good/source recovery intact.
- [ ] Scheduler load/stress: at least 50 accounts and 1,000 generators, oldest eligible, pause/grace/slot/capacity, no restart burst, bounded CPU/I/O/IDB and resource report without invented production rate allowances.
- [ ] Packaged persistent Firefox B: installed combined XPI, real `entry.mjs` registration, donor-fixed execution, UI lifecycle, alarm wake; assert adapter cannot be absent or null. Donor regressions included.
- [ ] Restore `pcms-required` green **at exact head** without weakening gates; investigate pre-existing Supply B `RENAME admission INVALID_PARAMS` independently and minimally if needed.
- [ ] Confirm reproducible build twice, XPI Gecko ID `persona-route-manager@local`, SHA-256 and exact HEAD/CI correspondence; no live H PASS claimed.

## Operator H-04 (outside coding-agent environment)

- [ ] Deliver short script for one explicitly approved, owned, listed generator: before source + feed, single safe marker save, independent source/visibility readback, redacted receipt, stop.
- [ ] Define independent provider-permissibility/efficacy evidence needed for scope-limited recurring activation. Feed appearance once ≠ guaranteed repeated rank.
- [ ] Provide in-XPI import/verify/promote/revoke path for legitimate H evidence; no second coding cycle required after successful proof.
- [ ] Keep H-series and protected governance acceptance **pending** until real operator evidence and independent review.

## Publish / stop

- [ ] Commit coherent increments via connected GitHub, verify remote branch HEAD/tree after each checkpoint, update this checklist with test IDs, observed outcomes and commit SHAs.
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
