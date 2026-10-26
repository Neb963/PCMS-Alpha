# PCMS-Alpha — Startup, actionable holds and automatic-workflow gap audit

**Audit date:** 2026-10-26 · **Baseline:** `main` `06ccf102097e238154fef51787269c398ee6b1b0` (v1.2.16; PRs #61/#62 merged) · **Type:** repository-only, no production code, routing or live provider changes.

**Authority:** [accepted client contract](../authority/PCMS-Alpha-CLIENT-SPEC-v1.0.0.md), especially C-02, C-04, C-07–C-09, C-16, C-20, C-24–C-25, C-37–C-39, plus [browser-only amendment](../authority/PCMS-Alpha-CLIENT-AMENDMENT-v1.0.1.md) and [J01–J07 program](../implementation/OPERATOR-JOURNEYS-2026-10-24.md). The native PersonaMonkey Mullvad bridge is the **only** permitted OS helper. Distinguish accepted behavior from code presence, simulated tests and verified real operation.

## Method / evidence labels

Investigate one subsystem at a time. For each finding: operator symptom, exact source and trigger, which part is **CONFIRMED CODE**, **OBSERVED UI**, **INFERRED RISK**, or **NEEDS REAL PROOF**, affected contract and acceptance test. Do not substitute green D/B checks for host H or live L proofs. Do not mistake an intentional safety fence for an unnecessary barrier. No fix or merge in this audit. Historical I17 uncertain operation and slug `pcms-test-esr-chain-20261015-a01` remain quarantined—no automatic CREATE/RENAME/replay.

## Verified findings (append as investigated)

### GAP-01 — No PersonaMonkey-first startup readiness barrier (P0)

**Status:** CONFIRMED CODE ordering gap; specific frequency/severity in the user's environment still NEEDS H proof.

**Operator symptom:** On opening Firefox/PCMS, route-dependent accounts show *Route needs attention* after the Mullvad helper/tunnel/proxy was still initializing. User later restored PersonaMonkey manually. Readiness errors may therefore be upstream dependency symptoms rather than independent module failures.

**Source trace:**
- `donor/personamonkey/extension/lib/recovery-bootstrap.js:98–126` launches asynchronous donor bootstrap and protected recovery; fail-closed listeners are registered first.
- `src/runtime/entry.mjs:9–54` statically imports separate PCMS coordinator, Accounts, creation, Git, AI and release boundaries; it has **no shared awaited route-readiness transition** between donor bootstrap and route-dependent worker scheduling.
- `src/runtime/account-boundary.mjs:298–329` configures guarded account upkeep at **1 minute delay, then 10 minutes**, but only as its own alarm. `src/runtime/creation-watch.mjs:120–127` starts its own queue tick on registration/startup independently.
- `src/runtime/overlay.mjs:99–116` already distinguishes unresolved native preparation and status failures, so *routing fail-closed* exists; that is **not** the same as orderly readiness and resumption.

**Defect:** No coordinated lifecycle `donor restored → native service ready → tunnel/proxy reachable → protected account route/exit positively verified → eligible dependent PCMS workers resume`. Ad hoc isolated worker alarms may observe transient not-ready and create unrelated-looking holds; no single bounded startup reconciliation cycle guarantees progression or a compact global UI indication.

**Required correction/acceptance:** Implement bounded, cancellable/fail-closed **readiness coordinator** using PersonaMonkey's sole authority; recover automatically where safe with backoff and observable status. Route-dependent effects wait for verified account-level egress; local Git, account record browsing, backups and unrelated tasks remain available. Test helper down / tunnel up + SOCKS down / delayed ready / restart / multiple Personas / one route held / no Direct bypass. Automatic remote-effect retry only after independent safe reconciliation, never blindly.

### GAP-02 — Historical generator-create prerequisite is not solvable from its Work Queue detail (P0)

**Status:** OBSERVED UI, CONFIRMED CODE mapping gap; original provider circumstance remains unknown.

**Operator symptom:** Current v1.2.16 screenshot: one Work Queue row *Generator creation · Prerequisites failed*, with saved operation `supply_create_v1`, `PREFLIGHT_FAILED`, reason `TEMPLATE_SOURCE_UNVERIFIED` and legacy slug `pcms-test-esr-chain-20261015-a01`. Actions: **Open account / Check saved status / View current queue**. None addresses source-template verification itself.

**Source trace:**
- `src/runtime/operation-context.mjs:19–44` reads historic failure/provenance, returning `RECORDED_NO_DISPATCH` only on stringent matched source/ACK/event evidence. This is a useful safeguard, not proof the current template works.
- `src/ui/faithful/bridge.mjs:1200–1266` renders recorded detail and a generic fallback for unrecognized reason codes; `TEMPLATE_SOURCE_UNVERIFIED` has no targeted remedy; it redirects to account/queue.
- `src/runtime/perchance-supply.mjs:121–144` currently reads and validates Perchance's `minimal` template and ownership before a guarded private empty CREATE. The current adapter's failure codes include `TEMPLATE_UNVERIFIED` / `TEMPLATE_OWNER_UNVERIFIED`; the **different historical code** cannot be assumed to identify a presently failing adapter.

**Defect:** A prominent *Needs action* work item presents no solution for the actual recorded reason, obscures historic vs current status and source-readiness recheck, and risks inviting irrelevant account changes. It also appears as current work although preserved historical no-dispatch evidence may warrant distinct treatment.

**Required correction/acceptance:** Classify and explain template/provider failures using source provenance; provide a narrowly scoped **read-only current template check** and contextual guidance **for new authorized work only**, not a replay command. Keep the I17 operation and slug permanently fenced pending explicit resolution. Verify old/missing-source, changed Perchance response, template ownership denial, read-only recovery result and proper non-replay. Distinguish recovered capability from resolved historical journal item.

---

### GAP-03 — Unmapped incident classes navigate to an unrelated Work Queue search (P0)

**Status:** CONFIRMED CODE; precise incidence depends on stored incident target availability.

**Source:** `src/runtime/journal.mjs:280–283` accepts 11 notice codes. `src/ui/faithful/attention.mjs:9–16` maps four fallback classes to Accounts/Settings, but otherwise returns `{kind:'INCIDENT',id:n.scopeId}`. `src/ui/faithful/bridge.mjs:1273–1288` responds to all unmapped kinds by filtering Work Queue by that ID. Queue search in `bridge.mjs:656–678` asks operation/release/AI records, **not a typed remediation handler for each notice class**.

**Concrete missing fallbacks:** `SOURCE_HELD`, `CANONICAL_UNAVAILABLE`, `OPERATION_UNCERTAIN`, `GIT_FOLDER_MISSING`, `GIT_FOLDER_RENAME_REVIEW` (when no valid explicit target). Even with a valid target, a route to the right page is not proof that the page exposes the required action. The storage-unavailable class cannot be repaired merely by searching operation rows.

**Required acceptance:** A generated machine-readable matrix of **every notice code × target present/absent × current state** → relevant contextual page, root-cause explanation, working remedy or declared safe hold. Verify navigation to actual control and its resulting readback; no empty queue dead end. Deduplicate shared upstream failures.

### GAP-04 — Healthy shared helper does not reconcile a stale account route failure (P0)

**Status:** CONFIRMED CODE; observed Oct 25 account symptom consistent; exact user's current bridge reachability NEEDS H proof.

**Source:** `src/runtime/overlay.mjs:163–167` provides a fresh **host-wide** `inspectConnection()` (installed/tunnel/proxy booleans). `src/ui/faithful/accounts-workspace.mjs:171–178` offers **Check connection**, but on success it **only changes a feedback string** saying to retry route verification; it does not request bounded automatic route reconciliation or update account state. `src/runtime/account-boundary.mjs:91–95,179–190` projects persisted `route.code` unless its stored route status is PINNED; `src/ui/faithful/accounts-workspace.mjs:145–149` displays that historical code before more recent local readiness guidance.

**Defect:** The UI can report a recovered helper while the account still shows the old helper failure and a separate manual action is required, with no integrated state transition. A **host ready** observation is NOT a verified specific Persona/exit: automatically schedule/check the correct pinned route, then clear the old error only when new protection is committed. Do not simply mask a real held route.

**Acceptance:** Helper down → tunnel/proxy recover → fresh account-specific protected egress and principal facts → route status updated → stale code gone; negative when shared helper is ready but one account exit remains unsafe. No operator forced to visit PersonaMonkey settings for ordinary transient recovery.

## Investigation queue

1. Donor bootstrap and native-host/tunnel/proxy recovery state.
2. Protected Accounts route upkeep, command concurrency and startup gating.
3. **All** actionable-status producers versus UI destinations/handlers.
4. Creation/template/inventory and historical-vs-current batch effects.
5. Git/READY/AI/release/Refresher/backup background autonomy and restart.
6. Whole primary UI: hidden/unavailable controls, stale status, lack of recovery.
7. Adversarial coverage/evidence-tier assessment and prioritized implementation handoff.

## Change log

- 2026-10-26: Initialized with GAP-01 and GAP-02 from operator screenshots plus current source verification.
- 2026-10-26: GAP-03 verified by code-to-UI notice destination trace.
- 2026-10-26: GAP-04 verified against donor connection read and persisted account projection. Subsequent sections will be appended after each subsystem inspection.
