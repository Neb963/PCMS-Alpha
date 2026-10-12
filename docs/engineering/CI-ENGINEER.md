# PCMS-Alpha — CI Engineering Contract

**Proposed future repository path:** `docs/engineering/CI-ENGINEER.md`  
**Status:** Stage 6.0 base plus Stage 6.4 verification-design addendum; not installed in GitHub or active CI. Stage 6.4 S6-Q22 accepted and Stage 7 reconciled; no implementation or CI installed.  
**Invocation:** A future `AGENTS.md` and every implementation-phase instruction SHALL require the coding agent to read and apply this file **before creating or changing any test, fixture, test harness, CI workflow, workflow script, browser harness, acceptance mapping, or required-check policy**. Reading it is mandatory; spawning a second CI agent is optional and does not transfer responsibility.

## Role and objective

Act as the **CI Reliability and Verification Engineer** for PCMS-Alpha. Optimize for **truthful evidence, deterministic failures, short feedback loops, reliable Firefox testing and understandable recovery from CI failures**. GitHub Actions capacity may be generous; operator time, developer throughput and trust in PASS results are not.

Never optimize for a green badge by hiding, weakening or skipping a requirement. A PR that edits its own gating CI cannot be considered independently verified merely because its edited check is green. Changes to protected required-check definitions, CI permission scope, or acceptance-policy weakening require review through a trust anchor outside the modified PR (or targeted operator approval). Ordinary test/CI improvements remain autonomous. Never build a massive generic test framework when a direct fixture and explicit assertion suffice.

## Required method for every test/CI change

1. **Identify the contract.** Read the assigned phase and relevant accepted Stage 1–5 requirements, the current CI/test inventory, pinned PersonaMonkey donor regressions and runtime architecture. Record exactly which invariant, failure mode or behavioral boundary is being tested. Do not assume the 56 Stage 5 P-tests already exist as executable tests.
2. **Choose the smallest truthful test boundary.** Prefer pure state-machine and adapter tests for deterministic logic; an independent fake Perchance remote-effect ledger and Git tree/HEAD emulator for effects and conflicts; virtual clock for scheduling; packaged Firefox Developer Edition for event-page suspension, startup, guard/route revocation, tab/editor ownership, real extension permissions and UI behavior. A simulated browser callback is not evidence of real Firefox cold wake.
3. **Design positive and negative oracles.** For side effects, assert durable intent, dispatch-may-have-occurred, separately observed remote effect and UI projection as separate facts. Inject lost responses, stale observations, process death, owner mismatch, dirty editor, HEAD drift, quota/locked vault and rollback where relevant. A test must fail for an actual violation of its target invariant. Avoid tests that only check that functions were called.
4. **Map scope to cost.** State why each test belongs in fast PR, targeted packaged-browser, milestone/full integration or operator-live acceptance. Estimate expected feedback cost from *measured* baseline or mark unknown until measured. Do not launch multiple overlapping Firefox suites because they are easy to configure; parallelize where isolation permits, but protect the critical path and prevent profile/native-host cross-talk.
5. **Implement minimally.** Reuse existing fixtures and donor regressions. Make test data synthetic, deterministic and isolated. Reset remote fake state independently from PCMS IndexedDB to expose accidental blind replay. Maintain explicit fixtures for Firefox versions, Gecko ID, packaged XPI hash, manifest permissions and native-host expectations. No real Perchance/Mullvad/Cloudflare manipulation, no production accounts, and no private generator repo writes in CI.
6. **Prove the test itself.** Exercise the principal negative case (red) and expected behavior (green); check local syntax, build and workflow events before paying for long Firefox runs. Verify tests do not silently pass when the target feature is missing, a conditional job is skipped, a dependency fails, an oracle throws, or the fixture never exercised the intended path.
7. **Preserve prior evidence.** Never delete a failing donor/security assertion or weaken required checks without an explicit explanation, equivalent-or-stronger replacement and same-PR regression proof. Removing duplicate tests requires demonstrating equivalent coverage and reduced cost. Do not use `continue-on-error`, broad retries, blanket test skipping or unbounded timeouts to disguise instability.
8. **Report compactly.** In the PR, record: requirement/test IDs, execution tier, affected and unaffected coverage, newly added or changed assertions, failing cutpoint, reproduction command, local/CI status, runtime comparison, artifact names, XPI/commit/browser versions where applicable, remaining coverage and environment limits. `NOT_TESTED` and `BLOCKED` must never be presented as PASS.

## Required CI shape

| Layer | Typical content | Policy |
|---|---|---|
| Always-on PR gate | Workflow validation, build, static/type checks, affected fast tests, essential donor safety regressions; coverage selector/aggregator | Stable check name; must run for every PR and detect missing required jobs or invalid skip/selection |
| Risk-triggered packaged Firefox | Pinned packaged XPI and real Firefox Developer Edition; event-page cold wake/restart, extension guard/permission/identity, UI behaviors touched by the PR | Required before merging browser-critical changes; preserve independent logs and clean profiles |
| Broader integration | Full donor+PCMS regression, adversarial remote fakes, restore failure matrix, fleet/clock load, accessibility checks as available | Milestone/main/nightly and when a PR touches shared safety primitives; a discovered failure must be repaired before the affected feature is accepted |
| Operator-only validation | Minimal approved H-01–H-07 procedures | Never run from public unattended GitHub Actions; do not claim live PASS from fakes |

Always build an installable XPI tied to an accepted phase commit; attach traceable hashes/provenance. Packaging alone never proves live operation. Keep one primary required PR status check rather than requiring path-filtered workflows whose skipped checks remain pending. The summary check must inspect the relevant child results, including failed, canceled, missing and improperly skipped jobs. Do not let a skipped dependency yield a misleading green aggregate.

## Firefox-specific discipline

- Test **the packaged extension**, not an unrelated development script. Pin/log exact Firefox Developer Edition build, XPI digest, donor SHA, expected `persona-route-manager@local` Gecko identity, extension manifest permissions and test harness revision.
- Use disposable isolated profiles, browser processes and mocked native-host/route boundaries. Never share a persistent real operator profile, cookies, WireGuard secrets or native configuration.
- Prove lifecycle cases against real event-page suspension/cold wake and full browser restart. Distinguish tab closure, page suspension, process crash and Firefox shutdown. Validate the state after rehydration rather than inferring persistence from an in-memory callback.
- Exercise unsafe-state invariants: route/guard unavailable => fail closed; browser/editor owner ambiguity => no conflicting mutation; missing source/readback => no release; ambiguous effect => independent reconciliation before retry; restore incomplete => controller inactive.
- Avoid repeatedly launching full browser matrices before cheap failures are resolved. Use focused smoke first and only broaden after the relevant path stabilizes. Run required packaged-browser coverage on the final PR revision.
- Apply job timeouts, cleanup, failure screenshots/logs and version-pinned browser installation. A flaky browser test must be fixed or demonstrably isolated; blind retry is not an acceptance substitute.

## GitHub Actions efficiency and security

- Begin from current official GitHub Actions and Firefox tool documentation when deciding syntax/runner behavior. Validate triggers and permission boundaries; do not copy historical workflows blindly.
- Use least-privilege tokens (`contents: read` by default), immutable pinned third-party action revisions where practical, locked toolchain/dependencies, safe artifact provenance, and no secrets in logs or public XPI artifacts. Do not execute untrusted PR code in a privileged `pull_request_target` or other elevated workflow.
- Cache pinned dependencies and reusable browser binaries where reliable; key by lockfile/toolchain/browser version. Do not let a cache artifact become a substitute for build provenance or taint privileged CI.
- Cancel only superseded PR checks, not `main`/final required acceptance. Avoid duplicate `push`+`pull_request` runs for the same branch unless they prove different things. Distinct workflow/job naming prevents accidental cross-cancellation.
- Never use whole-workflow `paths` exclusions for a required status check. Keep a stable required workflow/check, select applicable jobs inside it, and explicitly assert selected mandatory coverage. Validate branch rulesets against actual check names and event types before enabling auto-merge.
- Capture elapsed time by job, slowest critical path, retries, flaky failures, setup/download overhead and diagnostic usefulness. Simplify repeated setup and redundant browser sessions first. Optimize for earliest reliable answer, not minimum job count or maximum concurrency.

## Failure triage protocol

When CI fails: classify **product regression**, **test/oracle defect**, **environment/toolchain fault**, **runner/infrastructure fault**, or **flaky race**. Inspect exact job, commit, logs and first causal error. Reproduce using the narrowest test. Fix the cause and rerun the smallest affected set first. Escalate to broader regression only after the local mechanism is understood. If a bug proves a planned interface/design assumption false, make a bounded architecture correction within phase authority and add the regression test; do not close the issue as "out of scope" solely because it crosses a source directory boundary.

Do not auto-merge on stale, canceled, missing, partially skipped, or inconclusive checks. A green CI is evidence of the checks performed, not proof that absent tests passed. Record uncertain capability as disabled and maintain its explicit follow-up gate.

## Required self-review before considering CI work done

Can the relevant defect actually turn the check red? Is an actual wrong-account or double-effect observable independently of PCMS state? Are Firefox claims tied to a packaged real Firefox run? Does a required check still report accurately on docs-only, failed-dependent-job, canceled, and browser-applicable PRs? Is the runtime reasonable based on measurements? Can an operator diagnose failure from redacted artifacts? Does the build/CI avoid external secrets and production provider mutations? Did this change preserve or strengthen inherited donor regressions?

**Pass only when those questions are answered by evidence appropriate to the phase.**

## Stage 6.4 addendum — mandatory practical rules

**A. Treat verification selection as testable production behavior.** Maintain one stable `pcms-required` aggregate check that runs for all PRs (no workflow-level path exclusions). Its selector maps changed risk boundaries and phase acceptance to exact test IDs. It must fail if a selected job is missing, skipped, canceled, unsuccessful or ran against the wrong candidate SHA. Conditional skipped jobs can appear green in GitHub; this is not permission to infer executed test coverage. Require a final-candidate browser gate before enabling PR auto-merge, even if draft WIP fast checks were green. Validate ready-for-review events, the checked-out merge candidate and `main` movement.

**B. Distinguish Firefox temporary and persistent installation.** A temporary `web-ext run`/about:debugging installation is removed on full Firefox restart and cannot prove persistent installed-extension recovery. For full-restart proof, test an actually installed, exact packaged XPI in a disposable Firefox Developer Edition profile configured for permitted unsigned installation (extension Gecko ID, explicitly tested `xpinstall.signatures.required=false`). Assert the same add-on is present after process relaunch *before* claiming wake/rehydration PASS. Always log install mode and verify the exact Firefox binary/version.

**C. Make CI-policy changes an exceptional, independently enforced path.** A PR controlling its own test commands/workflow can self-award a green result. Changes to CI required check/aggregator/selection, protected acceptance mapping, workflow privileges or agent safety policy must disable auto-merge until an actually independent reviewer/trusted main-sourced rule approves. A same-account connector is not an independent reviewer. If this cannot be reliably enforced in the actual repository, report it as a bootstrap prerequisite; do not waive the invariant. Routine fixture/test improvements and necessary compatible architecture fixes require no operator ceremony.

**D. Reconcile all 56 Stage 5 contracts once in the phase map.** Source of detail: `PCMS-Alpha-Stage-5-Test-and-Failure-Matrix.md`. The Stage 6.4 draft maps every P51–P56 test to a primary phase, with earlier subcase proofs and later integrated reruns. Never label the whole P-test PASS from one partial assertion, or elevate `SIMULATED_PASS` to packaged/live evidence. Generate a machine-checked uniqueness/completeness report when making the final Stage 6.5 acceptance map.

**E. Keep the human burden near zero until late acceptance.** Automated synthetic/provider/Firefox work belongs in CI. H-01/H-07 are last-stage UX/checklist operator sign-offs; H-06 only for migration activation; H-02–H-05 are conditional. No repeat of the previously successful F1 private-first create/rename experiment or automatic live testing with real accounts. Live provider writes require narrowly approved disposable targets and offline gates first.

**F. Preserve remote durability separately from test outcome.** Push meaningful checkpoints through the connected GitHub integration, confirm remote ref/tree readback and keep an early draft PR. WIP may be red; only fully proven phase source may merge. Failure of GitHub publishing must be reported as `REMOTE_CHECKPOINT_PENDING`, never as a completed backup of work. CI must never be given private generator source or provider credentials merely to improve coverage.

**G. Optimize by measured cause.** Record median/p95 run latency and failure root cause per F/B/X tier. Prefer early cheap failures, one isolated Firefox process for related tests, browser package caching and targeted reruns. Avoid blind retries, broad `continue-on-error`, or invented hard runtime thresholds. Future agent must compare current platform documentation to the design before writing workflows.

The controlling detailed design is `PCMS-Alpha-Stage-6.4-CI-and-Acceptance-Architecture-Draft.md`, not a permission to implement the pipeline before Stage 7.

## Sources to check during future CI implementation

- Accepted PCMS Stages 1–5 and the final Stage 6 phase/acceptance design (once approved).
- Current PersonaMonkey donor source and existing regression suite at its specified pinned revision.
- Current GitHub Actions official documentation: workflow syntax, required status checks and skip behavior, concurrency, artifact/caching security, token permissions.
- Current Mozilla extension event-page / Firefox Developer Edition testing documentation.

## Stage 7 accepted amendment

Apply all 56 Stage 5 P-tests as future contracts, plus the **31 supplementary `S6-Ixx` checks** in `docs/engineering/REQUIREMENT-TRACEABILITY.md`. Additional checks must be executed, with independent oracles where needed; their names alone confer no PASS. The phase proposal marker may never contain its own PR commit SHA, future CI run ID or future squash SHA; bind them externally using the actual trusted GitHub run and postmerge commit. Before I06/I07 makes any *application* `per-gens` Git marker/archive write, run the relevant early safety subcases of P53-04/05 even though full-source Git writeback belongs to I11. General fleet mutating Refresher additionally requires I17 measured P54-09/appropriate P56 acceptance.
