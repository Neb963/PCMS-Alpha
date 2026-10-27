# PCMS-Alpha 1.2.18 — installation and final operator acceptance

**Release:** `pcms-alpha-1.2.18.xpi` · Gecko add-on ID: `persona-route-manager@local`

## Install or upgrade

1. Keep a backup of the existing Firefox profile. Use **Firefox Developer Edition** (or another Firefox build configured to permit an unsigned development XPI); this package is not AMO-signed and ordinary release Firefox may refuse it. Do not remove the existing PersonaMonkey/PCMS extension.
2. Open `about:addons` → gear → **Install Add-on From File**. Select the supplied **1.2.18** XPI and approve the *update of the existing add-on*, not a second extension. The existing Gecko ID is unchanged. Restart Firefox, then click its toolbar icon to open the PCMS dashboard in a tab.
3. Confirm **PCMS 1.2.18** is displayed. Existing account bindings, generator inventory, preferences, scheduled work and operation history should remain. Do not reset storage or import a backup unless a genuine recovery is required. The only installed native dependency is PersonaMonkey's existing Mullvad routing bridge (`com.persona.mullvad_router`); no PCMS host, token vault, helper, local web server or geckodriver is required.

## Changes in 1.2.18

- Protected bridge recovery: while eligible account work is genuinely due, PCMS can request one guarded PersonaMonkey-native tunnel restart after independently repeated bridge/proxy failure. Native ambiguity stays held; account-specific route and principal checks still decide when work resumes. Verify real helper recovery in this session.
- Work Queue: a historical failed request can be **archived** only when the saved journal independently proves no dispatch. The original error, event history and I17 no-replay fence remain. Use **Start separate new request** for a new, different slug; it never replays the historical attempt.
- New creation: a failed current target read now retains its real bridge, account or provider failure code instead of misleading `TARGET_STATE_CHANGED`. This does not establish that Perchance's live creation API is compatible; a disposable end-to-end creation remains necessary.

## One final live-acceptance session

Perform the following **once**, using a disposable Perchance account/generator and an approved Git repository. The automated D/B/H checks already exercised extensive negative, restart, and large-fleet cases; do not recreate them manually.

1. **Protected startup and account.** Launch Firefox normally. Open **Accounts**, inspect a bound account, use **Verify route** and **Open Perchance**. Resolve any login/Turnstile yourself in its dedicated protected tab, then **Confirm login** and **Sync inventory**. If a route was lost, choose **Change route** or its shown recovery action. Verify PCMS does not fall back to Direct networking and that unrelated accounts remain usable.
2. **One generator through completion.** From **Generators**, select the disposable account and preview one creation/allocation. Submit once; observe the durable result after closing/reopening the dashboard. Check identity, original source and ownership readback. When creation holds, inspect its *actual* current failure code and protected connection before attempting a different request. Do not repeatedly click Submit or reinterpret an uncertain provider result as failure. If the result is uncertain, inspect inventory/history first; **do not resubmit CREATE/RENAME** without authoritative absence.
3. **Git → AI → publication.** In **Settings/Connections** configure the approved Git token once. Verify the intended repository and branch (`main`), original-source import/scope, prompt inputs and a disposable READY item. Authorize AI development if needed, close the dashboard and inspect autonomous progress later in **Work Queue**. Confirm genuine test results and Git writeback/readback. Review the **exact final-source diff** and approve only the disposable candidate you actually intend to publish; verify the published source and prior-good preservation. Never approve an unverified replacement.
4. **Refresher and recovery.** Check global/account/generator **Enable/Pause** controls. Confirm a due schedule resumes after Firefox restart without burst retries. Verify save success and **observed recent-feed placement** as separate states; 24-hour active / 72-hour rest policies require real elapsed observations and must not be marked complete merely because this short session succeeds.
5. **Backup and Attention.** Under **Settings → Backups**, export one source-complete, **passwordless, unencrypted** archive; reopen/check its manifest and inspect import into a separate disposable Firefox profile before applying restore. Git tokens are excluded. Inspect **Needs action/Work Queue** for grouped causes, missing Git sources, and historical uncertain operations. Use contextual recovery and check refreshed state. For the historic I17 pre-dispatch failure, verify Recorded details then choose **Archive failed attempt** if its no-dispatch proof is present; otherwise it must remain held. Do not retry the original I17 slug. Other unresolved protected holds must remain explicit.

**Stop conditions:** wrong Perchance identity, unverified protected route, unsaved human source changes, failed source integrity, unknown publication candidate, or ambiguous external result. Do not override the hold, replay a possibly completed operation, or use Direct as a workaround.

## Evidence boundaries

Repository CI verifies the exact installed enabled XPI against offline simulated Git/Perchance/native behavior, independent effect ledgers, real disposable Firefox upgrades/restarts, and physical backup/import recovery. It does **not** establish real Mullvad egress, live Perchance acceptance, private Git authorization, or the full real-time 24h/72h Refresher cycle. Record those as operator acceptance observations, not automatic PASS. Never use personal accounts or valuable generator source for a disposable test.
