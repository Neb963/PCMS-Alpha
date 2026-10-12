# PCMS-Alpha — Stage 6.0 Implementation Strategy

**Date:** 2026-10-12  
**Status:** Stage 7 RECONCILED; S6-Q01–Q06 accepted (all recommended A), with the operator's Q04 cost/quality clarification. This document does **not** authorize implementation, repository initialization, remote provider actions, or changes to GitHub.

## 1. Purpose and precedence

Define the future coding-agent execution model and the engineering constraints used when Stage 6.1–6.5 design implementation phases, CI, agent instructions and merge governance. Stage 7 reconciled the plan, with corrections in the Stage 6.5 audited documents and Stage 7 audit.

Authority ordering: explicit accepted PCMS product decisions (Stages 1–4 and later amendments); Stage 5 verification-design contracts and actual evidence; accepted architecture invariants; this implementation-process design; phase-specific plans. A technique failing in practice is grounds to repair the implementation architecture, **not** grounds to silently change the product's safety contract.

The Stage 6 handoff's G6-0–G6-6 are preliminary implementation groupings. Do not equate them with design Stage 6 or freeze them prematurely. The 56 P51–P56 tests and UX tests are **specified acceptance contracts**, not yet completed runnable tests. Final Stage 5 Verification Specification, Decision/Evidence Registers, Test and Failure Matrix and Operator Acceptance Plan were located and reconciled in Stage 7; all remain test designs, not runtime proof.

## 2. Agreed strategy decisions

| ID | Decision | Operational consequence |
|---|---|---|
| S6-Q01 | Vertical slices with end-to-end UI/test where feasible | Keep minimal foundational work, but get a functional user path early. No large late UI integration phase. |
| S6-Q02 | Auto-merge when independent GitHub CI, current-main integration, and product gates pass | An agent cannot self-attest that a check succeeded. Require evidenced result for the exact current commit. |
| S6-Q03 | Resume prior unfinished phase before selecting another | Reconcile an open branch/PR/failed run and work state before making new changes. No orphaned duplicate implementation. |
| S6-Q04 | Risk-based, efficient CI with a mandatory CI engineering instruction | Unlimited public-repo minutes are not a license for poorly designed flaky or redundant checks. |
| S6-Q05 | Scoped blocking; unaffected ready phases can progress when dependencies permit | Fail closed for a dangerous feature, without halting unrelated work or misrepresenting progress. |
| S6-Q06 | Reproducible installable XPI per accepted phase, test proportionate to changes | Artifact must be associated with verified source commit, donor provenance and test tier. Packaging is not live acceptance. |

## 3. One-agent lifecycle

1. **Resolve source of truth.** Read current `main`, `AGENTS.md`, the canonical phase plan, applicable accepted design/tests, CI instruction, outstanding PRs, latest CI and relevant donor compatibility evidence. Use present repository state, not remembered SHAs.
2. **Select exactly one phase.** Resume an unfinished branch/PR for the next incomplete phase before choosing another READY phase. A new phase must have accepted prerequisites. Detect unexpected concurrent write activity; do not clobber it. No claim registry, hash ceremony or distributed lock service.
3. **Implement a thin complete increment.** Modify any *necessary* affected file, including shared code/tests/CI, as long as the work is causally required for the assigned phase and preserves accepted behavior. Include an operator-visible path where practical; use feature gates for unsafe or unverified external effects.
4. **Test in increasing cost order.** Reproduce targeted failures locally or in small fixtures, then run necessary regression and packaged-Firefox checks through GitHub. Follow `docs/engineering/CI-ENGINEER.md` whenever defining/changing tests, fixtures, CI or acceptance mappings.
5. **Commit and open/update one reviewable PR.** Record change rationale, requirements/test coverage, affected boundaries, artifact, reproducible evidence, remaining limitations and any narrow architecture correction. Do not invent PASS or treat a skip as evidence.
6. **Accept or stop.** Auto-merge only after required CI, latest-commit/merge-base checks and all applicable phase gates are green. Produce a reproducible XPI and update minimal phase status on accepted `main`. If blocked, retain safe branch/PR, attach diagnostic evidence, leave risky functions disabled and stop. Never start the next phase automatically in the same invocation.

**Authorization model:** After Stage 7 is explicitly accepted and implementation is separately enabled, a single standing authorization should cover the accepted roadmap plus necessary compatible repairs. The operator should not have to re-authorize each routine bug fix, CI change, prerequisite correction or merge. That authorization does **not** extend to live provider operations, destructive external changes, material requirement changes or disabling established safety invariants. The future operator command can stay: **“Implement next READY phase.”** A short AGENTS entrypoint must contain enough guidance for a fresh agent to find this protocol and the design sources.

### Minimal state model

Keep one ordered phase manifest containing stable IDs, objectives, dependencies, requirement/test mappings and capability gates, plus proposed completion records committed through phase PRs. Represent planned work as `PLANNED`, `READY`, `BLOCKED` or `ACCEPTED`; active progress comes from the actual branch/PR and GitHub checks, not an independently writable claim database. `MERGED_AND_VERIFIED` is derived only from externally observed protected merge plus postmerge verification, not an in-file self-referential SHA; a green PR is not itself accepted. Missing history or contradictory status => no second parallel phase; reconcile from Git and CI evidence.

## 4. Bounded authority instead of repeated permission requests

| Class | Future agent autonomy | Examples / boundary |
|---|---|---|
| Ordinary phase work | Do, verify, commit, merge when gated | Features within phase, shared interfaces, relevant UI, tests, docs, CI improvements and bug fixes. |
| Necessary architecture repair | Do with an explicit in-PR correction note and regression proof | A missing guarded interface, broken wake bootstrap, faulty journal schema, or a prerequisite exposed during integration. May touch files nominally belonging to another planned phase. Preserve behaviors, reversibility and compatibility. |
| Dependency/phase plan adjustment | Propose and update a narrow, justified dependency correction in the same change when it does not redefine product scope | Split or reorder an implementation phase, fix a false dependency or test gate, document impacts and reconciliation. No elaborate approval registry. |
| Product/safety decision, risky external action | Stop, explain alternatives and request operator decision or separate authorization | Weakened fail-closed route guard, silent publication, unverified ownership write, destructive migration, private `per-gens` initialization/write, changing user-approved behavior, live Perchance/Mullvad work, hard-to-reverse state changes. |

**Architectural correction rule:** The agent may repair a faulty implementation approach—even across internal boundaries—when the result still satisfies the accepted requirements and is covered by tests. It must describe the contradiction, alternative, minimal correction, migration/rollback if applicable, and downstream tests in the PR. The agent must not use a broad "architectural cleanup" as permission to rewrite unrelated features. If no safe compatible repair is clear, stop on the exact decision, not a vague demand for unlimited authorization.

**CI trust-anchor rule:** The agent may add and improve normal tests and workflows autonomously. A change that weakens/removes a required check, changes the protected required-check aggregator, widens workflow credential permissions, or rewrites authoritative acceptance/agent-safety policy cannot be auto-accepted merely because the newly edited CI reports green. Keep a narrow independently protected merge rule or require explicit operator review for those exceptional gate-changing diffs. This avoids self-grading CI without demanding approval for routine test repairs.

**Failed CI rule:** Diagnose the first causal failure. Run or inspect the smallest reproducer before revising CI. Do not remove assertions, mark tests optional, mask failure, or increase retries simply to produce green. Rewriting a broken *test* is allowed when its oracle is demonstrably wrong, but preserve or improve coverage of the underlying requirement.

## 5. Verification and time efficiency

Use a small set of defined proof tiers:

| Tier | Runs and evidence | Trigger principle |
|---|---|---|
| Fast | Static checks, affected unit tests, deterministic provider/Git emulators, targeted donor/security contracts | Every code PR, fast feedback; relevant tests chosen by explicit impact mapping |
| Browser | Actual packaged Firefox Developer Edition lifecycle/UI/identity tests and donor regressions required by the changed boundary | Every browser-critical change and applicable acceptance phase, not every unrelated documentation edit |
| Full integration | Cross-system failure matrix, complete regression suites, recovery, load/scale benchmark and accessibility coverage where executable | After dependency milestones, on main/nightly where useful, and before final product acceptance; also immediately for changes that invalidate global invariants |
| Operator live | Short H-01–H-07 procedures only when required by the enabled capability and not already proven by cheaper evidence | Explicit, separate operator-run acceptance; never an unattended public CI job |

A single stable required PR CI gate should always report a truthful outcome, including when some tests are inapplicable. The gate must fail when required coverage was accidentally omitted, a prerequisite job failed/skipped improperly, or no relevant test was executed. Avoid path-skipping the entire *required* workflow: GitHub may leave required checks pending. Treat cached binaries/artifacts as untrusted until associated with exact source and toolchain provenance.

Optimize **wall-clock feedback and failure diagnosis** before chasing runner-minute savings. Use baseline timings, measured critical path, safe parallelization, dependency caching, distinct failure artifacts, and cancellation only of genuinely superseded PR runs. Do not cancel the authoritative `main` acceptance run. Do not assume a previously green commit remains green after a later commit/merge-base change.

Every browser job gets a clean disposable profile, pinned Firefox build, expected Gecko/native-host identity, strict timeout, deterministic cleanup, and redacted logs. Emulation and live Firefox are complementary; a fake background wake cannot prove event-page cold wake, while real browser UI smoke alone cannot prove remote idempotency.

## 6. Evidence and recovery

Acceptance evidence must distinguish `SOURCE_EVIDENCED`, `SIMULATED_PASS`, `PACKAGED_FIREFOX_PASS`, `OPERATOR_LIVE_PASS`, `BLOCKED` and `NOT_TESTED`. Report test IDs, required scope, executed tier, commit and XPI hash, environment, fixture, expected/actual, negative fault cutpoint, independent oracle, sanitized artifacts and remaining risk. Do not turn Stage 5 documents into executable PASS by naming them.

The Git PR and commit history are the journal of *development work*. The product's IndexedDB operation journal is different and must retain its own safety semantics. A new chat must recover only from verifiable GitHub/CI artifacts, not a memory-only progress narrative.

If an accepted feature breaks on `main`, disable its externally effectful capabilities and repair or revert promptly. Do not silently rewrite main history. No git forced updates of `per-gens`; no real remote provider tests in CI; no leaked account secrets, cookies, credentials, generator private source or session artifacts in public logs.

## 7. Stage 6 next design tasks

- **6.1:** derive independently useful implementation slices and dependency graph from end-to-end operator workflows. Account enrollment, UI and safe restore/diagnostics must not disappear between infrastructure phases.
- **6.2:** finalize compact `AGENTS.md` entrypoint and fresh-agent/PR-resumption/stop behavior.
- **6.3:** define the single phase manifest, PR/branch conventions and required/automatic merging without a claim bureaucracy.
- **6.4:** map Stage 5 proof contracts to CI jobs and phase gates; verify CI self-tests, browser harness, timings and artifact retention.
- **6.5:** assemble exact phase contracts, fallback behavior, accepted artifact outputs and the minimal "next READY phase" prompt.

**Stage 7 reconciliation is documented separately; neither this design nor its inclusion in a ZIP authorizes coding.**
