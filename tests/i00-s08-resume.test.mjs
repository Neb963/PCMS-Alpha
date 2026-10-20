import test from 'node:test';
import assert from 'node:assert/strict';
import {STAGES,createDiagnosticRun,recoverInterruptedDiagnostic} from '../src/ui/s08-diagnostic-core.mjs';
const config={accountId:'account_test_01',personaUid:'persona_test_01',repositoryId:'1411034835',namespace:'pcms-test-qa'};
test('S08 crashed browser cannot silently reissue same run; immutable intent remains recoverable',()=>{
 const run=createDiagnosticRun(config,'a'.repeat(32),100).run;
 const pending={...run,stage:'CREATE',status:'RUNNING'};
 const recovered=recoverInterruptedDiagnostic(pending);
 assert.equal(recovered.status,'HELD');
 assert.equal(recovered.firstFailure.stage,'CREATE');
 assert.equal(recovered.slug,run.slug);
 assert.equal(recovered.intentId,run.intentId);
 assert.equal(recoverInterruptedDiagnostic(run),run);
 const verified={...run,stage:'COMPLETED',status:'RUNNING',events:STAGES.map(stage=>({stage,outcome:'PASS',code:'VERIFIED',at:200}))};
 assert.equal(recoverInterruptedDiagnostic(verified).status,'PASS');
});
