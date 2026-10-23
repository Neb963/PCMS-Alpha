# A02 — portable passwordless backup/restore (work in progress)

Base: `cd76281e248810a517754f7141a2d13a7b32db10` (A01 postmerge required CI `39780010750`: baseline, fast, Firefox, aggregate SUCCESS). A01 product oracle `A01_RED_P0_BACKUP_PASSWORDLESS` is **RED** on the merged baseline. No live/provider/private-Git/personal-profile effects authorized.

## Bounded contract
- Passwordless, plaintext, versioned, source-complete portable archive; strict digest/length validation, token exclusion, Persona/cookies/GM/settings/journal fidelity.
- Browser-native automatic and manual exports, tracked 14-copy retention with no incorrect disk-readback claim.
- Inspected import, explicit conflict choices, verified destination checkpoint, persisted restore intent, no replay of possibly issued donor or cookie effects, inactive controller pending route/session revalidation.
- Large 64MiB+/100k+ fixtures with bounded-memory instrumentation, production-code deterministic tests and clean persistent Firefox XPI roundtrip.
- Preserve donor files and `com.persona.mullvad_router` admission, exact source, I17 quarantine and accepted historical records.

## Initial baseline observations
- Manual UI `src/ui/backup-view.mjs` requires >=12-character passphrase and uses encrypted nested envelopes and v1 64MiB limit.
- Scheduled `src/runtime/backup-auto-run.mjs` requires OS vault and optional v2 native helper. Its browser retention is for `.encrypted` downloads.
- `src/ui/restore-view.mjs` and `src/runtime/restore-boundary.mjs` require encrypted archive/checkpoint and password and implement an inactive restore guard.
- Existing `snapshotCanonicalV2`, source-closure audit, donor portable serializer, stage engine and guardian can be reused; do not silently treat legacy encrypted backups as new portable archives.

**Not an acceptance or release.** Remain draft until all affected required tests, installed-XPI B and independent review/postmerge verification. This note is a remote checkpoint, not a substitute for implementation.
