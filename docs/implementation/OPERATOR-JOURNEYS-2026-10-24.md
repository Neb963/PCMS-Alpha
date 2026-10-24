# PCMS-Alpha — Operator Journey Completion Program
**Program:** J01–J07, client-driven practical conformance. **Date:** 2026-10-24.
**Status:** proposed governing corrective program, active only after reviewed merge to main.
**Source code baseline:** combined XPI v1.2.7 at main `4f04d841b7702c57140265622f658058d4ff211d`.
**Product authority, unchanged:** `docs/authority/PCMS-Alpha-CLIENT-SPEC-v1.0.0.md` and AC-01–AC-18 / T-01–T-10, with only explicit supersessions in client amendment v1.0.1. Original approved Stage 4 UI/UX prototype is visual and interaction reference when not superseded.
**Why:** Prior A00–A09 built much guarded runtime and successful engineering checks, but the **visible primary product is incomplete**. On 2026-10-24 the operator could not run ordinary account/routing tests. The v1.2.7 code-level conformance audit enumerated **34** named observations (8 A, 7 G, 6 D, 3 R, 10 S). The earlier narrative saying "27" was a counting error; do not drop any of the 34 or interpret unverified items as proven runtime failures.

## Definition of actual product completion

A journey is complete only when an ordinary operator can finish it in the **visible, default PCMS interface**, with no hidden legacy dashboard, browser console, manually crafted port message, technical run ID, required separate PersonaMonkey panel, irrelevant CLI or repeated credential entry. Backend support alone is **not** user-journey completion. A clickable button or unit test of its existence is **not** proof that its action works.

**UI operating standard**
1. Preserve the accepted prototype's clean, symmetric, responsive native dashboard. Avoid floaty overlays, nested technical panels, duplicated or inert controls, wall-of-text guidance, cryptic badges, serialized receipts and excessive confirmation screens.
2. Present actions in the natural place: account row actions include **Open Perchance**, **Change route**, **Verify route**, **Complete login**, **Repair Persona**, **Archive / Reactivate / Remove** when relevant. Hide actions that are genuinely inapplicable, but show a contextual recovery route for held states. Do not bury essential functions behind Diagnostics.
3. Normal work: one action starts an autonomous durable job; progress is a short human-readable status; only actual operator decisions request interaction. Exceptional/technical evidence is secondary, collapsible, and copyable. One account holding must not disable unrelated accounts, Git, Refresher controls or backup work.
4. Every visible control must call a real allowed production handler, return observable feedback, preserve input on failure, recover after route/browser/page restart as applicable, and remain keyboard accessible. If a provider changed, distinguish failure with a recoverable message rather than suppressing the feature or displaying PASS.
5. Do not make the operator verify internal test architecture, approve routine micro-steps, or keep the dashboard open. No feature placeholders, fake screenshots, dormant normal capabilities, stub buttons or new installer dependency. Authorized exact-source publication approval remains a real human decision.
6. Keep all earlier safeguards: donor-only Mullvad bridge and distinct verified egress/historical IP exclusions, no Direct fallback, source/unsaved edit integrity, one writer, exact approval, intent journal and uncertain-effect readback, no extra PCMS hosts, browser-local Git credential, strictly passwordless plain backups, preserved I17 quarantine.

## Source-to-journey mapping (all 34 audit observations)

These are **repair/adoption targets**, not 34 independent claims of backend failure. A=account, G=generator/Git, D=development/publication, R=Refresher, S=Settings/general; reproduce narrower defects against the current PR head and resolve in the smallest suitable J journey.

| J | Operator-owned outcome | Source findings | Contract |
|---|---|---|---|
| **J01 — Accounts and protected Persona operations** | Complete add/login/confirm; open Perchance in correct Persona, route inspect/verify/**change**/repair, replace Persona, upgrade legacy route, challenge response, manual enrollment override if allowed, inventory completion, Archive/reactivate and explicitly confirmed permanent local removal. Per-account operation isolation. | A-01–A-08, S-08 account aspects | C-02–C-10,C-37,C-56–C-60,C-79; AC-01–AC-03; E-01 |
| **J02 — Generators and account inventory** | Actual management table with owner/status/source, filters, persistent bulk selection; one/1k+ generators, allocation with real counts, per-item progress, cross-module durable intake, adoption without repeated approvals, original source and ownership preservation, missing inventory repaired in context. | G-01–G-04, A-07 (shared) | C-10–C-15,C-28–C-39,C-76–C-80; AC-04–AC-06 |
| **J03 — Git onboarding and source workspace** | One-time connect/reconnect; visible first-import scope preview (including planned allocation), correct `main` incremental discovery and safe conflict/rename choices, full source tree, canonical Git prompt editor placed intuitively, no extra per-folder ceremony; automatic READY trigger. | G-05–G-07, S-06 Git/operation search | C-16,C-21–C-23,C-40–C-45,C-61–C-63,C-82–C-91; AC-07–AC-09,AC-11 |
| **J04 — Autonomous AI and Publication** | Coherent READY → autonomous AI+real tests+guarded Git writeback → publication queue; clear stage and only meaningful Pause/Resume/Instructions; intelligible exact full-source diff with previous-good and dirty-human-source protections; approved individual and narrowly safe clean-bulk publication; complete scalable Queue filtering/pagination. | D-01–D-06, S-08 queue aspects | C-17–C-19,C-43–C-53,C-87; AC-10–AC-13 |
| **J05 — Refresher operation and observed value** | Simple Enable/Pause (global, account, generator), sensible timing defaults, bounded override and usable recent-feed/coverage/capacity view; distinguish save vs observed recent placement; browser-only clock and independent workflow recovery. | R-01–R-03 | C-20,C-54–C-55,amendment B; AC-14–AC-15 |
| **J06 — Backup, Settings, Attention and diagnostics** | Strictly passwordless manual/daily export, inspect/import/fresh-profile restore with truthful receipts; useful last-backup status; Settings reduced to operator policy; action-centric alerts and targeted recovery; complete search including operation/path; diagnostics independently runnable with real end-to-end disposable scope when authorized. | S-01–S-06,S-08–S-09, S-03 diagnostic nuance | C-24–C-25,C-62–C-75,amendment A/C/D; AC-16–AC-17 |
| **J07 — Primary UI parity, scale and final acceptance** | Remove remaining hidden-legacy dependency; full UI/interaction audit of every route, modal, button, menu, error state and keyboard path; saved views and column controls; responsive symmetric layout, 50+/1k+ browsing; trace all 18 AC + T01–T10 + X01–X14; exact fully enabled XPI and minimal final operator guide. | S-07,S-10 and **retest all other findings** | C-01–C-03,C-67–C-71; AC-18 + full AC/T/X |

**Start J01 first.** J02–J06 can consume already proven stable runtime but must not ship incomplete direct UI paths. J07 is final integration, not the first time user-journey usability is checked. Cross-cutting source/architecture changes are allowed where essential for a coherent journey, but do not convert each J journey into a huge unrelated rewrite. Resume an unfinished J PR first; never automatically select historical A00–A09 again.

## Each J slice's mandatory implementation evidence

1. **Trace** each accepted user action to default UI → event handler → trusted capability → durable state/effect → readback → visible result. Classify: complete, UI omitted, wrong workflow, backend missing, provider-unverified. No prose-only PASS.
2. **Implement** every bounded required control and its real handler. The UI must be understandable without reading internal documentation. No disabled feature for the purpose of achieving green tests; truly unsafe effects remain held with precise actionable recovery.
3. **Exercise installed packaged Firefox (B)** on realistic fixtures and actual clicks: valid/invalid/held/retry states, reload/startup, focus/tab/keyboard navigation, state persistence and UI geometry. Test at least one normal complete operator journey and the key adverse one in the same candidate. Capture redacted screenshots/structured DOM evidence; do not substitute string-presence assertions.
4. **Test module isolation:** intentionally make an unrelated account/workflow unavailable and show others still work; do not require a successful CREATE for independent backup/Refresher/Git verification. Unknown external effects are reconciled, not replayed.
5. **Run D regression and negative controls** relevant to touched flows, preserving original source/routing/authority semantics. During development run local relevant tests and the **draft preflight CI**. Before merging, mark the PR **Ready for review** to require the same-head exhaustive fast/donor/XPI and installed-Firefox checks. If further edits are needed, return to Draft while iterating.
6. **External H/GIT/L** require genuinely scoped authorization and real independent readback; missing evidence is explicitly NOT_TESTED and does not block independent safe engineering. No claim of live acceptance without it. Do not repeatedly ask the operator to run unchanged deterministic tests.
7. **Release gate:** one fully enabled XPI, same Gecko ID, upgrades existing profile safely, no extra OS host. No operator release if routine UI remains unusable or a core workflow only works through backend ports/legacy controller.

## Test speed without weakening protection

`.github/workflows/required.yml` distinguishes **DRAFT_PREFLIGHT_ONLY** from **FULL_ENGINEERING_GATE**:
- Draft PR commits: baseline + changed-source syntax and changed tests. No donor suite, full 900+ tests, reproducible XPI or Firefox. This is intentionally **not** acceptance; GitHub draft PRs cannot merge.
- Ready PRs and pushes to main: full donor integrity/regression, all deterministic/adversarial tests, reproducible XPI and real persistent Firefox checks; aggregate `pcms-required` must reject missing/skipped/failed jobs. Workflow dispatch also runs full.
- Keep a PR Draft during frequent coding pushes, convert to Ready **once candidate is stable**. If changes are made after Ready, switch to Draft for iteration, then Ready again for an exact-head full run. **Never merge on a draft preflight**.
- Do not permanently stop/reduce the final full gates, skip Firefox after a UI change, falsify tier labels or disable GitHub protections. If ready_for_review fails to trigger full suite due to GitHub rules, explicitly dispatch full on current head and verify the exact checked SHA before merge.

## No repeated architecture discussions or sacred blockers

Ordinary missing UI controls, wrong technical copy, misplaced action, inadequate page layout, and failed fixture logic are **engineering bugs with accepted requirements**. Repair them, do not request another product vote. Missing real provider access holds only the affected real action; continue testing all independent features. Ask the operator only for required real login/CAPTCHA, private account/Git authorization, or an actual conflicting choice not covered by the accepted spec. Prefer the least disruptive safe solution.

## Operator acceptance

At the end of J07 provide **one** correct XPI and **one short guide**: backup profile, install/upgrade, protected login and route confirmation, one disposable creation/adoption, one actual READY→AI→Git→exact approval/publication, Refresher, backup/restore, and focused UI check. Each is tested only when required and not already proved by unchanged exact-build evidence. Do not ask the operator to understand the event journal, CI or detailed backend logs.
