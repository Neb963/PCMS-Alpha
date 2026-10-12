# PCMS-Alpha — Stage 3 F1/F2 Decision Amendment

**Date:** 2026-10-12. **Status:** **FINAL: F2 full-generator scope amendment accepted; F1 operationally verified and closed with explicit visibility limitation.** Original paragraphs below record the test protocol prior to execution; final evidence is appended.

## A. F1 — initial private/empty generator creation

**Requirement remains unchanged:** after reservation PCMS must own a real empty/unlisted Perchance generator associated with the intended account/slug. No public-first creation is accepted.

A disposable operator-driven test userscript, `PCMS-F1-Private-Empty-Creation-Probe.user.js`, tests the existing `/minimal#edit` fork pathway by setting `isPrivate=true`, empty `modelText`, and empty `outputTemplate` *before* the first native `app.saveGenerator()` call. The probe records redacted `/api/save` request/response facts and reads back the created generator with `/api/getGeneratorPageData`. It optionally renames **only after** initial private/empty readback and operator confirmation. It does not delete generators or automatically retry ambiguous remote effects.

**What constitutes useful proof:** the INITIAL creation request contains `isPrivate:true`, empty editors and empty source-file manifest; server returns `created`; independent saved-source readback reports private, empty PJS/HTML, and zero source files; post-rename readback confirms the intended slug, private/empty state and account ownership.

**Limits:** an unlisted generator can still be accessed by direct URL. A client-side probe cannot establish an unobservable server-internal guarantee against transient public listing. Positive owner verification and independent listing checks remain required before declaring F1 fully proven. Abort on any contradiction or uncertainty; do not create repeatedly.

## B. F2 — superseding operator decision

The operator explicitly **supersedes** the previous Stage 2 Q55 and Stage 3 F2 limitation requiring native AI modifications to only PJS and HTML.

**New accepted AI scope:** the native Perchance AI helper may modify, add, delete, debug and test **any code and source files belonging to the selected Perchance generator**, including PJS, HTML and its generator `src/` assets. Its tested and observable output is the full generator source state, not only two editors. No special PJS/HTML-only AI tool sandbox is required.

**Authority retained by PCMS:** PCMS controls account/Persona binding, admission, guarded automation, source/GitHub association, GitHub credentials and commits, test acceptance, manual publication approval, publishing, backup and rollback. Do not provide its GitHub credentials or privileged PCMS command access to the native helper. The assistant's message is treated as untrusted **proposed metadata**, not evidence of success, authorization to publish, or a verified source snapshot. Do not claim the helper is technically incapable of reaching arbitrary pages simply because its intended operating scope is one generator; the PCMS execution boundary must still verify target identity before it performs any privileged action.

### User-directed workflow

1. PCMS checkpoints current source, binds one generator/account/Persona and starts one native AI helper test/repair session (including configured test instructions).
2. Native AI tests the live generator, diagnoses, changes PJS/HTML/**src files**, saves and retests as necessary. PCMS observes actual save completion, source manifest, independent source-file bytes where available, test evidence and remote listing state; known failures continue to block publication.
3. Once the final saved source fingerprint is verified and all applicable tests pass, PCMS offers two GitHub writeback modes:
   - **Manual review/writeback:** operator reviews the exact diff and suggested commit message; PCMS performs a conditional non-forced GitHub commit.
   - **Automatic writeback:** if enabled, PCMS observes the native helper's final *assistant* response, extracts an explicitly delimited suggested commit message, sanitizes it as plain text, and writes the independently verified source snapshot to GitHub using the recorded base revision. The message alone never triggers a commit. Absence of the expected final-response marker, uncertainty, incomplete tests, provider drift, or a conflicting remote revision suspends automatic writeback for review.
4. Requery GitHub main and verify resulting content/fingerprint after the conditional commit. Do not force-push, silently overwrite concurrent changes, or promote a READY marker merely because an AI response requests it.
5. **Publication remains a separate human approval** bound to the exact final full-source fingerprint. GitHub synchronization (manual or automatic) is not publication approval, and a proposed commit message does not authorize release.

### Minimal response protocol (proposed, not yet accepted as a specific syntax)

A terminal native helper response may contain one distinct line such as:

`PCMS_COMMIT_MESSAGE: fix: resolve generator validation errors`

PCMS extracts only the plain-text description and verifies it against its deterministic operation state. The helper does not receive a write-capable GitHub interface. The exact marker grammar and policy for what happens without a valid marker should be finalized with adapter tests, not inferred from arbitrary prose.

### Source-of-truth reconciliation

This is a **controlled Perchance-first AI contribution**: while AI repairs the generator, its working source is a candidate. PCMS then commits the verified candidate back to the authoritative `per-gens/main` source history. Until that commit is confirmed, the candidate is not an approved GitHub baseline. If GitHub changes relevant paths meanwhile, PCMS holds the writeback and preserves the Perchance candidate rather than overwriting either side.

### Superseded clauses and retained protections

- Supersedes Stage 2 §4.3 Q55, related §4.4 editor-only repair language, Stage 2 acceptance check B-12 **only regarding generator assets**, and Stage 3 F2 PJS/HTML-only enforcement gate.
- Retains provider owner checks, human editor no-overwrite, scoped holds, exact full-source fingerprints (including `src/`), tested repair convergence, positive test evidence, manually approved publication, no direct GitHub/PCMS power for AI, and independent GitHub writeback authority.
- Therefore **F2 is CLOSED as a requirements-scoping gate**, not "proven by technical confinement". The normal implementation tests must still verify readback of full generator source, responder attribution, commit-message parsing, safe GitHub commits and no privileged command execution from AI text.

## Stage 3 status after this amendment

- **F1 — CLOSED ON OPERATOR LIVE EVIDENCE**: initial private/empty create, private-first rename, final owner/inventory/source verification and sampled listing absence passed; see controlling final addendum. This line supersedes the pre-test status.
- **F2 — CLOSED BY EXPLICIT SCOPE CHANGE**: AI may edit full generator. No PJS/HTML-only tool-confinement test required.
- **Stage 3 overall — FINALIZED / ACCEPTED DESIGN** after the independent post-rename evidence; integrated implementation still untested.

This amendment changes **design specifications only**. It is not a code implementation of PCMS, a live Perchance operation or an authorization for automated publication.


## Final evidence and controlling disposition — 2026-10-12

Evidence chain: `pcms-f1-2026-10-12T00-18-20-204Z.json` (initial create, operator-run userscript v1.0.3) and `pcms-f1-rename-readonly-1791764668100.json` (independent read-only final-slug verifier).

- Initial create: native `/api/save` request sent `isPrivate:true`, empty PJS, empty HTML, `srcManifest:[]`; HTTP 200 / `created`; independent temp-slug readback `isPrivate:true`, both exact source lengths zero, no assets. One create request observed.
- Final target `pcms-test-007-001-009`: independent server readback private and empty; owner endpoint `is-owner`; exactly one matching private inventory record; not found in the 432-entry checked recent-list sample.
- Original probe did not survive the provider's rename navigation to verify afterward, but the read-only verifier independently established the final state. Do not infer the rename had no possible remote effect simply because the old probe lost document state.

**F1 final:** live-verifiable reservation behavior accepted. The provider's unobservable internal transient listing behavior and global absence from all public surfaces are not mathematically established. Treat unlisted as public-by-URL. Any future contradictory observation or provider drift blocks the affected mutation; implementation testing still covers ambiguous create/rename, crash and replay.

**F2 final:** source scope includes all generator-owned assets; GitHub source association, guarded writeback and human publication approval belong exclusively to PCMS. Automatic writeback is opt-in and requires verified final full-source bytes/test evidence, attributed final AI response and revision-safe conditional GitHub commit. AI text is an untrusted commit-message *suggestion*, never an authorization or evidence of PASS.

**Stage 3:** design accepted; Stage 5 integrated functionality remains unverified. This amendment is authoritative over conflicting earlier PJS/HTML-only language in the historical accepted Stage 2 document and Stage 3 drafts.
