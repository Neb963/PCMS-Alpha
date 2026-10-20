import test from 'node:test';
import assert from 'node:assert/strict';
import {validateCleanupMessage} from '../src/runtime/s08-cleanup-boundary.mjs';
const api={runtime:{id:'x',getURL:p=>'moz-extension://x/'+p}};
const sender={id:'x',url:'moz-extension://x/pcms/index.html'};
const packet={type:'VERIFY_TEST_REMOTE_ABSENCE',params:{intentId:'intent_s08_123456789abc',runId:'s08_123456789abc'}};
test('S08 cleanup permits only readback of an exact run and intention',()=>{
 assert.equal(validateCleanupMessage(api,sender,packet).ok,true);
 assert.equal(validateCleanupMessage(api,sender,{...packet,params:{...packet.params,delete:true}}).ok,false);
 assert.equal(validateCleanupMessage(api,{id:'foreign',url:sender.url},packet).ok,false);
});
