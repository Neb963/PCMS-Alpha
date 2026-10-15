# PCMS-Alpha — Stage 6.5 Phase Contracts (Stage 7 audited design)

**Stage:** 6.5 implementation planning only. **Not** authorization to initialize or modify GitHub repositories or build the extension.  
**Inputs:** accepted Stages 1–4, Stage 5 verification specification/matrix/evidence and H-plan, accepted Stage 6.0–6.5 decisions (through S6-Q25).  
**Data companion:** `PCMS-Alpha-Stage-6.5-plan-AUDITED.json`; rename/install only in a future authorized bootstrap.

## Normative contract for each future phase

- **Preflight:** verify current remote `main`, existing open/draft PR(s), accepted dependency evidence, applicable design supersessions, and no unsafe earlier phase. Resume same incomplete phase before choosing new work; one agent, one phase, one invocation.
- **Engineering:** implement the smallest operator-useful vertical slice and its minimal UI, background behavior, recovery/holds, instrumentation and tests. Compatible cross-cutting fixes are permitted; product invariants and gates cannot be weakened or silently rewritten.
- **Remote durability:** publish coherent WIP commits using the connected GitHub integration; confirm branch ref and reachability; open draft PR early. Commit objects without reachable branch refs and local-only Git commits are NOT checkpoints.
- **Proof:** primary P-test owners below are *implementer ownership*, not permission to treat partial P-tests as PASS. Before marking a phase complete, run all selected full relevant tests + donor security regression + packaged Firefox where appropriate. Evidence has exact commit/merge candidate, XPI digest, Firefox build, fixture and independent oracle where relevant. Any unknown H/provider portion is not PASS.
- **Finish:** propose a minimal completion marker within the PR, containing `phaseId`, plan revision, intended claim, required test IDs, capability flags and static evidence descriptions; do not embed its own commit SHA, future CI run ID or future merge SHA. Independently check current-main merge candidate, then merge through protected GitHub. The **post-squash main SHA is observed after merge**, not embedded inside the pre-merge marker; avoid post-merge self-reference. Stop after the single phase.
- **Blocked:** make affected capabilities read-only/held; retain and publish draft PR, report exact blocker and independently ready phases. For CI/root/security weakening, require independently trusted verification or exceptional operator review. Do not fabricate successful remote effects.

## Detailed phases

### I00 — Combined XPI and navigable shell

**Depends on:** authorized one-time bootstrap only. **Primary test ownership:** baseline/precursor assertions; no primary P-tests. **Evidence tiers:** F/B.

**Scope and operator result.** Reproducible combined packaged XPI retaining Gecko ID/native-host compatibility, donor routing/permissions/regressions; six navigable destinations with genuinely disabled actions.

**Authorities/UI.** PersonaMonkey, UI. UI: Overview, Generators, Work Queue, Accounts, Refresher, Settings.

**Decisive proof.** Donor regressions and packaged Firefox installation identity; no PCMS provider effects.

**Uncertainty and rollback.** If donor security or build differs, stop and do not enable PCMS. **Capability policy:** `OFF`.

**Do not claim.** Functional account/provider workflow.

**Stage 1 primary requirement ownership:** REQ-U02, REQ-X06, REQ-X08. **Supplementary verifiable assertions:** S6-I00-PACKAGING, S6-I00-DONOR-SECURITY. These are future test obligations, not executed PASS.

### I01 — Fail-closed background wake and PersonaGuard

**Depends on:** I00. **Primary test ownership:** P51-01, P51-02. **Evidence tiers:** F/B.

**Scope and operator result.** Top-level synchronous wake listener registrations; one guarded same-XPI authority path, stable UID/current-container, lease/route checks and runtime health receipts.

**Authorities/UI.** PersonaMonkey, Firefox background. UI: Overview, Accounts.

**Decisive proof.** Persistent installed XPI cold wake, full restart, route loss, lease revocation and donor security isolation; independent zero-effect oracle.

**Uncertainty and rollback.** Retain protected fail-closed defaults and forbid all PCMS writes. **Capability policy:** `OFF`.

**Do not claim.** Live Perchance owner verification or enabled mutation.

**Stage 1 primary requirement ownership:** REQ-A06. **Supplementary verifiable assertions:** S6-I01-COLD-WAKE. These are future test obligations, not executed PASS.

### I02 — Journal, canonical commands and emergency diagnostics

**Depends on:** I01. **Primary test ownership:** P51-03, P51-04, P51-06, P55-11. **Evidence tiers:** F/B.

**Scope and operator result.** Revision-fenced command admission, PREPARED/DISPATCH_POSSIBLE before fake effects, independent restore hold outside replaceable DB, redacted Core-independent diagnostic entrypoint.

**Authorities/UI.** IndexedDB, PersonaMonkey, Firefox background. UI: Overview, Work Queue, Settings.

**Decisive proof.** DB abort/crash between cutpoints, duplicate requests, untrusted senders, corrupt Core, leak-canary oracle; donor unaffected.

**Uncertainty and rollback.** Canonical DB unavailable => PCMS mutating hold, never donor fail-open. **Capability policy:** `OFF`.

**Do not claim.** Exactly-once external service semantics.

**Stage 1 primary requirement ownership:** REQ-U03, REQ-U04, REQ-X04, REQ-X05. **Supplementary verifiable assertions:** S6-I02-NOTIFICATIONS, S6-I02-EMERGENCY-ENTRY. These are future test obligations, not executed PASS.

### I03 — Persona-bound account enrollment

**Depends on:** I02. **Primary test ownership:** baseline/precursor assertions; no primary P-tests. **Evidence tiers:** F/B.

**Scope and operator result.** Select/create unbound Persona, human login handoff, verified session identity, one active account per Persona, repair/rebind and honest pending/unknown states.

**Authorities/UI.** PersonaMonkey, IndexedDB, UI. UI: Accounts, Overview.

**Decisive proof.** Fake identity rotations, revoked leases, duplicate account/Persona bindings, UI target revision fencing; no direct native bypass.

**Uncertainty and rollback.** Identity unverified => no owner-dependent mutations. **Capability policy:** `HUMAN_LOGIN_ONLY`.

**Do not claim.** Manual UID entry as normal UX or collaborator access as ownership.

**Stage 1 primary requirement ownership:** REQ-A01, REQ-A02, REQ-A03, REQ-A04, REQ-A05, REQ-A08. **Supplementary verifiable assertions:** S6-I03-BINDING-EXCLUSIVITY, S6-I03-OVERRIDE-PROVENANCE, S6-I03-ARCHIVE-REPAIR. These are future test obligations, not executed PASS.

### I04 — Owned generator read-only inventory

**Depends on:** I03. **Primary test ownership:** P52-01. **Evidence tiers:** F/B.

**Scope and operator result.** Guarded read-only inventory sync, positive owner vs editKey separation, unknown/deleted ambiguity, responsive 1,000+ search/filter.

**Authorities/UI.** Perchance read-only, PersonaMonkey, IndexedDB, UI. UI: Generators, Accounts, Overview.

**Decisive proof.** Owner mismatch, account session drift, missing list item, stale out-of-order UI refresh and bounded fleet fixture.

**Uncertainty and rollback.** Unknown owner => target hold; never delete on absence. **Capability policy:** `READ_ONLY`.

**Do not claim.** Live ownership proven merely by fixture.

**Stage 1 primary requirement ownership:** REQ-A07, REQ-G01, REQ-G12, REQ-U05. **Supplementary verifiable assertions:** S6-I04-INVENTORY-SEARCH. These are future test obligations, not executed PASS.

### I05 — GitHub READY inspection and source association

**Depends on:** I02, I04. **Primary test ownership:** P53-01, P53-02, P53-03. **Evidence tiers:** F/B.

**Scope and operator result.** Explicit folder↔generator association, full tree/READY/test-input inspection, reject hostile paths and relevant HEAD drift; empty main yields GITHUB_UNINITIALIZED.

**Authorities/UI.** per-gens read-only, IndexedDB, UI. UI: Generators, Settings.

**Decisive proof.** Fake Git DAG and path collisions/reincarnation, absent HEAD, READY revocation, irrelevant vs relevant drift.

**Uncertainty and rollback.** Absent Git main or ambiguous tree => SOURCE_PENDING, no writeback. **Capability policy:** `READ_ONLY`.

**Do not claim.** Private per-gens initialized or READY automatically granted.

**Stage 1 primary requirement ownership:** REQ-G06, REQ-G09, REQ-G10. **Supplementary verifiable assertions:** S6-I05-EMPTY-GIT, S6-I05-ASSOCIATION. These are future test obligations, not executed PASS.

### I06 — Private-first slug reservation and batch receipts

**Depends on:** I03, I04, I05. **Primary test ownership:** P52-02, P56-06. **Evidence tiers:** F/B.

**Scope and operator result.** Freeze operator slug list, target-specific two-stage private-empty create + guarded rename, bounded per-item receipts, non-READY Git folder only when authorized and possible.

**Authorities/UI.** Perchance, PersonaMonkey, IndexedDB, per-gens conditional. UI: Generators, Work Queue.

**Decisive proof.** Separate create/rename fake-effect ledgers, lost acknowledgment, collision, uncertain temporary ID, partial batch and Git outage.

**Uncertainty and rollback.** HELD_UNCERTAIN or SOURCE_PENDING, no second create or arbitrary substitute slug. **Capability policy:** `PROVIDER_WRITE_GATED`.

**Do not claim.** Earlier historical F1 test proves new combined-XPI live creation.

**Stage 1 primary requirement ownership:** REQ-G02, REQ-G03, REQ-G04, REQ-G08. **Supplementary verifiable assertions:** S6-I06-GIT-MARKER-SAFETY, S6-I06-ALLOCATION. These are future test obligations, not executed PASS.

### I07 — Existing generator adoption without source loss

**Depends on:** I04, I05. **Primary test ownership:** P52-03. **Evidence tiers:** F/B.

**Scope and operator result.** Explicit adoption consent, durable association, immutable original-source baseline plus non-overwriting Git archive with independently verified integrity.

**Authorities/UI.** Perchance read-only, per-gens conditional, IndexedDB. UI: Generators, Work Queue.

**Decisive proof.** Slug reincarnation, owner changes, mapped folder collision, archived byte readback, public/unlisted distinctions.

**Uncertainty and rollback.** Ambiguous original or Git archive => preserve provider source, no overwrite. **Capability policy:** `READ_ONLY_OR_EXPLICIT_ARCHIVE`.

**Do not claim.** Adoption equals permission to publish or overwrite.

**Stage 1 primary requirement ownership:** REQ-G05, REQ-G07, REQ-G11. **Supplementary verifiable assertions:** S6-I07-ORIGINAL-ARCHIVE, S6-I07-TOMBSTONE. These are future test obligations, not executed PASS.

### I08 — Manual authenticated encrypted backup

**Depends on:** I02, I03. **Primary test ownership:** P55-01, P55-02, P55-05. **Evidence tiers:** F/B.

**Scope and operator result.** One authenticated encrypted archive regardless of content category; consistent snapshot, offline decrypt/schema/source roundtrip of a disposable restore fixture, bounded size, actual Downloads states and excluded WG private config.

**Authorities/UI.** IndexedDB, PersonaMonkey portable data, Firefox Downloads, UI. UI: Settings, Overview.

**Decisive proof.** Header tamper, wrong passphrase, incomplete export, offline source roundtrip, storage quota, lost Download completion, secret scan.

**Uncertainty and rollback.** Encryption or completion unverified => failure receipt, no plaintext fallback. **Capability policy:** `LOCAL_BACKUP`.

**Do not claim.** Full restore or independent on-disk hash when browser only confirms download.

**Stage 1 primary requirement ownership:** REQ-X01. **Supplementary verifiable assertions:** S6-I08-PORTABLE-DECRYPT. These are future test obligations, not executed PASS.

### I09 — Private candidate staging, full-source verification and editor safety

**Depends on:** I05, I06, I08. **Primary test ownership:** P51-05, P52-04, P52-07. **Evidence tiers:** F/B.

**Scope and operator result.** Pin READY bytes, stage on private new generators, full PJS/HTML/src add/change/delete byte-readback, guarded human tab handoff, source diff and prior snapshot.

**Authorities/UI.** Perchance, PersonaMonkey, IndexedDB, UI. UI: Generators, Work Queue.

**Decisive proof.** Dirty/unknown editor, asset 404 or binary mismatch, save accepted but incomplete readback, crash during tab ownership transfer.

**Uncertainty and rollback.** SOURCE_UNVERIFIED/EDITOR_UNKNOWN => preserve tab and previous source. **Capability policy:** `PROVIDER_WRITE_GATED`.

**Do not claim.** Existing public-generator overwrite or clean source on manifest metadata alone.

**Stage 1 primary requirement ownership:** REQ-D01, REQ-D10, REQ-U01. **Supplementary verifiable assertions:** S6-I09-EDITOR-OVERLAY, S6-I09-FULL-SOURCE. These are future test obligations, not executed PASS.

### I10 — Native AI repair and independently evidenced tests

**Depends on:** I09. **Primary test ownership:** P52-05, P52-06. **Evidence tiers:** F/B.

**Scope and operator result.** Settings-versioned Chat 1, optional genuinely fresh Chat 2, observable test oracle on exact saved F, bounded repair convergence; AI may modify all generator-owned source but no privileged Git/approval.

**Authorities/UI.** Native Perchance AI through guard, IndexedDB, UI. UI: Work Queue, Generators, Settings.

**Decisive proof.** Fresh-session violation, AI prose-only PASS, stale tests after change, source drift, handoff interrupt, prompt revision pin.

**Uncertainty and rollback.** TESTS_UNVERIFIED/KNOWN_FAILURE => hold candidate; no publication. **Capability policy:** `AI_PROVIDER_GATED`.

**Do not claim.** Narrative AI success is actual test success.

**Stage 1 primary requirement ownership:** REQ-D03, REQ-D04, REQ-D05, REQ-D06. **Supplementary verifiable assertions:** S6-I10-PROMPT-VERSION-IMPORT-EXPORT, S6-I10-AI-CONCURRENCY. These are future test obligations, not executed PASS.

### I11 — Revision-safe GitHub writeback

**Depends on:** I10. **Primary test ownership:** P53-04, P53-05, P53-06. **Evidence tiers:** F/B.

**Scope and operator result.** Manual/opt-in automatic conditional Git-only multi-file commit of fully verified F (including deletions), nonforced ref with HEAD/readback, suggested message inert.

**Authorities/UI.** per-gens Git, IndexedDB, UI. UI: Work Queue, Generators.

**Decisive proof.** Fake DAG relevant/unrelated conflicts, blob partial, lost ack, policy changes, auto opt-out race.

**Uncertainty and rollback.** WRITEBACK_UNCERTAIN/CONFLICT; preserve exact F and no publication. **Capability policy:** `GITHUB_WRITE_GATED`.

**Do not claim.** Git commit is Perchance publication or source-bound human approval.

**Stage 1 primary requirement ownership:** None (cross-cutting support only). **Supplementary verifiable assertions:** S6-I11-GIT-DAG-REPLAY. These are future test obligations, not executed PASS.

### I12 — Refresher shadow scheduler, monitoring and fleet

**Depends on:** I02, I04. **Primary test ownership:** P51-07, P54-01, P54-02, P54-03, P54-04, P54-07, P54-08, P54-10, P54-11. **Evidence tiers:** F/B/X.

**Scope and operator result.** One durable oldest-eligible queue, evidenced operational intervals, account grace, scoped Pauses, capacity hysteresis, coalesced alarms, shared recent-list observation/adaptive statistics.

**Authorities/UI.** IndexedDB, Firefox alarms, PersonaMonkey read-only, Perchance read-only. UI: Refresher, Overview, Work Queue.

**Decisive proof.** Virtual clock, 50+ account/1,000+ generator fixture, outage distinction, duplicate cold wake, perf high-water marks.

**Uncertainty and rollback.** No mutating refresh until proven permissible effective method; freeze unobserved time. **Capability policy:** `SHADOW_ONLY`.

**Do not claim.** Queue calculation proves real provider visibility or refresh validity.

**Stage 1 primary requirement ownership:** REQ-R01, REQ-R02, REQ-R03, REQ-R04, REQ-R05, REQ-R06, REQ-R07, REQ-R10. **Supplementary verifiable assertions:** S6-I12-SLEEP-LISTED, S6-I12-DISPATCH-STAGGER. These are future test obligations, not executed PASS.

### I13 — Exact-source release approval and existing-source updates

**Depends on:** I07, I08, I09, I10, I11, I12. **Primary test ownership:** P53-07, P53-08. **Evidence tiers:** F/B/X.

**Scope and operator result.** Human exact-F publication approval and immediate source/test/owner/READY/editor revalidation; update adopted source only when proven sleeping/unlisted with verified prior-source baseline and decryptable recovery snapshot; safe readback/rollback.

**Authorities/UI.** Perchance, Git READY, PersonaMonkey, IndexedDB, UI. UI: Generators, Work Queue.

**Decisive proof.** Lost listing ack, changed full F, stale approval modal, changed READY, dirty editor, sleep/unlist race, rollback-to-P remains unlisted.

**Uncertainty and rollback.** PUBLICATION_UNCERTAIN/review hold; never auto-republish P. **Capability policy:** `PUBLICATION_GATED_BY_HUMAN`.

**Do not claim.** GitHub writeback authorizes publication, or tested F can change after approval.

**Stage 1 primary requirement ownership:** REQ-D02, REQ-D07, REQ-D08, REQ-D09, REQ-D11, REQ-D12. **Supplementary verifiable assertions:** S6-I13-REVISION-IGNORE, S6-I13-ORIGINAL-RESTORE. These are future test obligations, not executed PASS.

### I14 — Permissible evidence-based mutating Refresher

**Depends on:** I12, I13. **Primary test ownership:** P54-05, P54-06. **Evidence tiers:** F/B/X.

**Scope and operator result.** Qualify only legitimate effective mutating refresh candidate; bounded monitored attempt with separate save/effect/recent-feed evidence and gap/absence handling.

**Authorities/UI.** Perchance, PersonaMonkey, IndexedDB. UI: Refresher, Overview.

**Decisive proof.** Fake effective/ineffective saves, absent/partial feed, provider drift and rate limits; H-04 only if essential late.

**Uncertainty and rollback.** If no permissible verified mechanism, mutation remains disabled and shadow monitoring continues. **Capability policy:** `LIVE_REFRESH_OFF_UNTIL_PROVEN`.

**Do not claim.** An HTTP 200/save implies recent-feed visibility.

**Stage 1 primary requirement ownership:** REQ-R08, REQ-R09. **Supplementary verifiable assertions:** S6-I14-BOUND-RETRY, S6-I14-REFRESH-PROOF. These are future test obligations, not executed PASS.

### I15 — Scheduled encrypted backup and safe retention

**Depends on:** I08. **Primary test ownership:** P55-03, P55-04, P55-06. **Evidence tiers:** F/B.

**Scope and operator result.** Daily authenticated encryption with safe recoverable secret, optional KDE keyring integration, bounded tracked 14-good automatic archive retention and accurate file proof tiers.

**Authorities/UI.** Native narrow OS vault, Firefox Downloads, IndexedDB. UI: Settings, Overview.

**Decisive proof.** Locked/missing vault, Downloads missing item, moved file, interrupted backup, manual/untracked/last-good preservation.

**Uncertainty and rollback.** Without safe key/vault => suspended, never plaintext or unsafe deletion. **Capability policy:** `UNATTENDED_BACKUP_GATED`.

**Do not claim.** Browser reported completion means independent disk-byte proof.

**Stage 1 primary requirement ownership:** REQ-X02. **Supplementary verifiable assertions:** S6-I15-RETENTION-PATH. These are future test obligations, not executed PASS.

### I16 — Staged restore and inactive fresh controller

**Depends on:** I02, I08. **Primary test ownership:** P51-08, P55-07, P55-08, P55-09, P55-10, P55-12. **Evidence tiers:** F/B/X.

**Scope and operator result.** Authenticated preview, verified pre-restore checkpoint, external immutable guard, group-by-group receipts/UID remap, new-profile disabled controller by default.

**Authorities/UI.** IndexedDB, PersonaMonkey portable data, Firefox profiles, UI. UI: Settings, Overview.

**Decisive proof.** Crash at every restore boundary, old/new two-profile mock, import collisions, lack of old-controller proof, archive size quotas.

**Uncertainty and rollback.** Unknown group => scoped hold; new controller inactive until actual operator H-06 if migration claimed. **Capability policy:** `RESTORE_ACTIVATION_GATED`.

**Do not claim.** Staged restore is cross-store atomic or old profile automatically off.

**Stage 1 primary requirement ownership:** REQ-X03. **Supplementary verifiable assertions:** S6-I16-SAME-AND-FRESH-PROFILE. These are future test obligations, not executed PASS.

### I17 — Full integration, fleet and operator acceptance

**Depends on:** I13, I15, I16. **Primary test ownership:** P54-09, P56-01, P56-02, P56-03, P56-04, P56-05, P56-07, P56-08, P56-09, P56-10. **Evidence tiers:** F/B/X/H.

**Scope and operator result.** Cross-system fault chains, accessibility, 50+/1,000+ measured envelope, clean build/installation, guided checklist with Markdown fallback and late operator acceptance.

**Authorities/UI.** All existing authority boundaries, no new controller. UI: Overview, Generators, Work Queue, Accounts, Refresher, Settings.

**Decisive proof.** All P56 composites and honest H-01/H-07, H-06 only if migration claimed, H-02–05 conditional residual unknowns.

**Uncertainty and rollback.** Critical failures prevent aggregate product claim; independent capabilities remain scoped OFF/HELD. **Capability policy:** `PER_CAPABILITY`.

**Do not claim.** H tests performed from CI or capability enabled without necessary real proof.

**Stage 1 primary requirement ownership:** REQ-U06, REQ-X07. **Supplementary verifiable assertions:** S6-I17-UX-OPERATOR-ACCEPTANCE, S6-I17-FLEET-ROLL-OUT. These are future test obligations, not executed PASS.

## Stage 7 reconciled cross-phase gates (binding)

1. **Early Git folder creation is a remote mutation.** I06 and I07 may implement the minimum non-READY marker/archive creation *only after* I02's durable journal and controlled Git ref/tree/readback subcases of P53-04/P53-05 pass in the isolated Git emulator. Even if those cases have full primary ownership in I11, the applicable earlier *subset* is a mandatory early gate; every ref movement is nonforced, source-folder-confined and reconciled on lost acknowledgements. An uninitialized `per-gens/main`, missing authorization or missing proof leaves `SOURCE_PENDING`/`ARCHIVE_PENDING`; the provider reservation/adoption is preserved without invented READY.
2. **A candidate completion record cannot contain its own branch commit SHA or future squash SHA.** It contains stable phase ID, plan/test contract revisions, intended capability state and non-self-referential evidence descriptions/expected test IDs. The CI/PR system owns actual candidate/merge SHA, test run IDs and successful output artifact links *externally*. Otherwise recording the SHA alters the commit that determines it. Postmerge observation is also external and authoritative.
3. **Mutating Refresher activation is separate from implementing I14.** An I14 test proving a single action's technical behavior can qualify only that bounded action under its actual provider evidence and approved live authorization. General fleet-scale rollout additionally requires I17 P54-09 measured resource/backpressure proof and appropriate P56 cross-system failures, with a guarded capability transition; absent proof, remain shadow-only.
4. **Stage 5 acceptance and Stage 6 completion are distinct.** Full UI acceptance requires H-01/H-07 near final verification, fresh-profile migration claim requires H-06, and H-02–H-05 are conditional. Unverified live provider semantics cannot be converted from fixture PASS into enabled effects.
5. **Plan repair without governance paralysis.** Compatible additive prerequisites/tests and implementation interface repairs are intended to be autonomous. Any edit affecting the *acceptance trust root* (removing required tests, broadening privileges, relaxing safety, weakening dependency/phase gates) requires independent enforcement or targeted human authorization. If the PR cannot demonstrate the independent distinction, park the root-edit PR instead of self-certifying it.

## Coverage/integrity reconciliation

The 56 Stage 5 contracts are assigned **exactly once as primary implementation owners**: P51 8; P52 7; P53 8; P54 11; P55 12; P56 10. This mapping was programmatically checked for duplicate/omitted IDs and acyclic dependency prerequisites (all dependency IDs precede their phase). Earlier partial test evidence does **not** satisfy a later primary full-test gate. All ten UX contracts are mapped for final verification; operator H-01 and H-07 apply to final overall acceptance, H-06 only to claims of safe fresh-profile activation, and H-02–H-05 are conditional.

**CI-risk rule:** a changed production/security module may trigger relevant P-test reruns whose primary owner is a different phase. Primary ownership does not permit excluding impacted tests. `pcms-required` checks selected test presence/results and trust-root handling, not just arbitrary green job status.

## Capability-gated acceptance

| Capability | Required proof before enabling | Otherwise |
|---|---|---|
| Any PCMS browser/provider mutation | P51-01/02/03/04/06 relevant packaged security cases and durable guard/journal | Read-only; preserved donor fail-closed routing |
| Private create/rename or source staging | Owner/current route, P52-01/02/04/07 as applicable, P51-05; journaled uncertainty; I08 archive before automatic existing-source overwrite | Held private, no retry of ambiguous effect |
| GitHub writeback | P53-01–06, full verified F, actual tests, current READY, bounded opt-in/manual intent | Pending review, no force |
| Publication | P53-07/08, owner/source READY, human exact-F approval, unlisted editor safe and readback | Remain unlisted/held |
| Mutating Refresher | P54-01–11 and legitimately effective allowable action at accurate evidence tier | Shadow-only; mutation OFF |
| Unattended backup | P55-01–06, recoverable secret, safe vault and honest Downloads proof | Suspended; never plaintext |
| Fresh-controller activation | P51-08/P55-07–10/12 plus H-06 when migration claimed | Inactive until operator confirmation |

## True unresolved design-to-implementation edges

1. Target `Neb963/PCMS-Alpha` and `Neb963/per-gens/main` were empty at Stage 5 and may remain so. Re-inspect during *future authorized bootstrap*, do not infer existence from `default_branch` metadata.
2. Privileged CI/trust-root enforcement requires an authority outside PR-controlled scripts (or rare operator review). One named GitHub check is **not** by itself proof of immutable check semantics; document an enforceable configuration before autonomous merging.
3. Persistent Firefox installed-XPI restart testing must be genuine. Temporary developer load + reinstall on restart is not proof.
4. No blanket assertion that native AI testing, owner detection, provider supported refresh, KDE vault or disk readback is already proven. Keep those effect capabilities disabled/held until appropriate evidence.
5. Existing source staging must remain sleep/unlisting protected; I12 shadow scheduling supplies state accounting before I13 existing-source update admission.
6. Do not let late operator tests block completion of unrelated non-effectful phase objectives; record exact residual unknowns.

**Phase completion is not software implementation authorization.** This document is the Stage 7 audited design, pending final operator sign-off and separately authorized repository setup/coding.
