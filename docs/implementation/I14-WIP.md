# I14 — scoped implementation completion proposal (live refresh OFF)

> **Pre-merge proposal, subject to exact final-candidate CI and postmerge proof.**
> This is not a live provider efficacy PASS, final H-04, activation authorization
> or production readiness. The attached GitHub PR/body and current protected-main
> Actions are the only sources of final merge/run SHA claims.

- `phaseId`: `I14`
- `planRevision`: `S7-AUDITED-DESIGN-1`
- `intendedClaim`: `SCOPED_IMPLEMENTATION_COMPLETE_MUTATION_DISABLED`
- `primaryTests`: P54-05; P54-06
- `supplementaryAssertions`: S6-I14-BOUND-RETRY; S6-I14-REFRESH-PROOF
- `testTiers`: F; packaged Firefox B; adversarial X, conditional H-04 not claimed
- `capabilities`: LIVE_REFRESH_OFF_UNTIL_PROVEN; PROVIDER_MONITOR_ACTIVATION_OFF;
  PUBLICATION_OFF; NO_DIRECT_FALLBACK; PRIVATE_PER_GENS_WRITES_OFF

## Integrated, guarded implementation

1. A per-generator canonical IndexedDB evidence record tracks timestamped
   independent complete/fresh recent-list observations separately from saved
   effects. Rank is only an observed, timestamped fact. One missing entry is
   not a deletion or sufficient to suspend. After three comparable,
   independently spaced complete snapshots in healthy and verified account/
   owner/release context, visibility suspension releases the shadow slot,
   preserves the remaining active budget and original oldest-eligible order,
   and emits a scoped event. Incomplete, stale, unhealthy or paginated evidence
   does not count. Verified reappearance clears a visibility-only suspension,
   without preempting any current incumbent.
2. The conditional dispatcher is called from the I12 single scheduler turn,
   uses the donor's cached protected-route guard before/after admission and
   post-effect readback, and rechecks canonical owner, binding, release F,
   listing, slot, review holds and account principal before recording the
   possible-dispatch journal. The dispatcher is not accessible from the UI
   port. Production supplies no verified mutating mechanism, no provider
   adapter and a closed activation gate. Merely changing UI settings, save
   HTTP status or feed rank cannot activate it.
3. A fixture-qualified method requires an explicit known permissible
   EFFECTIVE provider operation, current version/source fingerprint and
   evidence ID. Canonical steps reserve, persist `DISPATCH_POSSIBLE` before
   any external effect, and independently read back actual persisted effect.
   Save acceptance, no-op/comment edits and list presence alone do not prove
   an effective refresh. An ambiguous dispatch cannot repeat: cold-wake
   reconciliation is readback-only, capped to three probes with persistent
   cooldown. Safely undispatched stale reservations may be aborted without
   touching the provider. A bounded two-attempt budget and exponential
   cooldown avoid a mutating retry storm; after uncertain or ineffective
   effects a scoped hold is maintained.
4. The Refresher/Overview projection labels mutation as disabled, counts
   visibility-held targets, displays per-generator attempts, presence,
   persisted effect outcome and independent feed state. Redacted event
   codes, preserved canonical revision checks and old I12 scheduler paths
   remain in place. Never infer publication, owner, rank or continuous
   visibility from an HTTP ACK, dirty editor or stale list.

## Evidence requirements and holds

- F/X implementation coverage: `tests/i00-i14-refresher.test.mjs` and
  `tests/i00-i14-boundary.test.mjs`: unknown/unsupported/drifted methods,
  no-op ACK, ineffective unchanged bytes, independently changed source with
  absent/unknown or rank-43 feed, stale/paginated/incomplete observations,
  repeated independent absence, reappearance, route change before dispatch,
  wrong principal/target, lost ACK, restart readback-only recovery, bounded
  probes/retries, stale undispached reservation recovery and off-gate denial.
- B: `scripts/browser-i00-smoke.py` runs against the actual installed
  combined XPI in persistent Firefox Developer Edition. It verifies current
  canonical IDB denial without phantom writes, closed runtime port capability,
  Refresher/Overview proof projection and inherited I12 restart/queue/alarms
  with other previously required browser regressions. Do not mark B PASS
  until final-candidate Firefox CI actually succeeds.
- CI trust roots and pinned donor commit
  `9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf` unchanged. The new imported
  evidence reducer is explicitly packaged by the XPI overlay and statically
  regression checked. Required `pcms-required` aggregation is unchanged.
- **Implementation disposition:** conditional on green, matching F/B/X
  final-candidate and postmerge evidence; no claim of live provider behavior.
- **Activation hold:** historical Discovery v3 does not prove a currently
  permissible effective Perchance mutating action; no real candidate
  qualified. Protected provider observations also remain separately OFF by
  default. Any independently justified one-target operator H-04 requires
  separate approval and is not a prerequisite for implementing this
  fail-closed fallback. I17 owns measured fleet-wide rollout gates.
- **Final acceptance hold:** no provider/H-04, live account effects,
  filesystem/disk-archived proof or production stress claim. Do not use
  historical provider observations as a current mutation-capability warrant.
