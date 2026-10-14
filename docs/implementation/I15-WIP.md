# I15 — scheduled encrypted backup and safe retention

> **Premerge completion proposal, NOT acceptance or live activation.** Verify
> final merge candidate, trusted protected squash, exact main SHA and postmerge
> packaged-XPI build/smoke externally. No self-referential SHA is recorded here.

- `phaseId`: I15; `planRevision`: S7-AUDITED-DESIGN-1
- `proposedClaim`: SCOPED_IMPLEMENTATION_COMPLETE_UNATTENDED_BACKUP_OS_VAULT_GATED
- `primaryTests`: P55-03, P55-04, P55-06
- `support`: I08 P55-01/02/05, REQ-X02, UX-08, S6-I15-RETENTION-PATH
- `tiers`: deterministic F, exact installed Firefox Developer Edition B; synthetic
  vault/Downloads; **no** operator KDE H evidence, real provider or filesystem
  byte-reimport claim.
- `capabilities`: MANUAL_BACKUP_AVAILABLE; SCHEDULED_BACKUP_OFF_BY_DEFAULT;
  UNATTENDED_BACKUP_REQUIRES_SEPARATE_OS_VAULT_INSTALL_AND_OPERATOR_OPT_IN;
  LIVE_PROVIDER_REFRESH_OFF; PUBLICATION_OFF; NO_DIRECT_FALLBACK.
- `rollBack`: disable daily backup on Settings; revert code on protected main;
  existing manual and previously downloaded archives remain untouched.

## Completed implementation proposal

1. Register the backup port/alarm synchronously at extension evaluation,
   restoring an hourly wake alarm after Firefox restart. Durable canonical
   daily UTC bucket claim creates at most one catch-up attempt after downtime,
   cannot duplicate an already successful day, and ignores Refresher Pause.
   An active or potentially dispatched archive blocks another attempt until
   independent reconciliation. Missing, corrupted or restoring canonical
   state fails closed; no background tab is needed.
2. Get a strong operator-supplied portable recovery passphrase only from the
   optional separately installed OS Secret Service native helper. Host identity
   binds exactly to the original Gecko ID; host accepts only fixed backup-vault
   `get`/`set` messages with narrow `secret-tool` arguments, a capped
   wire record, timeout, suppressed stderr and no route/file APIs. No fallback
   passphrase, runtime persistence, broad OS control, or auto-unlock. Locked or
   unavailable host means `SUSPENDED_KEY_UNAVAILABLE`, no file. A fresh profile
   can still decrypt an archive using the independently kept operator password.
3. Export the same I08 authenticated PCMS + separately sealed donor full
   portable payload, independent donor pre/post snapshot and cookie/source
   consistency, offline decrypt/integrity verification, and immutable on-disk
   exclusions. The same-XPI donor snapshot is attached by the build-stage
   donor overlay, not an unreliable background self-directed runtime message.
   A canonical `DISPATCH_POSSIBLE` precedes calling Firefox Downloads.
   Completion requires a matching tracked ID, actual automatic filename,
   existence and exact size. SHA-256 is the independently verified in-memory
   source hash; `BROWSER_REPORTED_COMPLETE` is **tier 2 only**.
4. Retain at most 14 positively tracked automatic tier-2 downloads by securely
   proving the ledger's specific browser ID/actual filename/size immediately
   before `downloads.removeFile(id)`. A durable deletion-possible marker
   precedes removal; no glob traversal, manual file, untracked file or
   `downloads.erase` is touched. Lost removal acknowledgement, moved/missing
   file, changed metadata or unknown history is independently reobserved
   and held without another destructive attempt. A current last-good
   automatic archive survives. Manual I08 export is unchanged.
5. Settings supports explicit OS vault provisioning, opt-in/off toggle, a
   guarded attempt and status refresh. Overview retains I08 manual receipt.
   Status labels suspended/pending/uncertain/tier-2 truthfully, with no
   success inferred from a started download or uninitialized vault.

## Evidence and trace

- Prior checked branch candidate `2881c1804e32416d74eebdf1c2ebc39ecbc5eea4`:
  GitHub Actions 38491150678 ran baseline, fast, installed packaged Firefox B,
  `pcms-required` all **success**. B logged
  `I15_INSTALLED_BACKGROUND_PORT_DAILY_VAULT_SUSPENSION_AND_TRACKED_DOWNLOAD=PASS`
  and inherited `I08_PACKAGED_FIREFOX_ENCRYPTED_IDB_DONOR_ROUNDTRIP=PASS`.
  XPI SHA-256 for that candidate only:
  `4d79e026cac4203c9b3b65a4fc544de6c2d2800eece2bdd65c4a3d8755d8f75c`.
- Additional independent F oracles cover host deny/timeout/secret redaction,
  16-day one-catch-up/backward-clock, retention deletion of only two excess
  automatic files, moved/missing/untracked/manual unchanged, and crash/lost
  ACK without a repeated `removeFile`. These additional tests require a
  **new final-candidate CI run**. The above prior run is not future SHA proof.
- Donor commit `9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf`,
  Gecko ID `persona-route-manager@local` and CI workflow/trust roots unchanged.

## Holds and operator boundary

The helper's checked-in `native/local.pcms.backup_vault.json` intentionally
has a placeholder absolute installation path. Only a separately authorized
local operator can install the executable and host manifest into a trusted
Firefox native-messaging directory, provision/unlock the Secret Service vault,
retain their recovery password, then opt in. No production OS vault/locked-host
handshake or operator H test occurred; those are **activation** questions,
not blockers for dormant implementation. Browser tier-2 metadata does not
prove bytes on disk, and nothing in this PR claims tier 3. Disk readback,
operator KDE behavior, production retention and provider activation remain
unproven. No Perchance, Mullvad, Cloudflare or private `per-gens` live actions
were performed. If actual provider/native behavior diverges, leave the
affected capability held rather than silently falling back.
