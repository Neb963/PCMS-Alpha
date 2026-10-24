import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as diagnostic from '../src/ui/s08-diagnostic-core.mjs';

const config={accountId:'test_account_01',personaUid:'test_persona_01',
  repositoryId:'12345',namespace:'pcms-test-safe'};
const first=diagnostic.createDiagnosticRun(config,'a'.repeat(32),1000);
assert.equal(first.ok,true);

test('A07: diagnostic with NOT_TESTED external H stages cannot replay same CREATE intent',()=>{
 const incomplete={...first.run,stage:'COMPLETED',status:'NOT_TESTED',
   events:[{stage:'CREATE',outcome:'PASS',code:'CREATED',at:1001},
    {stage:'BACKUP',outcome:'NOT_TESTED',code:'INDEPENDENT_CI',at:1002}]};
 assert.equal(typeof diagnostic.canStartNewDiagnostic,'function',
   'the UI must share a replay-safe core guard');
 assert.equal(diagnostic.canStartNewDiagnostic(incomplete),false,
   'NOT_TESTED completion is not permission to replay CREATE');
 assert.equal(diagnostic.canStartNewDiagnostic({...incomplete,status:'HELD'}),false);
 assert.equal(diagnostic.canStartNewDiagnostic({...incomplete,status:'PASS'}),false);
 assert.equal(diagnostic.canStartNewDiagnostic(null),true);
 assert.equal(diagnostic.canStartNewDiagnostic(first.run),true);
 assert.equal(diagnostic.canStartNewDiagnostic({...first.run,
   events:[{stage:'CREATE',outcome:'UNCERTAIN',code:'LOST_ACK',at:1003}]}),false);
});

test('A07 primary and historical diagnostic buttons use one guarded admission',async()=>{
 const view=await readFile(new URL('../src/ui/s08-diagnostics.mjs',import.meta.url),'utf8');
 assert.match(view,/canStartNewDiagnostic\(run\)/);
 assert.doesNotMatch(view,/run\.status!=='NOT_TESTED'/);
});
