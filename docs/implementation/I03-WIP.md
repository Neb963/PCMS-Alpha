# I03 — Persona-bound account enrollment (in progress)

Base: protected main `f615dec19cc97dfb4484334a889140c568c9bf48`. Scope: I03 only, per accepted `plan.json` and `PHASES.md`.

## Implementable contract

- PersonaMonkey owns stable persona UIDs, current Firefox containers, route/security authorization and browser execution. No PCMS second controller or new native transport.
- PCMS owns durable account identity, exclusive active account↔Persona binding, revision-fenced lifecycle, pending/unknown evidence, archival, deliberate repair/rebind, and provenance-bearing manual exception **without** owner-mutation authority.
- Human login is the only permitted user action; no automatic login, credential interception, challenge bypass, Direct fallback or live provider effects.
- A provider session/owner fact is **UNVERIFIED** until an independently admissible guarded observation is implemented. Manual override cannot promote it into verified ownership.
- UI must distinguish selected Persona, awaiting human login, identity observation unknown/verified, archived/replacement, and guard/route holds; no phantom successful sign-in.
- Deterministic duplicate/revision/lease/identity/collision fault oracles and installed-XPI Firefox B integration must pass before merge.

## Current bounds

No authorized live Perchance/Mullvad/Cloudflare operation, private per-gens setup, or production cookie/session access. Scope is only I03. No CI-root/required-check edits are authorized. All generator/source/AI/Refresher/publishing operations stay disabled.

## Recovery

Preserve current canonical IndexedDB journal; guard/restore failure denies PCMS account state mutations. Successful local enrollment is never proof that the remote account identity was confirmed. No automatic unlock of downstream owner-bound work.

## Next work

Attach narrowly typed donor-owned Persona listing/human navigation, transactional account ledger, guarded identity observation, Accounts UI and negative-case/packaged Firefox proof. Draft PR remains incomplete until selected evidence is verified.

## Implementation evidence proposal

- Same-XPI donor facade lists stable Persona UID and protected routes and delegates local protected Persona creation and manual Perchance tab open through donor-owned mutation fence; Direct, Block and route uncertainty cannot authorize guarded navigation.
- IndexedDB canonical account records serialize exclusivity and revision conflicts in one transaction; explicit repair, archive, reactivation, limited exception and bounded historical receipts do not mutate provider state.
- Independent-identity proof is accepted **only** via a privileged observer seam. The production observer intentionally returns unavailable until its provider identity method is proven; manual override remains an enrollment label, not ownership.
- Account control port rejects forged sender, oversized/extraneous fields and caller-supplied identity proof. The dashboard exposes only revision/state, not cookies, session tokens, principal fingerprints or raw browser containers.
- Fast test path `node --test tests/i00-*.test.mjs`; browser path `python3 scripts/browser-i00-smoke.py build/pcms-alpha-i00.xpi` under pinned Firefox/isolated profile. The protected CI workflow executes exact XPI/reproducibility/donor checks.
- Completion proposal: `docs/implementation/completions/I03.json`. It is **not** itself acceptance; only matched required check, squash merge and observed postmerge main prove the scoped implementation.
- Future provider-dependent features remain blocked on independent owner/session evidence. No effectful Perchance operation is enabled by this phase.
