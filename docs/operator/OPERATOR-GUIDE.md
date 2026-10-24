# PCMS Alpha — XPI-only operator guide (A08)
 
**Status:** Engineering test candidate only. Live Perchance, protected Mullvad routing, private generator Git writeback and host/disk acceptance need their separate authorized evidence. Do not treat a green fixture or Firefox CI check as live acceptance.

## Prerequisites

Use Firefox Developer Edition, Nightly or an ESR variant that allows persistent installation of this unsigned XPI. On a dedicated profile, configure `xpinstall.signatures.required=false` if needed. The installed Gecko extension ID is `persona-route-manager@local`.

PCMS is delivered as **one combined XPI**, with no PCMS installer, supplemental native host, vault, recovery key, diagnostic daemon or witness patch. The only permitted native messaging bridge remains PersonaMonkey's existing `com.persona.mullvad_router`, installed and configured under PersonaMonkey's own documented setup. PCMS neither replaces nor modifies that bridge. Verify protected Mullvad route health through PersonaMonkey before any managed provider action.

The Firefox driver's isolated process/upgrade test infrastructure is for CI, not an operator-installed prerequisite.

## Install and upgrade

1. Obtain the exact `pcms-alpha-i00.xpi` artifact and its published SHA-256 from the current reviewed GitHub Actions build. Verify its hash independently with `sha256sum pcms-alpha-i00.xpi`.
2. Save an independent profile checkpoint before upgrading a profile containing existing sessions, source or journal history. Never migrate an uncontrolled profile just to test a release candidate.
3. In Firefox, open `about:addons`, choose **Install Add-on From File**, and select the XPI. Upgrades keep the existing Gecko ID. If Firefox reports an installation or update error, stop rather than erase the profile.
4. Click the extension toolbar action to open PCMS. Keep the same existing PersonaMonkey route owner. Confirm diagnostics, account/Persona bindings and source inventory before authorizing effects.

A clean disposable profile can verify UI and browser persistence without a native host or real Perchance account; **protected route and provider operations must remain held** until route admission and scoped authorization are established. Do not copy test fixtures or the original I17 uncertain generator into a live workflow.

## Routine workflow

- **Accounts:** Add an account, let PersonaMonkey prepare its protected Persona/route, complete human login/CAPTCHA as needed, then verify login/route.
- **Generators:** Create slugs or reconcile GitHub `main` folders; the background intake persists work before guarded provider dispatch. Unknown/lost ACK effects require read-only reconciliation.
- **GitHub:** Connect the approved repository with a scoped token in Settings/Catalog. The token stays in background-only Firefox local persistent storage and is excluded from portable backups. No OS credential store or recurring password is required.
- **Work Queue:** READY development and tests produce a candidate tied to exact source. Individually review its exact bytes before approving publication. A stale/dirty source or uncertain write remains held.
- **Refresher:** Enable only for eligible owned generators. Background alarms reconstruct from durable state on wake; active credit is conservative while wall-clock rest advances. Saved source and recent-feed presence are independently measured.
- **Settings:** Manual and daily backups are **passwordless, unencrypted, portable and source-complete**. Check browser download receipts and inspect a backup through the guarded import/restore preview. Browser-reported download completion is not independent disk-byte proof. Default retention is 14 successful tracked archives.

## Diagnostics and recovery

Use Settings diagnostics or the emergency read-only export to see per-capability status, error codes and the next safe action. Never upload raw cookies, credentials, session data or source blobs. On restart, confirm the original account/Persona identity and route before new effects. An uncertain create, save, publication or restore action must be observed rather than blindly replayed.

A restore leaves managed automation inactive and requires protected identity/source review, account-login re-verification and Git re-connection where applicable. If a prior profile's operation journal is missing, do not infer an external effect is absent. Production readback, private Git writes, disk/process host evidence and real Perchance effects are **NOT_TESTED** until independently observed at their correct tiers.

See `docs/authority/PCMS-Alpha-CLIENT-AMENDMENT-v1.0.1.md` and `docs/implementation/RECOVERY-PLAN-2026-10-22.md` for the binding behavioral limits.
