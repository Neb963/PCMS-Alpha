# PCMS-Alpha — Browser-Only Operation Amendment

**Document ID:** PCMS-CLIENT-02  
**Version:** 1.0.1 (additive supersession of client contract v1.0.0)  
**Decision date:** 2026-10-22  
**Status:** CLIENT-ACCEPTED PRODUCT DECISIONS; NOT YET IMPLEMENTED OR LIVE VERIFIED

## Authority and precedence

This is the user's explicit, non-negotiable clarification of the installed-product contract, superseding *only* contrary native-service, secret-vault, encryption, clock-witness and operator-warning requirements in `PCMS-Alpha-CLIENT-SPEC-v1.0.0.md`, `PCMS-Alpha-ACCEPTANCE-MATRIX-v1.0.0.md`, Gate B technical design and historical Stage 7/I15/R3/R4 materials. The preserved originals remain historical evidence. For implementation and acceptance these later client decisions prevail. Other source, ownership, route, uncertainty and publication protections are unchanged.

Do not reintroduce the superseded constraints as "security improvements", test prerequisites or mandatory UI notices. Any consequential change requires a **new explicit client decision**, not engineering inference.

## A — GitHub credentials

- Store the configured GitHub token in Firefox extension-local persistent storage, accessed only by trusted background extension code and never intentionally exposed to web pages/content scripts/logs/diagnostics.
- **No password, passphrase, OS keyring/Secret Service, external PCMS credential service, mandatory reentry per job, or vault dependency.**
- Git credential is excluded from exported backup archives. Restored profiles reconnect GitHub when needed.
- No credential-risk warning, recurring acknowledgment or announcement in PCMS UI. Technical storage assumptions and limitations belong in repository/code documentation.
- Preserve existing GitHub repository identity validation, limited credential scope, revision and write authority, and remote readback safeguards.

## B — Refresher schedule persistence and recovery

- Persist all meaningful policy/schedule/interval/operation checkpoints in PCMS browser storage. Use Firefox `browser.alarms` for wakeups; recreate lost alarms on startup/extension wake.
- Upon wake, reconcile persisted timestamps and state against the current wall clock and observed provider/source/route state before continuing. Do not require Linux clock-witness services, PersonaMonkey host patches, `sudo`, geckodriver or any additional local process.
- **Rest** progresses by elapsed wall-clock time, including while Firefox is closed. **Active work/qualified operating time** cannot be fabricated for intervals where Firefox/PCMS did not execute or confirm work. Resume the active budget conservatively after gaps. Whether a time window elapsed and whether source saves/recent visibility were observed are separate facts.
- Persist intended due work; do not burst-replay missed writes, infer successful refreshes from elapsed time, or retry an uncertain external effect without readback.
- Existing approximately 24h active / 72h rest policy, actual recent-feed measurement, source integrity and scope protections remain product obligations. If implementation cannot distinguish shutdown/sleep/time changes precisely, conservative time accounting is acceptable, not invented historical evidence.

## C — Backups (explicit non-negotiable)

- **All PCMS backup export, scheduled daily backup, archive rotation/retention, import and restore must be completely passwordless and unencrypted.** No passphrases, recovery keys, certificate/key provisioning, OS credential store, Secret Service, native vault, or mandatory external process.
- Use browser-native serialization, storage and downloads for **source-complete**, portable, plain-language/plain-format backup artifacts, with integrity manifests/checksums and verification before marking a backup successful.
- Backup includes required PCMS state, source snapshots, histories, settings and recovery metadata, and supports inspected restore on existing or fresh browser profiles. Exclude GitHub tokens and other intentionally excluded credentials.
- Maintain retention (default 14 successful archives), last-known-good preservation, interrupted-export handling, restore inspection and source/route safety checks. No encryption-related UI, security warnings or qualification flow. Show actual operational failures only.
- Browser APIs cannot always independently reread disk bytes after download. State the actual verification evidence honestly in developer docs/tests; do not restore a native service or encryption to obtain stronger proof.

## D — Diagnostics and runtime dependencies

- The **existing PersonaMonkey Mullvad routing bridge** is the only permitted OS-side dependency for the installed PCMS product; PCMS must not add native messaging services or patch that bridge for unrelated functions.
- Isolated `geckodriver` / browser process tests belong in CI/developer tools and must not be installed or checked as user prerequisites.
- The combined XPI must provide routine Git, Refresher, source-complete backup/restore and functional diagnostics without extra PCMS installers, host registrations, Python modules or daemon services.
- Readiness checks must be per actual capability; absence of optional developer diagnostics may not block user operation. Do not display generalized local-services-unavailable warnings after the migration.

## Superseded acceptance language (explicit)

- AC-14/AC-15 and engineering gate E-04: require durable browser-native schedule reconstruction and truthful operational observation, **not** a patched native clock witness or impossible retrospective uptime proof.
- AC-17 and engineering gate E-06: replace "encrypted integrated backup", "locked key" and "host-protected unattended key handling" with **plain passwordless browser-native source-complete backup, verified portable export and inspected restore**.
- AC-11/Git preparation: a native OS vault must **not** be a requirement for normal Git operation.
- AC-16: local `geckodriver` is **not** required; keep real functional diagnostic tests and independent development CI.

## Acceptance delta

The release is not operator-acceptable unless the exact installed XPI, with only the existing PersonaMonkey Mullvad bridge, proves:

1. One-time Git connect, complete authorized read/writeback and restart recovery without a vault, password or recurring warning.
2. Refresher start, relevant persisted schedule recovery across worker suspension and Firefox restart, appropriate active/rest accounting, independent source/feed evidence, and no additional witness patch.
3. Manual and daily **unencrypted/passwordless** source-complete backup; download artifact validation as far as Firefox permits; retention, import, inspected safe restore and recovery without keys.
4. Usable diagnostics with no geckodriver or PCMS native hosts on the user's machine.
5. No regression in protected Persona/Mullvad routing, source integrity, authority, or exact-source publication approval.

A test that passes only because native PCMS helpers are installed **does not pass** this release condition.

## Change log

- **2026-10-22 (operator decisions A–D):** Accepted plain browser-local Git credentials without UI warnings; persisted browser-native Refresher wake/reconciliation; absolutely passwordless, unencrypted backups; removal of production native diagnostics and all extra PCMS host dependencies. Historical contradictory technical and acceptance requirements are superseded only as specified above.
