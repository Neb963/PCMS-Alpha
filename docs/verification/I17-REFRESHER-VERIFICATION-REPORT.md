# PCMS-Alpha I17 source-save Refresher — operator-test candidate

Outcome: **IN_PROGRESS_CHECKPOINTED**. The production source-save path is implemented and executable. Authenticated live Perchance acceptance and independent governance approval remain pending; PR #20 stays draft, unmerged, with auto-merge disabled.

The combined XPI implements `GUARDED_SOURCE_SAVE` / `html_prefix_v1`: explicit exact-source consent, one native Save of a replaceable HTML comment, a durable canonical intent/dispatch journal, independent owner/public/full-source readback, separate structured recent-feed evidence, bounded recovery, signed per-target qualification and the existing single active/sleep scheduler. Native ACK is not source confirmation; source confirmation is not a ranking guarantee.

## Source and package binding

- Repository / PR: [Neb963/PCMS-Alpha #20](https://github.com/Neb963/PCMS-Alpha/pull/20).
- Runtime checkpoint: `b7e3c376c7fd2241fd28a9951982f353a4a01800`.
- Runtime tree: `7735ea7c5c883ca23f51653cc9ed55c3e249940f`, verified through connected GitHub ref/commit readback and matching local Git tree.
- Main rechecked: `34a5c48fbfac6c15ef86a453668b3b353402ab18`.
- XPI: **662,727 bytes**, 182 ZIP members, Gecko ID `persona-route-manager@local`.
- XPI SHA-256: `c4361e704006235affaa6e24cfe7171cf39e1378091c5970726cd35efdcbf871`.
- Two independent local serial builds match. The runtime checkpoint's independent CI logs two further builds with exactly this hash. CI artifact `pcms-alpha-i00-xpi` (final artifact identity in `PROVENANCE.json`) (outer Actions artifact digest differs from the inner XPI digest).
- The delivered package's final documentation checkpoint and CI are bound separately in `PROVENANCE.json`; documentation does not alter the XPI.

## Executed automated evidence

Runtime checkpoint [CI 38805139754](https://github.com/Neb963/PCMS-Alpha/actions/runs/38805139754) is **SUCCESS** at exact head `b7e3c376c7fd2241fd28a9951982f353a4a01800`:

| Required job | ID | Result |
| --- | --- | --- |
| baseline | 116663925525 | SUCCESS — 29/29 signed originals |
| fast | 116663925135 | SUCCESS — 415 tests, donor regressions, reproducible XPI |
| firefox | 116664372147 | SUCCESS — persistent installed production/native/UI/cold-wake and full inherited B |
| pcms-required | 116665403386 | SUCCESS — all mandatory children checked |

CI artifact `pcms-alpha-i00-xpi`, ID `12005763061`, contains the matching XPI. The inner XPI digest is confirmed independently by both build logs and the installed-Firefox log. No downloaded-artifact byte comparison is implied.

Local serial F/X regression: **415/415 PASS**, zero failed/skipped tests, approximately 4.7 seconds. This includes exact full-byte marker insertion/replacement, unchanged PJS/binary assets, unrecognized-source and approval/rollback holds, dirty/human/collaborative/owner/listing/source negatives, independent saved/no-persist/absent/partial/stale/429/lost-ACK oracles, detached-signature positive/negative cases, actual offline key/sign helper, restored-consent/key revocation, 80% observed storage-pressure hold reconciliation context drift and source/owner/restore authority renewal. A fresh preview cannot carry old consent, test proof or scheduling qualification into a new context; explicit fresh consent advances its epoch. Existing 50-account/1,000+ queue/capacity/grace/backpressure/restore/clock oracles remain included.

Persistent installed Firefox Developer Edition **154.0b10**, geckodriver **0.36.0**, disposable profiles only:

| Boundary | Observed result |
| --- | --- |
| Real `entry.mjs` registered port and existing Refresher UI → donor shared lease/protected proxy → fixed MAIN/ISOLATED executor → native save | Exactly one independently counted save, exact marker post-hash, public owner/source readback and separate present/rank/time receipt |
| Same installed XPI, signed reviewer/resource qualification → recurring adapter | Sequence 2 replaces the single marker; unchanged functional bytes |
| Native ACK but no persistence | INEFFECTIVE; not confirmed or automatically retried |
| Persistence but complete recent snapshot absent | Source confirmed, ABSENT from that snapshot; scheduling held |
| Lost native ACK with persisted bytes | Independently confirmed without another save |
| Dirty editor / real IDB dispatch-commit abort | Zero native saves |
| Concurrent one-shot commands | One admitted intent; other request fenced |
| Save followed by unavailable source readback, then full Firefox process restart | Same DISPATCH_POSSIBLE intent reconciled by reads only; independent ledger stays one save; immutable intent/dispatch/marker records exactly once |
| UI | Exact preview/consent/test, mismatch rejection, keyboard focus, reload, redacted Blob receipt export, canonical review challenge, local measurement, key pin, signed import, schedule enable/disable and revoke pass |
| Inherited full browser suite | Supply, source/Git/AI/release, backup/restore, real alarm, event-page and persistent restart, two-view CAS, responsive/keyboard UI all pass |

All network/native provider effects use an independent loopback-only HTTPS fixture and protected CONNECT proxy with an explicit host allowlist. Global unmanaged Block stays on. No production credentials, real Perchance/Mullvad/Cloudflare writes, private generator-repository writes or Firefox Dev MCP were used. The factory fault matrix exercises the actual packaged adapter/executor with isolated low-level route witnesses; the separate registered-entry UI and process-restart probes use the actual donor shared lease and protected route.

## Measured resource envelope and limits

These are isolated point samples, not provider allowances, production throughput, peak RSS/CPU, long-duration fleet acceptance or proof of unlimited storage.

- 50 accounts / 1,250 generators; at most two concurrent monitoring reads and one source save under the shared exclusive lease.
- Local full-browser observer scenario: 3,820 ms; canonical runtime snapshot 2,709,294 serialized bytes; queue peak 1,248.
- Local full-browser 1,250-row IDB delta: 638,976 bytes.
- Local matched Firefox process-family samples: 675,924 → 906,952 KiB summed RSS and 235 → 285 CPU ticks; these are before/after process sums, not a peak.
- Same-XPI source qualification fixture: eight local core turns, 1,213,252 serialized bytes; observed local elapsed samples 111–139 ms. Browser storage usage/quota is recorded separately.
- Holds at observed usage ≥80% of available quota; IDB commit abort prevents native dispatch. Marker lineage is capped at 4,096 revisions before explicit archive/source review. Provenance and previous-good pins are not silently evicted.
- Final runtime CI point samples: 3,985 ms observer scenario; 647,168-byte 1,250-row IDB delta; matched Firefox RSS sums 993,420 → 1,101,348 KiB and CPU ticks 316 → 368. Full installed-browser scenario elapsed about 121 seconds, excluding setup/downloads.
- Existing capacity/hysteresis, Pauses, operational-time evidence, 24h active/72h minimum sleep defaults, account grace, FIFO/refresh fairness, rate limits, startup burst bounds and one coalesced alarm are retained. Absent/unknown/ineffective effects hold repetitive saves; read-only probes are capped at three.

## Preserved work and first causal failures

All runtime files whose names contain Supply remain byte-identical to initial PR head `4787240733862f114f38f133e31786a204cb3f4c`. The earlier CI failure `I06_EFFECT_IDB_PROBE_FAILED: RENAME admission INVALID_PARAMS` predates this task. Its first cause was a browser fixture throwing on the paused repair's new read-only PREFLIGHT_CREATE/RENAME v2 contract; Create failed, then Rename received an undefined revision. Only the obsolete fixture was repaired, and the causal Create error is now reported explicitly.

All 29 signed originals and all 223 original donor files/pinned tree verify unchanged. Required workflows, permissions, required-job aggregation and donor source are unchanged. The additive dated amendment records the operator's narrow comment-only save clarification without re-signing archived specifications.

## Remaining external acceptance

Only the operator/local agent may perform authenticated live H tests. Follow the included H-04 guide on one explicitly approved, owned, listed disposable generator. Capture exact before/source/feed evidence, save once, independently verify exact persisted bytes and complete recent snapshots, then stop. A positive snapshot alone does not establish legitimate unlimited repeated use. Scope-limited recurring opt-in requires independent permission/efficacy review, a pinned detached signature and the measured resource envelope; the same XPI already supports that promotion, disable and revocation path.

Live H-04 efficacy/provider permissibility, the existing H-series UX acceptance and independent governance sign-off are not claimed. No external coding/build blocker remains. Do not merge until those existing gates are satisfied.
