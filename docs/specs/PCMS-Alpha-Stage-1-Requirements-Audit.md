# PCMS-Alpha — Stage 1 requirements baseline and consistency audit

**Status:** Stage 1 discovery closed for design purposes; not an approved implementation specification.  
**Date:** 2026-10-11.  
**Next activity:** Stage 2 — detailed behavior, lifecycle, failure and recovery design.  
**Implementation:** none authorized or performed. No final specification ZIP produced.

## 0. Authority, scope, and how to read this document

This audit reconstructs decisions from the current product-design discussions. It separates **CONFIRMED** product choices, **RECOMMENDED** engineering rules (still subject to scrutiny), and **UNVERIFIED** provider/browser capabilities. It intentionally does not copy the old Alpha architecture into the new project.

- **New implementation destination:** [`Neb963/PCMS-Alpha`](https://github.com/Neb963/PCMS-Alpha), currently an empty GitHub repository when checked during this audit.
- **Proven component to reuse:** [`Neb963/persona-router`](https://github.com/Neb963/persona-router) (PersonaMonkey), as a **pinned source snapshot** with source provenance and regression tests. PersonaMonkey's functional behavior and security invariants are not to be reinvented.
- **Historical implementation references only:** `Neb963/persona-monkey-pcms` and `Neb963/PersonaMonkey-PCMS-Alpha`; their implementation status, frozen contracts, multi-agent rounds and phase IDs are **not** authority for this new design.
- **Generator source:** a single private [`Neb963/per-gens`](https://github.com/Neb963/per-gens) repository. Define only the PCMS integration surface now, not a full generator-coding workflow or framework.
- **Documentation inputs:** the agreed requirements in this conversation and earlier supplied Perchance discovery/skill materials. PersonaMonkey reference docs checked: `docs/architecture/overview.md`, `docs/api/integration-v1.md`, `docs/guides/data-portability.md`. Earlier supplied exported Perchance `generators` page shows a manual exclusion of generators associated with repetitive meaningless saves. Neither observation proves current live provider behavior in Firefox.

Priority for later design: explicit user product decisions → observed/citable platform behavior and PersonaMonkey contracts → proposed architecture. An unverified assumption must never masquerade as an acceptance requirement that is already satisfied.

## 1. Product definition and constraints

**Objective (CONFIRMED):** A reliable, locally operated Firefox extension managing potentially 50+ Perchance accounts and 1,000+ owned generators. It reserves generators, manages source/deployments, tests candidates via Perchance's native AI helper, supports operator-approved publication, schedules generator visibility maintenance, and gives the operator effective bulk controls, backups and actionable diagnostics.

**Boundaries:** One combined PersonaMonkey + PCMS XPI; single computer and controlling Firefox environment; no multi-machine scheduler or independent distributed control plane. PCMS dashboard may be closed and normal Firefox event-page suspension may occur without terminating durable work. PersonaMonkey owns Personas, durable `personaUid`, contextual-identity isolation, Mullvad/proxy routing, browser execution and control leases, existing native bridge and its state/security rules. PCMS cannot create a competing browser automation authority or raw native RPC mechanism. Whether the same-XPI PCMS adapter consumes PersonaMonkey's typed internal services or an internal management facade is a Stage 2 architectural decision; the external extension Integration API cannot simply be presumed to fit unchanged.

**Product design direction:** Small, fixed feature capabilities—Accounts, Generator supply, Deployment & AI review, Refresher, Generator inventory, shared Settings/Notifications/Backup/Diagnostics. No dynamic module loader, universal workflow engine, module marketplace, multi-agent orchestrator, generic scheduler or speculative abstraction. Organize source by practical needs, not by an arbitrary module count.

**Development constraints:** One coding agent, one small implementation phase at a time, sequential. Existing automation sending `implement next READY phase` and periodically starting a new chat remains the intended operator workflow, to be refined in later planning. Small vertical slices should produce behavior that runs in deterministic CI and packaged Firefox; normal coding agents must **not** run live Perchance or Mullvad tests. Late operator-led manual acceptance must be short, repeatable, and backed by one-click redacted diagnostic/report export.

## 2. Consolidated functional requirements

Labels `REQ-*` are stable *discussion references*, not frozen acceptance IDs.

### 2.1 Identity and accounts

| ID | Requirement | Status |
|---|---|---|
| REQ-A01 | An account is bound to one dedicated Persona; each active Perchance account has an exclusive Persona binding, with controlled rebinding for replacement/repair. | CONFIRMED |
| REQ-A02 | Enroll via a new Persona or an existing unbound Persona; no manual `personaUid` or `cookieStoreId` needed in ordinary UI. | CONFIRMED |
| REQ-A03 | Open Perchance through that Persona; operator performs login; PCMS verifies account identity and owned-generator relationship before normal mutations. | CONFIRMED |
| REQ-A04 | When account identity cannot be verified, allow a labeled pending-verification state **and a deliberate manual override**, with a provenance record. Exact override authority is for Stage 2. | CONFIRMED |
| REQ-A05 | If Cloudflare/challenge recurs, allow a **new clean Persona** and route selection; mark the route/time/account associated with observed challenge without treating one event as proof the route is permanently bad. Do not bypass challenges or silently route Direct. | CONFIRMED |
| REQ-A06 | Session loss or protected-route failure pauses only affected work, not healthy accounts' work; fail closed on ownership or route uncertainty. | CONFIRMED |
| REQ-A07 | Periodically discover owned generators and support manual Sync; show all discovered generators in inventory, including excluded/unready ones. | CONFIRMED |
| REQ-A08 | Removing an account normally **archives** it, preserving the Persona, generator histories and sources. | CONFIRMED |

### 2.2 Generator inventory, supply, and GitHub binding

| ID | Requirement | Status |
|---|---|---|
| REQ-G01 | Generator inventory spans owned generators whether imported/discovered, newly reserved, or linked to GitHub-first source. These are entry paths into one binding model. | CONFIRMED |
| REQ-G02 | Bulk-slug reservation accepts only names supplied by the operator; never invent replacement names. Validate, classify collisions, report per-item results. | CONFIRMED |
| REQ-G03 | Reserve an actual **unlisted, initially empty** generator through a verified eligible Perchance account, not just a local claim. | CONFIRMED |
| REQ-G04 | Allocate new reservations as evenly as feasible among currently verified and operational accounts; this fairness rule is **not** the Refresher scheduling policy. | CONFIRMED |
| REQ-G05 | Create/link one GitHub folder per reserved or discovered owned generator, including existing public generators, initially non-deployable. Do not overwrite existing folder/source. | CONFIRMED |
| REQ-G06 | Require strict `Status: READY` in `DEPLOYMENT.md` plus configured deployable files; mere presence of PJS/HTML does not authorize deployment. READY on main persists; new deployable-content changes can initiate future releases. | CONFIRMED |
| REQ-G07 | Existing public generators need one-time, optionally bulk, enrollment approval before PCMS assumes deployment control. Capture pre-adoption source before any modifying action. | CONFIRMED |
| REQ-G08 | If Perchance reservation succeeds but GitHub creation fails, retain confirmed remote result and retry **only** missing step; reconcile duplicate/ambiguous outcomes. | CONFIRMED |
| REQ-G09 | Existing owned slugs are reconciled, external/taken slugs skipped; GitHub-first READY folders may supply a mapping/reservation entry point. | CONFIRMED |
| REQ-G10 | PCMS maintains explicit Perchance slug ↔ Account/Persona ↔ GitHub folder association; a folder name need not inherently determine the slug. | CONFIRMED |
| REQ-G11 | Missing/deleted generators are not silently purged; operator deletion retains a local tombstone/history and GitHub source. A failed remote observation is not proof of deletion. | CONFIRMED |
| REQ-G12 | Support fast search/filter across 1,000+ generators, sensible bulk actions, dry-run previews and per-item outcomes; destructive changes require unmistakable confirmation. | CONFIRMED |

**`per-gens` minimum boundary:** one private repository, configurable literal directory/filename paths, `DEPLOYMENT.md` with one strict readiness marker, `main.pjs`, `index.html` and configured thumbnail asset if supported. Do not mandate other source/docs/framework conventions now. Only ready `main` revisions are considered; agent branches are not deployment sources. Atomic/conditional GitHub writeback must not overwrite intervening commits.

### 2.3 Deployment, Perchance AI helper, and publication

| ID | Requirement | Status |
|---|---|---|
| REQ-D01 | A READY source revision is a **candidate**, not a public release. Apply its source unlisted, with version/source provenance and readback. | CONFIRMED |
| REQ-D02 | New generators may deploy when ready. Updates to existing managed generators **wait for sleep**; before any update PCMS must unlist and confirm that condition. | CONFIRMED |
| REQ-D03 | The default Perchance AI-helper test runs first; an optional generator-specific `TESTING.md` (or configured equivalent) runs in a **fresh second AI-helper chat** after default success. Without extra instructions, proceed to review after defaults. | CONFIRMED |
| REQ-D04 | The default AI-helper test prompt is editable in **PCMS Settings**, with version history and import/export. A change affects testing jobs begun subsequently, including updates, not historical jobs. Each job captures its prompt and source revision. | CONFIRMED |
| REQ-D05 | AI helper attempts repairs and documents what it changed; source and results from Chat 1 carry into Chat 2; a new chat does not inherit Chat 1 conversational state. Actual native helper ability to guarantee this is UNVERIFIED. | CONFIRMED intent / UNVERIFIED implementation |
| REQ-D06 | Per-account AI-helper concurrency configurable globally, default one; pending manual review **releases** that AI execution slot. Automation tabs are bounded and must not consume one permanent tab per generator. | CONFIRMED |
| REQ-D07 | Every new/changed release needs human approval, with safe bulk approval for **clean** results and individual scrutiny for failed/modified results. Open/reopen the matching Perchance `#edit` page for review when needed. | CONFIRMED |
| REQ-D08 | On approval: ensure live save/readback, reconcile any approved AI fixes into GitHub via revision-safe writeback, then publish and make the generator eligible for Refresher. Approval does not necessarily allocate an active slot immediately. | CONFIRMED |
| REQ-D09 | If new GitHub commit B appears while release A is under review, preserve A's review and label it outdated; do not silently replace A or publish an untraceable revision. | CONFIRMED |
| REQ-D10 | Unsaved operator edits take precedence; automatic source replacement must stop on conflict rather than overwrite, and PCMS must not close the operator's editor tab. | CONFIRMED |
| REQ-D11 | On update/test failure: restore confirmed working source if safe, leave **unlisted and sleeping**, flag for review, quarantine the failing revision until it changes or manual retry occurs. Capture original public generator's pre-adoption source. | CONFIRMED |
| REQ-D12 | Unexpected live source drift pauses mutation and prompts reconciliation. A manual **Ignore** action can suppress the currently observed discrepancy, not future changes globally. | CONFIRMED |

### 2.4 Refresher and statistics

| ID | Requirement | Status |
|---|---|---|
| REQ-R01 | One global oldest-eligible-first scheduler; generator-specific 24-hour default active periods and configurable minimum sleep (e.g. 72h). No cohorts or separate workflow engine. | CONFIRMED |
| REQ-R02 | Both active **and** sleep clocks pause during full Firefox shutdown **and confirmed Perchance outage**; normal event-page unload is not Firefox shutdown. Exact accounting for crashes/outage discovery is Stage 2. | CONFIRMED |
| REQ-R03 | The global active cap is automatically calculated from eligible population, A/S settings and observed practical recent-list capacity, with manual override; do not treat ~283 displayed slots as immutable or promise visibility. | CONFIRMED |
| REQ-R04 | Normal sleep means *public but not routinely refreshed*. Mandatory unlisting is for deployment changes, failed releases under review, or explicit operator action. | CONFIRMED |
| REQ-R05 | If cap decreases, existing active periods finish naturally and new admissions stop until count drops; when account unavailable, pause affected active clocks, release their slots after grace, and let them resume with remaining active time later. | CONFIRMED |
| REQ-R06 | Global, per-account and per-generator Pause/Resume are supported; unfinished time/work is preserved and restart does not burst missed actions. | CONFIRMED |
| REQ-R07 | Observe actual recent-list visibility/position roughly every ten minutes; adaptive individual statistics polling avoids 1k-per-10-minute requests. Preserve timestamps and stale-data indicators. | CONFIRMED |
| REQ-R08 | Refresh attempts are bounded, staggered and re-check visibility; reload page before an appropriate retry; repeated failures slow and ultimately **suspend** plus notify for review. A save receipt is not proof of public placement. | CONFIRMED |
| REQ-R09 | Previously discussed insignificant/comment-based save as a refresh mechanism is a **provisional technical idea, not proven platform-supported behavior**. Supplied Perchance `generators` source explicitly includes manually excluded repeat trivial-saving generators. No guarantee of promotion or filter evasion may be built into acceptance. | UNVERIFIED / DESIGN RISK |
| REQ-R10 | Earlier requirement calls for internally bounded ±30-minute transition jitter; keep it out of ordinary UI if retained. Whether it is meaningful or desirable must be revisited in Stage 2 rather than silently imposed. | PREVIOUSLY AGREED, REVISIT |

### 2.5 User experience and controls

| ID | Requirement | Status |
|---|---|---|
| REQ-U01 | One practical full-tab dashboard and small Perchance editor context overlay, without extra independent browser control centers. The dashboard does not need to remain open. | CONFIRMED |
| REQ-U02 | Main tasks: Accounts, Inventory, Supply, Deployments & Review, Refresher, Attention, Settings/Backup/Diagnostics; final navigation grouping belongs to UI design, not module boundaries. | CONFIRMED intent |
| REQ-U03 | Show plain-language progress and actual confirmed outcomes; queued, waiting, uncertain, complete, excluded, unpublished and suspended are distinguished. | CONFIRMED intent |
| REQ-U04 | Action-required and severe errors: desktop + dashboard notifications; routine successes aggregated; manual ignore only for explicitly scoped items. | CONFIRMED |
| REQ-U05 | Bulk-first workflows, virtualized/paginated large lists, operator-friendly selector UIs instead of raw IDs, accessible keyboard navigation and readable light/dark theme. | CONFIRMED intent |
| REQ-U06 | Guided in-app late-stage manual acceptance screen, standalone Markdown fallback, one-click export of marked results plus diagnostic context. | CONFIRMED |

### 2.6 Backup, recovery, diagnostics and verification

| ID | Requirement | Status |
|---|---|---|
| REQ-X01 | One operator-facing **backup file** covering PCMS and the PersonaMonkey data that can legitimately be exported. Sensitive PersonaMonkey section remains encrypted internally per its current backup contract. | CONFIRMED |
| REQ-X02 | Daily downloads to `Downloads/<backup-folder>/`; best-effort bounded retention of *known* downloads via Firefox Downloads API; warn if old files are inaccessible to cleanup. Manual export and restore. | CONFIRMED |
| REQ-X03 | Restore into same Firefox profile **or fresh profile**; preview contents and mappings before apply, verify integrity/schema, reconcile restored Persona/account binding/session/remote state. Unsupported/excluded data disclosed. | CONFIRMED |
| REQ-X04 | Recovery holds are **scoped** to affected accounts/generators/operations where safety permits; healthy parts resume after reconciliation. Never blindly replay a potentially successful remote mutation. | CONFIRMED |
| REQ-X05 | One-click **redacted diagnostics** export should work even if the normal dashboard/Core path is impaired. Include build provenance, bounded events, operation IDs, stable errors, expected/observed state, timings and safe Persona/route status; no cookies, tokens, passwords, WireGuard secrets or raw sensitive payloads. | CONFIRMED |
| REQ-X06 | Development evidence mostly via GitHub Actions: deterministic unit/integration/provider emulators, fault injection, pinned packaged Firefox Developer Edition; no coding agent live Perchance or Mullvad acceptance. | CONFIRMED |
| REQ-X07 | Final operator-led live checks only in the last few phases: short instructions, disposable data where possible, clear pass/fail, exportable diagnostic ZIP; captured failures should become reproducible fixtures. | CONFIRMED |
| REQ-X08 | One sequential agent works one small phase/vertical slice at a time, publishes commits/PR/CI and stops. Operator's existing `implement next READY phase` message automation and periodic new chats remain; later streamline governance around this. | CONFIRMED |

## 3. Invariants across every workflow

1. **PersonaMonkey is identity, route, browser execution, and native authority.** PCMS cannot silently assume missing capabilities or create bypasses.
2. **Confirmed provider state ≠ local intent ≠ GitHub readiness ≠ AI-test success ≠ human release approval.** Keep all distinct and queryable.
3. **Durability before remote mutation.** Record a stable intended target/version/operation; on uncertain outcome, reconcile before repeating.
4. **Exactly one source of truth for each fact.** GitHub `main` is development-source readiness; Perchance owns live code/listing; PCMS owns schedules, approvals, reconciliation and operator decisions.
5. **No overwriting external/manual edits.** Read before write; stale revisions cause hold and visible conflict, not optimistic clobbering.
6. **No automatic update of an active generator.** Existing release changes wait for sleep and require confirmed unlisting before source modification.
7. **No automatic publishing.** Every new/changed release needs operator approval; clean results may be approved safely in bulk.
8. **No undisclosed destructive behavior.** Archive by default; explicit confirmation for deletion; preservation of provenance.
9. **One code/config path for new and discovered generators after identity is established.** Their original source and prior public state must still be preserved and consent respected.
10. **No network-dependent tests presented as CI-verified live behavior.** Emulator PASS, packaged-browser PASS, and operator-live PASS have separate evidence.
11. **Diagnostics export is redacted by construction** and remains available through degraded-mode paths; backup export is a separate sensitive artifact.
12. **Pause semantics are monotonic and explicit.** Firefox shutdown/outage does not silently consume active or sleep budgets.

## 4. Consistency audit — resolved contradictions

| Conflict or earlier assumption | Resolution now |
|---|---|
| Old Alpha's five parallel agents, six rounds and orchestration-oriented claim/merge governance vs desired simple development | **Superseded.** New `PCMS-Alpha` uses one agent at a time, smaller phases, sequential READY progression; no artificially fixed rounds/slots or continuous orchestrator. |
| Existing implementation status R1–R4 accepted vs desire for clean architecture | Historical evidence only. No source or accepted phase is automatically carried to the new implementation. |
| Separate PCMS extension / PersonaMonkey external API vs a combined XPI | One XPI **confirmed**. Exact safe same-XPI adapter is unresolved Stage 2 work; don't duplicate direct browser/native authorities. |
| Earlier no-encryption integrated backups vs PersonaMonkey's protected sensitive-backup requirement | Q28 **supersedes** old choice: one file, internally encrypted PersonaMonkey sensitive portion. Scope of PCMS-held sensitive data still needs design. |
| Earlier possible wall-clock sleep vs actual preferred clock | **Superseded.** Both active and sleep time pause during Firefox shutdown and confirmed Perchance outage. |
| Treating previously owned generators as permanently excluded due to import origin vs deployment readiness | **Superseded.** Existing/imported and new generators use same pipeline; existing public generators require one-time adoption approval and initial source snapshot. |
| Mere appearance of GitHub PJS/HTML vs deploy-ready signal | Explicit `Status: READY` **plus valid files** required. |
| Save action as proof of recent-feed position | False equivalence rejected: count confirmed save and observed feed placement separately; no guaranteed promotion. |
| Default AI helper prompt file on GitHub vs PCMS Settings | Settings is authoritative; generator-level `TESTING.md` is optional separately version-pinned task input. |
| Manual early live testing vs Cloudflare blocking automation | CI-first emulators and packaged Firefox; only operator-run late live tests, with diagnostics. |

## 5. Unresolved contradictions / feasibility risks (do not freeze APIs yet)

**RISK-01 — Same-XPI PersonaMonkey boundary (high).** PersonaMonkey's current docs distinguish same-extension Management/Persona OS access from a separately authorized cross-extension Integration API. Choose the minimal typed adapter which preserves PersonaMonkey invariants and update behavior. Never simply copy old PCMS calls to raw service internals.

**RISK-02 — Completeness of integrated backup (high).** Current PersonaMonkey sensitive backups require encryption and omit WireGuard private configuration. An integrated one-file archive must define what is restorable and clearly report what is excluded. PCMS GitHub credentials/sessions and other secrets must not be inadvertently left plaintext in the non-encrypted section; no backup content in diagnostics.

**RISK-03 — Time accounting after unclean shutdown (high).** Firefox cannot reliably report the exact crash instant after restart. Define bounded, conservative healthy-time accounting (alarms/heartbeats/last durable checkpoint) rather than pretending to know unobserved time. Account failure grace vs global outage needs precise priority.

**RISK-04 — Source-version and review semantics (high).** Pending A vs new B, AI changes, human unsaved edits, GitHub conflict, and transient Refresher comments require an explicit release snapshot/revision and conflict-handling model. Prevent duplicate deployments and lost user edits.

**RISK-05 — Perchance visibility and refreshability (high).** Live recent-list capacity and filter/pinning are provider-controlled, and observed source includes exclusion of trivial repeat-save behavior. Ranking and continuous presence cannot be hard acceptance guarantees. Determine acceptable fallback if repeated saves are ineffective, ignored, or discouraged.

**RISK-06 — AI-helper automation (high).** The two-chat testing sequence, full session preservation, editor save/readback and reliable distinction between transient vs human tabs have not been established in a final pinned Firefox environment. Design simulator around observed browser page contracts, with failure as first-class state.

**RISK-07 — Full restore into fresh profile (high).** PersonaMonkey uses portable Persona UID remapping, but sessions, native Mullvad configuration, some secrets and provider logins may need manual reauthorization; new profile restoration must not create a second active browser-controller instance.

**RISK-08 — Account manual identity override (medium/high).** User permits it, yet target ownership mismatches can damage unrelated account generators. Define exact scope, extra confirmations and persistent warning; no unsafe override of route/Persona authority.

**RISK-09 — Auto-cap calculation (medium).** The simple A/(A+S) utilization formula estimates sustainable steady-state allocation, not maximum visible slots. Empirical capacity is mutable and pinned/filter differences matter. Define cap clamping, override warnings, and hysteresis to prevent oscillation.

**RISK-10 — GitHub folder creation and source association (medium).** Create a real initial file in each folder; batch commits safely and link by remote-confirmed slug. Prevent abandoned folders/source overwritten when adoption and reservation collide.

**RISK-11 — Backup retention (medium).** Firefox Downloads API can manage tracked downloads, not necessarily discover/delete arbitrary old files after download history loss. Explain best-effort retention and actionable warnings.

**RISK-12 — Offline/failed Core diagnostic path (medium).** Must be independent enough to export safe persisted status even if ordinary Core bootstrap fails, without creating a second authoritative runtime or leaking sensitive browser data.

## 6. Important omissions to resolve in later stages

These are design details, **not reasons to restart broad requirements discovery**:

- Define precise source file requirements, thumbnail optionality and matching `per-gens` path templates; clarify whether READY without `thumbnail.jpeg` is allowed and what to do with source-only generator updates.
- Define first deployment behavior when existing published source differs, including whether unlisting happens before AI tests and what happens to visitors during adoption.
- Define pause hierarchy: global pause vs per-account/per-generator, maintenance holds, manual override, and whether any monitoring continues while paused.
- Define failure/retry caps by operation, retry exhaustion dispositions, rate limit / backoff budgets, and whether pending human approval can survive browser/profile restore.
- Decide how to label **temporarily unreachable**, **confirmed missing**, **excluded**, **unlisted**, **sleeping**, **paused**, **blocked**, **attention required** without multiplying conflicting primary states.
- Determine statistics history retention, privacy of usage metrics, definition of `views` and how to handle corrections/reset counters.
- Specify source-drift **Ignore** button scope and how long it is trusted; avoid an accidental permanent suppression of future conflicts.
- Define what “clean results” means for bulk release approval, especially when AI helper made changes or tests could not run.
- Clarify whether PCMS should ever proactively retry Cloudflare-associated routes and how route warnings age out; challenge observation is not guaranteed causal diagnosis.
- Define automatic backup before destructive restore/upgrade, restore dry-run and rollback boundaries, and recovery when the restore operation itself crashes.
- Define diagnostics export format, redaction tests, correlation IDs, rotation/retention and minimal user test checklist. Explicitly separate diagnostic ZIP (safe to share) from sensitive backup (not safe to share).
- Validate exact Firefox version, extension packaging/signing/installation policy and CI ability to run an actual XPI with mock provider behavior without launching real Perchance/Mullvad.
- Confirm whether the **one controlling Firefox profile** constraint also prevents operating two profiles simultaneously after a restore; prevent stale controllers from mutating remote resources.

## 7. Stage 2 design agenda — smallest useful sequence

This is **not** the implementation roadmap. Each step should yield an examined behavior document, acceptance examples, and unresolved-issues list. Continue with one subject at a time:

1. **Domain and authority map.** Define account, Persona, generator, GitHub source, release, listing, schedule, AI test, backup and operator decision as separate entities/facts; draw exactly which component owns each. Resolve same-XPI PersonaMonkey adapter.
2. **Generator binding lifecycle.** Walk reserve, discover, GitHub-first, adopt, archive, delete. Define remote two-sided partial success and target identity/reconciliation, with precise invariants.
3. **Release lifecycle.** Stage, unlist, apply, test-default, test-generator-specific in fresh chat, approve, writeback, publish, rollback, source conflicts, operator unsaved edits and stale review.
4. **Refresher lifecycle.** Operational clock, sleep, outages, account health, cap/queue, pause hierarchy, actual feed observation, bounded retries, suspension. Evaluate platform-independent design alternatives to ineffective refresh saves.
5. **Recovery and support lifecycle.** Persistent operation ledger, hold scopes, crash/restart recovery, one-file backup envelope, secure contents, restore mapping, degraded-mode diagnostic export and manual-test artifacts.
6. **Cross-workflow consistency audit.** Walk representative 1, 50 and 1,000-generator examples across all lifecycles; only after this work should Stage 3 architecture contracts be frozen.

## 8. Exit criteria and immediate next action

**Stage 1 exit assessment:** Product intent and major behavior decisions are sufficiently agreed to enter Stage 2. The risks above are explicitly acknowledged as *not yet verified*; no production acceptance or final technical architecture is claimed.

**Next conversation:** Start Stage 2.1 with the **domain/authority map** and a single representative generator from account enrollment through first public release. Challenge any duplicated authority, implicit transition or missing state before defining interfaces. No repository write, scaffolding, code, or final documentation ZIP at this stage.

## 9. Key references for later review

- [New implementation repository](https://github.com/Neb963/PCMS-Alpha)
- [PersonaMonkey source](https://github.com/Neb963/persona-router)
- [PersonaMonkey architecture](https://github.com/Neb963/persona-router/blob/main/docs/architecture/overview.md)
- [PersonaMonkey Integration API](https://github.com/Neb963/persona-router/blob/main/docs/api/integration-v1.md)
- [PersonaMonkey backup portability and encryption](https://github.com/Neb963/persona-router/blob/main/docs/guides/data-portability.md)
- [Generator source repository](https://github.com/Neb963/per-gens)
- Supplied Perchance `generators` page export and earlier Perchance discovery ZIPs: technical observations and emulator evidence, **not** guarantees of future provider behavior.
