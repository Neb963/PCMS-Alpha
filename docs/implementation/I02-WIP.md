# I02 — canonical journal and emergency diagnostics (WIP)

Selected from accepted Stage 7 plan after I01 merged and postmerge baseline/fast/Firefox/required suite passed on `1acf0930a669656124270ad336734b563ef84f5e`.

**Scope:** Revision-fenced admission and durable per-target operation journal with PREPARED → DISPATCH_POSSIBLE before any fake effect; uncertainty recovery, restore hold independent of canonical IDB, safe commands; independent read-only redacted emergency diagnostics and Overview/Work Queue/Settings projection.

**Capabilities:** Provider writes OFF, Git source writes OFF, AI and scheduling OFF. No live Perchance, Mullvad, Cloudflare, private per-gens or native mutations. Donor untouched except build staging overlay required for same-XPI integration.

**Test design:** F independent fake remote ledger and crash points with negative cases for failed IDB commit, stale revision, reused ID/payload drift, revoked sender, duplicate wake, restart/reconciliation; B exact packaged installed Firefox against isolated profile + Core-unavailable emergency; zero effect attempts as separate oracle; donor regression. Stage 5 P51-03, P51-04, P51-06, P55-11, UX-01/03/08 and S6-I02-NOTIFICATIONS/EMERGENCY-ENTRY. Tests do not claim full PASS until executed and relevant downstream integrations exist.

**Rollback:** revert I02 source and diagnostics interfaces through protected PR; preserve all existing donor behavior and leave PCMS effect gates OFF. Never delete or reset unknown operation state. Completion proposal and exact CI/Firefox evidence will follow only when validated.
