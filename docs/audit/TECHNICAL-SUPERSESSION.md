# PCMS-Alpha — Technical authority transition

**Authority:** Effective only after independently reviewed merge to `Neb963/PCMS-Alpha/main`. Until then, this file is a proposal; off-main copies do not supersede existing repo instructions.

## Accepted decision and scope

On 2026-10-17 the operator approved **Gate B Technical Design v1.1 conditionally** and requested design of new repository/agent instructions. This approves Path B with selective replacement as the **technical baseline** subordinate to Client Contract v1.0.0; it is **not** authorization to modify production code/donor, migrate profiles, install native components, use real provider/accounts/credentials, write to private generator Git, or merge PRs.

GB-04 migration contract is resolved as design. GB-01/02/03/05 remain architecture-critical proof obligations: protected donor request-gate admission (**E-01**), useful qualified time/route renewal with installed XPI (**E-04**), independently validated fully recoverable authenticated backup (**E-06**), and genuine owned process restart (**E-08**). An unproved or failed boundary holds only its dependent work and requires a targeted amendment; it may not be replaced by a weaker test or silently changed product policy.

## Controlling hierarchy, after bootstrap installation

1. **Operator's explicit later amendments and permissions**, scoped to their actual action; neither an agent's report nor a PR description is automatically operator approval.
2. **Client Contract v1.0.0** (`docs/authority/PCMS-Alpha-CLIENT-SPEC-v1.0.0.md`) and its independent **AC-01–AC-18 / T-01–T-10 / E-01–E-09** matrix (`docs/authority/PCMS-Alpha-ACCEPTANCE-MATRIX-v1.0.0.md`).
3. **Conditionally approved Gate B v1.1 design**, migration/verification plan and workflow blueprint (`docs/architecture/`); unresolved proofs are **not** deemed complete by approval.
4. This supersession record and the lightweight installed agent/CI/slice execution instructions; these govern **how** authorized work proceeds, not **what** product behavior is accepted.
5. **Historical signed Stage 7 and I00–I17 implementation design/documents** as immutable provenance, regression evidence and compatibility history where not superseded. They are not a competing current product or phase-selection authority.

Preserve exact source bytes and hash provenance for installed authority documents. Do not change original Stage 7 signed files or historic implementation logs as a shortcut to reconciliation.

## Signed Stage 7 compatibility and active instruction paths

The installed Stage 7 integrity verifier (`scripts/check-stage7.py`) checks the exact signed blobs of `docs/engineering/AGENT-PROTOCOL.md` and `docs/engineering/CI-ENGINEER.md` against `SHA256SUMS.txt`. **Do not replace either file or update the signed hash manifest to install new instructions.**

The **active** replacements live at `docs/engineering/active/AGENT-PROTOCOL.md` and `docs/engineering/active/CI-ENGINEER.md`, linked from root `AGENTS.md`. Their historical signed counterparts remain untouched and continue to pass `scripts/check-stage7.py` as genuine source provenance; the active instructions supersede their future agent workflow prescriptions.

The accepted Gate B workflow blueprint originally proposed replacing the historical paths directly. The actual pinned Stage 7 verifier makes that structurally incompatible. This explicit, operator-authorized bootstrap compatibility adjustment preserves both signed integrity and the approved product-level behavior; the policy-root PR still requires independent review.

## Explicit supersessions

- Obsolete `I00–I17 next READY phase` / `resume I17 only` instructions are superseded for **future authorized work** by bounded S00–S08 product slices and actual checked dependencies. This does not invalidate genuine historical evidence.
- Historical instructions keeping new managed capabilities permanently disabled pending routine manual gates are superseded where later accepted standing-scope operator actions apply. **Separate authority** remains required for live provider, private source Git, native host, risky migration and publication.
- Current source repository paths are `generators/<slug>/` and `pcms/prompts/` (from merged `Neb963/per-gens` PR #1). Legacy `gens/` folders are possible history, **not** new-authority paths; resolve records by explicit preserved mapping rather than implicit rename.
- PCMS runtime may conditionally write tested source directly to authorized `per-gens/main`, with independent readback. Coding agents must still use reviewed implementation/source-authoring PRs. There is no cross-repository blanket write grant.
- Accepted reversible Archive controls; account-capacity advisory covers all **non-archived** managed accounts including temporarily unavailable ones. Updating existing public generators requires approved unlisting/human publication semantics, with bounded holds and no silent previous-good re-publication.

## 2026-10-18 — One-time autonomous-slice execution clarification

**Why and authority.** The operator authorized one scoped documentation/governance correction, not S03 implementation, source/runtime/CI alterations or new external effects. Previous wording confused routine engineering decisions with exceptional approval; unavailable external evidence with failed correctness proof; and code merge with live activation. This caused repeated reviews and unnecessary stoppages. This clarification concerns **execution only**, subordinate to the unchanged Client Contract v1.0.0, AC/T/E, accepted Gate B security constraints, historical signed Stage 7 artifacts and existing protection rules.

**Exact change.** A single standing “Implement the next eligible authorized slice” instruction permits independent selection, compatible technical replacement/cross-module repairs, affected D/B/recovery testing, remote PR checkpoints and ordinary authorized squash merges with postmerge checks. Never invent PASS, bypass required CI, weaken source/identity/route/publication protections or self-approve modified policy trust roots. Missing L/H/GIT proof restricts the dependent remote/native effect, not unrelated safe code merging; actual failed CI, installed-Firefox, correctness or security behavior blocks affected completion. Significant redesign demands demonstrated defects, not imagined ideal-scale requirements. Retain accepted 50+/1,000+ support, exact candidate human publication, original uncertain I17 no-CREATE/RENAME quarantine and durable lost-ACK reconciliation.

**Eight policy-consistency scenarios (instruction review, not runtime proof):**
1. **S03 without live Perchance:** eligible merged S00/S02 allow D/B pinned-main catalog/prompt implementation; dependent GIT/L proof remains separately pending.
2. **Compatible redesign:** fix measured defect with tested equivalent engineering method; no routine operator vote.
3. **External acceptance unavailable:** record actual missing tier, keep affected runtime action dormant, complete independent safe code; no invented PASS.
4. **Required CI/B regression:** fix first actual failure before merging affected code; assertions remain intact.
5. **Protected authority:** changing route isolation, source/release guards or CI policy requires independent trusted final-diff review; agent cannot self-approve.
6. **Uncertain remote ACK:** journal and reconcile by observation before another effect; original quarantine stays.
7. **Merge readiness:** ordinary verified safe implementation can squash merge under existing CI/protection and delegation; exceptional protected reviews remain.
8. **S02 continuity:** merged production-v2 code is inactive/not live accepted; release-specific H/L proof does not automatically block independent S03.


## Protected legacy state

- `Neb963/PCMS-Alpha` main and I17 draft PR #20 are distinct and neither is assumed accepted under Gate B. The former must be inspected before bootstrap; the latter must not be automatically merged, rewritten, or discarded.
- Batch `batch_e2c328e54f9c4a6ab89f1084134fde52` / slug `pcms-test-esr-chain-20261015-a01`: **permanent no-automatic-CREATE/RENAME from every intake, restore and migration path** until operator-directed resolution. Missing original browser journal is UNKNOWN, not negative evidence; quarantine applies even in new disposable test profiles.
- Original-profile migration and shared host/schema cutovers require preserved authoritative source/journals/identity/history/exclusions and corresponding scoped authorization. Independent verified-empty disposable profile work need not wait for that unavailable original journal.

## Trust-root transition requirement

The first documentation/bootstrap PR changes policy-root instructions and therefore must be **independently reviewed and explicitly merged by the operator or protected trusted authority**. It cannot self-certify using its edited AGENTS/CI selector/required checks. Preserve existing branch rules and historical tests until a separately verified replacement is effective. If required documents are not installed, no S00 implementation proceeds.
