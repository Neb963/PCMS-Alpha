import test from 'node:test';
import assert from 'node:assert/strict';
import {validateAiMessage} from '../src/runtime/ai-boundary.mjs';
const api={runtime:{id:'pcms-test',getURL:s=>'moz-extension://fixed/'+s}};
const own={id:'pcms-test',url:'moz-extension://fixed/pcms/index.html#work-queue'};
const opfs={type:'INSPECT_WORKSPACE',params:{slug:'owned-unlisted',expectedRevision:7}};
test('P52-06 F: read-only OPFS work request admitted only from exact own Work Queue origin',()=>{
  assert.deepEqual(validateAiMessage(api,own,opfs),{ok:true});
  assert.equal(validateAiMessage(api,{...own,url:'https://perchance.org/owned-unlisted#edit'},opfs).code,
    'UNTRUSTED_SENDER');
  assert.equal(validateAiMessage(api,{...own,id:'other-extension'},opfs).code,
    'UNTRUSTED_SENDER');
  assert.equal(validateAiMessage(api,{...own,url:'moz-extension://fixed/pcms/index.html#work-queue-extra'},opfs).code,
    'UNTRUSTED_SENDER');
});
test('P52-06 X: no caller can inject OPFS path, SID, page code or claimed isolation PASS',()=>{
  for(const extra of [{sessionId:'secret'}, {path:'sessions/old'}, {isolation:'VERIFIED'},
    {proof:true}, {script:'return true'}, {serverEndAck:'ACKED'}]){
    const result=validateAiMessage(api,own,{type:'INSPECT_WORKSPACE',
      params:{...opfs.params,...extra}});
    assert.equal(result.code,'INVALID_PARAMS',JSON.stringify(extra));
  }
  assert.equal(validateAiMessage(api,own,{type:'INSPECT_WORKSPACE',
    params:{slug:'../edit',expectedRevision:7}}).code,'INVALID_SLUG');
  assert.equal(validateAiMessage(api,own,{type:'INSPECT_WORKSPACE',
    params:{slug:'owned-unlisted',expectedRevision:0}}).code,'INVALID_PARAMS');
});
