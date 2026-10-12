# PCMS-Alpha — Stage 6.4 CI, Verification and Acceptance Architecture

**Prepared:** 2026-10-12  
**Status:** ACCEPTED DESIGN — S6-Q22 accepted by operator on 2026-10-12; no CI execution or product acceptance implied.  
**Boundary:** No repository initialization, coding, CI execution, browser installation, provider action, or GitHub mutation is authorized by this document.  
**Authority:** Accepted Stages 1–4; Stage 5 Verification Specification, Test and Failure Matrix (56 P-tests), Evidence/Unknowns Register (U-01–U-16), Operator Acceptance Plan (H-01–H-07); Stage 6.0–6.3, including required GitHub connector checkpointing. The 56 P-tests are **unexecuted future contracts**.

## 1. Goal and non-goals

Optimize **time-to-trustworthy-feedback and time-to-repair** rather than runner-minute consumption. Public GitHub Actions availability is not a reason to duplicate slow Firefox boots or accept flaky CI. A green check means explicitly identified assertions ran against explicitly identified code. It is not proof that the whole application or live Perchance service works.

Non-goals: permanent CI governor, multi-agent phase ownership/claim machinery, operator approval per test or commit, running live Perchance/Mullvad/Cloudflare in public CI, copying private `per-gens` content into implementation CI, asserting pass for a mocked live capability, or converting stage design tests into retroactive PASS.

## 2. Four verification boundaries, not one enormous suite

| Tier | Mechanism | Runs when | Pass means | Does NOT mean |
|---|---|---|---|---|
| **F — fast deterministic** | Type/static/build/lint, donor security unit regressions, focused domain tests, fake Perchance with independent remote-effect ledger, fake Git DAG, virtual-clock invariants | On **every** PR code revision; focus tests also during development | Precise invariants of code/fixtures at given commit | Firefox event page, live owner, live refresh, file actually saved to disk |
| **B — packaged Firefox** | Exact built XPI installed in disposable **Firefox Developer Edition** profile; real background wake, native-host mock boundary, tab ownership, extension message/permissions, UI | Browser-critical changes; final readiness when matching scope; post-merge smoke | Actual observed behavior of recorded Firefox/build/XPI/profile | Real Perchance, real Mullvad or actual KDE keyring unless those were independently exercised |
| **X — cross-system / adversarial / load** | Multi-authority fault chains, 50+ account/1,000+ generator emulator, restore-cutpoint matrix, high-risk full donor and PCMS suite, measured resource envelope | High-risk shared-boundary changes; milestones; scheduled nightly (not required pre-merge unless affected); final phase I17 | Entire specified composite scenario at its actual tier | Every conditional provider/host unknown resolved |
| **H — operator-only** | Stage 5 H-01–H-07 narrow real UX/provider/host checks | **Late**, only after relevant automatic prerequisites; target-specific separate approval for live mutation | Exactly observed real-world fact | Unperformed broader/general provider guarantee |

B/X can share selected harnesses, but one expensive browser boot should run several related assertions in the *same isolated profile* where doing so does not invalidate state independence. Tests that require independent clean profiles keep distinct profiles. F, B and X are automated; H is not public CI. No blanket operator checkpoint for I00–I16.

## 3. One required PR check, with fail-closed selection

**Proposed workflow:** `.github/workflows/required.yml`, triggered for every PR targeting `main` (no top-level path exclusions); optional `push` on `main` for independent post-merge validation with separately named concurrency group. Stable protected check **`pcms-required`** is the *only* mandatory aggregate status at first. Other informative jobs/checks remain visible but must be evaluated by `pcms-required` when selected.

### 3.1 Minimal jobs and trust inputs

1. `classify`: compare current candidate with independently observed target `main`/merge base. Classify changed files and transitive impact: donor routing/permissions/native, background/IDB/restore, Perchance/AI/source, Git adapter, scheduler, UI/accessibility, test harness/CI trust root, docs-only, dependency/toolchain. If detection errors, unknown file class, moved path, or unreliable comparison: select a **conservative broader tier**, never empty. **Changes to tests/fixtures cannot lower the selected risk**.
2. `fast`: compile/package-lint/static/type checks, mandatory inherited donor security smoke, targeted domain tests, deterministic negative cases; exercise applicable contract assertions rather than treating missing test files as PASS.
3. `firefox`: conditional B suite selected by actual browser/lifecycle/permissions/UI risk; read precise XPI artifact from the same PR candidate, not independently rebuilt uncorrelated bytes. Expose Firefox build, test profile, packaged hash, failure trace and cleanup confirmation.
4. `integration`: conditional X suite for changed high-risk shared primitives / final phase; otherwise nightly or explicit milestone. Still compulsory where an affected invariant requires it before merge.
5. `pcms-required`: executes **even if dependencies fail/skip/cancel**; validates current expected jobs, job outcome, executed required test IDs, evidence metadata, forbidden skip/cancellation, trust-root status and final candidate SHA. Fails if any selected job is missing, failed, canceled, timed out, incomplete, or improperly skipped; fails if required assertion had no independently observed oracle. A merely `skipped` GitHub job is not evidence. Fails when CI policy itself was edited without an independently enforceable approval route.

Implementation mechanism must respect GitHub's actual workflow semantics: a workflow skipped via path filters can leave required checks pending, while a **job** skipped by `if` can show success and dependency skips can otherwise mask failures. Implement the aggregate with `needs` and an `always()`-equivalent run policy, then deliberately test these failure modes on a disposable PR. A required green status produced by PR-modified workflow is not itself a trust anchor; §7 gives separate protection.

### 3.2 Feedback phases and draft PRs

- Each **remote checkpoint** triggers cheap F-level PR feedback. Agents push coherent incremental commits through the GitHub connector and confirm remote readback; red WIP in a draft PR is acceptable, but can never merge.
- Run an **early focused B smoke** when establishing/changing browser lifecycle, not after each tiny source/fixture tweak. Avoid broad Firefox repetition while F is red.
- Before considering a phase ready, agent remotely commits a final phase-evidence/ready candidate (or otherwise creates a changed, verified candidate SHA), requests ready-for-review, and runs the **full selected B/X gate on that final merge candidate**. Readiness without final-SHA evidence cannot request auto-merge. `ready_for_review` event should trigger the final gate, but **a pre-existing green draft check alone must never qualify**; validate exact run/head/merge target and readiness evidence.
- `main` post-merge independently builds/proves installable XPI from merged source and records *new* SHA; never attribute a pre-merge binary digest to the squash merge unless reproduced/independently proven identical. Existing PR evidence remains tier-limited. Failure after merge creates scoped repair/revert PR, not silent marker rewrite.

## 4. Deterministic oracle and negative-case discipline

### Required provider fixture behavior

**Perchance:** persist a remote-effect ledger separate from PCMS IndexedDB and controller memory, as well as remote owner/session, listing, full saved PJS/HTML/`src/` byte state, partial uploads, stale reads and real-like opaque identities. Crash simulation must leave independent remote facts intact. Assert `PREPARED` → `DISPATCH_POSSIBLE` before dispatch, authoritative readback before `CONFIRMED`, no blind ambiguous retry, exact target binding and no forbidden effect. Simulated 200/AI prose is never sufficient.

**GitHub application adapter:** disposable fake repo with trees/blobs/refs/HEAD, directory/path collisions, READY and TESTING.md history, concurrent unrelated and relevant HEAD changes, lost responses, orphan commits and non-forced ref updates. Do not confuse this *private `per-gens` application authority* fixture with the **public implementation-repository GitHub connector checkpoints**. CI holds no live `per-gens` credential.

**Clock/fleet:** virtual interval/evidence ledger and controlled suspension/restart, at least 50 mock accounts and 1,000 generators, independently known effect counts, no invented time credit/slot visibility. Measure real Firefox resources on representative fixtures before setting operational bounds.

**Archive/restore:** authenticated archive corruption/tampering, locked/unavailable synthetic vault, Downloads-start versus completed versus independent disk hash, cutpoint after each dependency group, UID collision, operator-owned inactive fresh controller, diagnostics canary/secret leak scanner. No real user data.

**Test validity:** for each high-impact new negative assertion, prove the test would go red on the corresponding injected violation/mutant, then green under the correct behavior. A failing fixture that never reached the intended effect boundary is inconclusive. Do not require mutation-testing frameworks by default: one explicit controlled wrong-behavior fixture often suffices.

## 5. Firefox packaged test protocol — two different installation claims

**Important verified distinction:** `web-ext run`/`about:debugging` installs an extension *temporarily* and it disappears after Firefox restart. That installation can support short-lived event-page lifecycle tests, but **cannot establish persistence of the installed XPI across a full browser restart**. Mozilla documents persistent unsigned XPI testing on Firefox Developer Edition/Nightly with extension Gecko ID and `xpinstall.signatures.required=false` in a disposable profile. The later harness must separately verify the actual packaging/installation path and signed/unsigned policy for the exact pinned Firefox build.

| Scenario | Installation/profile needed | Evidence required |
|---|---|---|
| Event-page suspend and wake | Packaged XPI in isolated browser; temporary install permitted if real page actually unloads | Observed unloading/wake, alarm/message delivery, fail-closed guard order, no dashboard keepalive |
| **Full Firefox restart / installed extension survival** | **Persistently installed** exact packaged XPI under disposable Developer Edition profile; not `web-ext run` temporary installation | After process exit/relaunch, same installed add-on ID and XPI, recovered IDB/guard/alarms, no duplicate or unauthorized effect |
| Human tab handoff and permission checks | Packaged XPI, real tabs with mock generator/editor and native host; isolated profile | Dirty/unknown tab not closed/overwritten; correct permission prompt and final mutation denial |
| UI/keyboard/assistive tech | Actual packaged Firefox build, synthetic fleet fixtures | Stable focus/selection, 320 effective CSS px, contrast/ARIA/AT measurements with operator H-01 later |
| Old/new controller restore | Two isolated disposable persisted profiles with dummy archive and fake provider | New remains nonmutating, old may still exist, no accidental authority transfer |

Harness must record browser **product/version/build**, XPI SHA-256, fixed Gecko ID `persona-route-manager@local`, installed vs temporary mode, manifest permissions, test fixture revision, native-host mock version, profile lifecycle and timestamps. A headless simulated callback, `web-ext run` followed by an automated re-install, or a post-restart rebuilt XPI cannot be represented as persistent-restart PASS. If real persistent-install automation is unsupported, return `BLOCKED` for that test, not PASS; retain the safe capability hold. Agent should first diagnose harness errors with a local single-case replay before relaunching full CI.

## 6. Exact test ownership mapping: 56 contracts, one controlling result each

The following names a **primary implementing/first-full-proof phase**. Earlier phases may implement/execute a prerequisite subcase and later phases rerun regressions. Do **not** mark a P-test fully PASS from a partial subcase. Relevant Stage 5 P51–P56 source paragraphs remain the detailed oracle, injection and acceptance specification.

| Phase | Primary test IDs | Mandatory supplementary verification / condition |
|---|---|---|
| I00 | — | Donor manifest/Gecko/native identity, reproducible XPI/package, inherited donor regressions; no unearned P51 claims |
| I01 | P51-01, P51-02 | Actual packaged Firefox cold wake, guard/lease and no Direct fallback; donor isolation smoke |
| I02 | P51-03, P51-04, P51-06, P55-11 | Out-of-DB restore guard and P51-08 negative subcase; independent effect/diagnostics oracles; canonical UI revisions |
| I03 | — | Enrollment/UID/route and binding revalidation; P51-02/P52-01 relevant subcases with fake account |
| I04 | P52-01 | Real inventory projection in packaged Firefox, current owner versus collaborator and safe unknown state |
| I05 | P53-01, P53-02, P53-03 | Git path/READY/relevant drift read-only with fake empty repository and conflicted tree |
| I06 | P52-02, P56-06 | Private-first reserve/rename, batch effect ledger, no ambiguous double-create |
| I07 | P52-03 | Slug reincarnation/adoption/consent, preserved source baseline and safe association |
| I08 | P55-01, P55-02, P55-05 | Authenticated archive/snapshot and honest first download evidence tiers; P55-12 relevant size partial |
| I09 | P51-05, P52-04, P52-07 | Persisted tab handoff, byte-exact source readback, dirty/unknown editor hold |
| I10 | P52-05, P52-06 | AI tests/source identity, fresh Chat 2, no AI-controlled authority; P56-07 subcases |
| I11 | P53-04, P53-05, P53-06 | Git tree/HEAD/writeback no-force, lost-ack and sanitized suggestion; no publication |
| I12 | P51-07, P54-01, P54-02, P54-03, P54-04, P54-07, P54-08, P54-10, P54-11 | Shadow queue, clocks, health, capacity, one alarm and 50+/1,000+ synthetic load; P54-09 early measurements |
| I13 | P53-07, P53-08 | Human approval and source-bound publication, sleeping unlist/remaining budget, P56-01 subcases |
| I14 | P54-05, P54-06 | Provider-effect/permissibility may remain `BLOCKED` until conditional H-04; disabled mutating mode is valid safe result **but not a P54-05 live PASS** |
| I15 | P55-03, P55-04, P55-06 | Vault/locked-key and scheduled retention; complete remaining P55-05 disk/download tiers if supported |
| I16 | P51-08, P55-07, P55-08, P55-09, P55-10, P55-12 | Recovery checkpoints and all groups, UID remap, inactive fresh controller; H-06 later for migration claim |
| I17 | P54-09, P56-01, P56-02, P56-03, P56-04, P56-05, P56-07, P56-08, P56-09, P56-10 | Full P56 composites; inherited donor regressions; UX-01–10 and late H-01/H-07, H-06 if claiming migration; H-02–05 conditional |

**56-contract coverage count:** P51 = 8 (I01×2, I02×3, I09×1, I12×1, I16×1); P52 = 7 (I04×1, I06×1, I07×1, I09×2, I10×2); P53 = 8 (I05×3, I11×3, I13×2); P54 = 11 (I12×8, I14×2, I17×1); P55 = 12 (I02×1, I08×3, I15×3, I16×5); P56 = 10 (I06×1, I17×9). The final Stage 6.5 phase manifest must mechanically validate the mapping against all 56 unique IDs, with **no duplicates and no omissions**. Where a test has conditional external portions, store separate sub-evidence rather than falsely marking its aggregate complete.

> **Mapping QA alert:** The prose count for P54 must be verified programmatically in Stage 6.5; the map row lists I12's nine IDs P54-01/02/03/04/07/08/10/11 = eight, I14's two and I17's one. Likewise any P55-05 tier not yet independently proven remains an explicit subcase `NOT_TESTED` or `BLOCKED`, despite successful earlier archive checks.

### 6.1 Per-capability safety gates supersede phase numbers

- **All remote PCMS provider writes:** packaged P51-01/02/03/04/06 relevant negative gates; no unsafe dispatch under missing journal/guard; donor unaffected.
- **Unattended editor/source writes:** additionally P51-05, P52-01/04/07, authenticated current owner and operator-editor safety, protected archive required by accepted sequencing.
- **Conditional GitHub writeback:** P53-01–06 plus final saved full F, actual test evidence and opted-in auto/manual intent; normal GitHub CI has no private-source write credentials.
- **Public listing:** P53-07/08, saved F, owner/editor, current GitHub READY and individual approved exact source; fresh boundary check, lost publish answer goes read-only reconciliation.
- **Mutating Refresher:** P54-01–11 meaningful effect proof P54-05; absent external proof or unsupported action ⇒ feature **OFF** while monitoring may continue.
- **Unattended backup:** P55-01–06, suitable safe vault/recoverable key, honest Downloads evidence tiers; key unavailable ⇒ suspended, never plaintext.
- **Destructive restore:** P55-07–10/12, checkpoint, staged receipts, independent guard; restored-new remains inactive until separate H-06 if claiming migration/activation.
- **Global acceptance:** P56-01–10 plus Stage 4 UX-01–10 at appropriate actual tier, final H-01/H-07. Partial capability success must be reported precisely; no “all accepted” with held critical enabled feature.

## 7. Trust root, CI self-modification and public runner security

**Same-author self-approval is not independent review.** On a public repository an untrusted contributor/agent can change test commands/workflow YAML inside its PR. GitHub branch protection requiring the resulting green check is **insufficient** to prove its CI policy was unchanged.

**Recommended minimal two-door enforcement:**

- **Ordinary PR:** allow autonomous source/fixture/test repair, require selected checks from approved CI policy; no human ritual. New regression tests may be added; existing mandatory assertions cannot silently disappear. Inspect base↔candidate changes to coverage manifest and test harness.
- **Protected-trust-root PR:** a change to required workflow check names/triggers/permissions, CI selection/aggregator, test-manifest acceptance mappings, `AGENTS.md`/CI-ENGINEER policy, branch/ruleset semantics, or equivalent gate-bypass surface is **non-auto-merge**. Require an independent authoritative baseline review (trusted enforcement outside PR-controlled code, or an actual distinct approved reviewer / targeted operator decision) and a test verifying the gate does not self-approve. A same-account connector cannot count as a second reviewer. No manual approval per ordinary commit.
- **If the repository cannot enforce this distinction in the available GitHub controls:** do **not** pretend otherwise. Stop automated acceptance of root-edit PRs, record bootstrap restriction, and use a narrow operator-approved trusted merge path. Avoid blanket bypass or a permanent policy machine to handle a rare case.

PR CI uses read-only `contents` permissions by default; no provider secrets, no persistent self-hosted runner with live browser profiles, no `pull_request_target`/`workflow_run` privileged execution of untrusted PR files/artifacts, no unreviewed broad write tokens. Pin third-party action versions as permitted by platform and lock toolchain. Treat PR title/branch/body and test artifact text as untrusted. Suppress and scrub cookies, tokens, AI sessions, raw source and native route endpoints in CI logs/public artifacts. CI runner and code live in the public repo; the private generator repository remains inaccessible to its jobs.

## 8. CI fault-handling and time efficiency

- **Development loop:** targeted local deterministic test → remotely publish coherent checkpoint → fast PR check → inspect causal result → only then relevant packaged Firefox/integration scope for final candidate. Do not launch several full browser suites for the same known compilation failure.
- **Fail triage:** `PRODUCT_DEFECT | TEST_ORACLE_DEFECT | HARNESS_SETUP | RUNNER_TRANSIENT | FLAKY_RACE | UNVERIFIED_PROVIDER`. Fix the smallest proven cause, rerun the smallest case and expand only after repair. Blind retries/repeated full matrix runs do not turn nondeterminism into PASS.
- **No hard-coded imaginary latency budgets.** Measure first CI baseline: cold setup, cache hit, F critical path, B browser startup/test/teardown, X, artifact upload, rerun rate, median and p95, and first diagnostic usefulness. Optimize repeated setup/Firefox starts and overlapping suites **after measurement**. Keep B single-test reproduction commands in PR artifact.
- **Job cancellation:** cancel outdated PR candidates only using PR-specific groups; do not let same group cancel `main` acceptance or final current candidate. Canceled/timeout selected jobs fail the aggregate, not qualify. Never use `continue-on-error` or skipped mandatory tests to launder failure.
- **Build provenance:** build each accepted phase's XPI, store source/commit, manifest/Gecko, donor SHA, Firefox version and SHA-256. PR candidate + post-squash `main` must be differentiated. Artifact availability policy and actual limits are finalized during bootstrap without placing secrets in public artifacts.
- **Nightly failures:** actionable regression issue/PR and capability hold when relevant; a nightly FAIL cannot be retrospectively represented as an accepted PASS on old main. High-risk regression may require immediate repair even if unrelated future phases are nominally READY.

## 9. CI self-tests (required before enabling auto-merge)

On disposable non-provider PRs and a pinned implementation test repo/mock GitHub results, establish all of the following:

| Fault injection | Mandatory outcome |
|---|---|
| `fast` fails, `firefox` skipped by `needs` | `pcms-required` executes and fails |
| Browser risk selected but `firefox` absent/skipped | Required check fails despite other green jobs |
| Docs-only ordinary PR | Required check appears and succeeds with truthful no-browser rationale |
| `.github/workflows/required.yml` edited to remove assertions | No autonomous auto-merge; independent root gate/review needed |
| A P-test is deleted/renamed, coverage manifest untouched | Coverage validation red, not silently accepted |
| PR WIP checkpoint has failing test | Remote WIP safely preserved; draft PR cannot merge |
| Superseded PR run canceled, current PR run passes | Current final candidate independently evaluated; no accidental main cancellation |
| Main advances after green old head | Refresh merge candidate evidence or hold merge until proven unaffected/up-to-date |
| `web-ext run` temporary extension followed by restart | No persistent-installation PASS; startup case remains untested |
| Firefox installation/harness fails before tested event | No product PASS; diagnostic `HARNESS_SETUP`, selected gate blocked/fails |
| Test says PASS but independent remote ledger disagrees | Negative test fails; fake oracle remains authoritative |
| Squash merge completed | New `main` SHA observed, fresh XPI reproducibility/provenance and post-merge smoke |

## 10. Test/phase evidence schema and hard stop

Each actual future test result must contain at least:

```yaml
phaseId: Ixx
requirementIds: ["U-xx", "UX-xx"]
testId: P5x-xx
status: PASS | FAIL | BLOCKED | NOT_TESTED | NOT_APPLICABLE
tier: SOURCE_EVIDENCED | SIMULATED_PASS | PACKAGED_FIREFOX_PASS | OPERATOR_LIVE_PASS
implementationCommitSha: <exact PR or merged main sha>
mergeCandidateSha: <exact tested synthetic merge sha when applicable>
donorCommitSha: 9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf
xpiSha256: <sha256 or null when not relevant>
firefoxBuild: <id/version or null>
fixtureAndRunnerRevision: <version sha>
injectedFailurePoint: <named cutpoint>
expectedInvariant: <brief falsifiable criterion>
actualObservation: <brief independent observation>
independentOracle: <redacted oracle artifact id and scope>
artifacts: [<redacted local/CI artifact ids>]
residualLimits: <explicit limits>
```

Statuses are not evidence tiers; a `BLOCKED` test must not carry a `PACKAGED_FIREFOX_PASS` claim. Source inspections are not executed test PASS. Test report must distinguish operation **intent**, **possible dispatch**, independently confirmed **effect**, and observed **UI**. Preserve exact required assertions and artifact references on draft PR; after merge, record accepted `main` digest only when verified. On failure, preserve remote WIP and exact blocker; no unchecked bypass.

## 11. Links to authoritative platform documentation (checked during this design)

- GitHub Actions workflow syntax/concurrency: https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax
- GitHub required status and skipped-job behavior: https://docs.github.com/en/pull-requests/how-tos/merge-and-close-pull-requests/troubleshooting-required-status-checks
- GitHub secure `pull_request_target`: https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target
- GitHub Actions script injection risk: https://docs.github.com/en/actions/concepts/security/script-injections
- Mozilla temporary extension install limitation: https://extensionworkshop.com/documentation/develop/temporary-installation-in-firefox/
- Mozilla `web-ext` development/temporary run: https://extensionworkshop.com/documentation/develop/getting-started-with-web-ext/
- Mozilla unsigned persistent XPI permission-testing procedure: https://extensionworkshop.com/documentation/develop/test-permission-requests/

These references are platform *guidance* as of design preparation, not claims that CI currently exists in the empty implementation repository. Future coding agents must consult current documentation before generating workflow YAML.

## 12. Stage 6.4 decision and already-accepted consequences

**One genuinely new design choice remains:**

| ID | Recommendation | Alternative / tradeoff |
|---|---|---|
| **S6-Q22 — Actual CI topology** | One always-present `pcms-required` PR aggregate; cheap fast assertions every PR revision, targeted packaged Firefox/X selected fail-closed on risk/final readiness; post-merge `main` build/smoke and independent broader milestone/nightly runs. | Full slow browser suite on each checkpoint wastes developer time; unchecked conditional skips produce false green. |

**Not new operator decisions:** genuine persistent packaged Firefox restart evidence is a technical validity requirement, not a discretionary alternative; protecting CI trust-root changes is already S6-Q21; and final/minimal H-series testing is already accepted. This stage formalizes their implementation consequences rather than reopening them as Q23–Q25.


## 13. Stage 6.5 handoff and unresolved design checks

Stage 6.5 must translate this into executable phase contracts and a minimal `AGENTS.md`/`CI-ENGINEER.md`/machine-readable plan plus acceptance-map file. Before final ZIP, Stage 7 verifies **all 56 P IDs exactly once as primary mapped**, correct 10 UX mappings, no cycle in I00–I17, no falsely reported runtime PASS, no unproven reviewer independence or checkout path, and ability to resume every draft PR from remote checkpoint. **No setup/mutation is authorized before separate future implementation grant.**


## 14. Operator acceptance record (2026-10-12)

S6-Q22 accepted as recommended: tiered F/B/X/H, always-present `pcms-required`, fail-closed selected tests, selective packaged Firefox and integrated suites, postmerge verification and broad milestone/nightly tests. No implementation or test run is thereby authorized. Stage 6.5 turns this into agent/phase contracts; Stage 7 performs the independent final review. Future decision questions must present the full question, alternative options, recommendation and trade-off.
