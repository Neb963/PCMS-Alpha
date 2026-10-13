# I12 — scoped completion proposal (shadow-only)

> This is a **pre-merge implementation proposal**, not a postmerge acceptance marker, live-provider PASS or permission to activate mutating capabilities.

- `phaseId`: `I12`
- `planRevision`: `S7-AUDITED-DESIGN-1`
- `intendedClaim`: `SCOPED_IMPLEMENTATION_COMPLETE_SHADOW_ONLY`
- `evidenceTiers`: `F`, `B`, `X` (synthetic/adversarial and actually installed Firefox; **not** H or live provider)
- `phaseTests`: P51-07; P54-01/02/03/04/07/08/10/11; S6-I12-SLEEP-LISTED; S6-I12-DISPATCH-STAGGER
- `capabilities`: `REFRESHER_SHADOW_ONLY`; `REFRESH_MUTATION_OFF`; `PROVIDER_MONITOR_ACTIVATION_OFF`; `PUBLICATION_OFF`; `NO_NEW_GIT_AI_OR_PROVIDER_AUTHORITY`

## Implemented boundary

One canonical revision/CAS-fenced durable shadow queue and ordered due index; phased active/sleep interval budgets credited only on guarded, non-replayed evidence; per-account 60-minute evidenced grace; global, account and generator Pauses separate from route/owner/review holds; hysteretic estimated capacity with no incumbent eviction; bounded staggered oldest-eligible admission. A single coalesced Firefox alarm is repaired across process restart. Guarded read-only recent-list/metrics executor, bounded request quota, independence-aware provider classification, adaptive backoff and view/correction retention are present but the **production observation gate defaults OFF**. Fleet paging, inspection, revision-fenced operator settings, redacted diagnostics and notices are wired. The normal generator inventory, stale listing, operator ownership override or a simulated feed cannot confer a confirmed publication release.

The read-only monitor uses isolated Perchance-origin GETs under donor Persona/routing/session checks, with bounded response size and strict schema; production observation is not activated. Only the actual overlapping service interval may count as operational evidence; ten-minute polling gaps, closed Firefox, unverified route/session, nonindependent exit domains, service errors and ambiguous replay **do not** count. No automatic Perchance save/unlist/refresh, page publication, private `per-gens` mutation or native bypass exists in I12.

## Executed evidence (pre-proposal code checkpoint)

- GitHub PR #14 merge-candidate Actions run `38474740198` (the candidate merging the then-current branch into `main`): `baseline`, `fast`, `firefox`, `pcms-required` all **SUCCESS**. F tests **220/220**, 0 failures, 0 skips. Pinned donor regression suite and reproducible package build passed.
- Actual permanently installed combined XPI in a disposable Firefox Developer Edition **154.0b10** profile: `I12_PACKAGED_IDB_INTERVAL_CAS_FLEET_OBSERVER_AND_HELD_PORT`, `I12_PACKAGED_REFRESHER_PAGING_PAUSE_INSPECTOR`, `I12_REAL_ALARM_WITHOUT_DASHBOARD`, `I12_PERSISTENT_RESTART_BUDGET_PAUSE_SINGLE_ALARM_REPAIR` all **PASS**; inherited real-browser/donor guards also passed.
- Exact built XPI SHA-256: `43b0ab26872695577f78cdb4c1f3db3dbfea78b44270f8070476003f293c5695`. The separately uploaded *artifact ZIP* has a different digest; it must not be mislabeled as the inner XPI.
- Synthetic capacity/resource evidence: F 50 accounts / 1,250 generators, 78 ms reported in the CI fast run and 916,061 serialized bytes; B packaged Firefox 50 / 1,250, 2,723 ms and 2,166,801 serialized bytes. These are fixture measurements, not production throughput or memory SLOs.
- Fault oracles cover duplicate alarm/wake and interrupted observation, corrupt IDB/abort, stale revision and rebind, replayed/out-of-order/overlapping intervals, paused/review-held sleep, account-vs-global outage, nonindependent exits, 429 and malformed provider samples, stale statistics, capacity/no-preemption and forged UI requests. No provider remote effect was claimed or performed.

All entries above describe **the executed previous PR candidate**. This documentation-only completion proposal is a new branch commit; require a successful fresh final-merge-candidate required check before squash. Independently verify active ruleset and exact head immediately before merge, then observe actual merged `main` and postmerge checks. This proposal contains no self-referential PR-head SHA or future merge SHA.

## Narrow holds / future acceptance

- Implementation blocker: **none identified** for I12's `SHADOW_ONLY` boundary after the above F/B/X checks.
- Activation hold: historical Discovery v3 schema is not current provider evidence. Production read-only monitoring remains explicitly **OFF** until an independently justified guarded activation and current compatibility check. The UI must say unknown/stale, never imply live monitoring.
- Final operator/H hold: no operator H-04/live refresh efficacy, H-01/H-07 usability, provider authority or production-capacity acceptance is claimed. I13 handles exact-source publication approval; I14 handles permissible effective **mutating** refresh; I17 owns measured integrated load. The full effectful portions of the shared P51/P54/P56 tests remain subject to their later owning phase gates, not retroactively called PASS here.
- Fail-safe: no Direct fallback, no protected-route bypass, no automatic replay of uncertain effects, no dirty-editor write, no assumption that HTTP 200 or list rank proves a mutating refresh. Donor Gecko ID `persona-route-manager@local` and pin `9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf` preserved.
