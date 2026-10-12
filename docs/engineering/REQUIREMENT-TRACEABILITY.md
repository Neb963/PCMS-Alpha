# PCMS-Alpha — Stage 7 Requirement Traceability and Supplementary Acceptance

**State:** audited design contracts only, not executed tests. **Relationship:** supplement to 56 P51–P56 tests, not a replacement or inflated PASS count.

## 1. All Stage 1 requirements: one primary phase owner

| Stage 1 ID | Owner phase | Requirement (short reference) |
|---|---|---|
| REQ-A01 | I03 | An account is bound to one dedicated Persona; each active Perchance account has an exclusive Persona binding, with controlled… |
| REQ-A02 | I03 | Enroll via a new Persona or an existing unbound Persona; no manual personaUid or cookieStoreId needed in ordinary UI. |
| REQ-A03 | I03 | Open Perchance through that Persona; operator performs login; PCMS verifies account identity and owned-generator relationship… |
| REQ-A04 | I03 | When account identity cannot be verified, allow a labeled pending-verification state **and a deliberate manual override**, wi… |
| REQ-A05 | I03 | If Cloudflare/challenge recurs, allow a **new clean Persona** and route selection; mark the route/time/account associated wit… |
| REQ-A06 | I01 | Session loss or protected-route failure pauses only affected work, not healthy accounts' work; fail closed on ownership or ro… |
| REQ-A07 | I04 | Periodically discover owned generators and support manual Sync; show all discovered generators in inventory, including exclud… |
| REQ-A08 | I03 | Removing an account normally **archives** it, preserving the Persona, generator histories and sources. |
| REQ-D01 | I09 | A READY source revision is a **candidate**, not a public release. Apply its source unlisted, with version/source provenance a… |
| REQ-D02 | I13 | New generators may deploy when ready. Updates to existing managed generators **wait for sleep**; before any update PCMS must … |
| REQ-D03 | I10 | The default Perchance AI-helper test runs first; an optional generator-specific TESTING.md (or configured equivalent) runs in… |
| REQ-D04 | I10 | The default AI-helper test prompt is editable in **PCMS Settings**, with version history and import/export. A change affects … |
| REQ-D05 | I10 | AI helper attempts repairs and documents what it changed; source and results from Chat 1 carry into Chat 2; a new chat does n… |
| REQ-D06 | I10 | Per-account AI-helper concurrency configurable globally, default one; pending manual review **releases** that AI execution sl… |
| REQ-D07 | I13 | Every new/changed release needs human approval, with safe bulk approval for **clean** results and individual scrutiny for fai… |
| REQ-D08 | I13 | On approval: ensure live save/readback, reconcile any approved AI fixes into GitHub via revision-safe writeback, then publish… |
| REQ-D09 | I13 | If new GitHub commit B appears while release A is under review, preserve A's review and label it outdated; do not silently re… |
| REQ-D10 | I09 | Unsaved operator edits take precedence; automatic source replacement must stop on conflict rather than overwrite, and PCMS mu… |
| REQ-D11 | I13 | On update/test failure: restore confirmed working source if safe, leave **unlisted and sleeping**, flag for review, quarantin… |
| REQ-D12 | I13 | Unexpected live source drift pauses mutation and prompts reconciliation. A manual **Ignore** action can suppress the currentl… |
| REQ-G01 | I04 | Generator inventory spans owned generators whether imported/discovered, newly reserved, or linked to GitHub-first source. The… |
| REQ-G02 | I06 | Bulk-slug reservation accepts only names supplied by the operator; never invent replacement names. Validate, classify collisi… |
| REQ-G03 | I06 | Reserve an actual **unlisted, initially empty** generator through a verified eligible Perchance account, not just a local cla… |
| REQ-G04 | I06 | Allocate new reservations as evenly as feasible among currently verified and operational accounts; this fairness rule is **no… |
| REQ-G05 | I07 | Create/link one GitHub folder per reserved or discovered owned generator, including existing public generators, initially non… |
| REQ-G06 | I05 | Require strict Status: READY in DEPLOYMENT.md plus configured deployable files; mere presence of PJS/HTML does not authorize … |
| REQ-G07 | I07 | Existing public generators need one-time, optionally bulk, enrollment approval before PCMS assumes deployment control. Captur… |
| REQ-G08 | I06 | If Perchance reservation succeeds but GitHub creation fails, retain confirmed remote result and retry **only** missing step; … |
| REQ-G09 | I05 | Existing owned slugs are reconciled, external/taken slugs skipped; GitHub-first READY folders may supply a mapping/reservatio… |
| REQ-G10 | I05 | PCMS maintains explicit Perchance slug ↔ Account/Persona ↔ GitHub folder association; a folder name need not inherently deter… |
| REQ-G11 | I07 | Missing/deleted generators are not silently purged; operator deletion retains a local tombstone/history and GitHub source. A … |
| REQ-G12 | I04 | Support fast search/filter across 1,000+ generators, sensible bulk actions, dry-run previews and per-item outcomes; destructi… |
| REQ-R01 | I12 | One global oldest-eligible-first scheduler; generator-specific 24-hour default active periods and configurable minimum sleep … |
| REQ-R02 | I12 | Both active **and** sleep clocks pause during full Firefox shutdown **and confirmed Perchance outage**; normal event-page unl… |
| REQ-R03 | I12 | The global active cap is automatically calculated from eligible population, A/S settings and observed practical recent-list c… |
| REQ-R04 | I12 | Normal sleep means *public but not routinely refreshed*. Mandatory unlisting is for deployment changes, failed releases under… |
| REQ-R05 | I12 | If cap decreases, existing active periods finish naturally and new admissions stop until count drops; when account unavailabl… |
| REQ-R06 | I12 | Global, per-account and per-generator Pause/Resume are supported; unfinished time/work is preserved and restart does not burs… |
| REQ-R07 | I12 | Observe actual recent-list visibility/position roughly every ten minutes; adaptive individual statistics polling avoids 1k-pe… |
| REQ-R08 | I14 | Refresh attempts are bounded, staggered and re-check visibility; reload page before an appropriate retry; repeated failures s… |
| REQ-R09 | I14 | Previously discussed insignificant/comment-based save as a refresh mechanism is a **provisional technical idea, not proven pl… |
| REQ-R10 | I12 | Earlier requirement calls for internally bounded ±30-minute transition jitter; keep it out of ordinary UI if retained. Whethe… |
| REQ-U01 | I09 | One practical full-tab dashboard and small Perchance editor context overlay, without extra independent browser control center… |
| REQ-U02 | I00 | Main tasks: Accounts, Inventory, Supply, Deployments & Review, Refresher, Attention, Settings/Backup/Diagnostics; final navig… |
| REQ-U03 | I02 | Show plain-language progress and actual confirmed outcomes; queued, waiting, uncertain, complete, excluded, unpublished and s… |
| REQ-U04 | I02 | Action-required and severe errors: desktop + dashboard notifications; routine successes aggregated; manual ignore only for ex… |
| REQ-U05 | I04 | Bulk-first workflows, virtualized/paginated large lists, operator-friendly selector UIs instead of raw IDs, accessible keyboa… |
| REQ-U06 | I17 | Guided in-app late-stage manual acceptance screen, standalone Markdown fallback, one-click export of marked results plus diag… |
| REQ-X01 | I08 | One operator-facing **backup file** covering PCMS and the PersonaMonkey data that can legitimately be exported. Sensitive Per… |
| REQ-X02 | I15 | Daily downloads to Downloads/<backup-folder>/; best-effort bounded retention of *known* downloads via Firefox Downloads API; … |
| REQ-X03 | I16 | Restore into same Firefox profile **or fresh profile**; preview contents and mappings before apply, verify integrity/schema, … |
| REQ-X04 | I02 | Recovery holds are **scoped** to affected accounts/generators/operations where safety permits; healthy parts resume after rec… |
| REQ-X05 | I02 | One-click **redacted diagnostics** export should work even if the normal dashboard/Core path is impaired. Include build prove… |
| REQ-X06 | I00 | Development evidence mostly via GitHub Actions: deterministic unit/integration/provider emulators, fault injection, pinned pa… |
| REQ-X07 | I17 | Final operator-led live checks only in the last few phases: short instructions, disposable data where possible, clear pass/fa… |
| REQ-X08 | I00 | One sequential agent works one small phase/vertical slice at a time, publishes commits/PR/CI and stops. Operator's existing i… |

## 2. Supplemental tests: falsifiable obligations

The additional `S6-Ixx-...` assertions are intentionally small and may be exercised within existing P-test harnesses. An agent must not claim PASS merely because the IDs exist in the manifest. Test executor, failure injection, expected vs observed and evidence tier must be recorded.

### I00 — Combined XPI and navigable shell

**S6-I00-PACKAGING** — `B`: Install the combined XPI in a disposable Firefox Developer Edition profile; inspect Gecko/native-host identity, permissions, six disabled UI destinations, build provenance and uninstall/reinstall compatibility. Reject missing destination or a second controller.

**S6-I00-DONOR-SECURITY** — `F/B`: Execute pinned donor security regressions and a packaged protected-route fail-closed smoke while PCMS is disabled or fails bootstrap; reject any Direct fallback or donor startup coupling.

### I01 — Fail-closed background wake and PersonaGuard

**S6-I01-COLD-WAKE** — `B`: Suspend event page, close the dashboard, fire relevant alarm/message, restart installed Firefox, and delay recovery; verify wake and independent donor guard precede any PCMS action.

### I02 — Journal, canonical commands and emergency diagnostics

**S6-I02-NOTIFICATIONS** — `F/B`: Induce one serious route/account failure, one action-required source hold, and a burst of successes. Verify scoped desktop+dashboard critical notice (permission-aware fallback), deduplicated success summary, revision-scoped dismiss/ignore and no message flood.

**S6-I02-EMERGENCY-ENTRY** — `B`: Corrupt PCMS Core initialization; invoke the independent extension diagnostic entrypoint and verify an allowlist-only archive with injected credential/source/route canaries absent.

### I03 — Persona-bound account enrollment

**S6-I03-BINDING-EXCLUSIVITY** — `F/B`: Two accounts simultaneously propose one Persona and one account proposes two active Personas. Revision-fenced canonical transaction must accept at most one exclusive active pair, even with stale UI and restart.

**S6-I03-OVERRIDE-PROVENANCE** — `F/B`: Simulate unverifiable account identity and explicit enrollment override. Verify persisted operator intent/identity uncertainty, visible warning and zero owner-dependent provider mutations until fresh independent proof.

**S6-I03-ARCHIVE-REPAIR** — `F/B`: Archive an account; retain Persona/source/history. Rebind to a clean verified Persona after challenge; old leases, bindings, release approvals and pending mutation authority must be invalidated; never bypass routing/challenge.

### I04 — Owned generator read-only inventory

**S6-I04-INVENTORY-SEARCH** — `F/B`: Run paginated or virtualized search/filter on >=1,000 owned records including discovered/unready/archived and stale observations; zero wrong-target selection, no automatic deletion or owner inference from editable access.

### I05 — GitHub READY inspection and source association

**S6-I05-EMPTY-GIT** — `F`: Present Git repository metadata whose main ref does not exist. READY must be false; no implicit initialization or candidate release. Output source-pending status only.

**S6-I05-ASSOCIATION** — `F`: Present two generators mapped to one folder, reused slugs, adversarial Unicode/path objects, and READY metadata drift. Reject collision/unsafe association and preserve confirmed intact source.

### I06 — Private-first slug reservation and batch receipts

**S6-I06-GIT-MARKER-SAFETY** — `F`: With a synthetic Git ref, inject lost non-READY marker commit reply, concurrent HEAD movement, tree write interruption and duplicate alarm. Journal before dispatch, compare-and-swap nonforce, observe independent Git ref/tree, never blind retry. No private repo writes in CI.

**S6-I06-ALLOCATION** — `F/B`: Freeze operator-only slug batch, simulate uneven eligible-account pool and one uncertain create. Assign balanced accounts at admission, freeze attempted slug/account on uncertainty; show per-item receipts, no invented slug or allocation rewrite.

### I07 — Existing generator adoption without source loss

**S6-I07-ORIGINAL-ARCHIVE** — `F/B`: Adopt one already-public generator; demand original full-source byte readback, immutable backup and non-overwriting Git archive where authorized. Inject unavailable Git and corrupt asset; never stage/overwrite until recoverable baseline verified.

**S6-I07-TOMBSTONE** — `F/B`: Archive an account/generator and simulate confirmed remote deletion versus temporary missing inventory. Preserve remote source mapping, local tombstone/history and prompt explicit destructive confirmation; absence from a list is never deletion proof.

### I08 — Manual authenticated encrypted backup

**S6-I08-PORTABLE-DECRYPT** — `F/B`: Create a full authenticated encrypted archive from dummy donor+PCMS state. Offline decrypt with portable recovery secret, independently compare full source/manifest and inspect excluded native WG configuration; reject wrong password/altered header/partial snapshots.

### I09 — Private candidate staging, full-source verification and editor safety

**S6-I09-EDITOR-OVERLAY** — `B`: Open matching Perchance editor and compact collapsible PCMS context strip. Verify exact account/Persona/generator/current operation, conflict indicator and explicit human handoff, including after background wake; no second controller or untrusted privileged command.

**S6-I09-FULL-SOURCE** — `F/B`: Stage private candidate with PJS/HTML/text/binary/src additions/deletions; inject CDN stale reads, changed human buffer and tab handoff crash. Zero auto-overwrite when dirty/unknown; verify exact final saved-byte digest.

### I10 — Native AI repair and independently evidenced tests

**S6-I10-PROMPT-VERSION-IMPORT-EXPORT** — `F/B`: Create Settings-only default Chat 1 prompt v1, export/import v2, start one test before and another after edit. Verify each job retains pinned prompt version and exact source; older running job is not retroactively rewritten.

**S6-I10-AI-CONCURRENCY** — `F/B`: Admit 2 helpers for one account with default maximum one: second waits, first releases slot upon entering manual review. Check capped owned tabs, cancellation/restart recovery and no unbounded helper workers.

### I11 — Revision-safe GitHub writeback

**S6-I11-GIT-DAG-REPLAY** — `F`: Insert orphan Git commit object, lost ref-move reply, unrelated/current HEAD movement and duplicated job dispatch; after readback exactly one intended logical writeback, no forced branch ref, and immutable final-source bytes/deletions.

### I12 — Refresher shadow scheduler, monitoring and fleet

**S6-I12-SLEEP-LISTED** — `F/B`: Place an otherwise healthy published generator in ordinary sleep. It remains listed but does not receive routine mutating refresh; during update-review it becomes confirmed unlisted, and its evidence-bounded sleep budget freezes.

**S6-I12-DISPATCH-STAGGER** — `F`: With 1,000 overdue durable jobs and two wakes, bound dispatch rate and introduce staggering only in execution scheduling—not by deducting active/sleep durations or altering oldest-eligible fairness.

### I13 — Exact-source release approval and existing-source updates

**S6-I13-REVISION-IGNORE** — `F/B`: Ignore one observed source-drift fingerprint, then change a byte. New discrepancy must warn and block modification; ignored old alert never grants overwrite or publication authority.

**S6-I13-ORIGINAL-RESTORE** — `F/B`: Fail an existing-generator update after confirmed sleep/unlist, with a verified original snapshot. If source/editor/route checks permit, independently restore old bytes, verify readback and remain UNLISTED under review; otherwise preserve scoped hold.

### I14 — Permissible evidence-based mutating Refresher

**S6-I14-BOUND-RETRY** — `F/B`: Inject lost refresh response, stale visibility list, 429, provider drift and repeated ineffectiveness. Use bounded read-only reconciliation and supported page reload before any qualified retry; never spam comment/no-op edits or claim feed position from save acknowledgment.

**S6-I14-REFRESH-PROOF** — `F/B/H conditional`: Fake provider simulates legitimate save with no feed presence; report attempt vs independent effect vs observed rank separately. Real provider action needs separate one-target authorization; fleet mutation remains OFF until I17 load gate.

### I15 — Scheduled encrypted backup and safe retention

**S6-I15-RETENTION-PATH** — `F/B`: Simulate Downloads/<configured-folder>/ with 15 tracked successful automatic archives, one manual, missing-history and moved-file records. Retain 14 good backups and last-good; never remove manual/untracked/out-of-scope by glob.

### I16 — Staged restore and inactive fresh controller

**S6-I16-SAME-AND-FRESH-PROFILE** — `F/B/H gated`: Restore dummy archive into same profile under independent guard, then into new disposable profile with old controller potentially active. Verify no remote mutation until explicit safe activation, mapping+approval reset and H-06 for migration claim.

### I17 — Full integration, fleet and operator acceptance

**S6-I17-UX-OPERATOR-ACCEPTANCE** — `B/H`: Packaged Firefox six-destination screen-reader/keyboard/320 CSS px/zoom/contrast check and evidence checklist+Markdown H-01/H-07. Do not label synthetic browser fixtures real operator PASS.

**S6-I17-FLEET-ROLL-OUT** — `B/X`: Measure 50 accounts, >=1,000 generators, source quota, heap/tabs, queue ages and restore source under faults. General mutating Refresher may not be enabled without P54-09 and P56 relevant faults plus external efficacy proof.

## 3. Supersession and sequencing notes

- **REQ-D08:** Stage 3 F1/F2 amendment supersedes mandatory writeback-after-approval order; writeback may be manual/opt-in before a separate human publication approval. The requirement remains traced to I13 under its superseded *publication-safety* meaning.
- **REQ-R10:** Stage 2 Q77 supersedes random ±30-minute budget-duration jitter with bounded dispatch staggering that never changes guaranteed active or minimum sleep duration.
- **REQ-U01:** the editor overlay is a separate view of the same controller, not another authority or a permanently open keepalive tab.
- **REQ-G05:** non-READY generator-source Git folder creation during I06/I07 is real Git mutation and cannot bypass journal/CAS/readback subcases of P53-04/P53-05 merely because full-source writeback is formally owned by I11.
- **REQ-X07:** H-02–H-05 remain conditional and late, and live provider writes always need explicit exact-target authorization.
- **Completion marker:** test and requirement IDs may be committed, but a commit must never attempt to contain its own commit SHA, future CI run ID or future squash SHA.

