# I10 — native AI repair and independently evidenced tests (incomplete checkpoint)

**Phase selected:** I10 only (no I11 start). **Base:** protected main `ccb41aeda72b422ad42bca11aded77ff086a18fb` after successful I09 postmerge workflow `38347925555`. **Draft PR:** #12, `phase/I10-native-ai-tests`. No local uncommitted repository work is claimed; changes published via the connected GitHub integration only.

## Implemented on branch

- `src/runtime/ai-evidence.mjs`: deterministic, exact-source test evidence policy. Chat 1 and optional Chat 2 must show independently observed named assertions against the same full source fingerprint. Source changes revoke both suites; prose and stale source are not PASS; interruption cannot lift a hold. The policy is pure and does **not** observe the native helper.
- `src/runtime/ai-store.mjs`: canonical IndexedDB `meta`/`events` prompt history, compare-and-swap revisions, import/export as new revision, source/prompt/test input pinning, conservative per-account concurrency hold. Without a proven native release, account slots are not automatically freed.
- `src/runtime/ai-boundary.mjs`: same-XPI trusted extension-page port; guarded local `PREPARE_JOB`, independent existing I09 saved-source full-byte recheck, protected-route/editor/current READY and `TESTING.md` content pinning. **No native provider dispatch** or UI-supplied test proofs.
- `src/runtime/git-source.mjs`: optional internal-only byte-verified `TESTING.md` read; `entry.mjs`/`overlay.mjs` package it; `src/ui/ai-view.mjs` and `src/ui/index.html` present Settings version history and a Work Queue preparation/receipt view with truthful held status.
- `tests/i00-i10-evidence.test.mjs`: model/adversarial cases for P52-05, P52-06, prompt revision pin/import/export, no AI-prose PASS, source drift and interrupted session holds.
- `scripts/browser-i00-smoke.py`: installed actual combined XPI Firefox Developer Edition synthetic IDB/settings, prompt CAS, concurrency, sealed same-XPI port, Work Queue UI and proof-negative B tests. Scoped selector correction preserves disabled prohibited effects while allowing safe read-only receipt controls; no new privileged CI workflows/check-policy edits.

## Verified evidence (not phase completion)

Workflow `38378817810` on branch commit `a25e1c90bcadbcd2df25342d6f6b08356b30a170`: baseline SUCCESS, fast SUCCESS (`125/125`), unchanged pinned donor tree/regression SUCCESS, installed packaged Firefox Developer Edition 154.0b10 B SUCCESS (Gecko ID `persona-route-manager@local`, persistent install after browser restart), `pcms-required` SUCCESS. Combined XPI SHA-256 `657fc35f0a883e4c81a14e06ff7eb718a775499b9f62467098fa3ce5d324ab88`. B evidence: `I10_PACKAGED_SETTINGS_CAS_PROMPT_PIN_AND_ORACLE_HOLDS`, `I10_PACKAGED_UI_HELD_NO_AI_PROVIDER_DISPATCH`; existing I09 B regressions PASS. CI verifies *these observed behaviors*, not the entire required P52-05/P52-06 contract.

**X:** adversarial negative-case assertions run at fast model level, not a complete independent remote-effect browser adversary. **H/live:** NOT RUN, no provider credentials or writes, as required.

## Exact implementation blockers — resume I10, do not merge yet

1. **P52-05 / F+B:** A safe fixed same-donor guarded native AI helper transport is not implemented. No observed Chat 1 send/session/run/interrupt path, exact tagged tab source ownership, or real editor AI edit/save lifecycle.
2. **P52-05 / F+B:** The pure `applyAiEvidence` mechanism is **not wired** to independently observed browser assertion execution tied to exact saved F; the production code cannot yet create trusted PASS or KNOWN_FAILURE receipts. Do not supply direct UI evidence injection or treat model prose as test evidence.
3. **P52-06 / F+B:** Optional new Chat 2 has no native conversation end/reset/start verification, identity proof, pinned TESTING instruction handoff or lost acknowledgment recovery.
4. **P52-05/06 / F+B:** Bounded incremental repair loop, actual save/readback invalidation, convergence/no-progress handling, source-safe checkpoint recovery and complete independent F/B oracle negatives are not end-to-end wired. The pure policy has unit checks, but there is no real functioning automation.
5. **S6-I10-AI-CONCURRENCY / F+B:** Default conservative account admission is present but configurable, safely released native execution slots and cross-account bounded concurrency remain unimplemented.

These are **implementation blockers**, not provider activation or late operator H-test blockers. Historical Discovery v3 observations locate native helper UI and suggest APIs but do not prove current live semantics; do not invoke a proposed nonexistent `perchanceAutomation` facade. No independent current native smoke was run.

## Capability holds

`AI_PROVIDER_GATED`: OFF in production; `TESTS_VERIFIED` is never reached by the current privileged boundary. Git writeback, provider publication, releases/approval and public/existing-generator overwrite remain OFF. Current preserved I09 stage and prior source are not overwritten by AI. Uncertain native effect, untagged editor, lost donor lease/protected route, stale Git READY, changed owner, human edit or restore sentinel must remain HELD without Direct fallback or blind retry. No CI authority-root weakening, private per-gens write, Perchance/Mullvad/Cloudflare operation, or secret publication.

## Recovery/next action

**Resume this same draft PR #12 and implement the missing native adapter/independent oracle and F/B negative-case coverage before ready-for-review.** Revalidate main head/ruleset and new final merge candidate, run required gate, then protected squash merge and postmerge installed-XPI F/B proof. Do not create an I10 completion marker or start I11 before actual implementation is complete.
