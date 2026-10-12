# PCMS-Alpha — Stage 7 Independent Design Consistency and Workflow Audit

**Date:** 2026-10-12  
**Result:** **DESIGN CONSISTENCY PASS WITH SPECIFIED CORRECTIONS; OPERATOR FINAL SIGN-OFF PENDING.**  
**Important:** This audit covers *documents and machine-readable design only*. It does not certify an implemented XPI, passing GitHub CI, configured protected branch, live provider integration, Firefox persistence, cryptographic backup implementation, or actual capacity. No public/private repository write, Perchance mutation, native route operation, code implementation or live test occurred.

## 1. Scope, authoritative evidence and review method

Audited Stage 1 Requirements Audit; Stage 2 Behavior and Lifecycle Specification; Stage 3 Minimal Architecture plus the controlling F1/F2 Decision Amendment and Decision Register; Stage 4 UI/UX Specification, decision register and v3.1 prototype; Stage 5 Final Verification Specification, Evidence/Unknowns Register, 56-case Test and Failure Matrix, Operator Acceptance Plan and Decision Register; Stage 6.0–6.4 strategy/agent/CI/governance documents; and Stage 6.5 blueprint, 18-phase contracts, agent instructions and JSON plan.

Operator accepted S6-Q01–Q06, Q07–Q12, Q13–Q17, Q18–Q21, Q22 and **Q23–Q25, all recommended options**. Further questions must always present the complete question, credible alternatives, recommendation and trade-offs. Mandatory future rule: **"Unpublished valuable work is considered at risk."** Confirmed GitHub connector *branch-ref plus tree readback* is required for checkpoint status; local commits and orphan Git objects are insufficient.

Audit dimensions: authority separation; mutable state and remote effect uncertainty; dependency graph; user-requirement traceability; 56-test proof ownership; UI/agent workflow coverage; CI trust, provenance and Firefox installation semantics; disabled-feature boundaries; restart and interrupted PR recovery; protected-main merge; privacy and explicit manual-test boundaries.

## 2. Machine-checked integrity results

| Property | Measured design result | Disposition |
|---|---:|---|
| Implementation phases | I00–I17 = **18** unique phase IDs in declared order | PASS |
| Dependency order | Every prerequisite is an existing **earlier** phase; no cycle | PASS |
| Stage 5 P-tests | **56** unique, assigned one primary phase owner: P51=8, P52=7, P53=8, P54=11, P55=12, P56=10 | PASS |
| Stage 1 requirements | **56** unique REQ-A/G/D/R/U/X primary owners; requirement-to-phase crosswalk provided | PASS after correction |
| UX coverage | UX-01–UX-10 all appear in implementation plan; Firefox real acceptance still pending | PASS (design only) |
| Additional explicit obligations | **31** S6-Ixx supplementary assertions, all owned by phases and separately defined | PASS after correction; none executed |
| Manual H-01–H-07 | H-01/H-07 final UI acceptance; H-06 migration only; H-02–H-05 conditional | PASS (design); no H-test executed |
| Donor identity and privilege boundary | Pinned donor SHA, combined Gecko identity and single guarded controller retained | PASS (design); packaged runtime unverified |
| External-effect gates | Journal before dispatch; owner/route/READY/editor/source approval independently checked; hold on ambiguity | PASS (design); external proofs deferred |

Mechanical coverage means that IDs are mapped, **not that behavior is proven or that every human-oriented requirement could be fully checked from a draft**. Stage 7 adds the specific 31 supplementary assertions to make prior unassigned requirements observable and falsifiable.

## 3. Material defects identified and reconciled

| Finding | Severity before correction | Corrected design contract |
|---|---|---|
| **S7-F01: PR completion marker self-reference** | High | A file committed in a PR can contain neither its **own PR commit SHA** nor a future CI run/squash merge SHA. The completion proposal contains only phase ID, contract revision, required test identities, intended scoped claim and stable policy fields. GitHub PR/CI externally binds candidate SHA and run evidence; postmerge independently binds actual main SHA and new XPI. No circular second commit. |
| **S7-F02: Premature Git folder/archive writes** | High | I06/I07 can write non-READY Git markers/archived source only after I02 durable journal and **early tested subcases** of P53-04/05 (exact blob/tree/ref, CAS nonforce, readback, lost response). Full writeback tests remain primarily owned by I11. Missing safety, permission or initialized `per-gens/main` means `SOURCE_PENDING`/`ARCHIVE_PENDING`; no blind retry. |
| **S7-F03: Stage 1 operator requirements silently unowned** | High | Exactly one primary owner for all **56** REQ IDs, with 31 supplementary test contracts. Explicitly covered: compact Perchance editor overlay; dashboard+desktop notifications; archive/tombstones; bounded AI concurrency; Settings prompt versions/import/export; revision-scoped Ignore; normal listed sleep and dispatch staggering. |
| **S7-F04: Fleet Refresher activated ahead of measured safety** | High | I14 may implement and demonstrate a bounded permissible method; that alone **does not authorize general fleet rollout**. Require I17 P54-09 resource/quota/backpressure measurements and relevant P56 systemic checks; H-04 only when indispensable, explicitly approved. Default OFF/shadow. |
| **S7-F05: Plan-repair autonomy versus protected trust root** | Medium/high | Compatible implementation repairs and genuinely nonweakening additions are autonomous **only when independent trust-root checks classify them correctly**; trust-root weakening cannot self-approve via PR-owned CI. Without working independent enforcement, affected policy PR waits for rare explicit operator review—ordinary code fixes do not. |
| **S7-F06: Unbacked source updates** | High | I08 encrypted artifact must decrypt and round-trip dummy data *before* existing-source overwrite. I07 archives original bytes; I13 requires verifiable previous-good baseline and editor/source constraints. Full restore is I16 and is not falsely claimed by I08's offline restore-fixture check. |
| **S7-F07: Source-doc supersession ambiguity** | Medium | Stage 3 F1/F2 amendment controls full PJS/HTML/src AI scope and permits manual/opt-in writeback before separate human publication approval. Stage 2 Q77 supersedes ±30-minute budget jitter with dispatch-only staggering; earlier wording preserved as historical, not reactivated. |
| **S7-F08: Product acceptance from PR green status** | High | A draft/WIP checkpoint may be red and still recoverable. Only the exact fully selected PR candidate plus actual protected squash merge and independent postmerge result can become `MERGED_AND_VERIFIED`. A postmerge error returns same-phase repair before successors; simulated/packaged/H tiers never conflate. |

These corrections are **technical design reconciliation**, not new operator product requirements or permission to implement.

## 4. Representative adversarial execution traces

### T1. Agent crashes after a GitHub commit object but before branch ref update

Observed object SHA is **not** checkpointed work. On new session, query branch/ref, compare actual tree and parent, never force update; if branch does not reference intended checkpoint and remote publication is unavailable, report `REMOTE_CHECKPOINT_PENDING`. Draft PR and recovery claims must point to verified reachable ref. The prior local workspace may disappear.

### T2. Branch PR includes completion file then squash-merges

Proposal contains stable required tests and capability state only, no self-referential SHA. Trusted CI binds actual PR merge candidate and proves selected tests. Squash creates a *different* main commit; inspect main and postmerge XPI independently. If smoke fails or no result, stage remains pending/requires repair, regardless of merged PR or green old commit.

### T3. CI workflow edits its own mandatory test selection

Because PR code can modify its own workflow/selector, a green `pcms-required` label alone is insufficient. A separately trusted branch-protection/verification mechanism must detect protected file/gate weakening, or operator explicitly reviews this rare root edit. No auto-merge of unchecked trust-root modifications and no privileged execution of untrusted PR artifacts.

### T4. I06 reserves a Perchance private-empty generator; Git marker write loses response

Preserve confirmed remote slug/account/owner. Journal Git attempt, independently read Git ref/tree, then confirm or hold; **do not** repeat remote Perchance creation or override another folder. Git readback must prove exact associated non-READY marker. I11's later general writeback ownership does not excuse skipping early CAS tests.

### T5. Source update during sleep with unsaved human tab

Even with READY and completed AI tests, exact human-owned editor state unknown/dirty stops staging/publication and cleanup. Preserve tab, previous-good bytes, source lineage and remaining sleep budget. An old Ignore acknowledgment does not authorize a new revision overwrite.

### T6. Refresher simulation passes; real effective method remains unresolved

I12 shadow monitoring and I14 technical test code may be accepted at their explicit nonmutating scope; no real provider refresh is claimed. General fleet mutation remains disabled until a permissible method and I17 resource evidence exist. Healthy unrelated PCMS functionality remains operable.

### T7. New Firefox profile restores archived approval while old profile may still run

Independent out-of-DB guard prevents external dispatch. Imported approvals are historical, Persona UID remaps and account/route/source are independently inspected. No technical cross-profile leader election is invented. Before claiming migration/activation the operator confirms old controller inactive (H-06). New profile remains read-only otherwise.

### T8. Source-backed CI passes without real Firefox restart test

Temporary `web-ext` installation does not survive full restart; it cannot establish persistent-installation evidence. A specific installed-XPI test against a pinned Developer Edition profile is required for this claim. Missing/failed setup is `BLOCKED`, never a product PASS.

## 5. Explicit boundaries and remaining operational proofs

These are *future implementation/acceptance requirements*, not additional design contradictions:

1. **Authorized repository bootstrap:** public `Neb963/PCMS-Alpha` was observed empty with auto-merge disabled. Independently confirm current branch, install trusted protected-main settings and required checks, prove connector checkpoints, and only then enable ordinary auto-merge. Generator repository `Neb963/per-gens` is separate and needs its own specific initialization/writing authorization.
2. **Independent CI trust root:** an agent-controlled PR cannot certify a change to its own mandatory gating code. If actual GitHub configuration cannot provide independent enforcement, keep root-edit PRs manually gated; don't impose manual approval on all normal PRs.
3. **Real Firefox integration:** same-XPI cold wake, native guard/lease, persisted browser restart, resource envelopes, UI accessibility and installed-XPI behavior remain untested. The Stage 4 prototype's historical 53 synthetic assertions are not product evidence.
4. **External provider facts:** Perchance owner continuity, complete arbitrary native-AI-edited src assets, fresh AI Chat 2 evidence, actual permitted Refresher effect and public-list behavior are not guaranteed by archived discovery. Require narrow provider proof only when unavoidable; high-risk dependent capability remains disabled while uncertain.
5. **Vault/restore/downloads:** KDE unattended vault integration and disk-readback tier remain unproven; integrated encrypted restore is later implementation work. No plaintext fallback, claim only actual download verification tier, and make migration inactive without H-06.
6. **Final operator work:** H-01/H-07 for overall UX, H-06 only for migration claim, H-02–05 conditional. Live provider mutations require a *separate exact-target/side-effect* authorization after emulator/packaged safeguards. No automatic early repeated F1 happy-path testing.
7. **Performance:** 50+ accounts/1,000+ generators are target workloads, not measured SLOs. Record actual Firefox CPU/heap/IDB/tab/concurrency/queue-age envelopes before effectful fleet rollout.
8. **Formal sign-off:** the Stage 5 final verification document still contains its historical *operator sign-off pending* line. This Stage 7 package records the user's subsequent Stage 6 planning approvals without silently asserting that unimplemented Stage 5 tests passed. Explicit final design-package acceptance can reconcile the documentary sign-off before any later implementation grant.

## 6. Design gate and operator decision needed

**Design audit verdict:** `PASS_WITH_RECONCILIATION`. The corrected blueprint, phase contracts, machine-readable plan, agent instructions and requirement supplement are internally consistent as a **design**. Outstanding capability proofs all have a safe disabled/held or late-scoped acceptance path. No unsupported general product readiness is asserted.

**Single next authorization (separate from coding):** Operator reviews and accepts this audited design package as the controlling implementation design. That sign-off does **not** itself initialize repositories, install branch protection, implement I00, enable live Perchance operations, touch KDE vault or publish anything. Future implementation authorization must be separately explicit.

**Version rule:** The `*-AUDITED` files supersede their corresponding Stage 6.5 `*-DRAFT` files. Earlier Stage 6 documents preserve accepted questions and constraints; where provisional G6 groupings or older draft text conflict, Stage 7 reconciled I00–I17 plan and the accepted Stage 3 F1/F2 amendment take precedence. All runtime evidence remains `NOT_TESTED` until executed.
