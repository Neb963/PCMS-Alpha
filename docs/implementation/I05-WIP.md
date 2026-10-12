# I05 — GitHub READY inspection and source association (WIP)

Phase I05 only, following verified I04 main `d90d9e24ea4369083059fd1e0c0faca4689384fc`.

## Authority and holds

No access to or initialization of private `Neb963/per-gens` without separate operator action. No provider changes, no application Git writes or publication. The implemented interface is a read-only, explicit Git snapshot inspection and canonical association path; `main` is authoritative, not a folder label or cached UI status. Missing `main` maps to GITHUB_UNINITIALIZED/SOURCE_PENDING, never READY.

## Contracts

P53-01 (empty main read-only slice), P53-02 (explicit folder/target association and hostile paths), P53-03 (READY, complete source files and relevant drift), S6-I05-EMPTY-GIT and S6-I05-ASSOCIATION; UX-04/UX-05. Require independent synthetic Git DAG and zero-write oracle, guarded DB revision/pinned-target checks, and installed-XPI Firefox B coverage.

## Recovery

Record final candidate sha, CI evidence tiers, hash and capability holds when known. Do not treat code or synthetic Git proof as permission to access private per-gens or enable application writeback.
