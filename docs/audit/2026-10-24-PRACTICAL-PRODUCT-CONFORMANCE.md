# PCMS-Alpha — Practical Product Conformance Audit

**Date:** 2026-10-24  
**Mode:** READ-ONLY investigation. No repo change, extension installation, credential change, account action, Git write, or Perchance mutation.  
**Current inspected repository:** `Neb963/PCMS-Alpha`, `main` commit `4f04d841b7702c57140265622f658058d4ff211d` (PR #50 merged).  
**Shipped implementation inspected:** exact locally supplied **PCMS Alpha + PersonaMonkey XPI v1.2.7** (`PCMS-Alpha-v1.2.7-Independent-Diagnostics-Fix.xpi`), extracted for static examination.  
**Primary normative product authority:** `docs/authority/PCMS-Alpha-CLIENT-SPEC-v1.0.0.md` (91 accepted decisions and effective-rule index), `docs/authority/PCMS-Alpha-ACCEPTANCE-MATRIX-v1.0.0.md` (AC-01–AC-18, T-01–T-10), as superseded *only* on the enumerated points by `docs/authority/PCMS-Alpha-CLIENT-AMENDMENT-v1.0.1.md`.  
**Historical UI reference:** accepted Stage 4 v3.1 UI/UX specification, decisions UI-Q01–UI-Q49, and visual prototype in `PCMS-Alpha-Stage-7-Final-Accepted-Design.zip`. Where the later client contract changes product decisions (e.g. automatic adoption, Git-controlled AI prompt, passwordless backups, browser-only clocks), **the later contract wins**.

## Executive verdict

**The operator's complaint is strongly supported by the code:** the implementation is *not demonstrably conformant as an everyday application*, even though its runtime contains many protected capabilities and CI checks are green. The primary UI is a partial, separate implementation. Essential controls exist in the older UI or authenticated background port but are absent in the daily-use dashboard. Several visible actions are narrower, more manual, or more technical than the agreed user journey. Some workflows may work internally, but there is **no end-to-end operator/live proof for most AC journeys**. The present diagnostic results prove selected read-only interfaces, **not the product**.

Do **not** equate this with “most backend code is absent.” The evidence points to **UI/backend integration and product-level completeness** as the first-order problem, with genuine runtime-provider acceptance still unknown. There are hard UI omissions that can be proved statically; there are additional behavior discrepancies; and there are cases that remain unverified without a real protected Firefox/Perchance test. These are kept separate below.

**Product acceptance accounting:** 18 accepted AC journeys assessed; **0** can be labeled fully operator-accepted from the inspected evidence. This does **not** mean 18 known backend failures. It means 18 lack complete required B/H/GIT/L/operator evidence, with many specific UI and workflow defects listed below. Do not repeat deterministic suites merely to compensate for missing operator journeys.

## Evidence levels and terminology

- **M — main-UI omission (code-confirmed):** primary `pcms/faithful/bridge.mjs` lacks a command/action or removes the necessary operator control, while the contract requires it. A legacy UI control is not a substitute for a routine primary control.
- **W — wrong/frictional workflow (code-confirmed):** an exposed UI action does something narrower/different from the accepted product action; may still invoke a working safe backend.
- **P — partial implementation (code-confirmed):** some correct controls/handlers exist, but key interaction outcomes are absent or disconnected.
- **U — unverified:** source code or selected CI indicates a possible implementation, but no relevant end-to-end packaged/browser/provider evidence is established here.
- **O — observed from operator evidence:** latest sanitized diagnostic explicitly supports a limited result; no guesses about live operations.
- **A — accepted specification only:** contractual requirement, not evidence of implementation.

Severity reflects whether an ordinary operator can actually accomplish the accepted task and the consequence of misleading status. It is **not** a verified exploit/security score. A `NOT_TESTED` diagnostic value is not a functional failure.

## 1. Account management — immediate release blocker

**Accepted:** client C-02–C-09, C-56–C-60, C-79; AC-01–AC-03; historical UI-Q19/21 and Stage 4 §6.1. PCMS—not the separate PersonaMonkey panel—is the routine route, Persona, login, owner, recovery, and account management surface.

### A-01 [P0, M] Change protected route omitted from primary account manager

The exact primary `openAccountManager()` action map (packaged `pcms/faithful/bridge.mjs` **lines 740–795**) offers `Open login`, `Confirm login`, `Check protected route`, `Sync generator inventory`, `Resume setup`, `Reactivate`, and `Archive`. **There is no `Change route` option and no `CHANGE_ROUTE` port message in this primary bridge.** The typed production account boundary explicitly supports `CHANGE_ROUTE` (`pcms/account-boundary.mjs` lines 17–27, 153–186). The older, concurrently packaged `pcms/accounts-view.mjs` displays a guarded `Change route` button at lines 153–158. This is decisive evidence of UI feature loss, not backend absence.

**Operator result:** cannot perform the explicit C-09 challenge/route intervention from the primary account manager. AC-02 route-repair control is incomplete. Backend route change success in a real protected profile is still unverified.

### A-02 [P0, M] Persona replacement and route upgrade omitted

The account backend exposes `REPLACE_PERSONA` and `UPGRADE_ACCOUNT` (`account-boundary.mjs` lines 21–23). The old UI has `Create replacement Persona` (lines 134–138) and `Upgrade now` (lines 142–147). The primary account manager has neither (bridge lines 755–789). The UI therefore lacks routine repair of an absent/damaged Persona and upgrade of a legacy unpinned account.

### A-03 [P1, M] Permanent local removal absent from primary UI

C-60 accepts **separate irreversible local removal**, with clear scope and preservation of remote generators and exit history. Backend accepts `REMOVE_ACCOUNT` and previous UI provides a detailed confirmation/removal screen (`accounts-view.mjs` lines 160–207). Primary manager only shows `Archive` or `Reactivate`. An archived account cannot be permanently removed from the primary interface.

### A-04 [P0/P1, P+U] Protected login control exists but is poorly discoverable and conditional

The user's impression that there is no login/page-opening option is understandable. Code shows a primary **Open login** button at bridge lines 755–759, but **only inside** Accounts → individual `Manage`, and the menu depends on a state snapshot: `PREPARING` shows **only** `Resume setup` and `Check protected route` (lines 786–789); `ARCHIVED` shows only `Reactivate`. There is no first-class visible `Open Perchance in this Persona` action from the account row, and no alternate repair path when login is needed during `PREPARING`. Real `OPEN_LOGIN` tab creation under current user routing constraints is *unverified*; the bridge shows a generic acknowledgment rather than a verified opened tab (lines 760–784).

**Do not claim “no Open login implementation.”** Claim instead **hidden, state-inappropriate, insufficiently verified login journey**, exactly matching the user's practical complaint.

### A-05 [P1, W] Account inspector strips route and identity observability

Primary account rows show account ID, abbreviated `personaUid`, `identity` status and `protectedRoute` enum; the Manage dialog repeats Account/State/Persona/Route (bridge lines 703–722, 740–754). No primary inspector shows actual independently observed public IPv4/IPv6, exit uniqueness/collision, historical exclusions, route ID/node, freshness/timestamp, recent challenges, route change reason, or an actionable protected-route repair timeline. C-05–C-09 require these operational distinctions. Some data may exist in PersonaMonkey and the ledger, but the main account operator cannot inspect it here.

### A-06 [P1, M+U] Challenge-specific response and deliberate enrollment override not available

No primary `Challenge encountered / Open challenge / Change route` flow, no explicit enrollment-only `MANUAL_OVERRIDE`, and no route replacement with identity-revalidation UI is visible. Account backend has `MANUAL_OVERRIDE`; absence of that button is observable. Manual override **does not** authorize unsafe provider writes; it is an enrollment recovery tool. The accepted latest C-09 explicitly prohibits automatic route rotation merely due to Cloudflare.

### A-07 [P1, W+O] Account inventory prerequisite not explained or repaired in place

Actual diagnostic report showed `SCOPE: PASS` then `CREATE: HELD / INITIAL_INVENTORY_UNKNOWN`. The coordinator correctly requires a committed `inventory-batch:<accountId>` observation for **every non-archived managed account** before new allocation (`pcms/coordinator-store.mjs`, `allocateCreate`; `pcms/creation-allocation.mjs`). This matches C-37's rule that initial unknown count cannot equal zero. The UI has **Sync generator inventory** but buries it in Accounts → Manage, requires verified state, gives only an aggregate finished message, and does not give a comprehensive per-account missing-inventory remediation path from the creation/diagnostic failure itself (`bridge.mjs` lines 683–697 and 760–792). The newer v1.2.7 diagnostic text explains where to go but cannot automatically establish the required source observations.

**Preserve the guard; fix the experience in a later authorized implementation.** This audit does not authorize bypassing it.

### A-08 [P1, P+U] Archive/reactivation paths exist but product semantics unproven

Primary UI exposes Archive and Reactivate with confirmation; production backend implements typed commands. No attached observation establishes preserved Persona/session/history, released idle resources, correct reassignment of untouched allocations, or safe reactivation in the target ESR profile. This is *not* a code-confirmed missing action; it is a functional acceptance gap (C-35, C-56–C-59, AC-03).

**Account conclusion:** At least **four accepted routine account controls**—Change route, Replace Persona, Upgrade route, Permanent local removal—exist in lower layers/legacy UI but are absent from the primary UI. Login and challenge handling are present only partially or not shown in appropriate states. This is a strong, actionable UI parity failure.

## 2. Generator inventory, supply, adoption and Git integration

**Accepted:** C-10–C-16, C-28–C-39, C-76, C-80–C-85, C-89–C-91; AC-04–AC-09; UI-Q03/09–14/20/22–24.

### G-01 [P1, P] Primary inventory is a simplified read-only owner table, not the agreed management workspace

Primary generator rows render slug, account, **owner-evidence state**, visibility and source string, then an inspector with only `Inspect source`, `Refresher timing`, and `Adopt existing` (`bridge.mjs` lines 818–846, 284–300). The accepted default inventory has Perchance listing, Git source, release, Refresher, attention and last observation; supports saved filters/columns, bulk selection across pages, frozen target preview and per-item receipt drilldown. Those capabilities are not furnished by this main table. There is no primary multi-select/bulk manage operator control in the row renderer.

### G-02 [P1, P] Bulk creation intake exists, but lacks the accepted frozen allocation preview and per-item UX

**Credit existing work accurately:** current primary creator accepts multiple slugs, selects optional pinned account or automatic balance, opens durable `BEGIN_CREATE_BATCH`, sends 32-item chunks, then `FINALIZE_CREATE_BATCH`; a real backend follows up after dashboard closure (`bridge.mjs` lines 565–682). This is substantially better than R4's old 100-item cap. **But:** the UI does not present a frozen proposed allocation/collision/deduplication preview before commitment, nor per-item final ownership and remote receipt actions. `Recent durable requests` shows at most 10 batch summaries and `Retry held intake` takes only the **first** held item (`LIST_CREATE_BATCH_HOLDS limit:1`, lines 589–618). There is no complete guided per-item recovery table, making large mixed-batch troubleshooting impractical.

### G-03 [P1, W] Adoption remains a separate per-generator decision instead of fully automatic owner-level onboarding

The later accepted C-10 supersedes older Stage 4 batch/per-generator adoption-consent design: once account management is granted, automatically adopt verified owned generators and preserve originals. Primary inspector displays a manual **Adopt existing** action (`bridge.mjs` lines 284–300, 235–283), whose guarded flow depends on further explicit action. Backend automated discovery/adoption may exist; from this UI and the provided evidence there is no demonstrated **automatic end-to-end** account inventory → owned adoption → original Git baseline plus local snapshot. Mark automation **unproven** and the manual per-target UI a practical deviation from the expected default.

### G-04 [P1, P] Source association is possible, but not the accepted complete source-workspace experience

`openSourceManager()` presents a manually editable path, read-only `INSPECT_SOURCE`, SHA list (first 100), explicit `ASSOCIATE_SOURCE`, and `RECHECK_SOURCE` (`bridge.mjs` lines 163–231). This is a credible guarded association panel; it does **not** by itself show/solve missing original-current source baseline, Git folder conflict, full asset diff, association across 1,000 rows, or source-origin identity conflicts in one routine workspace. It is a technical dialog rather than a full operator journey.

### G-05 [P1, P] First Git import exists, but is buried in Settings and is not the complete allocation review

`renderConnectedMain()` (bridge lines 1834–1961) shows recognized main folders, 30-row pagination and `Approve inspected inventory scope`. **This is real, not absent.** However the button expressly approves local folder recognition only, and the UI text states that it does not allocate or create a remote generator (lines 1874–1887). The accepted C-89/AC-07 first-import screen must show proposed allocations/owner classification and permit an exact-scope initial import that then starts authorized missing creations. The backend may perform that continuation, but it is not shown in the main UI; no operator proof exists.

### G-06 [P2, P] Git-only prompt editor is present but counterintuitively nested under Connections

The canonical `pcms/prompts/default-chat1.md` is read from the complete Git scan and can be edited via **Save local prompt draft → Commit reviewed prompt to GitHub main → Reconcile** in a deep disclosure in Settings → Connections (bridge lines 1889–1959). That is meaningful guarded functionality. In contrast, Settings → AI development exposes a **different local AI guidance** textarea with a `Save guidance and tests` button (`bridge.mjs` lines 2121–2260). The contract requires the GitHub prompt as sole authority (C-22/C-62/C-90). This dual presentation is confusing and appears to request the wrong setting for the user's normal default-prompt task. Do not claim canonical Git editing is wholly missing.

### G-07 [P1, U] Git-triggered background end-to-end source progression has not been observed

The deployed XPI contains catalog/main polling, source staging, job and release modules; user diagnostics confirm read-only Git authentication and complete main enumeration. There is **no attached live observation** proving new non-READY folders initiate private empty creation automatically, READY triggers unified development without a manual Start step, or that merged source updates coalesce correctly through an actual authenticated Perchance session. AC-08/AC-09 remain not accepted. No live tests were performed during this audit.

## 3. AI development, testing, source review and publication

**Accepted:** C-16–C-19, C-22, C-40–C-53, C-86/87; AC-10–AC-13; Stage 4 §6.3 superseded where later decisions differ.

### D-01 [P1, W] Manual `Advance guarded step` competes with agreed autonomous AI job

Primary AI Settings includes a long list of jobs with `Inspect` and **Advance guarded step** buttons; each click presents another guarded confirmation (`bridge.mjs` lines 2170–2240). The agreed routine is READY → stage → native Chat 1 → actual tests/repair → optional fresh Chat 2 → saved full source → conditional writeback → approval queue **in the background**, without confirmation at each technical substep (C-03, C-18, C-46). A manual escape/recovery path is valuable, but normal operation should not depend on repetitive steps. Whether backend autonomous progression is separately operational is **unverified**; UI strongly overemphasizes the wrong workflow.

### D-02 [P1, P] Candidate review provides file-by-file bytes, not usable complete-source diff/history

Primary review fetches source fingerprint, test results and per-file SHA, then requires clicking **Read exact file** separately for each file (`bridge.mjs` lines 1230–1392). It *does* use pinned chunks and verifies hashes. It does **not** expose the promised full-width side-by-side/inline previous-good vs candidate vs conflicting operator edits source diff, navigable file tree, AI repair history or complete per-file change view. Human approval of a complex multi-file generator is correspondingly arduous. The checkbox `I inspected exact source…` is not a replacement for presenting an intelligible diff.

### D-03 [P1, M/P] No demonstrated clean-candidate bulk publication controls

Primary release flow is `openReleaseReview(slug)` for one slug and an individual `Approve and publish exact candidate`. This latter control correctly advances approved publication, including guarded dispatch/reconcile—**a repaired feature, not absent** (`bridge.mjs` lines 1355–1392). There is no selection/frozen bulk preview/approve for multiple independently clean candidates in the primary queue, as accepted C-52 and AC-12 require. Individual AI-modified or exceptional candidates must stay individual.

### D-04 [P1, P] No complete operator-editor handoff and conflicting-human-source controls in primary UI

Source safety can be present in runtimes, but the primary workflows lack the small editor context strip with identity, dirty-state, exact source actor, **Open exact matching `#edit`**, `Adopt human changes` / `Defer`, editor lease/review handoff and source conflict comparison. Stage 4 §2/§6.3 and C-53 require these visible affordances in relevant source conflict cases. Static code does not establish whether a separate content overlay works in actual Perchance Firefox tabs; that remains unverified.

### D-05 [P1, P] Work Queue aggregates unlike sources inconsistently and incompletely

Primary Queue merges operations, incidents, AI jobs, READY declarations, release items, folder identity review and missing folders using **independent cursors**. `LIST_REVIEW` is fetched with a hard-coded **40** and no subsequent release cursor (`bridge.mjs` lines 919–965); beyond 40 candidates cannot be conclusively represented. The combined queue's release filter expression around lines 1096–1100 has a precedence issue (`q.filter==='All'||q.filter==='Waiting'?…:…`) which can misplace records. An actionable queue must support complete, stable paging and correct per-workflow grouping at scale.

### D-06 [P1, U] Git writeback and real publication have no current operator-level positive evidence

The v1.2.7 XPI contains A05 dispatch and reconciliation and Git worker implementations; CI's deterministic and packaged tiers exercised them. Uploaded diagnostics **do not** show private Git write receipts, exact Perchance public listing/source readback, Chat 1/2 test completion or a single actual publish. Keep acceptance `NOT_TESTED`; do not infer failure or success from a local `APPROVED` record.

## 4. Refresher — scheduling controls are narrower than accepted operating objective

**Accepted:** C-20, C-54/55 and browser-clock amendment, AC-14/15; Stage 4 §5/6.4/§11.

### R-01 [P1, M] Per-account Pause/Resume absent from primary Refresher

The primary UI exposes global `Pause Refresher` and generator-specific Pause in the timing drawer (`bridge.mjs` lines 480–493 and 347–411). Backend `SET_PAUSE` supports `scope:'ACCOUNT'` (see `pcms/refresher-boundary.mjs` validation) and older `pcms/refresher-view.mjs` includes `Pause account`. The primary Refresher does **not** expose an account-level pause selector. Contract C-20/Stage 4 UI-Q30 require three independently addressable scopes.

### R-02 [P1, P] No usable visibility/capacity management center for the stated business goal

Primary grid shows slug, phase, remaining time; side monitor displays provider/scheduler status and simple recent-sample presence (`bridge.mjs` lines 849–904), global/default timing and per-generator timing controls exist. It does **not** provide the fully accepted placement/capacity panel: observed page share and denominator, actual recent-list positions with age/freshness, cap auto-estimate/confidence/override, admission/occupancy/eligible counts tied to source evidence, per-account route health/grace and oldest-eligible order. C-54 made maximized observed recent-page share the **primary objective**, not a green scheduler status. Source-save/visibility effectiveness remains live-unverified, so a visual `Enabled` badge proves only configuration.

### R-03 [P1, U] 24h/72h, restart, and protected marker outcome remain unverified live

The accepted amendment explicitly counts elapsed wall-clock shutdown toward REST, not unverifiable ACTIVE. Scheduler code and tests are substantial; the diagnostic only verified that the local policy API responds. It did **not** demonstrate one legitimate provider marker/source readback, feed reappearance, authentic protected exit, durable 24h/72h progression, or restore after actual user ESR restart. Do not call AC-14/15 PASS.

## 5. Settings, backup/restore, notifications, diagnostics and everyday UX

**Accepted:** C-21–C-25, C-62–C-75, amendment v1.0.1, AC-16–AC-18, UI-Q01–UI-Q49 as not superseded.

### S-01 [P1, W] Six-tab Settings is a collection of technical procedures, not simplified normal policy

`Settings` renders Connections, Automation, AI, Backups, Diagnostics, Advanced; Git connection and recovery have recently been simplified but basic controls still include permission grants, native-like internal state, concurrency, manual AI step, recovery citations and obscure technical classifications (`bridge.mjs` lines 1962–2410). C-25 expressly requires journal/provenance detail mostly invisible until needed. An ordinary account operator should be able to find **route, login, current owned generators, schedule, actionable failures** without navigating technical proofs or the legacy control room. This is a usability defect even if all buttons are technically connected.

### S-02 [P1, P] One-button diagnostic remains serial for external effects; independent checks are shallow

v1.2.7 adds an independently runnable read-only diagnostic through `pcms/s08-diagnostics.mjs`. This is a valuable decoupling fix; it does not replace AC-16's real automated creation/AI/writeback/publication/refresh test. The original live S08 sequence still holds at `CREATE` under `INITIAL_INVENTORY_UNKNOWN`, leaving its dependent chain `NOT_REACHED`; that hold is justified until owners/inventories are read back. By contract, unrelated live/effect-bearing modules should have *separate scoped tests*, not be marked failed merely because creation cannot start. Current standalone list primarily checks port/record availability, not functional backup and restore.

### S-03 [P1, O] Latest sanitized diagnostic — seven limited read-only PASS, one NOT_TESTED

From user upload `pcms-s08-sanitized-diagnostic(1).json`: `GIT_AUTH`, `GIT_MAIN`, `GIT_CREDENTIAL`, `ACCOUNT_STORE`, `INVENTORY_STORE`, `REFRESHER_POLICY` and `STANDING_GRANTS` report `PASS` with `READ_ONLY_API_RESPONSE`. `BACKUP_RUNTIME` is **`NOT_TESTED / READINESS_NOT_AVAILABLE`**. The serial diagnostic is `HELD` at `CREATE / INITIAL_INVENTORY_UNKNOWN`; downstream `GIT_SOURCE`, `READY`, `AI_TEST`, `GIT_WRITEBACK`, `PUBLICATION`, `REFRESHER`, `BACKUP`, `RESTORE` and `PROCESS_RESTART` were `NOT_REACHED`. Explicit limitations exclude route/login proof, Git write, Perchance create/publication and disk restore.

This **cannot** support “seven working product modules.” It shows seven relevant response interfaces; the backup status mismatch needs a separate source/runtime diagnosis. It also cannot prove backup failure because it never performed a file operation.

### S-04 [P1, P] Backup controls exist; full portability and restore acceptance remain unverified

The visible primary page has `Download complete backup`, `Save daily schedule`, `Run daily backup now`, `Check receipts`, `Audit stored source`, and portable restore controls (`bridge.mjs` lines 2266–2348). They correctly state passwordless/unencrypted browser-native operation. But source-complete archive, Downloads result, physical file reopen, fresh-profile safe import, inactive activation, 14-copy retention and protected route/session reconciliation require actual exercised H/B evidence. The backup-runtime independent diagnostic's `NOT_TESTED` classification is a separate diagnostic weakness, not automatic disproof of these controls.

### S-05 [P1, M] Overview deliberately never loads “Last verified backup”

`displayOverview()` sets all four cards to unknown then populates three; card **Last verified backup** is explicitly left as `—` with `Independent backup/restore evidence not loaded` (`bridge.mjs` lines 1628–1686). This is an acknowledged placeholder, not an operating status display. The same function clears additional overview blocks to a generic “No independent local proof…” even when other operator tasks may exist. It makes the primary Overview less useful than the accepted attention-first design.

### S-06 [P1, M] Global search covers only two entity types

Accepted Stage 4 says search generator, account, **Git path and operation ID** (UI-Q09). Primary `openGlobalSearch()` queries only `inventory(...)` and `accounts()`, returning max eight generator matches and matching account IDs (`bridge.mjs` lines 118–147). It cannot retrieve an incident by ID, a source folder path or a release/operation receipt. This is straightforward missing UI functionality.

### S-07 [P1, M] Saved views, customizable table columns and persistent bulk selection not in primary interface

Accepted UI-Q10–14/37 require saved filters, column visibility/order/width and selection across pages. Primary generators are recreated via `displayGenerators()` using fixed columns and direct row inspector click (bridge lines 818–849), with no selection/visible-checked row controls. Some prototype styling implies richer behavior, but it is not wired here. This is distinct from the backend's ability to page a data store.

### S-08 [P1, P] Account/generator/incident recovery actions often navigate to generic lists

Overview's local incidents display generic descriptions and `Open Work Queue`, not the exact account/source/operation with a contextual recovery action (`bridge.mjs` lines 1628–1682). `queue-help`/`account-info` simply toast “Detailed operational guidance is available in Advanced protected controls” (lines 494–496). C-68–C-70 require grouped real incidents, “Mark reviewed” that does **not** dismiss unresolved problems, and confirmed-only automatic resolution. These behaviors may exist in canonical stores; they are not fully connected to the primary incident UI.

### S-09 [P1, P] Guided acceptance report/editor not available as an everyday operator workflow

A09's repository scripts include acceptance evidence evaluation and instructions, and S08 can export sanitized reports. Stage 4 and AC-16/18 expect a guided in-app acceptance checklist with per-check Pass/Fail/Not tested, evidence notes and Markdown fallback. The v1.2.7 primary Settings does not expose a complete operator acceptance checklist. A repository CLI evaluator is not the same as a usable in-app acceptance experience.

### S-10 [P1, U] Accessibility and 50+/1,000+ product-scale experience not established

The main bridge has native buttons and some focus handling, but UI-Q02/35–49 require actual keyboard/screen-reader/320px/200%-zoom behavior, stable focus/selection while records update, accessible explanatory reasons, dense + comfortable modes and reliable 1,000-row pages. Static syntax tests and bounded mock views do not prove those integrated requirements. Do not claim they fail solely from no live evidence; mark them **unverified** with several code-confirmed omissions (bulk selection and saved views).

## 6. AC-01–AC-18 requirement-to-UI matrix

**Interpretation:** `M` = principal affordance missing in routine UI; `P` = partial workflow; `U` = relevant live or operator proof missing; `O` = latest report observes only read API; *none* are full accepted PASS. These are engineering audit dispositions, not fabricated acceptance receipts.

| AC | Accepted practical journey | Current UI/runtime exposure | Audit disposition |
|---|---|---|---|
| **01** | Add account, auto unique exit+Persona+tab, human login Confirm, owned inventory | Add and conditional Manage controls; route/owner evidence sparse | **P/U; account usability blocker** |
| **02** | Two unique exits, auto failed-route repair, retained exclusions | Route change/upgrade/Persona replacement absent in primary despite backend/legacy controls | **M/P/U; P0** |
| **03** | Archive/reactivate safely, preserve Persona/history/resources | Both buttons present; permanent removal separate action absent | **P/U** |
| **04** | One requested slug → actual private empty provider generator + Git source | Persistent batch intake exists; inventory precondition held in real diagnostic | **P/U/O** |
| **05** | Fair durable large batch, account pins, duplicate coalescing, item recovery | Multi-slug form and background batch exist; no frozen allocation/complete per-item UX | **P/U** |
| **06** | Existing owned generator adopts automatically with full immutable originals | Manual per-generator Adopt and source tools; no verified fully automatic live baseline | **P/U** |
| **07** | One initial populated-Git scope/allocations preview and bounded approval | Folder preview+approve in Connections exists; owner/account allocations and effect continuation unproven | **P/U** |
| **08** | Merged main folder recognized in background; READY automatically deploys | Runtime watch/queue modules; no live auto-create/deploy receipt | **U** |
| **09** | Deleted/renamed Git folder holds; reviewed rename/new separated | Work Queue identity review paths exist; whole outcome unverified | **P/U** |
| **10** | Native Chat1, optional fresh Chat2, full-source tests and repairs | Manual prep/advance views and backend AI present; no provider test proof | **P/U** |
| **11** | Verified conditional Git main writeback, editable canonical Git prompt | Git prompt conditional editor buried under Connections; local AI guidance competes | **P/U** |
| **12** | Full-source candidate review, clean bulk vs individual exceptions, real guarded publish | Individual SHA-bound file inspection and approve→publish present; bulk diff/approval absent | **M/P/U** |
| **13** | Existing public update waits for sleep; bounded unlisting after admission | Update modules and queue statuses, no live/source UX proof | **U** |
| **14** | Refresher realizes measured recent-page occupancy, effective saves+feed | Global/generator timing/Pause and summary; no account Pause/cap override/full feed metrics | **M/P/U** |
| **15** | Dashboard closed/worker shutdown/host outage, truthful browser-active/rest recovery | Journals/alarms/CI, no operator ESR host+provider proof | **U** |
| **16** | One-button real disposable end-to-end diagnosis, complete human review/report | S08 serial process + v1.2.7 independent read-only checks; actual chain blocked at CREATE | **P/U/O** |
| **17** | Passwordless complete backup, inspected portable restore, fresh-profile inactive controller | Visible backup and restore tools; latest independent diagnostic backup read NOT_TESTED | **P/U/O** |
| **18** | Usable 50+ accounts/1k+ generators with bulk control, attention, search, accessible workflows | Fixed simplified tables, incomplete queue release paging, no saved views/bulk selection; no operator-scale acceptance | **M/P/U; cross-cutting P0** |

### Why previous “all green” CI did not prove the product

1. Most tests check **one typed runtime operation, record transition, or packaged-screen subflow**. This is useful engineering evidence but does not assert practical completeness of the accepted journey.
2. **Hidden legacy UI** has additional account, backup, route, and configuration actions, while the primary Shadow-DOM dashboard installs another smaller set. A test passing against the legacy action is not proof the operator can find/use it in the primary interface.
3. Product requirements live in independent C/AC contracts; existing CI can be green even when no test checks `Change route` in the primary account Manage dialog, explicit Persona replacement, full source diff, complete release queue pagination, or canonical Git prompt discoverability.
4. The S08 serial diagnostic is an **incomplete acceptance instrument** by design; v1.2.7 read-only checks inspect ports and local records, not end-to-end functionality. True blocking safety conditions must remain, but unrelated modules should be evaluated separately on their own merit.
5. The operator's real ESR/PersonaMonkey/Mullvad/Perchance constraints are materially different from mocked or disposable CI fixtures. Live proof is necessary for claims about actual login, owner, native helper, source saves, listing, and route isolation.

## 7. Architecture-level cause: not lack of total source code, but two incompatible operator surfaces

The packaged `pcms/index.html` loads many original modules (`accounts-view.mjs`, `inventory-view.mjs`, `supply-view.mjs`, `ai-view.mjs`, `release-view.mjs`, `refresher-view.mjs`, etc.) **and** the primary `faithful/bridge.mjs`, whose Shadow DOM presents the accepted visual shell. As an example, the legacy Accounts module has `Change route`, `Replace Persona`, `Upgrade now`, and `Remove permanently`, but primary `openAccountManager()` does not. This is direct evidence of divergent functionality within one XPI. The operator is shown the aesthetic primary interface while many substantive features survive only in a legacy controller or API.

The recent PR #50 also had to remove an auto-mount of the legacy S08 diagnostic controller because it could blank the primary interface on startup. This is an empirically CI-reproduced manifestation of the same architectural split. **Do not revive hidden-DOM handoffs to reach missing features.** The accepted design is a single PCMS operator UI with PersonaMonkey as the internal authority.

## 8. Recommended future remediation method (proposal only; NOT implemented or authorized by this audit)

A repeat of small backend “safety phases” would not by itself solve the user problem. When an implementation phase is separately authorized, test **concrete user tasks** on the *fully visible primary UI* using actual backend capabilities and appropriate provider evidence. Prioritize:

1. **Accounts first:** account list/detail, complete route/login/challenge/rebind/replacement/upgrade/archive/local removal, real exit/owner evidence and contextual error recovery. Retire duplicate legacy actions. Gate on two ordinary operator accounts and one deliberate safe route intervention, with user authorization; no requirement to rerun previous unit CI.
2. **Generator control room:** cross-fleet inventory, frozen balanced-batch preview, full durable item/hold details, automatic owned-adoption and original source protection, source association and safe first Git import UX. Make the common 1-slug path easy and large batches usable.
3. **Autonomous READY→publication:** hide one-step technical execution behind normal background progression; present AI actual progress/test evidence; usable full multi-file diff/review and approved clean bulk; make exact approval actually publish and independently reconcile.
4. **Refresher operations:** global/account/generator Pause, honest active/rest, eligible queue, actual recent-feed slots/position, occupancy and capacity confidence, effective save/readback and bounded failure recovery. The display should optimize observed fleet visibility rather than highlight configuration alone.
5. **Backup, incident, settings and acceptance:** accurate last-backup evidence; real portable backup/restore and scoped recovery; full search and saved table settings; reduction of technical clutter; one cohesive acceptance dashboard with per-AC real/CI tiers and PASS/FAIL/NOT_TESTED.
6. **Make acceptance non-serial:** per-module operator journeys are independently executable; true dependencies are scoped to affected *effect*, not the whole application. Record exactly which AC journeys are certified without upgrading unrelated untested claims to PASS.

**Principle:** `A feature is done when an operator can locate, understand, execute and verify its accepted result in the primary interface.` A backend route command, JavaScript identifier, successful fixture or aesthetically faithful button is insufficient. No new generic workflow engine or OS service is necessary to express this criterion.

## 9. High-value negative-case acceptance fixtures to add later

- On Accounts → Manage, assert **Change route** appears in the relevant state; the action triggers typed account command and displays observed new exit + historical exclusions; challenge does not auto-rotate.
- Start/Add/Prepare account: ensure **Open Perchance** remains visible when human login is needed, even after a partially completed enrollment; distinguish tab opened from requested ACK.
- Remove Persona from a disposable profile, assert **Replace Persona** and eventual protected identity rebind without source/history loss.
- Archive account, assert **Remove locally** is a separate clear operation with preserved owner/source/IP history and backup follow-up.
- Enter 50 mixed slugs across two uneven accounts, assert frozen allocation preview + complete 50 per-item receipts with one held unknown ownership and 49 independently advancing.
- Connect populated `per-gens/main`, verify coherent first import preview shows known/missing/ambiguous/account allocation and authorization; later READY change starts automatically without redundant Start.
- Request `pcms/prompts/default-chat1.md` edit inside Settings, verify exact Git main bytes changed *only* after conditional commit; local AI guidance never masquerades as the default prompt.
- Review a multi-file source/asset update from Work Queue; inspect before/after diff, human unsaved state, tests and candidate fingerprint together; approve one candidate then observe guarded publish and exact public readback.
- Apply per-account Refresher Pause while other accounts continue; verify fleet occupancy/position and no false visibility claim.
- Simulate 100 queued publication candidates and ensure all 100 appear through correct filtering/pagination.
- At 320 CSS px/200% zoom, complete enrollment, generator source review, pause and backup interactions with keyboard-only input and correct focus restoration.
- With CREATE held for missing complete inventory, successfully **download and independently re-open one backup**, inspect Refresher local policy and verify a protected route on a separate account, each with its own receipt and no dependency on CREATE.

## 10. Limits and unresolved evidence

- This is **static shipped-XPI source examination plus the user's actual sanitized diagnostic**, not a new automated interactive ESR/browser run. Visual layout/real click responses, no matter how plausible from source, are not claimed exercised.
- Absence of a literal command in the primary bridge is high-confidence evidence of primary UI omission; it does *not* prove underlying command absence or impossibility. Hidden old UI may retain actions, but this is not practical product parity.
- A backend function or scripted test result is not evidence of real Mullvad/Perchance behavior. A guarded hold may be **correct** while its UI is inadequate.
- The unencrypted/passwordless archive, Git token storage, and rest-wallclock amendments override older Stage 4 backup/clock descriptions. Do not treat superseded crypto/vault/clock-witness requirements as missing functionality.
- C-10's later **automatic adoption** overrides historical Stage 4 per-generator approval language. C-22/C-62 put the authoritative Chat 1 prompt in GitHub, superseding the older local authoritative Settings prompt. C-91 specifies `generators/<slug>/` and `pcms/prompts/default-chat1.md`. Do not regress these during any UX repair.
- Current actual Git credential was never read or modified in this audit; the diagnostic reports only bounded status, not secret bytes. The observed 7 PASS results do not imply secure end-to-end write authority or remote provider login.
- No proposal in this document authorizes modifying the repository, user Firefox profile, private Git, real Perchance resources or native PersonaMonkey bridge.

## Source index / reproducibility

**Client normative contract** (at inspected main):
- [Approved client spec, effective rule index and C-01–C-91](https://github.com/Neb963/PCMS-Alpha/blob/4f04d841b7702c57140265622f658058d4ff211d/docs/authority/PCMS-Alpha-CLIENT-SPEC-v1.0.0.md#L1-L161)
- [Acceptance matrix AC-01–AC-18](https://github.com/Neb963/PCMS-Alpha/blob/4f04d841b7702c57140265622f658058d4ff211d/docs/authority/PCMS-Alpha-ACCEPTANCE-MATRIX-v1.0.0.md)
- [Browser-only/passwordless amendment](https://github.com/Neb963/PCMS-Alpha/blob/4f04d841b7702c57140265622f658058d4ff211d/docs/authority/PCMS-Alpha-CLIENT-AMENDMENT-v1.0.1.md)
- Frozen accepted Stage 4 UI spec and prototype from supplied `PCMS-Alpha-Stage-7-Final-Accepted-Design.zip` (`docs/specs/PCMS-Alpha-Stage-4-UI-UX-Specification.md`, `docs/specs/PCMS-Alpha-Stage-4-Decision-Register.md`, `docs/ui/PCMS-Alpha-Stage-4-UI-Prototype-v3.1.html`).

**Actual source shipped as `pcms/...` within v1.2.7 XPI** (GitHub repo paths are `src/ui/...` for UI and `src/runtime/...` for runtime):
- [Primary dashboard bridge, full source](https://github.com/Neb963/PCMS-Alpha/blob/4f04d841b7702c57140265622f658058d4ff211d/src/ui/faithful/bridge.mjs) — global search L118–147; Accounts L699–805; Generator creator L565–682; Generators L818–849; Refresher L849–904; Queue L919–1140; review L1230–1392; Overview L1628–1687; Git settings L1834–2058; AI L2121–2265; Backups L2266–2348; Settings L2360–2410.
- [Original Accounts view](https://github.com/Neb963/PCMS-Alpha/blob/4f04d841b7702c57140265622f658058d4ff211d/src/ui/accounts-view.mjs#L120-L207) — route, Persona replacement, upgrade and local removal controls absent from primary.
- [Account typed boundary](https://github.com/Neb963/PCMS-Alpha/blob/4f04d841b7702c57140265622f658058d4ff211d/src/runtime/account-boundary.mjs#L14-L28) — available account commands.
- [Creation allocation](https://github.com/Neb963/PCMS-Alpha/blob/4f04d841b7702c57140265622f658058d4ff211d/src/runtime/creation-allocation.mjs) and [coordinator store](https://github.com/Neb963/PCMS-Alpha/blob/4f04d841b7702c57140265622f658058d4ff211d/src/runtime/coordinator-store.mjs) — initial inventory prerequisite.
- [Diagnostic controller](https://github.com/Neb963/PCMS-Alpha/blob/4f04d841b7702c57140265622f658058d4ff211d/src/ui/s08-diagnostics.mjs), [independent read model](https://github.com/Neb963/PCMS-Alpha/blob/4f04d841b7702c57140265622f658058d4ff211d/src/ui/s08-diagnostic-core.mjs) — read-only checks vs serial live chain.
- [Refresher command boundary](https://github.com/Neb963/PCMS-Alpha/blob/4f04d841b7702c57140265622f658058d4ff211d/src/runtime/refresher-boundary.mjs) — account-level `SET_PAUSE` supported below primary UI.
- [Portable backup runner](https://github.com/Neb963/PCMS-Alpha/blob/4f04d841b7702c57140265622f658058d4ff211d/src/runtime/portable-runner.mjs) — browser-native backup functions, not proven disk restoration.
- Shipped `pcms/index.html` includes the complete legacy module script list plus `faithful/bridge.mjs`; this is important in reproducing the two-controller paradox.
- Operator-supplied `pcms-s08-sanitized-diagnostic(1).json`, format `PCMS_S08_INDEPENDENT_SANITIZED`, source read locally, checks as described in §5.

**Final status:** PRODUCT CONFORMANCE **NOT ACCEPTED**; multiple hard operator-UI omissions CONFIRMED, substantial product-journey gaps PARTIAL/UNVERIFIED. **No changes performed.**