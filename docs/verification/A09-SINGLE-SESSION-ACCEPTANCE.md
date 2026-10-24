# A09 — Single-session release acceptance (not live authorization)

**Status:** engineering verification and evidence-collection instructions. This file does not authorize Perchance, `per-gens`, existing OS-native bridge, account, profile, or publication changes. Never describe a synthetic or disposable CI result as an operator-side PASS.

## Final candidate identity and evidence

Use the exact approved `pcms-alpha-i00.xpi` from the candidate's GitHub Actions run. Record its **source commit SHA**, XPI **SHA-256**, donor pin `9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf`, Gecko ID `persona-route-manager@local`, version `1.2.5`, Firefox release/build, installation mode, test profile identity (opaque), environment, and observed time. Keep the prior XPI and **independent read-only full-profile checkpoint** for rollback before any upgrade or restore. No real profile upgrade should be attempted merely to satisfy A09.

The only native host permitted in the installed product is pre-existing PersonaMonkey `com.persona.mullvad_router`; never install extra PCMS host, patch the bridge, run a PCMS installer, provision a keyring, or provide a backup password. Optional `userScripts` grant belongs in the real main Settings UI. Never weaken blocked route/source/publication effects to obtain a positive test.

Run from repository root after the exact candidate has been built:

```bash
node scripts/build-i00.mjs
python3 scripts/a08-xpi-audit.py build/pcms-alpha-i00.xpi
node scripts/a09-evidence.mjs --xpi build/pcms-alpha-i00.xpi --source-sha "$(git rev-parse HEAD)" --out-dir build/a09
# Optional with independently collected, sanitized receipts:
node scripts/a09-evidence.mjs --xpi build/pcms-alpha-i00.xpi --source-sha "$(git rev-parse HEAD)" --receipts path/to/redacted-receipts.json --out-dir build/a09
```

The output's `HELD` is expected while required positive/adverse/recovery observations are unavailable. `--require-ready` deliberately exits nonzero on HELD or FAIL. This is an **evidence structure and identity gate**, not an attestation of an external observer's authenticity or a bypass of human product acceptance. Each receipt must name an AC/T/X ID, tier, case, exact source SHA and XPI digest, environment, time, independently observable result and linked sanitized evidence. H/GIT/L PASS require a separate independent observer/readback. Never insert credentials, cookies, session state, IP addresses, confidential sources, URLs containing tokens, or provider chat data in the report.

**Resolved provenance gap:** The original Part 8 X-01–X-14 narratives were recovered from the user-supplied report and committed verbatim to `docs/audit/PART8-ORIGINAL-X01-X14.md` with an exact table SHA-256. The A01 fixture's former topic labels are derived groupings, not replacements for the original triggers and expected outcomes. Source presence alone does not prove any scenario passed; execute and record only the evidence that the specific original trace requires.

## Reuse verified automated evidence; avoid operator repetition

Before asking for human action, inspect current **same-XPI, same-compatible-runtime** CI: donor fail-closed route bootstrap/permissions, source fingerprint and journal atomicity, missing/stale source and human editor tests, lost ACK/conditional Git, clock jumps/alarms, incomplete recent feed, corrupt/interrupted portable restore, and installed Firefox background/suspension/restart. A08's reproducible XPI/donor audit and disposable Firefox upgrade are strong engineering evidence, **not real native-route connectivity or provider outcomes**. For AC-18 use the existing 55-account / 1,200-generator installed-Firefox fixture, then record actual operator UI feedback separately. If the candidate XPI/runtime differs, reverify affected claims rather than carrying stale PASS forward.

## One tightly scoped operator acceptance session, only after explicit approval

1. **Read-only readiness and target checks.** One dedicated Firefox profile, previously verified PersonaMonkey donor bridge and **two pre-authorized disposable Perchance accounts** with distinct verified protected exits; record relevant IPv4/IPv6 observations without exporting raw addresses. Check account identity, browser permissions, main UI, initial Git preview and existing source/operation journals. Verify original I17 uncertain batch `batch_e2c328e54f9c4a6ab89f1084134fde52` and slug `pcms-test-esr-chain-20261015-a01` remain quarantined; never recreate or rename them automatically. Cloudflare challenges remain human-directed and never trigger automatic route rotation.
2. **One small authorized creation/READY/publication chain.** Only on explicitly named disposable test resources, capture true account owner, protected route, create/rename and independent source readback, private status, non-READY Git folder behavior, then one coherent READY change and actual AI/Chat2/tests. Verify the candidate source bytes and Git allowed-path conditional writeback/readback. For publication, inspect exactly the reviewed candidate and request **individual operator approval** before any publish. Record independent provider listing/source evidence. Inject lost ACK/stale source/dirty editor via D/B fixtures, not by risking duplicate real writes.
3. **Refresher/backup/recovery under controlled scope.** On the approved disposable owned generator, observe a safe source marker save and complete recent-feed coverage or an honest `UNKNOWN`/absent result. Record native source save independently of observed feed position; preserve conservative 24/72 time accounting and no burst on wake. Run a passwordless plain-format manual and scheduled backup on a **disposable** profile, independently reopen the downloaded archive, inspect and restore to a fresh disposable profile with controller inactive, then verify exact binary sources and route/IP-history continuity. Only the external controller may perform a scoped genuine Firefox process restart; tab reload is insufficient. Private-Git writes and bridge/OS tests require distinct operator-scoped permission.
4. **UX check, no extra provider writes.** Use actual primary UI on 320 CSS-pixel viewport and 200% zoom; keyboard/focus navigation across Accounts, Generators, Work Queue, Refresher, Settings and Attention; large-paging fixture; source-review and restore modal Escape/focus return; inspect screen-reader labels, contrast and reduced motion. Mark any unsupported manual screen-reader evidence NOT_TESTED. No duplicate one-button live diagnostics if equivalent exact resources and stages were already independently proved.

**Stop immediately** on mismatched account/Persona/exit, unsupported IPv6 safety, altered source hash, missing protected lease, stale human approval, uncertain provider save, conflicting writer, incorrect Git branch/path, incomplete feed mistaken for absence, or unrecoverable restore. Preserve journal and old source bytes, do read-only reconciliation and keep unrelated safe accounts operating. Never repair a failed test by changing the product contract or granting direct-route fallback.

## Release and rollback decision

AC-01–AC-18 are the accepted operator journeys (subject to Client Amendment v1.0.1), T-01–T-10 are cross-workflow adversarial traces, and X-01–X-14 are recovered, verbatim audit traces with outstanding execution evidence. A09 marks **no final release** while any applicable tier, relevant positive/adverse/recovery case, X scenario evidence or manual accessibility/product signoff remains missing/failed. A CI success alone is insufficient.

Preserve the previously tested XPI and an independent old-profile checkpoint. On failed upgrade/recovery stop affected automation, restore only from verified safe checkpoint into a separate profile, rebind/reverify account/route/source, leave remote uncertain effects held and never retry publication/create/save to 'undo' uncertainty. Do not replace the operator's installed XPI or reconfigure the native bridge without separate authorization. Record explicit **NOT_TESTED** for real H/operator bridge, private GIT and Perchance L until actually observed.
