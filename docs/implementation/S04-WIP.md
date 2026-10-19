# S04 — Creation & adoption implementation checkpoint (WIP)

**Disposition:** PARTIAL implementation. **Do not merge or activate.** This is not AC-04–08 acceptance, an enabled full journey or a final operator XPI. The accepted Gate A contract, Gate B v1.1 and SLICES.md control remaining work. One PR/branch, no new coordinator/framework.

## Actual changes on this branch

1. S00 coordinator canonical `s00-create-slug:` reservation is now the shared slug-intake authority. Manual operator slugs and independently completed Git `main` observations coalesce without a second intent or provider action. Distinct operator origins are retained. Same Git marker OID is idempotent across unrelated HEAD movement; a new marker is provenance, not deployment authority. Contradictory account pins hold the slug; previous uncertain operation state is preserved.
2. An initial Git import is admitted only after the human-approved pinned scope has been fully consumed. Incomplete catalog, invalid witness, conflicting repository and changed pre-consumption scope hold. S03 no-tab catalog observation runs a bounded checkpointed canonical intake (128 per wake by default), and can resume after interruption; original I17 uncertain slug is permanently quarantined for any intake origin. Later coherent `main` folder observations are local intents, never provider effect authorization.
3. The Generators/Work Queue UI sends operator slugs to the canonical creation port, reports each acknowledged/held result, and displays a redacted paged canonical queue. Historical I06 batches remain visible for read-only investigation and uncertain-effect reconciliation. No UI text claims a provider effect.
4. Legacy I06 supply freeze now recognizes canonical S04 slug reservations and cannot create a second same-slug operation. The dormant legacy Git marker path and bytes are corrected to `generators/<slug>/DEPLOYMENT.md` and exact `Status: NOT_READY\n`; no `gens/` alias is introduced. A Git credential for that legacy write is no longer accepted from a UI message: activation checks precede scoped native vault lookup. The legacy writer is held on any connected repository other than its currently hardcoded one, rather than writing the wrong repository.
5. Deterministic checks cover source coalescence, stale/competing intents, lost-ACK idempotence, I17 quarantine, Git scope and cursor, canonical IndexedDB races/aborts/pagination, legacy path/marker contract and UI-credential denial. The current candidate's installed-XPI and protected CI evidence must be read from the exact PR SHA, not inferred from these test additions.

## What is **not** implemented or accepted

- No guarded S04 owner/missing/readback admission, eligible account balancing, current Persona grant and immutable binding evidence integration into a **single** canonical dispatch; the old I06 executor remains separate and activation OFF. Canonical queued creation is not a created private generator.
- No automatic protected private CREATE/RENAME from a canonical source, complete temporary ID/possible-effect linkage or independent successful remote readback in this PR. Old uncertain legacy operations are not treated as safe fresh intents.
- No S04 existing-owned adoption workflow connected to the canonical coalescer, independently recoverable original-source checkpoint or compliant immutable Git archive ref. The old I07 archival code is **not** evidence of accepted adoption and must not be activated as a substitute.
- No connected scoped conditional Git creation/write/readback under the accepted arbitrary configured repository identity; the old supply adapter remains a safely gated legacy stub for the default repository, not a complete S04 Git writer.
- No production activation of protected route, source-bearing backup, native host, private `per-gens` or live Perchance operations. External evidence tiers **L/H/GIT are NOT TESTED** for S04, regardless of deterministic or Firefox package results.
- Original I17 batch `batch_e2c328e54f9c4a6ab89f1084134fde52` and slug `pcms-test-esr-chain-20261015-a01` cannot be retried or migrated without original profile evidence and separate authorization.

## Verification / next integration boundary

Required current-candidate D + installed packaged-Firefox B + protected `pcms-required` checks must pass before any merge. These edits have no remotely authorized provider/native/private Git effects. If a required check fails, repair the causal defect without weakening tests.

**First remaining causal boundary:** link a canonical `WAITING_CAPABILITY` slug with fresh protected account/route, independent target owner/missing evidence and an atomic prepared/possibly-dispatched operation record. Reuse the existing source/supply/adoption mechanics only after repairing their actual correctness and ensuring no parallel independent source of CREATE exists. Then finish private CREATE/RENAME, original-source/adoption and conditional `main` NOT_READY association behind separate effect activation holds, with D/B negative and recovery tests. Leave the PR draft until the complete bounded S04 engineering outcome is verified.
