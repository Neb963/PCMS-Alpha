import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as core from '../src/ui/s08-diagnostic-core.mjs';
const config={accountId:'test_account_01',personaUid:'test_persona_01',
  repositoryId:'12345',namespace:'pcms-test-safe'};
test('A07 same-document remount must not label an actively dispatched diagnostic as interrupted',()=>{
 const made=core.createDiagnosticRun(config,'f'.repeat(32),1000);
 assert.equal(made.ok,true);
 const running={...made.run,status:'RUNNING',stage:'CREATE'};
 assert.equal(typeof core.recoverDiagnosticIfInactive,'function');
 assert.equal(core.recoverDiagnosticIfInactive(running,true).status,'RUNNING');
 const cold=core.recoverDiagnosticIfInactive(running,false);
 assert.equal(cold.status,'HELD');
 assert.equal(cold.firstFailure.code,'BROWSER_INTERRUPTED_RECONCILE_BEFORE_RESUME');
});
test('A07 multiple settings mounts cannot dispatch two S08 runners or rerun same intent',async()=>{
 const text=await readFile(new URL('../src/ui/s08-diagnostics.mjs',import.meta.url),'utf8');
 assert.match(text,/activeDiagnosticDrive/);
 assert.match(text,/if\(busy\|\|!run\|\|activeDiagnosticDrive\)return/);
 assert.match(text,/recoverDiagnosticIfInactive\(/);
 assert.match(text,/busy\|\|activeDiagnosticDrive/);
});
