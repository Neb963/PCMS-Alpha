# PCMS-Alpha

PCMS-Alpha implementation repository. **Bootstrap in progress; not accepted, deployable, or authorized for provider effects.**

## Authority

The controlling design is the operator-signed `PCMS-Alpha-Stage-7-Final-Accepted-Design.zip` (2026-10-12); archive SHA-256:
`19cac5e03b1d40d77515313c4b386add1425ba6ebf69943a0b9d0462c644a79f`.

The archive's `SHA256SUMS.txt` validates all 29 other members; its sign-off accepts the design but explicitly does not authorize implementation. The operator separately authorized repository bootstrap and phase **I00 only** on 2026-10-12.

Pinned upstream PersonaMonkey source: [Neb963/persona-router@9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf](https://github.com/Neb963/persona-router/tree/9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf). Expected combined Gecko ID: `persona-route-manager@local`.

## Bootstrap status

This is an **initial recovery checkpoint**, not the authoritative-document installation or I00 completion. The accepted source documents, pinned donor import, CI and packaged Firefox proof remain required. Do not treat any design-only tests or prototype as execution evidence. No actions in I01+ and no Perchance, Mullvad, Cloudflare, private `per-gens`, or operator-profile effects are authorized.

Protection must be independently verified before PR merge; do not merge a CI/policy-root change on its own altered checks.