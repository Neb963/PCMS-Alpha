import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createInventoryStore} from '../src/runtime/inventory.mjs';
import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';
import {createCreationRunner} from '../src/runtime/creation-runner.mjs';
import {recoverMissingCreationCensus} from '../src/runtime/creation-inventory.mjs';
import {previewCreation} from '../src/runtime/creation-preview.mjs';
globalThis.crypto??=webcrypto;
const principal='a'.repeat(64);
const makeAccount=(accountId,personaUid,state='VERIFIED')=>({
 accountId,personaUid,state,revision:4,bindingVersion:1,
 identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:principal}});
const alpha=makeAccount('account_census_alpha','persona_census_alpha');
const beta=makeAccount('account_census_beta','persona_census_beta');
async function seed(db,accounts){
 await new Promise(resolve=>{const tx=db.transaction(['meta'],'readwrite');tx.oncomplete=resolve;
  for(const account of accounts)tx.objectStore('meta').put({key:'account:'+account.accountId,account});
 });
}
function witness(a,at=Date.now()){
 return {source:'GUARDED_PERCHANCE_READBACK',complete:true,accountId:a.accountId,
  personaUid:a.personaUid,accountRevision:a.revision,bindingVersion:a.bindingVersion,
  principalFingerprint:a.identity.principalFingerprint,
  observationId:'census_'+crypto.randomUUID(),observedAt:at,generators:[]};
}
test('new submitted generator autonomously synchronizes one real missing census per bounded step, then allocates without creating',async()=>{
 const db=fakeDatabase(),observed=[],mutations=[];
 await seed(db,[alpha,beta]);
 const c=createCoordinatorStore(db),intentId='intent_missing_census01';
 const accepted=await c.acceptCreate({intentId,slug:'disposable-new-fixture',origin:'OPERATOR',accountId:null});
 assert.equal(accepted.ok,true);
 const before=await previewCreation(db,{slugs:['disposable-new-fixture']});
 assert.equal(before.items[0].code,'INITIAL_INVENTORY_UNKNOWN');
 const reader=createInventoryStore(db);
 const syncInventory=async(id,revision)=>{
  observed.push(id);
  const a=[alpha,beta].find(a=>a.accountId===id);assert.equal(a.revision,revision);
  return reader.applyObservation(a,witness(a,Date.now()+observed.length));
 };
 const runner=createCreationRunner({storage:{local:{get:async()=>({})}}},{
  open:async()=>db,syncInventory,importGuard:async()=>({ok:true}),
  guard:()=>({getSafeRouteReadiness:async()=>{mutations.push('GUARD');throw Error('NO_EFFECT_AT_ALLOCATION')}}),
  createGit:()=>({step:async()=>{mutations.push('GIT')}})});
 const first=await runner.step(intentId,accepted.record.revision);
 assert.equal(first.code,'INITIAL_INVENTORY_REFRESHED');
 assert.deepEqual(observed,[alpha.accountId]);
 assert.equal(db.keys('operations').length,0);
 const waiting=await c.getCreate(intentId);assert.equal(waiting.record.state,'WAITING_CAPABILITY');
 const second=await runner.step(intentId,waiting.record.revision);
 assert.equal(second.ok,true);
 assert.equal(second.record.state,'OWNER_READBACK_PENDING');
 assert.deepEqual(observed,[alpha.accountId,beta.accountId]);
 assert.equal(db.keys('operations').length,0);
 assert.deepEqual(mutations,[]);
 const after=await previewCreation(db,{slugs:['another-disposable']});
 assert.equal(after.items[0].action,'CREATE');
});
test('explicit account selection does not need unrelated account census',async()=>{
 const db=fakeDatabase(),observed=[];await seed(db,[alpha,beta]);
 const inventory=createInventoryStore(db);
 const out=await recoverMissingCreationCensus({db,accountId:beta.accountId,
  syncInventory:async(id)=>{observed.push(id);return inventory.applyObservation(beta,witness(beta))}});
 assert.equal(out.ok,true);assert.deepEqual(observed,[beta.accountId]);
 const plan=await previewCreation(db,{slugs:['pinned-disposable'],accountId:beta.accountId});
 assert.equal(plan.items[0].action,'CREATE');
 const auto=await previewCreation(db,{slugs:['unassigned-disposable']});
 assert.equal(auto.items[0].code,'INITIAL_INVENTORY_UNKNOWN');
});
test('unverified account or failed guarded sync cannot invent an empty census or send CREATE',async()=>{
 const held=makeAccount('account_census_held','persona_census_held','WAITING_LOGIN');
 const db=fakeDatabase();await seed(db,[held]);
 let calls=0;
 const blocked=await recoverMissingCreationCensus({db,syncInventory:async()=>{calls++;return {ok:true}}});
 assert.equal(blocked.code,'INITIAL_INVENTORY_ACCOUNT_UNVERIFIED');
 assert.equal(calls,0);
 const db2=fakeDatabase();await seed(db2,[alpha]);
 const failed=await recoverMissingCreationCensus({db:db2,syncInventory:async()=>({ok:false,code:'MULLVAD_PROXY_UNREACHABLE'})});
 assert.equal(failed.code,'MULLVAD_PROXY_UNREACHABLE');
 assert.equal(db2.read('meta','inventory-batch:'+alpha.accountId),undefined);
 const untrusted=await recoverMissingCreationCensus({db:db2,syncInventory:async()=>({ok:true})});
 assert.equal(untrusted.code,'INITIAL_INVENTORY_UNVERIFIED');
 assert.equal(db2.keys('operations').length,0);
});
test('an ambiguous owner result cannot qualify a fresh zero count or unlock automatic creation',async()=>{
 const db=fakeDatabase();await seed(db,[alpha]);
 const inventory=createInventoryStore(db);
 const bad=await recoverMissingCreationCensus({db,syncInventory:async()=>{
  return inventory.applyObservation(alpha,{...witness(alpha),generators:[{
   slug:'unverified-owned',remoteId:'remote_unknown_01',ownerResult:'UNKNOWN'
  }]});
 }});
 assert.equal(bad.code,'INITIAL_INVENTORY_UNVERIFIED');
 const marker=db.read('meta','inventory-batch:'+alpha.accountId);
 assert.equal(marker?.countsTrusted,false);
 const preview=await previewCreation(db,{slugs:['new-unverified']});
 assert.equal(preview.items[0].action,'HELD');
});
