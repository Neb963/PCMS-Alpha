# A09 — Existing-evidence reuse map and unresolved acceptance

**Classification:** Evidence inventory, not a list of completed AC journeys. Product authority is Client Amendment v1.0.1, accepted AC-01–AC-18 and T-01–T-10. The original X-01–X-14 scenario descriptions were recovered from the attached Part 8 audit report and are preserved verbatim in `docs/audit/PART8-ORIGINAL-X01-X14.md`, with a SHA-256-pinned table. The A01 mapping remains a *derived* grouping only; its old topic names must not override the recovered original scenario names or tier rules.

**Baseline accepted engineering candidate before A09:** A08 merged `main` `3bf6635841182203c5c3b4ff72bdf2816abc4594`, tree `5096cf5c123c0528c9706acc77dc047f91d5d885`, [postmerge Actions run 40088006348](https://github.com/Neb963/PCMS-Alpha/actions/runs/40088006348), all four required jobs SUCCESS. A08 packaged XPI version 1.2.5, Gecko ID `persona-route-manager@local`; recorded XPI SHA-256 `97ca33b880146685362310c1b9c6e029ca169babc55385913f3cbeaac9c01551`. Do not import a historical result into A09 without matching current XPI bytes/interfaces, source identity and test assumptions.

| Contract | Reusable engineering tests or observations (narrowly scoped) | Outstanding independent proof |
|---|---|---|
| AC-01, AC-02 | Donor fail-closed, protected Persona/request gate, 2-account identity and route uniqueness fixture cases | Actual distinct exits, verified IPv4/IPv6, operator login/repair; L + real H |
| AC-03 | Archived-account allocation/hold and unattempted-only reassignment tests | Live owner/route archive/reactivation readback |
| AC-04, AC-05 | A04 unbounded durable batch, 110-item primary UI and Firefox restart continuity, duplicate/uncertain-effect ledger | Bounded real private creation/rename/owner and source readback; L |
| AC-06 | Immutable source/hash, adopted identity, CAS safeguards and portable checkpoint tests | Actual provider-owned source completeness and owner H/L |
| AC-07–AC-09 | A03 paginated pinned-main Git tree/identity/READY and reconciliation/rename holds | Private `per-gens` actual main pagination and scoped provider continuation |
| AC-10–AC-13 | A05 exact candidate review/publication admission, stale approval/dirty source holds and synthetic AI/Chat2 tests | Real helper, source save, conditional private Git writeback, actual publish/listing L/GIT |
| AC-14, AC-15 | A06 browser-only Refresher persisted clock/alarm, complete-vs-partial feed, B closed-dashboard and restart | Authorized live source save/feed observation, real routed bridge/time H/L |
| AC-16 | Packaged diagnostics, real Firefox process restart in disposable CI and readable redacted UI | Full real disposable end-to-end one-button run, actual operator H/L |
| AC-17 | A02 browser-only plain-format source-complete export, disk readback/import and inactive restore in disposable Firefox, 14-retention rules | Operator fresh/existing profile controlled restore and owner/exit reassessment H |
| AC-18 | A07 B 55 managed accounts + 1,200 generators paging and resource measurements | Operator keyboard/screen-reader/reflow/usability and real H scaling |
| T-01–T-10 | Relevant negative transaction, source, feed, journal, clock, profile-restore tests are present across existing D/B suites | Consolidated end-to-end cross-boundary scenario receipts, avoiding redundant real effects |
| X-01–X-14 | Original Part 8 triggers/outcomes and evidence tiers recovered verbatim with a digest; A01 mappings remain labeled derived | Test the specific original scenarios, reuse relevant existing D/B adverse proofs, and record remaining H/GIT/L observations; source recovery does not mean X PASS |

The **same XPI** can support engineering-evidence reuse for unchanged runtime paths; the full accepted operator journey is still not established by these partial component tests. A09's executable ledger defaults missing slots to NOT_TESTED, validates source/XPI pins, refuses fake fixture/external readback equivalence, and reports held requirements rather than promoting green CI to product PASS.

## Minimal additional observations, not automatic effects

One authorized disposable account pair, one new private generator, one controlled READY/edit/publish chain, one scoped Refresher save/feed check, one passwordless backup/restore and one genuinely observed Firefox restart may jointly cover many required AC/T/L/H observations. Private Git commit/tree readback and any actual profile/OS work require explicit separate scope. Use previously proved adversarial injections to avoid repeating dangerous external writes. No provider operation or private Git mutation has been authorized by A09's source-engineering instruction.

## Cutover / release no-go

The release stays **HELD**, even if all code CI jobs are green, until necessary scenario-specific D/B/H/GIT/L and accessibility/source-identity evidence are independently observed and accepted. Current passable code may be merged as an engineering checkpoint, not described as fully live-accepted. Historical I17 uncertain resource is permanently quarantined from automatic CREATE/RENAME.
