# A01 — Failure oracles and migration census

**Slice:** A01 only (after merged A00, not A02 implementation).  
**Baseline main:** `d80440dd4eacc9c9613351d5356a63ba7e0cd19b`, tree `4d8aea8ab98952237f34694051ebf5961e5bb912`.  
**PR:** [#40](https://github.com/Neb963/PCMS-Alpha/pull/40), branch `recovery/a01-failure-oracles-migration-census`.  
**A00 postmerge:** required run [39770222764](https://github.com/Neb963/PCMS-Alpha/actions/runs/39770222764) completed SUCCESS: baseline, fast, firefox, pcms-required.  
**Authority:** `AGENTS.md`, client amendment v1.0.1, recovery plan A00–A09, active agent and CI protocols.  
**Actual effects:** Public GitHub source/PR/CI only. No Perchance operation, private `per-gens` read/write, user profile read, native host installation or alteration, route mutation, or generator publication.

## Deliverables and execution

| Component | Production boundary invoked | Independent observable | Permitted outcome |
|---|---|---|---|
| `scripts/a01-product-oracles.mjs` and `tests/a01-red-baseline.test.mjs` | Real Git credential resolver; donor backup source; operator package build path; main UI source; release and clock dependencies | Six directly runnable accepted-product assertions, each independently throwing on baseline; `inspectProductOracles()` records RED versus GREEN without swallowing unexpected runtime errors | R4 RED is **not** product acceptance |
| `tests/i00-a01-oracles.test.mjs` | Real source modules, e.g. `git-credential.mjs`, `creation-intake.mjs`, `journal.mjs` | Actual failure codes, original I17 permanent quarantine, forbidden repeat dispatch/forged ACK, upgrade source/route/credential negative cases | Required regression harness GREEN does not mean product oracle GREEN |
| `scripts/a01-readonly-census.mjs` | Repository source and vendored donor bytes | Deterministic per-file SHA-256, source line numbers, static object-store/key/host symbols, classified dependency locations, explicit unobservable current-profile facts | **Source census**, not an account/profile census |
| `scripts/a01-fixture-preflight.mjs` and `tests/fixtures/a01-recovery-scenarios.json` | Disposable fixture data only | Immutable aliases, 1:1 persona/route checks, exact source bytes/digests, uncertain dispatch and interrupted restore hold, credential exclusion | Inspection only; zero applied migration or remote effects |
| `scripts/a01-package-census.py` | Exact built XPI and matching archived operator package | Gecko ID, donor-only allowed bridge presence, declared optional permissions, `local.pcms.*` package references and shipped legacy helper paths, archive XPI hash equality | Legacy host presence is recorded as debt, **not installed or approved** |
| `scripts/a01-clean-firefox.py` | Actual persistent XPI in fresh disposable CI HOME/profile with pinned Firefox | OS-observed process exit/reopen, same Gecko ID, UI shadow mounting and all six read-only primary views, browser storage/alarms access | B/H **only when same-head CI succeeds**; no provider or existing user-profile proof |

The prior bundled `scripts/browser-i00-smoke.py` remains active in the required Firefox job; the additive clean-home probe is invoked afterward. `scripts/build-operator-package.mjs` records its exact operator archive after deterministic packaging. No CI workflow, required-check selector, minimum test gate, donor source file, signed Stage 7 file or runtime capability was changed.

## Known P0 assertions (baseline source observations)

Running the assertions on the 2026-10-22 R4 baseline produces `ASSERTION_RED` for:

1. **Git credential**: normal Git resolution calls `local.pcms.backup_vault` rather than a browser-local background-owned credential store. Actual resolver read path tested with an unregistered-native-host fault.
2. **Backups**: shipped original donor `options/data-management.js` contains password/encryption dependency.
3. **Distribution**: operator archive builder still includes additional `backup_vault`, `backup_v2`, diagnostic browser helper and witness assets.
4. **Primary UI**: main bridge delegates routine operations to legacy hidden controller.
5. **Publication**: current main UI explicitly states approval is not the actual publish effect.
6. **Refresher**: old qualified-clock source references native witness/monotonic identity.

**Evidence label:** source-confirmed and/or deterministic production-module reproduced. Not a measured failure against a user's actual Perchance account, Git token, disk archive, Mullvad host or final enabled XPI. Actual fixes belong to A02–A08 and must satisfy these assertions without deleting them. The separate standalone `node --test tests/a01-red-baseline.test.mjs` is intentionally red on baseline; it is deliberately *not* included in the required green `tests/i00-*.test.mjs` glob. The green harness invokes the same assertions in-process and reports their RED results.

## X-01–X-14 and AC traceability

`tests/fixtures/a01-recovery-scenarios.json` contains every X-01 through X-14 ID, its A-slice owner and AC reference **as explicitly mapped in the merged recovery plan/RECOVERY-SLICES.json**. It never pretends A01 proves those adverse product outcomes. Each is `NOT_TESTED` until its feature slice completes the corresponding executable positive, negative and recovery path.

**Missing historical detail:** the complete original Part 8 X-01–X-14 scenario prose was not committed with the merged plan. Working topic labels in the JSON are illustrative derived groupings, not quotes or replacements for that original source. Any exact scenario mapping beyond the accepted A-slice/AC matrix remains **UNVERIFIED**. Future evidence may incorporate original prose if independently recovered; that cannot justify fabricated PASS now.

## Migration census scope and hold policy

Scanned **source** classes include: IndexedDB schema operations; browser local/sync/session storage; cookies, contexts, userScripts and GM state; donor `com.persona.mullvad_router` bridge; all `local.pcms.*` references; credential/backup cryptography; `public_<id>` and `slug-<name>` identities; source fingerprints and journal/recovery statuses. Returned matches are path, digest, symbolic key or limited source-line indices only, never browser data.

Synthetic upgrade fixtures cover: fresh detached profile; previous aliases with one account/persona/route; source snapshots and old IDs; an operation in `DISPATCH_POSSIBLE`; an interrupted restore with base64 source bytes and historical exit fixture. Negative preflight refuses duplicate route/Persona, invalid source bytes, exported Git token and automatic reconciliation of possibly issued provider effects. All fixture addresses/data are synthetic, not operator state.

**Do not migrate:** actual user IndexedDB databases, Firefox containers/cookies, historical source, unsettled journals, current route bindings or previous host registrations remain **UNKNOWN** until passively inspected with explicit machine/profile authority. An unknown original I17 journal does not authorize replay. The permanent original `batch_e2c328e54f9c4a6ab89f1084134fde52` / `pcms-test-esr-chain-20261015-a01` no-auto-CREATE/RENAME quarantine is preserved.

## Evidence tiers and no-go

- **D:** required test runner executes the read-only census, six separate product assertions and negative fixture/journal/identity checks; each actual result must be taken from current-head CI, not from this prose.
- **B:** clean-home persistent Firefox and original packaged smoke, installed exact XPI and all six routes, only after same-head Firefox job succeeds; DOM/route availability is not provider effect.
- **H:** disposable CI Firefox process death/relaunch is an OS-level observation when logged. User host bridge/route/reopened disk backup is **NOT_TESTED**.
- **GIT:** public PCMS repo source/PR and CI are verified via GitHub integration; private generator-repository Git read/write is **NOT_TESTED**.
- **L:** actual Perchance operations **NOT_TESTED**, never run from this slice.

R4 XPI with its legacy host package remains historical rollback/debug input, **not an acceptable final release**. The accepted native-free single-XPI product is not implemented by A01. No activation or publish authorization follows from this evidence.

## Reproduce and inspect

```sh
node --test tests/i00-a01-oracles.test.mjs          # D green harness
node --test tests/a01-red-baseline.test.mjs         # expected RED on R4
node scripts/a01-readonly-census.mjs > census.json  # read-only repo inventory
node scripts/build-i00.mjs
python3 scripts/a01-package-census.py build/pcms-alpha-i00.xpi
node scripts/build-operator-package.mjs              # deterministic tar + exact census
# With pinned Firefox/driver in an isolated disposable CI environment:
python3 scripts/a01-clean-firefox.py build/pcms-alpha-i00.xpi
```

All results must be tied to exact commit/tree, toolchain, XPI digest, test logs and artifact. Never conflate source scan with runtime inventory or installed Firefox with authorized provider actions.

## CI and review

- R4 baseline preserved; original A00 postmerge main `d80440dd...` and run `39770222764` verified.
- First A01 fast failure was a **test-orchestration defect**: nested `node --test` did not provide asserted output under the parallel suite. Replaced with shared in-process production assertions plus a separately runnable red suite. No product safety assertion was dropped.
- Current candidate results, exact XPI digest and merge/postmerge verification must be populated from final same-head GitHub checks before A01 can be called merged-and-verified.
- Active `main` ruleset `24945151` verified: pull-request route, strict `pcms-required` status (integration 15368), review-thread resolution and no bypass actors. No required CI selector or ruleset changed.

**Next action:** require current-head D + packaged B/H success; review the actual final diff and protected status; squash-merge if permitted, verify new main tree and postmerge required CI, then stop. Do **not** begin A02 as part of this slice.
