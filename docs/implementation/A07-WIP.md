# A07 — single primary UI and Firefox lifecycle (active draft)

Base: `058f6e318fa5f028bdbf5cbe61b85e0d84ce4684` (A06 postmerge main CI 40070768435: baseline, fast, packaged Firefox, pcms-required SUCCESS). Scope is **A07 only** (AC-16, AC-18, X-11/X-12/X-14); A08 and A09 are not commenced.

## Reproduced failures (before repair)

- `tests/i00-a07-primary-red.test.mjs` failed on original branch checkpoint `f7eae8d6aa6f1954118fbbb4f9de4ab69e822a88`, CI 40072377379. The primary Settings exposed **encrypted OS-vault-native backup** and delegated restoration/diagnostics to a *hidden* legacy DOM controller, despite the accepted A02 browser-native portable backup contract.
- Current-candidate packaged Firefox run 40073322495 failed at primary mount, after old v015 controls loaded. Regression `tests/i00-a07-parse.test.mjs` on checkpoint `603b3c18f079556927d852d374ad429d3909be0d`, CI 40073557768, proved a malformed ESM literal newline in the new restoration module. Both directly mounted controller exports have been corrected; exact subsequent package evidence must pass.

## Repairs / bounded design

1. Primary Backup & Restore calls the single A02 browser background coordinator (`pcms-i15-backup`: STATUS, ENABLE, RUN_NOW, MANUAL). It shows actual durable receipts and uncertainty, complete-source audit, daily policy and manual download without backup passwords, encryption or additional PCMS host.
2. Primary portable restoration directly mounts the established A02 file-integrity + independent-checkpoint + mapping/consent + inactive-stage service, rather than reflecting hidden DOM state.
3. Primary disposable diagnostics directly mounts the established S08 production port/state machine. OS restart and independent backup/disk/fresh-profile evidence are `NOT_TESTED`, not falsely PASS or delegated to `local.pcms.diagnostic_browser`. Live provider stages still require explicit disposable configuration; none executed by this branch.
4. Advanced Settings exposes a user-gesture Firefox `userScripts` optional-permission request plus direct PersonaMonkey maintenance and emergency diagnostics links. Donor protected routing, exact source write fences and remote admission are not modified.
5. A single primary UI owns navigation and focus. Obsolete hidden DOM forwarding and observer coupling are removed. Visible-page/focus wake rereads canonical background ports. A mount failure exposes a restricted recovery screen rather than activating the old controller. The historical DOM remains packaged for compatibility but is no longer an action target of the primary UI; remove additional legacy code only with independent evidence of no regression.
6. Primary readiness distinguishes the browser backup coordinator from obsolete optional PCMS hosts. Read-only checks do not imply provider acceptance or file-level recovery.

## Verification / holds

- **D:** existing A04/A05/A06, page/filter, A02 portable restore and donor security suites must remain green. New A07 original-fault regression, primary ESM parse gate, prototype and direct-mount tests must pass on the exact branch head.
- **B:** run the full built-and-installed Firefox `scripts/browser-i00-smoke.py` lane on the same exact head (not old CI), including direct primary UI, permission affordance, status, negative/held action, restart and saved state. Any failures block merge.
- **H:** independent backup disk readback and separate clean/upgrade local Firefox/OS acceptance are outside this D/B artifact and **NOT_TESTED**; no host-process proof may be invented.
- **GIT/L:** private per-gens Git mutations and live Perchance/Persona operations are **NOT_TESTED** without an explicitly authorized disposable scope. Development against the public PCMS repository and read-only GitHub CI inspection is not those proofs.
- **Postmerge:** no merge/acceptance until the exact candidate required checks, PR protections, source tree and independently verified postmerge main are established.

No A08 selection or production release. The current branch and PR #46 are checkpoints, not accepted product evidence.
