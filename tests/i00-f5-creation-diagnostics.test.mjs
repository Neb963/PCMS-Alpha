import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createCreationRunner} from '../src/runtime/creation-runner.mjs';

const PRINCIPAL='a'.repeat(64);
function readiness(routeId='route_01'){
 return {ready:true,personaUid:'persona_scope_01',cookieStoreId:'container_01',
  routeId,principalFingerprint:PRINCIPAL};
}
async function fixture({duringRead,runSupplyStep=async()=>({ok:false,code:'TEMPLATE_SOURCE_UNVERIFIED'})}={}){
 const db=fakeDatabase(),writes=[];
 const item={intentId:'intent_scope_0001',revision:4,state:'OWNER_READBACK_PENDING',
  slug:'new-disposable-test-01',accountId:'account_scope_01',accountRevision:2,
  bindingVersion:1,personaUid:'persona_scope_01',principalFingerprint:PRINCIPAL};
 const account={revision:2,state:'VERIFIED',personaUid:item.personaUid,bindingVersion:1,
  identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:PRINCIPAL}};
 await new Promise(resolve=>{
  const tx=db.transaction(['meta'],'readwrite');tx.oncomplete=resolve;
  tx.objectStore('meta').put({key:'account:'+item.accountId,account});
 });
 let observed=0;
 const guard={getSafeRouteReadiness:async()=>{
   observed++;return observed===1?readiness():duringRead?.()||readiness();
  },runSupplyStep:async(...args)=>{writes.push(args);return runSupplyStep(...args);}};
 const store={getCreate:async()=>({ok:true,record:item}),
  requeueArchivedUnattempted:async()=>({ok:false,code:'ACCOUNT_NOT_ARCHIVED'}),
  refreshCreateAccountContext:async()=>({ok:true,contextRefreshed:false}),
  stageEffect:async()=>{throw Error('NO_STAGE_ON_FAILED_READ')}};
 const api={storage:{local:{get:async()=>({})}}};
 const runner=createCreationRunner(api,{open:async()=>db,makeStore:()=>store,
  createGit:()=>({step:async()=>{throw Error('NO_GIT')}}),guard:()=>guard,
  effectGate:()=>false,importGuard:async()=>({ok:true})});
 return {out:()=>runner.step(item.intentId,item.revision),writes};
}
test('F5 creation readback reports independently observed broken bridge instead of route/context generic',async()=>{
 const f=await fixture({duringRead:()=>({ready:false,code:'MULLVAD_PROXY_UNREACHABLE'})});
 const out=await f.out();assert.equal(out.code,'MULLVAD_PROXY_UNREACHABLE');
 assert.equal(f.writes.length,1);assert.equal(f.writes[0][1].kind,'READ_TARGET');
});
test('F5 creation readback preserves provider template failure with otherwise healthy route',async()=>{
 const f=await fixture();
 const out=await f.out();assert.equal(out.code,'TEMPLATE_SOURCE_UNVERIFIED');
 assert.equal(f.writes.length,1);
});
test('F5 creation readback fails closed on protected route change despite provider observation',async()=>{
 const f=await fixture({duringRead:()=>readiness('different_route_02'),runSupplyStep:async()=>({
  ok:true,source:'INDEPENDENT_TARGET_READBACK',state:'MISSING_VERIFIED',
  slug:'new-disposable-test-01'})});
 const out=await f.out();assert.equal(out.code,'PROTECTED_CONTEXT_CHANGED');
 assert.equal(f.writes.length,1);
});
