# I01 implementation checkpoint

Phase: I01 — Fail-closed background wake and PersonaGuard
Base: df4f2e3ef023d7f3a1d0f65dbf775db4b5af6380 (observed main on 2026-10-12)
Status: IN PROGRESS — no acceptance claimed.

- I00 merged in PR #1; observed main postmerge workflow 38297132142 ran baseline, fast, persistent packaged-Firefox and pcms-required successfully.
- Scope: install synchronous same-XPI PCMS wake listeners before donor asynchronous recovery; guard route/lease readiness through the **existing** donor control registry and current Persona UID/container; provide bounded read-only Overview/Accounts health, never PCMS provider effects.
- Donor pinned source remains immutable. Reproducible build overlays must fail on incompatible donor source.
- P51-01/P51-02 are NOT PASS. Must add independent fast negative oracles and real persistent packaged Firefox cold-wake/restart/route-loss evidence.
- No live provider access, no private per-gens operations, no automatic Direct fallback; capabilities OFF.
- Pending: code, red/green tests, final-candidate and trusted-main verification.
