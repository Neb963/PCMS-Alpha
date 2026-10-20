# S08 — PCMS operator guide (superseded)

> **Superseded by [the operator guide](../operator/OPERATOR-GUIDE.md)** and the operator package built with `node scripts/build-operator-package.mjs`. This file is kept as historical S08 evidence.

**Engineering status:** S08 is a full-capability integration *candidate*, not yet an accepted release. The [S08 PR](https://github.com/Neb963/PCMS-Alpha/pull/31) and required current-head CI determine packaged engineering status. Live Perchance effectiveness must be reported independently.

## Installation

Use a local checkout of the S08 PR branch, Node.js 22+, Python 3 and compatible Firefox (153+). Run:

```bash
node scripts/verify-donor.mjs
node scripts/build-i00.mjs
sha256sum build/pcms-alpha-i00.xpi
```

The XPI is the combined **full PCMS + PersonaMonkey** product. It is not intentionally restricted to read-only functionality. Preserve the existing browser profile and an independent backup before replacing an earlier extension. On an **isolated disposable** Firefox ESR/Developer profile, use `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on** and choose the XPI. A temporary installation does **not** persist across Firefox restart and is not a substitute for persistent-install CI evidence. A durable unsigned install requires a test build/profile that permits unsigned extensions; normal signed Firefox may require Mozilla signing. Do not weaken signature enforcement in a daily-use profile.

Click the toolbar PCMS icon to open or focus the full dashboard.

## Native setup

Keep the original PersonaMonkey Mullvad bridge; see `donor/personamonkey/docs/getting-started/installation.md`. PCMS does not change that routing authority. On Fedora, ensure Python 3, Python `cryptography`, `secret-tool` (libsecret-tools) and a working, unlocked OS Secret Service session. In the S08 checkout run:

```bash
bash scripts/install-s08-local-hosts.sh
```

This only installs user-scoped native wrappers/manifests for `local.pcms.backup_vault`, `local.pcms.backup_v2` and the isolated Firefox diagnostic host `local.pcms.diagnostic_browser` in `~/.mozilla/native-messaging-hosts/`. It does not install the PersonaMonkey router, modify route configuration or store credentials. Keep the checkout location stable and restart the **test** Firefox profile. A registered native host does not itself prove working backups or restore.

## Initial configuration and guarded features

Use **Accounts** to add and verify an account with its dedicated Persona, genuine Perchance login and successfully verified protected route. Use **Settings** to connect the private Git repository and store its credential through the native vault. Current standing-authority scope is restricted to `Neb963/per-gens`. Review the one-time Git import before admitting external folders.

In **Settings → Protected workflow activation**, review the scoped account/route/source and explicitly authorize **development** and **Git** using the displayed consent phrase. Publication has its own grant and always requires exact-source human review and approval. Enable Refresher marker writes *separately* in the Refresher controls. Set the recovery passphrase and enable scheduled backup explicitly in Settings. A consent grant never overrides wrong-owner, route, source, pending journal or restore protections.

## One-button diagnostic

In **Settings → Full diagnostic**, select a disposable verified account and its already bound Persona, enter a dedicated `pcms-test-` namespace, explicitly confirm that the resources are disposable, and save. The full-XPI SHA-256 is optional initially and needed only for isolated local Firefox and backup/restart tests; it can be saved later without changing an active run's account, Persona, repository or namespace. Choose **Run full diagnostic**. A unique slug and immutable create intent are reserved for that run. Its stages use real production ports and original effect journals, not fake handlers.

When it stops on `TEST_READY_DECLARATION_REQUIRED`, create a coherent source on a Git development branch for **this exact test slug** and merge the reviewed `DEPLOYMENT.md` READY declaration to the selected test repo's `main`; then press **Resume failed stage**. Other stages should progress through normal READY development, native AI, test evidence and Git writeback. When the report requests human publication approval, review the **exact candidate** in Publication, approve it there, then resume. The diagnostic never publishes automatically.

The diagnostic attempts a bounded isolated Firefox process restart using the exact locally built candidate XPI and an installed `geckodriver`; this checks the candidate in a disposable profile, not the identity of an already installed user-profile XPI. It returns NOT_TESTED/HELD unless independently completed. The backup/restore diagnostic uses the existing production H witness in an entirely disposable Firefox profile and isolated HOME/Secret Service. It verifies encrypted disk reopening, 50 Personas, 1,024 source histories and inactive fresh-profile restore. It requires `dbus-run-session`, `gnome-keyring-daemon`, `secret-tool`, compatible Firefox and geckodriver. Missing prerequisites or a failed H witness remain HELD/NOT_TESTED. This is not proof of live Perchance behavior. Refresher runs through the real guarded marker save and independently observed recent-feed receipt; a saved marker without later positive feed evidence does not PASS. AC-16 becomes PASS only after the complete authorized disposable end-to-end scenario has independently verified outcomes; missing live interactions remain NOT_TESTED. Ordinary guarded production controls remain accessible when their current resource-specific prerequisites hold. Do not interpret a diagnostic stop or a green synthetic test as live provider success.

## Debug and export

If a stage is uncertain, consult **Work Queue**, **Attention** and the appropriate generator history. Review acknowledgment records that you saw the incident; it does **not** remove holds. Never retry a potentially dispatched external write until the production recovery readback has reconciled it. Click **Export sanitized report** and record the installed XPI SHA-256, Firefox version and first failed stage. The diagnostic preserves its test-owned remote artifacts. After manually deleting the designated disposable generator and its Git folder through the respective native interfaces, use **Verify test-only cleanup**; PCMS independently checks guarded Perchance target absence and Git-main folder absence twice before marking cleanup verified. The diagnostic never automatically deletes resources, and failure to verify never means cleanup succeeded. Do not export credentials, cookies, raw source, account IPs or native vault secrets.

**Manual live-provider scope:** CI already exercises packaged installation/restart, native vault, 50-Persona/1,024-history capacity, negative paths and recovery. The operator should concentrate on protected Perchance login/route approval, actual disposable generator creation, READY/native AI development, exact-candidate publication approval and Refresher recent-feed observation—not rerun completed synthetic CI tests.
