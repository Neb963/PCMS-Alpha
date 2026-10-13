# I07 — Existing-generator adoption (conditional completion proposal)

**Baseline:** accepted I06 main `00f9aea4bc36ea2b090588282e153f35ae247c6a`. **Phase:** I07 only. **Status:** PROPOSED_SCOPED_COMPLETION contingent on independently observed current-candidate F/B and protected postmerge proof.

- Read-only donor-protected owner/session and exact PJS/HTML/src CDN readbacks, independently repeated; explicit public approval; source/owner/slug continuity and canonical account revision fences.
- Original bytes and fingerprints persisted once in canonical IndexedDB, never overwritten; local tombstone archives association without deleting Perchance code or immutable baseline.
- Git archive code only writes `originals/<slug>/<fingerprint>/`, prevents collision, optionally initializes non-READY marker, journals DISPATCH_POSSIBLE before Git effect, uses nonforced main CAS/readback, and holds uncertainty for read-only reconciliation. **Packaged live Git-write gate OFF**. No live provider operations were performed.
- UI: operator-select original, consent, capture, local archive, Git archived/missing/uncertain receipts, token never stored. Future Git write activation requires independently authorized operator evidence.
- Tests: F `i00-i07-adoption, i00-i07-original-page, i00-i07-archive`, B `browser-i00-smoke.py` real packaged Firefox+IDB with synthetic provider/Git responses. X only F negative cases, separate X/Live NOT RUN; donor regression retained.
- Capability holds: no provider source writes, no publishing, no auto-READY, no Git write activation, no bypass of donor guard, no operator H proof.
- **No PASS, acceptance or XPI hash claim until exact candidate and postmerge tests are observed.** Draft PR #9 is the recovery checkpoint.
