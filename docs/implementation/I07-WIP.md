# I07 — Existing generator adoption (work in progress)

Baseline protected `main`: `00f9aea4bc36ea2b090588282e153f35ae247c6a` (I06 verified). Phase contract: read-only adoption with explicit consent and optional exact non-overwriting original-source archive, no live provider interventions. All archive/source write and publish capabilities remain disabled pending independent integrity proof.

## Implementation checklist

- [ ] Consent and revision-fenced read-only adoption
- [ ] Original-source capture and immutable integrity metadata
- [ ] Conditional Git archive with no overwrite, CAS/readback and independent recovery
- [ ] Generator and Work Queue projections, redacted diagnostics
- [ ] Deterministic F/X and actual packaged Firefox B tests
- [ ] Trusted candidate CI, protected squash merge and postmerge proof

No implementation acceptance or operator-live proof claimed.
