# J06 — Backup, Settings, Attention and diagnostics

Base: verified J05 main c6649f8dfa4d85fe09e0016e1af08f56492e3635, tree a1e08b27d575176afc948f8614c554af9d6c0d57. Candidate full40159712112 and postmerge main40160473119 passed1059 deterministic cases, donor, reproducible XPI/package audits and the complete installed persistent Firefox suite. Version1.2.13 is an intermediate J06 candidate; final operator delivery follows J07.

Scope: S-01–S-06/S-08–S-09; C-24–C-25/C-62–C-75 and passwordless browser-only amendment; AC-16/17 and relevant cross-workflow traces. Ordinary primary backup/export/daily/retention, inspected existing/fresh restore, actionable incidents/search, independent functional diagnostics and guided operator records must work with visible controls, no raw JSON/hash-paste procedures, native PCMS service or password.

Independently reviewed actual gaps at the base:
- Daily HELD retains a known download ID but maps to DISPATCH_POSSIBLE, which recovery rejects unconditionally; no-ID lost ACK also remains stuck. Manual late completion is read back and then incorrectly dispatches another export.
- Manual attempt status drops timestamps and has no separately preserved last-good receipt; Overview deliberately leaves last backup unknown.
- Primary restore exposes JSON Persona/account maps and a pasted plan digest despite an existing guarded source-complete inactive restore engine.
- Independent diagnostics expect a backup-readiness row absent from the background CHECK, do not perform a functional archive test, and mark backup/restore/restart stages unconditionally not tested. Historical failures/run reports can be overwritten; publication requires manual Resume after the exact approval.
- Attention lacks targeted recovery and its one-shot Mark reviewed listener becomes inert after a failed acknowledgment. The backup incident still says encrypted. Search already includes Git paths and operations from J03; incident lookup and precise navigation remain.
- Guided per-check operator Not tested/Pass/Fail, notes and Markdown export are missing. Current live Settings already replaces obsolete native cards; do not treat stale audit text as a new defect.

Implementation and evidence: repair known-effect readback without download replay, preserve last good, keep exact source closure/token exclusion and daily14/last-good retention; replace primary technical restore forms with account/Persona controls bound to the same real production plan/CAS/checkpoint/inactive engine. Exercise actual primary clicks and files, independent physical archive reopen, lost ACK/late completion/restart, corruption/ambiguity/stale inputs, fresh-profile restore and module independence. Diagnostics must distinguish runtime/function proof from live provider, private Git and OS measurements; manual notes are operator provenance, never invented automatic evidence.

Existing protection and all required CI remain intact. Draft development uses fast preflight; stable reviewed final head requires full donor/deterministic/reproducible-XPI and installed Firefox, protected squash merge, then full postmerge main before J07. No personal Firefox profile, live Perchance or private generator Git mutations are authorized or performed. Local coding execution is unavailable; reversible repository work and verification continue via GitHub source APIs and CI.
