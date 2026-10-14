# I15 — scheduled encrypted backup and safe retention (implementation in progress)

**Scope:** P55-03/P55-04/P55-06, UX-08, REQ-X02, S6-I15-RETENTION-PATH. Depends on implemented I08. Selected against main 0a12ff8674ada47d10ef54d32c5bc8c0562f7151, following I14 postmerge push Actions 38489235484 (required jobs successful).

- Unattended encryption requires an operator-owned portable passphrase recovered from a narrowly scoped native OS-vault helper; vault unavailable/locked ⇒ SUSPENDED_KEY_UNAVAILABLE with no archive. No plaintext/default key, no secret in browser storage or public diagnostics.
- One durable daily schedule, at most one missed-period catch-up, independent of Refresher/global Pause. No duplicate output on repeated wake. Manual export must stay available.
- Track automatic download ID, exact observed filename, size, expected hash and proof tier. Tier 2 is browser metadata, **not** independent byte proof.
- Retain 14 confidently completed automatic archives; never remove manual/untracked, changed/moved, unknown, interrupted, or only-last-good files. Idempotent removal with crash-aware marker and independent readback. No indiscriminate directory access or erase-before-removeFile.
- No live provider/Mullvad/Cloudflare/private Git effects. No native host installation or real OS-vault access in CI. Packaged Firefox B must exercise installed extension with synthetic vault/Downloads, not claim operator KDE proof.

**Disposition:** WIP, not completion, activation or human acceptance. Final accepted scope depends on F/B and negative-case proof plus verified protected squash/postmerge checks.