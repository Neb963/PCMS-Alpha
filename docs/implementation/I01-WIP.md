# I01 — guarded wake and shared Persona control checkpoint

Scope: fail-closed background wake, read-only Overview/Accounts health, stable UID/current container and shared donor lease registry. All PCMS mutation capabilities are OFF.

Evidence available on phase PR:
- F: synthetic independent donor-lease adversarial tests, partial P51-01 / P51-02 subcases and route-failure/Direct/rotation/revocation negative oracles; pinned inherited PersonaMonkey donor regression suite and reproducible combined XPI.
- B: persistently installed combined XPI in disposable Firefox Developer Edition 154.0b10; original `persona-route-manager@local` ID survives full Firefox process restart; event-page boot ID changes on idle cold wake; a real alarm fires with independently persisted incrementing count.
- CI: baseline, fast, firefox and `pcms-required` all succeeded on pre-proposal candidate. Candidate after this documentation commit requires renewed current-SHA CI and postmerge proof.
- Recovery: donor security initially unavailable => guarded reads return HELD. PCMS effects always OFF, even after an alarm.
- P51-01/P51-02 entire Stage 5 contracts are **NOT** claimed PASS where canonical journal/target-owner command and real guarded-effect fixtures do not yet exist. These belong to succeeding phases and scoped later reruns.
- No live provider, private per-gens Git access, real operator profiles or unauthorized extension permissions.
- Trust roots unchanged: workflow, branch policy, test selector/aggregator and frozen donor source untouched; package-only overlay has exact anchors.
- Rollback: revert the I01 application additions via protected PR; restore I00 combined package. No data migration, no durable work was dispatched.
