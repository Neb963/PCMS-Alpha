# I17 — Operator verification and capability holds

**Version:** Stage 7 plan `S7-AUDITED-DESIGN-1`. **State:** Instructions only; no human H case has been executed by adding this file. No production provider permission is conferred.

## Preconditions and custody

Use the exact combined XPI artifact from the successful *current-main* GitHub run and record its SHA-256, actual Firefox Developer Edition build, operating system, sanitized disposable fixture ID and a local UTC observation timestamp. Verify `pcms-required`, donor regression and applicable F/B/X evidence separately. **Do not run H cases on a daily browser profile.** No browser/Perchance cookies, passphrases, source, real account identifiers, provider credentials, native secrets or unredacted screenshots belong in PRs, exported Markdown or this chat.

Open the installed XPI's PCMS **Settings → I17 Operator acceptance checklist**. All 17 cases initialize as `NOT_TESTED`. The checklist is locally stored, self-attested data; no entry is CI PASS, release approval, RESTORE activation, or an independent witness. Select the exact case, real result and evidence tier; supply a safe opaque evidence reference and an independently observed short fact. The form rejects unsupported or empty PASS/FAIL evidence and bare URLs/secret-bearing prose. `Reload local checklist` before a new revision from another view. Choose **Export marked results + safe diagnostics (.md)**, inspect the saved file (requesting a download is not proof of disk persistence), and retain it in operator-controlled storage. Emergency ZIP is separately available from the independent diagnostics page, including when Core is degraded.

## Required: H-01 (packaged Firefox usability/a11y)

Install only the pinned combined XPI on a disposable profile with offline seeded 50-account/1,240-generator data. Record exact Firefox/OS, XPI hash, screen reader and version (Orca if available), zoom, CSS viewport and fixture.

1. Starting from browser keyboard, verify the first Tab enters **Skip to content**. Use Tab, Shift+Tab, Enter, Space and Escape across all **six** destinations. Check semantic names, disabling reasons, protected account/route identity and focus return after a review/restore dialog.
2. On Generators and Work Queue, search/filter/paginate, keep target identity stable, preview a synthetic batch and exit without any provider operation. Check account Pause/hold separate from informational notification dismissal.
3. Check 320, 390, 800, 1280 and 1440 *effective CSS pixels*, 200% enlargement, light/dark/high contrast, reduced motion, long UTF-8/CJK and RTL text. Compare visible scroll axes and 24×24 CSS px target size/valid exceptions. Only technical table/diff regions may scroll horizontally; page-level critical controls must remain accessible. Report observed color/contrast and focus selectors, not merely a visual impression.
4. With an actual assistive-technology screen reader, verify table row identity, changing status, dialogs, focused/disabled blockers and no announcement flood on synthetic burst updates.

**PASS only with executed human observations and an evidence note.** An automated Firefox DOM/viewport probe is `PACKAGED_FIREFOX_B`, never H-01.

## Required: H-07 (checklist and fallback)

On the same installed XPI, leave H-01 or another unexecuted check `NOT_TESTED`. Record one synthetically injected `FAIL` with its precise observed failure and safe diagnostic reference. Verify missing evidence or wrong evidence tier is rejected. Export Markdown, open the saved file and check every case ID, disposition, tier, note and blocked test matches the form. Check independent diagnostic section unavailability is explicit, not a healthy default; include an independently obtained emergency diagnostic ZIP when needed. No false PASS from a prior prototype, automation, previous profile or AI narrative.

## Conditional cases and non-authority

- **H-06:** Required *before claiming fresh-profile migration activation.* Two disposable profiles; original remains potentially active. Verify staged restore and persistent new-profile INACTIVE state, mapping/guard, old-profile shutdown and independent owner/route/source revalidation. **No activation API is authorized by this I17 implementation.** H-06 cannot be a PASS for activation until a separately reviewed activation mechanism and real operator proof exist.
- **H-02:** Read-only authenticated owner proof if owner-dependent effects are proposed. Do not repeat already-established private-first F1 create/rename.
- **H-03:** Full-source native AI and test attribution only for a separately approved disposable, unlisted source write.
- **H-04:** A legitimately permissible, independently effective single Refresher action only with specific owner/target consent; fleet mutation stays OFF without measured P54-09/P56 and efficacy.
- **H-05:** KDE Secret Service unlocked/locked and independent Downloads file readback only if unattended backup is to be enabled/claimed.

For H-02–05, absent exact external authorization: mark `BLOCKED` with a sanitized reason or leave `NOT_TESTED`; never run live Perchance/Mullvad/Cloudflare/private Git writes. `NOT_APPLICABLE` must explain why the capability is deliberately out of release scope. H-01/H-07 remain required for full operator sign-off even if all optional provider features stay OFF.

## Acceptance decision

Map the *executed* F/B/X test IDs to immutable GitHub run/head and actual packaged XPI, then incorporate the human evidence for H-01/H-07. P54-09 requires **measured** Firefox fleet upper bounds, quota/tabs/IDB/heap/read admission traces, and operator-relevant thresholds chosen from evidence; a synthetic Node timing or single Firefox local shadow measurement is not a general throughput SLO. Record shortfalls as `NOT_TESTED` or `BLOCKED`.

This runbook is no permission to merge an incomplete I17 phase or toggle held capabilities. All unproved release, native AI, owner/session, Refresher, private Git and fresh restore authority stays OFF/HELD; donor protected routing and zero Direct fallback are invariant.
