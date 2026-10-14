# I16 — Staged restore and inactive fresh controller

Status: IN_PROGRESS. This branch is a recoverable checkpoint, **not implementation acceptance**.

Authority: Stage 7; P51-08, P55-07/08/09/10/12; UX-08; S6-I16-SAME-AND-FRESH-PROFILE. No live provider writes or fresh-controller activation authorized.

Acceptance boundary: authenticated bounded preview, human-reviewed exact plan; pre-restore checkpoint independently re-read and authenticated; durable out-of-canonical-store global hold before any donor/PCMS writes; per-group journal and independent reconciliation; stable donor UID/container remapping; historical approvals/jobs inert; new profile inactive until explicitly reviewed predecessor status and live route/session/source checks. Provider effects OFF.

Evidence required: F positive and negative cutpoints; persistent packaged Firefox Developer Edition B same/fresh disposable profiles, donor regression, X two-controller and crash matrix; postmerge main proof. H-06 is late operator activation acceptance only, not a fake automated PASS.

Recovery: if any step cannot be proven, retain the out-of-store sentinel, do not retry external or donor mutations blindly, preserve original source and manual Pauses, and expose redacted per-group receipt. This branch may require a compatible donor adapter that does not bypass the donor's state manager, routing or security reviews.
