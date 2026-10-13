# I10 — Operator-controlled native AI diagnostic (disposable generator)

**Status:** separate H/live diagnostic preparation, not F/B completion or provider activation. The diagnostic does not authorize PCMS to execute AI tasks. It does not establish an independent Perchance server-history or worker-init acceptance oracle.

## Authority and privacy

Use a disposable, private, unlisted, verified-owned Perchance generator in a disposable Persona. The operator must already be logged in directly in Firefox. **No account credentials, tokens, cookies, session IDs, raw URL queries, complete transcripts or generator source code belong in this public repository, Actions, a PR comment, or the diagnostic export.** Do not alter Mullvad, Cloudflare, PersonaMonkey routing or any protected-user state for this test. Do not use production generators.

A standalone user-installed diagnostic uses an existing editor tab and native controls; it must not send AI prompts, bypass the native New Chat confirmation, create/edit/save generators, or make provider requests. The operator may manually use normal Perchance controls on the disposable generator when ready. Diagnostic network observations, if available, are restricted to endpoint class and elapsed milliseconds; never collect request or response bodies, full URLs or response headers.

**Script distribution:** `PCMS-I10-Live-Diagnostics.user.txt` is an operator-side conversational attachment (version `0.1.0`, SHA-256 `6de12b415170c385e08fc96d8f59e4112ca261a2ac44c14218a145604a8f5a81`). It is supplied as `.txt` for manual paste into the user's userscript manager, **not** committed as an executable repository userscript or injected into the XPI. The repository contains only this non-secret instructions/checkpoint. The script itself must be verified against the stated digest before use.

## Bounded operator protocol

1. Open exactly `https://perchance.org/<disposable-slug>#edit` in a logged-in Firefox editor, verify private, unlisted ownership and clean/absence of human unsaved edits. Enable the diagnostic userscript for this page. Its floating panel must say *local diagnostics*, not a server PASS.
2. Run the existing native AI helper manually for a small reversible Chat 1 change. After it is idle/saved, press **Capture Chat 1**. Record a salted hash of S1, local message count and save/dirty state; never disclose S1.
3. Manually press the native **New Chat** button and accept its own confirmation. Press **Check reset**. Expect an empty native input/queue/attachments, no active S1 and at most the known static greeting. This is merely **local** reset evidence.
4. Manually send one safe, short Chat 2 prompt using the native helper (not the diagnostics). Once the new session has actually been allocated and is idle, press **Capture Chat 2**. The script checks S2 differs from S1, and read-only OPFS `attachments/<sid>` and `agent/<sid>/workspace` directory presence. It reports directory presence as **untrusted**.
5. Stop sampling, export **redacted JSON**, inspect before sharing. Ensure the export contains no slug, credentials, full URLs, messages, source code or raw SIDs. The report intentionally keeps server history, worker isolation, full-source fingerprint and independent tests **UNVERIFIED**; it is not sufficient by itself to mark `FRESH_VERIFIED`.
6. Separately use the PCMS extension's independent source/test observations for any candidate F. If the remote/history/worker question remains ambiguous, keep the I10 Chat 2 gate held and record the smallest redacted failure, rather than retrying or publishing.

## Interpretation / failure cases

A new session hash, UI reset, OPFS directory or network timing observation **cannot** prove that the new server conversation contains no old S1 history or that the active native tools worker uses only S2's workspace. Neither the script nor the existing XPI can replace the independent P52-06 F/B verification adapter. If the browser privacy/ownership guard is false, if the source is dirty, or if the native New Chat dialog is canceled, stop without sending. Keep AI provider automation, Git writeback, and publication disabled.

**Next engineering action:** connect a trusted read-only native history/worker observation to the canonical source- and revision-fenced `FRESH_VERIFIED` state transition, and prove positive and negative cases in independent F and packaged B before implementation acceptance. The live diagnostic is useful to diagnose an actual helper revision, not an alternative source of false PASS.
