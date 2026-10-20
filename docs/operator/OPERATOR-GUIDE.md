# PCMS Alpha — Operator guide

PCMS Alpha is one Firefox extension (PCMS + PersonaMonkey, extension ID `persona-route-manager@local`). It manages your Perchance generators through dedicated, Mullvad-protected Personas. This guide covers installation, first setup, the first live diagnostic, backup/restore and debugging.

> **What has and has not been tested.** Every feature was exercised in CI against an installed copy of this exact XPI in Firefox, with real native hosts and a real Secret Service. Perchance itself (login, creating generators, saving source, native AI, publishing, the recent-generators feed) has **not** been tested live; your first diagnostic run is that test. If something fails, export the report (see *Debugging*) and we fix it together.

## 1. Requirements (Fedora)

- Firefox Developer Edition, Nightly or ESR, or LibreWolf. These are the builds that can load an unsigned extension persistently. Use a **dedicated profile** (`firefox -P`) and set `xpinstall.signatures.required` to `false` in that profile's `about:config` only.
- PersonaMonkey's Mullvad bridge, installed with its own installer (`donor/personamonkey/install.sh`, see its `docs/getting-started/installation.md`). PCMS never replaces its routing.
- `sudo dnf install python3 python3-cryptography libsecret`, plus `geckodriver` if you want the isolated restart diagnostic.
- A desktop session with an unlocked keyring (GNOME Keyring or KWallet's Secret Service).

## 2. Install

1. Unpack the operator package: `tar xzf pcms-alpha-operator.tar.gz && cd pcms-alpha-operator`.
2. Install the native hosts: `./install.sh --with-runtime-witness`.
   - This registers three user-scoped hosts: `local.pcms.backup_vault` (OS keyring for the backup passphrase and GitHub credential), `local.pcms.backup_v2` (source-complete backups) and `local.pcms.diagnostic_browser`. They go in `~/.mozilla/native-messaging-hosts` (and `~/.librewolf/...` if present) and point at a stable copy in `~/.local/share/pcms-alpha/current`.
   - `--with-runtime-witness` (asks for sudo) adds PCMS's read-only clock witness to the installed PersonaMonkey native host. It only does this if that host is the exact version PCMS was built against, and the original is backed up as `native_host.py.pcms-original`. **The Refresher needs this witness to count eligible time; without it, Refresher timers never advance.**
   - The installer ends by running `./pcms-native-check.py`. Every line should read `OK`. Re-run it any time.
3. Restart Firefox. Open `about:addons` → gear → *Install Add-on From File…* → `pcms-alpha.xpi`. Check that its SHA-256 matches the one published with the release (`sha256sum pcms-alpha.xpi`).
4. Click the toolbar icon. It opens (or focuses) the full PCMS dashboard.

To remove the native hosts later, run `./uninstall.sh`. It also restores the original PersonaMonkey host if PCMS replaced it.

## 3. One-time setup

All of this is in the dashboard and is done once.

1. **Accounts → Add Account.** PCMS creates a dedicated Persona with its own reserved Mullvad exit. Log in to Perchance in the tab it opens, then press **Confirm login**. Repeat for each account.
2. **Generators → GitHub main catalog → Connect GitHub.** Enter a fine-grained token for `Neb963/per-gens` (Contents: read and write). It is stored once in the OS keyring, never in Firefox storage, backups or Git. Every later Git read and write uses it; the other "token override" fields are optional. If the keyring is lost (new machine, restore), Attention shows *GitHub connection needs attention*. Reconnect once and queued work continues.
3. **Settings → Protected workflow activation.** Tick **development** (creation, adoption, READY staging, native AI) and **Git** (NOT_READY folders, original archives, tested-source writeback). Add **publication** if you want PCMS to be able to publish sources you approve. Type the confirmation phrase and apply. **Pause all external effects** revokes everything instantly.
4. **Settings → Scheduled backup.** Store the recovery passphrase in the OS vault. Choose **Source-complete** and **Use this format**; PCMS checks the native host first. Then enable daily backup.
5. **Refresher.** Review the active/sleep hours (24 h/72 h by default) and tick *Enable guarded automatic marker saves* when you want Refresher saves.

From then on PCMS runs by itself:
- Your owned generators are adopted automatically: the original is captured, then archived to Git.
- Slugs you paste into **Create generators**, or new `generators/<slug>/` folders merged to `main`, become private empty generators with a NOT_READY folder.
- A coherent `DEPLOYMENT.md` `Status: READY` declaration starts staging, native AI development and tests, then writes the tested source back to Git.
- You review and approve each final source in **Work Queue → Exact-source publication review**. **Approve and publish this exact source** approves it, publishes it once and confirms publication independently.

## 4. First full live diagnostic

1. Add a **throw-away** Perchance account (Accounts) and confirm its login.
2. **Settings → Full diagnostic:** choose that account, enter a namespace such as `pcms-test-alpha`, tick the disposable confirmation and paste the XPI SHA-256. Then press **Save disposable scope**.
3. Make sure the development and Git grants are active (step 3.3).
4. Press **Run full diagnostic**. PCMS:
   1. creates a private test generator;
   2. creates its NOT_READY Git folder;
   3. declares READY with a small test source (test namespace only);
   4. waits for READY intake, native AI development and tests, then tested-source writeback;
   5. stops for your **exact-source approval** (Work Queue, then press **Resume failed stage**);
   6. confirms publication;
   7. checks the Refresher marker save and recent-feed placement (enable Refresher saves first);
   8. runs the isolated source-complete backup/restore and real Firefox restart checks.
5. A stage that cannot be verified stays **HELD/UNCERTAIN** with its code; nothing is ever reported as PASS without an independent observation. Fix the cause, then press **Resume failed stage**. **Full rerun with new slug** starts over with a fresh test generator.
6. PCMS never deletes test resources. Delete the test generator and its Git folder yourself, then press **Verify test-only cleanup**.

## 5. Backup and restore

- **Source-complete (v2)** backups hold full generator sources, PersonaMonkey state and PCMS records. They are encrypted, re-read and fully decrypted before they count, stored by the native host, and the last 14 successful backups are kept (the last known-good one is never deleted). **Legacy (v1)** downloads are encrypted browser downloads and are **not** guaranteed to be source-complete.
- **Back up now (source-complete)** runs one immediately. Failures appear in Attention and in the backup status, and clear after the next verified backup.
- **Restore:** Settings → *Restore from an encrypted backup*. Preview first (nothing changes), check the account list, then apply. A restore always leaves the controller **inactive** and withdraws all grants. Afterwards: reconnect GitHub, re-verify each account's login and route, map Personas if asked, and re-apply the grants in Protected workflow activation.
- **Removed accounts** (Accounts → archived account → *Remove permanently…*) are excluded from later restores unless you explicitly re-include them. Removal deletes the local account record, its login identity and (optionally) its Persona and session. It keeps generators, sources, backups and exit history, then triggers a fresh backup. Older backups and manual exports may still contain the account.

## 6. Debugging a failed action

1. **Overview → Needs your attention** groups problems by cause, with what to do. *Mark reviewed* acknowledges an incident; it stays until PCMS observes recovery.
2. **Work Queue** shows per-item receipts. An item in `DISPATCH_POSSIBLE`, `UNCERTAIN` or `HELD_RECONCILE` may already have had a remote effect. PCMS only checks it by read-back, so **do not repeat the action by hand**.
3. Re-run `./pcms-native-check.py` for host, keyring and witness problems.
4. Restricted environment: `about:debugging#/runtime/this-firefox` → PCMS → *Inspect* shows background errors.

## 7. Exporting a report

- **Settings → Full diagnostic → Export sanitized report** (JSON), or the **Emergency redacted diagnostics** link (Overview). Neither contains credentials, cookies, raw source, IP addresses or keyring secrets.
- When reporting a problem, include: the report, the XPI SHA-256, your Firefox version, the first failed stage/code and the output of `./pcms-native-check.py`.
