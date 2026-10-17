# PCMS-Alpha — Stage 6.2 Agent Execution and Recovery Protocol

**Prepared:** 2026-10-12  
**Status:** PROVISIONALLY ACCEPTED — S6-Q13–Q17 accepted (all recommendations) on 2026-10-12, with mandatory GitHub-connector remote checkpoint clarification. S6-Q01–Q12 previously accepted.  
**Scope:** Future implementation-agent behavior and deterministic continuation. **No software implementation, GitHub changes, credentials, provider operations, CI execution or live tests are authorized by this document.**  
**Predecessors:** Stage 6.0 implementation strategy / CI engineer instruction; Stage 6.1 implementation dependency draft, with S6-Q07–Q12 now explicitly accepted; Stage 5 finalized test/failure matrix, evidence register and operator acceptance plan.  
**Next:** Stage 6.3 minimal GitHub policy, Stage 6.4 exact test/CI gates, Stage 6.5 prompts and phase contracts; independent Stage 7 audit.

## 1. Objective, threat model and constraints

A fresh implementation agent should be able to receive **"Implement next READY phase"** and correctly determine the current state, recover an unfinished phase, make necessary compatible corrections, demonstrate the correct test tier, and stop without leaving unowned work or claiming an unexecuted test passed.

Failure cases to design against: interrupted context, unpushed local changes, duplicated invocations, stale branch/CI, unreviewed main changes, broken required test, architectural prerequisite discovered mid-phase, misleading simulated provider success, unknown effect after a crash, and operator fatigue from repeated permissions.

Constraints: **one active agent at a time; one selected phase per invocation**. No claim registry, lease manager, orchestration service, multi-agent coordination infrastructure, module ownership fences, or ceremonial contract hashes. The launching automation (if used) must itself serialize invocations. Git optimistic concurrency and a per-phase branch/PR detect residual accidental overlaps; without a serialized launcher, a one-agent guarantee is not mathematically enforceable by optimistic checks alone.

**Only one standing implementation authorization is expected after Stage 7 approval.** It will cover planned code, necessary compatible architecture/CI repairs and safe review/merge operations. It does not cover live-provider writes, unsafe migrations, product/security-policy changes, secret disclosure, private `per-gens` initialization, or fresh restored-controller activation. Their permission boundary remains explicit, but is requested only for a concrete action, not every code edit.

## 2. Minimal sources of truth

| Fact | Authority | Not authority |
|---|---|---|
| Product behavior and security | Accepted Stage 1–4 designs and explicit supersessions | Old Alpha phases, current code convenience, AI guesses |
| Risk and test oracle | Stage 5 P51–P56, U/UX, H acceptance requirements and recorded test results | A skipped job, prior static mock, README claim |
| Future implementation scope/order | One versioned roadmap manifest in `main` (Stage 6.5) | Agent memory or numerical phase guess |
| Work in progress | Git branch, draft/open PR, commits, GitHub checks and issue/blocker notes | A separately maintained mutable claim/status service |
| Accepted phase | Completion marker + evidence merged on protected `main`, verified against required CI and merge revision | Green branch, unmerged PR, local passing test |
| Runtime side effect | PCMS journal + independently observed Perchance/Git state | A Git commit of implementation code, an AI response or browser tab appearance |

Repository files proposed for later creation **during implementation bootstrap only**:

- `AGENTS.md`: short mandatory entrypoint: current-state preflight; one-phase rule; authority, safety, test, stop rules; links.
- `docs/implementation/plan.json` (or similarly small machine-readable manifest): stable phase IDs, dependencies, short objectives, acceptance IDs, capability gates and terminal completion markers. Do not duplicate status in issues, registries and files.
- `docs/engineering/CI-ENGINEER.md`: full mandatory CI design instruction from Stage 6.0.
- `docs/engineering/AGENT-PROTOCOL.md`: this finalized procedure, concise enough to obey under pressure.
- A short PR description template with phase ID, proof links, compatibility repair notes, remaining unverified claims and effect-flag state. No separate state database.

The exact paths are not frozen until Stage 6.5; Stage 6.3 decides what GitHub branch protections and external policy anchor enforce them.

## 3. Deterministic agent entry and phase selection

### 3.1 Non-mutating preflight

1. Verify exact destination `Neb963/PCMS-Alpha`, expected remote URL, current `main` HEAD, branch, clean/dirty working tree, permissions, architecture/test docs and existing local work. **Do not discard unidentified local modifications.**
2. Read `AGENTS.md`, canonical manifest, accepted design relevant to current work, Stage 5 test mapping and `CI-ENGINEER.md` before changing tests/CI. Resolve supersessions: F1 observed reservation, F2 full-generator AI edits; preserve donor pinned source/Gecko/native identity and route security.
3. Inspect open/draft PRs for phase IDs, branch heads, latest checks, failures and any previous agent handoff. Do not assume `main` from a previous conversation is current.
4. If the environment contains unexplained in-progress files, unpushed commits or divergent branches, **preserve them and reconcile provenance**. Never run destructive `reset`, force-push or overwrite to start fresh.

### 3.2 Select exactly one task

Selection order is **not** simply minimum numeric ID:

1. **Resume** one open/unfinished selected phase if its branch/PR exists and work is not safely parked as blocked. If multiple conflicting active phase PRs exist, diagnose/stop; never start an additional parallel phase by assumption.
2. If the phase has a recorded **BLOCKED and safely parked** result, verify the specific missing prerequisite; resume it if newly satisfied. Otherwise choose the lowest stable-ID phase whose prerequisite **accepted-main** markers are proven and which is genuinely independent of the blocker. Follow the dependency DAG; do not require strictly consecutive numbers.
3. If nothing is READY, report the exact blocker and missing test/authorization/architecture evidence; do not manufacture a new scope.
4. Select **one** phase ID for the entire invocation. Necessary compatible prerequisite fixes remain attached to that phase, not silently treated as permission to start another phase.

Important edge case: a PR for phase X may appear "green" at head SHA A but `main` has moved or relevant required checks were omitted. **That PR is not yet accepted; it remains the chosen phase until verified merge and canonical-main acceptance.**

### 3.3 Start or resume durable work

Use one deterministic phase branch (`phase/Ixx-short-topic`) and one canonical PR. Create a **draft PR early**, after the scope is understood, so interrupted sessions can find the work. Push useful incremental commits after local proof; describe outstanding work as explicitly incomplete. No forced push of someone else's branch; a fast-forward rejection or unexpected ref change means re-fetch, inspect and reconcile.

If a session crashes before a branch/PR is pushed, the next agent cannot reconstruct its unpushed disk state on another machine. Mitigation: push bounded, non-secret WIP checkpoints to the phase branch and maintain a brief handoff in the PR. If a local dirty worktree survives, inspect it without destroying it. The protocol cannot promise recovery of unpublished changes across ephemeral machines.

Never commit provider credentials, local browser profiles, secret diagnostics, real generator source unrelated to the task or `.env` tokens. Untrusted PR code cannot access privileged GitHub/per-gens credentials.

## 4. Allowed repair boundary — neither rigid ownership nor free rein

| Repair class | Future agent may do | Mandatory evidence / boundary |
|---|---|---|
| A. Internal compatible fix | Implement in same phase without operator ping | Causal relationship; affected tests; no accepted behavior change |
| B. Cross-cutting architectural prerequisite | Modify necessary shared code, interfaces, tests and CI in same phase | Brief correction record: contradiction, smallest safe alternative, downstream impact, rollback/migration, protected regression proof |
| C. Dependency-plan correction | Propose small dependency/slice adjustment consistent with product | Prove DAG/scope/acceptance impact; no hidden new phase or skipped gate; Stage 6.3 defines protected manifest changes |
| D. Product/security or external-authority change | **Stop for targeted operator decision** | New product behavior, weaker route/owner/approval boundary, broadened credentials, irreversible migration, live provider effect, arbitrary mass refactor |

The agent is **not file-owned**: a correct phase may touch donor integration, Core, UI, migration and CI files together. It is **behavior-owned**: changes must be necessary for the selected operator outcome. A discovered flaw in the architecture is not automatically an implementation blocker if a narrow compatible correction exists. When the correction cannot be justified/tested without changing accepted behavior, preserve the branch and ask one precise decision with alternatives and risk—not repeated generic permission requests.

## 5. Testing within every implementation phase

The implementation agent must follow `docs/engineering/CI-ENGINEER.md` whenever designing/changing tests or CI. Standard progression:

1. Reproduce the failure at the cheapest boundary using an independent oracle. Add deterministic negative cases and check the assertion fails for the intended broken behavior when practical.
2. Run relevant fast checks and mandatory security/donor regressions. Optimize feedback time; do not equate unlimited public-runner minutes with zero cost.
3. For altered Firefox lifecycle, identity, lease, UI, tab, alarms, backup or other browser-critical behavior, validate the **actual packaged XPI in pinned Firefox** under an isolated fixture. Event-page suspension must actually happen; a function call impersonating wake is insufficient.
4. Run relevant integration and fault-injection suites; run the full matrix at its applicable milestone and final gate. Test only applicable implemented cases and explicitly report `NOT_TESTED`/`NOT_APPLICABLE` for unrelated unimplemented cases, never PASS.
5. Preserve proof provenance: test IDs, code SHA, source donor SHA, fixture/browser version, XPI SHA, expected/actual, injected cutpoint, independent observation, redacted artifacts, known limitations. The required gate must detect missing coverage and stale/failed prerequisite jobs.

**A broken CI job:** identify first root cause; prefer targeted reproduction. Fix product defect or demonstrate a mistaken test oracle, then add equivalent/better protection. Do not silently skip/remove assertions, increase retries to mask flakiness, or declare a green run at an earlier SHA. Changes to protected CI trust anchors need an independent protected review path (Stage 6.3), not self-approval by newly weakened checks.

### 5.1 Operator manual live testing — sharply limited, late

**No routine early operator live-test gate** at I03–I14. Coding agents use fakes, read-only source evidence, replay/fault injection and real *packaged Firefox* tests with sanitized credentials/fixtures. A phase can complete its honestly described simulated/packaged deliverable while live-dependent effects remain feature-flag OFF. This avoids holding unrelated development hostage to a human test window.

Stage 5 operator cases control the late acceptance scope:

- **H-01 and H-07:** late final real-Firefox usability/a11y and guided acceptance/fallback; required for a full human acceptance claim. Combine into one guided session where feasible.
- **H-06:** required before claiming *safe fresh-profile activation*; perform in isolated profiles using dummy data and an explicit old-controller shutdown, not on daily profile.
- **H-02/H-03/H-04/H-05:** only when current provider/host facts remain truly unknown **and** the corresponding owner-dependent, AI, mutating-Refresher or unattended-vault capability is intended to be enabled. Each is a small, separately approved, owned/disposable test with explicit preconditions and observable stop rule. Their absence leaves the related effect OFF, not fake green.
- **F1:** do not repeat the already established private-first create/rename happy path; integrated ambiguity/restart behavior still needs emulator and packaged Firefox tests.

If a rare external feasibility unknown would make extensive future implementation wasted effort, the agent may flag a **single narrowly specified potential early operator check** as an exception for operator decision; it must first exhaust the available source, historical and non-live proof. This is an exception, never a default dependency or a mandate to conduct live tests. No automated agents perform live Perchance/Mullvad/Cloudflare mutations or handle real secrets for acceptance.

Prepare operator procedure/checklist incrementally from tests but **execute** it near final phases I16–I17. Never interrupt implementation every phase for "please click/login/confirm" merely to claim external PASS. Full product acceptance may remain partial if legitimately unverified provider behavior cannot be safely demonstrated.

## 6. Main-branch integration and acceptance

1. An agent may propose an `ACCEPTED` completion marker in its phase PR **only alongside** the phase's passing required evidence and explicit capability flags; a green PR alone does not count.
2. An independently controlled required-check aggregator must verify the actual code/test selection, provenance, donor regressions, appropriate Firefox proof and that the completion marker is justified. A PR cannot rewrite its own trust anchor to bypass those checks.
3. Before merge, ensure the checks correspond to the latest PR commit and its actual merge candidate against current `main`. A new main commit, conflict or changed merge result triggers appropriate revalidation. Never infer the status of a future merged tree from an old branch-only run.
4. Auto-merge through the protected repository rules only if all applicable gates are green. Observe the resulting merge on `main`; if merge fails, is queued, or gets replaced by another commit, keep the phase unfinished and report accurate state.
5. `ACCEPTED` is derived from the marker **on merged protected main**, consistent evidence and merge checks; do not write a separate central status ledger after acceptance. A per-phase XPI exists at a traceable commit/digest. A packaged XPI is **not** a live-provider acceptance certificate.
6. An accepted phase with effect flags OFF is correctly described as *implemented, not live-enabled* wherever the phase contract defines that scope. Operator-facing reports may not label such a feature "working live".

Where the selected phase makes a product/capability gate that cannot pass, report `BLOCKED` or accept only a **separately defined non-effectful milestone** with full applicable tests; do not retroactively shrink an effectful acceptance contract simply to close a PR.

## 7. Interrupted/blocked/stale work recovery matrix

| Situation | Required agent response | Forbidden shortcut |
|---|---|---|
| Context/session limit | Push safe WIP commit, keep draft PR, record exact next step, stop | Silent abandonment or new phase |
| Draft PR exists next session | Fetch, read prior evidence, check live `main`/PR SHA, continue same phase | Reimplement phase in new unrelated PR |
| CI broken/flaky | Minimal repro; inspect causal logs; repair CI or code; rerun only necessary scopes | Blind repeat/disable job until green |
| Shared interface missing | Narrow compatible cross-cut repair with impact tests | Refuse merely because another phase "owns" file |
| Stale branch or main advanced | Compare/reconcile; merge current main into phase branch with no forced rewrite, then retest affected integration | Merge based on old green status |
| Two agents or phase branches detected | Stop and reconcile authority/work; preserve changes | Force push, delete competitor or invent claim winner |
| PR green but merge canceled/replaced | Verify final merged SHA on main; remain selected until resolved | Mark accepted based on intent |
| Unsafe provider effect status ambiguous | Scoped runtime HOLD, independent read-only reconciliation, evidence receipt | Replay, force release or edit local outcome to success |
| Critical acceptance gate not feasible | Keep capability OFF; record blocker, permissible independent work and requested decision | Waive required security/owner test |
| Work safely parked as blocked | Stable draft PR plus precise blocker report; independent phase allowed after DAG/shared-boundary check | Launch another agent concurrently |
| CI/GitHub outage | Preserve phase branch, evidence and pending state; stop/retry in later invocation | Skip independent acceptance or manual merge bypass |
| Unintended main regression after merge | New narrowly scoped repair/revert with safe migration and required tests; preserve phase provenance | Rewrite past accepted evidence, force-reset main |

**Blocking report minimum**: phase/branch/PR/head SHA, last verified main SHA, exact failing requirement/test and evidence tier, first causal failure, whether code has merged, effect flags/remote ambiguity, whether the branch is safely parked, specific independent READY alternatives and one next action/decision. Redact all secrets and user source.

## 8. Exact stop/report contract

An invocation ends in one of four mutually exclusive outcomes:

- **`MERGED_AND_VERIFIED`** — one phase merged into protected main; actual main/PR/XPI provenance and proof gates recorded; no next phase started.
- **`IN_PROGRESS_CHECKPOINTED`** — one phase has durable committed branch/draft PR + reproducible remaining work; safe to resume; no false acceptance.
- **`BLOCKED_SAFELY`** — one phase cannot proceed; affected capabilities disabled/held; blocker + independent work eligibility recorded.
- **`NO_SAFE_PHASE`** — no ready work or conflicting repository state; no product changes; precise next prerequisite identified.

The final agent response must be short and machine/human readable: selected phase, action/outcome, branch/PR/main SHA, CI tiers actually executed, XPI digest if built, capability ON/OFF and held uncertainty, why it stopped, and exact recommended next step. Never promise background continuation. A stopped invocation **must not** auto-start the next phase even when it has time left.

## 9. Five accepted Stage 6.2 operator decisions

| ID | Recommended rule | Credible alternative / trade-off |
|---|---|---|
| **S6-Q13** | Create an early draft PR and push incremental safe checkpoints for recoverability | Open PR only at the end; fewer intermediate artifacts, greater interruption risk |
| **S6-Q14** | Serial invocation at launcher + optimistic branch/PR/current-main checks; no separate claim registry | Introduce a durable claim lease; more coordination overhead, somewhat stronger collision handling |
| **S6-Q15** | Permit necessary compatible cross-cut architecture repairs in the assigned phase with concise evidence | Require a separate operator-approved repair phase; repeat previous ownership deadlocks |
| **S6-Q16** | Park blocked work as a draft PR with exact blocker; continue only genuinely independent work sequentially | Stop all future phases until blocker resolved; simpler order, unnecessary global stalls |
| **S6-Q17** | Accept only after required checks validate the merge candidate and evidence is observed on protected `main`; no extra mutable status service | Accept green branch PR as complete; faster but stale/phantom acceptance risk |

**Operator clarification already accepted, not a new vote:** real manual live testing is deliberately minimal, narrowly scoped and concentrated at final acceptance; exceptional earlier proof needs specific separate authorization and demonstrated necessity. Stage 6.4 must operationalize the exact H-01–H-07 gates, not casually widen them.

## 10. Stage 6.2 closure criteria

Before calling Stage 6.2 final: (a) answer S6-Q13–Q17, (b) reject any source-of-truth duplication, (c) verify resume after a context wipe and GitHub PR/CI race, (d) verify automatic architecture repairs remain safe and not arbitrarily file-limited, (e) preserve independent CI trust anchors and current-main protection, (f) ensure no compulsory early live tests and truthful late acceptance, (g) prove the stop contract cannot inadvertently trigger the next phase. Stage 6.3 will refine exact repository GitHub settings and merge mechanics; Stage 6.4 will tie exact Stage 5 P/UX/H IDs to phases; Stage 6.5 will author final agent prompts and phase definitions.


## 11. Accepted remote durability amendment — 2026-10-12

**Operator instruction:** “Unpublished valuable work is considered at risk.” Future agents **MUST publish coherent incremental commits through the connected GitHub integration**, not merely commit to the local workspace. A draft PR must be opened early and its remote head verified after each checkpoint. The connector supports direct blob/tree/commit/ref operations and single-file updates; choose the correct method for byte-exact multi-file commits. Local unpushed commits do **not** meet `IN_PROGRESS_CHECKPOINTED`. If a remote commit object is created but its branch ref is not confirmed, the work is **not** yet safely checkpointed. On GitHub connector outage, preserve local work and report `REMOTE_CHECKPOINT_PENDING` explicitly, never a fabricated GitHub link/SHA. See Stage 6.3 for actual publication, protected-policy, and readback procedures.

**S6-Q13–Q17 result:** all recommended options accepted. This does not authorize implementation, repository initialization, GitHub writes or provider tests in the current design stage.
