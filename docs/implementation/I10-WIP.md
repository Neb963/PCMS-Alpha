# I10 — Native AI and independently evidenced testing (checkpoint, NOT complete)

**Selected phase:** I10 only. Protected main base `ccb41aeda72b422ad42bca11aded77ff086a18fb`; prior I09 postmerge workflow `38347925555` successful. Draft PR [#12](https://github.com/Neb963/PCMS-Alpha/pull/12), branch `phase/I10-native-ai-tests`. No I11 implementation, private `per-gens` writes, provider effects, publication, CI workflow modification, or nonpublic credentials.

## Durable implementation on phase branch

1. **Settings/jobs:** `ai-evidence.mjs`, `ai-store.mjs`, `ai-boundary.mjs` with revisioned Settings default prompt and JSON import/export, read-only source-bound job preparation, immutable pinned Chat1/optional TESTING input, conservative per-account concurrency, canonical IndexedDB CAS and structured redacted job receipts. No arbitrary test payload supplied from the UI to Core.
2. **Native integration:** `perchance-ai-native.mjs`, guarded `aiNativeStep` in build-only donor overlay, `persona-guard.mjs`, and Work Queue controls. The fixed MAIN-world script selects native Send/Stop/New Chat by Discovery-v3 observed IDs on **one exact I09-tagged owned private editor tab**, within the pinned donor lease/protected route. Native Send or reset is preceded by canonical `DISPATCH_POSSIBLE`; a lost ACK never authorizes resend, and Firefox recovery holds unknown outcomes. Native session IDs are represented only as nonce-salted SHA-256 digests, not exported raw.
3. **Full-source and tests:** `PROBE_NATIVE` verifies independent guarded saved PJS, HTML, every `src/` byte, remote ownership/unlisted state and clean editor after native idle. `perchance-ai-oracle.mjs` provides a **narrow** ISOLATED-world browser-observed preview smoke check; known preview errors produce FAIL, inaccessible/empty/unknown preview produces TESTS_UNVERIFIED. `RUN_TESTS` is guarded and binds its result to the exact saved full-source fingerprint; AI prose/history/SSE or arbitrary UI payload cannot inject PASS.
4. **Fresh Chat2 and repair safety:** control and store paths for confirmed native chat reset, observed absence of prior session, distinct post-send hashed session, pinned optional TESTING text, same-session repair only after known failure, source-version invalidation of prior test PASS, and repeated unchanged failing repair holds. Human dirty editor, collaborative route changes, preserved tab and previous source remain fail-closed. No automatic publication or Git writeback.
5. **UI and packaging:** Work Queue offers pinned jobs, safe receipts, native attempt/probe, narrow independent smoke and observed-failure repair; Settings versioned prompt history; build overlays and entry imports only fixed functions, no unrestricted API or content-selected tab/frame/script.

## Execution/evidence

**Current-candidate workflow [38383194583](https://github.com/Neb963/PCMS-Alpha/actions/runs/38383194583), head `f3e9fc46bdf9dc0ae0da2eb4c092a90d5a85399d`:**
- Fast `node --test tests/i00-*.test.mjs`: **133/133 PASS, 0 FAIL**; red-capable native editor owner, human takeover, source drift, fresh-session and preview error negative cases.
- Pinned donor: all 223 original files and SHA pinned unchanged; inherited donor npm regressions and build/reproducible XPI jobs successful.
- B: genuinely installed exact combined XPI in disposable **Firefox Developer Edition 154.0b10**, ID `persona-route-manager@local`, present after full process restart. B `I10_PACKAGED_SETTINGS_CAS_PROMPT_PIN_AND_ORACLE_HOLDS`, `I10_PACKAGED_UI_HELD_NO_AI_PROVIDER_DISPATCH`, `I10_PACKAGED_NATIVE_DISPATCH_JOURNAL_FULL_SOURCE_CRASH_HOLD`, `I10_PACKAGED_KNOWN_FAILURE_NOT_DOWNGRADED_AND_REPAIR_NO_PROGRESS_HOLD` PASS. Existing I09 and donor regression coverage remained green.
- Packaged XPI SHA-256: `b2c57697088dec1c4261d2dd26a4263361b60833a11e7acdb4a0f11678a64c4f` on the candidate above. Latest `pcms-required` aggregate must be inspected separately before any completion claim.
- X: specifically labeled *synthetic* adversarial model/F oracle cases, not a full external/browser-adversarial X acceptance suite. H/live Perchance, Mullvad and Cloudflare: **NOT RUN**, no operator production acceptance claimed.

## Remaining genuine IMPLEMENTATION work — do not merge I10 yet

1. **P52-05** independently observable arbitrary required testing: only the fixed nonempty/settled preview smoke assertion is currently executable. A natural-language Settings test name and optional `TESTING.md` remain unsupported by an independent machine oracle. A preview smoke PASS is **not** a full generator-functional test PASS; unsupported/opaque checks remain `TESTS_UNVERIFIED`, and known FAIL cannot be relabeled unavailable.
2. **P52-06** automatic iterative repair convergence is incomplete: there are guarded step-based controls and no-progress holds, but no autonomous bounded repair/retest driver that repeats supported assertions after each full saved F. Fresh Chat2 reset/session identity is wired but full server/history/OPFS scratch isolation and crash/wake B matrix need additional negative-case proof. Optional T1 test execution is not complete.
3. **S6-I10-AI-CONCURRENCY:** the default one active job per account is conservatively held, but globally configurable concurrency, safe observed-idle execution slot release upon fully evidenced completion or human-review wait, and resource-limited multi-job scheduling have not been implemented.
4. Additional **F/B** independent effect ledger failure injection for remote accepted/lost AI Send/Stop/end, changed source after test observation, displaced human tab, stolen session and A→B→F iteration should complete before acceptance.

These are not late H or activation blockers; they are unresolved required code/evidence. The historic Discovery v3 native-helper observations inform the implementation but cannot certify current live site behavior. Actual provider activation is a distinct later capability gate.

## Holds and resume

`AI_PROVIDER_GATED` remains **OFF by default**; the native bridge/Work Queue is wired but no real provider dispatch is authorized. Source bytes are kept internally in canonical storage, excluded from UI receipts. Git writes OFF; automatic and manual publication OFF; human exact-source release approval not implemented (I13). No Direct fallback, no silent re-send after uncertain effect, no dirty-editor overwrite.

**Outcome:** `IN_PROGRESS_CHECKPOINTED` if the published branch HEAD/tree and final candidate checks are independently confirmed. Preserve draft PR #12, do not add a completion marker or merge. **One next action:** resume this I10 PR, finish independently observable test suites and autonomous resource-bounded repair/retest/concurrency with F/B independent negatives, then re-run final protected merge candidate, and only then consider protected squash/postmerge proof.
