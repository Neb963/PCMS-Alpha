# PCMS-Alpha — Stage 5 Test and Failure Matrix

**Revision:** 2026-10-12 — Stage 5.7 verified coverage accounting and final design audit.  
**State:** **VERIFICATION DESIGN ONLY**. Nothing listed here has been run as a combined-XPI test. Stage 5.1–5.6 suites are specified; Stage 5.7 reconciled them without executing tests.  
**Authorization:** Source analysis, existing evidence inventory and deterministic test **specification** only. Do not execute security-state-changing Firefox tests, write to GitHub, implement a test extension, or interact with real Perchance/Mullvad/Cloudflare without separate authorization.

## 1. Normative boundary and evidence semantics

Accepted design: Stages 1–4, especially Stage 3 Minimal Architecture §§4–5 and Stage 5 Verification Plan §§0–6. The Stage 3 F1/F2 amendment supersedes earlier PJS/HTML-only AI limits. This section covers U-01, U-07, U-09 and Stage 5.1 portions of U-15/U-16, plus security-dependent UX-01/03/04/08. Other unknowns remain in the evidence register.

**Trust order:** immutable PCMS intent/target and current canonical revision → current PersonaMonkey UID/route/guard/execution authorization → current authenticated Perchance target/editor evidence → effect dispatch → remote independent confirmation → durable disposition. External events, DOM content, AI statements and UI cache snapshots are not authority.

**Test tier:** `SOURCE_EVIDENCED` only for inspected code; `DEFERRED_UNTIL_IMPLEMENTED` for all future emulator/packaged Firefox cases below; `NOT_RUN` is never PASS. Each completed Stage 6 run must attach test runner SHA, combined-XPI SHA-256, donor pinned commit, exact Firefox Developer Edition build, fixture version, failure-injection point, source/DB mutation trace, assertion outputs, and redacted failure evidence. Never fabricate runtime evidence from a source inspection.

### Donor reuse inventory (read-only, not newly executed)

The pinned donor is `Neb963/persona-router@9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf` (manifest 1.2.0; Gecko `persona-route-manager@local`). Reuse existing test cases where they already cover a proof, then add only independent missing assertions.

| Existing source-evidenced regression fixture | Actually covers by source inspection | **Not** established |
|---|---|---|
| `extension/tests/background-routing-init.test.mjs` | Proxy and `webRequest` fail-closed guards register *before* the first awaited recovery read; read/write initialization failures retain safe routing; guarded request retries bootstrap | Firefox event-page persistent registration of other listeners; delivered alarm after suspend; real combined-XPI cold wake |
| `extension/tests/management-integration.test.mjs` | External API's sender/UID validation, lease and operation safety negative fixtures | Same-XPI internal PCMS facade and actual Perchance browser action admission |
| `extension/tests/orchestrator-external-admission.test.mjs` | Lease expires during validation/persist: task never starts and no tab is admitted | Revocation at **later** browser execution boundary in combined XPI |
| `extension/tests/orchestrator-recovery.test.mjs` | Interrupted donor job marking and cleanup limited to stored automation ownership tags | Explicit human handoff, durable ownership transfer, crash during handoff and dirty source safety |
| `extension/tests/pcms-contract-hardening.test.mjs` | Existing internal Management API envelope/precondition validation | PCMS new business command surface, exact source-bound approval, IndexedDB revisions |

The donor test files are inspection evidence only: no tests were executed during this Stage 5.1 audit.

## 2. Failure taxonomy and acceptance rules

Use one consistent record for every fault: `testId`, `operationId`, `parentId`, `target`, `personaUid`, `routeFingerprint/epoch`, `bindingRevision`, `expectedEntityRevision`, `senderKind`, `guardDecision`, `checkpoint`, `effectAttempt`, `remoteObservation`, `disposition`, `redactedReason`, `bootId`, `controllerEpoch`, `observedAt`. No cookies, credentials, request URLs with secrets, source bytes, prompt contents or exception stacks in diagnostic output.

The fake provider records remote effects in an independent effect ledger; the PCMS test transaction store is a separate database. A simulated crash can destroy all in-memory state but must not erase the test oracle's independent effect ledger. Assertions require **zero prohibited dispatches**, **no duplicate remote effects**, and **no false confirmed receipt**, not merely an error message.

Statuses for remote effects: `PREPARED` (durable local intent), `DISPATCH_POSSIBLE` (durably marked *before* effect), `OBSERVING` (read-only reconciliation), `CONFIRMED` (independent positive evidence), `HELD_UNCERTAIN` (cannot prove success/failure), `ABORTED` (before possible dispatch), `REJECTED` (authoritatively no effect). A remote HTTP 200, resolved promise or AI text alone cannot establish `CONFIRMED`.

### P51-01 — Persistent Firefox event-page wake (U-09; **critical**)

**Falsifiable hypothesis:** A combined XPI registers every wake-critical listener synchronously during entrypoint evaluation and can process a due alarm after the event page is suspended even if donor storage recovery initially fails. Routing protection is registered before processing the first dependent event.  
**Prior proof:** `routing-gate.js` static registration and donor unit test above; `recovery-bootstrap.js` imports `background.js` only after awaited recovery. `background.js` contains late `runtime.onMessage`, `onConnect`, `onInstalled`, `alarms.onAlarm`, etc. Firefox documents that asynchronously registered event-page listeners are not persistently registered: https://firefox-source-docs.mozilla.org/toolkit/components/extensions/webextensions/events.html and https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts.  
**Minimal fixture:** one packaged combined XPI, one fake durable PCMS due operation, one alarm name, no dashboard/content-script keepalive, two fake Personas, a protected-route guard; pinned actual Firefox Developer Edition profile with no real provider credentials. Keep an independent harness trace.  
**Faults:** (a) stop at first awaited donor storage read; (b) reject one recovery read then allow retry; (c) suspend page and let alarm fire; (d) simulate Firefox process restart; (e) trigger message after cold wake; (f) duplicate alarm delivery.  
**PASS:** alarms/messages wake on the actual packaged Firefox event page, listeners were installed in initial synchronous evaluation; each delivery enters one guarded rehydration path, and exactly one durable eligible command is claimed. No remote effect while donor security is unavailable. A wake missed by the browser must be recovered on the next supported wake/startup, without treating a timer as a guaranteed exact deadline.  
**FAIL:** later listener never fires after suspension, PCMS dispatches before routing/restore checks, a duplicate effect occurs, or a protected request routes Direct during incomplete recovery.  
**Fallback:** block PCMS mutation; keep PersonaMonkey network fail-closed, retain due journal, show degraded status on next safe UI open. **Do not work around with a permanently open hidden tab.**  
**Artifact/owner:** Firefox wake registration trace, alarm delivery IDs, no-dashboard proof, security guard receipts, XPI/build/version. Stage 6 combined-runtime slice + independent packaged-Firefox verifier.  
**Status:** `DEFERRED_UNTIL_IMPLEMENTED`; source registration risk confirmed, no Firefox test run.

### P51-02 — Shared Persona admission and lease revocation (U-01)

**Hypothesis:** PCMS obtains the *same effective* Persona conflict/route/execution protection as donor management, using one narrow same-XPI facade. No independent PCMS lease can authorize browser automation.  
**Fixture:** two Persona UIDs (A protected, B protected), one donor operation on A, one PCMS Perchance action on A, one safe action on B; deterministic lease epoch and fake routing status. The donor internal manager, external Integration API and PCMS facade are separately identified; external API disabled by default.  
**Faults:** (a) donor starts conflicting A operation; (b) A lease expires; (c) A route assignment changes between preflight and dispatch; (d) A container rotates but stable UID survives; (e) protected route health fails between admission and browser effect; (f) attempted implicit Direct fallback; (g) external lease is revoked while PCMS awaits user interaction.  
**PASS:** A operation is denied/held or revoked at the final authoritative execution boundary; ambiguous already-issued effects enter read-only reconciliation; B can proceed independently; UID resolves to current container under a fresh check; protected route never falls back Direct. PCMS cannot self-grant donor authority or route around `PersonaMonkey` with raw browser/native calls.  
**FAIL:** a PCMS action executes on A after a known lease loss, wrong container, blocked route, or conflicting donor owner; work on B is blocked without shared dependency.  
**Fallback:** scoped recovery hold on A; cancel owned task if safe, independently observe uncertain effect, keep unrelated scope available.  
**Artifact/owner:** guard admission/revocation decisions including UID, route epoch and effect counts; Stage 6 guarded facade + independent threat reviewer.  
**Status:** `DEFERRED_UNTIL_IMPLEMENTED`; donor lease machinery `SOURCE_EVIDENCED`.

### P51-03 — Trusted message and revision fencing (U-01, U-09; UX-01/03)

**Hypothesis:** Only a validated extension-page command can cause PCMS business mutation. Content-script signals can report a narrow verified tab/frame state, never self-authorize a release, approval, route change or publish. Every mutation is checked against canonical persisted revisions and exact bound targets.  
**Fixture:** fake trusted PCMS page, donor options page, Perchance content script, webpage injecting untrusted page-world messages, stale UI view; fake target G1 bound to A and G2 bound to B.  
**Faults:** (a) forged `sender.id`/origin, which harness does not let caller override browser-supplied metadata; (b) privilege request from content script; (c) malformed/oversized message; (d) wrong target UID/account; (e) stale entity/binding revision; (f) replayed `operationId` with different payload; (g) out-of-order UI read responses after canonical mutation; (h) two UI windows concurrently approve an outdated source.  
**PASS:** validation occurs on the privileged receiver rather than relying on disabled UI buttons; invalid requests produce bounded codes and zero business/provider effects. Existing operation IDs accept only same immutable payload and **do not replay side effects**. Old views cannot replace newer canonical projection; approval is fingerprint-bound.  
**FAIL:** any unauthorized or stale mutation, phantom success, or UI response regresses displayed canonical revision.  
**Fallback:** requery canonical state, preserve stable selection/focus, present conflict and safe recovery.  
**Artifact/owner:** request/decision/response trace with redacted sender class and revision; Stage 6 command surface + UI integration test owner.  
**Status:** `DEFERRED_UNTIL_IMPLEMENTED`; donor sender validation is `SOURCE_EVIDENCED`.

### P51-04 — Intent-before-dispatch, crashes and double delivery (U-09; UX-04)

**Hypothesis:** No provider side effect is ever attempted without a durable matching `DISPATCH_POSSIBLE` record, and ambiguous outcomes are reconciled rather than retried blindly.  
**Fixture:** fake transactional IndexedDB, independent fake remote effect ledger, fixed G1/A source/target fingerprint, two simultaneous wake callbacks and one UI command using the same operation identity; independent crash controller.  
**Faults:** (a) abort before PREPARED commit; (b) PREPARED committed but crash before dispatch marker; (c) marker DB commit rejected; (d) marker committed, crash before sending; (e) remote accepts effect and reply disappears; (f) readback returns contradictory or stale data; (g) readback positive, crash before CONFIRMED DB commit; (h) simultaneous two wakes; (i) quota or upgradeblocked on recovery; (j) `await` during DB transaction accidentally makes it inactive.  
**PASS:** (a–c) no effect sent; (d–h) at most one effect (possibly zero), never an unobserved blind repeat, eventual CONFIRMED only after independent authoritative readback; otherwise HELD_UNCERTAIN with operation target lock preserved. A short IDB transaction is never held across a remote await. Restart reconstructs lock and order from stored records. (i–j) fail closed, no remote dispatch.  
**FAIL:** duplicate remote effects, in-memory-only authority after restart, CONFIRMED based on response alone, or new work admitted while journal unwriteable.  
**Fallback:** targeted hold; keep healthy targets working if storage remains trustworthy; if canonical DB unavailable, all PCMS mutations held and donor safe functionality retained.  
**Artifact/owner:** full fake provider effect ledger, IDB state snapshots at each cutpoint, crash/restart receipts; Stage 6 persistence slice + independent fault-injection CI.  
**Status:** `DEFERRED_UNTIL_IMPLEMENTED`.

### P51-05 — Human editor ownership, handoff and cleanup (U-07)

**Hypothesis:** Human takeover/dirty editing of a PCMS-owned tab is durable and irrevocably prevents automatic cleanup or conflicting source mutation until explicit re-admission.  
**Prior evidence:** donor orchestrator tags ownership via `browser.sessions.setTabValue`; restart cleanup may close tabs tagged to interrupted jobs. No complete durable PCMS human-handoff protocol is evidenced in this donor snapshot.  
**Fixture:** PCMS-owned automation editor tab G1 and unrelated human tab G2; simulated saved source, an unsaved edit buffer and handoff marker; session-tab ownership tags as provided by real packaged Firefox in the integration test.  
**Faults:** (a) human requests handoff; (b) crash before/during/after handoff persistence and tab untagging; (c) editor reports dirty, unknown or cannot be inspected; (d) tab navigates from intended slug; (e) background restarts with stale cleanup metadata; (f) AI save completes after human takeover; (g) tab ID recycled.  
**PASS:** after human intent is durably committed **before** releasing machine ownership, recovery always favors retaining possibly human-owned tabs, not auto-closing them. No concurrent save, navigator reassignment or publish while dirty/unknown; G2 unchanged. Uncertain handoff becomes a scoped hold and requires explicit operator resolution.  
**FAIL:** auto-closes a handed-off/ambiguous tab, silently overwrites unsaved buffer, accepts stale tab ID as proof, or automatically resumes AI after crash.  
**Fallback:** leave tab open, revoke PCMS automation cleanup authority, reconcile editor/source identity, ask operator only for unresolved state.  
**Artifact/owner:** session tag + journal checkpoint trace, source fingerprint before/after, tab lifecycle; Stage 6 guarded tab handler + packaged Firefox verifier.  
**Status:** `DEFERRED_UNTIL_IMPLEMENTED`.

### P51-06 — Partial initialization and donor isolation (U-01, U-09)

**Hypothesis:** Failure of PCMS IndexedDB/schema/migration does not disable safe PersonaMonkey management or protected routing; failure of PersonaMonkey security initialization does deny every dependent PCMS browser action.  
**Fixture:** combined XPI in a disposable profile with test protected route emulator, normal donor options UI, one PCMS pending operation and an independent diagnostics entrypoint.  
**Faults:** (a) PCMS IDB open error/quota; (b) schema upgradeblocked by another UI connection; (c) corrupt PCMS meta; (d) donor state storage read failure; (e) native host unavailable; (f) Firefox event-page restart during recovery.  
**PASS:** (a–c) donor route guard and safe native management continue, PCMS mutations held; (d–e) protected dependent requests blocked and PCMS does not show READY; diagnostic safe status available independently; (f) one safe rehydration path.  
**FAIL:** donor protection disabled by PCMS startup exception; fail-open to Direct; unsafe operation admitted on partial init.  
**Fallback:** degraded PCMS read-only status, non-mutating diagnostic export, scoped holds where canonical state permits; never create a second fallback controller.  
**Artifact/owner:** guards, initialization phase, typed failure code, partial component readiness matrix; Stage 6 integration/diagnostic owners.  
**Status:** `DEFERRED_UNTIL_IMPLEMENTED`.

### P51-07 — Multi-source actor/epoch and queue backpressure (U-09, U-15; UX-01/03)

**Hypothesis:** One logical PCMS controller and its durable revision-fenced operation claims prevent stale callbacks, two UI windows, duplicate alarm delivery or event-page rehydration from issuing simultaneous writes on the same generator. Independently eligible generators progress within bounded concurrency, without backlog bursts.  
**Fixture:** 50 fake accounts, 1,000 fake generators, 4 simultaneous command sources (2 UI views, alarm, startup), 2 same-generator requests, 1 protected route failure; benchmarkable fake effect IO, no external network.  
**Faults:** (a) out-of-order UI responses; (b) two claim attempts at same revision; (c) event page restart mid-dispatch; (d) provider latency and rate cap; (e) a failed DB transaction; (f) lower cap and due backlog; (g) route loss for one account.  
**PASS:** one active conflicting operation per generator transactionally; monotonic visible revisions; no duplicate effect; bounded per-account/global in-flight jobs and bounded open tabs; retry backoff, not a restart burst; unaffected accounts proceed; no trusted operation scheduled on a broken journal. **Numeric throughput/memory SLOs require later workload measurements, not speculative thresholds.**  
**FAIL:** duplicate target dispatch, indefinite global starvation from one account, unbounded tabs/alarms/heap, or stale UI commits.  
**Fallback:** bounded admission, account-scoped holds, no active-window eviction on cap reduction, operator-visible queue age.  
**Artifact/owner:** deterministic effect counts, ordinal fairness, queue and tab peaks, resource measurements, canonical revisions; Stage 6 scheduler + workload verifier.  
**Status:** `DEFERRED_UNTIL_IMPLEMENTED`; full Refresher capacity semantics additionally belong to Stage 5.4.

### P51-08 — Restore gate / fresh-controller non-activation (U-09, U-16; UX-08)

**Hypothesis:** A restored PCMS database cannot reactivate stale mutating authority while the independent restore gate or previous-controller condition is unverified.  
**Fixture:** existing profile with pending G1 effect and imported archive containing prior approval; fresh disposable Firefox profile with mapped donor UID but inactive PCMS controller; independent persistent restore guard that is not overwritten by PCMS DB import.  
**Faults:** (a) crash after restore gate set/before import; (b) replacement of IndexedDB while event page wakes; (c) donor storage import partially completes; (d) stale approval/operation becomes due; (e) previous controller may still be active; (f) operator Pause predates restore.  
**PASS:** controller never dispatches before reviewed activation; old approvals are historical evidence only; uncertain effects require remote readback and fresh eligibility; Pause remains; no Direct fallback. Source-specific activation and UID remap must be independently validated.  
**FAIL:** any provider effect during inactive profile, restore inadvertently clears holds/Pauses, or two controllers operate based solely on imported state.  
**Fallback:** global mutating hold in fresh controller with read-only reconciliation/status; operator confirms predecessor inactivity only in late acceptance.  
**Artifact/owner:** independent guard state before/after restore, no-effect ledger, boot/epoch IDs; Stage 6 restore + runtime owners.  
**Status:** `DEFERRED_UNTIL_IMPLEMENTED`; deeper restore tests reserved for Stage 5.5.

## 3. Dependency-minimal acceptance portfolio

- **Static/source review NOW:** confirm synchronous listener-registration discrepancy; identify donor lease and sender contracts; locate existing donor tests and preserve them. Those findings are not pass/fail of the product.
- **Early Stage 6 thin vertical slice:** packaged Firefox P51-01, -02, -03, -04 and -06, before any real Perchance mutation is enabled.
- **Before unattended AI/editor work:** P51-05 plus full-source/AI validation from later Stage 5.2.
- **Before fleet scheduling or restore activation:** P51-07 and -08 plus later 5.4/5.5 cases.

A gate fails if even one security-critical prohibited effect occurs, regardless of the number of successful happy-path assertions. An unimplemented or unrun test remains `DEFERRED_UNTIL_IMPLEMENTED`, not FAIL or PASS. A Stage 5 verification design can close when its proof obligations and safe fallbacks are complete; software acceptance cannot.

## 4. Open technical questions not requiring operator decisions yet

1. How to adapt the donor's internal shared lease/runner to a **narrow same-XPI** PersonaGuard while preserving external integration behavior and donor regressions; no second PCMS execution path.
2. Whether actual packaged Firefox event-page wake exposes the late-listener defect and whether other wake-critical registrations beyond alarm/message need relocation.
3. Exact crash-consistent tab handoff/cleanup semantics, with an operator-wins ambiguity policy.
4. How to implement transactionally fenced one-writer operation claims across repeated wake callbacks without introducing distributed locks.
5. Whether strong IndexedDB transaction durability hints and Firefox event-page suspend behavior meet the eventual measured reliability target. Independent provider readback remains mandatory in every case.

These are engineering verification questions with conservative defaults already fixed by accepted design. They do not justify reopening Stage 1–4 product decisions.

## 5. Stage 5.2 — Perchance and native-AI evidence/failure suite (2026-10-12)

**Status: `SOURCE_EVIDENCED` / historical discovery only, with acceptance tests `DEFERRED_UNTIL_IMPLEMENTED`.** No additional Perchance account operation, AI message, generator mutation, external API request, packaged Firefox run or new emulator test was performed in Stage 5.2. This is a verification contract, not a product PASS. It reuses the accepted 2026-10-12 F1 `HISTORICAL_OPERATOR_LIVE_PASS` and the September `discovery-v3.zip` observations. The September browser/endpoint observations may change; they are not supported provider APIs or guarantees.

### Evidence reuse, limits and hazards

| Evidence / source | Supported observation | Limit that matters to PCMS |
|---|---|---|
| Stage 3 F1/F2 amendment, final addendum | An operator created one initially private/empty generator, independently verified it before/after rename, confirmed ownership/inventory, and did not observe the final slug in the sampled 432-entry public list | No live retry/crash test; sampled absence ≠ guaranteed universal invisibility; F2 is a **scope decision**, not native-AI verification |
| `discovery-v3.zip/discovery/DISCOVERY.md` §§2–3 and `state-machine.md` | Page-side owner/edit-key concepts, generator API response families, editor save state, AI SSE frame families, new-chat behavior, and `srcState` states were inspected/observed in a September pre-authenticated Brave environment | `editKey`/collaboration/editability are **not** owner proof; APIs/DOM may drift; the discovery environment is not the combined Firefox extension |
| `discovery/FINAL_DELTA.md` §1.A and `evidence/raw3/srcsave.json` | At least one `src/` save round-trip: local file write → upload → top-level `srcManifest` in generator save → reload/readback of identical file bytes | Not a general guarantee for arbitrary sizes, deletions, binary assets, multi-file interrupted uploads, or AI-edited full-manifest completeness |
| `discovery/FINAL_DELTA.md` §1.C and `unknowns.md` | `/api/aiAgent/history` returned settled history for a previous session; new chat and stop/resume behavior were observed; the observed history request relied on the session identifier, with no effective secondary routing-key check | History lacks complete SSE timing/frames, and cannot independently prove tests. Treat session IDs as **sensitive bearer-like capabilities**, never log/transmit in diagnostics |
| `discovery/state-machine.md` and `IMPLEMENTATION_READINESS.md` | Native helper can issue file/browser tools; editor worker/OPFS drafts, AI session and local source workspace have distinct state; new chat is implemented as session end/reset in the captured frontend | A UI reset is not proof of a fresh server session, cleared workspace or clean second conversation. `browser_eval`/page-tool paths must not be trusted to enforce PCMS privilege limits |
| Public Perchance editor text, retrieved read-only 2026-10-12 | Rename UI warns that renaming an existing generator can break imports; some editor copies also warn about slug-dependent local storage | This is consistent with the approved **empty temporary slug** F1 rename, **not** authorization to rename an adopted/public generator. Public page text is not an authenticated ownership API contract |

**Independent observation definitions:** A server readback of `isPrivate`, source and `srcManifest` is not the same fact as logged-in owner proof; a `saved` status is not a final-byte proof; an AI `result` or `done` event is not a machine-observable test PASS; a displayed clean editor is not reliable evidence that every active human/collaborator tab is clean. In all checks, bind account identity, `personaUid`, target generator ID/slug, source revision, observation method, time and final operation ID. Every test uses a separate fake-provider effect ledger and PCMS journal; no test's expected outcome is inferred from the effecting response itself.

### P52-01 — Owner versus collaborator/edit-key discrimination (U-02; U-07)

**Hypothesis:** Every mutating action is admitted only when current independently authenticated account identity matches the exclusive Persona binding **and** the target generator has positive owner evidence for that account; an edit key, editable HTML page, shared collaboration token or saved browser session does not substitute for ownership.  
**Prior evidence:** F1 owner endpoint answered `is-owner` for one target; discovery describes `editKey` and `#edit:collab` permitting edits without ownership. General owner endpoint and current account-identity semantics are `UNVERIFIED`.  
**Minimal fixture:** Accounts A and B; Persona UIDs PA/PB; owned target GA, collaborator-editable target GB, unauthenticated G?, and a cached owner proof with explicit freshness and binding revision. Fake page/account observer returns separate `sessionAccount`, `canEdit`, `ownerResult` and `ownerObservedAt`.  
**Faults:** (a) A login switches to B inside PA; (b) valid editKey for GB but owner B; (c) session-token error/challenge; (d) owner/readback timeout; (e) historical owner proof becomes stale after binding/route change; (f) two accounts each claim the same slug; (g) manual enrollment override without owner evidence.  
**PASS:** no provider mutation for a–g unless independently reverified owner/session/binding evidence for the exact target. Read-only reconciliation is permitted when safely scoped. Correct account A/GA proceeds if all fresh guards pass. Underlying requester identity is not inferred from page text or passed edit key.  
**FAIL:** any operation reaches the fake remote write ledger using collaborator-only or stale/mismatched identity, even if the page allowed saving.  
**Fallback:** generator/account-scoped `RECOVERY_HOLD` or pending identity status; no Direct fallback; other verified accounts continue.  
**Artifact / owner / tier:** redacted independent account/owner projections, eligibility decisions and zero-effect ledger; Stage 6 Perchance adapter + Persona guard, later minimum operator ownership check only if emulator cannot establish live semantics. `DEFERRED_UNTIL_IMPLEMENTED`.

### P52-02 — Private-first create and rename under uncertain effects (U-03; U-02)

**Hypothesis:** Each initial create and subsequent rename is a **separate** journaled effect with independently confirmed remote result. An ambiguous outcome never causes another create, rename or account reassignment without authoritative read-only reconciliation. The F1 happy path is imported as historical evidence; do **not** reproduce it live.  
**Prior evidence:** F1 confirmed real private/empty creation and final rename in one human-run disposable flow. Its navigation broke the original probe before post-rename inspection; a second verifier recovered the final state.  
**Minimal fixture:** One user-supplied target slug, an unknown server-allocated temporary slug, account A/PA, fake inventory and owner/status/source readbacks, separate create and rename remote ledgers; durable per-effect intent (`PREPARED` → `DISPATCH_POSSIBLE` → read-only reconciliation).  
**Faults:** crash/lost reply (a) before remote create, (b) after creation but before temporary slug was persisted, (c) after temp readback, (d) after rename accepted but before response, (e) after redirect/navigation; (f) pre-existing final slug collision; (g) both temporary and final names observable; (h) temp matching ambiguous among multiple owned empty generators; (i) GitHub offline after confirmed final reservation.  
**PASS:** no more than one effect per uncertain command; evidence suffices to confirm only when owner/private/empty/source and exact identity trajectory can be established. A second create is **forbidden** when the create may have succeeded but unknown temp identity cannot be uniquely reconciled. After uncertain rename, inspect both temp and final; ambiguous/mixed results remain held. Collision preserves any confirmed temp and reports it; no invented replacement slug. GitHub outage preserves confirmed Perchance state and leaves separate folder work pending.  
**FAIL:** blind retry of possible create/rename, moving the requested slug to another account after ambiguity, false finalized reservation from HTTP 200, or lost confirmed remote result on GitHub outage.  
**Fallback:** hold the exact slug, account and possible temporary generators with read-only resolution; operator decides only when evidence cannot disambiguate.  
**Artifact / owner / tier:** crash-point matrix, remote effect counts, inventory snapshots, journal transitions, explicit `UNCERTAIN` receipt, no secrets; Stage 6 provider emulator/IDB journal. `DEFERRED_UNTIL_IMPLEMENTED`.

### P52-03 — Slug canonicalization, reuse, deletion and continuity (U-04)

**Hypothesis:** A slug is an address, **not** a durable identity. Rebinding to a visually similar, normalized, deleted or reused slug does not silently transfer account authority, prior consent, cached READY source or publication approval.  
**Prior evidence:** September discovery describes lower-case/hyphen sanitizer, minimum-length input and `already-exists` responses; no immutable Perchance resource ID or complete canonicalization guarantee was established. Public editor warnings say slug rename may break imports.  
**Minimal fixture:** Local `generatorId=G1` with tombstone, owner A and earlier slug; remote accounts A/B; table-driven candidates including uppercase, whitespace, repeated separators, visually confusable characters, long names, `/`, `..`, `%2f`, Unicode, server-normalized name, `already-exists` and recycled old slug.  
**Faults:** client/server disagree on canonical slug; real owner changes; incomplete inventory; previously deleted slug later belongs to B; rename redirect loses page context; old GitHub path still exists and points to unrelated source.  
**PASS:** show server-observed canonical target and independently checked ownership, reject unsupported/ambiguous input before mutation, never conflate G1 history with reused slug, and require deliberate reassociation on owner change. A 404 or absence from one list is not confirmed deletion; existing public slug is not renamed by a supply repair.  
**FAIL:** generating an unrequested substitute slug, implicit fresh-owner takeover of G1, reusing stale approval, or deleting local history on a missing list response.  
**Fallback:** hold/disambiguate; retain local tombstone, exact original source and receipt history.  
**Artifact / owner / tier:** table-driven original/normalized/server strings with no actual remote calls; Stage 6 binding adapter. `DEFERRED_UNTIL_IMPLEMENTED`. A fresh operator-only provider case is needed **only** if implementation depends on an unsupported server normalization rule.

### P52-04 — Complete full-source bytes/readback and asset loss (U-05; U-07)

**Hypothesis:** PCMS can build a deterministic candidate fingerprint only from independently re-observed saved PJS, HTML and the **entire generator-owned `src/` file set**, including binary files and confirmed deletions. Upload acknowledgment, CDN key, `srcManifest` or AI response alone cannot replace byte verification.  
**Prior evidence:** September `srcsave.json` and `FINAL_DELTA.md` verify a simple `src/` upload/save/reload byte round-trip. Discovery `srcState.writeFile` is local-only until upload and `app.saveGenerator()`; the generator save sends a top-level `srcManifest`. Limits under partial `src-*` errors and large files remain unknown.  
**Minimal fixture:** Explicit exact PJS/HTML byte strings, source tree with text, binary, nested paths and an empty file, plus one deleted path; fake uploader/CDN; separate persisted server manifest and independent file-content oracle. Fingerprint uses a specified unambiguous canonical path ordering and **cryptographic hash of every saved byte sequence** (not just declared size/key), including PJS/HTML. Listing, account and owner are separately observed metadata and gates. The digest is calculated from **server-readback bytes after save**, not an unsaved CodeMirror buffer; line-ending normalization is detected and handled as actual changed content.  
**Faults:** (a) upload succeeds but `/api/save` fails; (b) `/api/save` succeeds but a CDN file is 404/stale; (c) hash mismatch under same key/size; (d) missing/deleted/duplicate or unexpected manifest path; (e) empty/binary files and path case ambiguity; (f) interrupted multipart upload; (g) source changed after test before approval; (h) timeout on a single required asset; (i) AI edits `src/` while save is pending.  
**PASS:** manifest reconciliation includes additions, deletions and every expected file; byte-level hashes agree with independently fetched saved data for exact target/revision. No `COMPLETE_SOURCE_VERIFIED` when any required file is unreadable or mismatched. A changed byte invalidates older tests/approval. Unlisted does not imply secret; safe logs contain only paths if permitted, sizes/digests and error codes, **not** source contents, CDN access keys or URLs.  
**FAIL:** successful `srcManifest`/upload is treated as independent full-source verification, deleted files are omitted from diff, two different byte sets share a candidate fingerprint, or live content is overwritten despite uncertain editor ownership.  
**Fallback:** hold the affected release for source reconciliation; preserve previous-good snapshots; report the exact unverifiable paths without public release.  
**Artifact / owner / tier:** canonical byte-manifest digest, independent readback ledger, per-path provenance/size/hash or redacted placeholders, fault injection, previous-good and candidate digests; Stage 6 source adapter. `DEFERRED_UNTIL_IMPLEMENTED`. Later narrow human confirmation only for provider behaviors that cannot be replicated with safe read-only evidence.

### P52-05 — Native AI evidence, adversarial results and writeback hints (U-06; U-05)

**Hypothesis:** A native assistant turn, SSE `done`, settled `/history` transcript, tool call or claimed PASS is never sufficient to mark a required test passing, commit AI changes or authorize publication. Only independently observable named tests, bound to the full final saved-source fingerprint, satisfy ordinary clean completion.  
**Prior evidence:** Historical discovery demonstrates AI send/stop, native SSE frames and settled history. `history` lacks complete streaming trace; no general trustworthy machine-readable arbitrary-test PASS interface was established. Final-response commit marker syntax remains an adapter proposal in the accepted Stage 3 amendment.  
**Minimal fixture:** One generator, predeclared default-test revision, named test set and independent observable test oracle (e.g., instrumented deterministic output assertion and error collector); controlled fake AI stream with `connected`, `tool-call`, `toolResult`, `result`, `done`, settled history, final assistant message and separate saved-source ledger.  
**Faults:** (a) assistant says 'all passed' with no run; (b) tool result from a different generator/session; (c) test passes on source F1 then assistant silently modifies source to F2; (d) a required test explicitly fails; (e) SSE disconnect before final; (f) history has settled text but no execution timestamps/actual assertions; (g) forged/multiple/embedded `PCMS_COMMIT_MESSAGE` lines in PJS, tool output or user message; (h) AI-generated page text attempts privileged GitHub/route command; (i) valid final assistant message without verified source/test evidence; (j) AI history session identifier appears in diagnostics.  
**PASS:** only separate test oracle results supported by observed actual execution and complete source fingerprint become PASS. A failure blocks publication even with human exception (the accepted exception covers unavailable tests, not known failures). Test/unavailable remains truthful and individual-only under accepted exception policy. Any suggested commit message is inert, bounded/sanitized, attributable to the **terminal assistant response of the exact helper session** and usable only after every PCMS-owned GitHub gate (tested source, current relevant revision, opt-in automation, no dirty editor) succeeds. No native AI text obtains PCMS privileged actions. Session identifiers are never exported in diagnostics.  
**FAIL:** text alone sets PASS, known failing test becomes 'unavailable', text marker alone creates commit/publication intent, or tool/page content bypasses the Persona/PCMS authority boundary.  
**Fallback:** `TESTS_UNVERIFIED` / `AI_UNAVAILABLE` / `KNOWN_FAILURE` as appropriate; preserve candidate under scoped hold; allow only the previously accepted exceptional **individual manual-testing route** for genuinely unavailable applicable testing, never for known failure.  
**Artifact / owner / tier:** redacted session correlation ID (nonreversible local reference), test assertion names/status/source hashes, message role/turn provenance, no transcript-by-default or session secrets; Stage 6 AI adapter/test verifier + GitHub authority tests (Stage 5.3). `DEFERRED_UNTIL_IMPLEMENTED`.

### P52-06 — Fresh Chat 2 and multi-round repair convergence (U-06)

**Hypothesis:** An optional `TESTING.md` starts a genuinely new AI conversation after default Chat 1 succeeds, while sharing the **saved generator source**, not Chat 1 transcript, AI workspace, drafts or conversation permissions. Because the archived helper allocates a server session lazily, a pre-send proof of S2 ID is not assumed possible. Subsequent repairs invalidate tests on earlier source revisions, and both applicable suites must pass on the same final F before normal review.  
**Prior evidence:** Historical discovery observed new chat calling `end`/reset and drafts with stored AI session IDs; no full two-chat, source-changing and retest convergence acceptance was observed. Historical `history` is not a complete trace.  
**Minimal fixture:** Configured Settings prompt version P1; READY candidate A; Chat 1 session S1; optional pinned `TESTING.md` T1; fresh Chat 2 S2; source revisions A → B → F and separate independent test oracle.  
**Faults:** (a) `end` request loses reply; (b) reused session ID or retained S1 history/OPFS scratch; (c) Chat 2 edits `src/x` so S1 PASS on B becomes stale; (d) default prompt updated to P2 mid-job; (e) Chat 2 unavailable; (f) both chats repeatedly change source without convergence; (g) browser cold-wake after S1; (h) human editor takes over between chats.  
**PASS:** Before T1, the captured UI must show completed reset and no attached S1 history/session. In the archived frontend, server session IDs are allocated lazily on first message: after the first T1 send, verify that the established S2 identifier differs from S1 and history is isolated **before treating any outcome as accepted**; if that boundary cannot be proven, stop and hold rather than claiming freshness. Source F is independently saved/read back. Both P1 and T1 test sets have actual passing evidence **on F**, including reruns after any Chat 2 repairs; P2 affects only jobs started after the Settings change. No clean PASS or bulk approval after incomplete new-chat proof. Bounded resources/no-progress detection stops safely without inventing a fixed repair-iteration limit.  
**FAIL:** reuses S1, treats a UI-cleared but server-reused session as fresh, carries earlier S1 test PASS to changed F, discards unsaved human edits, or labels unavailable Chat 2 as ordinary PASS.  
**Fallback:** hold candidate with source/versioned checkpoints; accepted exceptional individual review only for truly unavailable tests, with explicit warning and actual manual evidence.  
**Artifact / owner / tier:** session nonce/provenance **hash only**, final source hash, P1/T1 revisions, test and repair transition trace, no prompts/full transcripts in diagnostics; Stage 6 AI adapter. `DEFERRED_UNTIL_IMPLEMENTED`.

### P52-07 — Human dirty editor, collaboration and external changes (U-07; overlap P51-05)

**Hypothesis:** PCMS has affirmative safety evidence before every destructive editor-side write and source-bound publish; native save state, tabs, Yjs collaboration, AI edit and operator handoff never silently overwrite human work. `beforeunload` warnings are not a reliable machine-readable clean-state proof.  
**Prior evidence:** Discovery exposes editor-local unsaved/saving state and Yjs/collab surfaces, but did **not** exercise a real concurrent two-client collaboration. The donor can tag and clean automation tabs; Stage 5.1 P51-05 already defines ownership handoff crash behavior.  
**Minimal fixture:** One owned automation tab, one human tab on the same generator, stale cached source, simulated dirty CodeMirror buffer and `srcState` pending changes, plus a separate fake collaborator and donor handoff journal.  
**Faults:** (a) human types after PCMS source snapshot; (b) save/AI begins while Yjs state becomes unknown; (c) dirty `src/` pending changes not reflected in PJS/HTML; (d) tab closes/reopens with same identifier; (e) lost handler response or tab handoff crash; (f) provider page reports `saved` but local human buffer remains dirty; (g) human saved modification appears after source-bound approval.  
**PASS:** owner/collaboration/editor states are independently rechecked at action boundary; dirty/**unknown** status blocks staged writes, rollback, publish and auto-tab cleanup. Human tab retained through interrupted handoff; source drift invalidates approval. Other safe generators proceed. Combine this with **P51-05**, do not build a duplicate independent tab-handoff system.  
**FAIL:** automatic 'clean' inferred solely from `beforeunload`, no visible dirty marker, tab ID, current page URL, or a save HTTP 200; conflicting write or tab closure reaches fake remote ledger.  
**Fallback:** preserve human tab, set scoped hold and display actionable reconciliation; no automatic recovery from unknown collaboration state.  
**Artifact / owner / tier:** dirty-signal coverage map, handoff receipt, revision/target checks and per-generator absence-of-effect ledger; Stage 6 editor/Persona guarded runner and packaged Firefox. `DEFERRED_UNTIL_IMPLEMENTED`.

### Stage 5.2 minimum exit tests and run ordering

1. **First simulated provider contract (Stage 6):** P52-01 and P52-02, behind passed P51-01/02/03/04. Without current owner and durable create/rename reconciliation, do not enable any Perchance mutation.
2. **Before binding/adopting existing generators:** P52-03 slug reuse and consent/source preservation, with relevant GitHub gate from Stage 5.3.
3. **Before AI source edits:** P52-04 all-file bytes, P52-07 dirty/collaborative editor plus P51-05 handoff.
4. **Before normal review/automatic writeback:** P52-05 and P52-06, exact final-source test attribution and truly fresh Chat 2. GitHub writeback/publish requires additional independent Stage 5.3 gates; no F2 PASS is implied by permission to edit assets.
5. **Operator-live tests, late and minimal:** do **not** repeat F1 creation/rename happy path or September basic AI send/new chat/src save round-trip. Once integrated candidate exists, one disposable full-source AI repair-and-test path, with read-only full-file re-observation and fresh second-chat evidence **only if the packaged emulator leaves an unavoidable provider ambiguity**. No credentials in exported evidence. Protected Mullvad/Cloudflare bypass attempts are forbidden.

**Stage 5.2 go/no-go:** Verification **design** can proceed to Stage 5.3, with all seven P52-* tests explicitly unexecuted. Unverified owner or final complete bytes mandates a fail-closed product fallback, not a new requirement decision. The largest residual feasibility issue is whether *arbitrary natural-language AI testing instructions* can produce independent, machine-observable PASS for each required test. If not, report `TESTS_UNVERIFIED` (and use the approved exceptional individual/manual policy where legitimately unavailable), rather than fabricating an AI-test result or redefining known FAIL as unavailable. Revisit the accepted product only if real evidence establishes that no safe supported verification mechanism can meet its mandatory behavior.

## 6. Stage 5.3 — GitHub, complete-source writeback and publication safety (2026-10-12)

**Status:** `SOURCE_EVIDENCED` for accepted specifications and documented GitHub API primitives; the connected private `Neb963/per-gens` repository remains empty as checked on 2026-10-12. All P53 tests are **`DEFERRED_UNTIL_IMPLEMENTED`**. Neither real repository content nor Perchance state was changed.

### Boundary and evidence reuse

- Normative precedence: Stage 3 F1/F2 Decision Amendment **supersedes** Stage 2 §4.3 PJS/HTML-only AI constraints and the older Stage 2 §4.7 assumption that GitHub writeback always follows publication approval. The terminal AI message supplies at most an untrusted commit-*message suggestion*. Manual and opted-in automatic GitHub writeback may precede separate human publication approval, but only for fully verified and correctly attributed **entire-source** candidate F.
- Authoritative inputs: `per-gens/main` tree and `DEPLOYMENT.md` containing strict `Status: READY`; explicit one-to-one generator↔folder association; version-pinned optional `TESTING.md`; final Perchance PJS/HTML/`src/` **actual bytes** plus listing/owner proof; actual independent tests; PCMS immutable release/approval and dispatch journal. An exact same-byte Git commit with a different ID does not itself change final F. README, slug labels, AI text and an HTTP success response are not authorization.
- GitHub API evidence: `git/trees` creates a tree from a `base_tree`, with `sha:null` deletions and blob SHA entries (suitable for binary); `git/commits` creates a commit with a pinned parent; `git/refs` updates the branch with `force:false` so it must be fast-forward. These are **Git-only** operations, not an atomic distributed transaction. A branch-protection rule, GitHub permission failure or missing branch must fail closed. GitHub documents that its Git-reference API cannot operate normally on an empty repo; initialize `main` by a separate explicitly authorized initial Contents commit before using the Git-database workflow. The configured `default_branch: main` string does **not** imply a commit exists.
- Comparison invariants: `relevant(F)` includes every configured deployable path, absence/deletions, READY semantics, pinned test inputs and source-folder association. For an *already started* job, a changed `TESTING.md` or default prompt ordinarily affects **new** jobs, not its pinned test input; a READY revocation or actual relevant deployable change still blocks release. A new unrelated `main` HEAD does not inherently invalidate an identical relevant snapshot, but the adapter must independently prove equivalence before constructing a fresh-parent commit.
- Failure-injection model: each remote boundary has a pre-call intent, durable `DISPATCH_POSSIBLE` marker, optional GitHub `accepted` effect, possibly lost response, immutable source/readback observation, and a confirmed/uncertain/conflict disposition. `requestId`/`operationId` is **not** assumed to provide server-side GitHub idempotency. Compare path bytes and commit ancestry; never infer failure from transport error.

### P53-01 — Empty `main` bootstrap and non-READY reservation (U-08; critical prerequisite)

**Hypothesis:** PCMS will not interpret the configured default branch of an empty repository as an existing READY source and will not create an initial commit without separately authorized setup. A confirmed Perchance slug reservation remains valid while GitHub is uninitialized or unavailable.  
**Prior evidence:** On 2026-10-12 GitHub metadata returned `Neb963/per-gens` private, `size:0`, `default_branch:main`; branch query found none; `GET git/ref/heads/main` returned GitHub 409, `Git Repository is empty.` GitHub REST guide explicitly prescribes an initial Contents API commit before Git-database operations. Historical F1 remote reservation was operator-tested; GitHub initialization was not.  
**Fixture:** Ephemeral **empty** Git repository emulator, explicit generator ID, account/Persona binding, confirmed remote reservation, approved path root, and simulated operator-authorized initialization command. Also a populated fake repository as a control.  
**Faults:** (a) configured default branch with missing Git ref; (b) two simultaneous bootstrap intents; (c) lost response to initial commit; (d) first marker present but not READY; (e) unauthorized silent root/folder README creation; (f) GitHub outage after remote slug reservation.  
**PASS:** no READY/release accepted from missing HEAD, no auto-created repository content on ordinary discovery; bootstrapping requires explicit recorded authorization and one observed initial commit (never an automated retry after uncertain response); initial folder marker is non-READY unless externally reviewed; remote reservation remains attached to pending source work, not re-created.  
**FAIL:** creating or publishing source due to `default_branch=main` alone, duplicate roots/first commits or loss/reallocation of confirmed Perchance reservation.  
**Fallback:** `GITHUB_UNINITIALIZED`/`SOURCE_PENDING`, safe read-only status and explicit setup flow; no release/writeback until branch has independently confirmed commit.  
**Artifact/owner/tier:** pinned repo/ref observation, simulated branch histories, operation receipts without tokens; Stage 6 GitHub adapter/bootstrap and supply manager. `DEFERRED_UNTIL_IMPLEMENTED`.

### P53-02 — Source-folder association, paths, and hostile tree objects (U-08, U-04, U-05)

**Hypothesis:** One generator has only one confirmed currently bound folder, and GitHub paths are treated as untrusted data, never as proof of Perchance owner, permission or identity. No ambiguous path can select or overwrite another generator's files.  
**Prior evidence:** Stage 2 §3.5–3.8 and Stage 3 §5 define explicit mapping, collision review, full-content canonical hashes and safe path constraints. No concrete current `per-gens` tree or deployed adapter is available.  
**Fixture:** Synthetic Git tree containing `gens/a/{DEPLOYMENT.md,main.pjs,index.html,src/logo.png}`, `gens/b/*`, an unassociated matching-slug folder, an unrelated README, and alternates differing by Unicode normalization/case, percent-encoded separators, `../`, leading slash, file↔directory alias, symlink, submodule, executable bit, nested `src/`, unexpected byte-opaque asset and duplicate normalized path. Include a deleted/recreated Perchance slug under a new owner.  
**Faults:** (a) folder already mapped to generator B; (b) remotely renamed slug still points to old folder; (c) a `src/` filename collides after canonicalization; (d) unexpected tree object mode/type; (e) source path outside configured root; (f) `DEPLOYMENT.md` and `TESTING.md` placed ambiguously; (g) stale reassociation approval or recreated slug under another owner.  
**PASS:** before any mutation, apply a single documented path-normalization/canonical-fingerprint rule, reject traversal/collisions/unsupported objects or represent them as an explicit unsupported source; retain binary assets by **actual bytes/blob SHA**, no lossy UTF-8 conversion. Do not write outside the exact pinned folder nor modify an existing unassociated folder without approval. Slug reuse triggers new owner/source proof and invalidates stale association authority.  
**FAIL:** source-folder inference from slug alone, overwritten B folder, asset omission or non-deployable/policy file smuggled into F's accepted manifest.  
**Fallback:** `SOURCE_ASSOCIATION_CONFLICT` / `SOURCE_MANIFEST_UNSUPPORTED`; hold the affected generator, preserve source and history; safe other generators continue.  
**Artifact/owner/tier:** hostile tree fixture, path-by-path expected rejection/report, source-scope invariant, byte hashes; Stage 6 GitHub source mapper. `DEFERRED_UNTIL_IMPLEMENTED`.

### P53-03 — READY semantics, pinned testing, relevant versus unrelated HEAD drift (U-08; UX-04/05)

**Hypothesis:** Source eligibility/publish authority depend on READY and the actual relevant pinned source/test inputs, not just on repository HEAD movement or displayed cache age.  
**Prior evidence:** Accepted Stage 2 §3.5, §4.6; Stage 3 §§5–6. `TESTING.md` is optional and pinned for Chat 2. Existing repository has no committed source to exercise this on.  
**Fixture:** Commit H0 contains READY folder G with deployable candidate A, `TESTING.md` T0 and separate folder K. Sequence H1 changes only K; H2 revokes G READY; H3 changes G `src/logo.png`; H4 changes G `TESTING.md`; H5 leaves content unchanged but moves HEAD; H6 changes configured `DEPLOYMENT.md` metadata relevant to readiness. Use releases that start **before** or **after** each commit and track accepted prompt/test versions.  
**Faults:** concurrent HEAD advances during staged tests, approval modal display and immediately before publish; out-of-order GitHub reads; ambiguous equivalence when tree is truncated, path fetch incomplete, or GitHub unavailable.  
**PASS:** H1/H5 may continue *only after read-only confirmation* that relevant deployable bytes, approved mapping, READY and pinned testing contract still hold. H2 revokes READY immediately; H3 changes eligible source and holds for explicit reconciliation; a job started at H0 retains T0 even if H4 changes instructions, while a newly started job uses H4. A new `TESTING.md` revision is not silently introduced to an in-progress suite. A changed READY or newly conflicting association blocks publication regardless of old approval. Recheck at effect boundary, not merely on UI render.  
**FAIL:** globally aborting every unaffected generator on irrelevant HEAD advance, trusting cached READY after revocation, or using fresh T1 tests to satisfy old T0 approval without explicit re-evaluation.  
**Fallback:** `SOURCE_DRIFT` / `READY_REVOKED` / `SOURCE_UNVERIFIED` scoped to G; preserve immutable A/F/test record and last good P.  
**Artifact/owner/tier:** Git parent DAG, per-path SHA and READY timelines, pinned T and prompt revisions, causal audit; Stage 6 source reconciler and Work Queue. `DEFERRED_UNTIL_IMPLEMENTED`.

### P53-04 — Conditional atomic *Git-only* multi-file writeback (U-08, U-05; critical)

**Hypothesis:** Verified F is committed as a single Git tree/commit with **all additions, byte changes and deletions**; branch advancement must not overwrite concurrent HEAD. A Git commit is not a Perchance commit or a publication event.  
**Prior evidence:** GitHub documents `git/trees` with `base_tree`, blob object SHA, delete via `sha:null`, `git/commits` with pinned parent, and `git/refs` non-forced fast-forward. Stage 3 §6 requires pinned source and post-writeback readback.  
**Fixture:** H0 contains candidate A. Verified Perchance F changes `main.pjs`, adds `src/binary.dat`, modifies `index.html`, deletes `src/obsolete.css`, leaves `DEPLOYMENT.md` and `TESTING.md` unchanged. A second writer advances H0→H1 with unrelated folder K; alternate branch H0→H2 changes G's asset/READY. Simulate blob upload and tree assembly failures, stale refs, branch protection, unsupported binary, and mid-writeback source drift.  
**Faults:** (a) fail after one blob but before tree; (b) fail after tree but before commit; (c) fail after commit object before ref update; (d) H1 unrelated write before ref update; (e) H2 relevant write; (f) ref update rejects stale parent; (g) deletion omitted; (h) direct per-file Contents commits expose partial F; (i) non-fast-forward/force attempt; (j) source bytes changed since F was verified.  
**PASS:** no ref advancement until all bytes and deletions are assembled; commit carries complete intended G source and unchanged other paths/policy; one non-forced ref update is the only visible branch change. If H1 advances, **re-read HEAD and revalidate entire relevant pinned set** before creating a new child/tree of H1; never reuse a stale H0 tree or silently merge relevant differences. H2 or any unprovable HEAD change => hold. After successful ref advancement, independently read HEAD commit, relevant paths/blobs and F hash; do not infer success from commit-object creation alone. Branch restrictions cannot be bypassed.  
**FAIL:** partial candidate committed as multiple visible HEAD steps, omission of a deleted `src/` file, loss of unrelated HEAD edits, silent force-update, or Git HEAD success represented as Perchance publication.  
**Fallback:** immutable F preserved locally, `WRITEBACK_PENDING`/`WRITEBACK_CONFLICT`; reconcile via Git readback and explicit operator review. If protection disallows direct branch commit, hold and report required authorized flow—do not disable rules.  
**Artifact/owner/tier:** synthetic old/new trees + blobs and deletion diff, ref history, refused stale updates, postcommit SHA/digest readback; Stage 6 GitHub writeback adapter. `DEFERRED_UNTIL_IMPLEMENTED`.

### P53-05 — GitHub ambiguous effect and exactly-once *logical* writeback (U-08, U-09; critical)

**Hypothesis:** Lost GitHub responses, wake/restart and duplicated PCMS event deliveries never cause a second blind writeback or classify an unobserved commit as failed. The durable journal and **remote readback** cooperate; neither GitHub nor a client request ID alone promises distributed exactly-once execution.  
**Prior evidence:** Stage 3 §5 `PREPARED → DISPATCH_POSSIBLE`, independent observation and scoped holds; Stage 2 §4.9 explicitly requires readback for lost writeback acknowledgement. No live PCMS journal yet.  
**Fixture:** Operation W with immutable `opId`, target folder G, expected base commit H0, expected allowed changed-path set, full-source SHA-256 F, commit suggestion digest and sender/approval context. Crash/inject loss (1) before dispatch marker; (2) after marker but before HTTP send; (3) after Git tree/commit object creation; (4) after remote HEAD moves but response lost; (5) after HEAD readback before PCMS confirmation; (6) twice on simultaneous Firefox wakes. Include remote new commit that coincidentally matches F but was authored independently and a later nonmatching HEAD descendant.  
**PASS:** absent durable marker means no remote call could start by construction; marker without certain dispatch ⇒ reconcile before retry; commit object without ref movement is not success; independently observed branch ancestry and complete F subtree, expected path deltas, allowed policy stability and operation linkage permit precise confirmation. Coincidental content equality alone proves **matching source bytes**, not that W authored a particular commit; preserve attribution ambiguity when needed. If HEAD later differs, decide based on release policy and relevant path evidence, not stale response. Every duplicate wake observes one operation state and never independently sends W.  
**FAIL:** duplicate visible writeback after lost acknowledgement, append-only phantom commits treated as branch success, or assigning unrelated commit author/provenance to W.  
**Fallback:** `WRITEBACK_UNCERTAIN` + read-only reconciliation path; no automatic publication until source-branch convergence independently confirmed.  
**Artifact/owner/tier:** op/journal transition trace, Git commit/ref/tree DAG, relevant digest, duplicate-call counter, redacted causal receipt; Stage 6 journal + Git adapter. `DEFERRED_UNTIL_IMPLEMENTED`.

### P53-06 — AI terminal response, auto/manual mode and GitHub privilege separation (U-06, U-08; UX-04/05)

**Hypothesis:** Suggested commit text can change only the **commit description**, never eligibility, source content, target folder, approval, route, repository credential or publication authority. Automatic writeback remains opt-in, revision-safe and separately reversible without discarding the candidate.  
**Prior evidence:** Stage 3 F1/F2 Amendment §B authorizes full-generator AI edits but keeps all GitHub authority in PCMS. Example marker grammar is **proposed**, not frozen. Chat/session attribution from Stage 5.2 P52-05/P52-06 is a prerequisite.  
**Fixture:** Verified source F, independently observed tests, clean editor, current READY, manual versus opt-in auto settings with setting revisions; synthetic SSE stream and settled history with terminal assistant turn. Feed markers in tool outputs, user input, page HTML/PJS, earlier assistant turns, terminal assistant turn, escaped/multiline attempts, duplicate/conflicting markers, oversized messages and request-body attempts to change repo/path.  
**Faults:** (a) marker in tool/page text, not terminal assistant; (b) missing/multiple/invalid delimiters; (c) valid text with failing/unverified test; (d) source drifts after terminal turn; (e) user disables auto writeback before ref mutation; (f) AI requests a force-push, READY promotion or publish; (g) wrong GitHub target or malformed UTF-8; (h) manual reviewer sees diff A→F but HEAD changed before commit.  
**PASS:** a selected exact-session terminal **assistant** response alone can supply one bounded/sanitized commit-message suggestion; no parser action is an authorization signal. Auto mode requires settings still enabled at effect boundary, complete F/readback, actual test evidence and source/owner/READY/editor/journal gates; any missing/ambiguous marker ⇒ manual review of F, not automatic write. Manual mode requires the operator to review the exact scoped diff and commit target and passes through the same conditional Git writeback gate. Untrusted text cannot select repository/path, overwrite `DEPLOYMENT.md`/`TESTING.md`, access credentials or publish.  
**FAIL:** AI-only terminal prose/marker triggers GitHub write or publication, stale opt-in survives a user disabling the mode, or the suggested message changes any file/policy authorization.  
**Fallback:** `WRITEBACK_REVIEW_REQUIRED`, preserve F and tests; authenticated operator may submit a fresh revision-bound manual intent.  
**Artifact/owner/tier:** sanitized marker decision, message-role proof, settings revision, exact diff fingerprint, denied effect ledger; Stage 6 native-AI evidence verifier and Git adapter. `DEFERRED_UNTIL_IMPLEMENTED`.

### P53-07 — Exact-source human approval and pre-publication revalidation (U-05, U-06, U-07, U-08; UX-04/05)

**Hypothesis:** A human approval authorizes publishing **one** target binding/release/F/test evidence tuple. It is independent of the time and mode of GitHub writeback; a current Git commit by itself never yields approval.  
**Prior evidence:** Stage 2 §4.1 and Stage 3 §§5–6 bind approvals to full-source fingerprint, account binding, prompt/`TESTING.md` revision and actual tests. UI-Q26 and UI-Q28 keep checkpoints visible and separate.  
**Fixture:** Release R and previous-good P; approved F of `main.pjs`, `index.html`, `src/image.bin` bytes; Git commit C from optional auto writeback **before** approval or manual commit **after** separate diff review; single-generator AI-modified and clean-release bulk cases, with snapshot S of owner/route, approval evidence, READY and editor.  
**Faults:** (a) `src/image.bin` byte changes; (b) operator opens approval on stale UI then Git READY revoked; (c) Persona binding/owner changes; (d) tests correspond to pre-repair F1 rather than F; (e) releaseId or target ID swapped after confirmation; (f) unlist status uncertain; (g) AI-modified case inserted into clean bulk approval; (h) human unsaved source; (i) GitHub HEAD irrelevant change; (j) masked/unverifiable binary; (k) approval survives after rollback to P but is reused for revised F2.  
**PASS:** approval record pins release/target/binding version, full-versioned canonical F byte manifest, pinned test/prompt inputs, observed test assertions or explicitly authorized individual exception, and provenance. Immediately before publish, independently revalidate remote saved F, true unlisted state, owner/route, clean editor, current GitHub relevant READY/source/F and human approval. Different bytes or missing essential evidence ⇒ invalidate/hold; irrelevant HEAD ⇒ revalidate, may continue. AI-modified and exceptional releases require individual review; safe clean unchanged candidates can use explicitly bounded bulk approval.  
**FAIL:** approved only `main.pjs`, treating Git commit as publish approval, stale modal target published, exception covering a known failed test, or any unauthorized public listing effect.  
**Fallback:** `NEEDS_APPROVAL`, `APPROVAL_STALE` or `SOURCE_DRIFT`, with immutable F/previous-good P and exact conflict diff; individual re-review.  
**Artifact/owner/tier:** approval identity/fingerprint proof, deterministic before/after decision log, denied publication counter, individual/bulk receipts; Stage 6 release state machine + UI. `DEFERRED_UNTIL_IMPLEMENTED`.

### P53-08 — Publication uncertainty, partial failure and safe rollback (U-03, U-05, U-07, U-08; UX-04/05)

**Hypothesis:** GitHub source convergence, remote saved-source convergence and remote listing are separately confirmed facts; interrupted publishing cannot turn an unverified candidate into previous-good P or trigger an automatic repeat, and GitHub history is never rewritten as a remote rollback side effect.  
**Prior evidence:** Stage 2 §4.9 interruption matrix; Stage 3 §6 explicitly preserves GitHub writeback and leaves restored P unlisted for review. Perchance actual publish APIs and readback guarantees are not currently verified for combined PCMS.  
**Fixture:** Generator with good published P, unlisted staged F, approved full-source test record, successful Git commit C, and a fault-injectable fake Perchance owner/source/listing API. Test GitHub commit succeeds but Perchance publication fails, lost publish response, publication succeeded then readback fails, human dirty edit appears between reads, route loss, and rollback request after remote source was externally edited.  
**Faults:** before/after durable publish dispatch marker; publish accepted but ack lost; listing read returns stale/unavailable/conflicting; source differs despite listed state; revoke READY after approval and before publish; source changed during rollback; rollback save succeeds but re-list is attempted.  
**PASS:** no `PUBLISHED_CONFIRMED` until independently corroborated actual listing **and** remote complete F source with exact owner/approval/READY. After ack loss, observation precedes any further mutation; no unconditional republish. On post-publication contradiction, place scoped hold, attempt safe unlisting only when authorization and current state allow, then optionally restore P only after human-editor/source preconditions pass; verify restore and **keep P unlisted under review**. Preserve C and F history (no Git force-revert). Other safe generators may progress independently.  
**FAIL:** GitHub success implies published, lost reply causes blind repeat, verified rollback auto-republishes P, or remote live source overwritten despite human drift.  
**Fallback:** `PUBLICATION_UNCERTAIN` / `RECOVERY_HOLD`, causal observations and operator-owned exact resolution.  
**Artifact/owner/tier:** separate Git branch, saved-source and listing ledgers, before/after dispatch journal, checked rollback receipt, no tokens or private source in diagnostics; Stage 6 release/publisher and operator-live late acceptance. `DEFERRED_UNTIL_IMPLEMENTED`.

### Stage 5.3 high-priority run order, limits and closure

1. **Prerequisite before Git source staging:** P53-01 initial `main` setup and P53-02 explicit path/association. Real `Neb963/per-gens` initialization is **not authorized in Stage 5**; Stage 6 requires a separate explicit setup action.
2. **Before AI writeback enabled:** P53-03 relevant source equivalence, P53-04 atomic Git-only tree/commit/ref and P53-05 ambiguous effect/replay; precede external Git writes with P51-04 durable journal and P52-04 final complete-byte manifest.
3. **Before automatic writeback enabled:** P53-06 terminal assistant attribution/mode revision, plus P52-05/P52-06 truthful AI test/fresh-chat validation and P52-07 human-editor exclusion. Manual diff review does not bypass any source/commit condition.
4. **Before public publication enabled:** P53-07 exact approval and P53-08 remote readback/uncertainty; P51-02 Persona guard and P52-01 current owner remain mandatory. At least one negative injection per external boundary must confirm **zero prohibited publication effects**.
5. **Proof tiers:** Stage 5 source audit and fixture design only; Stage 6 executes deterministic Git DAG tests in a *separate disposable local repository/emulator*, then packaged Firefox with controlled mock/fixture; a short operator-run live publication verification belongs to the later acceptance plan if essential. A successful GitHub API read-only lookup does not constitute a simulated or live write PASS.

**Stage 5.3 design disposition:** P53-01–P53-08 specify safety and recovery contracts without reopening the accepted Stage 3 source/writeback order. `U-08` remains `DEFERRED_UNTIL_IMPLEMENTED`; an empty `per-gens` branch is a concrete setup blocker for *using* live source, not a reason to mutate it during Stage 5. The next step is Stage 5.4 fleet/Refresher timing, provider availability and resource bounds.

**GitHub public documentation consulted (read-only):**
- https://docs.github.com/en/rest/guides/using-the-rest-api-to-interact-with-your-git-database (empty repository initialization prerequisite)
- https://docs.github.com/en/rest/git/trees (tree creation, deletions, base tree, object modes)
- https://docs.github.com/en/rest/git/commits (commit parent/tree)
- https://docs.github.com/en/rest/git/refs (non-forced fast-forward branch update)

## 7. Stage 5.4 — Refresher, operational evidence, outage partitioning and fleet scale (2026-10-12)

**Source status:** The test rules below derive from accepted Stage 2 §5 (Q64–Q77, Q99–Q100, Q104/Q106), Stage 3 Minimal Architecture §7, Stage 3 Decision Register Q139–Q146, Stage 4 UI §6.4, and Stage 5 Verification Plan T2/T3. External confirmation: MDN Firefox `alarms` documents that scheduled alarms **do not persist across browser sessions**, and event-page background timers do not survive unloading. None of P54-01–P54-11 has been executed. Historical Perchance list observations are not proof of the current capacity or of a supported effective refresh method.

**One shared simulation oracle:** a deterministic interval/evidence timeline; durable generator records (`stableId`, `accountId`, `personaUid`, `releaseId`, `admissionOrdinal`, `eligibleSince`, `phase`, `activeRemaining`, `sleepRemaining`, `slotOccupied`, `holds`, `manualPause`, `lastCheckpoint`); account-specific verified route/session state; separately corroborated provider-wide health; time-bounded browser-running evidence; fake observed recent-list snapshots; immutable remote-effect ledger; a rate-limited fake provider; independent operation journal; and a virtual controller boot/suspend/crash switch. Numeric budgets are illustrative, not proof of provider throughput. Assertions distinguish **operational budget seconds**, **account grace seconds**, **slot occupancy**, **scheduled attempts**, **remote effect**, **persisted refresh result**, and **feed presence/rank**.

### P54-01 — Evidence-bounded active and sleep clocks (U-09)

**Hypothesis:** Neither active nor sleep time is decremented from wall-clock difference without sufficient interval-specific browser-running, applicable health, eligibility and phase evidence. Event-page suspension alone is not Firefox shutdown.

**Fixture:** G1 occupies an active slot with 24h budget and accumulates exactly 8h of proven healthy operation; G2 has 72h sleeping. Attach interval receipts with source, endpoints, boot identity, checkpoints and evidence freshness. Run independent copies for event-page suspension, full Firefox shutdown, abnormal crash and stale provider health.

**Faults:** (a) close Firefox for 10 wall hours; (b) MV3 event page unloads while independent browser/provider evidence continues, and while that evidence is absent; (c) crash after the last durable healthy checkpoint with 27 unobserved minutes; (d) backward/forward system clock adjustment; (e) duplicate/reordered evidence and alarm callbacks; (f) provider health read fails; (g) delayed evidence overlaps an already credited interval; (h) Phase Active→Sleep transition and rehydration at the boundary.

**PASS:** G1 retains **16h** after (a), irrespective of ten hours offline; G2's sleep budget also freezes. Time after a crash is credited only for a provable covered interval; no double counting from overlapping receipts or replay. A suspended event page may credit proven intervals but cannot assume that the entire suspension was healthy. Clock regression and stale evidence produce an explicit unknown gap. Transitions persist exactly once, and active remaining never becomes negative. **No mandatory wall-clock interpolation.**

**FAIL:** wall time consumed during Firefox closure/outage/uncertainty, negative budget, duplicate credit, missing durable clock provenance, or an invented uninterrupted 24h interval.

**Fallback:** freeze unknown spans, resume from last defensible checkpoint, surface `CLOCK_EVIDENCE_INCOMPLETE` without treating it as release failure.

**Artifact/owner/tier:** segmented interval ledger (credited/frozen/unknown reason), checkpoint revisions, budget diffs, boot IDs, duplicate-event count; Stage 6 clock/core and packaged Firefox wake verification. `DEFERRED_UNTIL_IMPLEMENTED`.

### P54-02 — Account-unavailable grace versus global outage (U-09, U-10)

**Hypothesis:** The configured default 60-minute grace reserves an affected account's occupied slots while its active budget is frozen; grace accrues only through evidenced Firefox-running and non-global-outage time. Recovery does not reclaim a released slot ahead of older eligible generators.

**Fixture:** 50 fake accounts; account A has 12 occupied generators with known remaining active times and ordinals. All other accounts and a global provider probe are healthy. Advance 35 evidenced minutes with A's protected route unavailable, then 4h offline + 30min independently confirmed global outage + 25 evidenced minutes with A still unavailable.

**Faults:** (a) expired/revoked Persona lease; (b) A route recovers at 59:59 then fails again after verified reauthorization; (c) account rebind mid-grace changes UID/route epoch; (d) true global outage begins mid-grace; (e) browser closes; (f) two concurrent expiry workers; (g) A recovers after its 12 slots have been reassigned; (h) another account independently loses route during the provider-wide outage.

**PASS:** In the base fixture, A reaches **60 evidenced grace minutes** only after the additional 25min; the 4h offline and 30min outage do **not** consume grace or active budget. Its 12 slots are released once, unfinished active time and each stable waiting priority retained. During the first 59:59 healthy-evidence minutes its slots remain occupied. Subsequent verified recovery only requeues A; it cannot evict later admitted incumbents. Rebinding invalidates previous authorization and does not accidentally resume work. Other healthy accounts continue throughout account-specific loss; independent provider-wide outage freezes all dependent budgets. Expiry notifications are coalesced, not multiplied by 12.

**FAIL:** wall-clock 60min cutoff; provider outage causes 50 independent grace expiries; Direct fallback; instant reacquisition of someone else's slot; expired/rebound UID permitted to refresh; duplicate slot release.

**Fallback:** scoped account hold and retained occupancy through evidenced grace; global outage circuit-breaker is independent. A route/session requires fresh verification and new lease before work.

**Artifact/owner/tier:** per-account health provenance, grace interval arithmetic, occupancy-change log, lease/epoch decisions and protected egress denial; Stage 6 account/route guard and Refresher. `DEFERRED_UNTIL_IMPLEMENTED`.

### P54-03 — Durable oldest-eligible queue and READY source precedence (U-09, U-15)

**Hypothesis:** One global persistent queue admits the oldest *currently eligible* generator by immutable waiting ordinal and stable ID tie-breaker, without per-account quotas, priority drift on holds or restart.

**Fixture:** 1,000 fake generators distributed across 50 accounts, shuffled insertion/restart order; duplicate ordinal tie; G1 older but temporarily ineligible due to account hold; G2 healthy/eligible; G3 recovering from slot release with unfinished active budget; G4 sleeping with already-READY update; one generator completes a full active/sleep cycle.

**Faults:** (a) restart after queue index insert but before acknowledgement; (b) two simultaneous admission requests for one freed slot; (c) oldest candidate ineligible or paused; (d) recovered G1 loses slot then becomes healthy; (e) edit/rename/rebind attempts to rewrite admission timestamp; (f) READY source update on sleeping G4; (g) cap changes while slot being granted; (h) IDB transaction abort; (i) tie in eligibility clock; (j) cyclic re-eligibility after completed sleep.

**PASS:** candidates are ordered by stable ordinal then stable ID, and never rely on unstable array/query enumeration. Temporarily ineligible candidates are skipped, not erased, with ordinal retained; G1/G3 regain position when eligible without preempting active work. Fresh cycle eligibility creates a new ordinal only under the accepted policy; ordinary metadata edits, holds and restart do not. G4's READY source update is handled **for G4** before admitting G4 for its next active cycle, without globally blocking G2. No extra account-balancing queue; no duplicate slot claim across concurrent wakes.

**FAIL:** order reassigns on reboot, dynamic last-write timestamps promote an account, permanent head-of-line blocking from ineligible G1, active overbooking, or source-update staging resets sleep budget.

**Fallback:** admission paused if durable ordinal/slot transaction cannot commit; independently eligible generators continue when canonical store is sound.

**Artifact/owner/tier:** order oracle, invariant `unique (generator, active allocation epoch)`, before/after queue snapshots, replay and starvation probes; Stage 6 scheduler/IDB. `DEFERRED_UNTIL_IMPLEMENTED`.

### P54-04 — Capacity inference, hysteresis and non-preemption (U-10)

**Hypothesis:** A configured/operator safety cap and multi-window observed practical capacity constrain **new admission** without pretending list length is a guaranteed count, and a lower cap does not preempt already valid active periods.

**Fixture:** 1,000 eligible generators with homogeneous 24h active/72h sleep and heterogeneous second fixture; observe capacity history with a transient one-window dip, a sustained credible decrease, unknown/stale windows and an operator override. Use the explicit accepted example occupancy=195, former cap=200, defensible new cap=180.

**Faults:** (a) single noisy recent-list observation; (b) sustained lower evidence; (c) feed unavailable for multiple windows; (d) list pagination truncates observations; (e) fewer known slots than occupied; (f) manual override above practical estimate; (g) cap improves after outage; (h) concurrent admissions while new cap arrives.

**PASS:** homogeneous demand planning estimate is **1,000×24/(24+72)=250** active candidates, **not** a promised 250 recent-list slots. An independently defensible capacity decrease to 180 immediately bars new admissions at 195 occupied and never evicts current legitimate active periods. Sustained increases require configured hysteresis; stale/unknown observations retain last defensible cap or warn with a conservative starting cap, never fabricate fresh certainty. Override cannot bypass protected route, release or provider safety conditions. Cap update and slot admission are revision-fenced.

**FAIL:** hard-coded 283/284 slots, treating one scraped page length as exact global capacity, evicting 15 incumbents, admitting on stale optimistic data without warning, cap thrashing or overbooking race.

**Fallback:** conservative admission freeze/limited cap with freshness display; existing safe active budgets continue, and operator can review override separately.

**Artifact/owner/tier:** per-window evidence and estimator version, candidate demand estimate, occupancy and cap before/after, admission-denial reasons, hysteresis trace; Stage 6 capacity estimator and UI. `DEFERRED_UNTIL_IMPLEMENTED`. Exact numerical hysteresis thresholds are implementation configuration to validate, **not** accepted facts inferred here.

### P54-05 — Real effective refresh capability and independent recent-list evidence (U-10; **provider-dependent blocker**)

**Hypothesis:** Refresher dispatches only an explicitly validated permissible provider action with a verifiable meaningful persisted effect; saving successfully is not equivalent to feed admission, rank or continuous presence.

**Prior evidence:** historical Perchance source/export included feed exclusion of repetitive trivial saves; current effective refresh method and practical capacity remain `UNVERIFIED`. The F1 private-first probe is not a refresh-method proof and must not be rerun for this purpose.

**Fixture:** adapter-capability matrix (`SUPPORTED_AND_VERIFIED`, `UNSUPPORTED`, `DRIFTED`, `UNKNOWN`), fake provider actions with independent saved-state readback, and timestamped independent recent-list snapshots: success but absent, observed at rank 43, later absent, paginated/outdated and explicit provider refusal. Simulate no-op/comment-only save returning 200.

**Faults:** (a) no proven action method; (b) saved response with no persisted change; (c) legitimate meaningful persisted update but no feed appearance; (d) feed rank changes between observations; (e) provider schema/eligibility changes; (f) route unhealthy; (g) lost refresh response after remote acceptance; (h) account owner is collaborator-only; (i) list endpoint rate-limited.

**PASS:** (a–b) no routine writes and `REFRESH_UNSUPPORTED`/`HELD_CAPABILITY`; (c) record attempt/result separately, **presence unknown or absent**, not success-by-rank; (d) only timestamped observed rank; (e–i) safe hold/re-observe/backoff and bounded read-only reconciliation. No prohibited no-op/comment spam, no provider-filter bypass, no false guaranteed placement. Provider efficacy acceptance requires a later **single narrow operator-observed permitted test**, not scaled anonymous experiments, after prior source analysis is insufficient.

**FAIL:** calling an accepted save a confirmed visible refresh; trial-and-error repeated trivial saves; silent escalation into source modifications or public listing changes; absent feed treated as deleted generator.

**Fallback:** suspend Refresher *mutating refresh attempts* where capability unverified; keep permitted read-only monitoring/clock behavior as evidence allows; explicit operator notice.

**Artifact/owner/tier:** capability version, source-known safe action, independent persisted-byte/meaningful-effect receipt, feed observation and freshness, suppressed-write ledger; Stage 6 adapter and late operator-led verification only if necessary. `UNVERIFIED` capability; fixture `DEFERRED_UNTIL_IMPLEMENTED`.

### P54-06 — Persistent list absence, backoff and slot release (U-10, U-15)

**Hypothesis:** Repeated absence under otherwise verified healthy conditions is detected without retry storms; generator moves to a bounded suspended/attention state with active time preserved, and queue capacity can recover safely.

**Fixture:** G1 has known active remaining; provider returns repeated missing entries from sufficiently fresh, complete list observations; another G2 is known present, G3 has stale/paginated-incomplete evidence. Fault injector supports rate limiting and delayed replies.

**Faults:** (a) one absent snapshot; (b) repeated genuinely comparable absent snapshots; (c) list cannot prove absence due to pagination; (d) refresh not supported; (e) 429/backoff; (f) duplicate alarm during backoff; (g) observed presence later resumes; (h) suspension disposition races with cap admission.

**PASS:** a single absence doesn't prove deletion, trigger an unsafe source rewrite or automatically end a valid active window. Sustained absence follows bounded policy: reobserve → only permitted effective attempt if independently qualified → suspend/notify when ineffective, preserve active remaining and release occupied slot on confirmed disposition. G3 is **unknown**, not absent. A resumed G1 rejoins by retained priority without displacing incumbents; backoff persists across restart.

**FAIL:** no-op infinite retries, no per-target retry budget, unreliable pagination treated as definitive, reset active budget, or two simultaneous active allocations.

**Fallback:** `VISIBILITY_UNVERIFIED` / `VISIBILITY_SUSPENDED` scoped hold, per-generator notice, no destructive assumption.

**Artifact/owner/tier:** observation completeness/freshness, attempt counts, exponential/bounded backoff trace, slot release log, queue reentry; Stage 6 observer/scheduler. `DEFERRED_UNTIL_IMPLEMENTED`.

### P54-07 — Single coalescing alarm, startup repair and no replay burst (U-09, U-15)

**Hypothesis:** Durable due records and one synchronous wake handler reconstruct scheduling after suspension/restart; Firefox alarms are hints, not the durable work ledger.

**Prior evidence:** MDN Firefox `alarms` explicitly says alarms do **not** persist across browser sessions: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/alarms . MDN event-page guidance requires persistently registered listeners: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts . Donor's late `alarms.onAlarm` issue remains P51-01.

**Fixture:** 1,000 pending indexed due records with 250 simultaneously past due after ten hours of browser closure, 50 accounts, bounded provider rate, one scheduled Refresher alarm, synthetic Firefox boot and two near-simultaneous wake events.

**Faults:** (a) terminate browser (alarms cleared), relaunch; (b) event-page suspension; (c) duplicate/stale alarm delivery; (d) alarm created but its acknowledgement lost; (e) old alarm fires after due record moved; (f) IDB quota during rehydrate; (g) orphaned cancelled alarms; (h) provider outage during backlog drain.

**PASS:** on boot read canonical queue and recreate/verify the single logical alarm; identify overdue candidates without crediting missing time; coalesce redundant wake sources under one fenced scheduler turn. No 250-tab/job burst, no timer-per-generator, bounded dispatch and native route limits. Alarm callback registration is synchronous. A failed IDB open yields zero mutating effects, not synthetic empty-queue success.

**FAIL:** assumes old alarms survive browser restart, uses in-memory deadlines as authority, replays 250 saves, duplicates dispatch or registers wake callback too late.

**Fallback:** global PCMS mutation hold if canonical journal unavailable; otherwise incremental bounded admission with observable backlog age and next wake.

**Artifact/owner/tier:** alarm count per boot, durable due index, wake/coalescing trace, in-flight/tab high-water mark, no-effect ledger; Stage 6 runtime/scheduler and packaged Firefox. `DEFERRED_UNTIL_IMPLEMENTED`.

### P54-08 — Corroborated provider-wide outage versus scoped account failures (U-09, U-10)

**Hypothesis:** A provider-wide outage requires independent corroboration and cannot be inferred from one Persona's protected-route failure or synchronized local request errors; account faults do not globally stall healthy accounts.

**Fixture:** 50 accounts in distinct fake route states; independent global health witnesses and per-account read probes; one account A loses route; separately simulate common outage, partial rate limit, DNS/local forwarder failure, and all results arriving out of order.

**Faults:** (a) A route goes down; (b) 15 accounts share one broken local dependency; (c) Perchance unavailable across independent healthy probes; (d) global health recovered but A remains down; (e) service probe stale; (f) apparent timeouts from one egress region; (g) operator Pauses one account; (h) intermittent 429.

**PASS:** classify independent route/session loss as scoped; confirmed common outage freezes relevant provider-dependent active/sleep budgets without advancing any affected account grace; recovery clears only corroborated global state, not manual Pause/account-specific safety holds. Do not infer global outage from a single local bottleneck or 429. Continue healthy scopes subject to shared rate/backpressure limits; all classifications carry witness provenance and uncertainty.

**FAIL:** global Pause triggered by one broken route, mass slot release during true provider outage, global recovery lifting local route hold, or nonexistent healthy evidence manufactured to advance clocks.

**Fallback:** mark health `UNKNOWN` and conservatively withhold disputed interval credit; bounded probes and circuit-breaker, independent local route checks.

**Artifact/owner/tier:** evidence-witness matrix, outage/recovery classifier transitions, per-account suppression and independent provider observations; Stage 6 health classifier/route adapter. `DEFERRED_UNTIL_IMPLEMENTED`.

### P54-09 — 50-account/1,000-generator resource, quota and backpressure stress (U-15)

**Hypothesis:** A single controller maintains bounded queue/polling/tab/network/storage demand and scoped progress under load without generating per-generator alarms or losing durable intent.

**Fixture:** 50 accounts, 1,000+ generators, representative mix of source blobs, deep histories, recent-list observations and manual approval records; slow provider and GitHub, quota-exceeded IndexedDB, 429, offline/online oscillation, two UI views, fresh-controller restart. Benchmark *measured* upper bounds on actual target Firefox build rather than claiming synthetic wall-time meets production SLO.

**Faults:** (a) 1,000 due events at once; (b) one slow account monopolizes connection slots; (c) provider 429 with `Retry-After`; (d) IndexedDB write rejection/quota; (e) large source asset snapshot; (f) read-only list polling slower than configured cadence; (g) 50 accounts lose routing during global outage; (h) UI opens 25-row paging while 1,000 records change; (i) browser suspend/restart; (j) repeated transient failure indefinitely; (k) one package/readback exceeds memory budget.

**PASS:** one shared ~10-minute recent-list observation with coalescing; adaptive statistics queue is bounded and not 1,000 requests every ten minutes; per-account and global work caps prevent one account starving everyone else. Every mutating dispatch has durable journal admission, capped concurrency and durable exponential/bounded backoff; no burst on recovery. Large immutable assets and raw observations obey explicit bounded retention/pins; quota failure holds new mutations but preserves previous-good and diagnostics. Observable high-water metrics include process RSS/heap where supported, IDB bytes/quota pressure, queue depth+age, open tabs, in-flight requests, rate-limited/dropped observations, skipped refresh and effect attempts. Actual numeric resource acceptance thresholds must be derived from Stage 6 measurements on operator-relevant Firefox/host workload and recorded before live rollout.

**FAIL:** unbounded heap/IndexedDB growth, 1,000 repeating timers, polling explosion, remote mutation after failed journal write, or starvation of safe accounts.

**Fallback:** backpressure, scoped circuit breakers, retention compaction that never drops unresolved operation/approval/source recovery pins; explicit `CAPACITY_DEGRADED` vs `CORE_STORAGE_UNAVAILABLE`.

**Artifact/owner/tier:** deterministic request/dispatch count and ordering, high-water traces, before/after quota snapshots, memory/storage/tabs measurements, immutable-reference integrity; Stage 6 workload harness + Firefox resource audit. `DEFERRED_UNTIL_IMPLEMENTED`; thresholds `MEASUREMENT_PENDING`.

### P54-10 — View statistics, resets, stale observations and shared request quota (U-15)

**Hypothesis:** Statistics represent timestamped counter observations faithfully, including decreases/corrections, and share one rate budget with Refresher observations rather than polling every generator constantly.

**Fixture:** G1 observed views 1,200→1,207→900 (provider correction/reset), G2 no new observation, G3 pending 429, G4 duplicate timestamp with conflicting source, 1,000 generators with sparse demand, UI filtering/search refresh.

**Faults:** (a) counter regression; (b) duplicate and out-of-order response; (c) missing units/source; (d) rate budget saturated by read-only list; (e) slow statistics results arriving after owner/generator rebind; (f) stale UI replaces fresh observed metric; (g) configurable raw retention prunes old samples.

**PASS:** keep original absolute observations (900 is not converted into negative views or fabricated positive growth); tag interval deltas as correction/unknown as appropriate. Stale data visibly aged, source/binding-fenced and never presented as current. Request coalescing/de-duplication/bounded per-generator adaptive polling enforced. Aggregates do not manufacture view counts across resets; retention never removes records required by unresolved actions/audit. Metrics failures do not authorize release or overwrite source.

**FAIL:** clamping 900→1,207 as if current, infinite statistics retries, or 1,000-per-tick polling independent of capacity.

**Fallback:** mark metric unknown/corrected, defer lower-priority polling and preserve historical observations within bounded policy.

**Artifact/owner/tier:** raw time series and correction tags, request budgets, freshness/revision mismatch decisions, aggregate reproducibility; Stage 6 statistics observer/UI. `DEFERRED_UNTIL_IMPLEMENTED`.

### P54-11 — Orthogonal Pauses, holds, review unlisting and account recovery (U-09, U-10)

**Hypothesis:** Global/account/generator manual Pause and dependency recovery holds remain independent durable dimensions; any applicable block freezes budget and scheduled writes, and removal of one block never implicitly removes another.

**Fixture:** G1 active with 10h remaining; G2 sleeping with **22h sleep remaining** when a READY source update stages; a global Pause and an account route hold overlap; existing published previous-good remains known. Inject a clean successful publication and a failed rollback/review outcome separately.

**Faults:** (a) operator global Pause during refresh dispatch admission; (b) route recovers while manual account Pause remains; (c) G2 is unlisted for staging and Firefox closes/restarts; (d) confirmed publish versus failed candidate; (e) overlapping generator Pause and source review hold; (f) recovery clears dependency state while approved source has changed; (g) scheduled alarm races unlisting; (h) operator resumes without route authorization.

**PASS:** no prohibited effect after a committed Pause and final effect-boundary recheck; already-dispatched uncertain effects are reconciled, not treated as cancelled. G2's 22h sleep is unchanged through unlisting/review and resumes only on verified safe republication; if candidate fails, it remains unlisted/held. Explicit Pause remains after route or provider recovery. On a recovered generator with zero sleep remaining, enqueue rather than invent a free active slot. Pauses may still allow approved local backups and read-only monitoring. All changes are revision-fenced.

**FAIL:** automatic Resume upon healthy route, sleeping time consumed during review, update staged while unsafe listed state, older approval reused, or a stale alarm triggers an effect despite Pause.

**Fallback:** retain independent holds/Pauses with exact reason codes and original queue ordinal; operator action only where accepted policy truly requires it.

**Artifact/owner/tier:** per-scope orthogonal state matrix, clock/slot transitions, unlisting and publication evidence, effect admission log, UI attention receipts; Stage 6 scheduler/release/UX integration. `DEFERRED_UNTIL_IMPLEMENTED`.

### Stage 5.4 execution dependency and closure

| Gate | Must be established before | Minimum cases |
|---|---|---|
| Static event admission + canonical journal | Any background-scheduled provider write | P51-01, P51-04, P51-07, P54-01, P54-07 |
| Valid lease/owner/route + health classification | Any account-scoped Refresher action | P51-02, P52-01, P54-02, P54-08, P54-11 |
| Global scheduler correctness | Automatic slot scheduling for the 50+/1,000+ fleet | P54-03, P54-04, P54-07, P54-09 |
| Provider capability and presence distinction | **Enabling mutating Refresher** | P54-05, P54-06 (plus a narrow operator-led real efficacy check **only if essential**) |
| Adaptive monitoring/statistics correctness | UI claims of fresh list/rank/views | P54-05, P54-06, P54-09, P54-10 |

**Stop conditions:** Do not enable mutating Refresher without proven legitimate refresh behavior; do not use approximate 283/284 recent slots as an availability guarantee; do not credit unobserved intervals or consume grace during browser closure/global outage; do not force-evict active periods after capacity reduction; do not instantiate a second scheduler. Stage 5.4 completion is verification **design**, not feature acceptance.

**Documentation:** https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/alarms ; https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/alarms/create ; https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Background_scripts ; https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/local .
## 8. Stage 5.5 — Encrypted integrated backup, phased restore, Downloads evidence and degraded diagnostics (2026-10-12)

**Controlling evidence and decisions:** Stage 1 REQ-X01–X07; Stage 2 §6.1–6.7 (Q78–Q98, Q104); Stage 3 Minimal Architecture §8; Stage 3 Working Decision Register Q147–Q154; Stage 4 UI/UX §6.5–6.6 and UX-08; Stage 5 Verification Plan §3/§4/T4. Historical donor `Neb963/persona-router` pinned to `9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf` and files in the Stage 5 evidence register. All P55 tests are **NOT RUN / DEFERRED_UNTIL_IMPLEMENTED**. Donor regression source was inspected but not executed in this Stage 5 increment. No real archive, OS keyring or restore was accessed.

**Minimal fake-system oracle:** a logical PCMS IndexedDB fixture, separate PersonaMonkey `storage.local` fixture, fake Firefox `contextualIdentities` and cookie store, durable *external-to-replaced-store* restore guard, fake downloads manager with recorded download IDs, deterministic virtual OS vault (locked/unlocked/missing/wrong key), deterministic crypto fault hooks (using dummy plaintext only), synthetic GitHub/Perchance remote-state observers (read-only), two distinct Firefox-profile/controller identities, a synthetic baseline/source snapshot graph, and an independent read-only diagnostics entrypoint. Track five independent assertions: *internal encrypted-archive verification*, *browser download completion/existence*, *optional independently re-read on-disk byte verification*, *restore dependency-group commit/hold status*, and *mutation authority*. Never equate the tiers.

### P55-01 — One authenticated archive, complete secret coverage and header integrity (U-11, U-12; critical)

**Hypothesis:** A single integrated export encrypts every sensitive field, including all PCMS source and account evidence, regardless of the donor's `backupIsSensitive()` predicate. Every decision-bearing header field is authenticated, and neither tampering nor unsupported schema leads to apply.

**Fixture:** synthetic PCMS state with secret-bearing PJS/HTML/binary `src/`, account/binding metadata, approvals, operation intent and immutable snapshots; supported donor portable payload with dummy cookies/route credentials; a second donor payload containing no cookies/GM values/route credentials (donor would allow plaintext). Generate versioned outer metadata, content inventory, manifest, source hashes and dummy passphrase. Donor reusable tests: `backup-package.test.mjs` and `backup-crypto.js`.

**Faults:** (a) empty password, lost vault key, or mistaken `sensitive:false`; (b) wrong password; (c) bit-flip/truncated ciphertext/GCM tag; (d) altered cleartext header provenance, inventory, format/security schema, restore mode or creation fields with otherwise unchanged ciphertext; (e) substituted embedded donor payload; (f) malformed nonce/salt/iteration claims; (g) attempted plaintext/unauthenticated partial export; (h) binary asset and Unicode text round-trip; (i) unrecognized future format or required component.

**PASS:** exactly one operator-facing encrypted file; only format/required crypto parameters and genuinely nonsensitive metadata are visible before decryption. No account identifiers, source text, cookies, tokens or portable donor sensitive fields in plaintext. All restore-decision metadata is cryptographically bound to payload (AES-GCM AAD **or** identical inner authenticated metadata with strict comparison). Authenticated decrypt + size/schema/manifest/hash checks precede any persistent mutation. Wrong password/tampering/unsupported required format returns a bounded non-oracle error and **zero** restore writes. Donor payload is serialized/validated through donor contract; retain donor-internal encryption of its sensitive portable section as specified in Stage 1 Q28, while outer integrated encryption protects **all** PCMS and donor content. Integrated PCMS policy requires encryption even for a nonsensitive-to-donor payload. The strong portable recovery passphrase is not stored in ordinary Firefox extension storage. Donor legacy plaintext backups, if independently supported for a manual donor-only import, cannot be implicitly upgraded to trusted integrated PCMS snapshots.

**FAIL:** sensitive PCMS content in JSON outer header; donor's permissive plaintext branch reused; unauthenticated header controls restore; unknown schema silently normalized; incorrect binary byte hashes; processing hostile input before size/depth bounds.

**Fallback:** reject/hold the archive, preserve original file and destination state, permit inspection only of safe format-level errors. **Artifact/owner/tier:** synthetic archive bytes inspected for dummy sentinel leakage, independently computed hashes, tamper vectors, bounded error codes, mutation-counter zero; Stage 6 backup/crypto, security review and packaged Firefox. `DEFERRED_UNTIL_IMPLEMENTED`.

### P55-02 — Consistent logical cut under concurrent writes and unresolved external effects (U-09, U-12, U-15)

**Hypothesis:** Backup captures one dependency-consistent local logical cut using a brief admission fence, immutable pins and bounded source revision checks without holding IndexedDB transactions open over browser cookies, downloads or encryption. Remote effects remain durable as pending/uncertain facts.

**Fixture:** synthetic baseline P, candidate F and pending `DISPATCH_POSSIBLE` Perchance write; ten independent accounts continue eligible work. Donor state revision, PCMS IDB checkpoint revision, indexed immutable snapshot references, controlled cookie collection and source GC. Inject a 1,000-generator manifest with realistic variable binary asset sizes.

**Faults:** (a) edit arrives during capture; (b) donor storage revision changes during cookie enumeration; (c) snapshot GC tries to remove a pinned P while encryption runs; (d) browser crashes after fence acquisition, before pin release, during authenticated encrypt, and after validation/before download; (e) local quota/IDB abort; (f) provider response lost during capture; (g) one donor cookie enumeration permission fails; (h) two daily/manual exports overlap.

**PASS:** either publish a coherent, complete validated cut with precise timestamp, revisions and included effect-intent states, or fail visibly without a successful-backup receipt. No leaked long-lived mutation fence/pins across crash or retry, no silently missing referenced snapshots, no forced completion/replay of pending Perchance/GitHub work; no claim of global atomicity across browser stores/provider. Independently unaffected operations resume under the existing single controller. Resource budgets measured with representative fixtures, not assumed.

**FAIL:** mixed incompatible revisions marked recoverable; pending remote writes reported completed; source GC destroys in-use referenced checkpoint; aborted export counts toward 14 valid backups; unbounded in-memory allocation.

**Fallback:** bounded retry from new cut; if consistency or quota cannot be guaranteed, fail the automatic archive with actionable reason, preserve previous good backup and independent diagnostic path. **Artifact/owner/tier:** cut revision tuple, included operation IDs/stages, GC pin table, memory peaks, simulated store fault trace and post-crash readback; Stage 6 storage/backup and fleet performance. `DEFERRED_UNTIL_IMPLEMENTED`.

### P55-03 — KDE vault key availability and portable disaster recovery (U-11; critical)

**Hypothesis:** Unattended encryption is possible only when a narrowly scoped OS-vault helper safely retrieves the operator's strong portable recovery passphrase. The locked/unavailable vault never triggers a plaintext or silently weaker path. Cross-profile restore works with the independently preserved operator passphrase without relying on the original vault.

**Fixture:** synthetic `org.freedesktop.secrets`-compatible vault and native messaging host with exact allowlisted `get`/`set` scope, fixed Gecko ID, no route-control operations, redacted process logs and connection failure injection; use a dummy passphrase. Include a new-profile fixture with **no** matching vault item. Neither the existing routing daemon nor donor `native_host.py` is assumed to provide this service.

**Faults:** (a) collection/item locked; (b) service missing or KWallet Secret Service support disabled; (c) prompt denied or timeout; (d) host missing/unregistered/wrong allowed extension; (e) stale/wrong key; (f) host emits malicious extra fields/oversized messages; (g) Firefox upgrade/first run and crash; (h) a restored archive has no vault but operator supplies the passphrase; (i) native-helper error contains dummy secret.

**PASS:** locked/missing ⇒ unattended export `SUSPENDED_KEY_UNAVAILABLE`, no file, no automatic unlock bypass, no ordinary-extension-key persistence and no secret in logs/diagnostics. Unlock/healthy host ⇒ authenticated archive with declared strength, `get` only in authorized backup flow, no routing/native authority expansion. Fresh-profile manual password ⇒ archive inspect possible without original vault. If background unlock is infeasible on the target Fedora KDE, manual backup remains supported and daily automatic backup visibly suspended; this is an explicit limitation, **not** a reason to choose plaintext fallback.

**FAIL:** vault failure silently encrypts under default/hardcoded/new unknown key, plaintext output, password in `storage.local`, broad filesystem access or native routing API exposed, misreport of auto-backup success, inability to recover with the independently known passphrase.

**Fallback:** manual unlock/passphrase entry, prompt for protected vault setup; no unattended success claim. **Artifact/owner/tier:** synthetic host protocol tests now designed; then controlled operator-local Fedora KDE locked/unlocked capability check and packaged Firefox extension↔host handshake (late, with separate authorization). Redact command-line/env/logs. `UNVERIFIED` local platform; Stage 6 native-helper/security owner.

### P55-04 — Daily backup, Pause, one catch-up and age/retention boundary (U-11, U-13)

**Hypothesis:** One durable daily schedule produces at most one catch-up encrypted export after a period of Firefox closure and never treats manual/global Pause as a reason to disable safe local protection by default. Only **successfully verified automatic** archives count toward the default retention 14.

**Fixture:** one logical backup scheduler, manual and automatic archive ledgers, 16 days of synthetic runtime and Firefox closure, two manual exports, one last-good protected archive, locked vault and quota/failed downloads. Stable logical backup IDs versus changing actual download IDs.

**Faults:** (a) five closed days, restart then two alarms; (b) global Pause; (c) vault locked on catch-up; (d) incomplete archive validation; (e) download interrupted; (f) later unlocking; (g) duplicate daily trigger/restart at minute boundary; (h) arbitrary system clock jump; (i) backup held due to inconsistent snapshot cut.

**PASS:** at most one catch-up attempt for a missed period after safe startup, no five-file burst; Pause does not suppress ordinary local backup; failed/unverified archives never counted as successful. Restore last-good and manual archives remain protected. Duplicates are fenced by logical schedule/run identity. Locked vault defers with visible status; no unsafe scheduling retry storm.

**FAIL:** five catch-up exports, backup on stale key, deleting last good to meet nominal count, counting download start as recovered backup, Pause disabling independently safe diagnostics.

**Fallback:** postpone with explicit state, preserve previous valid archive, allow operator-triggered manual export. **Artifact/owner/tier:** logical schedule receipts, startup/wake timelines, archives grouped by verified tier, cleanup exclusions; Stage 6 scheduler/backup. `DEFERRED_UNTIL_IMPLEMENTED`.

### P55-05 — Download lifecycle and three distinct evidence tiers (U-13; critical)

**Hypothesis:** Firefox `downloads.download()` ID is a *started* record, not proof of completed or recoverable bytes; completion, `exists`/filename/size and independently imported/re-read exact bytes are distinct evidence tiers.

**Fixture:** emulator of `downloads.download`, `onChanged`, `search`, `DownloadItem` `state`, `exists`, `fileSize`, `filename`, and optional operator-provided file re-import or specifically authorized narrow native disk checker. Export target `Downloads/<backup-folder>/<unique>.encrypted` with traversal-resistant relative name. Drive `uniquify` and changed actual filenames.

**Faults:** (a) ID issued then interruption; (b) browser shutdown before `onChanged`; (c) completed event then file moved/deleted or metadata stale; (d) file size mismatched; (e) `Save As` chosen outside expected directory; (f) name collision modifies actual filename; (g) `downloads.search` unavailable/history erased; (h) imported file is altered vs expected; (i) blob URL revoked before completion; (j) unsupported file-read permissions; (k) readback hash matches after genuinely independent import.

**PASS:** Tier 1 = in-memory authenticated archive roundtrip/manifest integrity, explicitly **not disk backup**; Tier 2 = `state:complete` + fresh `downloads.search` matching tracked ID/actual filename/expected fileSize/`exists:true`, labeled *browser-reported*, not byte-verified; Tier 3 = independently read final on-disk bytes, exact expected hash and size, labeled *byte-verified*. Missing optional Tier 3 never silently upgrades Tier 2. Track actual unique filename and ID rather than guessed path; never request blanket local file access just to claim Tier 3. Invalid/changed bytes cannot be labeled recoverable Tier 3. All callbacks check run/boot revision before applying final UI status.

**FAIL:** `downloadId` ⇒ `SUCCESS`; browser metadata ⇒ cryptographic filesystem verification; silent lost-file success; mismatch accepted; arbitrary absolute/traversal save paths.

**Fallback:** record actual highest tier and reason; offer safe encrypted-file import for stronger verification. **Artifact/owner/tier:** synthetic downloads event history, expected/observed hash/size, actual path sanitized to relative folder, race traces, packaged Firefox version and permissions. `DEFERRED_UNTIL_IMPLEMENTED`.

### P55-06 — Tracked-only retention and destructive deletion safety (U-13)

**Hypothesis:** PCMS removes only verified tracked **automatic** download IDs selected by retention policy; absent history, changed/moved files or ambiguous ownership stop deletion. `downloads.erase` is never called before a necessary `removeFile` operation.

**Fixture:** at least 20 synthetic completed downloads: 15 successful automatic, 2 manual, 1 previous last-good, 1 other extension's same filename, 1 old untracked user file, 1 interrupted, and 1 renamed/moved tracked file. Track provenance (`runId`, kind, download ID, actual filename, completion/integrity tier, deletion decision) in PCMS durable state.

**Faults:** (a) history erased for a once-tracked download; (b) file changed/moved, ID points to unexpected path or changed size; (c) duplicate filename; (d) permission absent/removeFile rejects; (e) `exists:false`; (f) intermittent `downloads.search` failure; (g) crash after removeFile but before persisted cleanup receipt; (h) retries after success; (i) deleting last known-good would breach 14 cap.

**PASS:** only old excess confidently tracked automatic archive IDs with current metadata matching the ownership record are candidates; manual, other-extension, untracked, last-good and ambiguous files survive. Every deletion rechecks current download metadata and retention dependencies, applies `downloads.removeFile(id)` once logically, then optionally `erase` **afterwards**; a crash recovers by reobserving the ID/existence without deleting a different file. Missing permission/history ⇒ warn and report retention incomplete; never indiscriminately traverse Downloads or delete by filename pattern.

**FAIL:** filename glob deletion, user/manual file removed, corrupted or unverified archive treated as a safe retention substitute, stale ID deletes unexpected target, history-only erase reported as disk cleanup.

**Fallback:** no deletion of doubtful items; actionable manual cleanup notice that does not imply automated cleanup succeeded. **Artifact/owner/tier:** retained/deleted ID journal, current-vs-recorded DownloadItem comparison, external-file untouched assertion, status warning; Stage 6 backup/Downloads. `DEFERRED_UNTIL_IMPLEMENTED`.

### P55-07 — Authenticated preview and mandatory pre-restore checkpoint (U-12; critical)

**Hypothesis:** Every destructive merge/replace requires completed authenticated/bounded preview, reviewed exact destination plan, a *recoverable and independently verified* pre-restore checkpoint, and a durable mutation guard written outside replaceable PCMS state **before** changing donor, cookies or PCMS entities.

**Fixture:** same-profile destination containing existing Personas, PCMS pending release and immutable good source; incoming integrated archive with conflicting Persona name/UID/route, unknown schema component and explicitly excluded WireGuard/native secret; a replace variant and merge-by-default variant. Generate plan hash/revision and guard/backup checkpoint receipts.

**Faults:** (a) wrong password/corrupt archive; (b) oversize/decompression-bomb/huge entity count; (c) old/new required schema incompatibility; (d) backup or checkpoint integrity error; (e) disk quota/error writing out-of-store guard; (f) destination changes after preview; (g) operator changes merge/replace or mapping without reapproval; (h) crash immediately before first donor mutation; (i) unrelated background mutation attempts while restore hold pending.

**PASS:** all faulty/unsigned plans and failed checkpoints result in **zero destructive writes**; store-outside-replacement guard is durably present and read back before any apply. Preview discloses exact per-group exclusions, collision/mapping, Direct/protected security changes and affected scopes. Plan approval binds archive fingerprint, destination revision, mode, mapping, external guard epoch and exclusions. In-process locks cannot stand in for durable guard. While restore pending, targeted writers fail closed; unaffected strictly independent scopes can continue only if no global integrity/authority dependency is uncertain.

**FAIL:** warning checkbox replaces pre-restore checkpoint; checkpoint generated inside replaced DB only; files mutated before guard; stale review applies to new destination; unknown archive code executes; silently recreates native WireGuard material.

**Fallback:** keep original destination operational where safe, show checkpoint/plan blocker, allow safe diagnostic/export/manual recovery. **Artifact/owner/tier:** serialized reviewed plan, checkpoint hash and independent readback, guard store status and destructive mutation count; Stage 6 restore/journal. `DEFERRED_UNTIL_IMPLEMENTED`.

### P55-08 — Interrupted staged restore and donor cookie/container partial failure (U-12; critical)

**Hypothesis:** A staged restore records intent, per-step durable receipts and newly produced container IDs; after termination at every step, re-observation prevents duplicate container creation or cookie/source replay. Unfinished dependencies remain held rather than being rolled back through fictitious cross-store atomicity.

**Fixture:** three independent donor Persona groups with local-state import, unique UID remap, contextual-identity creation, cookie import and corresponding PCMS binding/operation group; one unrelated healthy generator. Pre-restore checkpoint verified. Model each donor/container/cookie/PCMS write as a separate fault boundary, with one cookie set failure and one captured uncertain remote operation.

**Faults:** process kill before/after each journal write, native/donor import, container create accepted-but-response-lost, cookie write accepted-but-response-lost, PCMS group persist, receipt commit, guard update, readback, and scope release; browser restart with new tab/container IDs; cookie partial success; quota and schema mismatch at resume.

**PASS:** each stage either resumes from a reliably persisted *observed* result or stops safely for review. Exactly one logically mapped Persona/container per intended import; no blind duplicate container create; partial cookie errors attributed to the exact Persona and block session-dependent work, not silently marked complete. Before verified group reconciliation, no route-dependent/Perchance/GitHub scheduled writes for that group. Successful independent groups can become eligible **only** after their own checks, and persistent manual Pauses stay intact. Unsafe rollback is not automatically attempted, and restored `DISPATCH_POSSIBLE` intents are read-only reconciled. Out-of-store guard survives replacing PCMS DB and crash/restart.

**FAIL:** group marked complete before cookie failures recorded; duplicate container; orphaned PCMS binding to wrong UID; all remote operations replayed after restore; healthy unrelated group globally blocked without dependency; stolen active-controller status.

**Fallback:** `RESTORE_PARTIAL_HELD` + exact last confirmed step, read-only inspect/reconcile options, controlled checkpoint recovery when genuinely safe; do not promise cross-store rollback. **Artifact/owner/tier:** fault-cutpoint matrix, contextualIdentity create call counts, UID maps, cookie partial list redacted to counts/status, durable group receipts, route mutation denial. Stage 6 restore/Persona adapter. `DEFERRED_UNTIL_IMPLEMENTED`.

### P55-09 — UID collisions, portable exclusions and imported privilege refusal (U-12, U-16)

**Hypothesis:** Donor import's authoritative UID/container remap drives all dependent PCMS references, and restored settings cannot silently import Integration API trust, unsafe Direct fallback, route weakening or unportable native session authority.

**Fixture:** donor backup with colliding Persona UID, varying Firefox `cookieStoreId`, same-name ambiguity, one protected route unavailable, a requested Direct assignment, trusted sender policy and previously approved release; synthetic PCMS account↔generator references, paused Refresher, queue ordinal, snapshot index and pre-existing unrelated destination Persona. Donor `backup-import.test.mjs` covers partial precursor behavior, not combined integration.

**Faults:** (a) merge collision; (b) replace/import old schema; (c) duplicate UID mapping to two accounts; (d) partial native routing availability; (e) imported unsafe permission/route trust; (f) historical approval; (g) a reverted donor container rotation; (h) stale cookies imply logged-in state but provider owner readback disagrees.

**PASS:** stable logical IDs remain internally consistent; every affected account, generator, schedule, release and historical operation maps via donor `personaUidRemaps`/actual container result, not guessed name/id. Duplicate/incomplete mapping blocks affected scope; unrelated destination objects preserved on merge; route changes require independent current authorization/security review. Imported Integration trusted-extension IDs are not activated, protected routes Block until verified, cookies require actual authenticated owner/session evidence; former approval remains historical. Correct old source/archived pending operations do not authorize new remote work.

**FAIL:** two accounts controlling one mapped Persona, silent Direct downgrade, imported trusted-extension policy, assumed owner session from cookie presence, approval automatically re-used, UID overwritten from stale profileId.

**Fallback:** affected bindings held; manual mapping/security review and fresh owner/route verification. **Artifact/owner/tier:** donor remap receipt, before/after account binding graph, protected route policy, security delta, old-approval not-actionable state; Stage 6 donor adapter/restore authorization. `DEFERRED_UNTIL_IMPLEMENTED`.

### P55-10 — Fresh profile remains an inactive controller until explicit activation (U-16; UX-08; critical)

**Hypothesis:** A fresh-profile restore imports recoverable history/state but never acquires remote mutation authority by virtue of archive validity, background startup or imported approval. The previous controller's inactivity is an explicit operator confirmation, *not* a distributed guarantee.

**Fixture:** profile OLD and profile NEW share restored account/generator source/budget/approval metadata. OLD may still be active. NEW completes donor remap but has missing native WireGuard secrets and unverified remote ownership. A durable boot guard remains set. Simulate two simultaneous Firefox processes, a PCMS dashboard opened and closed, and a new alarm.

**Faults:** (a) OLD still runs; (b) unverified OLD inactivity; (c) NEW route/service down; (d) container ID remapped but session wrong; (e) silent alarm or startup triggers scheduled work; (f) new browser restart during approval; (g) operator confirms OLD stopped then presses Activate before all dependencies healthy; (h) independently healthy subset; (i) old/restored pending GitHub/Perchance operation unknown.

**PASS:** NEW is **read-only/non-mutating** until prior controller confirmed inactive by operator, explicit activation accepted and dependency-specific protected-route/owner/session/source checks succeed. A healthy verified scope may activate according to accepted scoped policy, but no stale approval, old pending job, missing native config or imported cookie bypasses it. NEW displays former-controller hazard accurately; it cannot claim to enforce cross-profile mutual exclusion. OLD/NEW double-run without confirmation is a recognized unresolved operational hazard, not simulated leader-election safety.

**FAIL:** automatic activation after import/restart, old controller ambiguity ignored, archived timers dispatch, blanket Direct fallback, all scopes silently marked healthy by archive age, fictitious promise of strong single-writer lock.

**Fallback:** persistent `RESTORED_CONTROLLER_INACTIVE` + scoped holds/read-only monitoring; explicit manual old-controller shutdown/confirmation and fresh authorized activation. **Artifact/owner/tier:** two-profile activation gate log, active mutation attempts (zero before activation), mapping/source/route receipts, operator checklist; Stage 6 packaged Firefox plus late operator confirmation. `DEFERRED_UNTIL_IMPLEMENTED`.

### P55-11 — Core-independent, strictly allowlisted diagnostics and malformed-record resistance (U-14; UX-08; critical)

**Hypothesis:** A minimal emergency exporter remains available without initializing PCMS Core, scheduler, PersonaMonkey guarded execution or any native keyring/API mutator; it emits only allowlisted safe data, labels omitted/corrupt sections and cannot leak raw private/source material.

**Fixture:** inject Core boot throwing before dependency setup; IDB corrupt/unavailable/version-unknown; valid minimal independent safety status record; giant nested/unknown schema, malicious user notes and error strings containing dummy credentials, chat session ID, URL with query, bearer token, IP/proxy endpoint, Persona name and PJS secret text. Empty/no-data variant and browser-storage quota faults. Inspect resulting diagnostic ZIP and Markdown acceptance fallback in packaged fixture.

**Faults:** (a) Core import/initialize crash; (b) normal UI unavailable; (c) corrupt IDB and locked vault; (d) malicious free-text field; (e) unknown nested entity; (f) repeated exports during failure; (g) missing downloads permission; (h) attempted call from emergency export into scheduler/route/native helper; (i) oversized stored event; (j) stale/sensitive hashes and identifiers mistaken for safe fields.

**PASS:** extension menu/Settings/failure-context entry affordances reach independent read-only diagnostic view where possible even when Core fails. Export contains only reviewed, bounded allowlisted build version, safe operation/correlation IDs, status/error enums, safe stages/counts/timestamps and unambiguous `section_unavailable` notices. No raw source/asset bytes, cookies, session/chat IDs, arbitrary URL, secret, route endpoint, operator-entered free text, or unreviewed ID graph. No native messaging/OS-vault unlock/provider/browser mutations, and no second controller. Negative sentinel scan plus schema-shape validator finds **zero** secret fields. If the exporter itself cannot access safe records, it outputs the minimal error without reading sensitive backup.

**FAIL:** raw donor `buildDiagnosticsBundle()` exported unmodified (it includes profile/container and route host/port metadata), regex-only redaction of raw dumps, startup of mutating Core to export, raw exception stack/payload leak, opaque failure with no missing-section notice.

**Fallback:** safe minimal error and human-readable Markdown instructions; diagnostics artifact is explicitly **shareable/redacted**, unlike sensitive encrypted backup. **Artifact/owner/tier:** negative-secret corpus with dummy sentinels, ZIP schema verifier, fake prohibited API call counters, Core-failure trace, packaged Firefox entrypoint tests; Stage 6 emergency diagnostics/security. `DEFERRED_UNTIL_IMPLEMENTED`.

### P55-12 — Archive/restore bounds, unsupported features and honest disaster-recovery quality (U-11–U-16)

**Hypothesis:** PCMS can substantiate its backup and restore quality at representative fleet size, preserving honest unsupported/excluded feature reporting without requiring every configured Persona to be immediately functional.

**Fixture:** representative synthetic 50-account/1,000-generator snapshot with variable source/asset sizes, 14 retained archive metadata entries, bounded journal, mixed versions and 1–3 deliberately damaged/unsupported donor components. Compare same-profile merge, explicit replacement and fresh-profile preview without real provider calls.

**Faults:** (a) exceptionally large source asset/decompressed size; (b) extreme nested manifest/duplicate path; (c) unsupported donor backup field/version; (d) 1–3 missing native WG configurations; (e) cookie partial import; (f) wrong operator passphrase; (g) encryption memory pressure/OOM/IDB quota; (h) incomplete source snapshot inventory; (i) archive whose provenance falsely claims everything restored.

**PASS:** pre-decrypt/check envelope and post-decrypt structural validation enforce explicit, implementation-measured size/depth/entity/asset/count budgets; no oversized archive side effect before bound checks. Report *data recovered*, *identity mapped*, *route/session verified* and *controller activated* independently. List excluded WireGuard private configs and unavailable external sessions; do not silently import the donor's separate `native/backup_configs.py` tool output. If complete baseline/source or donor consistency cannot be secured, backup is not marked complete/recoverable. Establish numeric memory/size budgets and target-specific resource acceptance from Stage 6 empirical results, not fabricated here.

**FAIL:** OOM prior to schema rejection without graceful bounds, preview lies about nonportable secrets or online provider auth, missing required source snapshot ignored, 'restore success' while guarded work remains held, corrupted manifest accepted.

**Fallback:** capped preview/held component with explicit requirements, preserve last good archive; reauthorize native/provider credentials manually. **Artifact/owner/tier:** sanitized size matrix, max heap/time/IDB quota, archive inventory and exclusions, independently accounted recovery/activation flags; Stage 6 fleet/backup/restore. `DEFERRED_UNTIL_IMPLEMENTED`.

### Stage 5.5 run order, evidence ceilings and closure

| Dependency/gate | Minimum verification | Unsafe behavior barred until then |
|---|---|---|
| Encrypted export feasibility | P55-01, P55-02 plus pinned donor crypto/format regressions | Unattended or manual integrated backups claiming recoverability |
| OS vault and local key access | P55-03, P55-04 (packaged Firefox and target KDE helper) | Unattended background encryption when locked/unavailable |
| Download proof and retention | P55-05, P55-06 | Tier-3 disk integrity claims and automatic deletion of ambiguous/untracked files |
| Staged restore and activation | P55-07, P55-08, P55-09, P55-10 | Any restored remote mutation, automatic trust transfer or destructive apply without checkpoint |
| Independent diagnostics | P55-11 | Claim that safe diagnostics work through Core failure |
| Representative disaster-recovery scale | P55-02, P55-12 and Stage 5.4 P54-09 | 50+/1,000+ fleet backup/recovery acceptance |

**Current status:** All 12 cases are **NOT RUN**. Stage 5.5 is a *source-supported test design*, not a recovered backup, tested vault, on-disk file or successful fresh-profile migration. No operator decision is necessary to describe safe fallbacks. OS-vault feasibility and exact packaged Firefox file/restore semantics require Stage 6 evidence. Existing donor portable state excludes native private WireGuard configuration, even though the donor separately ships a `native/backup_configs.py` native-config archival utility; do not conflate these products or silently broaden integrated archive scope.

**Platform/reference sources:** https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/downloads/download ; https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/downloads/DownloadItem ; https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/downloads/removeFile ; https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Native_messaging ; https://specifications.freedesktop.org/secret-service/latest/ch03.html ; donor pinned `extension/lib/{backup-package,backup-crypto,backup-import,diagnostics}.js`, `extension/tests/{backup-package,backup-import,diagnostics}.test.mjs`, `native/{native_host,backup_configs}.py`.

## 9. Stage 5.6 — Cross-system adversarial verification and UI/UX acceptance (2026-10-12)

**Status and evidence ceiling:** `DESIGNED / NOT_RUN / DEFERRED_UNTIL_IMPLEMENTED`. This suite composes previously specified P51–P55 boundaries. It is **not** an additional integration framework and does not re-run the already-evidenced F1 successful private/empty creation and rename, the donor's unit suites, or the 53 synthetic Chromium v3.1 design assertions. Acceptance authority: Stage 5 Verification Plan T1–T5; Stage 4 UI/UX Specification §§10–13, UX-01–UX-10; accepted UI-Q01–Q49; Stage 3 F1/F2 amendment. Tests below use only sanitized emulators until a Stage 6 packaged build and later separate human approval exist.

### 9.1 Composition oracle and test-cost limit

Simulate **five independent authorities plus the human tab boundary**: PCMS IndexedDB journal/schedules/approvals; PersonaMonkey durable UID/route/lease/guard; Perchance authenticated owner, live source/listing and AI chat/test evidence; GitHub `per-gens/main` revisions/READY and source trees; browser tab/editor ownership and session state; and separately recorded operator decisions. No single response, UI cache, operation status, provider HTTP result, or archive is permitted to collapse these authorities into one mutable state. Use a separate immutable **effect oracle** per fake remote provider, a monotonic fake-controller epoch, and deterministic independent event delivery queues (including duplication, loss, reordering, suspension and process crash).

**Minimum cross-component fault cuts:** before durable intent; immediately after `DISPATCH_POSSIBLE`; after remote acceptance/lost response; after independent readback/before local confirmation; after account/Persona rebind; after source/approval changes; after suspension/restart; after backup/restore group receipt. For each composed scenario use **representative independent cuts**, not their Cartesian product. Every forbidden outcome is an *oracle-observed action* (unauthorized remote call, wrong account, stale publish, uncontrolled tab close, leaked secret), not merely an error banner. Track critical operation intent/target, expected source hash and allowed mutation scope, exact epoch and sender, observed evidence tier, scope of hold, effect count, and operator-visible receipt. Redact all identities and sensitive bytes in exported traces.

### P56-01 — T1: one-generator release, human edit and relevant GitHub drift (U-02, U-05–U-09; UX-03/04/05)

**Hypothesis:** A release cannot advance authority from a verified source/test to current Perchance publication after relevant GitHub/source/owner/editor changes, even if each subsystem separately reported success earlier.
**Fixture:** one sleeping G (22 evidenced operational hours remaining), protected Persona UID U, previous-good P, pinned READY GitHub A, AI-produced full PJS/HTML/`src/` manifest F, Chat 1 verified results and optional fresh Chat 2 results, unlisted remote G, one automation-owned editor, immutable approval payload for F. Distinguish Git HEAD H1 touching unrelated K from H2 changing G's asset or READY. Independent provider-effect oracle.
**Faults:** human makes unsaved edit then handoff; source changes after both tests; F readback incomplete; HEAD H2 arrives while approval dialog open; Firefox dies after Git ref update but before PCMS receipt; user reopens review; duplicate `Publish` clicks; previously approved target unlisted state becomes unknown.
**PASS:** F's complete hash and test lineage match exact final saved source; handoff and relevant drift revoke current eligibility (without deleting F/P); H1 alone does not block if relevant bytes/READY proven unchanged; approval modal becomes `Review outdated` without replacing its target; no publish when owner/editor/readback/unlisting or approval proof is stale; interrupted Git writeback reconciled read-only and cannot become automatic publish; G preserves sleep budget through hold; no second remote effect on duplicate click.
**FAIL:** publish with stale F/approval, infer PASS from AI prose, overwrite human draft, lose last-good P, consume sleeping time during hold, or re-submit ambiguous publication.
**Fallback/owner/artifacts:** scope G `RELEASE_REVIEW_REQUIRED` / `REMOTE_EFFECT_UNCERTAIN`, preserve immutable versions and human tab; Stage 6 release orchestrator + independent UI/security verifier; source/HEAD/approval epoch graph, effect ledger, captured review state and redacted receipt. `NOT_RUN`.

### P56-02 — T2: 50-account protected-route failure and rebind (U-01, U-02, U-09/10/15; UX-01/06/07)

**Hypothesis:** A failure on Account 17 freezes only its dependent work; other healthy accounts progress. Account grace, routing control and UI incident grouping all use the same evidenced cause rather than assuming every failure is global.
**Fixture:** 50 accounts with dedicated UID/Persona, 12 active generators on Account 17, distinct protected route health receipts and stable queue ordinals; Firefox-running evidence timeline; 60 evidenced-operation-minute grace; other 49 accounts safe; optional operator Pause on Account 17.
**Faults:** lose route at admission and just before an effect; transient lost login vs corroborated provider-wide outage; UID/container rotation and explicit rebind; recover after grace expires; stale UI health result races newer BAD result; global outage starts mid-grace.
**PASS:** no implicit Direct or wrong-container action; only affected work held; active seconds frozen and 60-minute grace consumes only evidenced valid minutes; after grace only occupied slots released, no loss of remaining active budget/ordinal; corroborated global outage freezes grace; healthy accounts continue; rebind invalidates dependent owner and release proof; recovery never clears manual Pause. Group attention only when common cause independently established, with drill-down to 12 distinct receipts.
**FAIL:** account-scoped failure stalls whole fleet, bypasses protected route, consumes grace in browser shutdown/global outage, auto-resumes a paused account, or silently retains release authorization after rebind.
**Fallback/owner/artifacts:** scoped guard/incident, no automatic reroute; Stage 6 Persona facade, scheduler and Accounts/Overview UI; source-classified health/grace timeline, no-dispatch ledger, linked but individually inspectable incidents. `NOT_RUN`.

### P56-03 — T3: 1,000 generators, capacity shock, network loss and cold wake (U-08–U-10, U-15; UX-01/03/04/07)

**Hypothesis:** Deterministic queue, UI inventory and provider admissions remain bounded, recoverable and attributable at fleet size without replacing evidence with inferred success or flooding Firefox/provider after wake.
**Fixture:** 1,000 eligible generators, 50 accounts, 24h/72h nominal cycles, stable ordinals and due timestamps, synthetic observed cap=200, occupancy=195, bounded provider/statistics quotas, two UI tabs, pending batch of 40 slugs. Cap changes to 180; provider rate-limits/loses requests; event page suspends and browser restarts. **250 nominal active demand is an illustration, never a claimed Perchance cap.**
**Faults:** cap falls below occupancy; 429 with/without `Retry-After`; partial/stale feed observation; Firefox alarm duplicate or absent after full restart; IDB quota failure; paginated table filtering and out-of-order observation results; GitHub source folder write outage while some remote reservations are confirmed.
**PASS:** existing 195 active are not force-evicted; zero new admissions at cap 180; no alarm fan-out per generator; retry and polling budgets bounded, queued order survives restart and per-account backpressure; confirmed remote reservations retained with Git pending, uncertain ones never blindly replayed; stable identity in UI selection, no phantom row movement or invented feed rank. The test records numeric *measured* memory, CPU, heap, IDB size, pending operation count, tabs, API calls, 429s and queue age with agreed load envelope; no invented SLO before measurements.
**FAIL:** mass immediate provider dispatch, lost confirmed reservation on Git error, negative capacity, non-deterministic selection target, starvation from repeated unknowns, or any unjournaled remote effect.
**Fallback/owner/artifacts:** bounded provider admission/circuit break, durable pending queue, scoped recovery holds; Stage 6 scheduler/source+UI profiling; load trace including quotas, queue ordinals, per-provider effect oracle and real packaged-Firefox resource metrics. `NOT_RUN`.

### P56-04 — T4: consistent backup, crash-interrupted restore and dual profile (U-11–U-16; UX-04/08)

**Hypothesis:** A verified backup cannot authorize remote effects or transfer active-controller role by itself; partially applied restore leaves all uncertain dependencies held and diagnosable.
**Fixture:** concurrent unfinished Git writeback and Perchance publication intent, encrypted integrated backup, destination with colliding Persona UID, held controller in OLD Firefox profile, fresh NEW profile, mixed restored source/version approvals, fake locked vault and Downloads receipts.
**Faults:** crash before snapshot cut; tamper manifest header; fake completed Download with altered file bytes; restore interrupted after every donor/PCMS/cookie/queue group; wrong UID mapping; OLD profile still operating; Core throws before initialization; human mistakenly clicks Activate from restored approval.
**PASS:** authentication/consistent logical cut or explicit failure, no leaking plaintext through export or diagnostics; verified pre-restore checkpoint and durable guard precede any destructive apply; imported map/partial group receipts persisted; NEW stays read-only until explicit previous-controller shutdown confirmation plus independently renewed owner/route/source checks; no old approval automatically publishable; Core-independent exporter works without attempting normal Core bootstrap and labels missing sections.
**FAIL:** partial restore represented as success, old approval current, double controller writes, unsafe fallback Direct, untracked Downloads deleted, source/session/credential leakage.
**Fallback/owner/artifacts:** restore guard and inactive controller preserved, manual mapping/verification, local checkpoint; Stage 6 backup/restore/diagnostics verifier; encrypted integrity/mapping receipts, effect absence proof, redacted exported ZIP. `NOT_RUN`.

### P56-05 — T5: two-view stale revisions and UI command boundary (U-01, U-07–U-09; UX-01/03/04)

**Hypothesis:** Display state and user interaction never become an alternative mutation authority; stale or reordered results cannot change which record a command targets.
**Fixture:** two full-tab PCMS views A/B, shared generator G1 and separate G2, same canonical revision stream, 1200+ paginated records, saved selections spanning hidden pages, immutable review target and current browser sender metadata. Controller emits reordered r7/r8, session epoch e1/e2, operation completion and permission revocation.
**Faults:** r7 arrives after r8; stale optimistic handler closure; selection changes during batch preview; modal remains open after READY revoked; forged webpage/content-script privileged command; tab suspends and rehydrates; server returns partial eligible-batch outcomes.
**PASS:** monotonic rendering (r8 is not replaced by r7); no optimistic `Confirmed` before independent effect; stale modal visibly blocked; background rejects untrusted sender/stale revision regardless of disabled state; frozen batch set and per-item revisions immutable during execution; changed members held while eligible unchanged members may continue; selection count/Review/Clear remain visible across filters; focus/visual row order stay stable until explicit apply-updated-sort.
**FAIL:** wrong-target mutation, silently widened bulk scope, phantom success, a hidden row accepted without review, or stolen focus/keyboard target from late observations.
**Fallback/owner/artifacts:** view refresh and `REVIEW_OUTDATED` without effect, scoped receipts; Stage 6 controller/UI contract and browser security testing; request/response order, revisions, operation IDs, DOM focus/selection trace, effect oracle. `NOT_RUN`.

### P56-06 — Cross-provider batch reservation and mixed item disposition (U-02–U-04, U-08, U-09; UX-01/04/05)

**Hypothesis:** Bulk action is a set of independently journaled intended item effects, not an all-or-nothing remote transaction or authorization to reallocate ambiguous slugs.
**Fixture:** 40 exact submitted slugs, 10 valid ownership results, 10 conflict/canonicalization cases, 10 remote confirmations with GitHub unavailable, 10 lost create/rename responses, at least two eligible Personas, pinned path policy and global/account Pause changes.
**Faults:** remote response loss after effect; cross-account slug collision; relevant Git HEAD drift; different item loses route while others remain ready; pause inserted between preview and effect; repeated batch action due to UI reconnect.
**PASS:** stable planned slug-to-account mapping and frozen target revisions; no reallocation to another account on uncertainty; confirm only readback-backed outcomes; GitHub unavailable leaves Perchance-confirmed reservations `SOURCE_PENDING` rather than undoing/forgetting them; dependent item holds do not contaminate unrelated safe items; per-item receipt is durable and searchable; no global `all succeeded` result for partial/unknown effects.
**FAIL:** duplicate create/rename, item counted successful based on an API acknowledgement alone, repeated slug assigned to another Persona, changed item silently executed, or per-item outcomes lost.
**Fallback/owner/artifacts:** per-slug `HELD_UNCERTAIN`/`GITHUB_PENDING` and targeted read-only observation; Stage 6 Supply/Accounts/Source and Work Queue; effect ledger, frozen batch revision and itemized receipt matrix. `NOT_RUN`.

### P56-07 — AI evidence, two chats and loss of exact-source equivalence (U-05–U-08; UX-04/05)

**Hypothesis:** An independently evidenced test PASS attaches to an exact finalized PJS/HTML/`src/` byte manifest and test instruction revision, not to the latest narrative or to a later mutated source.
**Fixture:** A→F1 after Chat 1, then F2 after Chat 2 repairs one asset, with prompt revision pr1, optional TESTING.md T1, separate fresh chat session identities and complete file add/change/delete inventory; AI suggests a commit, HEAD moves to unrelated/relevant revisions.
**Faults:** second chat silently reuses prior session, helper asserts PASS without observable test, Chat 2 changes PJS after Chat 1 result, missing asset readback, tests taken against F1 reused for F2, source owner/dirty editor changes while AI is active, automatic GitHub writeback disabled.
**PASS:** chat/session, instruction revision, source manifest and each independently observed result are explicitly attributed; source edits invalidate affected prior outcomes and trigger only necessary retests (not blind all-PASS), final F2 converges only when every required suite is evidenced for F2; unsupported check remains unverified and requires the documented individual exception; AI commit suggestion is metadata, and optional auto writeback respects opt-in but never counts as human publish approval.
**FAIL:** hallucinated PASS, Chat 1 stale result authorizing F2, partial asset digest, automatic commit on AI text alone, or conflict hidden from reviewer.
**Fallback/owner/artifacts:** `TEST_EVIDENCE_INCOMPLETE` / `SOURCE_CHANGED` scoped to G; Stage 6 Perchance helper/source/test and GitHub adapter; chat attribution ledger (identifiers redacted), manifest digests, evidence kind, test version and effect log. `NOT_RUN`.

### P56-08 — Core failure before UI, fail-closed routing and independent diagnostics (U-01, U-09, U-14; UX-04/08/09)

**Hypothesis:** A failed/damaged PCMS Core cannot start remote work via stale alarms or prevent the user from obtaining safe, bounded diagnostics independently; PersonaMonkey protections retain their own safe failure semantics.
**Fixture:** packaged single XPI with deliberately unreadable PCMS database, corrupted schema and one due journal item; valid/invalid donor routing bootstrap variants; extension menu action directly reaching minimal diagnostics exporter.
**Faults:** storage open hangs/rejects, user opens degraded dashboard, alarm fires repeatedly, native bridge refuses status, diagnostic section malicious string embeds token/IP/source/stack/URL, exporter itself fails mid serialization.
**PASS:** no dependent remote effect or hidden Direct fallback; diagnostic entry does not initialize/mutate normal Core, query provider, unlock vault, or alter route; exact allowlisted report (including absence/failure reasons, app/build/boot information and bounded codes) remains exportable when feasible; denial/partial export clearly signaled with Markdown fallback where relevant; no arbitrary error text escapes.
**FAIL:** blocked Core triggers remote effects; emergency entry invokes normal bootstrap; exporter reveals sensitive fields; UI presents full-health dashboard while Core is unknown.
**Fallback/owner/artifacts:** `CORE_UNAVAILABLE`, read-only minimal shell, no calls except safe local diagnostics; Stage 6 packaged Firefox emergency path; call trace and redaction canaries including final artifact bytes. `NOT_RUN`.

### P56-09 — Packaged Firefox keyboard, assistive technology, reflow and localization (UX-02/09; U-15)

**Hypothesis:** A dense 36px-row PCMS dashboard supports all consequential tasks without a pointer, has reliable semantic names and focus, and does not sacrifice accessible decision controls at zoom or in RTL/CJK conditions.
**Fixture:** actual packaged target Firefox Developer Edition (record exact build/OS/XPI), 320/390/800/1280/1440 CSS px effective viewports, 200% enlarged view **and 320 CSS px effective reflow test** (typically 1280px desktop at 400% zoom), system/light/dark themes, normal/enlarged text, `prefers-reduced-motion`, RTL and mixed LTR/code IDs, CJK/long slugs, Orca or otherwise explicitly identified screen reader, keyboard only. No provider mutation required; use seeded local sanitized state.
**Faults:** sticky bar obscures focused control, modal opens/closes while row disappears, hidden conditional action remains tabbable, selection spans hidden pages, 36px dense row with adjacent undersized targets, long error text, table/diff overflow, stale evidence announcement flood, disabled control with no announced reason.
**PASS:** first Tab is visible-on-focus Skip to main; logical Tab/Shift+Tab/Enter/Space/Escape access to all six destinations and consequential actions, modal focus returned to surviving trigger or predictable replacement, no keyboard trap or offscreen critical command. Semantically labeled tables/selected/sorted/expanded states and complete accessible IDs; `aria-live` only meaningful coalesced transitions. All content other than genuinely spatial/technical table/diff regions reflows at 320 CSS px without two-axis *page* scrolling; locally scrollable technical regions are labeled and keyboard operable; essential approvals and recovery path remain reachable. WCAG 2.2 AA minimum 24×24 CSS-pixel target or qualifying spacing/exception applies to **individual actionable targets**, independent of 36px row height. No fully hidden keyboard focus under author-created sticky content. Status independent of color; test actual foreground/background token pairs and focus outlines; RTL isolates literal hashes/paths/slugs rather than mangling them. Native screen-reader manual evidence required; no claim of certification from axe/prototype checks.
**FAIL:** keyboard-only flow cannot reach/exit action, first Tab bypasses skip link, inaccessible failure cause, focus trapped by destroyed modal, source/approval action blocked by horizontal page scrolling, color-only status, WCAG 2.2 AA target/contrast/focus/reflow failure, or screen reader announces misleading object identity.
**Fallback/owner/artifacts:** stop UI acceptance for affected control, keep controller permission gate independent; Stage 6 UI implementation + independent accessibility reviewer; keyboard/focus recording, accessibility tree/screen-reader notes, viewport CSS dimensions, actual contrast measurements, exact offending selectors and screenshot only if sanitized. `NOT_RUN`.

### P56-10 — Operator-facing incident, manual checklist and high-volume UX (UX-01/07/08/10; U-09/15)

**Hypothesis:** At full fleet volume the operator can understand each actionable exception and verify critical changes without a flood of duplicate notifications, fabricated evidence or forced navigation.
**Fixture:** 1,240 synthetic generator records, 50+ accounts, five real-shaped but fake incident classes (one evidenced route common cause, one ambiguous create, one stale recent-list, one backup vault locked, one Core failure), ten checklist rows with `NOT_TESTED` initially, one export fallback and one stale selection from another view. Use actual future Firefox UI, not v3.1 as the test subject.
**Faults:** burst of 500 updates; notification permission denied; browser toolbar badge visible while dashboard closed; severity reorders while keyboard focus on a row; checklist export after marking PASS without evidence note; diagnostics unavailable; operator dismisses informational item while underlying blocking condition persists.
**PASS:** overview groups only proven common cause while preserving item drill-down; urgent blocked work remains visible until resolved and does not become a routine toast; durable receipts searchable from operation/affected entity; recent-list metrics show confidence and observation time rather than inferred fact; pause/hold/incident distinct; UI notification denial does not remove dashboard attention; focus and visible order preserved during interaction until deliberate apply-updated-sort. Checklist is `NOT_TESTED` initially, PASS/FAIL need evidence reference, failing checks not waived by export, Markdown fallback clearly labels incomplete/unverified cases and never forges external results.
**FAIL:** alert flood obscures operator work, unresolved severe failure vanishes on dismissal, restored/uncertain effect marked PASS by UI, screen reader receives 500 status announcements, or selected bulk target silently changes.
**Fallback/owner/artifacts:** per-scope incident aggregation with immutable item IDs, suppressed repetitive toast not suppressed durable attention, exportable sanitized checklist; Stage 6 UI+ops acceptance, evidence of update count versus announcements and notification state. `NOT_RUN`.

### 9.2 UX-01–UX-10 explicit evidence and acceptance traceability

| Gate | Most relevant integrated suite | Concrete UI assertion / rejection criterion | Required evidence tier |
|---|---|---|---|
| **UX-01 — Navigation and identity** | P56-02/03/05/06/10 | Exactly six global destinations; canonical generator/account/operation identifiers across search, inspectors and receipts; stable cross-page selection and source facet. Selection count/Review/Clear visible; wrong entity lookup or invisible widened scope FAIL. | Packaged Firefox with 1,240+ seeded records; safe controller request trace. |
| **UX-02 — Keyboard/AT** | P56-05/09 | First Tab Skip to main, full keyboard path through approval, supply preview, restore preview and errors; screen-reader names, row state and modal focus/return verified; no pointer-only command. | Independent keyboard + named screen reader, actual packaged Firefox. |
| **UX-03 — Revision/order determinism** | P56-01/05/10 | Late r7 cannot overwrite r8; immutable approval target becomes `Review outdated`; no forced focus movement/row resort; background rejects stale command. | Deterministic reordered event trace plus packaged UI/dispatcher. |
| **UX-04 — Durable effects/partial state** | P56-01/03/04/05/06/07/08 | Separate `PREPARED`, `DISPATCH_POSSIBLE`, `OBSERVING`, `CONFIRMED`, `HELD_UNCERTAIN` and item partial receipts; remote 200 not CONFIRMED, no blind retry. | Simulated provider effect oracle + packaged IDB/browser cold-wake. |
| **UX-05 — Release source/approval** | P56-01/06/07 | Byte-complete PJS/HTML/`src/` manifest, two-chat test attribution, exact hash human approval, conditional Git writeback distinct from publication, bulk clean/AI-modified review differences. | Fake source/Git remote fixtures then narrow operator-live check only when necessary. |
| **UX-06 — Account and route safety** | P56-02/05 | Single dedicated Persona UID per active account; rebind invalidates owner/release; protected route never Direct; account-scoped holds and Pause persists. | Shared donor/PCMS fence, packaged Firefox with safe fake native/provider. |
| **UX-07 — Fleet scheduler** | P56-02/03/10 | Clocks/grace use evidenced operational minutes; cap/occupancy/feed presence distinct; Pause orthogonal; stale list confidence labeled; oldest-eligible fairness. | Deterministic interval and queue oracle; packaged profiling. |
| **UX-08 — Restore/degraded diagnostics** | P56-04/08/10 | Verified checkpoint, resumable dependency-group receipts, inactive fresh controller, independent redacted emergency export, no automatic historical approval. | Packaged Firefox two-profile fixture and final exported artifact inspection. |
| **UX-09 — Firefox accessibility/platform** | P56-08/09 | Firefox versioned, 320 CSS px reflow, 200% text/zoom and 400%-equivalent reflow, real color/focus/24px target tests, system theme, reduced motion, RTL/CJK; no Chromium-prototype inference. | Actual packaged Firefox + accessibility review with recorded viewport/tool versions. |
| **UX-10 — Manual checklist/evidence** | P56-09/10 | Explicit not-tested state, evidenced PASS/FAIL, failed cases block acceptance, safe Markdown fallback, no synthetic test or AI narrative labeled external PASS. | Operator review of actual build and exported notes; Stage 5 design alone never PASS. |

**Accessibility normative interpretation:** W3C WCAG 2.2 AA SC 1.4.10 specifies a 320 CSS-pixel reflow condition; 200% zoom alone does not necessarily produce a 320px effective viewport. SC 2.4.11 bars focused controls being **entirely** obscured by author-created content (the approved UI can adopt a stricter visible-focus policy). SC 2.5.8 requires at least 24×24 CSS px actionable targets **or a permitted spacing/other exception**; 36px table row height does not establish target conformance. Official references: https://www.w3.org/WAI/WCAG22/Understanding/reflow.html ; https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum ; https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum ; https://www.w3.org/WAI/WCAG22/quickref/ . These are acceptance standards, not measured app results.

### 9.3 Stage 5.6 run order, integrated stop conditions and release boundary

1. **First independent slice:** P51-01/02/04 and P56-05/08 security/epoch/crash, before accepting any scheduled provider write or invoking actual privileged operator UI action. Existing donor fail-closed fixtures are retained rather than replaced.
2. **Provider/source slice:** P52-01/04/05/06, P53-03/04/07/08 and composed P56-01/06/07. No release acceptance while exact saved source, owner, test evidence, current READY/HEAD, unlisting or editor safety is unknown; do not repeat F1's previously successful exploration.
3. **Fleet slice:** P54-01–11 and P56-02/03 with fake provider/clock. Automatic mutating Refresher **remains disabled** until P54-05 proves a permitted effective refresh method; synthetic 200 capacity is never a provider guarantee.
4. **Recovery slice:** P55-01–12 and P56-04/08, then explicit fresh-controller activation. Missing local vault access, independent download-byte proof or cross-store rollback must remain labeled limited/unverified; never silently relax security.
5. **UI acceptance slice:** P56-05/09/10 and UX-01–UX-10 on packaged pinned Firefox, with keyboard/AT/manual proofs, before any claim of complete operator UX. Allow routine synthetic regression automation, but retain human confirmation for visual and screen-reader usability.

**System-level non-negotiable FAIL:** any protected→Direct fallback, unauthorized/duplicate remote mutation after replay, lost or overwritten human draft, stale-source publication, silently activated restored controller, plaintext sensitive backup, independently verified secret leakage, or false PASS/CONFIRMED representation. Such a failure blocks the relevant capability and release gate; a scoped hold is not a reason to disable healthy unrelated functions. **Stage 5.6 closes only the test design**; every P56 remains `DEFERRED_UNTIL_IMPLEMENTED`, and operator-live proof must be explicitly approved later.


## 10. Stage 5.7 final matrix reconciliation and execution ledger

**Accounting:** P51-01–08 = 8; P52-01–07 = 7; P53-01–08 = 8; P54-01–11 = 11; P55-01–12 = 12; P56-01–10 = 10. **Total = 56 non-duplicated verification contracts.** Every one is `DEFERRED_UNTIL_IMPLEMENTED` / `NOT_RUN` for new combined PCMS XPI and Stage 5-specific emulator execution. Source inspection of donor tests and historical F1 are separate evidence; do not mark a new P case passed on those grounds. No additional tests or code were executed in Stage 5.7.

**Coverage:** U-01–U-16 appear in the linked tests and Evidence Register; UX-01–UX-10 each has the concrete P56 oracle in §9.2. The five composite Stage 4 traces map to P56-01–05, with additional partial-batch, AI-source equivalence, Core-failure, accessibility and incident tests P56-06–10. Each future suite must attach the evidence record required by §1 and the exact expected/observed fail-safe behavior. A failure in a shared critical invariant blocks **its dependent capability**, not necessarily unrelated healthy donor functions.

**Required sequencing:** first P51 packaged Firefox guarded journal/cold wake → P52/P53 protected provider/source/release → P54 independent fleet operational oracle, with mutating refresh disabled until P54-05 real permissibility/effectiveness → P55 encrypted backup and staged restore → P56 integrated/UI/assistive-technology acceptance. H-01/H-07 are required for overall UI/operator sign-off; H-06 for a migration/activation claim; H-02/H-03/H-04/H-05 conditional on enabled provider/host capabilities and proof availability. The exact Stage 6 proposed slice gates and evidence thresholds are in `PCMS-Alpha-Stage-5-Verification-Specification.md`.

**Closure:** This matrix is **READY FOR DESIGN SIGN-OFF, NOT PRODUCT PASS**. No per-case PASS report exists. Do not reopen old F1 exploratory live success merely to generate a new green check. An actual Stage 6 test run records its own results without rewriting historical Stage 5 `NOT_RUN` claims.
