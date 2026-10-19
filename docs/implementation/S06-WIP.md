# S06 — Git writeback, Request Changes and guarded publication

**Status:** Engineering candidate on draft PR #29; **not accepted or merged**. Base S05 main `6e76d28fb628bf8bd54481edd3d7fefa40496318`. S06 follows the accepted Client Contract v1.0 and AC-11–13; it does not approve the unaccepted Gate B proposal or alter Stage 7/donor trust roots.

## Concrete operator journeys implemented

1. On a S05 `TESTS_VERIFIED` source F and one active coherent READY revision, the existing background alarm selects bounded work. It obtains `per-gens` credentials on demand from the native OS secret service, prepares immutable I11 Git intent, conditionally writes precisely F to `main`, and proves the commit's operation trailer, parent, complete Git blob bytes, policy marker and unchanged optional TESTING file. A possibly dispatched write is only *reconciled*, never re-sent. Git publication is not implied.
2. A PCMS-authored output F **does not redefine the operator's READY input**. The main READY inspector still rejects external source drift. A narrow separate path requires the sealed S06 output operation, source hash, canonical READY identity and independent observed Git ancestry and bytes. Non-attributed equal content, edited tests, changed declarations, lost author attribution and unexpected HEAD/source changes hold. Initial input fingerprints remain frozen.
3. The review queue pages the READY fleet without the inherited 200-row limit. It distinguishes waiting for Git, blocked, changes requested, child retesting, ready for review, approved, uncertain publication and independently confirmed publication. Each selected generator's exact F/P file manifest, tests, SHA-256 and 8-KiB source chunks are inspectable using existing I13 review. Changed/exceptional candidates require explicit individual approval; approval alone does not publish.
4. **Request Changes** is an operator-initiated, F/stage/job/release-revision-scoped instruction. A full guarded current-F / owner / Git / route / saved-editor check precedes atomic local request admission. One IndexedDB transaction records the request and revokes any **unsent** approval. A bounded existing background wake independently verifies the same route, editor, idle native session, original owner and exact saved F, then atomically archives original stage and AI job, installs a new stage/source-head rooted at the previous committed F and creates a child AI job using the operator instructions plus original test obligations. No manual restage, publication, Git commit, helper SEND, new external READY token, or trusted donor change occurs at request admission. S05 AI/test and S06 writeback continue under their original effect gates; each active provider change still needs independent authorization and protected native-source checks.
5. For an existing listed generator the existing I13 bounded sleep, unlist, retained previous-good source, encrypted recovery, source replacement and public hold rules stay mandatory. No queue observation or change request unlists the fleet. Individual publish authorization remains false in packaged production absent an independently accepted live adapter. A possible lost publication ACK is held and independently reconciled, never blindly replayed.

## Source/permission invariants

- No stored Git credential or token. No new router, network isolation mechanism, native shell, donor code change, or untrusted page-provided source/route.
- The Stage 7/I17 guarded CREATE/RENAME quarantine remains intact.
- All new background JS modules must be explicitly copied to the combined XPI by the existing deterministic overlay. No separate extension or scheduler.
- Request Changes preserves prior **P** as recovery source and parent tested **F** in canonical history. It cannot spend a possible Git effect or a possibly dispatched publication, and stale/changed READY, source, job, owner or request revisions hold without generating child work.
- Confirmation of private Git commit, provider save, tests, public listing and recent-feed placement are **different receipts**. None is inferred from an assistant message or a green test.

## Targeted deterministic tests

- `tests/i00-s06-git-lineage.test.mjs`: stale READY/late revocation, one-shot Git intent and historical successor preservation.
- `tests/i00-s06-declared-output-readback.test.mjs`: actual Git API/mock commit/blob/ancestry evidence for legitimate authored output, third-party drift, counterfeit operation and changed declaration identity.
- `tests/i00-s06-output-provenance.test.mjs`: separate fixed input-vs-output identities and forged/stale attestation denials.
- `tests/i00-s06-request-changes.test.mjs`: approval revocation, parent source/history preservation, same READY child, stale/revoked/uncertain negative cases, transaction-abort no-side-effect cases.
- `tests/i00-s06-release-cas.test.mjs`: atomic fresh READY + same F Git commit prerequisite before approval and dispatch.
- `tests/i00-s06-review-queue.test.mjs`: paged 205-row queue, pending/child labels, forged ports and no external effects.
- `tests/i00-s06-packaged-authorization.test.mjs`: combined-XPI module packaging and Request Changes untrusted-sender/forged-payload denials.
- Existing I11/I13/S03/S05 tests remain mandatory, including the optional `TESTING.md` absence regression.

## Unfinished acceptance tiers

- **D:** Run/repair all tests against the final candidate commit, including the new positive mock cross-library flow and negative tests. A prior intermediate fast run failed on a corrected duplicate variable declaration; it is not final evidence.
- **B:** The installed combined Firefox XPI, actual relevant UI port and native/Donor interaction must pass at the final commit. The predecessor run had a real S02 native-host lost-`PREVIEW_V2` ACK; no success can be inferred. Do not relax required CI to bypass that dependency.
- **GIT:** No real private `per-gens` mutation or independently attributed live commit/readback was authorized here. Mock Git tests are **D**, not GIT.
- **L/H:** No authorized real Perchance listing/source save, protected extension-user session or independent live resource/host tier completed as part of this S06 work. Live activation is not approved by a draft PR or green deterministic tests.
- **Optional:** The client permits (but does not require) a single selected-set bulk approval for truly unchanged, fully tested clean candidates. No bulk operation has been enabled; modified/exceptional source always needs individual human approval.

**Hold:** Keep PR #29 draft and unmerged until all required engineering and external authorization/evidence tiers are independently verified. Preserve a recoverable remote source checkpoint and exact blockers; do not claim S06 PASS.
