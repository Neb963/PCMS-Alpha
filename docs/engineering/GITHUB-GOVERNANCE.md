# PCMS-Alpha — Stage 6.3 Minimal GitHub Governance and Remote Checkpoint Design

**Prepared:** 2026-10-12  
**Status:** STAGE 6.3 DECISIONS ACCEPTED — S6-Q13–Q21 accepted; design remains subject to Stage 7 consistency audit. Not installed.  
**Scope:** Future implementation repository governance, durable remote checkpoints, protected CI acceptance, recovery and merging. **No code implementation, GitHub mutation, provider action or authorization to deploy.**

## 1. Decisions and evidence boundary

**S6-Q13–Q17 ACCEPTED:** early draft PR; one serialized agent; compatible cross-cutting architectural repair permitted; safely park blocked phases while independent work proceeds on later invocations; acceptance only on validated protected `main`, without an extra mutable claim registry.

**Additional operator clarification — binding:** **“Unpublished valuable work is considered at risk.”** A local commit is useful but **not** a durable GitHub checkpoint. Future implementation agents MUST use the connected GitHub integration to publish incremental commits to a phase branch, confirm remote object/ref readback, and create/maintain a draft PR. They MUST distinguish `LOCAL_ONLY`, `REMOTE_CHECKPOINT_CONFIRMED`, and `MERGED_AND_VERIFIED`.

**Read-only observation on 2026-10-12:** GitHub connector returned `Neb963/PCMS-Alpha` **public**, `size: 0`, `default_branch: main`, administrator/push access, `allow_auto_merge: false`, squash-merge allowed. `default_branch` does not by itself establish an existing branch/ref/commit. Earlier Stage 5 documents reported no initial implementation. The connector offers `create_branch`, `create_blob` (UTF-8/base64), `create_tree`, `create_commit`, `update_ref` (non-force, expected SHA), `create_pull_request(draft)`, `enable_auto_merge`, merge, and readback methods. **Having tool capabilities does not grant present permission to call mutating endpoints.** Capabilities and branch protection must be rechecked during separately authorized Stage 7+ bootstrap; auto-merge is currently OFF.

GitHub documentation confirms protected branches/rulesets and auto-merge are available for public repositories on Free; actual account/repo settings control availability. Required checks must be correctly named and present, and a path-skipped *workflow* may leave required checks pending. Check-run outcomes `skipped`/`neutral` can count as acceptable to branch protection, so the internal stable required gate must explicitly reject improperly skipped/missing mandatory test coverage. A pull request's own modified test workflow is not automatically an independent trust anchor.

## 2. Principles: smallest policy, genuine protections

1. **One public implementation repository** `Neb963/PCMS-Alpha`; one phase branch/draft PR for one active agent. The separate private `Neb963/per-gens` is **application source authority**, not where coding agents checkpoint implementation. Never copy private generator source or credentials to the public repo.
2. **GitHub holds the only durable implementation progress.** Remote phase branch + commit history + PR discussion + protected `main` are authoritative. No claim registry, phase-lock server, contract-hash machinery, phase-specific agents, external status DB or duplicate issue ledger.
3. **One invocation implements one phase and stops.** The serial launcher prevents intentional overlap. PR/base-SHA/ref validation detects inadvertent overlap, but an agent alone cannot guarantee exclusivity without serialization.
4. **Autonomy is behavior-bounded, not directory-bounded.** Compatible architecture repairs, shared files, tests, UI, donor integration and CI are allowed when necessary for the selected phase. Product/security/irreversible external actions retain the existing narrow approval gates.
5. **Checks, not intentions, determine acceptance.** Never infer acceptance from a draft PR, green superseded commit, requested auto-merge, GitHub callback alone, or a locally written phase status.
6. **Minimize operator ceremonies.** Routine commits, PRs, safe compatible repairs and green phase merges are authorized under a future standing implementation grant. Only changes to protected policy/trust anchors, product/security invariants, and explicitly restricted external effects require targeted operator intervention.

## 3. Remote-checkpoint protocol (mandatory future agent behavior)

### 3.1 Publishing one coherent checkpoint

1. Read live `main`, current phase PR/branch and branch HEAD using **GitHub connector**; compare local working inputs and last known HEAD. Never assume stale agent notes are current.
2. Define one coherent checkpoint: a test, interface, implementation, repair, migration or diagnostic improvement. Intermediate non-passing checkpoints are allowed **only** in draft PRs and labeled WIP with the exact known failures. Never publish raw secrets, token-bearing URLs, browser profiles, live AI transcripts, personal data or private generator source.
3. Create/reuse the phase branch. If no remote branch exists, create it from an observed existing commit, not a guessed or empty `main` ref.
4. Publish through the **connected GitHub API**, using `create_blob` for byte-exact text/binary changes, `create_tree` with the observed current tree and explicit additions/deletions, `create_commit` with the **current remote branch head as parent**, and `update_ref` with `force:false` plus the observed expected head SHA; or use verified connector Contents API operations for small single-file commits. Use connector's base64 path for binary files, not lossy UTF-8 conversion. Avoid one-file-per-commit when the change must be atomic and multi-file.
5. On a mismatch/rejected ref update: fetch remote HEAD, compare exact changed paths and parents; reconstruct against current head only if conflict-free, otherwise halt this checkpoint for reconciliation. **Never force push.** No concurrent file writes that race on blob/ref state.
6. Re-fetch **remote** branch HEAD and relevant tree/blob identity; verify it contains exactly the intended checkpoint. A successful API response alone, or an unreferenced Git commit object, is not `REMOTE_CHECKPOINT_CONFIRMED`.
7. Create a draft PR promptly after the first meaningful confirmed branch commit; update its body or a concise PR comment with current phase, tested/not-tested, next step, risk, feature flags and any incomplete state. The PR is the durable continuation notebook, not an extra governance service.

**Frequency:** After each coherent valuable increment, before any destructive/risky refactor, before handoff/context exhaustion, and before voluntarily stopping. As a practical *guideline*, don't accumulate a long development session's worth of valuable unpublished changes; no arbitrary number of token writes or micro-commits is required. Build/test outputs and temporary exploratory noise do not justify checkpoints unless they represent meaningful recoverable work. Checkpoints may be red in a clearly labeled draft; merges may not.

**Unavailable connector:** When remote publication/readback is unavailable, keep local work intact, report `REMOTE_CHECKPOINT_PENDING`, and do not assert `IN_PROGRESS_CHECKPOINTED`. Do not silently substitute local Git for the requested GitHub connector, direct shell credentials or forceful Git API workflows. The next authorized agent may inspect local files *if they survive*, but remote recovery is not guaranteed. A long remote outage should stop further high-value speculative work rather than accumulate a large unrecoverable delta.

### 3.2 First-commit bootstrap exception

As of this design audit, destination repo is empty; therefore normal branch creation, first draft PR and branch protection cannot be treated as already operational. **Only during later expressly authorized implementation bootstrap**, create the initial `main` commit containing minimal governance/README/toolchain scaffolding using a supported initial Contents write, verify `main` exists, configure/verify GitHub protections and auto-merge, then create the first phase branch. This is a **one-time setup**, not a permission request for every later commit. Initializing private `per-gens/main` remains a separate authorized action, not part of generic coding-agent checkpoint bootstrap. Never populate the application source repo as a side effect of CI setup.

## 4. Branches, PRs and merges

- One phase branch `phase/Ixx-short-name`; one canonical draft PR titled `Ixx: <operator-facing deliverable>`. If blocked, retain the branch/PR with a specific, testable blocker and safe alternative eligibility.
- Commits have clear messages; WIP is allowed on remote phase branches. Do not claim PASS or `READY` based on WIP. Prefer **squash merge** as the provisional main-history policy: GitHub PR holds development context; `main` holds one coherent accepted slice. Do not automatically delete the branch until merged SHA, merged tree, required proof and PR evidence are verified. GitHub PR commit history may remain available, but never rely on an unpublished branch for disaster recovery.
- Phase completion is proposed in a PR as one small versioned manifest marker plus test/evidence references. Only **after merge on protected `main`** and confirming that the marker, code and proof correspond to that accepted tree does the next invocation treat it as complete.
- Agent may mark the PR ready and enable auto-merge after applicable required gates are satisfied or pending, subject to protected rules. `enable_auto_merge` success is a request, **not** an accepted merge. Re-query main/ref, PR state and merge SHA. If auto-merge is disabled or protection missing, fail clearly and use the separately agreed safe merge mechanism; no protection bypass.
- Prefer one stable required status/check (for example `pcms-required`) whose actual test-selector and failed/missing/canceled/skipped child jobs are verified. Branch protection/ruleset should require PR path, up-to-date merge validation when needed, no force-push, no deletion, and restrict bypass. A full merge queue is optional and probably unnecessary with one serialized agent; don't introduce it until observed races justify it.
- **No empty ceremony:** phase acceptance is derived from `main`, manifest, and evidence; never separately mark acceptance in multiple issues, a JSON status DB, and a claim register.

## 5. CI trust boundary and rare operator review

**Problem:** If a PR can modify the very workflow/selector that proves its own acceptance, a green result is not independent. `main` branch protection alone proves only that a named status was reported—not that the PR preserved its assertions. This cannot be solved by a self-authored Markdown promise.

**Two change classes:**

**Routine autonomous:** source, tests, fixtures, test optimization, compatible shared interfaces, ordinary CI improvements that preserve required semantics. Each change is traced to the relevant Stage 5 evidence contract and checked with a known-good baseline.

**Protected trust-root change:** removes/renames required status, changes its selector or mapping, weakens donor/Persona security assertions, broadens workflow credentials, alters required-check/branch protection policy, changes agent scope authority, or weakens the approved acceptance manifest. Such PRs are **not eligible for unattended auto-merge** until a separately controlled trust decision. Record the exact previous vs proposed gate, why it is safe, impact on existing phase claims, and a runnable before/after comparison. Require **rare targeted operator approval or equivalent independent protected verifier**; do not demand human review of routine code/test work.

Implementation must make this distinction enforceable with GitHub rulesets/maintainer permissions and, where practical, a trusted **base-revision diff classifier** that treats proposed CI/policy modifications as data and blocks auto-merge of protected changes. Do **not** rely on PR-owned workflow code to certify the classifier itself. Do not execute untrusted PR code in elevated `pull_request_target`/privileged contexts. If no independent mechanism can enforce the classification with the actual GitHub permissions, report the limitation and keep trust-root changes manual—don't claim a nonexistent protection.

**Single-owner caveat:** GitHub generally does not count a PR author's approval as independent approval; and a connector operating as the same GitHub identity cannot manufacture a separate reviewer. Do not mandate unachievable code-owner approvals without arranging a real distinct authorized reviewer or alternative trustworthy gate. A rare policy-change approval is a real operator decision, not an invitation to disable branch protection silently.

## 6. Recovery, failure and rollback

| Scenario | Correct behavior | False shortcut |
|---|---|---|
| Local changes exist, not published | Treat as `LOCAL_ONLY` at risk; publish safe coherent checkpoint when able, otherwise `REMOTE_CHECKPOINT_PENDING` | Mark session recoverable merely because `git status` clean or local commit exists |
| Remote Git API returned a commit SHA but ref update failed | Commit object may exist without reachable branch; fetch branch ref, reconcile; do not label remote checkpoint | Assume `create_commit` means remote branch contains it |
| Ref update reply lost/ambiguous | Read remote ref/tree and compare intended commit; don't duplicate blindly | Retry forcefully or stamp commit as confirmed based on transport timeout |
| PR CI failed | Keep draft, inspect the first causal failure; scoped repair and re-run | Remove or weaken failing test, run entire Firefox matrix repeatedly |
| Main advanced after PR checks | Verify merge candidate/current-base tests and require refreshed evidence where affected | Treat green old branch head as proof of new merge tree |
| PR auto-merge requested but no merge yet | Poll/read actual PR and main state at the next supported interaction; report still in progress | Declare phase completed because auto-merge was turned on |
| Protected CI policy change needed | Park as non-auto-merge; record targeted approval and baseline comparison | Let modified workflow self-validate and auto-merge |
| Regression found after merge | New narrowly scoped repair/revert PR against current main with test evidence; preserve accepted history | Force-reset main or rewrite previous tests as PASS |
| External effect remains uncertain | Keep application capability held, use journal/read-only reconciliation; implementation PR success never erases uncertainty | Mix GitHub source control with runtime remote effect state |

**Stop outcomes** (refinement of Stage 6.2): `MERGED_AND_VERIFIED`, `IN_PROGRESS_CHECKPOINTED` (**requires verified remote branch**), `BLOCKED_SAFELY` (with remote checkpoint if changes exist and connection permits), `NO_SAFE_PHASE`, plus report qualifier `REMOTE_CHECKPOINT_PENDING` for locally retained but unconfirmed work. This qualifier is **not** an additional governance status ledger.

## 7. CI efficiency and operator evidence boundaries

All code changes require fast deterministic tests and applicable donor safety regressions; relevant Firefox-critical changes require real **packaged Firefox Developer Edition** automated tests on the final candidate. Do not run all long Firefox tests after every small draft checkpoint: keep cheap fast PR checks on evolving draft and execute the relevant browser scope for final readiness and on meaningful affected changes. Test selection needs a coverage oracle; a passing skip is not proof. Full integrated suites on accepted milestones/final, triggered earlier for shared high-risk changes. The 56 P51–P56 contracts are **not executed evidence** until implemented/running.

Manual operator cases remain **late and minimal**: H-01/H-07 for overall human acceptance; H-06 for fresh-profile activation acceptance; H-02–H-05 only as narrow conditional residual provider/host proofs. A proven F1 creation happy path is not repeated. A local or GitHub Actions emulator run does not authorize live Perchance/GitHub-source/Mullvad effects. Capability-specific activation remains separate.

## 8. Stage 6.3 accepted decisions

| ID | Recommendation | Rejected alternative / cost |
|---|---|---|
| **S6-Q18** | **ACCEPTED:** Remote-confirmed GitHub connector checkpoints are mandatory** for every useful implementation increment; label unconfirmed work `REMOTE_CHECKPOINT_PENDING`. Already specifically requested by operator; record this as an accepted clarification rather than re-asking. | Local-only git commits appear fast but cannot be recovered after ephemeral workspace loss. |
| **S6-Q19** | **ACCEPTED:** Squash accepted phase PRs onto `main`; preserve WIP chronology and decisions in remote PR evidence until final verification. | Merge every intermediary WIP commit onto main, which makes accepted history harder to inspect. |
| **S6-Q20** | **ACCEPTED:** Protected `main` + one required aggregate CI check + auto-merge for ordinary phases**, one-time setup under future authorization. No merge queue unless real need. | Unprotected direct updates/unchecked merges reduce safety; mandatory human review for every PR creates friction. |
| **S6-Q21** | **ACCEPTED:** Rare protected-trust-root changes need independent review/enforcement**, while ordinary tests and compatible CI fixes remain autonomous. Do not create a claim registry or separate CI governance service. | Full agent self-approval risks quietly disabling acceptance; blanket human sign-off defeats the objective. |

## 9. Open feasibility checks for authorized bootstrap (NOT decisions now)

1. GitHub `main` actually exists after the initial commit; auto-merge enablement/rulesets and check-source restrictions function with the connected account and repository.
2. Direct connected GitHub blob/tree/commit/ref publication preserves multi-file additions/deletions and binary hashes; readback detects orphan commit/ref error and branch races. A tiny disposable implementation-code checkpoint tests the *mechanism*, not live provider behavior.
3. Draft PR CI triggers and required check aggregator cannot silently green on missing skipped browser jobs; actual Firefox packaged harness is stable enough for requested PR tier.
4. Rule enforcement of policy-root modification cannot be bypassed by PR-owned workflow/test files or privileged `pull_request_target` misuse. If unachievable with current account/plan, escalate *that rare limitation*, not every application-code edit.
5. Accepted-phase marker matches the actual merged `main` tree; no stale manifest state is accepted after a failed merge.

**Stage 6 remains DESIGN ONLY.** Stage 7 independently reconciled this document with accepted Stages 1–5 and the complete final implementation agent pack before any repo initialization/implementation is authorized.

## 10. Operator acceptance record (2026-10-12)

The operator explicitly accepted every recommendation S6-Q19–S6-Q21. S6-Q18 was separately accepted as a mandatory GitHub-connector remote-checkpoint rule. Keep routine CI/implementation autonomy and limit operator review to trust-root/security/product-policy exceptions; never manufacture independent approval using the same account identity. **No source/CI/repository changes were made by accepting these design decisions.**

**Stage 6.4 interface:** See `PCMS-Alpha-Stage-6.4-CI-and-Acceptance-Architecture-Draft.md` for the exact required-gate semantics, B/X test selector, Firefox installation-mode distinction, 56-test ownership, and late H-tests. S6-Q22 was accepted; the Stage 6.5 audited implementation plan and Stage 7 audit control subsequent refinements.
