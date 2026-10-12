# PCMS-Alpha — Stage 3 Working Decision Register

**As of:** 2026-10-12  
**State:** **STAGE 3 DESIGN FINALIZED / ACCEPTED (2026-10-12)**. Q107–Q154 decisions recorded; Q136 and Stage 2 Q55 PJS/HTML-only limitation superseded by operator. F1 initial private/empty create and private-first rename to the final authentically owned slug **both operator-live-verified**. F2 closed by explicit full-generator AI scope amendment. The latest finalization dispositions supersede historical status statements below.  
**Scope:** Design specification and incorporation of user-operated F1 live evidence only. No PCMS implementation, repository modifications, coding-agent tests, or final release ZIP.

## Authority

1. `PCMS-Alpha-Stage-1-Requirements-Audit.md` — accepted requirements.
2. `PCMS-Alpha-Stage-2-Behavior-and-Lifecycle-Specification.md` — accepted behavior, Q32–Q106, particularly §1.1, §2, §4–7, §10–11.
3. `PCMS-Alpha-Stage-3-Design-Plan.md` — design sequence and proof boundary.
4. Existing `Neb963/persona-router` donor source and Mozilla documentation — technical evidence, not a replacement for requirements.

## Stage 3.1 — Accepted choices (Q107–Q122)

| Question | Decision | Interpretation |
|---|---|---|
| Q107 | A | Synchronous security-first entrypoint and listener registration; route protection precedes asynchronous work. |
| Q108 | A | Event-driven checkpoints and rehydration; no dependence on always-resident JS. |
| Q109 | A | Narrow in-process same-XPI typed PersonaMonkey facade. |
| Q110 | A | Shared guarded Persona control and execution arbitration; not a new independent PCMS lock granting browser authority. |
| Q111 | A | Perchance-specific bounded actions through retained guarded runner, not general PCMS automation bypass. |
| Q112 | A | Dedicated authenticated/validated allowlisted internal command surface. |
| Q113 | A | No implicit takeover of operator tabs; unknown dirty state inhibits writes/publication. |
| Q114 | A | Preserve Gecko/native-host compatibility and verify safe in-place upgrade; fresh-profile restore remains supported. |
| Q115 | A | Temporary Persona exclusivity only during conflicting work, not during whole release/approval/active-sleep intervals. |
| Q116 | A | Fail isolated: PCMS invalidity holds PCMS mutations without disabling safe PersonaMonkey functionality; donor security failure inhibits dependent operations. |
| Q117 | A | Explicit human handoff of automation-owned tab; handed-off tab no longer auto-cleaned; relevant PCMS work held/reconciled. |
| Q118 | A | Shared conflict admission and explicit existing human override, never silent PCMS preemption. |
| Q119 | A | Preserve independently gated external Integration API for compatibility, off by default; PCMS uses internal facade. |
| Q120 | A | Direct Personas only through valid explicit PersonaMonkey authorization, never a fail-open fallback. |
| Q121 | A | Preserve donor state/schema separately; PCMS mutations initially disabled pending configuration/validation and fixture-tested upgrade. |
| Q122 | A | No automatic import of historical PCMS/Alpha databases; possible future isolated inspected importer requires separate approval. |

**Result:** Stage 3.1 policy/architecture decisions are consistent with the Stage 2 invariants at design level. Combined-XPI capability remains unverified until targeted tests. No Stage 2 behavior has been superseded.

### Stage 3.1 proposed execution path

Firefox event page synchronously installs security guards and registered event entrypoints -> asynchronous donor security services -> PCMS storage/reconciliation barrier -> guarded operation admission -> durable PCMS intent and appropriate Persona lease -> guarded browser action -> remote independent readback -> local confirmation/disposition.

A human tab handoff revokes automation cleanup ownership and blocks competing relevant PCMS work until source/ownership reconciliation. UI messages authenticate extension pages/content-script context and permit only explicit typed operations. Startup failure is scoped: routing remains fail-closed even if PCMS state is unavailable.

### Stage 3.1 remaining technical verification — not claims of tests

- U-01: internal shared arbitration preserves donor guarded leases/local workflow/route revocation/external control security.
- U-07: operator dirty editor conflict + owned/human tab handoff + interrupted cleanup in packaged Firefox.
- U-09: alarm/message cold-wake registration, no-dashboard checkpoint reconstruction and donor fail-closed boot.
- Q114/Q121: packaged in-place upgrade retaining donor state and native compatibility; new PCMS remote actions inhibited before setup.

## Stage 3.2 — Accepted minimal persistence architecture (Q123–Q130)

**Accepted architectural direction:** Keep donor state in its existing storage.local mechanism. Use one dedicated Firefox extension IndexedDB database as the PCMS transactional state authority, with a small number of logical object stores for versioned entities, remote operations, immutable source snapshots, bounded observations, retained critical events and control metadata. UI and content scripts never directly mutate these stores. The background PCMS controller is the sole logical writer and uses short in-memory keyed serialization plus transactional revision checks. No separate SQL daemon, broker or event sourcing platform.

**Transaction rule:** Commit target preconditions, local release/hold transition and remote-command intent together before potentially effectful commands. Change status to 'might have been sent' before crossing the remote boundary. Never hold a database transaction open while awaiting a provider or AI action. Record independently verified outcomes in a new atomic commit. Ambiguous response -> read-only reconciliation before any side-effect repetition. Critical intent commits should request strict IndexedDB durability where supported, and behavior must not assume durability hints defeat all disk/power failures.

**Concurrency:** One modifying chain per generator; PersonaMonkey controls access to a Persona and its execution context; other Personas may proceed concurrently. Account↔Persona exclusivity, slug/binding uniqueness and local identity revision preconditions are checked transactionally. Locks are re-established after event-page restart from durable operation facts, not persisted as immortal in-flight JavaScript locks. Scoped holds and operator Pauses persist independently.

**Read volume:** Store only recovery-critical snapshots/versions with content fingerprints, not a full local git mirror. Recent-list/statistics observations are bounded and aggregated; consequential release/security/audit decisions are retained with durable provenance. Quota/corruption errors block new dependent remote mutations and allow independent diagnostics/backup paths where safe.

### Q123–Q130 (all Option A; ACCEPTED 2026-10-12)

- Q123 A: dedicated PCMS IndexedDB + unchanged donor storage.local; B: PCMS browser.storage.local document/shards.
- Q124 A: atomic small record groups using revisions, per-generator operation and affected entity updates; B: global full-fleet snapshot rewriting.
- Q125 A: parent workflow/release correlation plus one durable effect-operation per remote side effect; B: one journal item for entire workflow.
- Q126 A: content-addressed immutable recovery-critical source snapshots, referenced retention; B: complete permanent local clone of all per-gens content.
- Q127 A: serialize writes per generator while allowing bounded safe work on different Personas; B: one global serial queue for all 50+ accounts.
- Q128 A: essential audit/events retained; observations bounded and aggregated, not full event sourcing; B: record everything in a permanent event-source log.
- Q129 A: on persistent storage failure, prevent affected remote mutation and offer safe diagnostics/recovery; B: continue best-effort remote work in memory.
- Q130 A: use strict durability hint for safety-critical intent and restore commits when supported, verify in targeted Firefox fixture and retain readback recovery; B: treat ordinary relaxed storage success as absolute crash safety.

### Technical evidence

- Donor `extension/lib/state-manager.js`: serialized state mutation and revision/boot checks.
- Donor `extension/lib/management-integration.js`: bounded storage.local operation store, memory-only control leases.
- Donor `extension/lib/orchestrator.js`: storage.local job history, interrupted-job recovery, Firefox session tab ownership tags.
- Donor manifest: MV3 event page and Gecko ID `persona-route-manager@local`; `unlimitedStorage` is not currently listed, so adding it requires a deliberate permission/quotas decision.
- MDN `storage.local`: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/local
- MDN IndexedDB transaction durability: https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction
- MDN Firefox event pages: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts

## Status

- Stage 1: accepted.
- Stage 2: accepted.
- Stage 3.0: source/evidence audit completed at design level; U-01–U-16 retained as technical proof obligations.
- Stage 3.1: **accepted at design-decision level**; targeted implementation verification remains.
- Stage 3.2: **accepted at design-decision level**; physical schema and verification remain for Stage 3.6/5.
- Stage 3.3: **accepted**; F1 observable provider workflow verified; F2 asset-edit limit superseded by explicit operator authorization.
- Stage 3.4: **accepted at design-decision level**, Q139–Q146 all A; targeted platform/provider proofs remain.
- Stage 3.5: **accepted at design-decision level**, Q147–Q154 all A; vault/restore/download/diagnostic proofs remain.
- Stage 3.6: **FINALIZED AND ACCEPTED** — see `PCMS-Alpha-Stage-3-Minimal-Architecture.md` and `PCMS-Alpha-Stage-3-Finalization-and-Handoff.md`; integrated implementation acceptance is separate.


## Stage 3.2 — Frozen logical protocol and remaining limits

The six logical record families are: (1) entities and durable scope conditions (including approvals, pauses, holds); (2) remote operations, including per-effect identity and parent correlation; (3) immutable source snapshots; (4) bounded observations and rollups; (5) consequential audit events; and (6) schema/controller metadata. These are logical responsibilities, not mandates to create one module per family. Donor state remains in PersonaMonkey-owned browser.storage.local. All PCMS authoritative mutations are mediated by the single logical background controller and checked by transactional revisions and unique identity constraints.

**Remote effect protocol:** atomically record target preconditions + intent, then commit a 'may-have-executed' marker before the first effectful provider request. Release the local transaction before remote work. Confirm only by independent supported provider observation. Ambiguous result -> bounded read-only reconciliation -> exact scope hold if inconclusive. Never infer success from a timeout, remote send completion, AI narrative, or a tab's disappearance.

**Durability limitation:** request stronger IndexedDB durability for critical intent where supported; Firefox/browser support, quota, and power-loss guarantees require targeted Stage 5 verification. A committed IndexedDB record is not an atomic commit with Perchance, GitHub, or the donor's separate state. No SQLite process, event sourcing framework, general transaction coordinator or permanently resident extension page.

**Concurrency:** generator mutation serialization by durable intent and version; PersonaMonkey transient execution arbitration by stable Persona UID; account/generator/global pause and recovery holds are independently durable. Cross-persona work may be parallel within bounded limits. Persistent approvals and identity associations must use stable object IDs plus fingerprints/revisions, not clock timestamps as ordering authorities.

**Retention:** source baseline, previous-good release, ambiguous operations, consent, release, restore and audit evidence remain while required; raw observation data is bounded and aggregated. Prune only unreferenced, nonessential snapshots. A storage/quota/corruption failure disables affected remote mutations and preserves independent diagnostic access where possible.

**Outstanding:** final physical object stores/indexes, migrations/upgradeblocked handling, storage budgets, crash durability tests, actor-fencing race tests, restore freeze protocol and evidence retention lengths are implementation/test detail, not grounds to reinterpret accepted behavior.

## Stage 3.3 — Evidence and provider boundary (ACCEPTED; later F1/F2 closure controls)

**Evidence source:** supplied `discovery-v3.zip` (historical Perchance live observations in a browser and sanitized same-origin frontend bundles, not a provider-supported public contract). Relevant contents: `discovery/DISCOVERY.md`, `IMPLEMENTATION_READINESS.md`, `PERCHANCE_AUTOMATION_API.md`, `state-machine.md`, `FINAL_DELTA.md`, and `unknowns.md`.

Source-evidenced by historical discovery: create-via-save/fork; account generator list; privacy toggle and URL-accessible delisted pages; separate read/version/save endpoints; editor PJS and HTML APIs; source manifest upload/save/readback; AI send, stop, idle, history and new-chat controls. Limits: edit permission may also come from editKey/collaboration, not actual owner; saved vs unsaved source differs; historically automatic create-empty-and-delisted had not yet been proven (operator F1 PASS is recorded below); the AI can modify source files by later operator authorization; native helper test-PASS provenance remains unverified; clean-editor state across profiles cannot be observed unconditionally; internal endpoints and selectors can drift.

**Security observation:** page-side user sessionToken is handled by Perchance; do not extract or persist in PCMS. Any account-dependent action must execute through a guarded Persona-bound editor context. Native helper's broad file tools remain a security-observation limitation, not a reason to reinstate the superseded PJS/HTML-only restriction. PCMS retains privileged action gates.

**Current GitHub evidence (read-only, 2026-10-12):** `Neb963/per-gens` is a private repository currently reporting `size: 0` and configured `default_branch: main` but no established first commit. The source adapter must treat an absent branch as a distinct `SOURCE_REPO_UNINITIALIZED` condition; it must not silently create a deployment folder against nonexistent HEAD. Establishing a minimal initial `main` commit is an explicit later setup step, not performed during design. `Neb963/PCMS-Alpha` is also empty; no product source was modified.

**GitHub technical evidence:** Git Trees allow composing file changes into a single commit; Git Refs update with `force:false` rejects non-fast-forward updates. Neither by itself relieves PCMS of relevant file/READY preconditions, race handling and independent post-write readback. Docs: https://docs.github.com/en/rest/git/trees and https://docs.github.com/en/rest/git/refs .

### Q131–Q138 — Accepted 2026-10-12, all Option A

- **Q131:** authenticated Perchance operations through PersonaMonkey-guarded page context, with no PCMS session-token export/retention.
- **Q132:** positive verified owner/account identity before mutations; edit key/collab write permission is insufficient ownership proof.
- **Q133:** reserve only as *truly empty and unlisted* with independent source/listing/owner readback; no create-then-hide workaround. **Live F1 operational evidence recorded later.**
- **Q134:** fingerprint the exact deployable file/path/byte set and maintain per-asset verification status, including source files referenced by HTML/PJS.
- **Q135:** guarded non-forced GitHub writes with parent/affected-path/READY checks and independent readback; never overwrite unrelated work.
- **Q136 (historical, SUPERSEDED):** originally required PJS/HTML-only native AI action confinement; the operator later explicitly allowed full-generator PJS/HTML/`src/` edits. No per-file tool confinement gate survives; guarded Persona/browser admission and exclusive PCMS GitHub/publication authority remain.
- **Q137:** protect known dirty/collaborative editor tabs; revalidate remote saved source; uncontrolled unsaved external sessions cannot be conclusively detected, so no guarantee beyond supported observation and the explicit single-controller operating rule.
- **Q138:** final test evidence must be observable and bound to exact final deployable source; exception-only individual manual review remains, known failing tests block release.

### User clarification — source files, publicity, and native helper scope

- Perchance generator **source files (including those linked from PJS and HTML)** are part of the publicly accessible deployable generator. They are **not private repository artifacts or protected secrets**. Public URLs and unlisted generator URLs do not imply confidentiality.
- The private `per-gens` repository remains PCMS-authoritative for source, policy, READY and assets. PCMS stages PJS/HTML and the configured source-file payloads and performs all GitHub synchronization. Perchance's `srcManifest` maps generator-relative paths to saved source-file objects, which can be independently read back where supported.
- **Latest operator amendment overrides the former per-file restriction:** the helper may edit PJS, HTML and `src/` belonging to the selected generator. Perchance's hosted helper does not obtain PCMS/GitHub credentials or privileged extension commands. Being hosted on Perchance still does not establish identity/route/target authority; PCMS guards every *PCMS-initiated* privileged action. The helper's proposal does not confer test PASS, GitHub-write permission or public-release authority. Read back complete saved bytes and observe test outcomes independently.
- Public deployable code/assets must not contain credentials or secrets simply because `per-gens` is private. GitHub credentials, Perchance sessions and native routing secrets remain outside the deployable set and diagnostic exports.

### Minimal Stage 3.3 provider/source contract

**Deployable manifest.** The approved source includes `main.pjs`, `index.html`, every explicitly configured generator source-file path and required asset. Fingerprint an unambiguous canonical path-sorted manifest over file type, path, byte length and SHA-256 of *exact bytes*; distinguish text encoding from binary. Reject path traversal/collisions and unexpected remote manifest entries. Perchance CDN keys/URLs are location evidence, **not content hashes**. Inspect `srcManifest`, resolve files and verify bytes; if a necessary remote file cannot be independently read, mark it unverified and block ordinary clean release until an authorized disposition is designed. HTML/PJS references guide diagnostics and expected-file inventory but dynamic references cannot be established reliably by static parsing alone; do not invent a complete runtime dependency graph or fingerprint remote third-party services.

**Remote asset save semantics.** Historical discovery shows `srcState.writeFile` stages a local pending file, `prepareForSave()` uploads bytes to CDN, and `generator.save()` commits a top-level `srcManifest` plus PJS/HTML. An uploaded object without a confirmed manifest save is not a deployed file. After uncertain save, read generator data + source-file bytes before retrying; never invent atomic CDN-upload/manifest semantics or blindly delete unknown remote objects.

**Remote action contract.** `identifyOwner`, `inspectTarget`, `reserveEmptyUnlisted`, `stageExactFiles`, `observeSavedSource`, `observeListing`, `runNativeAiJob`, and `collectTestEvidence` are conceptual typed operations/observations, not claims of supported stable public APIs. Every mutation needs the durable intent/may-have-executed boundary and guarded Persona readiness from Stages 3.1–3.2.

**GitHub contract.** Only PCMS reads pinned `per-gens` main and writes conditional non-forced multi-file commits. READY is distinct from publication approval. Treat absent `main` HEAD as an explicit initialization prerequisite, not a temporary empty folder that can be overwritten. Keep source association explicit.

**Verification disposition (latest):** P-01/F1 **operator-live PASS** for initial private/empty create and authenticated private/empty final slug. Server-internal transient visibility remains unobservable and is not claimed proven; create/rename lost-response recovery is still an implementation acceptance test. P-02 ownership endpoint successful for the disposable sample; negative collaborator/editKey cases remain. P-03 exact asset-byte verification remains. P-04 **superseded** by full-generator AI authorization (not a technical sandbox claim). P-05 dirty/collaborative editor races remain. P-06 actual suite PASS and AI final-response/commit-message attribution remain Stage 5 adapter verification. Historical happy paths are not repeated.

### Stage 3.4 — Refresher clock, queue and capacity (ACCEPTED, 2026-10-12)

The user accepted all Option A recommendations for Q139–Q146. These architecture mechanisms do not reopen accepted Stage 2 behavior:

- **Q139 — evidence credit:** A only credit intervals explicitly bounded by recorded browser-running and provider-health observations, with independently tracked unknown gaps; B interpolate healthy time across unobserved wake gaps.
- **Q140 — wake strategy:** A one coalescing controller alarm plus on-startup/on-event reconciliation from an indexed durable due queue; B an alarm per generator.
- **Q141 — 60-minute grace:** A accrue grace only over evidenced browser-running/non-global-outage intervals when that account is unavailable, keeping active budget frozen; B ordinary elapsed wall time with offline compensation guessed after the fact.
- **Q142 — fairness:** A persist stable admission queue ordinal at each fresh eligibility point, preserve during holds/temporary recovery, assign a new ordinal only after a completed cycle/new eligibility; B sort dynamically by last update or wall time.
- **Q143 — capacity inference:** A use multi-window recent-list observations plus configured operator safety cap and hysteresis as a defensible estimate, not list length as a strict slot guarantee; B take current recent-list length as exact cap.
- **Q144 — refresh capability gate:** A require a permissible, observably meaningful and readback-verifiable provider refresh method before dispatch, or mark refresh unsupported; B untested no-op/comment-only saves because they return saved.
- **Q145 — observation load:** A one shared ~10-minute recent-list fetch and a bounded adaptive per-generator statistics queue, coalescing redundant requests; B separate timer/poll for every generator.
- **Q146 — fault classification:** A classify provider-wide failure only from independent corroborated observations and distinguish route/session/account failures, with scoped backoff/circuit-breaking; B infer global failure from one account or bulk synchronous request errors.




### Stage 3.4 accepted integration contract

One durable, indexed, oldest-eligible-first queue with per-generator stable ordinal, one coalescing controller wake alarm and startup reconciliation. One Refresher scheduler serves all account/Persona/generator scopes. The scheduler reconstructs active/sleep budgets conservatively from sufficient browser-running, provider-health and local eligibility evidence, treating unobserved intervals as unknown rather than automatically crediting them; normal MV3 event-page suspension is not by itself Firefox closure. Active periods are not forcibly terminated by a decreasing observed cap. Account-unavailable grace (default 60 operational minutes) is independent of global outage time, freezes active budget, and releases occupancy only on evidenced expiry. Holds retain waiting priority. Actual refresh capability remains gated by source-proven permissible provider behavior; save, persisted result, recent-list presence and rank are separately tracked. Capacity uses observations across windows with hysteresis and an operator safety limit; no deterministic 283/284-slot promise. Global/shared ~10-minute recent-list observations and bounded adaptive individual statistics share rate limits and backpressure. Confirmed common outage and per-account route/session failure have distinct scoped states.

**Remaining targeted proof:** Firefox cold wake and evidence-clock fixture; queue/restart fairness and backpressure under 1,000 generators; safe validated refresh capability; recent-list observation semantics; cap hysteresis; no fake time accrual; provider-wide fault classification. No tests performed in Stage 3 design.

## Stage 3.5 — Integrated backup, staged restore, independent diagnostics (ACCEPTED DESIGN)

**Authority:** Stage 2 §6 and Q78–Q98 are binding; no restoration or backup is permitted to silently convert historical data into remote mutation authority. Accepted Stage 3.1–3.2 guard and journaling boundaries also apply.

### Evidence and capability limits

- Donor `extension/lib/backup-package.js` exports `createPortableBackupPayload`, `validateBackupPayload`, `encodeBackupEnvelope` and `decodeBackupEnvelope`. `backup-import.js` exports inspected graph remapping and `buildImportedState`. `backup-crypto.js` provides password-derived PBKDF2-HMAC-SHA-256/AES-256-GCM. Donor portable data and security-delta policy must be retained, including no restored Integration API authority, route validation and partial cookie reporting.
- Donor native host `native/native_host.py` forwards requests to the routing daemon. There is NO demonstrated safe OS keyring access through its existing commands. Firefox `runtime.connectNative` can connect to installed host applications. Linux Secret Service defines protected collections and locked-state behavior; actual KDE/KWallet/Secret Service availability in the target environment is unverified.
- MDN Firefox `downloads.download` allows a path *relative to Downloads* and returns a download ID; `downloads.search`/`DownloadItem` provide completion, file-size and existence metadata; `downloads.removeFile` can delete only a tracked download ID from disk. These APIs do not establish general in-extension readback of saved archive bytes. Download completion/existence is not cryptographic post-write verification of file contents.

### Provisional minimal backup envelope

One versioned file, with only nonsensitive format/crypto parameters in a minimal unencrypted header and a single authenticated encrypted payload. Inside the decrypted payload: canonical manifest and integrity inventories; donor native portable payload, retaining donor export validation/field exclusions; PCMS logical checkpoint/entity graph, immutable referenced snapshots, pending-operation evidence and safe migration metadata. Reuse donor cryptography and import/validation logic instead of creating another identity-remapping mechanism. No plaintext temporary archive on disk; sensitive source, cookie and account fields never appear in headers. Restore secret must be known/exportable by the operator to allow disaster recovery after loss of OS keyring/profile; safe native vault may hold the same strong passphrase for unattended local backups. The on-demand key access host must be narrowly allowlisted and must not create new routing/native authority or log secrets. Always suspend unattended backup if key access fails.

Checkpoint procedure: briefly fence new relevant local mutating admissions while capturing consistent versioned donor state and PCMS immutable-reference inventory; do not hold long database transactions over asynchronous cookies, provider I/O or encryption. Include all pending/might-have-executed operations. Allow unrelated remote operations to continue with their durable uncertainty state. Pin all immutable snapshots needed by the cut through export completion. Donor cookie collection and PCMS IndexedDB cannot form one atomic cross-store snapshot; validate versions, retry boundedly, and report inadequate consistency rather than claim total atomicity.

Download verification tiers: (1) encrypted archive constructed and decrypt/manifest/hash validation succeeded before export; (2) download reports complete, filename and size/existence; (3) optional verified on-disk byte hash after explicit file import or supported narrow native check. Distinguish these in the UI/logs. Default retention is 14 successful automatic backups, no removal of manual archives or last known good, tracked-ID-only cleanup, one catch-up maximum after closure. If missing permissions or on-disk readback prohibit verification, report the limitation and never invent it.

### Provisional restore protocol

Decrypt/authenticate and bound-check entire archive; preview affected groups, schema/version, exclusions, UID/container mappings and security changes; require version-bound plan approval. Before any destructive step, create and independently verify a recoverable pre-restore checkpoint. Persist a small restore-in-progress guard **outside replaced PCMS data** plus durable staged progress/receipts; never assume IndexedDB, donor state and Firefox container/cookie changes can be a single transaction. Apply only independently consistent dependency groups, recording irreversible/reversible steps and observed newly created container IDs to avoid duplicates. After donor import, consume donor-produced Persona UID remaps and translate PCMS references. Preserve unaffected groups and holds; unknown groups remain non-mutating. On crash, recover the exact phase from persisted receipts, never replay already-applied container/cookie/writes blindly. Pre-restore checkpoint is a recovery tool, not automatic atomic rollback of all browser state.

All restored pending operations become uncertain until read-only reconciliation. Imported approvals/reports are historical, not self-renewing remote authorization. New-profile restore is non-mutating until operator asserts prior controller is inactive and explicitly authorizes activation following route/session/owner/source checks; this is not distributed leader election. Same-profile restore fences affected scopes until validated. Route failure stays fail-closed. Donor Integration trust and unsafe Direct permissions must not be enabled from backup.

### Degraded diagnostic path

An independent minimal extension page/entry path reads redacted, allowlisted, bounded persisted snapshots/logs without initializing normal PCMS scheduler, provider adapters, PersonaMonkey guarded executor or AI automation. Include XPI/donor/version, operation IDs and stages, safe hashes and error codes, counts of uncertain/held work, safe route/Persona status, version/migration/readiness summaries and guided-checklist results only when reviewed safe. Exclude PJS/HTML and asset source, raw URLs/query, account credentials/identifiers, cookies, chat histories, native secrets and unknown free-text fields. Diagnostic bundle contains no mutation or keyring-unlock capability. Fail closed on record corruption/unknown schema; record missing sections explicitly.

### Q147–Q154 — ACCEPTED 2026-10-12, all Option A

- Q147 A: one authenticated encrypted archive containing PCMS checkpoint and donor portable payload using donor serialization/import validation, not a set of independent sidecar backups; B: multiple unrelated files or an unvalidated flattened donor schema.
- Q148 A: protected local OS vault access through a narrowly scoped, on-demand native helper, only after feasibility/permission tests; locked/unavailable means suspend unattended backup. Avoid using routing daemon as generic secret storage; B: store encryption secret in extension local storage because disk is encrypted.
- Q149 A: one strong operator-controlled portable recovery passphrase, optionally held in OS vault for unattended encryption, independently preserved by operator; B: device-only random key with no recoverable cross-profile secret.
- Q150 A: bounded snapshot fence plus immutable snapshot pins and explicit pending-operation evidence; B: halt every remote operation for duration of full archive export or assume cross-store atomicity.
- Q151 A: preview -> verified pre-restore safety checkpoint -> persistent staged apply -> UID remap -> scoped reconciliation -> guarded disposition, without fake global atomic rollback; B: bulk overwrite with only an in-memory progress flag.
- Q152 A: recovered mutation authority OFF until affected dependencies revalidate, and explicit fresh-profile single-controller activation; B: resume archived running jobs and approvals automatically.
- Q153 A: discriminate in-memory cryptographic verification, download completion/existence and optional actual disk-byte verification; retention only of confidently tracked files; B: mark backup verified when downloads.download returns an ID, then delete old files by folder/name match.
- Q154 A: independent allowlisted, read-only emergency diagnostic export without the normal Core; B: require healthy normal controller and export its full logs/state.

### Stage 3.5 targeted technical verification agenda

- U-11: OS Secret Service/KWallet availability in target Fedora KDE + Firefox native-host access, locked/no-key behavior; no unsafe backup passphrase persistence.
- U-12: donor and PCMS cross-store restore crash/partial cookie failures, UID collisions, staged resume and scope activation, preserving pre-restore recoverability.
- U-13: actual packaged-Firefox downloads completion/relative folder/history/removeFile and possible file-readback, large file/quota behavior, tracked-file retention.
- U-14: normal PCMS bootstrap deliberately failed, emergency export still usable, source/secret/URL redaction negative tests.
- U-15: backup size/encryption memory/quota with representative 50-account/1,000-generator recovery snapshots; avoid claiming untested scaling.
- U-16: fresh/current profile read-only restore, mapping and explicit activation, no imagined cross-profile leader election.

**Historical design-phase statement:** no implementation, repository mutations, restored profiles or final ZIP. Subsequently the operator performed only F1 targeted live tests, recorded below.

## Stage 3.6 — Architecture acceptance audit (FINALIZED; controlling dated closure below)

**Controlling final architecture:** [`PCMS-Alpha-Stage-3-Minimal-Architecture.md`](PCMS-Alpha-Stage-3-Minimal-Architecture.md). It contains system/runtime diagrams, authority matrix, logical schema and journal state machine, provider and backup contracts, one-/50-/1,000-generator adversarial traces, Stage 2 crosswalk, U-01–U-16 evidence disposition, Stage 4 UI handoff, Stage 5 targeted verification gates and rejected complexity.

**Confirmed accepted decisions (historical):** Q107–Q154 initially all Option A; subsequent operator amendment specifically supersedes Q136 and the PJS/HTML-only portion of Stage 2 Q55. All other Stage 1/2 decisions remain applicable.

**Final disposition (2026-10-12):** F1 **accepted on operator-live observed behavior** (initial private/empty save → temp independent readback → private-first rename → final private/empty/owner/inventory verification and sampled listing absence). An unobservable server-internal transient public listing cannot be excluded mathematically and is not guaranteed. F2 **closed by explicit product-scope amendment**, allowing AI to modify all selected-generator files. The remaining U-03/U-06 implementation/evidence acceptance cases persist; no direct GitHub/PCMS privileges are granted to AI.

**Clarification to Q150:** brief capture fence and stable immutable pins yield a dependency-consistent, versioned logical backup cut, not an atomic snapshot across IndexedDB, PersonaMonkey, cookies and external truth. Archives with unresolved essential section inconsistency cannot count as successful backups.

**Clarification to Q151–Q152:** persist restore safety/phase markers outside the PCMS database being replaced, preserve donor safeguards, and treat imported approvals as history rather than immediate action authority.

**Readiness (final):** Stage 3 design is accepted; Stage 4 UI/UX and Stage 5 targeted verification planning may proceed. Skip already-proven F1 happy-path repetition and obsolete F2 per-file confinement tests. Stage 5 must verify implementation security/runtime, uncertain create/rename recovery, AI observable PASS and full-source/GitHub writeback, fleet, backup and restore. This is not production or integrated extension acceptance.


## Stage 3.6 — F1/F2 skills audit addendum (2026-10-12, read-only)

Source: user-supplied `perchance-skills-repacked.zip`, checked against `discovery-v3.zip` and Stage 2 normative requirements. Full review: [`PCMS-Alpha-F1-F2-Skills-Audit.md`](PCMS-Alpha-F1-F2-Skills-Audit.md).

- **Historical snapshot before operator F1 test (NOW CLOSED):** the archived automation contract accepts `isPrivate` in creation and `/api/save` sends generator fields at create time, suggesting an initial-private, empty generator could be possible. The existing Mass Generator Creator forks `minimal`, then sets private and renames; it does not prove no temporary public exposure or empty creation. One operator-authorized disposable create and remote/owner/listing readback is required. If only private-first temporary fork works, verify the temporary object is already empty/private before rename; uncertain results never trigger blind retries.
- **Historical snapshot before operator F2 amendment (NOW CLOSED):** `AGENTS.md` explicitly permits the native AI helper workspace to write durable `src/` files and exposes patch/execute_js tools; observed OPFS/sync and save flow backs this up. Instructions to modify PJS/HTML only do not establish enforced tool permissions. Investigate whether the hosted helper exposes an actual configurable per-path write allowlist, including bypass-capable tools. If not, quarantined AI workspace + PJS/HTML-only cherry-pick can protect managed deployments, but is NOT equivalent to literal Stage 2 Q55; it requires separate operator decision.
- **Historical status at skills-audit time only.** Later in this register: operator F1 live PASS and explicit F2 scope amendment; no repository changes or PCMS implementation.

---

## 2026-10-12 — Operator amendment: F2 full-generator AI scope; F1 probe prepared

**Newer superseding authority:** See `PCMS-Alpha-Stage-3-F1-F2-Decision-Amendment.md`. The operator explicitly permits the Perchance native AI helper to edit/test any file **within the managed Perchance generator**, including PJS, HTML and `src/` assets. This overrides the earlier Stage 2 Q55 PJS/HTML-only restriction and the corresponding Stage 3 F2 tool-level confinement gate. F2 is closed **by a deliberate requirement change**, not evidence of a technical sandbox.

PCMS still owns and exclusively performs GitHub writebacks, release approval, publishing and administrative actions. Workflow is live AI test→debug→modify generator code/files→save→retest, then either reviewed conditional GitHub commit or explicitly enabled automatic GitHub writeback using a proposed commit message extracted from the final AI response **plus independent full-source/test verification**. AI response text alone is never source proof or release authority; human publication approval remains mandatory.

**F1 historical pre-test note (superseded by final PASS below):** an operator-driven disposable userscript test has been prepared (`PCMS-F1-Private-Empty-Creation-Probe.user.js`). It checks privacy/emptiness in the **initial** save request and independent remote readback, optionally private-first rename. It cannot prove unobservable server-side public-listing transience. No live F1 test has been executed.


## 2026-10-12 — F1 live creation evidence (v1.0.3)

**Evidence:** operator-run `pcms-f1-2026-10-12T00-18-20-204Z.json`, generated by `PCMS-F1-Private-Empty-Creation-Probe-v1.0.3`. This is a successful real Perchance mutation performed by the operator, not a simulation or a claim that an agent performed the test.

- Full preflight passed and remote pristine `/minimal` source comparison matched (PJS 2092 characters, HTML 465 characters, zero source files).
- Initial `/api/save` request for the fork had `isPrivate:true` (field present), empty PJS, empty HTML and an empty `srcManifest`.
- Exactly one observed `/api/save` request returned HTTP 200 / `status:created`, assigning temporary slug `39cojqa706`.
- Independent readback of `39cojqa706` reported `isPrivate:true`, PJS/HTML length 0, both with SHA-256 `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`, and zero source files. Source save count 0 is expected for initial creation, not a failed save.
- A separate rename was initiated from `39cojqa706` to `pcms-test-007-001-009`. Page navigation loaded the target slug, interrupting the old probe's in-document post-rename verification. The export's final `BLOCKED — not on the verified, owned disposable generator` is a **test harness navigation/recovery artifact**, not a failure of initial private/empty creation. The probe also recorded `remoteEffectPossible:false` for the interrupted rename even though a rename had been initiated: the production PCMS operation journal MUST mark rename dispatch as *may have executed* before invoking the provider, and reconcile its outcome after navigation rather than trusting that diagnostic flag.
- **F1-A (initial create private and empty): VERIFIED by actual single-request and independent readback.**
- **F1-B (renamed final slug remains private, empty and owned): historical pending status, now VERIFIED by the independent read-only report below.** A purpose-built `PCMS-F1-Post-Rename-ReadOnly-Verifier.txt` checks fresh server readback, authenticated `checkGeneratorOwnership`, `getGeneratorsByUser` and recent public-list sample. Do not rerun creation or rename.
- **Unobservable server-private-window caveat:** client request/readback cannot mathematically prove no transient listing at any internal server intermediate stage; the best feasible client-side acceptance evidence is the first-request private flag + immediate private source readback + observed absence from public listings. Do not make a stronger claim.

**Stage 3 readiness at initial-create time (superseded):** F2 was closed by the scope amendment; final-slug ownership/privacy was still pending. This is now verified in the final dated section; do not repeat creation.


## 2026-10-12 — FINAL F1 POST-RENAME EVIDENCE AND STAGE 3 DESIGN CLOSURE

**Controlling evidence:** operator-uploaded `pcms-f1-rename-readonly-1791764668100.json`, schema `pcms-f1-post-rename/v1`, version `1.0.0`, collected 2026-10-12 00:24:06–00:24:07 UTC. This is **read-only operator observation** and extends the earlier v1.0.3 actual single-create log; it is not a second mutation or an implementation test of the combined extension.

- On final target `pcms-test-007-001-009`, independent `/api/getGeneratorPageData` readback: exact name, `isPrivate:true`, empty PJS, empty HTML, present/empty `srcManifest`.
- Independent `checkGeneratorOwnership` result: `status:is-owner`, `owned:true`.
- Authenticated account inventory `getGeneratorsByUser`: `status:success`, **exactly one** target entry, marked private.
- Public recent-list observation: target **not present** among **432 sampled** items; not proof of absence from every public surface, historical moment or internal server transition.
- Earlier v1.0.3 creation: initial save request contained `isPrivate:true`, zero-length PJS/HTML, zero source files, HTTP 200 `created`, with immediate private/empty independent readback of temp slug `39cojqa706`. Then a rename navigation reached the final target. The old probe's terminal `BLOCKED` was a harness state/navigation artifact; its `remoteEffectPossible:false` after initiated rename was incorrect diagnostic logic and MUST NOT be repeated in PCMS's operation journal.

**F1 final decision:** CLOSED / **OPERATOR LIVE PASS of observable operating contract** for private+empty first save and verified private+empty final rename. No additional happy-path creation is needed. Do not assert proof of server-internal atomic/no-transient-public visibility; if Perchance changes the behavior, the provider adapter holds reservation rather than using create-public-then-hide. Remaining U-03 work is conditional-operation fencing, timeout/crash/rename/slug-collision cases and packaged implementation, not F1 discovery.

**F2 final decision:** CLOSED BY OPERATOR AMENDMENT, **not by security test**. AI can edit all files belonging to the selected generator. PCMS still verifies exact saved full-source snapshot and test evidence, offers manual or enabled automatic conditional GitHub writeback using *attributed final assistant response* only for a proposed commit message, and requires separate human publication approval. Original PJS/HTML-only Q136 and Stage 2 Q55 restriction are explicitly superseded; no model-response text grants GitHub or release authority.

**Stage 3 final status: DESIGN COMPLETE / ACCEPTED.** Q107–Q154 recorded, with supersession of Q136; Stage 1/2 otherwise intact. Outstanding U-01–U-16 implementation/provider acceptance cases and one observed-but-not-provable server-visibility limitation are tracked in `PCMS-Alpha-Stage-3-Finalization-and-Handoff.md`. No PCMS implementation, repository edits, production tests or final release ZIP resulted from this design finalization.
