# I08 — manual authenticated encrypted backup (WIP)

Phase-only branch from protected main `19fd0f9798f29b1fa8058066aa68b13791c0600a`. Dependencies I02/I03 accepted; I07 merged and postmerge `pcms-required` green (run 38327175049). No previous I08 phase branch or PR discovered.

## Contract and safety baseline
- P55-01: one authenticated integrated file even when donor's own sensitivity predicate is false; donor portable section independently sealed using its existing encrypted format; cryptographic header integrity; full validated roundtrip and binary source preservation.
- P55-02: dependency-consistent short IndexedDB read transaction plus donor snapshots with pre/post drift checks, bounded allocation and explicit uncertainty (browser cookies/provider effects cannot be globally atomic).
- P55-05: internal GCM verification, browser reported completed/exists/size, and independent disk byte readback are **different evidence tiers**. No success receipt merely from `downloads.download`.
- S6-I08-PORTABLE-DECRYPT, UX-08 and REQ-X01. Export only, never implement restore/activation/retention; no native, Perchance, Mullvad, private Git or CI-root mutations.
- WireGuard private/native configuration is excluded. No passphrase persistence. No plaintext fallback. No unverified download success.
- Existing event-page donor guards and Gecko ID must remain intact. Current provider mutations and publication remain disabled.

## Recovery/verification
This WIP note is not completion evidence. Source checkpoints and synthetic F/B checks will follow. If browser or CI proof is absent, preserve this PR draft with exact holds.
