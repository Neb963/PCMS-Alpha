# PCMS-Alpha — Stage 5 Final Decision and Exception Register

**Date:** 2026-10-12  
**Status:** Stage 5.7 audit candidate; **no new operator product decision requested**. Explicit acceptance of the final Stage 5 verification-design package is pending.  
**Authority:** Accepted Stages 1–4 and controlling Stage 3 F1/F2 amendment. Stage 5 distinguishes acceptance *design* from acceptance *evidence*. This register does not supersede previous Q/UI-Q records or grant implementation authority.

## 1. What Stage 5 did and did not decide

- `CARRIED`: an existing approved product requirement, unchanged.
- `VERIFICATION_CONSEQUENCE`: a technical minimum derived from an accepted safety requirement and inspected source/platform constraints; **not** a new user product policy.
- `OPEN_IMPLEMENTATION_PROOF`: an unresolved capability fact with an accepted safe fallback; **not** a reason to reopen product design today.
- `NEEDS_OPERATOR_DECISION`: only when a previously accepted feature proves infeasible **without** a safe alternate behavior. **None demonstrated in Stage 5.**

| ID | Classification | Controlling decision/finding | Implementation consequence / safe failure |
|---|---|---|---|
| **S5-D01** | `CARRIED` | One combined XPI, one PCMS controller; PersonaMonkey owns protected routing, UID, lease and guarded execution. | Same-XPI *narrow* facade, no second native/router/API authority. U-01, P51-02. |
| **S5-D02** | `VERIFICATION_CONSEQUENCE` | Donor static proxy/webRequest guards register before recovery; other wake-critical listeners are installed after async recovery in inspected source. Firefox event-page wake needs synchronous registration. | Register wake-critical callbacks at initial synchronous module evaluation and defer work inside callbacks; prove under suspension/recovery failure in packaged Firefox. **Risk, not a proven donor defect.** U-09, P51-01. |
| **S5-D03** | `CARRIED` | Every remote effect has journaled predispatch intent and readback-backed disposition; no blind retries or global atomicity across services. | Distinct `PREPARED`, `DISPATCH_POSSIBLE`, `OBSERVING`, `CONFIRMED`, `HELD_UNCERTAIN`/abort, target lock after crash. U-09, P51-04/P53-05. |
| **S5-D04** | `CARRIED` | F1 private-empty creation/rename one-generator case is historical PASS; full F2 native AI authorization includes generator-owned PJS, HTML and `src/` assets. | Test *unknown* partial/race cases; missing any final file bytes, test proof or fresh Chat 2 attribution blocks release; AI prose is not test evidence. U-02–U-07. |
| **S5-D05** | `CARRIED` | Conditional manual/opt-in automatic GitHub writeback is separate from human exact-source publication approval; READY is GitHub-governed. | HEAD-path comparison, atomic Git-only commit and nonforced ref; no auto READY/publish; irrelevant HEAD drift only allowed after relevant verification. U-08. |
| **S5-D06** | `VERIFICATION_CONSEQUENCE` | `Neb963/per-gens` and `Neb963/PCMS-Alpha` were empty; `per-gens/main` ref returned GitHub 409. | Stage 6 needs separately authorized repo initialization; a configured `default_branch` is not a READY branch. Preserve SOURCE_PENDING reservations if source missing. P53-01. |
| **S5-D07** | `CARRIED` | Stable oldest-eligible global queue, 24h/72h evidenced time, 60 qualifying minutes unavailable-account grace, no guaranteed provider recent-list capacity, no spam refreshing. | Reconstitute alarm after restart, separate provider-wide outage, no cap-driven active eviction. If effective legitimate refresh cannot be proved: **mutating Refresher disabled**, read-only monitoring allowed. U-09/10/15. |
| **S5-D08** | `CARRIED` with technical envelope clarification | Integrated one-file **authenticated encrypted payload**, including PCMS secret/source fields and donor portable sensitive data; minimal nonsensitive outer crypto/format header; portable recovery secret, optional safe KDE vault. | Donor encoder's “non-sensitive plaintext” path cannot be used for integrated archive; preserve donor portable section/validations and exclude WireGuard private configuration. Authenticated metadata used in restore decisions cannot be tampered with. No key ⇒ suspend backup. U-11. |
| **S5-D09** | `CARRIED` | Firefox Downloads has distinct construction, download-completion and optional disk-byte proof; 14-good automatic retention only for tracked owned files. | No assertion of disk hash without reading disk; never delete manual/untracked/last-good via folder glob. U-13. |
| **S5-D10** | `CARRIED` | Cross-store restore uses authenticated preview, verified checkpoint and persistent independent guard, then receipt-based dependency groups. Restored fresh controller inactive by default. | No fabricated cross-store atomic rollback; unknown groups held; historical approvals never self-reactivate; old-controller inactivity operator verified. U-12/16. |
| **S5-D11** | `CARRIED` | Independent emergency diagnostics are narrow, read-only and redact raw source, sessions, free-text and secrets even when Core fails. | Separate minimal entrypoint; deny normal Core/provider initialization. U-14. |
| **S5-D12** | `VERIFICATION_CONSEQUENCE` | Approved Stage 4 v3.1 fixture and 53 synthetic Chromium assertions are design evidence only. | Packaged Firefox UX-01–10, 320 CSS-pixel reflow, keyboard/AT/contrast/focus and large fleet need actual separate acceptance. H-01/H-07. |
| **S5-D13** | `VERIFICATION_CONSEQUENCE` | Testing unknowns is more useful than repeating F1 or donor happy paths. | Maintain 56 numbered contracts; reuse existing donor unit tests, and compose 10 P56 adversarial cross-system flows rather than new speculative infrastructure. |
| **S5-D14** | `VERIFICATION_CONSEQUENCE` | Tests must carry independent effect/source assertions; unexecuted test designs cannot be PASS. | Pass tiers and capability-scoped acceptance flags; packaged/live evidence and explicit operator activation required for high-risk workflows. |

**No S5-D entry changes Stage 1/2, Q107–Q154 or UI-Q01–UI-Q49 choices.** These entries are traceable consequences and proof gates, not retrospectively attributed operator votes.

## 2. True outstanding facts and default disposition

| Proof question | Status at Stage 5 close | Smallest next proof | While unknown |
|---|---|---|---|
| U-01/U-09: actual listener/cold wake, Persona lease and DB journal coordination | Source risk; `DEFERRED_UNTIL_IMPLEMENTED` | P51 packaged Firefox and fake provider; G6-1 | All PCMS remote mutations off. |
| U-02/U-03/U-04: owner continuity, rename/create ambiguous effect, slug reuse | Historic one-generator F1 only; `DEFERRED` | P52 synthetic, then H-02 **only if** unresolved | Hold relevant generator/account; do not reallocate ambiguous slug. |
| U-05/U-06/U-07: complete saved source and independently proven AI tests/dirty-editor handoff | Historical partial source/UI evidence; `DEFERRED` | P52/P56 plus H-03 conditional | No auto source writeback or publish. |
| U-08: actual GitHub initialized `main`, READY handling, multi-file conditional commit | Empty repo ref directly observed; adapter absent | Authorized initial commit then P53 simulated/controlled tests | Non-READY SOURCE_PENDING; Git writes off. |
| U-10: provider-permissible, observably effective recent-list refresh | `UNVERIFIED` | P54-05 and optional explicitly approved H-04 | Mutating Refresher off. |
| U-11: KDE vault safe unlock and disaster-recoverable secret | `UNVERIFIED` | P55-03 then optional H-05 synthetic host test | Suspend unattended backup; never plaintext. |
| U-12/U-16: staged restore/crash and fresh-profile mutual exclusion | `DEFERRED` | P55-07–10/P56-04 then H-06 for migration | No destructive restore until checkpoint; new profile inactive. |
| U-13: exact Firefox download track/readback/delete | `DEFERRED` | P55-05/06 packaged; H-05 if needed | Honest weaker tier and tracked-only retention. |
| U-14: exporter works with Core broken and leaks nothing | `DEFERRED` | P55-11/P56-08 | Independent minimal status; fail closed. |
| U-15: 50+/1,000+ real resource envelope | `DEFERRED` | P54-09/10+P56-03 packaged load | Throttle, shed load, bounded tabs/stats. |

## 3. Deliberate non-decisions / supersession ledger

1. **F2 AI scope:** historical Stage 2/early Stage 3 PJS/HTML restriction is superseded by the accepted amendment: generator-owned `src/` is included. Stage 5 cannot reimpose narrower authority just because today's provider feature is not yet proven; its runtime availability gates the feature.
2. **Writeback order:** an older requirement that approval always precedes GitHub writeback is superseded; approval is necessary for *publication*. AI commit text is advice only, never authority.
3. **Stage 4 sign-off:** prior files marked pending are historical. Operator explicitly approved v3.1 design on 2026-10-12. That does not certify Firefox UX or provider integration.
4. **F1:** one disposable private-first creation and rename observed already; no repeat live test needed. Public recent-list sample absence is not URL secrecy or universal privacy proof.
5. **Donor portable backup:** encryption and import logic are reusable but **not** evidence of an integrated PCMS archive, keyring compatibility or atomically restorable Firefox cookies/containers.
6. **GitHub empty `main`:** configuration's default branch name is not proof of an existing commit/READY; do not initialize repositories without permission.
7. **Test/CI PASS:** no newly specified Stage 5 P51–P56 test was executed; no future packaged-XPI test should be green by inheritance from source inspection or the Chromium design prototype.

## 4. Sign-off and authority boundaries

**Recommendation:** accept Stage 5 as a complete **verification-design specification**, not product/implementation acceptance. Operator sign-off is still an explicit action. After sign-off, Stage 6 implementation should require its own explicit authorization for GitHub modifications, initial repo setup, development environment and later live/provider operations. Stage 5 grants none of those permissions.

**Escalation criterion:** raise a new product-level question only if Stage 6 supplies reproducible evidence of an unavoidable contradiction and *no* safe capability-disabled or operator-manual fallback remains. Present the smallest feasible alternative, affected invariant and rollback path; never silently reinterpret prior approvals.
