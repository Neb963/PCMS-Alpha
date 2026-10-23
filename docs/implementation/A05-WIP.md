# A05 — exact-source development and guarded publication

**Scope:** only A05 (AC-10–13, X-04/X-05), following accepted amendment, recovery plan and A02–A04 postmerge baseline. Base: `0297ee30c630217431e7cfd9d32119d6f21907f0`; verified A04 main CI [40015917808](https://github.com/Neb963/PCMS-Alpha/actions/runs/40015917808). No A06 or subsequent work.

## Pre-fix defects and source-level red oracle

1. Primary prototype review drawer (`src/ui/faithful/bridge.mjs`) ended at durable APPROVE, while the guarded publication and reconciliation controls were in the separate legacy controller. The operator's primary flow could not actually complete an approved publication.
2. Release preview/approval and existing-public source recovery depended on legacy PCMS-native password/vault/crypto functions, contradicting the accepted Firefox-native, passwordless contract.

`tests/i00-a05-primary-publication.test.mjs` is the regression assertion for both. CI execution is required; merely reading this document is not a passing test.

## Implementation and invariants

- Reuse canonical S05 READY/source job, I10 AI evidence, S06 Git main writeback, source-diff and individual review; do not create another dispatcher or simulated publisher.
- Primary exact-source review includes persisted release GET, explicit individual approval, **one** protected dispatch attempt, and a separate independent listing/full-source RECONCILE. A possibly-dispatched effect cannot be retried, including after lost ACK, reload or restart. The exact approved revision is passed to the existing canonical release CAS; neither UI nor a Git commit can manufacture source, owner, route or publication proof.
- For previously approved source, resume using the persisted revision; uncertain states expose read-only reconciliation only. Unknown effects are never reported as confirmed public.
- Existing public update uses an immutable, browser-local, complete, unhashed-file-preserving plaintext P checkpoint. Validate its fingerprint, file set, length and exact binary bytes on every use. Legacy password-encrypted recovery records remain **held for separate migration**, never silently deleted or treated as a valid current checkpoint. No new PCMS native service, backup password or encryption added.
- Preserve PersonaMonkey protected routes, human dirty-editor guards, owner/binding checks, sleeping/unlisting controls, S06 standing authorization and independent readback. A Git writeback never itself publishes a generator.

## Verification and acceptance boundaries

- **D:** `tests/i00-a05-primary-publication.test.mjs`, `tests/i00-a05-publication-flow.test.mjs`, revised I13/S05/S07 checkpoint tests, original release CAS, negative source and git-writeback suites; all must run against current head, not merely historical commits.
- **B:** `scripts/browser-i00-smoke.py` installed-XPI exercise of the actual release module, lost ACK/no replay, plaintext binary checkpoint tamper and pre-existing I13/S06 journal/runtime checks.
- **GIT:** actual private `Neb963/per-gens` writeback **NOT_TESTED**, requires scoped authorization; public PCMS GitHub development PR/CI is distinct.
- **L:** real provider stage, native AI, protected route, exact publication and visibility outcomes **NOT_TESTED** without disposable live resources/explicit consent.
- **H:** personal Firefox/OS operator environment **NOT_TESTED**; no private or OS operations permitted in this slice execution.
- **Postmerge:** main CI and tree evidence required after an allowed squash merge. Never use an earlier canceled run to claim present evidence.

**Do not merge on speculative or failed CI.** Remaining scoped live/OS evidence must be reported as outstanding, not simulated.
