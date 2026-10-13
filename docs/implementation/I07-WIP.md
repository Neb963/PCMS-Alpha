# I07 — Existing generator adoption (in progress)

**Phase contract:** I04/I05 dependencies; P52-03 and S6-I07-ORIGINAL-ARCHIVE/TOMBSTONE; F/B evidence. **No operator H/live provider acceptance claimed.** Repo baseline: I06 protected main `00f9aea4bc36ea2b090588282e153f35ae247c6a`.

## Committed implementation

- Current-identity and exact-inventory-revision admission for owned public/unlisted generators. Explicit public adoption consent, read-only double observation, and immutably retained local original PJS, HTML and bounded `src/` asset bytes/fingerprints in canonical IndexedDB.
- Donor same-XPI lease and protected-route observer; read-only Perchance owner status and exact source/asset request. Unsupported, oversized, stale or inaccessible original assets stay held rather than faking completeness.
- Canonical per-generator consent and archive history, durable local tombstone (no remote deletion). Exposed through Generators and Work Queue, redacted projections, no source contents in UI or diagnostics.
- Explicit private `Neb963/per-gens` Git archival intent to an append-only `originals/<slug>/<fingerprint>/` subtree. Verified private repo/main, non-overwrite, SHA1 Git blob + SHA256 bytes, nonforced ref move and independent postmove blob readback. New source folder gets only a NOT READY marker. Ambiguous Git effect requires read-only reconciliation; journal records DISPATCH_POSSIBLE first. Pre-dispatch cancellation only.
- No ordinary Perchance source writes, publication, source overwrite, fallback Direct or bulk mutating automation.

## Evidence and acceptance holds

- F: Phase-specific strict slug/consent/source-byte/asset cases, protected original-readback fixtures, emulated Git archive collision/lost-response/corruption cases are committed. GitHub Actions fast test results, not source existence, determine executed PASS.
- B: Packaged real Firefox tests are delegated to existing independent required CI; their reports must be checked for the current candidate, including donor regression. Do not claim actual operator/live acceptance.
- X: Independent negative oracles include credential injection, account/slug identity conflict, asset corruption, archive collision, ambiguous lost PATCH and forged sender. Required actual executed evidence remains to be verified.
- GitHub archive is operator-explicit and requires a private token, protected Persona and current canonical checks. A future use with an inaccessible CDN file or changed Perchance schema holds the affected target.
- An adopted public generator is not publishable merely because consent/original archival succeeded. Ordinary release, editor safety, verified READY and exact-source approval remain separate I09/I13 gates.

**Status:** `IN_PROGRESS_CHECKPOINTED` until current-candidate trusted tests and postmerge main proof succeed. Draft PR #9 remains unmerged while incomplete. Preserve original source and stop when authority is uncertain.
