# PCMS-Alpha — Stage 4 UI Decision Register

All 49 decisions below were accepted by the operator using **“All recommendations”** through UI-Q48 and **Option A** for UI-Q49. This records *design decisions*, not runtime acceptance. Stage 4.7 technical/design audit completed against prototype v3.1; **operator acceptance of the final revision remains pending**.

| Question | Accepted decision (Option A unless noted) |
|---|---|
| UI-Q01 | Overview opens by default, prioritizing actionable incidents and significant fleet activity |
| UI-Q02 | Six destinations: Overview, Generators, Work Queue, Accounts, Refresher, Settings; embedded Supply and secondary PersonaMonkey controls |
| UI-Q03 | Dense generator inventory, right-side inspector, full-width only for complex reviews |
| UI-Q04 | One Work Queue with filters; safe clean bulk approval and individual AI-modified review |
| UI-Q05 | Persistent, impact-prioritized attention visibility; manual Pause distinct from incidents |
| UI-Q06 | Frozen target selection → eligibility preview → execution → per-item receipts |
| UI-Q07 | Small collapsible Perchance editor overlay for exact identity/operation/conflict and handoff |
| UI-Q08 | Overview orders incidents, pending approvals and executing work before fleet metrics |
| UI-Q09 | One keyboard-accessible global search spanning generator, account, source path, operation ID |
| UI-Q10 | Compact configurable generator columns, persistent saved views, inspector details |
| UI-Q11 | Expandable contextual inspector; separate full-width complex diffs/history |
| UI-Q12 | Actionable Work Queue first, stable order, explicit running/waiting/held filters |
| UI-Q13 | Selection persists across filters/pages, count always visible; freeze/revalidate for batch action |
| UI-Q14 | All / Needs Attention / Awaiting Review / Managed defaults plus custom saved views |
| UI-Q15 | Relative ages near observations; exact time/method/freshness on inspection |
| UI-Q16 | Only independently evidenced common-cause incidents grouped; retain per-item receipts |
| UI-Q17 | Full-width source diff/test-evidence/publication review from compact Work Queue row |
| UI-Q18 | Refresher starts with operational capacity/health before detailed schedule |
| UI-Q19 | Compact account inspector, full task screen for enrollment/rebind/route repair |
| UI-Q20 | Persistent searchable per-item operation receipts |
| UI-Q21 | Resumable guided enrollment task through Persona/login/verification/binding |
| UI-Q22 | Paste-first slug editor and editable allocation preview, optional import draft |
| UI-Q23 | Persistent batch progress with independent outcomes and safe navigation away |
| UI-Q24 | Batch adoption consent; baseline protection and receipts remain item-specific |
| UI-Q25 | Release timeline with expandable AI tests, source changes and evidence |
| UI-Q26 | GitHub writeback and human publication checkpoints distinct within one review workspace |
| UI-Q27 | Contextual incident recovery, no seventh global Recovery control center |
| UI-Q28 | Exact source-bound approval summary and pre-publication revalidation; relevant drift blocks |
| UI-Q29 | Full-width previous-good / reviewed / conflicting source comparison |
| UI-Q30 | Explicit global/account/generator Pause selectors; independent hold/outage indicators |
| UI-Q31 | Separate occupancy, estimated cap, confidence/staleness and actual feed observation |
| UI-Q32 | Full-width staged restore with mapping, checkpoint, receipts and separate activation |
| UI-Q33 | Original intent/evidence and read-only reconciliation in scoped incident inspector |
| UI-Q34 | Independent diagnostic export entry in extension menu, Settings and failure context |
| UI-Q35 | Default 36px dense rows, opt-in 44px comfort density |
| UI-Q36 | Remember inspector width and visibility by workspace; reflow when narrow |
| UI-Q37 | Column width/order/visibility and saved views, as simple presentation preferences |
| UI-Q38 | Native keyboard conventions plus optional documented non-conflicting shortcuts |
| UI-Q39 | Persistent attention center, brief routine toasts, severe issues remain accessible |
| UI-Q40 | Full-width file tree with inline / side-by-side source diff modes |
| UI-Q41 | System/Firefox appearance default with optional light/dark override |
| UI-Q42 | Narrow view prioritizes identity/status/attention, details in inspector, local table scroll when necessary |
| UI-Q43 | Semantic tables and Tab/checkbox/action model; no custom spreadsheet keyboard grid |
| UI-Q44 | Hold visible order/focus on incoming observations, expose apply-updated-sort affordance |
| UI-Q45 | Coalesce screen-reader progress announcements, announce meaningful transitions and serious errors |
| UI-Q46 | Ellipsis in dense table, full accessible/copyable identifiers; wrap details where appropriate |
| UI-Q47 | Disabled actions with adjacent accessible blocker explanation and independent recovery path |
| UI-Q48 | Continue individually eligible unchanged batch items, hold changed targets with exact receipts |
| UI-Q49 | **A:** build self-contained static HTML/CSS design prototype with synthetic interactions before final Stage 4.7 sign-off |

## Design harmonization amendments (non-policy changes)

- When UI-Q13 spans hidden selected rows, always expose a count and Review/Clear selection; no invisible batch scope.
- UI-Q29 source conflict choices must name the **exact** version and authority they change; avoid generic “Adopt” or “Restore”.
- UI-Q35 36px row density does not waive WCAG target-size/focus obligations.
- UI-Q42 requires an explicit labeled mobile menu; icon-only navigation is not sufficient when labels collapse.
- UI-Q44 applies to canonical revision-driven UI updates, not permission to keep stale authority when approving; source/approval gates must revalidate immediately before mutation.
- UI-Q47 disabled controls use neutral, readable appearance, not an unlabeled blue rectangle.
- UI-Q48 never retries an uncertain effect or reallocates an ambiguous slug to another account.
- The v3.1 prototype distinguishes **designed behavior** from **provider-tested behavior** throughout and never marks fixtures as external acceptance.

## Open issues

No new product decision has been requested by prototype v3.1. **Operator design sign-off remains outstanding**; technical feasibility and packaged-Firefox acceptance remain Stage 5. The v3 coverage audit gives exact residual proof obligations.

## Stage 4.7 QA-driven corrections (not additional product decisions)

- **QA-47-01 — Theme token references:** Five stylesheet usages referenced undeclared `--surface` / `--surface-2`, resulting in browser-dependent transparent/invalid background behavior for the keyboard skip link, preview, loading skeleton and update notice. All now use the defined `--paper` / `--sidebar` tokens.
- **QA-47-02 — First keyboard stop:** The skip-to-main link was appended at the end of the header, so its first-Tab affordance failed. It is now the first focusable document element with a focusable main target, without altering navigation destinations.
- **QA-47-03 — Conditional modal actions:** Reverified previously corrected `hidden` behavior, keyboard Escape and focus after updating the prototype; no unlabeled blue primary action returned.
- **QA-47-04 — Adversarial regression suite:** Existing 19+23 browser assertions and 11 new targeted keyboard/theme/viewport checks pass on prototype v3.1. These remain Chromium synthetic design checks only, not Firefox packaged or WCAG certification.

## Closure authority

All UI-Q01–UI-Q49 decisions are accepted. Stage 4.7 reconciles and documents the final candidate design; **operator sign-off is a separate explicit act**. No implementation or Stage 5 acceptance is implied.
