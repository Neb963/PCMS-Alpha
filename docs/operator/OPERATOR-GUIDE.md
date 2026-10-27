# PCMS-Alpha 1.2.20 — installation and final operator acceptance

**Release:** `pcms-alpha-1.2.20.xpi` · Gecko add-on ID: `persona-route-manager@local`

## Install or upgrade

1. Keep a backup of the existing Firefox profile. Use **Firefox Developer Edition** (or another Firefox build configured to permit an unsigned development XPI); this package is not AMO-signed and ordinary release Firefox may refuse it. Do not remove the existing PersonaMonkey/PCMS extension.
2. Open `about:addons` → gear → **Install Add-on From File**. Select the supplied **1.2.20** XPI and approve the *update of the existing add-on*, not a second extension. The existing Gecko ID is unchanged. Restart Firefox, then click its toolbar icon to open the PCMS dashboard in a tab.
3. Confirm **PCMS 1.2.20** is displayed. Existing account bindings, generator inventory, preferences, scheduled work and operation history should remain. Do not reset storage or import a backup unless a genuine recovery is required. The only installed native dependency is PersonaMonkey's existing Mullvad routing bridge (`com.persona.mullvad_router`); no PCMS host, token vault, helper, local web server or geckodriver is required.

## Changes in 1.2.20

- **Generator creation and rename:** A genuine HTTP 404 on Perchance's target readback requires an independent same-endpoint control, authenticated non-ownership, known owned-generator census and unchanged session before it can count as absence. JSON missing results use the same owner and census checks. All CREATE/RENAME preflights agree with READ_TARGET; unknown responses remain held. No blind retry of a possibly dispatched mutation.
- **Actionable holds:** Distinct session, rate-limit, route, transport, owner, wrong-page, conflicting census and control-read error codes replace the ambiguous target readback message. Recorded intents are preserved.
- **Preserved from 1.2.19:** automatic route/bridge recovery, bounded initial-inventory synchronization, Work Queue affected-target navigation, original source and I17 permanent no-replay fences. Live Perchance creation is still **NOT_TESTED** for this build.

## One final live-acceptance session

Perform the following **once**, using a disposable Perchance account/generator and an approved Git repository. The automated D/B/H checks already exercised extensive negative, restart, and large-fleet cases; do not recreate them manually.

1. **Existing protected account.** Retain your already verified PersonaMonkey tunnel/route setup; do not repeat it unless it fails. Verify the chosen disposable account is logged in under its original Persona. Do not bypass Turnstile or use Direct networking.
2. **One generator through completion.** Keep your existing saved request for `my-pcms-test-generator`; **do not submit the slug again**. Open **Generators → Creation batches → View progress**, click **Continue request** once only if the record is still at **Checking ownership** (no dispatch has occurred), and verify the original target account. On a confirmed absent slug, the background job should advance through temporary private/empty CREATE, independent readback, safe rename, and Git continuation. For a fresh test, use a new disposable slug only if no uncertain or reserved operation already exists. Read back real ownership, source and privacy before calling it created. On any uncertainty **do not resubmit CREATE/RENAME**; retain the exact error code.
3. **Git → AI → publication.** In **Settings/Connections** configure the approved Git token once. Verify the intended repository and branch (`main`), original-source import/scope, prompt inputs and a disposable READY item. Authorize AI development if needed, close the dashboard and inspect autonomous progress later in **Work Queue**. Confirm genuine test results and Git writeback/readback. Review the **exact final-source diff** and approve only the disposable candidate you actually intend to publish; verify the published source and prior-good preservation. Never approve an unverified replacement.
4. **Refresher and recovery.** Check global/account/generator **Enable/Pause** controls. Confirm a due schedule resumes after Firefox restart without burst retries. Verify save success and **observed recent-feed placement** as separate states; 24-hour active / 72-hour rest policies require real elapsed observations and must not be marked complete merely because this short session succeeds.
5. **Backup and Attention.** Under **Settings → Backups**, export one source-complete, **passwordless, unencrypted** archive; reopen/check its manifest and inspect import into a separate disposable Firefox profile before applying restore. Git tokens are excluded. Inspect **Needs action/Work Queue** for grouped causes, missing Git sources, and historical uncertain operations. Use contextual recovery and check refreshed state. For a generic incident, **Inspect cause** must show its saved reason instead of silently opening Diagnostics. For the historic I17 pre-dispatch failure, use **Archive failed attempt** only when no-dispatch proof exists. Do not retry the original I17 slug. Other unresolved protected holds must remain explicit.

**Stop conditions:** wrong Perchance identity, unverified protected route, unsaved human source changes, failed source integrity, unknown publication candidate, or ambiguous external result. Do not override the hold, replay a possibly completed operation, or use Direct as a workaround.

## Evidence boundaries

Repository CI verifies the exact installed enabled XPI against offline simulated Git/Perchance/native behavior, independent effect ledgers, real disposable Firefox upgrades/restarts, and physical backup/import recovery. It does **not** establish real Mullvad egress, live Perchance acceptance, private Git authorization, or the full real-time 24h/72h Refresher cycle. Record those as operator acceptance observations, not automatic PASS. Never use personal accounts or valuable generator source for a disposable test.
