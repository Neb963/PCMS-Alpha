# I02 — canonical journal and emergency diagnostics (WIP)

Selected from accepted Stage 7 plan after I01 merged and postmerge baseline/fast/Firefox/required suite passed on `1acf0930a669656124270ad336734b563ef84f5e`.

**Scope:** Revision-fenced admission and durable per-target operation journal with PREPARED → DISPATCH_POSSIBLE before any fake effect; uncertainty recovery, restore hold independent of canonical IDB, safe commands; independent read-only redacted emergency diagnostics and Overview/Work Queue/Settings projection.

**Capabilities:** Provider writes OFF, Git source writes OFF, AI and scheduling OFF. No live Perchance, Mullvad, Cloudflare, private per-gens or native mutations. Donor untouched except build staging overlay required for same-XPI integration.

**Test design:** F independent fake remote ledger and crash points with negative cases for failed IDB commit, stale revision, reused ID/payload drift, revoked sender, duplicate wake, restart/reconciliation; B exact packaged installed Firefox against isolated profile + Core-unavailable emergency; zero effect attempts as separate oracle; donor regression. Stage 5 P51-03, P51-04, P51-06, P55-11, UX-01/03/08 and S6-I02-NOTIFICATIONS/EMERGENCY-ENTRY. Tests do not claim full PASS until executed and relevant downstream integrations exist.

**Rollback:** revert I02 source and diagnostics interfaces through protected PR; preserve all existing donor behavior and leave PCMS effect gates OFF. Never delete or reset unknown operation state. Completion proposal and exact CI/Firefox evidence will follow only when validated.

## Scoped implementation evidence and outstanding acceptance

Source: one same-XPI entrypoint (donor bootstrap first), a transactional IndexedDB reducer with version/operation fencing and no provider dispatcher, separate storage.local restore sentinel, local-only incident receipts, fixed-text desktop fallback, Core-independent redacted ZIP/Markdown diagnostic entrypoint. All provider, native and private Git effects OFF.

F negative oracles: duplicated/modified operation identity, stale entity/operation revisions, abort-before-marker, fake independent effect ledger and ambiguous ACK, Direct/route lease inherited regressions, forged untrusted sender, failed storage/restore, notice duplicate/stale ignore, malicious nested diagnostics and ZIP canaries. Required source/policy CI paths unchanged.

B targeted evidence: installed combined XPI Firefox Developer Edition 154.0b10 with real IndexedDB transactions/abort and event-page rehydration, restored marker denial and independent redacted diagnostics/ZIP; real local notice Ignore must never release HELD_UNCERTAIN operation. `pcms-required` final candidate and postmerge proof are needed before acceptance.

Stage 5 primary tests P51-03/P51-04/P51-06/P55-11 remain explicitly PARTIAL beyond I02's implemented structural subcases (account/source approvals, real fake-provider write dispatch/readback, upgradeblocked/quota and Core native isolation). No later capability may treat them as full PASS. Fresh revision cannot self-certify its own CI; completion record only proposes the scoped I02 result.

Rollback through protected PR if needed; preserve journal data and scoped holds, never force or delete possible-effect receipts. The same donor Gecko ID and native host are retained. No actual external effect was executed.
