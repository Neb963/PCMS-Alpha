# S06 — Git writeback, candidate review and human publication

**Status:** implementation in progress; no provider/private-Git/native effects authorized. Engineering parent: merged S05 `6e76d28fb628bf8bd54481edd3d7fefa40496318`.

**Accepted journeys:** AC-11–13, E-05/E-09, T-02/T-03/T-04. After verified S05 F, commit precisely those tested deployable bytes conditionally to `per-gens/main`, independently read back commit/bytes/lineage, present that same F with exact previous source and tests for human review, and publish only after explicit individual approval. Existing public updates use a bounded hold and only unlist when eligible. Request Changes must preserve lineage and invalidate old approvals. Unrelated Git commits are not conflicts; relevant edits and uncertain ACKs are holds, not silent merges or retries.

**Protected boundaries:** no separate router, no token persisted in XPI/IDB, no automatic provider release, no changed trusted CI/Stage 7 or frozen donor. Original I17 CREATE/RENAME target remains quarantined. Missing live / private-Git authority holds actual effects, not independent deterministic engineering.

**Evidence ledger:** D/B/H/GIT/L NOT YET REASSESSED on S06 HEAD. Do not promote stale I11/I13 tests to S06 live PASS. All intended changes require exact-head required CI and installed packaged Firefox B before safe engineering merge.
