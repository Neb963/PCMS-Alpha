# J01 — Accounts and protected Persona operations

Base: `43e7939923c20843c778a61e5293322166044c1d` (independently reviewed PR #51, verified postmerge full CI `40105532865`). Scope: A-01–A-08 and account recovery in S-08; C-02–C-10/C-37/C-56–C-60/C-79, AC-01–AC-03. Product/provider acceptance remains unverified.

- [ ] Primary Accounts: protected Add/login/Confirm, visible Open Perchance, Verify/Change route, missing-Persona repair, legacy upgrade, deliberate limited enrollment exception, inventory, Archive/reactivate and separately confirmed local removal.
- [ ] Current and historical public exit evidence, IPv6 disposition, freshness, owned inventory and useful recovery shown in account context; technical details secondary.
- [ ] Correct account concurrency (different commands cannot inherit another command's success), donor-outage local Archive, archived pending-allocation isolation and safe reactivation of preserved work.
- [ ] D tests against production modules, including failures/uncertainty and unrelated healthy account.
- [ ] Installed exact XPI: actual primary-UI interactions, real persisted state transitions on clearly labeled isolated provider fixtures, normal and adverse journeys, reload/cold restart and keyboard/geometry checks. Real Mullvad/Perchance remains NOT_TESTED without scoped access.
- [ ] Independent final implementation review, exact-candidate full donor/D/reproducible-XPI/Firefox CI, protected squash merge, main tree/CI verification.

No routing authority moves to the UI. PersonaMonkey remains the sole route/Persona/tab executor; no Direct fallback, wrong-owner binding, blind replay, relaxed source/publication checks or I17 quarantine change. Tests must label provider fixtures and actual network limitations. Final engineering status is recorded only after its corresponding checks execute.
