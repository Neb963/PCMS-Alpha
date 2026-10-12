# PCMS-Alpha — Final Accepted Design Package

**Prepared:** 2026-10-12  
**Status:** STAGE 7 DESIGN ACCEPTED BY OPERATOR ON 2026-10-12. Implementation and repository initialization are NOT authorized by this acceptance.
**Sign-off record:** [`docs/audit/STAGE-7-OPERATOR-SIGNOFF.md`](docs/audit/STAGE-7-OPERATOR-SIGNOFF.md).  
**This is design, not a software implementation, runnable browser extension or permission to initialize either GitHub repository.** No Stage 5 P-tests, packaged-XPI tests, new operator-live tests, or newly designed supplementary acceptance tests have been executed here.

## Start here

1. Read [`docs/audit/STAGE-7-AUDIT.md`](docs/audit/STAGE-7-AUDIT.md) for audit findings, corrected hazards and residual implementation risks.
2. Read [`docs/implementation/BLUEPRINT.md`](docs/implementation/BLUEPRINT.md) and [`docs/implementation/PHASES.md`](docs/implementation/PHASES.md), then [`docs/implementation/plan.json`](docs/implementation/plan.json) for the 18-phase dependency/requirement/test mapping.
3. Read [`docs/engineering/REQUIREMENT-TRACEABILITY.md`](docs/engineering/REQUIREMENT-TRACEABILITY.md) for 56 Stage 1 requirement owners and 31 extra explicit checks.
4. Read [`docs/engineering/AGENT-PROTOCOL.md`](docs/engineering/AGENT-PROTOCOL.md), [`docs/engineering/GITHUB-GOVERNANCE.md`](docs/engineering/GITHUB-GOVERNANCE.md), [`docs/engineering/CI-ENGINEER.md`](docs/engineering/CI-ENGINEER.md), [`docs/engineering/VERIFICATION.md`](docs/engineering/VERIFICATION.md) before implementing any phase.
5. Only after separately issued implementation/bootstrap authorization, follow root [`AGENTS.md`](AGENTS.md) and [`docs/engineering/CONTINUE.md`](docs/engineering/CONTINUE.md). The mere presence of these files does not start/authorize coding.

## Source precedence and historical text

Accepted operator decisions and Stage 3 F1/F2 amendment control over older PJS/HTML-only and writeback-after-approval phrases. Stage 2 Q77 supersedes ±30-minute active/sleep-duration jitter (dispatch staggering only). Stage 5 test cases are unexecuted design contracts. The Stage 4 HTML prototype's reported synthetic results do not establish packaged Firefox correctness. Older sources retain historical status headers/previous proposals for provenance. For implementation sequencing/agent acceptance, Stage 7 audited `BLUEPRINT.md`, `PHASES.md` and `plan.json` supersede provisional earlier G6 groupings and Stage 6.5 drafts.

## Architectural fixed points

One Firefox combined XPI, single PCMS controller, pinned PersonaMonkey donor `9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf`, Gecko ID `persona-route-manager@local`; one account↔dedicated Persona; guard/lease/fail-closed routing owned by donor. Perchance, private GitHub `Neb963/per-gens/main`, PCMS IndexedDB and human editor have distinct authorities. Always journal `DISPATCH_POSSIBLE` before external write, independently read back, hold ambiguous outcomes; no blind retry. Native AI may modify full generator-owned PJS, HTML and `src/`, but has no Git/publish authority. Published source requires exact-source human approval; mutating Refresher remains disabled until provider and fleet proof.

## Future repository layout

Root `AGENTS.md`; `docs/specs` accepted product sources; `docs/verification` Stage 5 test/evidence contract; `docs/implementation` single plan/phase contracts; `docs/engineering` process/CI/recovery; `docs/audit` independent audit. Reuse this relative layout rather than scattering normative files across multiple systems.

## GitHub limits

Implementation destination `Neb963/PCMS-Alpha` was publicly visible and empty when checked during this design; auto-merge was disabled. Private generator source `Neb963/per-gens` had no established `main` ref at Stage 5 audit. Reinspect both under later authorization. There is **no** assertion that branch protection, CI or deployment currently exists. `Unpublished valuable work is considered at risk`: future agent checkpoints must be committed and verified on a reachable remote GitHub branch using the connected GitHub integration.

## Deliberately not included

No application source implementation, donor/vendor source snapshot, native WireGuard credentials, real generator contents, private GitHub data, cookies, local browser profiles, PJS secrets, test-run artifacts or execution PASS receipts. Historical discovery ZIP is a separate research input, not an authoritative executable contract in this design package.
