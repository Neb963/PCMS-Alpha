# S01 technical amendment v1.1: legacy upgrade in place and Archive idle release

**Status:** Proposed with PR #23. Effective only after independent review and merge. It **extends** `S01-ROUTE-PIN-AMENDMENT-v1.0.md`, which is preserved unchanged. It corrects two places where v1.0's implementation fell short of Client Contract v1.0.0. The route-pin mechanism and every v1.0 invariant are unchanged.

## 1. Correction 1: pre-S01 accounts are upgraded in place (C-56–C-59)

**Defect in v1.0:** accounts bound by the earlier manual flow were held with "archive it and use Add Account". Because a principal recorded for any other account is never reused, that instruction ends in `IDENTITY_ALREADY_BOUND`. It also discards the account's generators, history and associations.

**Behaviour now:** the account keeps its ID, Persona, container and session, principal, state, revision, binding version, history and associations.

1. `BEGIN_UPGRADE` (`accounts.mjs`) adds only a binding ID. It records `priorExitHistory:'UNOBSERVED'`; earlier exits are unknown, never assumed unused. `boundPrincipal` is set to the account's original verified principal: its current identity, else the identity preserved in its latest archive entry. If another account (active, archived or pre-S01) holds that principal, the upgrade fails `IDENTITY_ALREADY_BOUND` before any donor mutation. Revision is unchanged.
2. The donor tags the **existing** Persona in place (`tagExistingPersona`). A one-commit `TAG` fence permit allows exactly one tag on one managed, untagged Persona with no other state change. Tagging is fail closed: the Persona's traffic now needs a pin.
3. `ensurePinnedRoute` is the same code as for new accounts.
   - The Persona's current route is tried first.
   - It is pinned only if it is an official Mullvad relay route, verified for IPv4, IPv6 and DNS, and its exits are not recorded for any other account.
   - Otherwise another unique exit is chosen and assigned.
4. The original principal is revalidated on the Persona.
   - Same principal: no state change.
   - Missing session or a different login: `VERIFICATION_PENDING`. Confirm then accepts only the original principal; the account is never rebound.
5. `COMPLETE`. Repeated invocation is a no-op. Upkeep resumes unfinished upgrades after suspension or restart and upgrades active pre-S01 records automatically. Archived pre-S01 records are upgraded through the same record on reactivation.

**Holds and recovery:** each step is persisted before its donor effect and reconciled by reading donor state (tag by binding, route by host, assignment by profile). A missing, ambiguous, archived or foreign-bound Persona holds only that account with a specific message. For a Persona that is gone, the one explicit action is **Create replacement Persona** (`REPLACE_PERSONA`): same account, `boundPrincipal` kept, `REBIND_PENDING`, and a fresh login must prove the original principal. The ledger lets a binding move to a new Persona only for that replacement and never while its pin is live.

**Revision stability:** route status, setup and upgrade progress are metadata and no longer change the account revision. A same-principal revalidation rewrites nothing, so generator and source associations bound to the revision stay valid.

## 2. Correction 2: Archive releases the account's own idle route resources (C-56, C-58, C-59)

**Defect in v1.0:** release was left to PersonaMonkey's `maybeStopIdle`. That only stops the **global** tunnel after `autoStopMinutes` with no Mullvad tabs. Upkeep also kept probing archived accounts, which re-prepares their forwarders.

**Donor operations reused** (same-XPI adapter, no new router or daemon):

| Need | Donor mechanism |
|---|---|
| Refuse while work holds the Persona | `localMutationFence(container, …, "block")` throws `PERSONA_CONTROL_BUSY` on any active control lease |
| Running donor jobs | `listActiveProfileIds()` |
| Human/PCMS tabs | `browser.tabs.query({cookieStoreId})` |
| Release one forwarder | `mullvadRuntime.drop(routeId)` and native `release_exit` (the donor's `MULLVAD_RELEASE_ROUTE` path) |
| Observe without mutation | native `status().active_exits` via `getNativeStatus()` |

**Lifecycle:**
1. Archive transition (durable first). All new automation stops, because every effect path requires the account to be active and verified. Dispatched operations keep their journals for observation; nothing is cancelled or retried.
2. `inspectRouteUse` must show a Mullvad route used only by this Persona, with no tabs, jobs or lease. Otherwise the account is `RELEASE_DEFERRED`; the human tab keeps working and the pin stays.
3. Release order: withdraw the pin, then ledger `HELD ARCHIVED_RELEASED`, then the donor release, which re-checks inside the fence. Results:
   - `RELEASED`;
   - `RELEASE_DEFERRED` if the route came into use in between;
   - `RELEASE_UNCONFIRMED` if the native host failed.
4. Upkeep never probes archived accounts. It retries only deferred releases, and reconciles unconfirmed ones by observation first (`active_exits`) before any second teardown. Release is a local, idempotent teardown, not a provider effect.
5. Kept throughout: Persona, cookies and session, principal, generator associations, ledger exit owners, and the binding's route identity. The global tunnel and other Personas are never touched.
6. Reactivation re-probes the same pinned route, which re-prepares the forwarder. It activates the pin only if the observed exits are still this account's, then revalidates the original principal. A failing route can be repaired under operator presence.

**Security note:** a released archived Persona carries no traffic until reactivation, so exit drift on an archived route can never be exercised unobserved. While a release is deferred because a human tab is open, protected browsing continues as in v1.0.

## 3. Evidence

- **D:** production modules over a fake PersonaMonkey with its own effect log, plus the production adapter extracted from the staged `background.js`. Covers upgrade in place, archived pre-S01 records, principal collision, foreign exits, missing Persona and replacement, a non-Mullvad or unknown-IPv6 legacy route, lost tag acknowledgement and crash resume, idempotency, idle release, lease/tab/job/shared deferral, native loss, upkeep not re-probing, and repeated Archive/Reactivate. Each new rule was mutation-checked.
- **B:** the installed XPI upgrades a seeded pre-S01 record in place (same ID, Persona, principal and revision). The tagged legacy Persona is blocked until it is pinned. Archive defers on an open tab and releases idle through the real donor fence, which reports `RELEASE_UNCONFIRMED` without a native host.
- **Not proven:** real native forwarder release and recreation on a Mullvad host, and a live re-login. These are H/L holds.
