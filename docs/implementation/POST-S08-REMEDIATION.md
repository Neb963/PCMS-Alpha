# Post-S08 remediation (one corrective PR, no new phase)

Branch `claude/kind-gauss-t8en5y`. This document records what was found and changed, the evidence tier for each change, and what is still untested against live Perchance. Evidence tiers follow `AGENTS.md`:
- **D**: deterministic tests.
- **B**: installed packaged Firefox (CI `firefox` lane).
- **H**: host/process/disk.
- **L**: live provider. Not available to the agent; every **L** item is NOT_TESTED until the operator runs it.

## Confirmed defects fixed

| # | Defect | Fix | Evidence |
|---|---|---|---|
| 1 | **S08 postmerge Firefox failure** (`I12_REAL_ALARM_WITHOUT_DASHBOARD`). Every event-page wake ran a Refresher turn that recreated `pcms-refresher-turn` at now+1 min. Several 1-minute periodic alarms restart the page more often than that, so the Refresher alarm was postponed forever and never fired with the dashboard closed. | `schedule()` never pushes an earlier pending (or overdue) alarm later; it only moves it earlier. | D `i00-i12-boundary` (fails on old code). B `I12_REAL_ALARM_WITHOUT_DASHBOARD=PASS` and `I12_PERSISTENT_RESTART_BUDGET_PAUSE_SINGLE_ALARM_REPAIR=PASS` (cold start and restart re-create a single alarm). |
| 2 | After **any restore**, the restore guard was never released, so every boundary stayed in `RESTORE_HOLD` permanently. | Explicit operator reactivation of a fully observed `COMPLETE_INACTIVE` restore: the operator attests the previous installation is stopped and types a confirmation phrase. A partial or uncertain restore stays held. Grants stay revoked. | D `i00-remediation-restore-reactivation`. |
| 3 | Publication review, staging and other views sent `token:''`/`passphrase:''` when the field was empty, and the handlers rejected that as `INVALID_PARAMS`. | Views drop empty credential fields; the handlers use the vault credential instead. | D, plus manual reasoning on the release handler. |
| 4 | Read-only **inventory sync** reset `management` from `MANAGED_CREATED` to `OBSERVED_ONLY`, so a PCMS-created generator stopped being stageable after its account's next sync. | Preserve the marker and source state when the account and remote ID are unchanged. | D `i00-i04-inventory`. |
| 5 | Refresher native-clock witnesses and observation readiness covered only the **first 100 accounts**; accounts after #100 never earned eligible time. | One shared readiness pass per turn over all verified accounts (bounded by the 1,000-account state limit); the shared recent-feed read rotates accounts and still respects the shared 429 backoff. | D `i00-remediation-refresher-fairness` (fails on old code). |
| 6 | The Refresher clock depends on the `pcms.runtime_witness` native command, which existed only in an uninstalled S01 candidate host. Operator installs would never credit eligible time. | The operator package installs the PersonaMonkey host plus the witness on explicit opt-in. It replaces only the exact pinned original, keeps a backup and restores it on uninstall. The health check reports a missing witness. | H: installer, witness reply and uninstall restore exercised in a disposable HOME/keyring. |
| 7 | The backup coordinator's `reviewedV2=()=>false` meant production could only make v1 downloads that are not source-complete. | Explicit, persisted operator format choice. Selecting V2 first checks the native host and vault. A failed V2 run is held and never falls back to V1. A restore hold revokes the choice. | D `i00-remediation-backup-format`; B/H existing S02 v2 lanes. |

## Accepted requirements now implemented

- **C-60, C-72–C-75: permanent local account removal.** Removal is a separate, two-step action available only for archived accounts.
  - Deleted: the local record's identity and history, and optionally the dedicated Persona and session (through PersonaMonkey's own `DELETE_PERSONA`).
  - Kept: the account/binding tombstone, exit reservations, generators, originals, Git data and backups.
  - A `removal:<id>` record makes inspected restore exclude older copies of the account by default.
  - A fresh backup is requested afterwards; if it fails, the removal still stands.
  - Evidence: D `i00-remediation-account-removal`.
- **C-10: automatic adoption.** With the standing development grant, a bounded, fair background pass adopts discovered owned generators, public ones included, using the same two-readback capture and conditional Git archive. There is no per-generator checkbox. Drift, disputes and PCMS-created rows are skipped individually. Evidence: D `i00-remediation-auto-adoption`.
- **One-time Git credentials.** A shared OS-vault resolver serves staging, source, writeback, release, AI, adoption and creation. Typed tokens are optional overrides. Vault loss raises one Attention incident; reconnecting resolves it and resumes the queue. Evidence: D `i00-remediation-git-credential`.
- **Unified creation.** One **Create generators** action handles any number of slugs, coalesces each with existing intents and keeps per-item outcomes. The creation watcher schedules a bounded follow-up wake while work remains.
- **Publication review.**
  - Per changed file, the review shows a bounded line diff of the exact canonical previous and final bytes, image previews, or size/hash metadata.
  - **Approve and publish this exact source** is one human decision: the approval, a single fenced dispatch with all re-validations, and an independent read-only confirmation.
  - Evidence: D `i00-remediation-source-diff`.
- **C-68–C-70: Attention lifecycle.**
  - Incidents are grouped by cause.
  - A repeat of the same severity is counted without notifying again or clearing "reviewed"; escalation or recurrence reopens the incident.
  - Only trusted, verified recovery observations resolve an incident, and history is kept.
  - Legacy `ignored` records are shown as reviewed but still active.
  - At most one desktop notification is sent per cause per 30 minutes.
  - Incident sources: fleet-wide provider outage and recovery, account route grace expiry and observed recovery, backup failure and verified success, Git vault loss and reconnection.
  - Evidence: D `i00-s08-attention`, `i00-remediation-incidents` (120-account outage produces one incident and freezes the fleet evenly).
- **Refresher eligible time.** A delayed turn on the same unsuspended native pipe is credited for up to 5 minutes (previously 2). Suspension detection, the pipe identity checks and feed recency checks are unchanged. Evidence: D `i00-s07-operational-clock`.
- **One-button diagnostic.**
  - It declares READY for its own disposable test generator. This is limited to the designated namespace and run and the PCMS-created NOT_READY folder, and requires the Git grant. The write goes through a conditional exact-head writer with readback, is journaled before the effect and is never replayed when uncertain.
  - It then waits, bounded and resumably, for ordinary READY intake, native AI development and tests, and writeback.
  - The only interactive pauses are login, exact-source approval and genuinely uncertain recovery.
  - Evidence: D `i00-remediation-diagnostic-ready` (in-memory GitHub API).
- **Operator delivery.** `node scripts/build-operator-package.mjs` produces a deterministic package containing:
  - the XPI;
  - the user-scoped native hosts in a stable location;
  - the optional witness host;
  - a Fedora installer and uninstaller;
  - a health check;
  - [`docs/operator/OPERATOR-GUIDE.md`](../operator/OPERATOR-GUIDE.md).
- **Dashboard.** Phase IDs and F/P jargon are gone from visible labels, the dead **Start action** button is removed, and the stale "effects are held" text is replaced.

## Cross-feature scenarios

New in this PR:
- vault loss with queued work, then reconnect;
- removal, then backup request and inspected-restore exclusion;
- provider outage across more than 100 accounts;
- inventory sync of a PCMS-created generator;
- interrupted diagnostic READY write, then resume.

Already covered by existing S04–S08 tests and re-run here:
- Git and operator creation of the same slug;
- lost CREATE/RENAME/Git ACKs across restart;
- READY supersession versus helpers, human edits and pending approval;
- Refresher marker versus human edits;
- shared 429 handling without Persona rotation;
- restore revoking grants;
- interrupted diagnostic resume.

## Not tested live (L, NOT_TESTED)

The following have not been run against live Perchance:
- Perchance login and identity readback;
- private CREATE/RENAME;
- editor source saves;
- native AI helper and Chat 2;
- publication listing;
- Refresher marker effect and recent-feed placement;
- Mullvad route probes;
- private-Git writes with a real token.

These are integrated and reachable through the guarded production paths, but only the operator's live diagnostic can establish them.
