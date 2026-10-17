# PCMS-Alpha — Agent entrypoint

**Authority:** Applies only after independent review and merge into `Neb963/PCMS-Alpha/main`. Copies on unmerged branches have no operational authority.

PCMS is a **single-machine Firefox extension**, not a generic workflow platform. Deliver accepted operator journeys with the least compatible change; never optimize for green CI at the expense of working behavior.

## Authority and scope

Read, in order: [`Client Contract v1.0.0`](docs/authority/PCMS-Alpha-CLIENT-SPEC-v1.0.0.md), [`AC-01–AC-18`](docs/authority/PCMS-Alpha-ACCEPTANCE-MATRIX-v1.0.0.md), [technical supersession](docs/audit/TECHNICAL-SUPERSESSION.md), relevant [Gate B v1.1 design](docs/architecture/GATE-B-TECHNICAL-DESIGN-v1.1.md), [migration/proof plan](docs/architecture/MIGRATION-AND-VERIFICATION-PLAN-v1.1.md), and [slice map](docs/implementation/SLICES.md). Read [agent protocol](docs/engineering/AGENT-PROTOCOL.md); read [CI contract](docs/engineering/CI-ENGINEER.md) before changing tests or workflows. Missing/unapproved authority documents **block implementation**, not factual read-only investigation. Historical Stage 7/I00–I17 files remain preserved evidence, not competing current product authority.

Before work: inspect actual `Neb963/PCMS-Alpha` `main`, branches, draft PRs, CI, local changes and the approved **single bounded slice**. Preserve unrelated work; do not rebase, merge, force-push, migrate or overwrite on assumption. Compatible cross-module repairs within that slice are allowed only with implementation authorization. Product/security-policy changes need operator approval.

## Hard boundaries

- PersonaMonkey exclusively owns Persona identity, protected network routing, tabs, control leases and native route operations. No second router, donor raw-state edits, Direct fallback or challenge-driven rotation. Unproved request admission and route health **hold new managed effects** without disturbing unrelated human work.
- Persist intent before side effects. An uncertain provider/Git/native effect is **observed and reconciled**, never blindly replayed. Original I17 batch `batch_e2c328e54f9c4a6ab89f1084134fde52` and slug `pcms-test-esr-chain-20261015-a01`: **no automatic CREATE/RENAME, from any intake path**.
- One generator source writer; preserve exact bytes/assets, unsaved human edits, previous-good source, candidate lineage and approval revision. AI has no direct management, Git or publication authority. Publication requires human approval of the **exact** final candidate.
- Distinguish PCMS runtime's authorized **conditional direct writeback to `per-gens/main`** from coding agents: agent source changes use branches and reviewed PRs. Observe `generators/<slug>/` and `pcms/prompts/` from pinned `main` only. Never place credentials in Git, XPI or CI artifacts.

## Proof, publication and stop

Evidence: **D** deterministic, **B** installed full-capability packaged Firefox, **H** actual host/process/disk, **GIT** remote readback, **L** authorized live provider. Missing, skipped, simulated or stale evidence is **not PASS**. No live/provider/private Git/native-host writes without exact separate authority. Protect CI trust roots through independent review.

Publish durable work to an authorized branch/draft PR; independently re-read remote HEAD/tree. A local commit or created Git object is not a checkpoint. Report the operator journey, changed boundaries, exact revisions, proven tiers, unresolved holds and next action. **Stop at the authorized slice or a failed architecture-critical proof; continue only independent safe work.** Gate B approval alone authorizes no implementation or external effect.
