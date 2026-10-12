# PCMS-Alpha — Stage 5 Operator Acceptance Plan

**Revision:** 2026-10-12 — Stage 5.7 finalized acceptance-design scope; no operator tests run  
**Status:** **PLAN ONLY — NOT AUTHORIZATION TO RUN**. No real Perchance, Mullvad, GitHub, KDE vault, Firefox-profile restore or UI acceptance was conducted for this plan. There is no completed PCMS combined XPI yet.  
**Controlling decisions:** Accepted Stages 1–4 (including Stage 4 v3.1), Stage 3 F1/F2 amendment and Stage 5 Verification Plan. This file documents the **minimum late-stage human checks** after Stage 6 independent automated gates. It does not reopen F1's successful private-first creation/rename test or require repeating donor regressions manually.

## 1. Operator burden and the rule of evidence

Automate, simulate or independently inspect everything that does **not** require human judgement or real host/provider conditions. Human participation is restricted to: accessibility/usability of the actual build, narrow authenticated owner/provider semantic confirmation if an adapter remains unverifiable by other means, genuinely permissible Refresher efficacy, target Fedora KDE vault/readback behavior when software-only tests leave an unknown, and explicit old-controller shutdown/fresh-profile activation. A failed or ambiguous case is **not** made green by writing a note, exporting Markdown, disabling a warning or choosing a manual exception outside its accepted scope.

**Never provide account credentials, cookies, API tokens, recovery keys, native bridge secrets, source code, live AI chats or screenshots containing secrets in ChatGPT or acceptance attachments.** Capture opaque/redacted operation ID, build hash, exact browser build, UTC event time, result category, relevant error code and a short independently observed fact. Passwords stay inside the native browser/provider UI. Disposable, owned, low-impact resources only where provider testing is separately authorized. Do not bypass challenges, modify production/stable sites for acceptance, bulk-create or bulk-refresh accounts, or assume all provider mutations can be rolled back.

## 2. Preconditions — enforced before any operator live test

| Precondition | Required independent evidence | No-go when absent |
|---|---|---|
| Implementation available | Signed/unsigned private deployment permitted per accepted plan; exact combined-XPI SHA, Firefox Developer Edition build, frozen Stage 6 commit and declared test fixture | Do not try to test a nonexistent or partially implemented feature |
| Routing guard and controller | P51-01–04, P56-05/08 packaged cold-wake, sender and fail-closed regression **PASS** with reproducible traces | No provider-mutating tests |
| Perchance owner/source and release | P52, P53 and P56-01/06/07 fake-provider fixtures pass; effects are journaled and independent remote observations supported | Do not test real create, AI edit, Git writeback or publish |
| Refresher | P54 queue/clock/grace/limits tests pass; a candidate effective refresh action is documented and permissible | Keep mutating Refresher disabled; do not test live at scale |
| Backup, restore and diagnostics | P55 and P56-04/08 synthetic fault tests pass; current source archive format supported; pre-restore checkpoint and inactive-controller guard packaged | Never restore to active operational profile merely to satisfy acceptance |
| Operator authorization | Exact target, method, expected effects, risk and cleanup are separately approved for any **live** write | Read-only confirmation only or defer as `NOT_TESTED` |

Every manual test must use **one of** `PASS` (with independent observed evidence), `FAIL` (with reproduction and scoped stop), `NOT_TESTED`, `BLOCKED` (prerequisite), or `NOT_APPLICABLE` (documented absence of relevant capability). These are not equivalent to automatic suite results. Preserve date, evidence tier and observed limits.

## 3. Minimal human-facing acceptance cases

### H-01 — Real Firefox keyboard, screen reader and dense UI (required, no provider writes)

**Mapping:** UX-01/02/03/09/10; P56-05/09/10. **Setup:** installed Stage 6 packaged XPI with sanitized seeded 1,240-item fleet fixture and no production provider credentials; record Firefox build, display scale and assistive technology (e.g. Orca). Test actual UI, not v3.1 HTML prototype.

**Procedure:** Starting from a clean dashboard, Tab first to **Skip to main** and use keyboard-only navigation through Overview, Generators, Work Queue, Accounts, Refresher and Settings. Search and select across pages, preview a batch and exit without mutation; open/close a source review and restoration preview with Escape and check focus return; navigate a disabled critical action and read its precise blocker; open an incident and the independent diagnostics entry. Exercise actual 320 CSS-pixel effective viewport/reflow, 200% zoom, system and high/low contrast themes as available, reduced motion, RTL/CJK sample IDs, and one real screen-reader run covering row identity and changing statuses.

**PASS:** All consequential controls remain reachable, named and understandable; no first-Tab/hidden-action/focus trap, no misleading progress announcements, no completely obscured focus; no essential action requires page-level two-axis scrolling at 320 effective CSS px; actual target-size/contrast audits pass WCAG 2.2 AA or documented valid exceptions. **FAIL:** any critical inaccessible action, wrong identity announced, lost focus or hidden blocker. **Evidence:** sanitized keyboard/focus route, screen-reader tool/version notes, exact viewport CSS px, measured color/target result and selector for a failure. Stop affected UI release acceptance; do not suspend background safe work merely because a cosmetic noncritical view fails.

### H-02 — Account/owner read-only proof after integration (conditional)

**Mapping:** U-01/02/07; P52-01, P56-02. **Need:** only if real authenticated owner proof is still unresolved after adapted source and packaged tests. **Do not repeat F1 creation/rename.**

**Procedure:** In an already-owned, operator-chosen account, view one preexisting disposable generator's remote owner/session identity through approved Perchance UI and compare the controller's displayed Persona UID/account/owner verification receipt. No publish or source edit. Deliberately inspect **read-only** behavior when session becomes unknown (without logging out another active account unless separately approved).

**PASS:** positive owner provenance is distinguished from editKey/collaborator access; unknown/mismatched proof blocks edits, correct UID/container is shown and protected routing remains verifiable. **FAIL:** editable access alone classified as owner, wrong Persona used, or fail-open mutation control. **Evidence:** redacted owner-match predicate and stable opaque generator reference, no raw auth state. If still ambiguous, hold owner-dependent operations.

### H-03 — Native AI full-source and test attribution (conditional, disposable only)

**Mapping:** U-05/06/07; P52-04–07 and P56-01/07. **Need:** only for provider behaviors not sufficiently evidenced by the archived discovery and Stage 6 emulator; separately approve one contained live write to a disposable **unlisted** owned generator if required. Never run the same discovery happy-path again for its own sake.

**Procedure:** Check that a native AI session can safely change a designated, reversible generator-owned PJS/HTML/`src/` fixture (including a single small asset only if needed). Independently read back all saved bytes and listing status. Run configured default tests and fresh optional TESTING.md Chat 2 only if configured, capturing observable execution evidence and session separation. Exit without publishing; compare final manifest against the tested revision and check a human dirty editor causes a visible hold without an overwrite.

**PASS:** complete final byte manifest, exact source-bound evidence for required checks, proper two-chat attribution when applicable, no human conflict and no unintended public listing. **FAIL:** narrative-only PASS, missing bytes, unverified owner, wrong chat context or unexpected listing. **Evidence:** redacted hashes, test operation IDs and result methods only. On doubt stop and hold source; do not try an immediate compensating publication.

### H-04 — Effective permissible Refresher method (conditional, single low-impact target)

**Mapping:** U-10, UX-07; P54-05 and P56-03. **Need:** if no current provider documentation or independent evidence establishes both **permissibility and actual observable efficacy**. No live trial of fake saves, repeated no-op edits, automated challenge handling or mass fleet probing.

**Procedure:** After explicit operator approval, observe one permitted refresh attempt on one disposable, owned generator (whose desired listing mode and schedule are separately verified). Capture before/after provider-reported save state and independent feed presence/rank through a bounded read-only observation window; do not infer appearance from HTTP 200 or from PCMS's own cached table.

**PASS:** the specific legitimate action has corroborated observable effect and no unexpected user-visible listing/source change. **FAIL/UNVERIFIED:** not shown, stale observation, disallowed action, anti-abuse response or source-edit conflict. **Fallback:** automated **mutating** Refresher remains disabled, while monitoring/queue inspection can continue safely; never claim universal capacity or rank from one sample.

### H-05 — Fedora KDE vault and encrypted backup artifact (conditional local host proof)

**Mapping:** U-11/13; P55-01/03–06, UX-08. **Setup:** synthetic seeded data and disposable encrypted archive; no real cookies or route secrets. Prefer built automated/local test evidence first.

**Procedure:** Test unlocked-vault protected key access for unattended/background archive generation only through the approved native helper, then lock/unavailable vault and inspect the backup suspension/failure receipt. Verify completed Firefox Downloads metadata and, where the approved local bridge supports it, independently re-read the exact saved file bytes and compare SHA-256. Inspect retention preview with manual/untracked/last-good archives deliberately included; do not delete real files.

**PASS:** no plaintext fallback, locked-vault suspension, correct evidence-tier label, no deletion outside tracked eligible successful automatic backups. **FAIL:** plaintext key/state exposure, false disk-integrity claim or unsafe deletion. **Evidence:** hash only, redacted download ID, local vault status category. Recovery of a fresh Firefox profile must not depend on a secret that is accessible only from the original unavailable profile without an explicitly supported recovery mechanism.

### H-06 — Fresh-profile restore and controller activation (required for claiming migration; isolated profiles)

**Mapping:** U-12/16; P55-07–10, P56-04. **Setup:** encrypted **dummy** backup, disposable destination Firefox profile, offline fake providers, independently verified pre-restore checkpoint. Do not use the operator's daily profile as a test destination.

**Procedure:** Import and inspect mapping preview. Induce one recoverable incomplete group using an authorized isolated fixture and restart; verify scoped receipts and persistent hold. Confirm new controller is **inactive** on restore/startup, with all prior approvals historical. Operator explicitly shuts down old profile/controller, records this confirmation, then reviews actual owner/session/route/current-source verification and deliberately activates only if all prerequisites pass.

**PASS:** no new-profile remote mutation before explicit activation, no implicit transfer of trusted sender or Direct routing policy, correct UID remap and resumable safe stages. **FAIL:** old approval executable by default, dual-controller writes, partial import `Success` without group receipts. **Evidence:** redacted old/new boot IDs, checkpoint and activation receipt; no cookies or credentials exported. If old-controller status cannot be confirmed, **leave NEW inactive indefinitely**.

### H-07 — Guided acceptance checklist and Markdown fallback (required for final human sign-off)

**Mapping:** UX-10, P56-10. **Procedure:** Use built-in checklist after staged tests. Set a known incomplete item to `NOT_TESTED`; set one failed simulated case to `FAIL` with a precise reproduction and attach a safe diagnostic reference; verify Markdown fallback export. Check that no synthetic Stage 4 fixture result and no AI narrative is automatically counted as a real PASS.

**PASS:** every reported PASS/FAIL requires its own evidence note; failed and blocked checks remain conspicuous and cannot be silently waived by export; Markdown and UI have identical identities, states and evidence categories. **FAIL:** missing evidence converted to PASS, failed step hidden or redaction bypassed. **Evidence:** sanitized Markdown artifact and checklist revision; store actual sensitive evidence only in operator-controlled local secure storage, if essential.

## 4. Minimal result template

```text
Test: H-__ / P56-__ / UX-__
Result: NOT_TESTED | BLOCKED | PASS | FAIL | NOT_APPLICABLE
Tier: PACKAGED_FIREFOX_PASS | OPERATOR_LIVE_PASS (only after actually observed)
Build: <XPI SHA-256> | Firefox: <exact build> | Fixture: <version>
Target: <redacted stable reference; no secrets>
Observed fact: <what was independently checked>
Expected versus actual: <concise falsifiable assertion>
Artifact: <sanitized local evidence ID>
Known limits / affected holds: <scope>
Operator acknowledgment: <date/time, no credentials>
```

## 5. Exit states and Stage 5.7 closure

**Current aggregate status: `NOT_TESTED / DEFERRED_UNTIL_IMPLEMENTED`.** This is a minimal later test contract, **not** a request to run anything now. Stage 5.7 has now reconciled all U/UX requirements and negative tests, preserved accepted Stage 3/4 decisions, distinguished mandatory versus conditional operator checks and prepared the Stage 6 test-gated handoff. This completes the **plan**, not any H-series execution. Completion of Stage 5 verification **design** is not approval to deploy, access credentials, alter `Neb963/per-gens`, or turn on live mutating Refresher.


## 6. Final operator workload and activation rule (Stage 5.7)

| Case | When required | If not executed |
|---|---|---|
| **H-01** | Required before claiming complete real-Firefox operator accessibility/usability acceptance; actual packaged build only. | UI/operator acceptance remains `NOT_TESTED`. |
| **H-07** | Required before claiming complete operator checklist and evidence-fallback acceptance. | Operator acceptance remains `NOT_TESTED`. |
| **H-06** | Required before saying fresh-profile restoration can safely activate a new controller. | Migration/activation remains unaccepted; new controller stays inactive. |
| **H-02** | Only if authenticated owner proof remains unresolved for enabled owner-dependent provider actions. | Hold those actions; no need to repeat F1's existing successful discovery. |
| **H-03** | Only if actual native AI full-source and test provenance remain unresolved and that feature is to be enabled. | AI-dependent writeback and publication remain unavailable. |
| **H-04** | Only if a permissible, observably effective Refresher method is still unknown **and** mutating Refresher is intended to be enabled. | Mutating Refresher remains disabled; read-only monitoring may continue. |
| **H-05** | Only if unattended KDE vault integration or claimed on-disk byte verification remains unproved and is to be enabled/claimed. | Vault-dependent unattended backups suspend; report actual download evidence tier only. |

No H-series case is automatically authorized by acceptance of the **design** package. Live provider mutations require a second explicit operator approval with target and side effects after offline safety gates pass. No credential sharing, bulk trials, unsafe account state changes or run against the daily profile to satisfy a test.

**Stage 5.7 disposition:** human workload specification complete; actual human acceptance `NOT_TESTED / DEFERRED_UNTIL_IMPLEMENTED`. The governing implementation and acceptance gates are in `PCMS-Alpha-Stage-5-Verification-Specification.md`.
