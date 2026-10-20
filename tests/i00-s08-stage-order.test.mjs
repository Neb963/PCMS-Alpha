import test from 'node:test';
import assert from 'node:assert/strict';
import {STAGES,validateDisposable} from '../src/ui/s08-diagnostic-core.mjs';
test('S08 live disposable provider path precedes optional local Firefox restart tools',()=>{
 assert.ok(STAGES.indexOf('CREATE')<STAGES.indexOf('PROCESS_RESTART'));
 assert.equal(STAGES.at(0),'SCOPE');
 assert.equal(STAGES.at(-1),'PROCESS_RESTART');
 assert.equal(validateDisposable({accountId:'account_test_01',personaUid:'persona_test_01',repositoryId:'1411034835',namespace:'pcms-test-qa'}).ok,true);
});
