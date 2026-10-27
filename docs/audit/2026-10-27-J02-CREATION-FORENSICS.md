# J02 generator creation forensic repair — 27 October 2026

**Operator incident:** In PCMS Alpha 1.2.19, a newly submitted **explicitly pinned** generator stays at **Checking ownership**, with canonical hold `TARGET_OWNER_OR_ABSENCE_UNVERIFIED`, while the selected account displays “2 owned · Ready.” The operator confirms route/bridge startup works and asks for root-cause investigation and exhaustive creation-path repairs.

**Evidence boundary:** The screenshot proves account selection succeeded and the intent reached `OWNER_READBACK_PENDING`; it does **not** prove actual provider CREATE dispatch. The attached readiness export confirms only local runtime and canonical accounts, not a live authenticated `checkGeneratorOwnership` response, `getGeneratorPageData` status, real saved source, protected egress or the installed package SHA. Consequently the provider’s specific underlying status (including HTTP 404) is **not established** from this incident. Offline tests exercise alternative response shapes; they must never be described as live Perchance proof.

## Actual ingress-to-effect path

1. The primary `generator-batches.mjs` UI commits one immutable batch ID, chunked slug manifest and optional pinned account through the trusted `pcms-s00-coordinator` boundary. A lost response is reconciled by GET, not resubmission.
2. `creation-watch.mjs` fairly pages due intents and uses bounded background workers. `creation-allocation.mjs` counts independently observed owned resources plus pending assignments. A pinned account requires **that account’s** trustworthy initial census; unknown never counts as zero.
3. `creation-runner.mjs` advances `WAITING_CAPABILITY` → `OWNER_READBACK_PENDING`. It reads canonical binding/revision/principal and guarded PersonaMonkey route. A read-only `READ_TARGET` must distinguish independently verified absence, owned existing generator (adopt) or foreign identity (collision).
4. Only **MISSING_VERIFIED** permits `OWNER_MISSING_VERIFIED` → fresh inventory/target read → `CREATE_PREPARED`; then the operation journal commits `CREATE_DISPATCH_POSSIBLE` before the single provider CREATE. A fresh owned/temp source and independent remote readback are necessary for `PRIVATE_EMPTY_CONFIRMED`.
5. The final target requires fresh absence again before `RENAME_PREPARED` and `RENAME_DISPATCH_POSSIBLE`. The successful rename is verified by identical remote ID, authenticated ownership and truly private/empty source; then Git association is an independent continuation. Git outage must **not** invalidate verified provider creation.
6. Uncertain or lost remote effects remain fenced. **Never** create a second intent or replay CREATE/RENAME on an unknown outcome; I17 quarantine remains permanent.

## Concrete defects and corrections

| Layer | Before | Correction / residual limitation |
| --- | --- | --- |
| Target readback | One `TARGET_OWNER_OR_ABSENCE_UNVERIFIED` hid owner, page, session, throttling and census causes | Explicit fixed codes for owner, page transport, identity, session rejection, rate limiting, census contradiction and absence; no raw server payload, email or token logged |
| Provider response | Non-200 JSON page response collapsed into unverified; HTTP 404 could never become safely observed absence | Recognize HTTP 404 as **provisional only**, then require authenticated nonownership, current full-owned-census omission, unchanged session and positive same-endpoint control read of an existing owned generator or public minimal template when inventory truly empty |
| Collision proof | Any page `success` with `is-not-owner` counted as collision, even malformed/unrelated target | Require exact returned slug, actual `isPrivate` boolean and stable validated public ID; mismatched pages hold instead |
| Owner/census contradiction | Owner response and current authenticated census could disagree | Hold on contradiction; do not silently create or adopt |
| READ_TARGET retry | A single dropped read could strand a queued request | At most one bounded read-only retry only on transport unverified; never repeat possible effects |
| **CREATE/RENAME preflight** | Critically: even after successful HTTP404-based `READ_TARGET`, later pre-dispatch page reads rejected HTTP404, potentially leaving an operation `DISPATCH_POSSIBLE/UNCERTAIN` without even invoking CREATE | Shared **exactly same** independently corroborated absence policy for `READ_TARGET`, `CREATE`, `RENAME`, and distinct existing-generator rename |
| Product UX | Generic “Inspect generator account/source” did not identify which readback failed | Concrete safe recovery text for each typed hold; preserve the original queued batch/intent |
| HTTP 429 | Raw HTTP rate limit collapsed into unknown | Distinguish `PROVIDER_RATE_LIMITED`, fail closed, do not interpret as absence |
| Existing manual rename | Separate identity-preserving rename could retain the old divergent absence policy | Use common checked absence predicate while requiring immutable original ID, original source safety and read-only post-effect reconciliation |

**Important residual:** Some pre-dispatch failures occurring **after** the durable `DISPATCH_POSSIBLE` checkpoint conservatively leave the operation uncertain even where an offline fixture knows the remote call was never made. This is safe and avoids modifying the accepted operation/journal state machine or creating duplicate generators. A future no-dispatch release would require an independently durable dispatch-attribution proof and its own regression matrix; never relax the uncertainty fence here.

## Independent deterministic and installed-browser coverage

Added/revalidated real production functions, not only stubbed state transitions:

- Target adapter: explicitly confirmed JSON absent, corroborated HTTP 404, empty and nonempty legitimate account inventory, foreign slug, owned target adoption, mismatched page generator name/public ID, JSON marker spoofing, session change and principal mismatch, census/owner contradictions.
- Negative transport: raw HTTP 429 on inventory, owner and public page; HTTP 404 with wrong/unavailable control, unknown session, failed source, or unverified public data. No fixture mutation endpoint in any negative read.
- **Complete pinned-account provider fixture**: `createCreationRunner` → `createCoordinatorStore` → actual `perchanceSupplyIsolated`, with source-preserving canonical IndexedDB, fresh owner/census/route checks, single private empty save, temporary owner/source readback, rename and final canonical inventory record; both JSON and HTTP404 absence branches.
- Owner collision never dispatches; lost CREATE ACK remains `CREATE_UNCERTAIN`, operation status `HELD_UNCERTAIN`, exactly one provider write. Existing-identity rename preserves old source and immutable public ID with collision and lost-ACK cases.
- Existing full suites additionally test historical no-replay quarantine, account rebinding and archive, stale CAS, negative grants, source import, Git conditional writes, background fairness, installed primary J02 UI, persistent Firefox upgrades and donor/native security.

A **passing deterministic oracle does not prove** the installed user's protected Perchance route, live endpoint behavior or actual generator creation. Live provider tier **L = NOT_TESTED**, and no personal/local/private source or provider effect was dispatched in this repair. An operator may continue the **same existing request** once with fresh protected readback; if still held, record only safe code/version and investigate that exact incompatible status. Never resubmit a new slug over uncertain CREATE/RENAME.

## Anti-regression and acceptance

- No donor routing/bridge files, C-07 exit policy or control-lease semantics modified.
- No privileged Git write/publication authority added, no credential export, no new extension permission or PCMS helper.
- No CI/AGENTS policy bypass; Ready PR must pass trusted baseline, D/adversarial, pinned donor, reproducible enabled XPI, and permanently installed Firefox smoke for exact SHA. Repeat postmerge validation on main.
- Package version increments from 1.2.19 to 1.2.20 with the **same Gecko ID** and a pinned, independently hashed existing-1.2.19 → new-1.2.20 real profile upgrade. The original I17 case remains quarantined.
- Only independently observed `OWNED_VERIFIED` / `MISSING_VERIFIED` / `COLLISION` can advance owner readback. Explicit account “Ready” by itself is never evidence that a prospective slug is free.

**Completion label:** D+packaged B engineering proof may PASS under CI; real Perchance creation/rename acceptance cannot be claimed until the operator's independently observed, authorized disposable L proof.
