# J02 — API generator name claiming (28 October 2026)

## Operator behavior

From the normal PCMS Generators interface, an operator submits one or more slugs and optionally selects a verified account. PCMS handles protected Persona routing, private temporary creation, name claiming, independent readback, and Git continuation. No native editor, userscript, sidecar service, or second route controller is involved.

## Correct contract

A new slug is a **claim candidate**, not an already-owned object and not a name for which the client can prove global non-ownership. Only Perchance can make the final uniqueness decision when `changeGeneratorName` runs. A negative or unavailable `checkGeneratorOwnership` reply for a new name must not prevent creation.

1. Validate protected Persona/route, canonical account identity, authenticated session, scoped creation authorization, complete owned-generator census, allocation, restore state, and prior operation journal.
2. For a slug present in the selected account's owned census, verify remote identity and enter **adoption**, without creating another generator. For a well-identified existing foreign public page, report **collision** without creating. For a slug not owned here with no confirmed occupied public page, return `CLAIM_CANDIDATE`. An optional failed public-page lookup does not establish ownership or global absence.
3. Recheck the account and target context before any write. Preserve `CREATE_PREPARED` and durable `CREATE_DISPATCH_POSSIBLE` as the single-write fence.
4. `POST /api/save`: create a fresh private/empty copy of the public `minimal` template through the existing isolated-world provider adapter, only under the bound logged-in account. Never use an owned `minimal` as the copy source.
5. Independently verify the temporary generator's authenticated owner, stable remote identity, truly private flag, empty source and manifest. Preserve the temporary identity in the durable journal.
6. Recheck the target for an observable occupied page and revalidate the private temporary generator; do not demand an `is-not-owner` reply for a new slug. Persist `RENAME_DISPATCH_POSSIBLE` before the one `POST /api/changeGeneratorName`. This provider operation arbitrates name uniqueness.
7. Confirm the final slug, same remote identity, owner, private/empty source and disappearance of the old temporary slug through fresh remote readback. Mark provider creation complete independent of later Git availability; continue Git association under its own gate.

## Failure policy

- A known occupied or already-owned slug must not create a duplicate managed identity.
- A lost or rejected SAVE/RENAME response **cannot** mean success and **cannot** trigger automatic replay. Reconcile existing observations; do not invent proof from HTTP status alone.
- Session, Persona route, account principal, authority revision, original identity and operation fences must remain in force.
- A temporary generator can appear in independent owner/page readback before its account inventory includes it; this is not grounds to relax owner/source checks or to reject a verified temp.
- Historical durable `OWNER_MISSING_VERIFIED` / `MISSING_VERIFIED` states remain parseable for on-disk compatibility. They are not new claims of global name availability. The API now reports `CLAIM_CANDIDATE`.
- Keep the original I17 quarantine and never automatically replay a possible historical effect.
- Provider API `save` payload and rename rejection shapes still require genuine disposable live verification. D/B tests alone are not provider acceptance.

## Changed modules

`src/runtime/perchance-supply.mjs`, `creation-runner.mjs`, `creation-effects.mjs`, `src/ui/faithful/generator-batches.mjs`, and their focused tests.

## Evidence required

D: name missing/404/unverified owner, foreign occupancy, owned adoption, one private empty save, temporary ownership, one rename, stale route/session, malformed/read-only failures, lost writes and duplicate prevention. B: the fully enabled installed XPI and its primary batch UI. L: **separately authorized disposable** genuine API creation + independent post-rename readback. Absence of L does not establish live success.
