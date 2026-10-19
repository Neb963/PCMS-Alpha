// Statically evaluate the unmodified donor fail-closed gate before registering
// PCMS wake sources. Neither module awaits during listener registration.
import '../lib/recovery-bootstrap.js';
import './wake.mjs';
// Independent PCMS journal/command listener; it never controls donor recovery.
import './command-boundary.mjs';
// S00 effect-free coordinator intake; no remote operations or migration.
import './coordinator-boundary.mjs';
import './creation-watch.mjs';
// I03 listeners are registered in the synchronous entry evaluation path.
import './account-boundary.mjs';
// I04 read-only inventory and durable local observation registration.
import './inventory-boundary.mjs';
// Operator-triggered read-only private Git inspection and canonical mapping.
import './source-boundary.mjs';
// S03 complete main-only catalog and Git-owned prompt (read-only admission).
import './catalog-boundary.mjs';
// S03 main observer wakes from alarms without an open dashboard.
import './catalog-watch.mjs';

// I06 frozen allocation and held guarded two-stage provider dispatcher.
import './supply-boundary.mjs';

// I07 explicitly consented, read-only original-source capture.
import './adoption-boundary.mjs';

// I09 durable staged source and content-script handoff listeners.
import './staging-boundary.mjs';

// I10 native AI policy/configuration port (provider execution gated).
import './ai-boundary.mjs';
// I11 Git-only revision-safe writeback (capability OFF by default).
import './writeback-boundary.mjs';
// I13 exact-source human approval and fail-closed publication listener.
import './release-boundary.mjs';
import './existing-update-boundary.mjs';
// I15 local scheduled backup must wake without a PCMS tab.
import './backup-auto-boundary.mjs';
// I16 staged restore, with permanent inactive controller under review.
import './restore-boundary.mjs';
// I12 one durable shadow queue/alarm; provider observations gated OFF.
import {createRefresherBoundary} from './refresher-boundary.mjs';
if(typeof browser!=='undefined')createRefresherBoundary(browser).register();
