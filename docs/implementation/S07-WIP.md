# S07 — Integrated Refresher engineering and acceptance record

**Engineering status:** implemented on PR #30; exact-head D, B, and H verification required. **Live Perchance recent-page effectiveness and sustained multi-day host operation remain separate, unclaimed acceptance evidence.** This is not a claim of live L PASS.

Authority: accepted PCMS-Alpha Client Contract C-54/C-55, AC-14/15, T-02/07/08, E-01/04/07, Stage 7 SLICES and protected I17 quarantine. S06 base: `056b831130e272c3ea13a4e0b21531d6e3b9421e`.

## Operator result and real entrypoint

The installed background Refresher observes the authenticated current public recent-generator feed under an existing S01 protected Persona and uses canonical IndexedDB to track actual owned occupancy separately from scheduler slots. Active/public/owner-verified generators remain untouched while observed on the feed. A newly complete independently observed disappearance is the preferred opportunity for **one** controlled source-marker save. After a save, PCMS independently reads the persisted **full source**; only a later independently complete recent-page read can verify returned placement. A saved-byte ACK is never a feed-success claim. Unverified, ineffective and repeated writes are held, not churned.

The operator can choose a 24-hour eligible active window and at least 72-hour eligible sleeping window. Sleeping generators ordinarily remain public and do not receive routine refresh. Oldest eligible generators rotate into observed limited capacity; the scheduler tracks 1,000+ generators and does not mistake allocated slots for actual public-page placement. The dashboard works without being open for background alarms.

**Production activation:** read-only recent-feed and statistics observations and bounded native-clock accounting are wired into `src/runtime/entry.mjs`. The fixed I13 guarded HTML-marker writer is implemented and wired, but its **automatic source-save capability defaults OFF** in canonical `policy.refreshEnabled`, including all legacy policies. The user must explicitly enable it in the Refresher dashboard. Canonical dispatch rechecks the current persisted opt-in **after** source preparation, so turning it OFF before dispatch prevents the write. This setting is not bypassable by messages supplying proofs or raw source.

## Protected observed-time method (E-04)

PersonaMonkey supplies an already-protected route/container and context-fenced cached route test; the original native process supplies Linux MONOTONIC/BOOTTIME counters, original native process/pipe lifetime and consecutive sequence. These are real available capabilities. A proposed independent prospective **continuous coverage certificate** is not supplied by the donor and is not necessary for bounded conservative operation.

For each eligible time credit, the reducer requires consecutive samples from the **same** original native pipe, no suspend/clock discontinuity, matching protected route/container/exit at both endpoints, canonical verified account/principal binding, and a fully accepted current feed sample available **at or before the interval begins**. Only awake time in the bounded interval (maximum two minutes, minus uncertainty) is credited; stale, incomplete, rate-limited, changing route/principal, disconnected native process, disabled/paused or unknown intervals freeze. It does not silently infer continuous remote availability between network observations or use elapsed wall clock after restart.

Existing S01 route upkeep uses its original alarm at 10-minute cadence to renew the donor's 15-minute cached route-test evidence, without a new supervisor or new routing interface. Canonical feed/store completions do not destroy an unrelated original native witness; an explicitly missing native sample does. Synthetic long-span timing tests prove arithmetic at D, not empirical 24h/72h uptime at H/L.

## Exact guarded source and recovery

- Fresh complete feed and confirmed absent generator; owner, binding, protected route, public release, reviewed source, no dirty editor, no review/unlisting hold.
- Full immutable current previous source is compared with the provider-owned source. The only permitted difference is a trailing `<!-- pcms-alpha-refresher:... -->` comment in `index.html`. Neither PJS nor assets are rewritten during the Refresher save.
- The original PersonaMonkey conflict lease and I13 protected MAIN editor perform the save; durable canonical `RESERVED` becomes `DISPATCH_POSSIBLE` before the possible write. A lost ACK, wake, or browser restart is reconciled **only by readback of the existing intent**, without another execute.
- Independent post-save full-source readback verifies exactly the sealed target fingerprint and correct principal/owner. Wrong source, other collaborators, dirty/foreign source, drift, revoked route, visibility failure and uncertain saves hold safely.
- Even when saved bytes match, no further marker save is admitted until fresh complete-feed evidence establishes reappearance and another independently observed disappearance occurs. Source/marker lineage supplies exact previous source P for subsequent S06 review/update; publication F remains immutable.
- Read-only fixed monitoring/source-readback tabs are temporary and protected by the exact Persona/container/route. Cleanup may close only PCMS-owned, inactive, clean, collaboration-safe tabs. Existing human tabs are left untouched.

## Public feed and rate limits (T-08)

The fixed read-only `/api/getGeneratorList` adapter denies advertised continuations, malformed responses and other incomplete feeds. A newer partial or failed read invalidates the last complete snapshot as *current authority* while retaining its historical occupancy for diagnostics. Out-of-order older failures cannot erase a newer complete read. HTTP 429 for this shared public endpoint has **unknown scope by default**, so `Retry-After` applies to the endpoint/request class across Personas: PCMS never switches account/route to evade the limit. Independently budgeted other request classes may continue. A reset action cannot override this canonical endpoint cooldown.

## Diagnostics and tests

The UI distinguishes ACTIVE versus SLEEPING, current feed presence versus historical occupancy, unknown eligible time, verified saved source versus actual feed placement, and ineffective/ambiguous effects. Redacted emergency diagnostics report the guarded-enabled mode and possible source-write dispatch counts instead of claiming zero mutations after activation.

Deterministic source/IDB/clock tests cover restart, sleep, expired or mismatched route, source drift, existing collaborator, partial feed, 429, source save lost ACK, ineffective effects, stale feed observations, interleaving opt-out before dispatch and duplicate-replay prohibition. Packaged-Firefox B and isolated native-host H tests run under the trusted `pcms-required` CI check. **Each CI PASS must be tied to the exact current PR head.** CI D/B/H does not manufacture provider L evidence.

**Remaining external evidence, not another S07 code prerequisite:** one explicitly authorized disposable live source save and independent public recent-page observation, plus sustained 24h/72h observed occupancy and real host restart/route availability where applicable. Historical API schema cannot by itself establish equivalence to today's complete recent page; this remains empirically unverified until tested under authorization.

No live Perchance generator/source, private `per-gens` Git repository or operator Persona was modified during this engineering work. Original I17 quarantined operations remain isolated. S08 is not started.
