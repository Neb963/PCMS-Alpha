# H-04 — one source-save refresh, then independently reviewed target scheduling

Status: operator/local-agent procedure; **no live H PASS by coding agent/CI**.
Use the combined operator-test XPI from PR #20. Keep the PR draft/unmerged.
Authority: [I17 source-save amendment](../implementation/I17-REFRESHER-SAVE-AMENDMENT.md).

## One owned disposable target

1. Select one already owned, publicly listed, exact-source approved/released
   generator in **Refresher**. Confirm the account/Persona and protected route.
   Close its other editor tabs; preserve any human draft first. Do not use a
   collaborator-only, private, uncertain or unreconciled generator. Normal
   active/sleep/READY holds and Pauses still apply.
2. Select **Preview marker**. PCMS independently reads ownership, privacy and
   complete source and captures a separate recent-list snapshot. Review base F,
   exact pre/post full-source hashes and the sole diff at HTML byte zero. PJS,
   assets and the rest of HTML must be unchanged. If the source has no safe
   HTML slot or differs functionally from reviewed F, stop and use the normal
   source-review workflow. No arbitrary anchor/source approval is implied.
3. Select **Consent to marker** and type the displayed exact `CONSENT` phrase.
   This is distinct from publication approval. Then select **Test one refresh**
   and type its exact `TEST` phrase within the five-minute preview window.
   This authorizes **one** native save. Do not click repeatedly after timeout.
4. Read the canonical receipt. Verify independently, using the local agent's
   read-only provider observation, the exact target/owner/public flag and saved
   PJS/HTML/assets. Compare the full manifest to the expected post-save hash.
   Verify one native save in the local network log. The native saved indicator,
   HTTP 200 and ACK do not establish source confirmation.
5. Independently read the complete `GET /api/getGeneratorList` response and
   exact-match the slug. Record observation time and rank if present. Record
   **absent from this snapshot** when absent; stale/partial/429 is UNKNOWN.
   Presence is not a guaranteed rank, proof of banning/private status, or
   evidence of unlimited repeated efficacy. Preserve the before snapshot too.
6. Export the **redacted receipt**. Source-save confirmed, recent-present,
   recent-absent and uncertain are distinct results. If uncertain, use only
   **Reconcile / observe only** after its displayed backoff. At most three
   read-only probes run; cold wake never replays the save. If absent/refused/
   filtered, preserve evidence and leave scheduling held. Do not try alternate
   marker tricks or repeated efficacy trials.

A preflight failure means no native save was sent; its owned editor is retained
when cleanliness/ownership cannot be established. Review the cause and reload
before preparing a fresh intent. An attempted save remains consumed even if its
ACK was lost. A native ACK with unchanged persisted source is ineffective.

## Enable only the evidenced target, without another XPI

A positive single test does **not** by itself prove provider permission for
repeated trivial revisions. An independent reviewer must inspect the evidence
and provide a concrete reference for permitted repeated use of this method and
version on this target. If that cannot be substantiated, stop with the truthful
scoped hold; the implemented one-shot path remains testable.

1. In the same Refresher inspector, expand recurring scheduling and select
   **Measure local resource fixture**. This runs a local-only 50-account /
   1,250-generator queue sample in the installed Firefox and records elapsed
   time, serialized bytes and available storage usage/quota. Review it together
   with the exact candidate's independent P54-09/P56 packaged stress report,
   bounded network/tab/effect counts, quota failures, RSS/CPU point samples and
   backpressure evidence. Synthetic measurements are not live throughput/SLOs.
   Agree a measured resource envelope before rollout; do not invent capacity.
2. Export **review challenge** after independent source confirmation and a
   complete present feed snapshot. It binds the exact canonical operation,
   target/owner binding, F/post-save hashes, timestamped rank and resource digest.
3. On the reviewer's local machine, use the offline Node helper:

   ```sh
   node scripts/i17-h04-review.mjs key ./h04-reviewer
   ```

   Keep `private-key.json` local and private. Independently compare the printed
   SHA-256 public-key fingerprint. Paste only `public-key.json` into PCMS and
   use **Pin reviewer key**, confirming its exact `TRUST` fingerprint.
4. After the review, sign that exact challenge. Example values below are
   placeholders for the reviewer's evidence and measured limits:

   ```sh
   node scripts/i17-h04-review.mjs sign ./h04-reviewer/private-key.json ./pcms-h04-review-challenge.json operator-reviewed-evidence-v1 1440 1000 ./h04-signed.json --approve-repeated-use
   ```

   The interval must be 10–1,440 minutes; prefer the conservative 24-hour
   interval unless narrower repeated-use evidence supports more frequent use.
   The resource bound must cover the actual measured fixture and remain at most
   10 seconds. The review expires after 24 hours by default (the verifier caps
   any signed receipt at 30 days). Never sign absent/unknown/refused evidence.
5. Paste the signed JSON into **Signed H-04 receipt**, then **Verify signed
   receipt**. The background independently checks the pinned signature and
   canonical observations; UI `SUPPORTED_AND_VERIFIED` flags cannot qualify.
   Use **Enable this target's schedule** and its exact `SCHEDULE <slug>` phrase.
   This grants this target only, not its account or the fleet.
6. The existing single alarm/queue now calls the **same** protected adapter.
   It requires active allocation, fresh session/feed evidence, source consent,
   no applicable Pause/review/READY hold, capacity and durable rate limits.
   Operational intervals must actually be evidenced before repeated same-cycle
   saves; alarm delivery alone grants no new source revision. Active/sleep
   defaults remain 24h/72h. Unknown/absent/ineffective effects suspend saves,
   with bounded read-only observation. **Disable schedule**, **Revoke
   qualification** and all existing Pause controls remain available.

Key replacement, review expiry, method/source/binding drift or restore revokes
execution eligibility. Restore history never transfers consent, reviewer trust
or schedule opt-in. Exact previous marker provenance is required for every
replacement. The package holds before 80% observed storage pressure; marker
policy additionally bounds each source lineage to 4,096 revisions before an
explicit archive/source review. It never drops previous-good recovery/source
pins to make space. Existing source/AI/release/restore workflows retain their
exact-source checks; a marked remote revision must be precisely recognized or
explicitly reconciled before those workflows can overwrite it. Git F and
previous-good P are never silently rewritten by refresh.

Record H outcome, local source/feed evidence, permission reference, actual XPI
hash, reviewer identity outside public diagnostics, and first causal failure.
H-01/H-07 and independent governance review remain separate merge gates.
