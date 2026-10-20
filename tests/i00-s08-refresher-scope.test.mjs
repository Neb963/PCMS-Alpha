import test from 'node:test';
import assert from 'node:assert/strict';
import {validateRefresherMessage} from '../src/runtime/refresher-boundary.mjs';
const api={runtime:{id:'test-extension',getURL:p=>'moz-extension://test-extension/'+p}};
const sender={id:'test-extension',url:'moz-extension://test-extension/pcms/index.html'};
const packet={type:'DIAGNOSTIC_TARGET_REFRESH',params:{slug:'pcms-test-qa-a1b2c3d4e5f6',accountId:'account_test_01',runId:'s08_'+'a'.repeat(32)}};
test('S08 scoped Refresher only permits valid test target and run',()=>{
 assert.equal(validateRefresherMessage(api,sender,packet).ok,true);
 for(const changed of [
  {...packet,params:{...packet.params,slug:'my-production-generator'}},
  {...packet,params:{...packet.params,runId:'foreign-run'}},
  {...packet,params:{...packet.params,admin:true}},
 ])assert.equal(validateRefresherMessage(api,sender,changed).ok,false);
 assert.equal(validateRefresherMessage(api,{id:'foreign',url:sender.url},packet).ok,false);
});
