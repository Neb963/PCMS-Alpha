# PCMS-Alpha 1.2.14 — Operator guide

PCMS is one Firefox add-on. Its toolbar button opens the dashboard. Work continues with the dashboard closed; a held account or item does not stop unrelated work.

## Install or upgrade

Keep a separate copy of your Firefox profile before upgrading. In `about:addons`, use the gear menu → **Install Add-on From File** and select `pcms-alpha-1.2.14.xpi`. The add-on keeps its existing ID and stored work.

This unsigned package needs Firefox Developer Edition, Nightly or an ESR installation that permits unsigned add-ons (`xpinstall.signatures.required=false` in a dedicated profile). Firefox release editions that enforce signatures cannot install it. Protected accounts use PersonaMonkey's existing `com.persona.mullvad_router` routing bridge; PCMS needs no additional native helper.

## Everyday work

1. **Accounts:** Choose **Add account**, complete Perchance login/CAPTCHA in its protected Persona tab, then confirm login. Use **Open Perchance**, route verification/change and inventory actions in that account. A missing Persona or legacy route has an in-place repair. Archive preserves history; permanent local removal is a separate explicit choice and does not delete remote generators.
2. **Git sources:** From **Generators**, connect your approved repository once. Review its initial `main` folders and proposed allocation, then approve that scope. Later merged folders are discovered automatically. Browse complete source from a generator; edit the default Git prompt under **Settings → AI development**. Reconnect there if access expires.
3. **Create or adopt:** Use **Create generators**, enter disposable slugs and review allocation/counts before submission. Follow per-item progress. Sync missing inventory in context; unknown inventory is never zero. Verified already-owned generators are onboarded automatically while their original source is preserved.
4. **Develop and publish:** A coherent READY revision starts background AI work and tests. **Work Queue** shows progress, Pause/Resume and instructions. Inspect the exact full-source comparison and tests before approving publication. Human edits, changed source and failed tests hold that candidate and offer recovery. Clean bulk approval is available only for qualifying unchanged candidates.
5. **Refresher:** Enable it once, then Pause/Resume globally, per account or per generator. Timing defaults apply unless overridden. Coverage and placement show what the recent feed actually established; a source save alone does not prove placement. Unknown/partial feed and unavailable protected routes show their recovery action.
6. **Backups:** In **Settings → Backups**, download an archive or enable daily backups. These are plain, passwordless, source-complete files. Use **Inspect** to reopen a downloaded file before restoring. Restore reviews account choices and saves a safety copy; restored automation remains inactive until current identity, source and route checks and explicit activation. Git credentials are excluded and need reconnecting. Default retention is 14 successful tracked archives.
7. **Find and recover:** Global search finds accounts, generators, Git paths and operations. Overview's Attention opens the affected item; **Mark reviewed** does not dismiss an unresolved fault. Diagnostics offers independent checks, a disposable end-to-end scope and a saved operator checklist with JSON/Markdown export.

## Display and first use

Generators offers built-in/custom **Saved views** and **Columns**; selection survives paging and restart. **Settings → Appearance** controls theme and density. Keyboard arrows move through rows, Enter opens details, Escape closes a dialog and returns focus. A narrow window exposes **Menu**.

For a new installation, start with a disposable account/generator: confirm protected login, create or adopt one item, follow READY through tests and exact publication approval, inspect Refresher observations, and export/reopen a backup. Run only checks relevant to your setup. Packaged-Firefox engineering checks do not establish live Perchance, real Mullvad exit health or your private repository's write permissions; PCMS reports the actual limitation when these cannot be verified.
