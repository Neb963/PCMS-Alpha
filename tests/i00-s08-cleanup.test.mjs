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

import {createS08CleanupBoundary} from '../src/runtime/s08-cleanup-boundary.mjs';
import {fakeDatabase} from './fake-idb.mjs';
test('J06 cleanup binds actual protected READ_TARGET and canonical account, using the production route shape with no principal field',async()=>{
 for(const adverse of [null,'route','account','target','principal']){
  const db=fakeDatabase(),accountId='account_cleanup_001',personaUid='persona_cleanup_001',H='a'.repeat(64),namespace='pcms-test-cleanup',slug=namespace+'-123456789abc';
  const config={accountId,personaUid,repositoryId:'42',namespace},run={runId:packet.params.runId,intentId:packet.params.intentId,slug,config};
  const data={pcmsS08DisposableScope:config,pcmsS08DiagnosticRun:run},local={get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,data[k]]))};
  const account={accountId,personaUid,state:'VERIFIED',revision:3,bindingVersion:2,identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:2,principalFingerprint:H}};
  const put=async value=>new Promise(r=>{const t=db.transaction('meta','readwrite');t.oncomplete=r;t.objectStore('meta').put({key:'account:'+accountId,account:value})});await put(account);
  let reads=0,routeCalls=0;
  const boundary=createS08CleanupBoundary({...api,storage:{local}},{open:async()=>db,storeFactory:()=>({getCreate:async()=>({ok:true,record:{accountId,slug}})}),guard:()=>({getSafeRouteReadiness:async()=>({ready:true,personaUid,cookieStoreId:'container-1',routeId:adverse==='route'&&routeCalls++?'changed':'protected'}),runSupplyStep:async(uid,request)=>{
   assert.equal(uid,personaUid);assert.equal(request.kind,'READ_TARGET');assert.equal(request.principalFingerprint,H);reads++;
   if(adverse==='account')await put({...account,revision:4});
   return adverse==='principal'?{ok:false,code:'PRINCIPAL_CHANGED'}:{ok:true,source:'INDEPENDENT_TARGET_READBACK',state:'MISSING_VERIFIED',slug:adverse==='target'?'another-generator':slug,ownerMatches:false};
  }})});
  const out=await boundary.run(packet,sender);assert.equal(out.ok,adverse===null,JSON.stringify({adverse,out}));assert.equal(reads,1);
 }
});
