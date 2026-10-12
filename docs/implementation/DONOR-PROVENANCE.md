# Pinned PersonaMonkey donor provenance (I00)

- Repository: https://github.com/Neb963/persona-router
- Immutable source commit: `9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf`
- Git tree: `9d59d800c3a687b2e7360c64d9dd859d701d6ba5`
- Combined extension Gecko ID: `persona-route-manager@local`
- Manifest blob at donor revision: `d24bea98aaae52bd0c4776bfdefc7f47b6f19bc6`
- Original donor license: `donor/personamonkey/LICENSE`, MIT; extension license: `donor/personamonkey/extension/LICENSE`.
- Entire donor repository is referenced as a Git submodule at the exact commit, including production guard/routing/native code and donor regression suites. No source-file rewrite, version substitution, or unguarded fork has occurred.
- Reproducible checkout: `git submodule update --init --recursive`. Verify `git rev-parse HEAD` inside `donor/personamonkey` against the pin. Do not use remote branch HEAD as authority.

This records a source reference, not evidence that local Firefox, native bridge, or real Mullvad/Perchance behavior has passed. All PCMS provider effects remain OFF.
