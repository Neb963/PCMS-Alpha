# S03 — pinned main catalog, prompt and import preview (working ledger)

**Status:** IN_PROGRESS — no product acceptance or provider effects.

Scope: S03 from accepted docs/implementation/SLICES.md. Implement complete main-only catalog traversal with truncation fallback and independent file/commit verification, Git-authoritative existing default prompt and optional TESTING pinning, scoped initial-import preview, and safe opt-in conditional prompt editing; integrate the installed extension UI/background entrypoints. Preserve pre-existing git source/history; add tests for >1,000 entries, incomplete trees, wrong repo, collisions, changed material scope, stale HEAD, and lost ACK. Production Git credential vault and private remote writes require separate host/GIT authority and evidence. No Perchance effects, no I17 replay or credentials in repo.

Base main: 807e9a45de8ef950f44f7692c0ddb10e8d8643cb.
