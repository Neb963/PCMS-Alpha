# PCMS-Alpha — Stage 5 Final Verification Specification

**Date:** 2026-10-12  
**Revision:** Stage 5.7, design-audit candidate  
**Verdict:** **VERIFICATION DESIGN READY FOR OPERATOR SIGN-OFF — PRODUCT NOT VERIFIED.**  
**Authorization:** Read-only design/source audit. No production implementation, repository initialization/commit, new XPI, real provider mutation, local vault operation, restoration, or final ZIP was authorized or performed.

## 1. Decision and precise scope

The Stage 5.0–5.6 evidence inventory and failure-test design meet the *design* closure conditions in `PCMS-Alpha-Stage-5-Verification-Plan.md` §8: all U-01–U-16 and UX-01–UX-10 are mapped to safe fallback, owner and future evidence; 56 numbered fault-injection contracts and seven narrow operator procedures exist. **The operator has not yet explicitly accepted this Stage 5 final specification.** No new test in the matrix was executed as a PCMS integrated/emulated/packaged-Firefox test. The donor source/tests and September discovery have been inspected, not rerun. F1's *previous* one-generator operator-live PASS retains its narrow historical scope.

The product is **NO-GO for deployment, live automated Perchance mutation, automatic GitHub writeback, automatic mutating Refresher, or declaring migration/backup/release acceptance** until its corresponding Stage 6 gates pass. This is not a Stage 5 design blocker: safe disabled/held capability paths are defined, so no presently identified contradiction requires changing accepted Stage 1–4 product policy.

### Precedence (do not replace historic sources silently)

1. `PCMS-Alpha-Stage-1-Requirements-Audit.md` and `PCMS-Alpha-Stage-2-Behavior-and-Lifecycle-Specification.md` establish behavior and exclusions.
2. `PCMS-Alpha-Stage-3-F1-F2-Decision-Amendment.md` **supersedes** earlier PJS/HTML-only AI scope and writeback-order passages: native AI may alter generator-owned PJS, HTML and all `src/` assets; optional conditional GitHub writeback can precede individually approved *publication*.
3. `PCMS-Alpha-Stage-3-Minimal-Architecture.md` and `PCMS-Alpha-Stage-3-Working-Decision-Register.md` determine the minimal runtime, logical journal, roles, backup envelope and recovery controls.
4. `PCMS-Alpha-Stage-4-UI-UX-Specification.md`, `PCMS-Alpha-Stage-4-Decision-Register.md`, `PCMS-Alpha-Stage-4.7-Design-Audit.md`, and prototype v3.1 define **approved design**, not running product. Older “sign-off pending” text predates explicit operator acceptance on 2026-10-12.
5. The Stage 5 Evidence Register, Test and Failure Matrix and Operator Acceptance Plan specify **proof obligations**, not new product policy. This document fixes final gate order and reporting semantics, not new architecture.

## 2. One system, five authority boundaries

| Authority | Sole authoritative facts | Invariants the tests must falsify |
|---|---|---|
| PersonaMonkey donor | Stable Persona UID, actual Firefox container, protected route/native bridge, control lease, guarded browser execution | Never treat `cookieStoreId` as stable UID; no PCMS direct native/browser bypass or protected-to-Direct failover; revocation checked immediately before effect. |
| Perchance | Authenticated remote owner, saved generator source, actual listing state | Edit-key/collaborator permission is not owner; HTTP success is not independent readback; slug string does not prove immutable identity. |
| `Neb963/per-gens/main` | Pinned READY source and revisioned Git source folder | No READY on uninitialized `main`; multi-file Git commit does not atomically publish to Perchance; relevant drift halts, unrelated drift is independently revalidated. |
| PCMS IndexedDB/controller | Unique account/Persona bindings, intents, operation journal, snapshots, versioned approval, schedule, pauses/holds | Durable intent and `DISPATCH_POSSIBLE` **before** effect, independent observation for confirmation, atomic local claims, no blind ambiguous replay, no unsourced clock credit. |
| Human editor/operator | Unsaved draft ownership and exact final-source publication approval | Unknown/dirty editor blocks conflicting writes; human handoff must survive crash; approval binds exact F bytes, tests, source/owner/revision, not future changes. |

The runtime stays a **single combined Firefox XPI and one PCMS controller**. Donor routing/listener protection must initialize independently of failures in new PCMS IndexedDB. A single guarded same-XPI facade is the only route to PCMS provider browser actions. No second dispatcher/controller, hidden always-open keepalive tab, multi-machine leader election, generic plugin platform or replacement native router.

## 3. Evidence semantics and reporting rule

| Evidence status | Acceptable interpretation |
|---|---|
| `ACCEPTED_PRODUCT_DECISION` | Approved design or operator policy; never reported as an executed test. |
| `SOURCE_EVIDENCED` | Exactly pinned source/fixture behavior; not deployed PCMS behavior. |
| `HISTORICAL_OPERATOR_LIVE_PASS` | F1 only for one historical private-empty create/rename/readback and observed sampled recent-list absence; no present-day full provider guarantee. |
| `SIMULATED_PASS` | Future *actually executed* deterministic fake-provider test with independent effect ledger, assertions and fixture revision. None reported for Stage 5's new tests. |
| `PACKAGED_FIREFOX_PASS` | Future actual combined-XPI Firefox test with exact browser version, build checksum, crash/wake traces. None reported. |
| `OPERATOR_LIVE_PASS` | Future separately authorized operator observation with actual bounded target/evidence. None reported for the new tests. |
| `DEFERRED_UNTIL_IMPLEMENTED` / `NOT_TESTED` / `BLOCKED` / `INFEASIBLE` | Unperformed or unavailable proof, never implicit PASS. `FAIL` is an executed negative finding, not interchangeable with `NOT_TESTED`. |

**Each future PASS needs:** `requirementIds`, `testId`, run ID, evidence tier, exact commit+donor SHA, XPI SHA-256 where relevant, Firefox version+profile/test OS, fixture version, fault cutpoint, baseline/actual invariant, independent remote-effect oracle or observed provider fact, redacted trace, residual limitations, reviewer and timestamp. Redact cookies, raw URLs carrying tokens, source, full chat, session identifiers, recovery passphrases and native/private routing secrets. No substituted narrative receipts.

## 4. Portfolio accounting and completeness

| Family | IDs | Cases | Primary concerns | Source of oracle |
|---|---|---:|---|---|
| Runtime / security | P51-01–P51-08 | 8 | cold wake, guard/lease, sender, journal, human handoff, failure isolation, concurrency, restore guard | real packaged Firefox + independent fake-effect ledger |
| Perchance / AI | P52-01–P52-07 | 7 | owner versus editor, uncertain create/rename, slug reuse, complete bytes, attributable tests, fresh chat, dirty human tab | fixture/discovery + late narrow provider check |
| GitHub / publication | P53-01–P53-08 | 8 | empty `main`, path safety, READY drift, conditional atomic Git-only commits, ambiguous effect, opt-in writeback, approval, publish | Git emulator / conditional readback; separate publication oracle |
| Refresher / fleet | P54-01–P54-11 | 11 | evidenced time, 60-minute grace, fair queue, capacity, permissible effective refresh, alarms, outages, 1,000+ scale, counters, Pause | deterministic event clock + packaged load and optional provider proof |
| Backup / recovery | P55-01–P55-12 | 12 | authenticated archive, cut, vault, Downloads tiers/retention, restore guard, UID mapping, controller activation, emergency diagnostics | crypto fault fixtures + isolated Firefox/profile/host |
| Cross-system / UX | P56-01–P56-10 | 10 | five adversarial traces, partial batch, AI/Git drift, Core failure, accessibility, operator attention/checklist | mixed independent oracle, packaged Firefox, human UX |
| **TOTAL** | | **56** | **U-01–U-16, UX-01–UX-10** | **all Stage 5 newly specified cases NOT RUN** |

These are 56 **test contracts**, not 56 already created runnable tests. Maintain donor regressions separately and do not double-count repeated assertions when composing P56 scenarios. For full setup, fault injection, PASS, FAIL, fallback and artifact requirements see the numbered sections in `PCMS-Alpha-Stage-5-Test-and-Failure-Matrix.md`. The UX acceptance trace is §9.2 of that matrix. Historical discovery and F1 are not counted as new P52 PASS.

## 5. Minimal Stage 6 test-gated implementation order

**G6-0 — Authorized bootstrap and preserved donor baseline.** Only after operator authorization: initialize implementation repository `Neb963/PCMS-Alpha` (empty in Stage 5 audit), record pinned donor SHA `9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf`, retain Gecko ID/native-host compatibility and existing tests. Initialize private `Neb963/per-gens/main` only by a separate explicit authorized setup path; non-READY placeholder is *not* deployment permission. Lock local paths, transport and payload schemas by minimal observable contracts; keep every provider mutation disabled. **Exit:** reproducible combined build scaffold; donor regressions pass in their appropriate harness; provenance and rollback build references documented. No F1 retest.

**G6-1 — Guarded vertical slice / durable safety gate (first hard blocker).** Implement synchronous wake-critical listener registration with static fail-closed routing bootstrap, narrow same-XPI Persona facade, UID→current-container resolution, sender validation, independent restore guard and persistent IDB operation journal. Perform P51-01–P51-08, especially P51-01/02/03/04/05/06, and core portions of P56-05/08 on packaged Firefox. Fault injection must include event-page suspension, process restart, lease/route revocation, unreadable DB, duplicate alarms, human handoff, and non-Direct routing checks. **Exit:** proven fail-closed operation with no dashboard, no duplicate side effects and donor safe functioning under PCMS failure. Otherwise **all PCMS mutating features off**.

**G6-2 — Owner/source and reservation, read-only first.** Implement Perchance guarded read-only owner/inventory/source checks and canonical manifest, then journaled private-first reserve/rename plus no-replay reconciliation in emulators, after G6-1. Test P52-01–04/07 and P53-01/02/03/05, P56-06. GitHub association must tolerate empty repository and absent READY; successful remote reservation may be `SOURCE_PENDING`. **Exit:** every effect has confirmed or explicitly uncertain independent disposition. Existing F1 positive remains historical; only missing negative variants are newly tested. Unknown current owner ⇒ hold dependent mutation.

**G6-3 — Source test/release and conditional GitHub boundary.** Implement versioned PCMS Settings Chat 1 prompt, optional genuinely fresh TESTING.md Chat 2, evidence-recorded AI repair, all-byte saved-source readback and source-bound approval, full-source diff, manual/opted-in automatic **conditional** GitHub commits and separate publication. Test remaining P52, P53 and P56-01/07 using independent fake-provider and Git oracle before any operator-approved provider write. Require GitHub relevant-path/READY check after unrelated HEAD movement and before publish; no force push; AI text gives no privileged authority. **Exit:** no publication without independently verified final F, tests, owner/editor safety and individual required human approval. Unproven test evidence ⇒ hold. New public mutation is a later separately authorized operator check, never a Stage 6 CI default.

**G6-4 — Refresher, observability and fleet scale.** Only verified published generators can be admitted to mutating refresh. Only after G6-1 and minimum source/account integrity from G6-2: implement durable single queue, operational interval ledger, per-account grace, evidenced capacity/hysteresis, coalesced alarm reconstitution, shared list and adaptive stats polling, scoped Pause/holds. Test P54-01–11 and P56-02/03/10 at 50+ accounts / 1,000+ generators, synthetic 1,240+ UI rows. Profile CPU/RSS/heap, IDB bytes/quota, open tabs, concurrency, event-loop latency and queue ages, and establish numeric envelopes from measured hardware/browser runs **before rollout**, not invented in Stage 5. **Mutating Refresher stays disabled until a permissible, observably effective action passes P54-05**; monitoring/scheduling display may be separately enabled safely.

**G6-5 — Encrypted protection, staged restoration, degraded diagnostics.** Implement single authenticated encrypted archive with minimal nonsensitive header, vetted donor portable section, no exported WireGuard private configuration or auto-granted local Integration API trust, reliable passphrase recovery, optional narrowly scoped Secret Service helper, and bounded Download evidence/retention. Restore requires authenticated preview, verified pre-restore checkpoint, guard stored outside replaceable DB, dependency-group receipts, UID remapping and a nonmutating fresh-controller default; emergency diagnostics must work without Core. Test P55-01–12 and P56-04/08, including crashes after every group and locked vault. **Exit:** independently verified protection states; defer unattended backup if vault cannot safely unlock, and defer migration claims without H-06.

**G6-6 — Operator UI, integrated acceptance and scoped activation.** Wire approved six-destination Stage 4 design to canonical background state with monotonic revisions, immutable target/selection, actionable receipts and no optimistic external PASS. Run P56-01–10 as integrated suites, all UX-01–10, and operator H-01/H-07. Conditionally run H-02/H-03/H-04/H-05 only when the equivalent real-provider/host fact remains unknowable via safer evidence; H-06 required for any *migration/fresh-profile activation claim*. Enable each capability independently only after its safety and specific proof gate; a UI claim of general product acceptance additionally requires all critical gates and relevant human checks. **Do not collapse these slices into one big-bang cutover.**

**Phase names G6-0–G6-6 are proposed implementation/verification ordering labels, not a new operator-approved governance bureaucracy.** One person/agent may implement sequentially, using small reviewable changes; the required separation is evidence and activation fencing, not a fixed agent count or elaborate claim ledger.

## 6. Strict pass/block controls by capability

| Capability | Cannot enable before | Safe behavior while blocked |
|---|---|---|
| Any PCMS remote mutation | G6-1 packaged P51 fail-closed/dispatch/journal; route + sender checked | PCMS read-only, donor routing remains protected, independent diagnostic status. |
| Generator create/rename and provider source save | G6-1; P52 owner/slug/uncertainty guard; test of same logical operation after lost response | Existing confirmed reservations preserved; target-scoped `HELD_UNCERTAIN`; no retry/reslot. |
| GitHub source writes | G6-3 source equivalence, no human dirty editor, pinned relevant READY, conditional commit/readback, opt-in if automated | Review-only diff, queued proposal; no branch force. |
| Public listing / release | G6-3 independently tested final source and approval bound to exact bytes; fresh prepublish owner/source/READY/editor and unlisted checks | Remain unlisted/held, keep previous good; never turn AI suggestion into approval. |
| Mutating Refresher | G6-4 queue/clock/capacity **and independent permissible, effective refresh proof** | Keep mutation off; expose monitoring and reason. |
| Unattended backup | G6-5 archive integrity, safe recoverable key plus actual vault access, honest download tier | Suspend/notify; manual secured backup where supported; no plaintext fallback. |
| Destructive restore | G6-5 verified archive, checkpoint, durable restore guard, reviewed plan | Preview/read-only; no partial-apply optimism. |
| Fresh-profile controller activation | G6-5/6; verified old controller inactive and newly authorized owner/route/source binding | Remain `RESTORED_CONTROLLER_INACTIVE`. |
| Operator “fully accepted” status | Relevant G6 and packaged Firefox + late H cases, no mandatory failing or unknown safety gate | Label capability-scoped acceptance and outstanding tests. |

**Systemic no-go defects** independently stop the associated release path: protected-to-Direct fallback, duplicate/unauthorized external mutation, overwrite/closure of unknown human tab, unverified remote confirmation, stale-final-source publication, sensitive plaintext backup, leaked diagnostics, imported approval executing by default, or a second uncontrolled controller. Auxiliary failure (GitHub, vault, stats, UI tab) must not stop healthy unrelated Personas or donor protection if canonical PCMS state remains sound.

## 7. Operator acceptance: minimum, conditionality and safe limits

Source: `PCMS-Alpha-Stage-5-Operator-Acceptance-Plan.md` H-01–H-07. **H-01** packaged Firefox keyboard/AT/usability and **H-07** evidence-accurate guided checklist/Markdown are required for overall UI/operator acceptance. **H-06** is mandatory **only to claim working fresh-profile migration/activation**. **H-02** authenticated owner continuity, **H-03** native AI full-source/testing, **H-04** legitimate effective Refresher, and **H-05** actual Fedora KDE vault/download byte-readback are **conditional on capability being enabled and residual fact not proved safely otherwise**. If not run/provable, hold only that dependent capability; do not label it accepted.

All live provider writes require a separate, explicit target/side-effect authorization, pre-passed fake/packaged safety gates and a disposable owned target. No credential sharing, challenge bypass, unattended bulk trial or repeat of already-passed F1 discovery. User-supplied acceptance results are recorded with `PASS`/`FAIL`/`NOT_TESTED`/`BLOCKED`/`NOT_APPLICABLE` and honest tier.

## 8. Deliberately open technical feasibility risks

| Priority | Fact not yet demonstrated | Decision point and bounded fallback |
|---|---|---|
| **Critical** | Firefox cold-wake of post-recovery event listeners in donor integration (U-09) | Implement synchronously registered wake facade; prove in packaged Firefox; no remote PCMS mutation until PASS. Current source shows a risk, not a confirmed donor defect. |
| **Critical** | Exact full-source/AI-test evidence under actual evolving provider (U-05/U-06) | Native AI full-generator access is allowed *by decision*, not proven in every provider situation. Unsupported/ambiguous assertions are unverified; no publication and no automatic writeback until evidence is sound. |
| **Critical for Refresher** | Permissible effective remote refresh, independently observed in feed (U-10) | No spam/no-op simulation; keep mutating Refresher off until proven. Planning demand 250 under 1,000×24/72 example ≠ guaranteed recent-list capacity. |
| **Critical for unattended backup** | Secure recoverable passphrase and KDE Secret Service native access (U-11) | Request unlock or suspend unattended job; never retain plaintext credentials to keep a schedule green. |
| **Critical for restore** | Cross-store consistent checkpoint + staged safe resume + old controller inactivity (U-12/U-16) | No destructive import without checkpoint and independent guard; new profile remains nonmutating without explicit verified activation. |
| **Critical for retention claims** | Firefox Downloads file verification/deletion constraints (U-13) | Report constructed / download-completed / disk-hash tiers separately; tracked-only cleanup; never claim disk-byte proof without reread. |
| **Capacity** | Real 50+/1,000+ Firefox footprint and provider rate limits (U-15) | Record benchmark envelope under fake provider; bound tabs/requests and shed load rather than invent unsupported SLOs. |

The operator need not resolve these now because the accepted fail-closed alternatives make implementation possible without risking data or accounts. A confirmed impossibility *without* safe fallback in Stage 6 must be escalated as a new bounded product decision, with evidence and least-change options.

## 9. Stage 5 closure checklist and disposition

- [x] Reconciled controlling accepted policy, including F1 historical scope, F2 full-source supersession and Stage 4 sign-off.
- [x] Identified pinned donor/security/backup behavior and distinct historical provider observations; did not convert source inspection into a test pass.
- [x] Classified U-01–U-16, mapped UX-01–UX-10, and wrote 56 hypothesis/fault/PASS/FAIL/fallback contracts.
- [x] Documented independent effect ledger, exact build and redacted test evidence schema.
- [x] Defined small, conditional operator tests and hard stops for high-risk actions.
- [x] Prioritized a staged Stage 6 construction and per-capability go/no-go rules.
- [ ] **Explicit operator acceptance of Stage 5 final verification-design package.**
- [ ] All future runtime and provider evidence: **Stage 6, not a Stage 5 close precondition.**

**Stage 5 technical closure recommendation:** **READY FOR DESIGN SIGN-OFF**. **Stage 6 implementation authority and production/live deployment authority remain separate and ungranted.**

## 10. Artifact map

- `PCMS-Alpha-Stage-5-Evidence-and-Unknowns-Register.md` — U-01–U-16 source/evidence and risk inventory, updated through Stage 5.7.
- `PCMS-Alpha-Stage-5-Test-and-Failure-Matrix.md` — 56 numbered adversarial contracts and UX-01–UX-10 assertions, updated through Stage 5.7.
- `PCMS-Alpha-Stage-5-Operator-Acceptance-Plan.md` — H-01–H-07 manual checks, with mandatory/conditional distinctions.
- `PCMS-Alpha-Stage-5-Decision-Register.md` — provenance-preserving decisions and true unresolved implementation facts.
- `PCMS-Alpha-Stage-6-Implementation-Handoff.md` — executable coding-agent brief for future **authorized** implementation, without assuming code or a populated repo exists.
