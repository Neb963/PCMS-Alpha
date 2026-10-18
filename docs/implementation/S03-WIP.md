# S03 — GitHub pinned-`main` catalog, prompt and import preview

**Outcome:** IN_PROGRESS / draft PR #26. No live Git write, host installation, provider action, production migration or initial-import approval performed. Do not promote to S03 accepted or merge before unresolved engineering, D/B and independently required safeguards are closed.

## Authority and scope

The controlling behavioral oracle is the approved Client Contract v1.0.0, AC-07/08/09/11 and E-05, and the conditionally accepted Gate B v1.1 S03 map. The standing instruction authorizes safe S03 engineering; it does not authorize private `per-gens` writes, live Perchance operations, operator-profile/native installation, CI policy changes or original I17 replay. S00/S01/S02 are merged dependencies. S02 v2 backup production activation and provider L evidence remain separate holds.

## Implemented on this draft branch

- **Complete main-only scan** (`src/runtime/git-catalog.mjs`): configured private GitHub repository identity and immutable `main` pin; recursive-tree completeness check with nonrecursive managed subtree fallback; per-path/type/size/case-collision validation; Git blob OID verification of declaration and existing `pcms/prompts/default-chat1.md`. Enumeration has no arbitrary 1,000-generator product ceiling. Incomplete/masked 404/budget exhaustion never establishes empty/missing state.
- **Read-only discovery**: recognize exactly `generators/<slug>/DEPLOYMENT.md`; no root-level or PR-branch discovery, no inferred owner, no automatic READY acceptance. Record optional `TESTING.md` OID and source folder tree identity. Distinguish READY declaration from independently verified coherent deployment.
- **Import scope preparation**: first-import read-only table shows exact recognized slugs, unknown owner facts and a material-scope comparison independent of unrelated HEAD movement. **No import approval or create-intent effect is wired yet**; S04 must never infer approval from this preview.
- **Git connection**: fixed native helper `local.pcms.backup_vault` has versioned, repository-ID-scoped `git.store/status/get/remove` operations. Secret Service stores Git token, not extension IndexedDB/backup. Git connection stores only repository name/ID in browser local configuration; API token never reaches UI response or AI/native editor. Locked/missing host holds safely. Native/helper registration on the operator's machine remains unauthorised/untested.
- **Background reads**: `catalog-watch.mjs` registers synchronously and observes `main` from a 15-minute alarm with a native-vault credential, without the PCMS tab. Read-only completed snapshots include only generator declaration metadata, never token, prompt text or source bodies. Failures/restore holds retain the previous complete snapshot, with missing-folder changes labeled **observations only**, not delete/rename/create commands.
- **Dormant prompt CAS executor** (`git-prompt.mjs`): existing Git-owned prompt only; exact fixed path, expected prompt blob OID, nonforced commit to current `main`, source readback and no blind lost-ACK replay. Not exposed through UI or scheduled operations because a canonical durable effect journal, reconciliation and exact external Git-write authorization remain required. Missing existing prompt is not replaced with a made-up starter.
- **Packaged integration**: entry, overlay and Generators page include the S03 port, watcher and panel. Legacy I05 manual source inspector is kept intact for historical associations. No donor/Signed Stage 7 source changes.

## Deterministic negative and recovery tests

`tests/i00-s03-catalog.test.mjs`, `tests/i00-s03-prompt.test.mjs`, `tests/i00-s03-credential-vault.test.mjs`, `tests/i00-s03-background.test.mjs` exercise 1,025-fold managed trees, GitHub truncation fallback, malformed/colliding paths, corrupt blobs, missing default prompt, changed relevant scope, private-repo identity, sender/allowlist, native vault/restore holds, token redaction, no-dashboard scan, incomplete-snapshot retention, race single-flight, fixed-path prompt compare-and-swap and uncertain-ref acknowledgments. Verification remains exact-commit-and-CI dependent; do not infer installed browser or real private remote success from isolated fixtures.

## Unresolved bounded S03 engineering and evidence

1. **First-import acceptance remains read-only:** obtain independent current owner/missing evidence and proposed account allocation; implement one durable, revision-pinned human scope-approval receipt with changed-material revalidation and a safe interface for S04 intent coalescing. It must not emit provider CREATE/RENAME, including the original quarantined I17 slug.
2. **Git default Chat 1 editing**: add guarded draft-preserving operator editor and canonical prior-intent/possible-effect/reconcile storage before enabling the dormant conditional writer. Lost PATCH ACK must reconcile read-only before any second effect. Supersede conflicting drafts rather than overwrite.
3. **Complete immutable manifest + coherent READY**: declaration-commit causality, source/test input pinning, full source bytes/fingerprint and independent READY coherence must be connected to the S02 source interfaces. A READY text line by itself is not deployable proof.
4. **Full background scale/recovery**: bound multi-thousand-folder traversal across event-page suspend/restart, cache verified immutable subtree/blob OIDs, checkpoint work without crediting partial enumerations, and verify backend account preview stability. The current complete scan is not a resumable multi-turn traversal.
5. **Proof**: exact-head D and fully installed full-capability Firefox B; native Secret Service actual H and remote private Git conditional GIT each require their own permitted scope. Signed-provenance, old I17 quarantine, donor security, source integrity and current `pcms-required` must continue passing.

**Safety disposition:** No production activation. Existing main protected. Keep draft PR and original I17 PR #20 untouched. No merge or S03 SUCCESS claim on partial engineering or missing required test evidence.
