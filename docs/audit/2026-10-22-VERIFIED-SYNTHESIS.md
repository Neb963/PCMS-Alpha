# 2026-10-22 — Independent-of-runtime Synthesis Verification Record

**Status:** static source/package cross-check and planning correction; no new operator Firefox, live Perchance, protected route, or private Git acceptance. **Audited R4 source:** `d9c912d0c2c11233313637e961b96c44d826cbcd`; **amended main:** `b43160252082583b8a6ea1cbcf6a98f55bcbf444`. The corrected implementation program is [RECOVERY-PLAN-2026-10-22.md](../implementation/RECOVERY-PLAN-2026-10-22.md).

## What was independently checked for planning

- Current GitHub repo `main`, R4 #37 merged, original I17 #20 still draft, and client amendment PR #38 success/merge. **No automatic adoption of the I17 branch.**
- R4 CI workflow `.github/workflows/required.yml` and `scripts/verify-required.mjs`: checks `baseline`, `fast`, `firefox` and aggregate; R4 CI run `39714418940` did actually succeed. Those jobs do **not** prove full AC operator journeys.
- XPI build `scripts/build-i00.mjs`: pinned PersonaMonkey donor, unchanged Gecko ID, combined 1.2.4 XPI; operator build `scripts/build-operator-package.mjs` packages three additional PCMS native hosts plus optional `pcms_witness.py`. This contradicts the new installed-product contract.
- `tests/i00-r4-installer.test.mjs` positively REQUIRES the old PCMS helper registration, native diagnostic, witness and installer. `tests/i00-v016-actual-prototype-ui.test.mjs` positively REQUIRES legacy hidden UI controls. `tests/i00-r4-ai-primary.test.mjs` and `tests/i00-r4-queue.test.mjs` often inspect strings/handlers and bounded protocol rather than executing complete publication or 1k-item batch journeys.
- Packaged manifest declares optional `userScripts` and persistent WebExtension `storage`, `nativeMessaging`, `alarms`, `downloads`, `contextualIdentities`; real bridge host is **`com.persona.mullvad_router`**, as present in `lib/mullvad-native.js`.
- Prior Parts 3–6 include deterministic producer-level reproductions for generator identity mismatch, unsupported natural-language tests, Refresher missing-witness no-credit and record cap. Those narrow test observations do not prove every associated live causal chain.

## Verified corrections / refinements to the original Part 8 synthesis

| Item | Planning disposition |
|---|---|
| **Authority** | Now corrected: client amendment #38 was merged to `main` as `b43160252082583b8a6ea1cbcf6a98f55bcbf444`, replacing Part 8's former pending-contract status. |
| **Git secret storage** | NEW constraint: Firefox `storage.local` is available to extension content scripts by default; `StorageArea.setAccessLevel()` is currently unsupported in Firefox (MDN browser-compat-data checked 2026-10-22). Therefore do **not** claim a token placed in ordinary `storage.local` is background-only. Prefer persistent extension-origin background IndexedDB and test actual sender/content-script isolation. |
| **Restore and source portability** | Treat full source closure and OS-level route configuration as separate things. A complete *Firefox data* archive does not magically back up the installed Mullvad WireGuard bridge. Revalidate route assignment before reactivation; do not require a new OS backup service. |
| **Native-removal ordering** | Correct earlier sequence: first preserve recoverable local state; implement and independently prove browser-native backup + essential feature replacements, **then** remove production host dependencies and installer. Never ship a half-converted XPI. |
| **Test interpretation** | Existing passing CI is an accurate result for its selected assertions, not a fraudulent run. Add proper operator-journey oracles. Do not delete valuable donor/negative tests merely because obsolete architectural assertions must be replaced. |
| **Cross-system labels** | Each of R-01–R-15 is a remediation **domain**. Some entries are code-confirmed, some narrow deterministic reproductions, and some derived failure risks. Do not label all 15 as independently executed production defects. |
| **Firefox timing** | A restored timestamp does not prove Firefox executed work during downtime. Count rest wall time with anomaly handling; count active qualified time conservatively using actual operating observations; alarms only wake the controller. |
| **File verification** | Browser download success does not mean independently reopened disk bytes. Validate at export, then independently validate after file import or host-level copy/reopen in H testing. |
| **CI protected settings** | The connected integration showed successful checks and allowed merges, but did not supply actual branch protection/ruleset configuration. **Enforcement configuration remains UNKNOWN**, not asserted PASS. Do not disable required checks or remove protections on inference. |

## Preserved unresolved unknowns

Actual private `per-gens/main` ref permissions/writeback; source-complete authenticated Perchance editor, binary and chat helper behavior; sustained Refresher occupancy and eligible-time usefulness; distinct Mullvad IPv4/IPv6 exit proof on target host; real unencrypted disk-imported restore after interruption and source-heavy storage limits; signed/unsigned supported Firefox versions; current profile's historic state/native registrations; true CI enforcement settings.

**No client policy decision is required merely because these are unknown.** Resolve by narrow engineering D/B first, then minimum authorized H/GIT/L where necessary. Never infer missing H/GIT/L evidence from green code CI.

## References

- R4 merged [PR #37](https://github.com/Neb963/PCMS-Alpha/pull/37); browser-only [PR #38](https://github.com/Neb963/PCMS-Alpha/pull/38); R4 [CI run](https://github.com/Neb963/PCMS-Alpha/actions/runs/39714418940).
- [MDN storage.local](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/local), [MDN StorageArea.setAccessLevel](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/StorageArea/setAccessLevel), [MDN Firefox userScripts](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/userScripts), [MDN alarms](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/alarms).
- The user-provided eight audit reports and local R4 operator package are prior evidence; original source SHA links and narrower reproducer records are retained in those reports. This condensed verification record is a disposition, **not** an independent re-execution of every reproducer.

**Audit outcome:** TARGETED REPAIR IS JUSTIFIED; IMPLEMENTATION NOT YET PERFORMED BY THIS PLANNING PR; LIVE PRODUCT NOT ACCEPTED.
