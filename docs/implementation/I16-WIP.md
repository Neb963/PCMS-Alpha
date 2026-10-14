# I16 — Staged restore and inactive fresh controller

> **Premerge implementation-completion proposal, NOT acceptance or activation.**
> Only exact final-candidate F/B/X results, trusted protected squash, verified
> merged-main SHA and postmerge packaged-Firefox evidence establish phase
> acceptance. This record deliberately has no self-referential SHA/run ID.

- `phaseId`: I16; `planRevision`: S7-AUDITED-DESIGN-1
- `proposedClaim`: SCOPED_IMPLEMENTATION_COMPLETE_RESTORE_ACTIVATION_GATED
- `primaryTests`: P51-08, P55-07, P55-08, P55-09, P55-10, P55-12
- `support`: REQ-X03, UX-08, S6-I16-SAME-AND-FRESH-PROFILE
- `testTiers`: deterministic F and X; persistently installed combined-XPI
  Firefox Developer Edition B with independent same/fresh disposable profiles,
  synthetic inputs and no live provider or operator account.
- `capabilities`: STAGED_LOCAL_RESTORE_REQUIRES_EXACT_FILE_AND_HUMAN_PLAN_APPROVAL;
  INDEPENDENT_RESTORE_HOLD_REMAINS_AFTER_IMPORT; PREDECESSOR_STATUS_UNKNOWN;
  RESTORED_AUTHORITY_OFF; SOURCE/ROUTE/SESSION/APPROVAL_REVIEW_REQUIRED;
  FRESH_CONTROLLER_ACTIVATION_GATED; NO_DIRECT_FALLBACK.
- `rollback`: retain the verified source/checkpoint files, disable local
  restore entry by reversion if needed, and keep the independent persistent
  restore marker until an independently verified, separately authorized
  recovery protocol can release it. No automatic destructive rollback of a
  possibly completed group.

## Proposed implementation result

1. Settings authenticates and bounds both nested encrypted archive layers,
   inventories affected data, missing/duplicate Persona mappings, Direct/proxy
   security risks, unsupported native WireGuard private configs and external
   provider sessions. The plan fingerprint binds the archive, current donor,
   all PCMS stores, complete portable cookie/GM cut, destination mode, exact
   mapping and exclusions. A changed form/input/destination invalidates
   approval. An operator must separately select a real pre-restore encrypted
   checkpoint file and re-read/authenticate/match it to the destination.
   Exact plan SHA-256 and explicit informed consent precede apply.
2. The restore runs through an authenticated same-XPI Settings port and a
   state-manager-controlled pinned PersonaMonkey donor seam. A readback
   verified global guard is written outside replaceable IndexedDB before
   donor/container/cookie/PCMS changes. Every stage journals BEFORE_DISPATCH
   and DISPATCH_POSSIBLE prior to local effects, observes independently, and
   leaves an unknown effect under RESTORE_PARTIAL_HELD. New contextual
   identities are only created through guarded donor-managed Block Personas;
   produced container IDs are separately recorded in the durable guard.
   No guessed names, Direct fallback or script/workflow autorun. Unselected
   existing donor Personas and routing/privacy policy remain unchanged.
3. The four groups are donor Personas, donor cookies, donor portable GM values
   and canonical PCMS history. Routes are Block until fresh independent
   provider/native readiness; imported cookies do NOT authenticate owner or
   prove session. Donor source/workflow bytes and contextual identities are
   read back. Incoming account UID references are remapped to actual donor
   identities, binding revisions increase, and old owner/inventory observation
   and AI/release/writeback approvals are nonauthoritative. Active UID reuse
   is rejected. Restored automatic backup/writeback is OFF, Refresher claims
   are reset and existing manual Pauses survive replacement.
4. The PCMS canonical store replacement checks the exact destination cut in
   the same IndexedDB readwrite transaction that clears/writes all logical
   stores. Merge rejects divergent same-key records and accepts idempotent
   identical records. Independent postcommit readback is required.
   A crash at any stage leaves the guard. Recovery accepts only the original
   authenticated source/checkpoint fingerprints and the persisted stage
   fingerprint, then **observes only**. It cannot redispatch containers,
   cookies, donor state or canonical writes. Unknown results stay held for
   review, never blind replay or falsely atomic cross-store rollback.
5. The persistent installed Firefox XPI runs with the donor Gecko identity
   `persona-route-manager@local`. Settings offers real preview/checkpoint
   file inputs, exact-hash consent, guarded apply, and separately explicit
   read-only reconcile; Overview displays inactive status and completed
   group counts. Neither UI close, alarm, background restart nor imported
   historical approval removes the restore hold. No activation command,
   prior-controller election mechanism, provider write or native route
   override is exposed.

## Required verification before a protected merge

- F: negative wrong password/tamper/checkpoint/cut drift, unsupported mapping,
  Direct intent, duplicate UID, stale owner/approval, 50 accounts/1,000
  generators, bound input, manual Pause, idempotent/duplicate merge.
- X: independent side-effect ledger, fault after journal-before-dispatch and
  after possible effect for all four groups, lost acknowledgement/readback,
  durable per-Persona container ID receipts, no duplicate action after wake.
- B: actual exact combined XPI installed in disposable Firefox Developer
  Edition, real selected disk checkpoint via Firefox file input, real
  donor/cookie/IDB four-stage local restore, old + fresh Firefox processes
  concurrently alive, synthetic UID collision, restored Block route,
  no imported approval, and full process relaunch persistence.
- CI: inherited donor regression suite, baseline, fast, firefox and the stable
  `pcms-required` aggregate all success at the **final branch/merge
  candidate**, not an earlier superseded checkpoint. No required CI policy,
  workflow privileges, acceptance trust root or dependency gate weakened.
- Postmerge: protected squash recorded on main; independent packaged rebuild,
  install/smoke and expected XPI digest tied to actual main SHA.

## Holds and excluded claims

**IMPLEMENTATION acceptance never means live activation.** The operator's
historical Perchance session/owner state, protected Mullvad routes, GitHub
source, native secret configurations and other local Firefox profile state
cannot be restored as authority. A fresh controller remains persistently
INACTIVE even if the imported archive looks healthy and the previous profile
is still running. The old controller's inactivity cannot be proven by the
archive or automated local tests. H-06 remains a separate late operator
migration activation check; no H-06 PASS is claimed. No Perchance, Mullvad,
Cloudflare, private `per-gens` or real operator account action occurs in CI.
A restore with uncertain donor/container/cookie/PCMS effects is **held** and
must not be retried automatically. No cross-store atomicity or unconditional
recovery/production-readiness claim is made.
