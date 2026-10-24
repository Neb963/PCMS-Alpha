# PCMS-Alpha

Combined Firefox extension for guarded PersonaMonkey accounts, generator lifecycle, Git main intake, source development, exact-source publication, Refresher and portable backup/restore.

**Active engineering program:** [Recovery A00–A09](docs/implementation/RECOVERY-PLAN-2026-10-22.md), governed by the [accepted browser-only client amendment](docs/authority/PCMS-Alpha-CLIENT-AMENDMENT-v1.0.1.md). Historical I17/S-slice reports do not establish live acceptance.

Build the **XPI only**: `node scripts/build-i00.mjs` → `build/pcms-alpha-i00.xpi`. Distribution is a single extension plus the pre-existing, unmodified PersonaMonkey `com.persona.mullvad_router` bridge. There are no PCMS-specific installed native helpers, keyrings, witnesses or encrypted backups.

[Operator installation, upgrade and recovery](docs/operator/OPERATOR-GUIDE.md). Source-level (D), packaged-Firefox (B), real host (H), private Git (GIT) and authorized provider (L) evidence are reported independently; no current green CI run proves full live acceptance.

Pinned original PersonaMonkey donor: `9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf`.
