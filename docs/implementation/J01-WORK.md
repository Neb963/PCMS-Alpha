# J01 — Accounts and protected Persona operations

Base: `43e7939923c20843c778a61e5293322166044c1d` (independently reviewed PR #51, verified postmerge full CI `40105532865`). Scope: A-01–A-08 and account recovery in S-08; C-02–C-10/C-37/C-56–C-60/C-79, AC-01–AC-03. Product/provider acceptance remains unverified.

- [ ] Primary Accounts: protected Add/login/Confirm, visible Open Perchance, Verify/Change route, missing-Persona repair, legacy upgrade, deliberate limited enrollment exception, inventory, Archive/reactivate and separately confirmed local removal.
- [ ] Current and historical public exit evidence, IPv6 disposition, freshness, owned inventory and useful recovery shown in account context; technical details secondary.
- [ ] Correct account concurrency (different commands cannot inherit another command's success), donor-outage local Archive, archived pending-allocation isolation and safe reactivation of preserved work.
- [ ] D tests against production modules, including failures/uncertainty and unrelated healthy account.
- [ ] Installed exact XPI: actual primary-UI interactions, real persisted state transitions on clearly labeled isolated provider fixtures, normal and adverse journeys, reload/cold restart and keyboard/geometry checks. Real Mullvad/Perchance remains NOT_TESTED without scoped access.
- [ ] Independent final implementation review, exact-candidate full donor/D/reproducible-XPI/Firefox CI, protected squash merge, main tree/CI verification.

No routing authority moves to the UI. PersonaMonkey remains the sole route/Persona/tab executor; no Direct fallback, wrong-owner binding, blind replay, relaxed source/publication checks or I17 quarantine change. Tests must label provider fixtures and actual network limitations. Final engineering status is recorded only after its corresponding checks execute.

## Runtime checkpoint

122 focused D tests passed locally across account/inventory/enrollment, staged donor routing and S04 creation/allocation/recovery. Repairs include distinct-command concurrency, safe donor-unavailable Archive, historical-candidate search and unused-forwarder cleanup, invalid-family admission holds, current-inventory enrollment completion, same-binding reactivation and non-replayed uncertain work. Primary UI implementation and installed-XPI journey proof remain pending; this checkpoint is not J01 completion.

## Primary Accounts checkpoint (in progress)

Primary Accounts now exposes login, route verification/change, inventory, upgrade, missing-Persona repair, limited enrollment exceptions, Archive/reactivation and explicit local removal. The dialog reads the current revision before commands, preserves inputs during projection refresh and keeps Archive available while route search reaches a safe boundary. Inspector output excludes session fingerprints and other accounts' exit addresses.

Additional lifecycle fixes invalidate failed identity confirmation, coalesce boundary initialization, finish resumed route-search metadata, preserve the original helper failure, reject mismatched prepared targets and allow Archive to suspend an ongoing search without activating its candidate.

Verification: focused production-module tests ran before workspace loss (122 at the earlier runtime checkpoint; later focused suites also passed locally). The reconstructed pending diff has only been syntax-parsed in the orchestration runtime; its GitHub draft preflight and installed-Firefox interaction tests are still required. No J01 engineering completion, external-provider success or live proof is claimed.


Installed primary UI evidence harness now uses actual WebDriver clicks. It separately exercises the unmodified runtime's Add → helper-unavailable hold → Archive, then production account/inventory boundaries and real Firefox IndexedDB with explicitly synthetic donor/provider effects. Its normal path includes partial-inventory recovery, protected Open/Change, in-place legacy upgrade, process exit/relaunch, one held account alongside a healthy account, missing-Persona repair, Archive/reactivation, limited enrollment exception and both removal scopes. Screenshots/structured UI receipts are retained by the existing Firefox job. This is B fixture coverage, not L/provider acceptance. Candidate version is 1.2.8; donor bytes/Gecko ID remain unchanged.

Draft run 40109803438 passed signed baseline, syntax checks and all 72 changed deterministic tests; its separate pcms-draft-preflight is not merge acceptance. Full deterministic/donor/reproducible-XPI/installed-Firefox evidence is still pending.


Candidate fa87f11: full 916/916 D, donor JS+63 Python, reproducible XPI/audit/adverse controls and persistent upgrade passed. Full smoke stopped at a stale expected manifest version; both exact-version assertions now require 1.2.8. A subsequent draft run exposed two package consumers concurrently deleting shared build/xpi-root (ENOENT/ENOTEMPTY), despite the earlier full suite passing. The builder now accepts a caller-owned staging directory and both build-inspecting tests use distinct temporary roots; every donor/overlay assertion is retained. This repairs test interference without changing test selection or final protection.
