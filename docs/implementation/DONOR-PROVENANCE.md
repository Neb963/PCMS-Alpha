# Pinned PersonaMonkey donor provenance (I00)
- Private upstream repository: `Neb963/persona-router`.
- Source commit: `9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf`.
- Git tree: `9d59d800c3a687b2e7360c64d9dd859d701d6ba5`.
- **223 original Git blobs**, vendored byte-for-byte, retaining executable file modes, original licenses and regression suites.
- `donor/upstream-blobs.tsv`: pinned path/mode/blob SHA-1 inventory.
- `scripts/verify-donor.mjs`: reconstruct and assert pinned source Git tree, then verify all bytes, modes and path inventory before assembly/acceptance.
- Gecko ID: `persona-route-manager@local`, upstream manifest blob: `d24bea98aaae52bd0c4776bfdefc7f47b6f19bc6`.

## Public checkout strategy
The public PCMS-Alpha CI token cannot clone private `Neb963/persona-router`; importing source resolves that network authorization failure without giving runner a privileged private token. The operator explicitly authorized this pinned donor import. The 223 imported paths/blob SHAs were independently compared against the source tree on 2026-10-12, all matched.

This is **source integrity evidence**, not Firefox/native/provider acceptance. The donor routing guard and original `LICENSE` and `extension/LICENSE` remain unmodified. All new PCMS provider effects remain OFF.
