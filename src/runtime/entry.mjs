// Statically evaluate the unmodified donor fail-closed gate before registering
// PCMS wake sources. Neither module awaits during listener registration.
import '../lib/recovery-bootstrap.js';
// Restore STATUS must register before optional dashboard and lengthy startup work.
import './restore-boundary.mjs';
import './wake.mjs';
import './dashboard-action.mjs';
// Independent PCMS journal/command listener; it never controls donor recovery.
import './command-boundary.mjs';
// S00 effect-free coordinator intake; no remote operations or migration.
import './coordinator-boundary.mjs';
import './s08-cleanup-boundary.mjs';
import './creation-watch.mjs';
// I03 listeners are registered in the synchronous entry evaluation path.
import './account-boundary.mjs';
// I04 read-only inventory and durable local observation registration.
import './inventory-boundary.mjs';
// Operator-triggered read-only private Git inspection and canonical mapping.
import './source-boundary.mjs';
// S03 complete main-only catalog and Git-owned prompt (read-only admission).
import './catalog-boundary.mjs';
// R3 evidence-scoped read-only operational diagnostics.
import './readiness-boundary.mjs';
// S03 main observer wakes from alarms without an open dashboard.
import './catalog-watch.mjs';
// S05 read-only main/owner/byte readiness diagnostics without effect admission.
import './ready-operator.mjs';

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

// I12 one durable scheduler; protected read-only feed observations enabled.
import {createRefresherBoundary} from './refresher-boundary.mjs';
import {createRefresherNativeAdapter} from './refresher-native.mjs';
// Guarded source-only adapter is packaged, but L/route/clock/consent activation
// remains OFF until independently proven. Never infer it from an installed XPI.
if(typeof browser!=='undefined'){
  const native=createRefresherNativeAdapter({
    // A fixed, source-integrity-constrained I13 editor save is an installed
    // engineering capability, not proof of subsequent recent-feed placement.
    methodProofFor:()=>({
      source:'GUARDED_FIXED_EDITOR_METHOD',allowedByProvider:true,
      meaningfulEffectVerified:true,version:'source_marker_v1',
      evidenceId:'i13_verified_source_writer'
    })
  });
  createRefresherBoundary(browser,{
    observationGate:()=>true,nativeClockGate:()=>true,
    refreshGate:()=>true, // canonical policy defaults OFF; operator opts in
    qualificationFor:(row,account)=>native.prepare(row,account),
    refreshAdapter:native
  }).register();
}
