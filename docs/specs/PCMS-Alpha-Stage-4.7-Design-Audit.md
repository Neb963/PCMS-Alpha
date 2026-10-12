# PCMS-Alpha — Stage 4.7 Final Design Audit and Acceptance Handoff

**Audit date:** 2026-10-12  
**Status:** Stage 4.7 design/consistency audit completed. **Final Stage 4 operator sign-off pending.**  
**Reviewed prototype:** `PCMS-Alpha-Stage-4-UI-Prototype-v3.1.html` (single-file, synthetic, no provider operations).  
**Design authorities:** Stage 1 Requirements Audit, accepted Stage 2 Behavior/Lifecycle Specification, Stage 3 F1/F2 Amendment, Stage 3 Minimal Architecture and Decision Register, UI-Q01–UI-Q49. Where text conflicts, explicit F1/F2 supersession governs.

## 1. Verdict and evidence strength

**Design readiness:** Sign-off candidate. The accepted UI workflows and safety/authority boundaries are represented by documented screens and local simulation. The prototype cannot demonstrate actual provider behavior, end-to-end durability, non-mutating restore in Firefox, or WCAG conformance. The user has not yet explicitly accepted this final revision.

| What is being assessed | Disposition | Basis |
|---|---|---|
| Six-screen information architecture and task grouping | Covered by approved design + interactive fixture | UI-Q01–UI-Q49, prototype |
| 50 accounts / 1,000+ generators in the UI | Synthetic rendering and paging exercised | 52 accounts, 1,240 generator fixture; no production load measurement |
| Durable and cross-provider behavior | Specified, **not executed** | Stage 2/3 authority and recovery invariants, UI states |
| Private-first Perchance create/rename | Prior F1 operator-observed evidence only | Accepted Stage 3 amendment; no re-test in Stage 4 |
| Native AI source scope | Full generator permitted by accepted F2 amendment | Behavioral decision, not browser-helper capability proof |
| Visual/UI regressions | 19/19 workflow+viewport, 23/23 negative/safety, 11/11 targeted Stage 4.7 checks passed | Chromium headless synthetic tests; code and DOM inspected |
| Packaged Firefox behavior | OPEN | Stage 5 obligation |
| Screen-reader and WCAG 2.2 AA conformance | OPEN | Candidate targets and static checks are not a certification |
| Final operator sign-off | PENDING | Requires review of v3.1 and final design documents |

## 2. Stage 4.7 issue register

| ID | Severity | Finding | Correction / disposition |
|---|---|---|---|
| QA-47-01 | Medium | CSS used undefined `--surface` (3 sites) and `--surface-2` (2 sites). Invalid backgrounds could affect skip-link visibility, synthetic evidence preview, loading skeleton and update notices in light and dark theme. | **FIXED in v3.1:** use defined `--paper` and `--sidebar`. Checked backgrounds in both themes. |
| QA-47-02 | Medium | Skip-to-main link was appended after normal topbar controls, rather than providing the initial keyboard shortcut; it did not fulfill the agreed keyboard access behavior. | **FIXED in v3.1:** skip link inserted as first body child, main made focusable as target. First-Tab keyboard test passed. |
| QA-47-03 | High if production | Earlier v2 had unlabeled conditional blue dialog button due to CSS overriding `hidden`. | Corrected in v3, **reverified** in v3.1. Hidden conditional action does not occupy a dialog position. |
| QA-47-04 | Boundary | Prototype exports are synthetic fixture Markdown/JSON, not trusted acceptance evidence or redacted production ZIP. | Accurately labeled; **Stage 5 implementation/proof obligation**, not a defect to paper over in prototype. |
| QA-47-05 | Boundary | Human tab dirty state, true route readiness, full asset readback and independent diagnostic exporter are provider/browser dependent. | No simulated green check is accepted as provider PASS; **Stage 5**. |
| QA-47-06 | Boundary | Prior v3 QA used Chromium, not pinned Firefox Developer Edition or assistive tech. | Report clearly labels evidence and adds explicit packaged-Firefox and accessibility gates. |

**Open prototype-blocking defects found by this pass:** none in the tested paths after the fixes. This statement is bounded to tested synthetic interactions; it does not claim absence of every bug.

## 3. Requirement traceability and scope coverage

| Accepted source / requirement family | Design surface and evidence | Residual Stage 5 dependency |
|---|---|---|
| Stage 1 REQ-A01–A08: dedicated Persona, enrollment, identity, challenges, discovery, archive | Accounts, guided Enrollment/Repair, Persona uniqueness and manual override fixture, discovery | Guarded real account/route/owner evidence, in-place migration |
| Stage 1 REQ-G01–G12: unified generators, reservation, GitHub binding, adoption, bulk | Generators inventory, Supply, GitHub-first association, Consent, receipts and source inspector | Remote create/rename ambiguity, owner/collision proof, conditional folder commits |
| Stage 1 REQ-D01–D12 + Stage 2 §4 + F2 amendment | Work Queue, release timeline, two chats, full PJS/HTML/src diff, exact source review, manual/auto writeback, individual approval | AI evidence and saved-byte proof, editor conflicts, conditional GitHub write and publish readback |
| Stage 1 REQ-R01–R10 + Stage 2 §5 | Refresher capacity/queue, evidenced budgets, age/confidence, scoped Pause/hold, active/sleep controls | Firefox clock evidence, capacity estimator, accepted refresh technique, adaptive monitoring |
| Stage 1 REQ-U01–U06 | Six-workspace shell, keyboard/inspectors, attention, notifications, bulk flow, checklist | Packaged Firefox accessibility/performance and operator acceptance |
| Stage 1 REQ-X01–X08 + Stage 2 §6 | Vault and backup policy, encrypted-archive evidence tiers, restore stages, inactive controller, emergency exporter fixture, manual checklist | Actual crypto/vault, downloads, restore crash, independent redaction path |
| Stage 2 §§2,3,7: owner-of-facts, journaling, scoped holds, conflicts | Independent status grammar, operation receipts, authority-specific source comparison | IDB journal, remote readback, runtime arbitration and no-blind-replay tests |
| Stage 3 §4–5: one XPI, same-XPI Persona guard, PCMS IndexedDB | Controller health/status strip, guarded action eligibility and degraded diagnosis | Typed runtime/guard bootstrap/DB migrations in packaged Firefox |
| UI-Q01–UI-Q49 | Navigation, search, inspectors, table customization, temporal feedback, responsive and keyboard components | Operator visual sign-off; implementation-specific WCAG checks |

**No new product requirements were introduced in the audit.** The changes to skip-link placement/theme tokens repair compliance with already accepted accessibility and appearance decisions.

## 4. Adversarial design review

### 4.1 One generator / release provenance

**Scenario:** G is sleeping with 22 evidenced hours remaining. An existing READY candidate is staged only after unlisting; AI changes main code and `src/`, saved final F passes supported tests; a human opens the editor and modifies unsaved content; GitHub meanwhile receives a relevant new commit.

**Pass at design level:** The release surface separates previous good P / pinned source A / final tested F / current GitHub revision and editor status. Dirty/unknown human editor or relevant GitHub change blocks publication and source writeback, retains the old candidate, and names the exact recovery action. UI does not reset sleep budget and does not silently force a write.

**Still unverified:** Native AI chat controls and test provenance, complete asset readback, real dirty-editor detection and durable release fingerprinting.

### 4.2 Fifty accounts / protected-route failure

**Scenario:** Protected route fails for Account 17; 12 of its generators occupy slots. Other 49 accounts remain healthy, and a new Persona rebinding is later requested.

**Pass at design level:** Group incident only when common cause is evidenced; show affected generator/account count with drill-down. Account-scoped hold freezes affected active budgets. Refresher preserves 60 evidenced-operational-minute grace, then releases occupancy without resetting unfinished budgets or stable priority. Route recovery cannot clear operator Pause. Persona rebinding invalidates dependent verification/approvals; no implicit Direct fallback.

**Still unverified:** Actual route failure discrimination, Persona uniqueness across donor state, browser/clock observations and status rehydration.

### 4.3 One thousand generators / throughput and capacity

**Scenario:** 1,000 generators, nominal 24h/72h demand target 250, defensible observed cap 200, occupancy 195; cap then drops to 180; 40 new user slugs reserve while GitHub unavailable; Firefox restarts.

**Pass at design level:** The UI separates planning demand, cap, occupancy and observed recent-list presence. It doesn't evict 195 active prematurely, stops admissions, shows per-slug confirmed Perchance reservations and outstanding GitHub folder work, and never resubmits uncertain create/rename. It supports paging/saved filters, persistent cross-page bulk selection, stable identity and eventual rerender without forced focus/row movement.

**Still unverified:** Scheduler throughput/memory/IndexedDB bounds, genuine capacity inference, rate limits and Firefox alarms/cold-wake behavior.

### 4.4 Restore crash / prior authority

**Scenario:** Encrypted backup contains historical release approval and may-have-completed remote GitHub work; restored to a fresh Firefox profile; one Persona remap/import incomplete; original controller may still be active.

**Pass at design level:** Restore workspace shows partial phase receipts, invalidates stale plans when destination/import mode changes, requires verified checkpoint, distinguishes past approval from new authority, blocks activation until identity/session/route mapping and previous controller conditions are satisfied, and exposes read-only diagnostics under Core failure.

**Still unverified:** Keyring, archive authentication, cross-store consistency, UID/cookie remapping, safe nonmutating activation after restart, actual degraded exporter independence.

## 5. Accessibility and layout review

| Test | Evidence / disposition |
|---|---|
| First Tab to Skip link | **FIXED and re-tested**: first keyboard stop now visible on focus; destination is focusable |
| Modal conditional action and Escape | Verified hidden primary remains absent; dialog changes `aria-hidden` while open; Escape closes |
| Light/dark token semantics | Undefined background variables eliminated; preview and loading surfaces have explicit backgrounds |
| Viewport fit 320, 390, 800, 1280, 1440, 1920 CSS px | Document-level horizontal overflow check passed; technical tables allowed labeled internal scrolling |
| Keyboard selection, focus restoration, form validation | Selected synthetic flows passed; further packaged Firefox and screen-reader passes required |
| Contrast/accessibility | Candidate text/semantic colors reviewed, but complete WCAG 2.2 AA audits and target-size tests remain OPEN |
| RTL/CJK and long slugs | Scenario fixtures and wrapping/truncation present; comprehensive translation and bidirectional text QA remains OPEN |
| Large fleet and dynamic order | 1,240-item fixture and paging exercised; true asynchronous backend race prevention remains Stage 5 |

## 6. Stage 5 handoff, in dependency order

1. **Security and boot:** PersonaMonkey guarded same-XPI execution, route fail-closed, Firefox event-page cold wake and UI sender validation (U-01/U-07/U-09).
2. **Durable local authority:** IndexedDB transactions, intent-before-dispatch journal, quota/schema failure and cross-view revision fencing (U-08/U-09/U-15).
3. **Provider/source contract:** Account/owner, private-first create/rename ambiguous return, full-generator source bytes and native AI evidence, conditional GitHub writeback (U-02–U-08). Do not repeat F1's already passed exploratory happy-path live test.
4. **Fleet/Refresher:** 50-account route failure, 1,000 generators, time accounting, cap hysteresis, recent-list observations and legitimate refresh method (U-09/U-10/U-15).
5. **Protection and accessibility:** Encrypted archive/vault, Downloads limitations, restore crash/fresh activation, independent degraded diagnostics and Firefox keyboard/screen-reader assessment (U-11–U-16).

For each, retain the distinction **source-evidenced / deterministic simulated PASS / packaged-Firefox PASS / operator-live PASS / unverified**. Development tests must not automate live Perchance, Mullvad or Cloudflare. UI acceptance requires explicit operator evidence and must not be inferred from the design mockup.

## 7. Sign-off recommendation

**Recommend operator review/sign-off of the Stage 4 design candidate**, using the corrected v3.1 prototype and controlling UI/UX specification. Approve only the UI design/interaction contract. Do not approve production implementation or mark U-01–U-16 verified on that basis.

**Files:**
- `PCMS-Alpha-Stage-4-UI-Prototype-v3.1.html`
- `PCMS-Alpha-Stage-4-UI-UX-Specification.md`
- `PCMS-Alpha-Stage-4-Decision-Register.md`
- `PCMS-Alpha-Stage-4.7-Design-Audit.md`

**Operator approval status:** PENDING; no default or implied final sign-off.
