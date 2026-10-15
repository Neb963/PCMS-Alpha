// Statically evaluate the unmodified donor fail-closed gate before registering
// PCMS wake sources. Neither module awaits during listener registration.
import '../lib/recovery-bootstrap.js';
import './wake.mjs';
// Independent PCMS journal/command listener; it never controls donor recovery.
import './command-boundary.mjs';
// I03 listeners are registered in the synchronous entry evaluation path.
import './account-boundary.mjs';
// I04 read-only inventory and durable local observation registration.
import './inventory-boundary.mjs';
// Operator-triggered read-only private Git inspection and canonical mapping.
import './source-boundary.mjs';

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
if(typeof browser!=='undefined')createRefresherBoundary(browser,{
  // I17: fixed read-only Perchance monitoring is admitted only through the
  // donor's current protected Persona lease and independent response schema.
  // Mutating refresh intentionally has no qualified provider adapter.
  observationGate:()=>true
}).register();


// A single browser-action click opens the real PCMS tab, never a donor route
// mutation or a synthetic popup. The original PersonaMonkey control UI stays
// available via the named secondary link within the dashboard.
if (typeof browser !== 'undefined' && browser.action?.onClicked) {
  browser.action.onClicked.addListener(() => {
    browser.runtime.openOptionsPage().catch(() => {
      // The click cannot grant capabilities. User can still open Add-ons > Options.
    });
  });
}
