# I17 production activation inventory — 2026-10-15

Reviewed baseline: e1e1172953b63d65fee610c623da8c5eef37b104. Operator-live evidence remains pending. The discovery-v3 archive SHA-256 is recorded in the operator guide. Its proposed `perchanceAutomation` object is not installed and is not used.

| Capability / visible action | Production admission and actual effect | Journal / independent result | Remaining qualification |
|---|---|---|---|
| Accounts / bind, verify, rebind | Account boundary, donor control lease, current protected container; native authenticated inventory and ownership reads | Canonical binding revision and principal fingerprint | Operator account session H |
| Supply / create, rename | ARM_EXACT_ITEM, ordinary canonical slug, exact item CAS, 120-second single-effect consent, donor guarded isolated native save/rename | CREATE/RENAME_DISPATCH_POSSIBLE; separate account membership, owner, public ID, privacy and old-slug readback | Actual operator create/rename H |
| Private Git marker | ARM_EXACT_GIT, exact source folder, existing private per-gens/main, ephemeral token | GIT_DISPATCH_POSSIBLE, nonforced ref movement, full marker readback; read-only reconciliation on unknown | Operator Git access; no repository initialization |
| Initial READY source | PREVIEW → ARM → COMMIT, exact PJS/HTML/binary assets fingerprint and typed consent | Canonical intent before Git objects, HEAD/tree/blob readback; unknown is held | Operator-authored initial source and optional local asset files, no out-of-band Git edit |
| Private stage | PIN_STAGE → ARM_EXACT_STAGE → STAGE_PRIVATE, current READY, owner, protected route, exclusive clean editor | PREPARED/DISPATCH_POSSIBLE, saved full PJS/HTML/assets and editor readback | Operator provider H; fixed immediate-new-tab execution race with bounded read-only readiness |
| AI / native Chat1, optional Chat2, stop | ARM_EXACT_AI or separately SET_AUTO_JOB; exact stage/job/source/owner, current route and clean editor | AI_DISPATCH_POSSIBLE, independent saved-source and browser test evidence; unknown cannot resend | Actual native/streaming H; fresh Chat2 isolation remains evidence-dependent |
| Automatic AI | Production per-job consent gate, one bounded step per wake, durable deferred holds | Source revision/nonce fences and no dispatch replay | Qualified job only, no global AI switch |
| Git writeback | Manual ARM_EXACT_COMMIT or opted-in per-job AUTO arm; verified tested F, READY and HEAD | Journaled ref update and independent DAG/tree/blob readback | AUTO token intentionally memory-only; event-page suspension needs explicit re-arm |
| Publication | APPROVE exact bytes → ARM_EXACT_RELEASE → DISPATCH; supports private-new and existing-update kinds | DISPATCH_POSSIBLE; independent PUBLIC+full-F readback, no ACK success | Operator H; ordinary save is not recent-list proof |
| Adoption | Explicit consent; two matching full original reads; production immutable archive gate | Immutable original; journaled Git archive and independent integrity readback | Operator Git permission |
| Existing update / recovery | Production per-action UNLIST/STAGE/RESTORE gate, sleeping eligibility, encrypted previous P | Separate action journals, privacy and exact-byte readback; restore remains unlisted | Operator H; readiness wait preserves lease and human ownership |
| Refresher monitoring / pauses / statistics | One durable scheduler/alarm, existing bounded donor read path | Independent recent-list and metrics, rate limits and scoped account pauses | Operational clock requires evidence; monitoring is not mutation |
| Refresher qualification | Capture public baseline → normal reviewed meaningful update → observe result; same Refresher boundary, no extra controller | Durable fingerprint, owner, binding, native publication receipt, distinct recent-list rank/time/completeness | No dedicated permissible recurring refresh method in frozen discovery. No fleet mutating adapter claimed. H-04 and P54-09/P56 still required |
| Manual/scheduled backup | Existing encryption/download boundary; scheduled safe-secret opt-in | Authenticated archive and actual Downloads receipts, honest disk-proof tier | Local vault availability and H-05 if used |
| Staged restore | Existing authenticated plan/checkpoint and permanent external restore guard | Per-group journals, explicit inactive fresh controller | H-06 before fresh-controller activation |

## Repairs and review constraints

- Replaced obsolete global shell hold with actual guard/canonical availability events. Per-workflow authorization remains local to its boundary.
- New owned editor tabs wait for native readiness under the existing donor lease; no write retry or second controller. Timeout preserves unknown state/tab.
- AI continuation rehashes the independently checkpointed F instead of requiring it to equal original B or trusting a transient `ok` flag absent from persisted records. Normal repair, optional Chat 2 authorization and mid-job AUTO consent can reach their actual adapters after legitimate source changes.
- Stop is exposed in AI tests, bound to the independently observed running session and journaled before its native click. It can cancel AI-owned unsaved work without overwriting source; changed session, human ownership/input and route failure still hold. Independent stopped-session readback is required and does not claim tests passed. AUTO controls now reside with their selected AI job, and result messages survive receipt refresh.
- Qualification observations cannot grant fleet permission, mutate source, or turn source/list correlation into causal proof. Wrong owner/route/rebind, stale canonical revisions and inadequate publication proof remain held. Feed failure does not erase a separately verified source change.
- Signed originals are retained; only the signed-file alias verifier changes to accommodate amended current instructions. Required CI jobs, privileges and test policy are unchanged. Independent review remains mandatory before merge.

## Remaining packaged OFF / HELD conditions

| Pattern / location | Actual authority, not a global production denial |
|---|---|
| Default `effectGate` false in factories | Default factories alone confer no effect authority. Normal UI uses exact arms for supply/staging/manual AI/manual Git/release; production registrations add bounded per-job AUTO, adoption archive and existing-update gates. Packaged supply and AI tests use ordinary slugs and default gates, with independent synthetic provider ledgers. |
| `ARM_DISPOSABLE_*`, `PILOT_*` | Retained backward-compatible restricted commands/internal error names. Normal UI calls `ARM_EXACT_*`; ordinary slugs do not need disposable prefixes. Expiration/context/route holds remain real. |
| `CAPABILITY_OFF` in legacy command/guard facades, unsupported actions | Read-only legacy APIs deliberately cannot dispatch arbitrary writes. Visible production actions use separate validated boundaries. Unknown/unsupported commands are rejected, not an eligible operation. |
| `providerEffects: OFF`, `publication: OFF`, `NO_AI_WRITEBACK` | Scope of that read-only/local/Git/AI response; publication is a separate human-approved release. Health and journal UI no longer infer a global hold from these fields. |
| `SHADOW_ONLY`, `REFRESH_ACTIVATION_HELD`, provider UNQUALIFIED | Genuine unresolved permissible recurring provider method. Live monitoring and operator qualification are wired; fleet mutation is not claimed. Preserve P54-09/P56/H-04 requirements. |
| Native history/isolation/test/source/editor/owner/HEAD/approval holds | Actual prerequisites and independently observed evidence, including supported test assertions and exact fresh Chat 2 attribution. No synthetic evidence unlocks a real capability. |
| Restore INACTIVE / sentinel hold, backup vault held | Deliberate safety requirements: predecessor/controller authority and H-06; accessible OS vault for scheduled backup. They are not pilot-only gates. |

## Verification and independent review

Added fast regressions cover binary initial source, wrong-target Git tree, readiness timeout/lease loss, exact AI continuation/Stop, owner/session drift, lost ACK/no replay, and distinct Refresher source/approval/recent evidence. Packaged Firefox exercises normal supply consent, real IDB AI send → changed F → independently failed check → repair → observed running → exact Stop, and persisted operator qualification with stale-revision rejection. Provider ledgers remain isolated; no H PASS follows.

Observed repository ruleset `24945151` still requires `pcms-required`, prohibits non-fast-forward/deletion, and has no bypass actors. It currently requires **zero approving reviews**, so independent trusted-review enforcement for the signed-original alias/agent-authorization change remains a **merge prerequisite**, not a self-awarded check. PR #20 stays draft with auto-merge disabled. Required workflow, aggregation, permissions and donor pins were not relaxed. The operator live-test candidate can be packaged while merge remains held.
