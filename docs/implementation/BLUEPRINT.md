# PCMS-Alpha — Stage 6.5 Implementation Blueprint and Agent Pack

**Date:** 2026-10-12  
**Status:** STAGE 7 RECONCILED DESIGN — S6-Q23–Q25 ACCEPTED; pending final operator sign-off. Stage 6 remains **DESIGN**, not implementation.  
**Next:** Stage 7 final operator review → separately authorized implementation. This design artifact alone grants no repository setup or coding authority.

## 1. Explicitly accepted baseline

S6-Q01–Q06, Q07–Q12, Q13–Q17, Q18–Q21, Q22 and Q23–Q25 are accepted as recommended. The user additionally required GitHub-connector remote checkpoints of coherent work, with confirmed remote branch/ref; local-only commits do not count. Tests must be accurate but cost-effective in developer elapsed time; manual provider/live testing is minimal, targeted and late. All subsequent decision requests must show their **complete question, alternatives, recommendation and trade-off**.

Stage 5 produced 56 falsifiable P51–P56 test contracts and H-01–H-07 conditional/must-run procedures; those new contracts have **not** been executed as combined-product acceptance. The future agents must implement and run applicable suites at correct tiers.

## 2. Deliverable boundaries and future repository layout

These are **design artifacts on this conversation**, not existing files in `Neb963/PCMS-Alpha`:

| Draft artifact here | Future repository location | Role |
|---|---|---|
| `PCMS-Alpha-Stage-6.5-AGENTS-AUDITED.md` | `AGENTS.md` | Short agent entrypoint, mandatory authority/checkpoint/stop policy |
| `PCMS-Alpha-Stage-6.5-plan-AUDITED.json` | `docs/implementation/plan.json` | Static phase graph, exact P-test ownership, capability safety envelopes |
| `PCMS-Alpha-Stage-6.5-Phase-Contracts-AUDITED.md` | `docs/implementation/PHASES.md` | Detailed user-visible phase contract and negative cases |
| `PCMS-Alpha-Stage-6.5-Coding-Agent-Prompt-AUDITED.md` | `docs/engineering/CONTINUE.md` | One reusable continuation prompt |
| Stage 6.2 accepted protocol v2 | `docs/engineering/AGENT-PROTOCOL.md` | Recovery/branch/PR/architectural amendment behavior |
| Stage 6.0 CI Engineer v2 | `docs/engineering/CI-ENGINEER.md` | Mandatory CI engineer role and Firefox/cost/evidence standards |
| Stage 6.4 acceptance architecture | `docs/engineering/VERIFICATION.md` | Selected CI tiers and trust-root policy |

No duplicated mutable status service. An accepted minimal per-phase completion proposal is placed in `docs/implementation/completions/Ixx.json` in its PR; protected CI then validates the proposed claim and actual `main` merge evidence. This record is an **in-repo claim at candidate revision**, not a separate acceptance authority. **It cannot include a squash-merge SHA that does not exist yet.** The merged `main` commit is observed after merge and associated via PR/CI evidence; do not require another commit merely to stamp that SHA back into itself.

### Repository trust-root distinction

Use the existing approved policy and protected-main verifier for ordinary application changes. Never trust PR-controlled workflow or policy files to independently certify changes to that same gate. Root changes require an external controlled verifier or exceptional operator review. The team need not pretend that GitHub settings can universally enforce an unavailable independent review; bootstrap should explicitly verify actual ruleset/check-source protections before auto-merge activation.

## 3. Roadmap

The roadmap retains **18** small vertical slices I00–I17 as derived in Stage 6.1. Phase ID order is a deterministic preference, **not** a barrier: safely parked blocked phases may be bypassed only for independent READY successors. A phase's dependent phases remain blocked until it is legitimately accepted and merged; do not reinterpret blocked effects as phase completion. One agent and one phase at a time.

**Critical path:** I00 → I01 → I02 → I03 → I04. This delivers donor-safe packaged background and usable account/inventory interface early. I05/06/09/10/11 lead to approval I13. I08 supplies encrypted protection and an offline decrypt/fixture-roundtrip before existing source overwrites; I13 additionally preserves verified original bytes and checks a usable recovery baseline before admission. I12 provides proven sleep clock and unlisting semantics for existing updates in I13; I14 live refresh can safely remain OFF while I15/I16/I17 continue within their dependency safety. I16 manual restore does not depend on I15 KDE unattended-vault proof.

| Stream | IDs | Externally observable value |
|---|---|---|
| Start and trust | I00–I02 | One package, secure wake, canonical journal and diagnostics |
| Accounts and inventory | I03–I05 | Guided binding, read-only owned generator search and READY mapping |
| Source lifecycle and recovery baseline | I06–I09 | Reservation/adoption, encrypted archive, private full-source staging |
| AI/writeback/release | I10–I11, I13 | Attributable testing, conditional Git writeback, exact-source human publication |
| Refresher | I12, I14 | Shadow scheduling first, effectful refresh only when independently proven |
| Long-term recovery and qualification | I15–I17 | Daily encrypted backups, staged restore, full product/UX qualification |

## 4. Test semantics and verification boundaries

- The machine-readable plan gives every one of the **56 Stage 5 P-tests exactly one primary phase owner**. Tests may appear as prerequisite subcases or reruns elsewhere, but their primary full-proof result is not duplicated or skipped. Mapping checks passed locally against expected P51=8, P52=7, P53=8, P54=11, P55=12 and P56=10. All dependencies refer to existing earlier phase IDs and are acyclic by construction.
- **F:** fast deterministic regressions and independent remote-effect oracles. **B:** real packaged Firefox Developer Edition (installed persistent profile when restart is claimed). **X:** adversarial/scale/cross-system suites. **H:** late human observation under explicit authorization when needed. The public CI never runs live external provider writes or private generator-source mutations.
- Always-present PR `pcms-required` aggregate must reflect actual selected tests and their valid results; absent or skipped mandatory child cannot produce a pass. Trust-root changes are non-automerge unless independently verified.
- Build package provenance includes source revision, donor SHA, XPI checksum, Firefox build and fixture version; no product acceptance by design-only/UI prototype evidence.
- Manual H-01/H-07 are required for full operator UI sign-off; H-06 only for migration claim; H-02–H-05 conditional by residual proof and enabled capability. They are **not** per-phase sign-offs.

## 5. Agent mode transitions

```text
read actual remote main + PRs
  -> recover unfinished phase OR select first manifest-eligible phase
  -> reconcile security and supersession constraints
  -> open branch; publish useful checkpoint; verify branch ref; early draft PR
  -> build one vertical scope with reproducible tests
  -> commit / remote-checkpoint as work becomes valuable
  -> verify candidate + selected required CI; protected trust-root handling
  -> publish proposed completion record in PR; merge only when allowed
  -> observe actual merged main SHA + postmerge build evidence
  -> STOP (do not select next phase)
```

If implementation authority has **not** been granted, all agent work remains read-only specification review. Empty destination bootstrap is an explicit future setup exception to normal protected-main PR policy. No initialization of private `per-gens/main` by inference. A failing GitHub connector operation must not be described as a remotely durable checkpoint.

## 6. Phase acceptance marker edge

**Problem:** A pre-merge JSON file cannot contain either its own PR-commit SHA or its future squash-merge commit ID. A requirement to write it after merge would generate a new `main` commit and change the SHA again.

**Solution:** The phase PR includes a proposed completion record with phase ID, frozen contract revision, required test IDs and intended capability state; **no candidate/merge commit SHA, future CI run ID or squash SHA inside that same commit**. The trusted PR/CI system binds the actual candidate and merged SHA and execution artifacts externally. Protected merge checks verify the actual candidate. After GitHub merges, actual `main` hash is read and reported as external GitHub merge/CI evidence. A subsequent independent postmerge smoke XPI is linked to the observed `main` tree; phase is `MERGED_AND_VERIFIED` only after that observation, not after auto-merge was merely enabled. No cyclical self-reference.

A merged PR with incomplete/failed postmerge proof leaves that phase `POSTMERGE_VERIFICATION_PENDING` (not accepted): the next invocation revisits the same phase and opens a same-phase repair PR when necessary; it does not proceed to later dependent work. A postmerge CI failure is a regression requiring scoped corrective PR/hold, **not** silently a successful acceptance. The same source may rebuild to a new archive checksum if toolchain nondeterministic; reproducibility must be tested rather than assuming it. Reports distinguish tested PR XPI and postmerge XPI. If postmerge proof is pending, status remains in-progress, even if GitHub's PR is merged.

## 7. Accepted Stage 6.5 decisions — options and trade-offs preserved

**S6-Q23 — How should completed phases be represented in the repository?**

- **Option A (recommended):** One small candidate completion record per phase committed alongside the PR, validated independently against required evidence, and accepted only after observed protected merge/postmerge proof. No separate mutable status ledger.
- **Option B:** Derive phase acceptance solely from PR history and CI events without any in-repo completion marker. Less repository metadata, but weaker deterministic recovery when reconstructing long-term work from `main`.
- **Trade-off:** A adds one tiny durable artifact per phase; B minimizes files but makes workflow recovery more dependent on GitHub PR metadata availability and history conventions. Both must avoid pre-merge self-referential merge-SHA fields.

**S6-Q24 — How should the next independent READY phase be selected when an earlier phase is safely blocked?**

- **Option A (recommended):** Follow the stable `phaseOrder` in the accepted manifest and choose the first phase whose dependencies are accepted and whose prerequisites are not held by the same defect. Resume any unfinished safe phase first; no interactive question for ordinary selection.
- **Option B:** Let the coding agent prioritize any currently READY phase based on perceived value/effort. Potentially faster for certain opportunities but introduces nondeterministic selection and scope drift across agent sessions.
- **Trade-off:** A is predictable and mechanically auditable, while B is more opportunistic. Either retains the strict one-active-agent/one-phase-per-invocation rule.

**S6-Q25 — What revision freedom should agents have for the frozen implementation plan?**

- **Option A (recommended):** Agents can autonomously make compatible cross-cutting source fixes and can propose **nonweakening** phase dependency/test additions with justification and fresh CI, but any change that weakens acceptance/security or alters accepted product goals enters a separately trusted review path. No ceremony for ordinary code edits. The canonical plan stays protected and changes only on evidence.
- **Option B:** Treat every plan amendment, even an additive dependency correction, as requiring separate operator approval. Stronger administrative simplicity but recreates the previous deadlock and operator bottleneck.
- **Trade-off:** A allows necessary real-world evolution while isolating changes to governance trust and product policy; B increases friction and tends to postpone repairs. Option A requires an actually enforceable independent trust-root distinction, not simply trusting an agent's self-classification.

## 8. Exit criteria and Stage 7 audit criteria

- Exact 56-primary-test coverage; every phase has accepted design origin, dependencies, negative oracle, rollback and capability flag, with early UI integration.
- Simulate in Stage 7: interrupted session with local-only work; orphan remote commit object; first branch bootstrap from empty repo; changed `main` after green checks; policy-root self-modification; unrelated phase blocked while a safe phase advances; post-squash main SHA/marker reconciliation; actual Firefox restart vs temporary load; source/provider uncertain effect; late conditional H test.
- Verify policy/requirements supersessions and precedence, latest Stage 5 evidence, no secret leakage, no fictional live proof, no invalid PR/branch ruleset promises.
- S6-Q23–Q25 are accepted as Option A. Verify that cross-phase corrections above are present before a Stage 7 ZIP is treated as internally consistent. Stage 6.5 phase manifest is a blueprint, **not** permission to run agents now.

## 9. Accepted Stage 6.5 decision record (2026-10-12)

- **S6-Q23 = A:** small source-controlled candidate phase completion record, validated against externally observed PR/test/main proof; no extra mutable status system and no self-referential commit/check-run fields.
- **S6-Q24 = A:** deterministic manifest order; resume unfinished phase first; safely parked blocker permits truly independent eligible phase in later invocation. Postmerge verification failure returns to original phase.
- **S6-Q25 = A:** compatible architecture repairs and nonweakening plan corrections allowed; actual product/security/acceptance trust-root changes protected independently or require rare targeted operator approval. Do not use file ownership as reason to refuse an engineering prerequisite.

**Stage 7 scope reconciliation:** All 56 Stage 1 REQ references are assigned a primary implementation owner in the audited plan; all 56 Stage 5 P-tests likewise retain exactly one primary owner. Supplementary specific checks cover operator-visible requirements that lacked explicit phase ownership (notification aggregation, editor overlay, versioned prompt import/export, AI concurrency, archive/tombstone, revision-scoped Ignore). Early Git marker writes need P53-04/05 safety *subcases* before any Git effect, even though the complete full-source writeback portfolio belongs to I11. No implementation was executed.
