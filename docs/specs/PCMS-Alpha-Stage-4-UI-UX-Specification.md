# PCMS-Alpha — Stage 4 UI/UX Specification

**State:** Stage 4.0–4.6 decisions UI-Q01–UI-Q49 accepted; Stage 4.7 independent design audit completed and corrections integrated into **prototype v3.1**. **Operator acceptance of the final Stage 4 revision remains pending.** This is a design specification, not implemented software.

**Governing sources:** Stage 1 Requirements Audit; Stage 2 Behavior and Lifecycle Specification; Stage 3 F1/F2 Amendment; Stage 3 Minimal Architecture; Stage 3 Working Decision Register; Stage 4 Design Plan. Recent F2 amendment **supersedes** historical native-AI PJS/HTML-only restrictions. F1 private-first reservation has operator-live evidence for its observable creation/rename path, but not combined-extension acceptance or remote confidentiality.

## 1. Product experience and primary jobs

The sole application is a PCMS-first Firefox full-tab dashboard inside a single PersonaMonkey+PCMS XPI. It must support 50+ accounts and 1,000+ generators while running background operations independently of dashboard visibility.

Daily tasks: locate generators/accounts; inspect blocked work and relevant evidence; approve tested releases; monitor Refresher capacity and operational time; handle source/route incidents. Periodic tasks: supply operator slugs in bulk, adopt discovered generators, associate explicit GitHub source, enroll/rebind Personas, configure default AI tests, back up and restore. Exceptional tasks: reconcile uncertain remote effects and broken source/route/restore state, export redacted diagnostics from degraded mode.

## 2. Six destinations, no parallel management center

| Workspace | Operator question | Principal views / high-value actions |
|---|---|---|
| Overview (default) | What requires attention? | Prioritized incident scope, human decisions, active operations, meaningful outcome summaries, last evidence times |
| Generators | What is owned or linked? | One inventory for reservation/discovery/GitHub-first; saved filters and columns; selection and inspector; supply/adoption/association |
| Work Queue | What action should occur next? | Decision priority, candidate test/repair lineage, GitHub writeback, publication, source conflicts, durable operation receipts |
| Accounts | Which account and Persona can act? | Verified owner identity, route status, session, exclusivity, enrollment, repair/rebind/archive and account Pause |
| Refresher | Who gets operational time? | Occupancy/capacity/visibility evidence, global oldest-eligible queue, active/sleep budgets, overrides, scoped Pause/holds |
| Settings | What policy/protection governs work? | Source configuration, AI default prompt/revisions/concurrency, vault, encrypted backup/restore, diagnostics, manual acceptance, appearance |

PersonaMonkey advanced controls are secondary, explicitly labeled, and never bypass guarded browser/route authority. The Perchance editor overlay is a compact collapsible context strip: exact generator/account/Persona, active PCMS operation, conflict, open matching review, and explicit automation-to-human tab handoff. No second PCMS controller appears in the editor.

Global search resolves **generator, account, GitHub path and operation ID** to one canonical record. A generator shown across Inventory/Work Queue/Refresher retains the same stable entity identity and no UI projection becomes a business-state authority.

## 3. Desktop shell and visual grammar

- CSS desktop baseline: 48px header, labeled sidebar about 184px, flexible table stage, optional resizable right inspector 360–400px, 28–32px status strip; actual widths reflow instead of forcing unusable columns.
- Density: 36px table rows by default, 44px comfortable; 4px base and 8px group spacing; normal body around 14px; long-form diffs/restore use roomier reading typography.
- Light surface candidate: `#F6F7F8` canvas, white paper, `#20272F` primary text, crisp neutral borders, restrained blue accent. Dark: `#12171C` canvas and `#1A2026` paper, high-contrast text. Use design tokens rather than one-off decoration. Semantic colors only for real status; always include labels.
- Prefer actual tables and split views; no ornamental KPI/card proliferation, glass surfaces, gradients, ambient animation or icon-only primary navigation. Overview metrics are justified by an operator decision, not appearance.
- Keyboard: Tab/Shift+Tab native, Ctrl/Cmd+K global search, `/` only outside editors, Escape closes transient overlays and restores focus; native browser and accessibility shortcuts take priority. Rows retain stable identities across asynchronous updates.
- Responsive: full table+inspector on wide screens, inspector overlay/stack when needed, explicitly labeled expandable Menu at narrow widths. Secondary table columns relocate to inspector; technically dense tables/diffs may scroll *inside* their own labeled regions. 200% zoom and effective 320 CSS-pixel width must remain operable.
- Designed component states: idle, hover, pressed, focus-visible, disabled-with-readable-cause, loading, empty, queued, pending, confirmed, failed, uncertain, stale, held, paused, partial and obsolete. A generator can simultaneously have multiple independent states.

## 4. Information model and evidence

| Independent fact | Authority | Presentation rules |
|---|---|---|
| Bound Persona, protected route, browser execution safety | PersonaMonkey | Account identity and route separate; protected failures never imply Direct fallback |
| Remote slug owner, saved full PJS/HTML/src byte set, public/unlisted state | Perchance | Explicit observation method/time, current-vs-stale; `Unlisted` is **not confidential** |
| Folder, pinned READY `main` revision, conditional writeback | GitHub `per-gens` | READY ≠ tested ≠ writeback ≠ published; relevant HEAD drift visible |
| Scheduling, review decisions, Pauses, holds, operations, snapshots | PCMS controller / IndexedDB | Durable intents; revision preconditions; UI never directly owns the canonical state |
| Native AI chat and output | Perchance native AI | Full-generator edits permitted; prose and commit-message suggestion never prove tests or authorize GitHub/publishing |
| Human unsaved editor content | Operator | Dirty or unknown blocks competing writes/publication; operator-owned tabs never silently closed |

Every remote mutation transitions through local intent → dispatch possible → independent observation → confirmed / uncertain / held / failed. A lost network response cannot be shown as failure or used to justify retry. UI operation receipts carry immutable target, operation ID, version, timestamp, effect type, observed outcome and causal correlation. Critical notices show *affected scope* and a legitimate recovery action.

Relative age appears near important observations, with precise timestamp, source and freshness policy on demand. Different evidence types have distinct freshness rules. A saved refresh does not prove actual recent-list inclusion, which is itself not guaranteed.

## 5. Entity tables and inspectors

**Generators:** default columns Generator, Account, Perchance listing, GitHub source, Release, Refresher, Attention, Observed. Fast sort/filter, saved views (All, Needs Attention, Awaiting Review, Managed plus custom), column show/hide/order/width, 25-item exemplar paging, bulk selection across filters/pages. Frozen preview names exact targets and distinguishes ineligible and ambiguous items. Row selection does not implicitly mutate or change scope. Resizing/reordering is presentation state only.

**Work Queue:** priority, target, workflow, stage, evidence, blocker, updated time, action. Action-required items precede running/waiting/held; stable sorting within groups, with preserved focus during incoming changes. This is **not** the Refresher scheduler queue.

**Accounts:** account label, dedicated Persona, identity, route, generators, activity, last verification. Inspector presents owner, route, Pause and recovery holds separately. Raw UID only in advanced provenance, never compulsory input.

**Refresher:** capacity band (occupied, admission cap, eligible, observed placement, staleness), plus generator row: owner, active/sleep/wait/hold, evidenced remaining budget, persistent queue ordinal, presence observation and block reason. Dedicated inspector supports generator-specific policies; account policy is separate.

**Context inspector:** identity/primary actionable issue first; remote/route/source/schedule evidence next; immutable snapshots, operation history and technical IDs in expandable detail. Complex full-source diff, restore and protected rebind use full-width surfaces. Inspector width and visibility persist per workspace within product settings.

## 6. Operational interaction contracts

### 6.1 Enroll, verify, repair

Select/create an **unbound** Persona → hand off to guarded Perchance login (human) → observe actual authenticated identity/owner → persist exclusive binding → enable eligible operations when all guards permit. Unavailable verification is pending, not trusted. Manual override records precise provenance **only for enrollment**, never remote mutation authority. A challenged account may use a *new clean* Persona and operator-approved protected route; no CAPTCHA bypass or silent Direct fallback. Rebind invalidates session/release approvals, holds dependent work and requires verification. Archive by default; preserve remote resources and histories.

### 6.2 Supply and discovery/adoption

Paste only operator-specified slugs → validate/deduplicate/classify and fairly allocate verified accounts → frozen preview → durable per-item intent → first create private/empty temporary Perchance generator → verify independent source/listing/owner → separately rename requested slug → verify again → initialize non-READY GitHub marker folder when available. Creation and rename have distinct ambiguity/receipt states. Perchance-confirmed creation remains valid while GitHub is offline; never recreate blindly, assign to a different account under uncertain outcome, or fabricate slug replacements. Discovery maps confirmed remote identity without inferring deletion from absence. Public adoption consent is batch-previewable but each generator requires **both** an immutable local baseline and a non-overwriting GitHub archive before any modification. GitHub-first READY is an entry path to an *explicit* account/slug/folder association, not owner proof.

### 6.3 Release, AI tests, GitHub and approval

Pin READY revision+full asset manifest. Existing managed source updates require sleeping state and confirmed unlisting; new reserved empty/unlisted can stage without artificial prior sleep. Protect human unsaved editor work and acquired Persona guarded control. Stage and verify full saved PJS/HTML/**every generator-owned `src/` asset**. Native AI Chat 1 runs Settings default test prompt pinned at job start; optional `TESTING.md` runs in a genuinely fresh Chat 2 on the repaired saved candidate; verified tests tie to exact final source byte fingerprint. Known failures cannot be waived; exceptional individual manual evidence applies only to permitted test unavailability.

After tests and final readback, PCMS may perform manually approved or separately opt-in automatic **conditional, non-forced** GitHub writeback. An AI final-response commit-message hint is untrusted plain text; only PCMS has GitHub credentials and commit authority. This does not approve publication. Human approval binds target, full source fingerprint, test evidence and current identity/READY/editor state; AI-modified cases require individual review, clean unchanged cases may be explicitly bulk approved. Revalidate immediately before publish. A relevant source drift or human dirty editor invalidates eligibility without replacing the approved candidate. On update failure preserve last good source and quarantine unsafe candidate under scoped hold.

### 6.4 Refresher

One **oldest-eligible** global scheduling queue, independent of Work Queue. Active default 24 evidenced operational hours, minimum sleep default 72h; both clocks freeze across Firefox closure, confirmed outage and applicable Pauses/holds. Unknown intervals are not credited, event-page suspension does not necessarily mean shutdown. Occupancy may temporarily exceed a lower estimated/operator cap; do not evict active generators early, just stop new admissions. Account-unavailable grace defaults 60 evidenced operational minutes; release occupancy after grace without erasing active remaining budget or stable queue priority. Operator global/account/generator Pause survives recovery; held and paused remain distinct. Recent-list observation around 10 minutes and adaptive individual metrics cannot claim guaranteed visibility or an unsupported no-op save as a refresh method.

### 6.5 Integrated encrypted backup and restore

One authenticated encrypted archive contains a consistent PCMS cut, supported donor portable data and referenced source evidence. PersonaMonkey sensitive data remains encrypted; do not present unsupported WireGuard private config or nonportable provider sessions as restored. Unattended daily backup depends on proven OS-vault key access; locked/unavailable key suspends backup (never plaintext fallback). Show archive creation/integrity, Firefox downloaded file and optional independent on-disk re-read as **three different verification tiers**. Default retain last 14 successful automatic backups; manual and last-good protected; only tracked downloads can be safely cleaned up.

Restore requires authenticated archive preview and exact merge/replace destination, account/Persona/container mapping and exclusions, verified pre-restore checkpoint, persisted external boot guard, per-group receipts, reconciliation and explicit controller activation. Crash mid-restore never blindly recreates containers or replays remote operations. Fresh profile remains non-mutating until old controller verified inactive, protected routes/session/owner checks completed and operator separately activates. Historical approvals never become automatic authority.

### 6.6 Incidents, degraded diagnostics and acceptance

Overview/Attention opens context-specific recovery for the exact account/generator/operation; do not create a competing recovery navigation center. `Uncertain` exposes original intent, dispatch possible checkpoint, last authoritative observation, affected scope and *read-only* reconcile—not unconditional Retry. Persistent receipts expose confirmed, pending, held, skipped, partial, failed and restored states. User manual Pause is not cleared by observed health.

Read-only allowlisted diagnostics must be available through Settings, extension menu and failure entrypoint even if ordinary Core cannot start; no cookies, tokens, raw source, private routes, unrestricted URLs or AI chat logs. Guided operator acceptance offers Pass/Fail/Not tested per check, evidence notes, Markdown fallback and separate redacted diagnostic context. Never claim simulation equals packaged Firefox or operator-live PASS.

## 7. Release safety action matrix

| Action | Permitted when | Disabled/held reason |
|---|---|---|
| Open/inspect | Local record exists; safe read capability | Missing safe records reported, not fabricated |
| Reserve temporary generator | Verified account, eligible Persona route, durable target intent | Wrong owner/route, unsafe session, collision, uncertain earlier create |
| Rename temporary → requested slug | Previous create/owner/privacy/readback independently confirmed | Temp identity ambiguous; desired slug collision; lost rename response |
| Stage existing release | Sleeping, confirmed unlisted, owner/route/editor/source safe | Active, dirty editor, stale READY, route/session failure |
| Mark tests complete | Exact final manifest and positive test evidence | AI prose only, failed/unfinished suite, asset readback incomplete |
| GitHub writeback | Explicit manual or enabled auto mode, revision-safe and verified source | Conflicting relevant HEAD/READY/path, unknown source, untrusted AI text |
| Human publish approval | Current exact final source, applicable tests, account/editor/listing safe | AI-modified bulk selection, outdated F, known FAIL, unknown owner |
| Refresher Resume | Manual Pause explicitly cleared and independent safety guards healthy | Clearing Pause does not clear hold, route failure or stale evidence |
| Restore activation | Verified checkpoint + remapping + protected route + owner/session + prior controller inactivity where applicable | Interrupted or incomplete restore, stale approvals, unsafe route |
| Download diagnostics | Read-only allowlisted persisted safe data | Core failure may reduce available sections, never justify exporting secrets |

## 8. Accessibility and deterministic interaction expectations

WCAG 2.2 AA target, WCAG 2.1 AA minimum design baseline; not yet certified. Primary UI uses semantic landmarks and controls; table checkbox and row action are separate; keyboard shortcuts avoid Firefox conflicts; focus is visible on interactive elements and restored after transient dialogs, row selection and dynamic form changes. Live regions announce consequential transitions, not every synthetic job tick. Avoid shifting rows during active interaction; signal updated sort order and permit explicit refresh. Preserve scroll, selection, stable IDs and latest acknowledged version against out-of-order responses. Local drafts can Undo/Redo; remote effects require separately verified compensating actions and precise user consent, not fake universal Undo. Disabled controls include an adjacent accessible reason and a route to resolution.

## 9. Validation and next gate

Prototype v3.1 is single-file offline HTML/CSS/JS with no external dependencies. Browser QA and coverage are recorded in `PCMS-Alpha-Stage-4.7-Design-Audit.md` and `PCMS-Alpha-Stage-4-Prototype-v3-Coverage-and-QA.md`. All UI transitions are synthetic. No one has verified the combined Firefox XPI, provider adapter, real encryption, IndexedDB operation journal, Cloudflare flow, durable browser scheduling, native AI or WCAG conformance from this artifact.

**Operator acceptance requested:** examine all six workspaces, advanced account/source/backup workflows and serious failures in light/dark and narrow viewports; report remaining UX faults. The Stage 4.7 design audit and documentation are complete; operator sign-off is still required to freeze the UI contract. Stage 5 verification fixtures follow only upon separate authorization. No final project ZIP or production implementation is authorized by this specification.

## 10. Deterministic UI state and command contract

The following are UI-side acceptance constraints, not new storage or provider APIs.

| Concern | Required behavior | Acceptance check |
|---|---|---|
| Canonical data | Background controller is authoritative; views are read projections tagged with entity revision, event sequence and evidence origin | An older asynchronous reply cannot paint over a newer acknowledged entity revision |
| Drafts | Local edits remain distinguishable from accepted settings/remote effects; dirty forms prompt only when dismissal loses work | Editing then cancelling does not mutate canonical state; a saved draft reopens with correct provenance |
| Submission | Button changes to `Submitting` immediately; durable acknowledgement produces operation ID; an unacknowledged action is **not** reported as queued | Failed journal acknowledgement leaves no claimed submitted operation |
| Remote outcomes | `Attempted/dispatch possible` is separate from verified remote readback; timeout yields `Uncertain`, never automatic retry | Lost-response fixture exposes read-only reconcile and stable target receipt |
| Concurrent views | Generators, Work Queue, Overview, Refresher resolve the same generator/account/release IDs | Cross-view navigation opens the identical canonical entity and correct affected scope |
| Selection | Selection is by stable ID and survives filters/pages; changes between preview and execution are revalidated per target | Hidden selection count visible; changed targets held; unaffected items continue |
| Approval | Human approval pins release, target binding revision, full deployable manifest digest and test evidence; fresh pre-publish checks mandatory | Relevant GitHub, saved Perchance source, editor or ownership change invalidates approval |
| Undo | Local presentation/filter/draft changes can be reverted; remote effects are not represented as universally undoable | No remote `Undo` without an independently safe, explicitly authorized compensating operation |
| Pause and hold | Operator Pause persists independently from safety hold and account outage | Route recovery cannot clear an operator's Pause; releasing a hold does not falsely declare health |
| Restore activation | Restored profile's mutation gate remains closed until mapping, authority, old-controller inactivity (fresh profile) and operator activation are verified | Crash/restart at each restore stage preserves inactive state and displays checkpoint receipts |
| Degraded path | Diagnostic export is a read-only independent entrypoint with allowlisted output; absence of Core does not create an alternate writer | Core bootstrap failure never results in an attempted remote effect or secret-bearing export |

### Command presentation and authorization

The UI may request only the already accepted allowlisted command types. Each mutating request uses a stable target ID, expected revision, user-visible scope and operation identity. This is **not** an excuse to hard-code UI-generated success receipts: durable controller acknowledgement and independent observations determine displayed status. On repeated clicks or renderer restarts, the same logical intent must not be accepted as a fresh effect without explicit reconciliation. All privileged actions are revalidated at the controller, irrespective of disabled-button state.

A review dialog's content is immutable for the lifetime of the operator's decision. When its target changes, it changes to `Review outdated` instead of silently substituting a new target. Waiting for human approval releases temporary guarded browser/AI slots; it never holds a Persona lease for days.

## 11. Principal surfaces — required detailed states

| Surface | Empty / loading / failure | Consequential controls |
|---|---|---|
| Overview | No attention: explicitly `No action needed`, not blank KPI; partial outage: grouped scope with last evidence time; Core unavailable: degraded diagnostics entry | Open exact affected record, inspect cause, dismiss only scoped informational observation |
| Generators | No accounts yet: `Enroll account`; no search matches: `Clear filters`; source not linked: explicit association path; remotely missing/unobserved: no delete inference | Reserve, discover, adopt, source association, inspect, select across pages, dry-run and per-item receipts |
| Accounts | No eligible unbound Persona: create new Persona or repair binding; verification pending: cannot imply mutation authority; lost protected route: scoped hold | Manual login, verify, deliberate enrollment-only override, rebind with invalidated release authority, archive |
| Work Queue | Nothing actionable: show running/held counters and filter access; failed test: block; AI unavailable: documented exceptional individual-test path | Diff, test evidence, guarded manual/auto GitHub writeback, exact human publish approval, drift reconciliation |
| Refresher | Unknown refresh capability: unavailable and held, not fictitious activity; stale capacity: confidence warning; lower cap than occupancy: stop admissions, not evict | Global/account/generator Pause, capacity override, active/sleep/grace configuration, visibility inspection |
| Settings | Locked vault: backup suspended; uninitialized GitHub main: actionable setup prerequisite; unavailable backup download verification: correct evidence tier | Versioned AI prompt import/export, concurrent AI limit, source root, opt-in writeback, backup destination/retention, appearance |
| Restore | Invalid archive: no Apply; interrupted group: restart-safe receipts; fresh controller: inactive until deliberate authorization | Inspect mapping and exclusions, merge/replace with checkpoint, staged Apply, protected activation |
| Diagnostics | Canonical store unavailable: partial allowlisted report only; failed exporter: visible fallback, no secret leakage | Read-only redacted export; no normal Core bootstrap requirement |
| Manual acceptance | Untested default, Pass/Fail requires evidence; failing check is not waived by export | Capture results, Markdown fallback and safe diagnostic linkage |

### Portable text and accessibility constraints

- Navigation, forms, tables, dialogs and warnings expose semantic names. Iconography reinforces labels; it does not replace them for consequential commands.
- `aria-live` conveys significant transitions, not per-generator progress chatter. Modal focus is trapped *only while open*, and the original trigger regains focus when still present.
- The first Tab stop is the visible-on-focus **Skip to main workspace** link, with a focusable destination. At 200% zoom, sticky headers or operation bars must not fully obscure focus.
- Screen-reader row labels contain complete identities even where visual table text is ellipsized. Selected, checked, sorted and expanded state are announced and not inferred solely from color.
- Logical navigation and tooltips are RTL-aware; literal slugs, file paths, hashes and code remain direction-isolated rather than reordered. Arbitrary Unicode text is not silently normalized to a new provider identifier.
- Complex source diffs and technical tables may scroll within labeled regions at 320 CSS px effective viewport; essential approval actions, explanations and escape routes must remain reachable without two-dimensional page scrolling.
- All status labels pair color with text. Candidate theme tokens must be contrast-tested in their *actual use*, including focus, disabled actions, semantic badges, dark theme, enlarged text and target sizes.

## 12. Cross-system adversarial walkthroughs

These are design walkthroughs and Stage 5 acceptance fixtures, not measured production behavior.

**One generator, interrupted AI modification.** Existing G is sleeping with 22 operational hours left. After confirmed unlisting, source A is staged. Native AI modifies PJS and an asset; default and optional fresh-chat tests yield final manifest F. An operator edits the page before publication. The UI stops writes and shows separate GitHub A, candidate F, previous-good P and unsaved human edits. If GitHub changes relevant files, the old review remains readable but outdated. Only renewed tests/approval of final exact content authorize a future publish attempt; sleep budget remains preserved through the hold.

**Fifty accounts, protected-route loss.** Account 17 and twelve of its active generators are unavailable while unrelated accounts remain healthy. Overview groups by a *demonstrated* route dependency; account inspector preserves individual protected-route evidence. Refresher freezes affected active budgets and indicates 60 **evidenced operational minutes** of grace, then releases those occupied slots without losing remaining budgets or queue order. Operator Pause, if set, remains. Rebinding requires new session/owner verification and renewed affected approvals.

**One thousand generators, backpressure.** A fleet of 1,000 eligible generators with 24h active/72h sleep nominally requests 250 active positions; observed practical admission cap might be 200. At 195/200, at most five safe admissions may occur. Cap drops to 180; 195 active are not force-evicted, admissions stop. Bulk 40-slug reservation can confirm Perchance while GitHub is down; the UI reports pending folder creation, not failed Perchance creation. Restart reconstructs conservative clocks and operation states without 1,000 bursts of queued actions; table selection and paging retain stable identity.

**Interrupted restore and ambiguous publication.** Backup contains historical approval and a possible GitHub writeback. Fresh-profile restore imports some Persona groups and loses its session check. On restart, the UI identifies verified and unresolved groups; controller remains inactive, old-controller confirmation still required, and old approval is historical. Neither writeback nor publication is replayed without observation. Read-only diagnostics remain available if normal Core cannot start.

## 13. Stage 5 UI-related acceptance gates

| Gate | Test | PASS requires |
|---|---|---|
| UX-01 | Six destinations and cross-view navigation | Correct canonical IDs, stable selection, consistent source/route/schedule facets at 1,000+ records |
| UX-02 | Keyboard and screen reader | All critical flows without pointer, understandable labels/error causes, focus order/restoration, no traps at 320px/200% zoom |
| UX-03 | Concurrent revisions and out-of-order responses | No stale overwrite, no phantom success, no unexpected row motion during interaction, invalidated approval visibly blocked |
| UX-04 | Durable operation/disconnect | Distinguish preparing, journalled, dispatch possible, uncertain, confirmed and partial; no blind replay after Firefox restart |
| UX-05 | Release and exact source | Full PJS/HTML/src manifest and final test evidence, readback, conditional writeback, separate individual/bulk publication eligibility |
| UX-06 | Account and route safety | No duplicate active Persona, no protected→Direct fallback, explicit rebind invalidation, scoped account hold and preserved Pause |
| UX-07 | Fleet scheduling | Operational-time budgets, shared outage versus account failure, grace, cap hysteresis, stale recent-list observation and correct fairness |
| UX-08 | Restore and diagnostics | Verified checkpoint, phase receipts, inactive fresh-profile controller, independent redacted export under Core failure |
| UX-09 | Browser platforms | Packaged pinned Firefox Developer Edition at target version; contrast, zoom, text localization, reduced motion, system theme, extension menu |
| UX-10 | Manual operator acceptance | Guided checklist, independent evidence notes, usable Markdown fallback, failed checks create actionable regression reproduction |

The simulation/prototype outcomes from Chromium cannot satisfy UX-04–UX-10's provider, filesystem or Firefox-dependent criteria. Stage 5 must label source evidence, deterministic fixtures, packaged Firefox evidence and operator-live evidence separately.

## 14. Decision ownership, residual uncertainties and handoff

**Fixed UI decisions:** UI-Q01–UI-Q49, with the v3.1 purely presentational corrections captured in `PCMS-Alpha-Stage-4-Decision-Register.md`.

**UI design ready for operator acceptance review:** workflows and interactive synthetic examples cover the accepted product responsibilities, but neither completeness of external-provider capability nor actual assistive-technology conformance has been established. Remaining Stage 5 proof obligations are U-01–U-16 from the accepted Stage 3 Minimal Architecture; no new general-purpose subsystem is justified by these UI designs.

**No repository initialization, provider automation, live XPI, backup encryption, credential access or final project ZIP is authorized by Stage 4 design artifacts.**
