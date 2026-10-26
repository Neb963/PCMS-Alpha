# Autonomous remediation F0–F4

Operator assignment: 2026-10-26, full sequential F0–F4 implementation and one final XPI. This checklist follows the existing repository implementation-note convention. Product authority, CI protections, sole PersonaMonkey routing authority and I17 quarantine are unchanged.

Baseline: `main` `06ccf102097e238154fef51787269c398ee6b1b0`, tree `4b828f3658f2b5bc8ada43b5c3ccbe3469848db6`, v1.2.16. Main required CI `40242122542` passed. Audit PR #63 is open/draft at `dedb3031fd0a04ea0c0152a641c18cf1ef63bb31`; preserve its sole audit file and evidence. Historical PR #20 remains untouched. No overlapping active repair PR existed at preflight.

## Program checkpoints

- [ ] F0: executable cross-domain recovery/state/notice inventory, negative drift checks, integrated verified PR.
- [ ] F1: donor-first startup, account reconciliation, bounded event wake, preparation uncertainty, on-demand idle recovery.
- [ ] F2: independent bounded workers, fair creation, hydrated authorization transitions, redacted durable receipts.
- [ ] F3: contextual actions for every notice, historical read-only template inspection, single UI controller, truthful Git errors, paged missing sources and causal groups.
- [ ] F4: integrated D/B regression, persistent installed Firefox, upgrade, exact required CI/main, reproducible higher-version XPI, checksum and one short live-acceptance guide.

`scripts/recovery-inventory.mjs` generates `docs/verification/F0-RECOVERY-INVENTORY.json`; `--check` and `tests/i00-f0-recovery-inventory.test.mjs` detect vocabulary drift. The inventory specifies recovery owners and settlement requirements; it does not assert that existing UI paths or open GAP corrections already pass. F1–F4 must exercise actual handlers and authoritative readback.

## GAP implementation/evidence checklist

| GAP | Root cause / affected production files | Correction | Tests / evidence | Status |
|---|---|---|---|---|
| 01 | Independent startup imports: entry, account boundary, enrollment, overlay | Donor-owned readiness through account-specific protected admission | Delayed donor/helper/proxy, scoped isolation, restart | OPEN F1 |
| 02 | Historic reason has generic operation detail: operation-context, faithful bridge, perchance-supply | Read-only current template/provenance check; permanent historical fence | Old/missing template, owner denial, zero CREATE/RENAME | OPEN F3 |
| 03 | Incomplete notice destination resolver: faithful attention/bridge | Typed contextual recovery, stale/missing targets and safe holds | All 11 × target/current-state matrix, real actions/readback | OPEN F3 |
| 04 | Host Check connection does not reconcile account state: accounts workspace/boundary | Fresh per-account route/identity after shared recovery | Shared recovery + one unsafe account | OPEN F1 |
| 05 | Only 10-minute upkeep polling: account boundary, donor native state | Coalesced bounded wake, backoff/fairness and fallback | 1/3/50 accounts, no duplicate preparation | OPEN F1 |
| 06 | Serial alarm progression: catalog-watch, domain progressors | Independent bounded domain/scoped progression preserving source ordering | Reject/hang each stage; independent ledgers | OPEN F2 |
| 07 | One serial creation pending promise: creation-watch/runner | Bounded independent scope work and durable observational timeout | Hung account + 1,000 items, lost ACK, no replay | OPEN F2 |
| 08 | No grant-transition scheduler hook: standing authority, ai-boundary | Trusted transition subscription and immediate scheduler reconciliation | Boot OFF → grant → progression, revoke/regrant | OPEN F2 |
| 09 | Abort signal does not settle native await: overlay/native-prepare/enrollment | Bound observations, retain possible native ownership until settlement | Never-settle, late ACK, restart, no conflicting prepare | OPEN F1 |
| 10 | Multiple mounted UI workers: index.html, operations and legacy views | One primary controller, isolated compatibility readers | Actual primary workflows, no obsolete native/vault advice | OPEN F3 |
| 11 | Browser token errors labeled vault: catalog-watch, Git local secret/UI | Stable cause-specific browser/Git classification and observed recovery | Six causes, preserve valid credential, no false clear | OPEN F3 |
| 12 | Missing-source queue rows have no actions: faithful bridge/source | Contextual source/history/current scan/identity inspection | Actual action-to-readback; no provider deletion | OPEN F3 |
| 13 | Silent missing slice(0,30): faithful bridge/catalog | Exact counts and bounded paging/search | 31/1,000+ fixtures, all entries reachable | OPEN F3 |
| 14 | Primary incidents ignore causal grouping: faithful bridge/attention model | Shared-root groups with counts and individual inspection | One helper outage/50 accounts vs independent holds | OPEN F3 |
| 15 | Async grant hydration misses alarm init: standing authority/AI | Same trusted transition after hydration/cold wake | Cold worker, no onStartup, invalid/revoked records | OPEN F2 |
| 16 | Donor idle-stop vs headless work: donor overlay/enrollment/workers | Allow idle-stop; donor safely reestablishes before due protected work | 15+ minutes, scheduled creation, 24h/72h/no false credit | OPEN F1 |
| 17 | Empty catch and success-only wake receipt: catalog/creation/account | Per-domain bounded redacted attempt/success/checkpoint/retry/cause | Reject, suspend, partial failure, grouped Attention | OPEN F2 |

## Evidence and limits

No code correction, F-stage completion, B/H/GIT/L or final-release PASS is claimed by initial inventory. D baseline and new tests are recorded as run. Personal profiles, real Mullvad, private generator repository and live provider mutations remain outside engineering test scope. No intermediate user-facing XPI.

### F0 integration prerequisite discovered by required CI

The expanded inventory covers 297 state records in 17 domains and 99 notice/target/current-state cases. It records the actual current destination resolver as well as required recovery, explicitly identifying the remaining GAP-03 generic fallbacks. Direct, array-based and declarative transition vocabulary drift fails the inventory check.

Required run `40324123061`, candidate `38e31e590a786365db2ba09a36acb969169987b5`, passed baseline, full deterministic/donor/reproducible-package checks and persistent upgrade, then **FAILED** the existing J07 saved-view workflow. The XPI was byte-identical to baseline (`7b416d1379ac2dad05516335cb9950e08a680fb45e6c4abf1c75081a0a27099b`); this is an integration prerequisite, not a claimed F0 runtime regression. No blind CI rerun or assertion removal.

Investigating the actual save path produced two red deterministic regressions: queued filter persistence read later mutable UI state, and browser storage property reordering made identical display settings fail raw JSON readback. Corrections capture an immutable filter snapshot and compare normalized supported display values in both client and trusted background readback. Missing records, changed values, stale revisions, restore holds, credential exclusion and non-authorizing boundaries remain checked. The actual installed J07 click suite now also injects property reordering only for presentation metadata; it must save/apply/reopen the same views. This narrowly necessary UI repair is included before F0 integration. Final exact-head CI remains required.

Focused Node 22.16.0 verification: **12/12 passed**, including four presentation regressions, three inventory checks and five retained presentation/restore/CAS tests. A persistent isolated installed-XPI probe with reordered presentation reads completed **16 cycles** of built-in selection followed by saved-view Apply after the correction; the old package could not save the same view under that cut. This local browser probe used the content-sandbox substitution described below. The failure diagnostics now retain a bounded classification and dialog context so any further required-browser failure is identifiable rather than silently retried.

Local environment qualification: Firefox 154.0b10/geckodriver 0.36.0 were obtained; the normal content sandbox cannot start in this container (`/proc/self/uid_map: EPERM`). An isolated persistent addon-manager upgrade succeeded only with `MOZ_DISABLE_CONTENT_SANDBOX=1`; it is qualified developer evidence, not normal-sandbox acceptance. CI supplies the required normal-sandbox tier. The existing 100001-row archive fixture also exceeded its 180s local limit under Node 22.16.0 (eventually materializing all rows); no local scale PASS is claimed and its timeout/expectations were not weakened. Required CI's pinned full D lane passed that fixture.

F1 pre-repair reproduction at original source: a deliberately nonsettling donor probe remained pending while the durable route projection still said `PINNED`. Preserve ownership, add bounded visible observation, and never use timeout as native cancellation.
