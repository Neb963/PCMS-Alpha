# S06 — Git writeback, Request Changes and guarded publication

**Status:** Engineering candidate on draft PR #29; **not accepted or merged**. Base S05 main `6e76d28fb628bf8bd54481edd3d7fefa40496318`. S06 follows the accepted Client Contract v1.0 and AC-11–13; it does not approve the unaccepted Gate B proposal or alter Stage 7/donor trust roots.

## Concrete operator journeys implemented

1. On a S05 `TESTS_VERIFIED` source F and one active coherent READY revision, the existing background alarm selects bounded work. It obtains `per-gens` credentials on demand from the native OS secret service, prepares immutable I11 Git intent, conditionally writes precisely F to `main`, and proves the commit's operation trailer, parent, complete Git blob bytes, policy marker and unchanged optional TESTING file. A possibly dispatched write is only *reconciled*, never re-sent. Git publication is not implied.
2. A PCMS-authored output F **does not redefine the operator's READY input**. The main READY inspector still rejects external source drift. A narrow separate path requires the sealed S06 output operation, source hash, canonical READY identity and independent observed Git ancestry and bytes. Non-attributed equal content, edited tests, changed declarations, lost author attribution and unexpected HEAD/source changes hold. Initial input fingerprints remain frozen.
3. The review queue pages the READY fleet without the inherited 200-row limit. It distinguishes waiting for Git, blocked, changes requested, child retesting, ready for review, approved, uncertain publication and independently confirmed publication. Each selected generator's exact F/P file manifest, tests, SHA-256 and 8-KiB source chunks are inspectable using existing I13 review. Changed/exceptional candidates require explicit individual approval; approval alone does not publish.
4. **Request Changes** is an operator-initiated, F/stage/job/release-revision-scoped instruction. A full guarded current-F / owner / Git / route / saved-editor check precedes atomic local request admission. One IndexedDB transaction records the request and revokes any **unsent** approval. A bounded existing background wake independently verifies the same route, editor, idle native session, original owner and exact saved F, then atomically archives original stage and AI job, installs a new stage/source-head rooted at the previous committed F and creates a child AI job using the operator instructions plus original test obligations. No manual restage, publication, Git commit, helper SEND, new external READY token, or trusted donor change occurs at request admission. S05 AI/test and S06 writeback continue through separately authorized and donor-guarded effect gates. A new scoped standing-authority Settings panel defaults development, Git writeback and publication OFF, requires exact operator consent and the private repository ID, and revokes grants on restore or repository rebinding. Each active provider change still needs independent protected source/owner/route checks.
5. For an existing listed generator the existing I13 bounded sleep, unlist, retained previous-good source, encrypted recovery, source replacement and public hold rules stay mandatory. No queue observation or change request unlists the fleet. Individual publish authorization defaults OFF in the packaged extension; an explicit independently consented publication grant can unlock only source-bound, per-candidate human-approved guarded dispatch. It does not itself prove public listing, source saved, or live-provider capability. A possible lost publication ACK is held and independently reconciled, never blindly replayed.

## Source/permission invariants

- No stored Git credential or token. No new router, network isolation mechanism, native shell, donor code change, or untrusted page-provided source/route.
- The Stage 7/I17 guarded CREATE/RENAME quarantine remains intact.
- All new background JS modules must be explicitly copied to the combined XPI by the existing deterministic overlay. No separate extension or scheduler.
- Request Changes preserves prior **P** as recovery source and parent tested **F** in canonical history. It cannot spend a possible Git effect or a possibly dispatched publication, and stale/changed READY, source, job, owner or request revisions hold without generating child work.
- Confirmation of private Git commit, provider save, tests, public listing and recent-feed placement are **different receipts**. None is inferred from an assistant message or a green test.
- Uncertain Git effects remain read-only-reconcilable from their original sealed intent even if READY is superseded or the account paused. No new Git dispatch gets authority from that reconciliation.
- A Request Changes child progresses from testing to Git wait and then **new independent source review** once Git F is confirmed; its original approval never revives.
- Release preview and approval require the active READY record and matching S06 mode, declaration identity, optional tests and independently verified source, not merely a local CONFIRMED string.

## Targeted deterministic tests

- `tests/i00-s06-git-lineage.test.mjs`: stale READY/late revocation, one-shot Git intent and historical successor preservation.
- `tests/i00-s06-declared-output-readback.test.mjs`: actual Git API/mock commit/blob/ancestry evidence for legitimate authored output, third-party drift, counterfeit operation and changed declaration identity.
- `tests/i00-s06-output-provenance.test.mjs`: separate fixed input-vs-output identities and forged/stale attestation denials.
- `tests/i00-s06-request-changes.test.mjs`: approval revocation, parent source/history preservation, same READY child, stale/revoked/uncertain negative cases, transaction-abort no-side-effect cases.
- `tests/i00-s06-release-cas.test.mjs`: atomic fresh READY + same F Git commit prerequisite before approval and dispatch.
- `tests/i00-s06-review-queue.test.mjs`: paged 205-row queue, pending/child labels, forged ports and no external effects.
- `tests/i00-s06-packaged-authorization.test.mjs`: combined-XPI module packaging and Request Changes untrusted-sender/forged-payload denials.
- Existing I11/I13/S03/S05 tests remain mandatory, including the optional `TESTING.md` absence regression.

## Independent acceptance evidence

- **D — PASS on accepted prior engineering checkpoint only:** [required CI run 39309076404](https://github.com/Neb963/PCMS-Alpha/actions/runs/39309076404) fully passed baseline, 585/585 Node tests, packaged Firefox and native-host H at exact `131d0255b47aeddad022c1af5dcadab83740c351`. This establishes only that prior commit, not a blanket PASS for subsequent security/recovery fixes.
- **B/H — PASS on prior checkpoint only:** The same run executed the installed combined-XPI UI/ports/denials and isolated actual DBus Secret Service/native host, durable backup/restore, donor and Firefox process evidence. A newer candidate adds positive installed-XPI standing-grant/revocation proof and must finish required CI on its exact HEAD before those claims are promoted.
- **Final head:** Source-bound release, uncertain Git reconciliation after supersession and child review-progression tests have been added. The exact-head CI aggregate result is the authority; a pending or canceled run is not PASS.
- **GIT:** No real private `per-gens` mutation or independently attributed live commit/readback was authorized here. Mock Git tests are **D**, not GIT.
- **L/H:** No authorized real Perchance listing/source save, protected extension-user session or independent live resource/host tier completed as part of this S06 work. Live activation is not approved by a draft PR or green deterministic tests.
- **Optional:** The client permits (but does not require) a single selected-set bulk approval for truly unchanged, fully tested clean candidates. No bulk operation has been enabled; modified/exceptional source always needs individual human approval.

**Hold:** Keep PR #29 draft and unmerged until all required engineering and external authorization/evidence tiers are independently verified. Preserve a recoverable remote source checkpoint and exact blockers; do not claim S06 PASS.

## Scoped operator activation and private repository preflight

- Read-only connected GitHub metadata confirms `Neb963/per-gens` exists as an accessible **private**, non-archived `main` repository with ID `1411034835`. This is *not* proof of Perchance ownership, Git permissions inside the local Firefox Secret Service, or any Git effect readback.
- The Settings panel exposes three independent `development`, `gitWrite`, and `publication` grants via the same-extension `pcms-s06-authority` port. All three default OFF. Consent is explicit, revision-fenced and scoped to the configured `Neb963/per-gens` repository ID. Browser storage holds no Git credential. The disabled state is verified; a positive installed-port grant-then-revoke exercise is included in the newer packaged Firefox CI harness.
- Git mutation, live provider source saves and real public listing **were not authorized or performed**. The tool-backed read-only GitHub repository preflight and CI mock Git tests must never be described as the accepted GIT/L tiers.
