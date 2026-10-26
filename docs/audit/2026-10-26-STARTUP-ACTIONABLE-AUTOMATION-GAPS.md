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

### GAP-05 — No event-driven shared-helper recovery; an otherwise recoverable account may wait for the next periodic sweep (P1)

**Status:** CONFIRMED CODE delay/topology; measurable latency NEEDS runtime proof.

**Source:** `src/runtime/account-boundary.mjs:323–329` creates `pcms-s01-route-upkeep` after 1 minute, recurring every 10 minutes; its only route-upkeep dispatch is the alarm callback. `src/runtime/enrollment.mjs:577–616` includes genuine automatic repair and inventory/reverification logic. `src/runtime/overlay.mjs:163–167` can re-read native readiness. **No source path observed subscribes to donor native-helper/tunnel recovery to immediately schedule account route reconciliation.**

**Effect:** The code already has *some* automatic route recovery; the defect is **not** “no retry implementation.” A transient host outage that ends immediately after one failed sweep may retain account holds until another periodic sweep (and dependency failures may arise sooner). A button labeled *Check connection* obtains new shared status but does not schedule a protected account-specific follow-up.

**Required acceptance:** On observed host change/recovery, coalesce a bounded, independent `upkeep` wake (with jitter/backoff and safe constraints), not a burst of unsafe route preparations. Verify 1/3/50 account fairness, no duplicate native prepares, no unverified exit reuse, and keep the ordinary 10-minute fallback.

### GAP-06 — READY/AI/Git/publication progress shares a single serial alarm chain (P1)

**Status:** CONFIRMED CODE isolation weakness; a specific rejected/hung worker causing starvation is INFERRED RISK and needs an adversarial test.

**Source:** `src/runtime/catalog-watch.mjs:193–204` calls `progressReady`, `progressChanges`, `progressWriteback`, `progressCleanBulk`, and `progressPublication` with **sequential `await`** inside one `Promise.resolve().then(async ()=> ...).catch(()=>{})`. A rejection stops all later steps for that wake; a promise that fails to settle prevents later progress entirely. C-16/C-39/C-43 and J03/J04 require autonomous independent work/recovery.

**Required acceptance:** Reproduce rejection, timeout, pause and route hold in each stage and prove unrelated stages progress; each stage owns bounded independently observable outcome, own durable rescheduling and no duplicate external effects. Do **not** naively `Promise.all` mutually exclusive source writers—the repair must preserve dependency ordering **per slug** while isolating unrelated slug/account work.

### GAP-07 — Creation watcher serializes all selected items behind the slowest item (P1)

**Status:** CONFIRMED CODE sequencing; permanent starvation from a nonsettling provider/native call is a testable RISK, not a proven incident.

**Source:** `src/runtime/creation-watch.mjs:61–107` selects at most eight runnable intents then `await runner.step(item.intentId,item.revision)` for **each item serially** (`:95–102`), with a coalesced in-flight `pending` promise (`:20,26,116–118`). There is a fairness cursor and explicit 5-minute failed-attempt suppression (`:81–94`), but **no per-item deadline at the watcher boundary**. `src/runtime/creation-runner.mjs:31–100` has multiple awaited route, IDB, source and protected provider steps. A single unresolved promise can delay later accounts and future ticks.

**Required acceptance:** Test slow/hung route setup, an ambiguous create ACK, one I17-quarantined item and 1,000+ unrelated safe entries. Ensure the watchdog produces a durable, truthful held/timeout record while other eligible items progress, maintaining account routing, one-writer and no-replay constraints. Do not confuse limiting work to eight items per turn with completed independence.

### GAP-08 — Turning on standing AI-development authorization may not start its automatic scheduler until a later startup (P0)

**Status:** CONFIRMED CODE missing activation wake; test must reproduce actual late authorization on a newly installed/profile-restored XPI.

**Source:** `src/runtime/ai-boundary.mjs:723–742`: `schedule()` **returns immediately** while `effectGate({phase:'I10',step:'AUTOMATION'})` is false; the only explicit calls are registration, Firefox `onStartup`, and `onInstalled`. `src/runtime/ai-boundary.mjs:761–763` binds that gate to current `standingS06.gate('development')`. `src/runtime/s06-standing-authority.mjs:85–110,133–135,179–208` permits grant updates and watches storage changes, but **does not schedule the AI alarm when development transitions from false to true**. Search of the repo found no other references to the `pcms-i10-progress` alarm.

**Defect:** An ordinary user enabling development after startup can have authorized queued jobs but no automatic `AI_PROGRESS_ALARM` registered; current `tick()` only runs from that alarm. Restart may incidentally mask this defect. This contradicts automatic post-READY development (C-16, C-43–C-46). **Do not work around it by instructing the user to restart Firefox.**

**Required acceptance:** Explicitly test no grant at boot → user grants development in UI → alarm established/one guarded progress turn → restart persistence, and off→on again; revoke immediately prevents further effects. No duplicate AI native send, no forced per-job Start and no invented AI pass.

### GAP-09 — Route-probe timeout does not bound the whole native-preparation promise (P0)

**Status:** CONFIRMED CODE deadline coverage gap; indefinite real native-host behavior NEEDS H proof.

**Source:** `src/runtime/overlay.mjs:77–87` creates an abort timer at 30 seconds but does **`await pcmsProbeExitsWithinDeadline(...)`** before examining `signal.aborted`. Inside that function (`:89–113`), `await mullvadRuntime.resolve(route,{fresh:true})` occurs **without passing the AbortSignal**. The helper may perform native prepare; `src/runtime/native-prepare-overlay.mjs:45–78` sets a separate 45-second native request deadline and deliberately treats ambiguous completion as uncertain. `src/runtime/enrollment.mjs:64–96` keeps the per-account `running` lock until the promise settles; `src/ui/faithful/accounts-workspace.mjs:47–50,150–156` disables incompatible account controls while it is active.

**Effect:** A 30-second abort guarantees a **signal**, not a 30-second settlement of the account task; slow/noncooperative nested waits can extend the `working` UI and postponement of human actions. Naively racing and dropping a possibly dispatched native action would be **unsafe**.

**Required acceptance:** Bound *observational* waits and report a visibly timed-out status; preserve native preparation intent and readback quarantine for ambiguous effects, and separate cancellable read-only checks from in-flight mutation locks. Test intentionally nonsettling mock native prepare, late native ACK and Firefox restart; never start a conflicting preparation or route change before an independent settlement.

### GAP-10 — Legacy dashboard scripts still run and contain superseded credential/backup remedies (P1)

**Status:** CONFIRMED PACKAGE/UI composition; whether the hidden legacy controls are reachable by a normal user is unverified.

**Source:** `src/ui/index.html` imports `operations.mjs`, `accounts-view.mjs`, `s08-diagnostics.mjs`, `v015-faithful.mjs` **and** `faithful/bridge.mjs` in one page, with a `pcms-legacy-return` control. `src/ui/operations.mjs:17–22` still says `BACKUP_FAILED` should be fixed by installing a native host/unlocking a keyring, and `GIT_RECONNECT_REQUIRED` by unlocking a keyring. Both contradict the explicit [browser-only amendment](../authority/PCMS-Alpha-CLIENT-AMENDMENT-v1.0.1.md). That script registers its own refresh and visibility listeners (`:100–106`), not just static unused markup.

**Defect:** A hidden or fallback secondary UI still executes, with obsolete operator instructions and a second way to report incidents. At minimum, this is a maintainability/provenance and UI-consistency defect; do not claim that the primary visible Work Queue currently shows the keyring text.

**Required acceptance:** One primary status/action controller, no obsolete native-host/keyring messages anywhere in an accessible UI/notification path. Legacy data migrations/readers may remain only as isolated noninteractive compatibility code; remove or disable duplicate UI workers only after proving their live side effects and regression scope.

### GAP-11 — Browser-native Git failures still masquerade as a removed OS vault/keyring dependency (P1)

**Status:** CONFIRMED CODE misleading diagnostic nomenclature, not a claim that Git itself fails.

**Source:** `src/runtime/catalog-watch.mjs:3,28–39,47–57` calls `browserGitCredentialPacket` but marks a missing/failed browser read as `GIT_VAULT_UNAVAILABLE`; its notice resolver uses `GIT_VAULT_CREDENTIAL_READ` as the recovery evidence label. `src/ui/operations.mjs:21–22` (the separately loaded legacy UI) instructs the operator to unlock a keyring. The [client amendment A/D](../authority/PCMS-Alpha-CLIENT-AMENDMENT-v1.0.1.md) explicitly removes OS vault and keyring, and forbids extra native service prerequisites.

**Defect:** Missing browser-stored token, temporary IndexedDB failure and remote Git permission loss are distinct root causes, but the observer conflates one class with an obsolete external vault. A routine action may be blocked with no truthful local remedy.

**Required acceptance:** Distinguish *unconfigured Git*, *browser credential inaccessible*, *token rejected*, *remote repository identity mismatch*, *network unavailable*, and *temporary locked/unavailable local store*. Reconnect only when necessary, preserve token and source scope; notices must clear after observed recovery, without prompting for native keyring.

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
- 2026-10-26: GAP-04 verified against donor connection read and persisted account projection.
- 2026-10-26: GAP-05 verified: periodic recovery exists but lacks host-ready event wake.
- 2026-10-26: GAP-06 confirmed from serialized READY alarm dispatch; starvation consequence requires adversarial evidence.
- 2026-10-26: GAP-07 confirmed sequential creation queue tick; nonsettling-operation case needs B stress.
- 2026-10-26: GAP-08 confirmed by grant-transition versus AI alarm call-site audit.
- 2026-10-26: GAP-09 verified timer does not bound awaited native/route preparation settlement.
- 2026-10-26: GAP-10 verified exact packaged HTML dual-script entry and obsolete legacy advice.
- 2026-10-26: GAP-11 traced browser-native Git token observer to obsolete vault failure/evidence labels. Subsequent sections will be appended after each subsystem inspection.
