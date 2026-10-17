# CI and independent evidence contract

**Authority:** Effective only after independently reviewed merge to `main`. Do not change required checks without separate, independently reviewed authorization.

## 1. What a PASS means

Acceptance authority is Client Contract v1.0.0 and AC-01–AC-18 / T-01–T-10 / E-01–E-09. A passing check proves only the assertion, code revision, environment, scope and evidence tier actually exercised. Distinguish **implementation present**, **D PASS**, **B PASS**, **H PASS**, **GIT PASS**, **L PASS** and **operator acceptance**. A fixture cannot establish an actual provider effect; a packaged Firefox test cannot establish host process death; a successful writer tag cannot establish restorable backup bytes.

| Tier | Minimum independent observation |
|---|---|
| **D** — deterministic | Real state transitions/production modules with independent mock-provider/Git effect ledgers, virtual clock, corruption, races and lost-ACK cuts. |
| **B** — packaged browser | Actual fully enabled XPI installed in pinned Firefox, actual extension permissions, tab/editor ownership, suspensions, UI/a11y and durable storage reopening. |
| **H** — real host | OS-observed owned Firefox exit/relaunch and installed-XPI survival; native-port/host death; independent disk reopen and full authenticated restore. |
| **GIT** — Git remote | Authorized actual remote commit/tree/blob/conditional-ref write followed by fresh remote readback against the correct `main` and path whitelist. |
| **L** — provider | Separately approved disposable live account/generator action and independent provider readback, with exact identity and source/listing observation. |

Maintain one small **machine-readable evidence ledger** and generate any readable matrix from it; never hand-maintain two status authorities. Each record identifies contract revision, AC/T/E, exact source/build/XPI and donor IDs, configuration, tier, scope, independent oracle, expected/observed result, artifact, substitutions, limitations and outcome (`PASS`/`FAIL`/`BLOCKED`/`NOT_TESTED`/`NOT_APPLICABLE`). Reuse previous valid proof only when relevant bytes/interfaces, assumptions and tier are demonstrably unchanged.

## 2. Test selection and real failures

Keep the current stable required aggregator, `pcms-required`, on **every PR** (including docs-only) with a selector trusted independently of PR code. It must reject selected child jobs that are missing, skipped, canceled, stale, wrong-SHA, failed, or lack required artifacts. Non-selected jobs are `NOT_REQUIRED`, not PASS. Do not hide the aggregate behind whole-workflow `paths` filters. Validate the selector itself with negative fixtures and an observable red→green case.

Fast lane: build/static checks and affected D tests including donor security, exact source, source conflict, Git conditional-update, record migration and issue-specific negative cases. Browser lane: packed real XPI for changes to background, native bridge, lease/protected route, owner tab, UI and recovery. Milestone lane: adversarial end-to-end, complete source, crypto/restore and 50+ account / 1,000+ generator workload evidence. Privileged L/GIT/host tests run only under explicit narrow authority and **not** in unattended public CI.

Before trusting a fix, show the test can fail for the original defect. Inject stale heads, wrong principal, route revocation/expiry, interrupted source writes, missing optional `TESTING.md`, new READY supersession, dirty human editor, process death and incomplete feed/list enumeration as applicable. An effect ledger must survive independent of the extension's in-memory state, so duplicate external writes are visible. No `continue-on-error`, blanket retries, blind timeout enlargement or deleting failing donor assertions.

## 3. Early architecture-critical gates

- **E-01, S01:** actual PersonaMonkey proxy and blocking listener request-gate admission/revocation across applicable IP families; managed bad requests denied and unrelated human work unaffected.
- **E-04, S01:** installed XPI with dashboard closed proves useful conservative awake-time credit and viable automatic route renewal; real suspend/restart/native loss and measured 50+/1,000+ cost.
- **E-06, S02 (early spike permitted):** independently reviewed streaming AES-GCM *single-message* format and actual end-to-end encrypted, reopened, authenticated, fully decrypted source-heavy restore into a fresh profile. No custom crypto claims from local writer success.
- **E-08, S01 (early):** finite scoped restart supervisor survives real exit and relaunches the **same persistently installed** enabled XPI in a disposable Firefox profile; no personal-session interference.

A failed proof is a promotion hold for dependent work. Do not delay a viability contradiction until S07/S08, substitute a daemon or relax product behavior silently. Independent unrelated work can proceed within authority.

## 4. Trust roots, security and efficiency

CI/workflow/required-check policy, coverage mapping, protected agent instructions and permission changes **cannot self-certify** using their own modified pipeline; route them through a main-trusted reviewer/check or explicit operator-authorized bootstrap. If the repository cannot enforce this, halt automated merging and report the gap. All PR code executes least-privilege (`contents: read` by default); do not run untrusted PR code in privileged `pull_request_target`. Pin toolchains, Firefox and action versions; sanitize artifacts and do not expose generator-source secrets, session tokens, proxy credentials or operator profiles.

For a browser claim log Firefox build, XPI digest/Gecko ID, donor SHA, host version, installation mode and measured lifecycle event. `web-ext run` temporary installs cannot prove persistent cold reboot. A new JS `bootId` is not an OS-observed browser restart. Real process tests require external receipts and isolated profiles/process trees.

Classify first failure as product, oracle/test, packaging/toolchain, environment or flaky race. Reproduce narrowly, preserve redacted failing artifacts and rerun only impacted tests first; expand on shared security surfaces. Measure real feedback time and remove duplicate setup rather than arbitrary safety gates. A finished CI report lists exact proofs, deliberately unrun tiers, holds and next test; never substitute a green badge for the complete operator outcome.
