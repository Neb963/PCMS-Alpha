# AGENTS.md — Proposed PCMS-Alpha Implementation Entry (AUDITED DESIGN — DO NOT EXECUTE UNTIL AUTHORIZED)

> **NOT FOR DEPLOYMENT YET.** Stage 6 is design only. Stage 7 audit and explicit implementation authorization are required before using this in the repository.

## Scope and truth

- Work only in authorized `Neb963/PCMS-Alpha`; donor pin `Neb963/persona-router@9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf`; preserve combined Gecko identity `persona-route-manager@local`, PersonaMonkey guard, lease/native authority and fail-closed routing. `Neb963/per-gens` is a separate private generator-source authority; do not initialize/write it without specific authorization.
- The accepted Stage 1–4 product design, Stage 3 F1/F2 supersession, Stage 5 verification contracts and `docs/implementation/plan.json` govern behavior. Historical Alpha repositories are not implementation authority. Read the applicable source documents; don't infer acceptance from a prior agent's prose.
- Read `docs/engineering/AGENT-PROTOCOL.md`. For **every** test, CI, harness or workflow change, read `docs/engineering/CI-ENGINEER.md` first and apply it.

## Exactly one phase

1. Read actual GitHub `main` and open/draft PRs via the connected GitHub integration; inspect working tree without discarding uncommitted changes.
2. Resume the existing unfinished authorized phase first. Otherwise select the earliest eligible phase in manifest order whose dependencies are verified as accepted on protected `main`, skipping only safely parked blocked phases. **One active agent and one phase per invocation.** Do not self-start another phase.
3. Make compatible architectural repairs when necessary, including shared interfaces and tests. Add adverse-case regression tests. Don't weaken product/security/CI trust root or silently broaden phase scope. Escalate only genuine product-policy changes or changes that need exceptional trust-root review.
4. All external provider/browser effects must pass PersonaMonkey guard, current owner/route/editor tests and durable intent journal. Lost remote acknowledgment => read-only reconcile/hold, never blind repeat. No live service mutations in CI. Manual operator tests are minimal, targeted and late, with separately approved actual side effects.

## GitHub checkpoints and merge

- For any implementation dependency/acceptance plan correction, compare old and new gates: additive compatible corrections can proceed through trusted checks, but a weakening root-policy change must be independently reviewed. Do not use PR-controlled workflow code as its own trust anchor.
- **Unpublished valuable work is at risk.** Commit and publish coherent increments **through the connected GitHub integration**, not just local git. Open draft PR early and verify branch HEAD/tree remotely after each checkpoint. Commit object without confirmed branch ref is not a checkpoint; local-only work => `REMOTE_CHECKPOINT_PENDING`.
- Do not force-push or force-update refs. No direct implementation commits to protected `main`. For multiple files/binary/deletions, construct exact Git blobs/tree/commit, nonforced and compare expected remote HEAD; use content APIs for simple isolated UTF-8 edits when appropriate.
- Before I06/I07 *any* generator-source Git folder/archive write, require tested journal + nonforced Git CAS/readback/lost-ack handling; otherwise leave the source step pending. Never confuse implementation-repository checkpoints with private generator-source writes.
- Run targeted tests and impacted donor regressions. Only mark candidate ready after selected trustworthy CI and packaged Firefox evidence. Verify actual protected merge and resulting `main` commit; a green PR or enabled auto-merge is not acceptance. Squash phase PRs; preserve original incremental commits in PR branch/history as available.
- Candidate completion records contain no self-referential commit SHA or future test-run ID; bind actual candidate/merge SHA from GitHub CI and postmerge proof externally.
- If any protected CI/policy authority itself changes, block autonomous merge until independent trusted verification or rare operator review. Do not let PR-owned CI self-approve a weaker gate.

## End and report

Stop after one of: `MERGED_AND_VERIFIED`, `IN_PROGRESS_CHECKPOINTED`, `BLOCKED_SAFELY`, `NO_SAFE_PHASE`. Report phase, PR/branch and confirmed remote SHA, tested tiers and evidence links, XPI digest if built, capability ON/OFF, exact holds and next action. No unsupported PASS, no local-only checkpoint claim, no automatic continuation.
