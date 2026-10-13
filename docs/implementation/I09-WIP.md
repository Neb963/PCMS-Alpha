# I09 — private candidate staging and editor safety (WIP)

Phase: I09; plan S7-AUDITED-DESIGN-1. Branch from protected main 996969a82f21c6c6985446054c8241bc51f7ab74. No prior I09 work/PR found. I08 postmerge push workflow 38329397452 succeeded. No live Perchance/Mullvad/Cloudflare, native route, or private per-gens writes authorized.

## Contract and implementation rules

- P51-05 / P52-07: durable operator handoff **before** releasing machine ownership or attempting cleanup; dirty/unknown/Yjs/editor tabs always block writes. Tab ID and beforeunload alone never establish clean state. Preserve unrelated human tabs and always revalidate identity, lease, route, target, source and editor state at action boundary.
- P52-04: pin READY revision and all source bytes; stage only genuinely empty private reserved targets; independently read back exact PJS, HTML and full src/ tree, additions, deletions, empty and binary files. Source identity must derive from saved bytes, not upload response/manifest/CDN reference.
- S6-I09-EDITOR-OVERLAY / S6-I09-FULL-SOURCE: one controller, small contextual strip and stateful work-queue receipts; no second route/native privilege path. Negative F and actual installed packaged Firefox B mandatory.
- Full prior source snapshot, source diff and scope-specific holds. Provider activation remains OFF unless separate proven activation gate allows it; no public/adopted overwrite, release, Git writeback, AI execution or blind replay.

This note is not acceptance evidence. No provider effects executed. Record tests, final candidate and postmerge readback only after execution.
