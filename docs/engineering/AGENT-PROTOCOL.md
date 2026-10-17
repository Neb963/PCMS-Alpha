# Agent execution, recovery and handoff

**Authority:** Operative only when independently reviewed and merged into `main`. This procedure never grants implementation, host, private Git, or provider authority.

## 1. Establish reality before acting

1. Check the exact target repository, permissions, `main` SHA/tree, open/draft PRs, checks and dirty local work. Treat branch/PR metadata as current work state; do not create a parallel mutable task-state service.
2. Read `AGENTS.md`, the accepted client AC/T/E requirements for the intended slice, relevant Gate B v1.1 sections, the slice dependency map and existing evidence. Verify the required documents exist at their installed paths. Historical I00–I17 plan remains archived; never select the next task by its obsolete numeric order.
3. Resume an already authorized unfinished slice whose effects are relevant. If it is safely parked and another independent slice is explicitly authorized, the latter may proceed. Conflicting active work or absent scope => hold and ask a specific question. One agent owns one bounded slice per invocation; this is an execution discipline, **not** another runtime coordinator.
4. Do not mistake a previous model message, uploaded Git object, fixture PASS, or an unmerged PR for current authoritative source.

## 2. Define the smallest end-to-end outcome

Write a brief working note: operator action/result, AC/T/E trace, first failing production boundary, affected files/stores, preserved invariants, existing credible evidence, independent oracle, planned changes, new failure paths and rollback/hold. Prefer tracing one real ingress → canonical state → guarded effect → independent observation → dashboard result. For shared interfaces, consider downstream consumers and migration before patching.

The accepted client contract cannot be weakened to satisfy old tests. Cross-module changes needed for this journey are in scope with standing **implementation** authority; changes to product policy, protected network/security behavior, trust-root rules, irreversible migration or externally authorized effects require separately documented approval. A failed architecture-critical E-01/E-04/E-06/E-08 proof holds its dependent slice and triggers a focused amendment, not silent substitution.

## 3. Work and prove

1. Reproduce the defect or missing boundary with the narrowest independent oracle; make the meaningful negative case fail before repairing where practical.
2. Make the smallest compatible correction. Keep durable intent and possible-effect records before remote dispatch. For any ambiguous ACK, persist an uncertain state and perform read-only reconciliation before another write.
3. Test normal flow, negative cases, supersession and crash/restart at the right evidence tier. Use real production entrypoints and canonical stores. When using fakes, keep their effect ledger independent and label substitution. Do not pretend local provider fakes are live proof.
4. Use an **actually installed, enabled** packaged XPI for B claims. A temporary add-on or tab reload cannot prove cold process restart. Real L, GIT, host installation or operator-profile effects require their own exact authorization and safe disposable scope.
5. Preserve frozen donor and Stage 7 originals. Never mutate the original I17 uncertain CREATE/RENAME. An absent original Firefox journal blocks only affected original-profile reconciliation and shared-resource cutovers; verified-empty detached disposable profiles can be developed independently.

## 4. Durable GitHub progress and review

Create/resume a purpose-named branch and early draft PR after authorization and initial examination. Push redacted, coherent checkpoints (no secrets or profile material); verify **remote branch HEAD and tree** after each meaningful checkpoint. Ref update failure => re-fetch/reconcile, never force. Keep runtime generator-source Git effects separate from implementation repo changes. Never merge a source-authoring branch merely because a PCMS runtime operation would be allowed to write its tested result to `per-gens/main`.

Protected files (`AGENTS.md`, this protocol, CI selector/required checks, security/acceptance mapping and workflow privileges) need review by an operator or truly independent protected trust authority. The PR author's modified gate cannot independently certify the gate or authorize auto-merge. Preserve the old policy until the reviewed cutover is effective. Squash/other merge method follows **actual current repo policy**, and only an explicitly authorized actor merges. After merging, verify `main` and matching evidence; do not call an unmerged green branch accepted.

## 5. When blocked; completion report

On missing capability or failed proof: retain an inert checkpoint with first causal error and evidence tier; hold only the affected scope, not every independent feature. Never label a known product failure as infrastructure trouble to bypass a gate. If tests/CI fail, reproduce the first failure and repair the cause rather than skipping or retrying indiscriminately.

Every handoff/PR checkpoint states:

- Slice ID, operator outcome, affected AC/T/E and actual status (`WORKING`, `PARTIAL`, `BLOCKED`, `UNVERIFIED`), separately per evidence tier.
- Exact branch, PR, remotely verified commit/tree, package/donor/host/browser versions and XPI digest where applicable.
- Changed paths and compatible cross-cutting fixes; commands run, independent observations, negative tests, substitutions and first unresolved failure.
- Scope of authorized effects, possible remote effects, rollback/quarantine, unmet proof or operator authority, and one precise next step.

Do not claim AC completion while essential native, Git or provider behavior is still simulated. Stop after the authorized slice's bounded outcome (including an honest blocked outcome), and do not automatically start the next slice.
