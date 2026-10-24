import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createInventoryStore} from '../src/runtime/inventory.mjs';
import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';
import {createCreationRunner} from '../src/runtime/creation-runner.mjs';
import {qualifiedCreationInventory,CREATION_INVENTORY_MAX_AGE_MS} from '../src/runtime/creation-inventory.mjs';
globalThis.crypto??=webcrypto;
const a={accountId:'account_j02_fresh',personaUid:'persona-j02-fresh',state:'VERIFIED',
 revision:4,bindingVersion:1,boundPrincipal:'a'.repeat(64),
 identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:'a'.repeat(64)}};
const at=Date.now();
const marker={source:'GUARDED_PERCHANCE_READBACK',complete:true,conflicts:0,
 observationId:'initial_inventory_j02',observedAt:at,accountRevision:4,bindingVersion:1};
async function put(db,rows){const tx=db.transaction(['meta'],'readwrite');
 for(const row of rows)tx.objectStore('meta').put(row);
 await new Promise((r,j)=>{tx.oncomplete=r;tx.onabort=j});}
test('J02 fresh census requires complete guarded current context, no conflicts and no fabricated future age',()=>{
 assert.equal(qualifiedCreationInventory(marker,a,at),true);
 for(const patch of [{complete:false},{conflicts:1},{accountRevision:3},{bindingVersion:2},
  {source:'OPERATOR'},{observedAt:at-CREATION_INVENTORY_MAX_AGE_MS-1},{observedAt:at+1}]){
  assert.equal(qualifiedCreationInventory({...marker,...patch},a,at),false,JSON.stringify(patch));
 }
});
test('J02 stale count refresh commits real inventory before CREATE preparation; uncertain readback never refreshes or repeats creation',async()=>{
 const db=fakeDatabase(),s=createCoordinatorStore(db),events=[];
 await put(db,[{key:'account:'+a.accountId,account:a},
  {key:'inventory-batch:'+a.accountId,...marker,observedAt:at-600000}]);
 const begun=await s.acceptCreate({intentId:'intent_j02_fresh',slug:'j02-fresh',origin:'OPERATOR'});
 const api={storage:{local:{get:async()=>({})}}},route={ready:true,
  personaUid:a.personaUid,cookieStoreId:'fixture-context',routeId:'fixture-protected'};
 const worker=createCreationRunner(api,{open:async()=>db,effectGate:()=>true,
  guard:()=>({getSafeRouteReadiness:async()=>route,runSupplyStep:async(_uid,req)=>{
    if(req.kind==='READ_TARGET')return {ok:true,source:'INDEPENDENT_TARGET_READBACK',
      slug:req.slug,state:'MISSING_VERIFIED'};
    if(req.kind==='CREATE'){events.push('CREATE');return {ok:false,code:'ACK_LOST'}}
    throw Error('Unexpected effect '+req.kind);
  }}),
  syncInventory:async(id,revision)=>{
    events.push('INVENTORY');
    return createInventoryStore(db).applyObservation(a,{
      source:'GUARDED_PERCHANCE_READBACK',complete:true,accountId:id,personaUid:a.personaUid,
      accountRevision:revision,bindingVersion:1,principalFingerprint:a.boundPrincipal,
      observationId:'refreshed_inventory_j02',observedAt:Date.now(),generators:[]});
  }});
 const next=async()=>{const current=await s.getCreate(begun.record.intentId);
  return worker.step(current.record.intentId,current.record.revision)};
 await next();await next();
 const prepared=await next();assert.equal(prepared.record.state,'CREATE_PREPARED');
 assert.equal(prepared.record.inventoryCheckpoint.observationId,'refreshed_inventory_j02');
 assert.deepEqual(events,['INVENTORY']);
 const dispatched=await next();assert.equal(dispatched.record.state,'CREATE_UNCERTAIN');
 assert.deepEqual(events,['INVENTORY','CREATE']);
 assert.equal((await next()).code,'CREATE_OUTCOME_UNKNOWN_NO_IDENTITY');
 assert.deepEqual(events,['INVENTORY','CREATE']);assert.equal(db.keys('operations').length,1);
});
test('J02 no-op or held refresh cannot authorize preparing a provider effect',async()=>{
 for(const outcome of [{ok:true,conflicts:0},{ok:true,held:true,conflicts:1},{ok:false,code:'PROVIDER_UNAVAILABLE'}]){
  const db=fakeDatabase(),s=createCoordinatorStore(db),effects=[];
  await put(db,[{key:'account:'+a.accountId,account:a},
   {key:'inventory-batch:'+a.accountId,...marker,observedAt:1}]);
  const begun=await s.acceptCreate({intentId:'intent_j02_held_refresh',slug:'j02-held-refresh',origin:'OPERATOR'});
  const route={ready:true,personaUid:a.personaUid,cookieStoreId:'fixture-context',routeId:'fixture-protected'};
  const worker=createCreationRunner({storage:{local:{get:async()=>({})}}},{open:async()=>db,
   effectGate:()=>true,syncInventory:async()=>outcome,
   guard:()=>({getSafeRouteReadiness:async()=>route,runSupplyStep:async(_uid,req)=>{
    effects.push(req.kind);return {ok:true,source:'INDEPENDENT_TARGET_READBACK',slug:req.slug,state:'MISSING_VERIFIED'};
   }})});
  for(let i=0;i<2;i++){const cur=await s.getCreate(begun.record.intentId);await worker.step(cur.record.intentId,cur.record.revision)}
  const cur=await s.getCreate(begun.record.intentId),held=await worker.step(cur.record.intentId,cur.record.revision);
  assert.equal(held.ok,false,JSON.stringify(outcome));assert.equal(db.keys('operations').length,0);
  assert.deepEqual(effects,['READ_TARGET']);
 }
});
