// Statically evaluate the unmodified donor fail-closed gate before registering
// PCMS wake sources. Neither module awaits during listener registration.
import '../lib/recovery-bootstrap.js';
import './s06-authority-bootstrap.mjs';
// Restore STATUS must register before optional dashboard and lengthy startup work.
import './restore-boundary.mjs';
import './wake.mjs';
import './dashboard-action.mjs';
// Independent PCMS journal/command listener; it never controls donor recovery.
import './command-boundary.mjs';
// S00 effect-free coordinator intake; no remote operations or migration.
import './coordinator-boundary.mjs';
import './s08-cleanup-boundary.mjs';
import './diagnostic-startup.mjs';
import './operator-record-boundary.mjs';
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
import './clean-bulk-boundary.mjs';
// R4 audited Git identity review operates only on complete pinned main snapshots.
import './folder-identity-boundary.mjs';
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
    methodProofFor:({source,planned,guard,phase})=>{
      if(phase==='PRECHECK')
        return guard?.runRefresherStep&&guard?.observeReadOnly?
          {source:'GUARDED_FIXED_EDITOR_METHOD',allowedByProvider:true}:null;
      if(!guard?.runRefresherStep||!guard?.observeReadOnly||
         !/^[a-f0-9]{64}$/.test(source?.fingerprint||'')||
         !/^[a-f0-9]{64}$/.test(planned?.toFingerprint||'')||
         source.fingerprint===planned.toFingerprint||
         !Array.isArray(planned.targetFiles)||!planned.targetFiles.length)
        return null;
      return {source:'GUARDED_FIXED_EDITOR_METHOD',
        allowedByProvider:true,meaningfulEffectVerified:true,
        version:'verified_byte_different_source_candidate_v2',
        evidenceId:'candidate_'+planned.toFingerprint.slice(0,32)};
    }
  });
  createRefresherBoundary(browser,{
    observationGate:()=>true,browserClockGate:()=>true,
    refreshGate:()=>true, // canonical policy defaults OFF; operator opts in
    qualificationFor:(row,account)=>native.prepare(row,account),
    refreshAdapter:native
  }).register();
}
