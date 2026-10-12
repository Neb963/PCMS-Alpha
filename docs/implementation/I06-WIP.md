# I06 work-in-progress checkpoint — private-first slug supply

**Status:** IN_PROGRESS, not Stage 7 acceptance. This is an in-PR recovery note and does not update the authoritative phase manifest. **Live provider actions:** none performed.

## Immutable authority

- Base merged main: `b69f7216bd942c527995ffb3f9ae99da145960d1` (I05 accepted).
- Branch: `phase/I06-private-first-supply`; draft PR #8.
- Contract: `docs/implementation/PHASES.md` I06; P52-02 / P56-06. Stage 3 F1 evidence is historical, not an I06 live acceptance test.
- Accepted F2 full-generator source scope remains unmodified. Donor is unchanged; combined-XPI overlay uses the pinned exact donor commit.

## Implemented pieces / observed limits

1. `supply-plan.mjs` freezes the operator's exact ordered requested slug list and account/binding revisions. No silent canonicalization or changed allocation after a partial outcome. Each item has a separate lifecycle and redacted public receipt.
2. `supply-store.mjs` commits local reservations in one IndexedDB transaction and uses atomic `meta + entities + operations + events` transactions to commit `PREPARED` and `DISPATCH_POSSIBLE` **before** each remote effect; each create, rename and Git marker gets a separate operation ID. Unknown outcomes retain their fences.
3. `supply-boundary.mjs` accepts only trusted same-extension page ports, rechecks account identity, dedicated Persona binding, restore hold and guard state, and uses explicitly injected capability gates. The packaged extension installs both provider/Git mutation gates **OFF**. The producer/consumer adapter contract can be tested only with independent fake ledgers.
4. `perchance-supply.mjs` and donor `persona-guard.mjs`/overlay include a fixed isolated-world page executor in a donor-owned Persona tab, short control lease, protected route and account fingerprint checks. Two-stage private/empty create + rename has independent read-only confirmation. **Current integrated live Perchance semantics are unverified**, and the gate remains OFF.
5. `supply-git.mjs` restricts a separate explicit write effect to the private `Neb963/per-gens` main branch, a new `gens/<slug>/DEPLOYMENT.md` with `Status: SOURCE_PENDING`, nonforced expected-head checks and independent post-PATCH blob verification. Provider confirmation is retained as `SOURCE_PENDING` if Git cannot be confirmed. Git permissions or HEAD are not assumed. **No live Git write attempted.**
6. `supply-view.mjs` exposes local preview/freeze and per-item Work Queue receipts with an operator-triggered read-only reconciliation action. No UI-drafted success grants a provider mutation.

## Evidence and holds

- `tests/i00-i06-supply.test.mjs`: pure transition, owner and batch negative cases.
- `tests/i00-i06-executor.test.mjs`: fake account, guarded provider and Git ledgers; markers precede effects, provider ACK is not confirmation, lost-ACK and route failures do not replay.
- `tests/i00-i06-git-marker.test.mjs`: fake Git object/ref/readback, collision, HEAD drift, no READY and lost-PATCH oracle.
- `scripts/browser-i00-smoke.py`: real installed-XPI IndexedDB freeze/collision/port/closed-capability check, without real Perchance or Git requests.
- Full F/B CI and donor regression **must be evaluated on the current exact PR merge candidate**. Earlier cancelled runs and historical F1 prove neither current I06 acceptance nor production readiness.
- Outstanding review: explicitly test/repair cold-wake reconciliation for all three separate effect lifecycles, especially a lost-create acknowledgment without a known temporary identity (must stay held); ensure the current B harness and P56-06 40-item mixed matrix are sufficient. A provider capability remains OFF pending separate H activation evidence.

## Recovery, rollback and next action

Never retry a `DISPATCH_POSSIBLE` or `HELD_UNCERTAIN` effect. Recover by independent protected readback; if temp identity or owner trajectory is ambiguous, retain the item/account hold without reallocating the slug. A lost Git ref update is not proof of failure; inspect remote marker before attributing or repeating anything. Leave `source` pending on Git outage; never publish or write READY.

**Next action:** independently reconcile current candidate CI, close missing P52-02 / P56-06 F/B adverse cases, then obtain trusted protected squash-merge and postmerge main proof only when all mandatory requirements are satisfied. Otherwise keep this draft checkpoint and phase unfinished.
