# I04 — Owned generator inventory (in progress)

Base protected `main` at `9bdb0797693393ed876b26fbeef9fdb5aae8bb26` after I03 postmerge F/B/aggregate success (run 38310528640).

Only I04: read-only guarded Perchance inventory/positive ownership boundary, durable canonical reconciliation with unknown-not-deleted states, operator inventory search/paging. Preserve separate account session proof and owner proof; editKey/collaboration cannot substitute. No live Perchance, private Git, native mutation or provider effects.

Production account identity observer is unverified in I03. Any inventory sync without independently verified session and current protected route must be explicitly held; no synthetic provider ownership claimed. Tests and B evidence are required before proposing phase completion.

## I04 provider readback compatibility — qualified but held

The archived operator evidence (September 2026 Perchance provisioning and October 2026 F1) records read-only `POST /api/getGeneratorsByUser` with `email, sessionToken` returning `status:success` (including a legitimately empty account); `POST /api/checkGeneratorOwnership` with `email, sessionToken, generatorName` returning `is-owner`, `is-not-owner` or `session-token-error`. These are **undocumented provider internals**, not a permanent contract and not evidence of today's behavior.

`src/runtime/perchance-readback.mjs` now strictly classifies their historically observed response shape, differentiates edit permission from positive owner status, refuses challenges/session mismatch/partial inventories, attaches account/binding revision and de-identified observation IDs, and expressly marks a slug-only remote locator (no unproven immutable provider ID). Its transport callback keeps credential access OUTSIDE the module and returns no email/token. F tests distinguish positive and negative statuses; none are LIVE or H.

**Blocking trust boundary:** Accepted Stage 3 prohibits exporting the page-held Perchance token. No donor-owned, independently qualified, same-origin page observer has yet been demonstrated to authenticate the current page session, pin the right Persona/route/lease through all asynchronous reads, and return server-evidenced results without allowing a hostile page to forge them. There is no supported, audited read-only donor executor in the current I03 facade. The interpreter is therefore **not wired to production**: I03 identityReader and I04 inventoryReader still fail closed by default. The mere existence of the pure validator, and its fake transport, are not permission to label the owner VERIFIED.

**Required to enable:** separately qualify a fixed donor-owned protected-page reader with exact request/response schema (success, wrong account/token, collaboration-only, challenge, partial list, route loss, page navigation, replay, 50+ account isolation) and session secret non-exfiltration at real packaged Firefox B, then conduct the minimum authorized operator session/ownership H acceptance if the provider ambiguity survives offline tests. No write or Direct fallback. Do not initialize private per-gens, alter CI trust roots, or turn on producer effects in this phase.
