# PCMS targeted feasibility proofs

Disposable research only. No production PCMS code, second router, native PCMS
service, live provider traffic, real credentials or personal profiles.

## Reproduce using Alpha's existing tools

Checkout `research/pcms-targeted-feasibility-20261028` from
`https://github.com/Neb963/PCMS-Alpha`. From that repository root:

```bash
node --test tests/pcms-targeted-feasibility.test.mjs
```

This invokes the existing pinned `scripts/setup-firefox.sh`, then the new proof
only. It does not invoke Alpha's historical tests or its application build.
Node 22+, Python 3 and Linux Firefox system libraries are needed. The existing
GitHub draft changed-file preflight also invokes this one new test. No workflow
or protected check was changed. Keep the PR in Draft; this is not a merge.

For archive-only checks, from the repository root:

```bash
node research/pcms-targeted-feasibility/offline.mjs
python3 research/pcms-targeted-feasibility/verify_archive.py research/pcms-targeted-feasibility/evidence/synthetic-node-export.zip
```

For an already installed toolchain, run `browser-proof.py` with
`FIREFOX_BINARY` and `GECKODRIVER_BINARY` pointing to Firefox 154.0b10 and
geckodriver 0.36.0. Do not set any `MOZ_DISABLE_*_SANDBOX` variable or change
sandbox preferences. No weaker alternative is provided. The workspace used for
this research rejects Firefox content-process namespace setup; use a host on
which normal Firefox runs, or retain the environmental failure.

## What the browser controller does

1. Packages `extension/` as a disposable XPI with its own test Gecko ID.
2. Uses persistent installation in a fresh Developer Edition profile. Signature
   enforcement is disabled only for that unsigned test XPI. OS sandbox and
   extension-page CSP stay enabled. Test-only chrome access observes extension
   lifecycle and triggers Firefox's real event-page termination function.
3. Imports local module v1, clicks its sandbox-rendered button, closes UI and
   observes durable effects. Stops the event page, wakes it, updates to v2 while
   the same job is unfinished, submits an old binding, restarts Firefox, tests
   Disable and Enable. Nothing opens Perchance.
4. Seeds representative extension records plus real loopback origin
   localStorage, IndexedDB, OPFS and cookies in two created containers.
5. Exports a complete capture through Downloads, then cuts the next capture
   after a partial collector read. Restarts Firefox with the maintenance barrier
   still set and the earlier complete archive/receipt unchanged.
6. Independently reopens the disk ZIP with Python and validates CRC, sizes,
   entry hashes, manifest hash and mandatory category coverage.
7. Installs the XPI into a second, previously nonexistent Firefox profile.
   Rejects corrupt input before restore, occupies extra container IDs, stages a
   restore, writes one actual origin, interrupts, restarts Firefox, and resumes
   the same mapping. Compares all category contents and cookie metadata.
8. Keeps restored work held for session/route validation. Explicitly enables
   the restored module and simulates validation for local synthetic work only;
   the safe job resumes and the uncertain job stays in reconciliation.

The synthetic native bundle deliberately contains invalid mock WireGuard
material. No native bridge is contacted or installed. Its archive round trip
does not prove native capture, host restoration, authentication or routing.

## Evidence and limits

The controller emits JSON receipts with independent oracles and a base64 copy
of the synthetic Firefox disk archive into the CI log. This retains the exact
exported bytes without changing Alpha's artifact workflow. It also writes
`evidence/browser-results.json` and `evidence/firefox-export.zip` locally.
Only fabricated credentials are present. Profiles and process logs stay in
temporary directories and are deleted after the run.

The format is a proof-specific ZIP32 with uncompressed JSON sections and base64
binary files, CRC32 and SHA-256. It is unencrypted and includes credentials.
It is not a production backup implementation or a large-file/streaming proof.
The site collector supports the declared synthetic schema only. It does not
establish current Perchance schemas, multi-writer AI quiescence, arbitrary
structured-clone serialization, authenticated-session validity, FPI portability
or real native-bridge provisioning.

Page userscript install/update/unregister and simple storage/Downloads APIs
are inherited findings from the prior audit. They are not separately rerun.
The module package's `page` field is an evidence placeholder, not a new page
runtime implementation. Core-mediated generation revocation cannot cancel an
already sent network mutation or terminate arbitrary page-world JavaScript.
