# I17 live-functionality repair — 2026-10-15

Resume PR #20 at `2e59996061af9abe0640e46faecc8f4108b7cc74`, base main `34a5c48fbfac6c15ef86a453668b3b353402ab18`. Both remote refs rechecked. Operator-reported `pcms-test-esr-chain-20261015-a01` uncertain batch was not accessed, replayed, cleared or migrated in the operator profile. Coding-agent tests remain isolated; no Firefox Dev MCP or provider mutation.

## First repair checkpoint

Confirmed architectural defects: provider preflight occurred after possible-effect marker; native payload duplicated srcManifest inside generator; template publicity checks denied safe explicit-empty forks; first causal failures were collapsed; no missing-identity investigation; harmless identity observation advanced account authority and invalidated frozen plans.

Read-only PREFLIGHT_CREATE/PREFLIGHT_RENAME now precedes READY_TO_DISPATCH and durable DISPATCH_POSSIBLE. Native dispatch requires an exact operation/session/census/freshness-bound preflight, rechecks session/account census/target immediately before the sole mutation, and explicitly reports a proven refusal before native invocation as NOT_DISPATCHED. The caller persists that known result, not CREATE_UNCERTAIN. Lost replies retain uncertainty. ACK identity is durably captured before independent reads. First redacted cause, stage and operation remain retained through recovery. Prepared/no-effect intents require explicit cancellation before new exact consent.

Actual native save shape is pinned to discovery `network-endpoints.json` generator.save and raw `saveGenerator.js`: explicit empty private generator; no inherited identity/source/imports; top-level `srcManifest: {}` only. Public template aliases are not cloned. Readback still verifies owner, private account membership, empty roots/assets, and stable remote identity. Reserved/collision/ambiguous absence is distinct. No status code is fabricated into remote absence or no-effect proof.

Missing ACK identity cannot be deterministically attributed from account delta alone: native API supplies no evidenced client idempotency key. New preflight retains a bounded independent pre-effect census; investigation collects new candidates/owner/private-empty evidence without claiming attribution. Older schema remains readable and enters CREATE_INVESTIGATION with its original operation and slug reservation. It is quarantined, never re-created. Operator-supplied candidate names permit read-only investigation only, not success or a replacement create. UI/diagnostic handoff is in progress.

Identical re-verification updates its observation without advancing binding authority. A changed principal increments bindingVersion and invalidates dependent authority. New frozen plans pin principal in addition to Persona/binding; old records retain their original revisions.

Targeted tests use the actual native adapter against an independent effect ledger: preflight/template causes and zero saves, create/rename with native shape and independent readback, delayed membership plus retained ACK, lost ACK/new-census ambiguity, legacy record investigation, unchanged versus changed identity, and inherited no-blind-replay/guard/Git negatives. Full packaged integration and UI work remain in progress; this checkpoint is not full acceptance.
