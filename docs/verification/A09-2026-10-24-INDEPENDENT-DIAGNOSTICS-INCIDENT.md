# A09 operator incident: incomplete initial inventory does not block unrelated tests

Date: 2026-10-24. Trigger: operator supplied two sanitized JSON reports from combined XPI v1.2.6.

## Evidence observed

1. Operational readiness (read-only, remote requested) verified extension runtime, browser storage, configured private Git repository identity, authenticated GitHub API GET, complete pinned main tree, extension IndexedDB credential, local account port and portable-backup *runtime port*.
2. The disposable S08 chain recorded `SCOPE: PASS`, then `CREATE: HELD / INITIAL_INVENTORY_UNKNOWN`. Every later effect stage was `NOT_TESTED / NOT_REACHED`. The report does **not** support a claim of failed Git writeback, AI, Refresher, export, restore, or browser restart.
3. Root-cause control in `src/runtime/creation-allocation.mjs`: `selectS04Account` refuses to allocate any new slug until each non-archived managed account has `inventoryComplete:true`. The coordinator derives that flag from actual committed `inventory-batch:<accountId>` records after `SYNC_ACCOUNT`; it is never inferred from `LIST_INVENTORY` alone. This is a necessary protection against incorrect zero counts and incorrect ownership.
4. Distinct orchestration defect in `src/ui/s08-diagnostics.mjs`: `drive()` stops after any failed chain stage. There was no exposed standalone read-only test runner; independent capabilities appeared `NOT_REACHED` even when prior preflight observed them working.

## Bounded repair and truth labels

- Keep the **protected creation hold**. Never invent an inventory batch, mark account complete on local list presence, run provider create, or loosen route/identity gates.
- Add independently executable, **read-only** module probes: Git identity, complete Git main, local browser Git credential, local Accounts, local Inventory, Refresher policy, authorization record and browser portable-backup runtime.
- Use `Promise.allSettled` so a failed/nonresponsive module returns `NOT_TESTED` for itself while unrelated modules report their own outcomes. A passed local/ref read does not prove live Perchance, a backup was downloaded/reopened, a Mullvad exit, a writeback or a publication.
- Persist only bounded nonsecret component codes; export a sanitized report independent of an S08 live run, while optionally incorporating the previous held S08 chain verbatim.
- Provide direct links to **Accounts and inventory**, **Backup and restore**, and **Refresher**, so controlled manual module tests can proceed without running the end-to-end CREATE/READY/AI/PUBLISH sequence.
- On the operator's existing v1.2.6 profile, the shortest safe recovery for `INITIAL_INVENTORY_UNKNOWN` is **Accounts → Manage → Sync generator inventory** for each non-archived managed account, or the fleet inventory sync action. These are guarded READ ONLY observations; success requires a verified protected route/owner. After successful inventory synchronization, **Resume failed stage** on the existing S08 run, not Full rerun/new slug. Preserve uncertain I17 quarantine.
- Package as v1.2.7 under the same Gecko ID. Keep old v1.2.6/profile checkpoint. CI verification does not substitute real account/route, file restore or provider acceptance.

## Verification plan

D: independent local/remote read labels, individual failed port containment, sanitization of export, S08 chain still HELD on missing inventory, static primary UI wiring and test links.

B: full installed-XPI Firefox v1.2.7 upgrade; independent read-only module check runs with no disposable S08 scope and no live provider mutation; test list and export are visible; donor routes fail closed. No new native PCMS service.

Postmerge: merge only with exact-head required checks and verify `main`. Real acceptance remains operator-controlled. If any independent capability needs a real external effect, use that module's existing typed production UI and accepted consent; never manufacture a successful effect from local status.

## No-release / no-change safeguards

Never modify the user's browser profile, native Mullvad bridge, account connection, private repo or live Perchance resource as part of this PR. Do not erase existing diagnostic runs, retry a possible CREATE, or turn a held downstream chain into PASS by running independent status checks.
