import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';
import {createCreationRunner} from '../src/runtime/creation-runner.mjs';
import {advanceS04Effect} from '../src/runtime/creation-effects.mjs';
import {createInventoryStore} from '../src/runtime/inventory.mjs';
import {createAccountStore} from '../src/runtime/accounts.mjs';
globalThis.crypto??=webcrypto;
const slug='s04-runner-test';
const account={accountId:'account_s04_123',personaUid:'persona_s04_123',
  revision:4,bindingVersion:1,state:'VERIFIED',
  identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,
    principalFingerprint:'a'.repeat(64)}};
const route={ready:true,personaUid:account.personaUid,
  cookieStoreId:'fixture-container',routeId:'fixture-protected'};
async function put(db,rows){const tx=db.transaction(['meta'],'readwrite');
  for(const row of rows)tx.objectStore('meta').put(row);
  await new Promise((r,j)=>{tx.oncomplete=r;tx.onabort=j;});}
async function setup(){
  const db=fakeDatabase(),store=createCoordinatorStore(db);
  await put(db,[{key:'account:'+account.accountId,account},
    {key:'inventory-batch:'+account.accountId,observationId:'obs_12345678',observedAt:123}]);
  const created=await store.acceptCreate({origin:'OPERATOR',slug,
    accountId:account.accountId,intentId:'intent_s04_1234'});
  const api={storage:{local:{get:async()=>({})}}};
  return {db,store,api,id:created.record.intentId};
}
function runner(ctx,{gate=true,lostAck=false}={}){
  const ledger=[],guard={
    getSafeRouteReadiness:async()=>route,
    runSupplyStep:async (persona,req)=>{
      assert.equal(persona,account.personaUid);
      if(req.kind==='READ_TARGET')return {ok:true,
        source:'INDEPENDENT_TARGET_READBACK',state:'MISSING_VERIFIED',slug:req.slug};
      if(req.kind==='CREATE'){
        ledger.push('CREATE');
        return lostAck?{ok:false,code:'ACK_LOST'}:
          {ok:true,ack:'CREATED',temporarySlug:'temp-s04'};
      }
      if(req.kind==='READ_CREATE')return {ok:true,
        source:'INDEPENDENT_READBACK',ownerMatches:true,privateEmpty:true,
        remoteId:'remote_s04_123',temporarySlug:'temp-s04'};
      if(req.kind==='RENAME'){ledger.push('RENAME');return {ok:true,ack:'RENAMED'};}
      if(req.kind==='READ_RENAME')return {ok:true,
        source:'INDEPENDENT_READBACK',ownerMatches:true,privateEmpty:true,
        remoteId:'remote_s04_123',temporarySlug:'temp-s04',
        previousSlug:'temp-s04',slug};
      throw Error('Unexpected '+req.kind);
    }
  };
  return {ledger,worker:createCreationRunner(ctx.api,{open:async()=>ctx.db,
    guard:()=>guard,effectGate:()=>gate})};
}
test('S04 effect D: guarded two provider writes after committed possible-effect ledgers',async()=>{
  const ctx=await setup(),r=runner(ctx);
  async function next(){
    const current=await ctx.store.getCreate(ctx.id);
    return r.worker.step(ctx.id,current.record.revision);
  }
  let out=await next();assert.equal(out.record.state,'OWNER_READBACK_PENDING');
  out=await next();assert.equal(out.record.state,'OWNER_MISSING_VERIFIED');
  out=await next();assert.equal(out.record.state,'CREATE_PREPARED');
  out=await next();assert.equal(out.record.state,'CREATE_OBSERVING');
  assert.deepEqual(r.ledger,['CREATE']);
  assert.equal(ctx.db.read('operations',out.record.createOperationId).status,'OBSERVING');
  out=await next();assert.equal(out.record.state,'PRIVATE_EMPTY_CONFIRMED');
  out=await next();assert.equal(out.record.state,'RENAME_PREPARED');
  out=await next();assert.equal(out.record.state,'RENAME_OBSERVING');
  assert.deepEqual(r.ledger,['CREATE','RENAME']);
  out=await next();assert.equal(out.record.state,'GIT_INIT_PENDING');
  assert.equal((await next()).code,'GIT_RECONNECT_REQUIRED');
  assert.equal(ctx.db.keys('operations').length,2);
});
test('S04 effect D: no effects in packaged default gate and no repeat after lost CREATE ACK',async()=>{
  const ctx=await setup(),inactive=runner(ctx,{gate:false});
  async function next(worker=inactive.worker){
    const current=await ctx.store.getCreate(ctx.id);
    return worker.step(ctx.id,current.record.revision);
  }
  await next();await next();
  assert.equal((await next()).code,'PROVIDER_ACTIVATION_HELD');
  assert.equal(ctx.db.keys('operations').length,0);
  const live=runner(ctx,{gate:true,lostAck:true});
  await next(live.worker);
  let out=await next(live.worker);
  assert.equal(out.record.state,'CREATE_UNCERTAIN');
  assert.deepEqual(live.ledger,['CREATE']);
  const restarted=runner(ctx,{gate:true,lostAck:false});
  const held=await next(restarted.worker);
  assert.equal(held.code,'CREATE_OUTCOME_UNKNOWN_NO_IDENTITY');
  assert.deepEqual(restarted.ledger,[]);
  assert.equal(ctx.db.read('operations',out.record.createOperationId).status,'HELD_UNCERTAIN');
});
test('S04 effect D: ACK, visibility or remote ID are not independent proof',()=>{
  const record={intentId:'intent_12345678',slug:'s04-target',
    revision:5,state:'CREATE_OBSERVING',ackTemporarySlug:'temp-12345678'};
  const wrong=advanceS04Effect(record,'CREATE_CONFIRMED',{
    source:'ACK',remoteId:'remote_12345678',privateEmpty:true,
    ownerMatches:true,temporarySlug:'temp-12345678'});
  assert.equal(wrong.ok,false);
  assert.equal(advanceS04Effect({...record,state:'CREATE_UNCERTAIN'},
    'CREATE_PREPARE',{operationId:'op_00000001',fingerprint:'a'.repeat(64)}).ok,false);
});

test('J01 same-principal reactivation safely resumes uncertain CREATE by readback after current inventory',async()=>{
 const ctx=await setup(),worker=runner(ctx),accounts=createAccountStore(ctx.db);
 await put(ctx.db,[{key:'account:'+account.accountId,account:{...account,boundPrincipal:'a'.repeat(64)}}]);
 const next=async()=>{const x=await ctx.store.getCreate(ctx.id);return worker.worker.step(ctx.id,x.record.revision)};
 await next();await next();let prepared=await next();
 let dispatched=await ctx.store.stageEffect({intentId:ctx.id,expectedRevision:prepared.record.revision,event:'CREATE_DISPATCH'});
 const unknown=await ctx.store.stageEffect({intentId:ctx.id,expectedRevision:dispatched.record.revision,event:'CREATE_UNCERTAIN',proof:{temporarySlug:'temp-s04'}});
 assert.equal(unknown.record.state,'CREATE_UNCERTAIN');
 const original=structuredClone(unknown.record);
 let a=(await accounts.get(account.accountId)).account;
 a=(await accounts.apply({type:'ARCHIVE',accountId:a.accountId,expectedRevision:a.revision})).account;
 a=(await accounts.apply({type:'REACTIVATE',accountId:a.accountId,expectedRevision:a.revision,explicitReactivation:true})).account;
 a=(await accounts.apply({type:'VERIFY',accountId:a.accountId,expectedRevision:a.revision,proof:{
   source:'GUARDED_SESSION_READBACK',verified:true,personaUid:a.personaUid,
   principalFingerprint:'a'.repeat(64),observationId:'identity_reactivated_01'}})).account;
 assert.equal(a.bindingVersion,account.bindingVersion);
 assert.ok(a.revision>original.accountRevision);
 assert.equal((await next()).code,'CURRENT_INVENTORY_REQUIRED');
 await put(ctx.db,[{key:'inventory-batch:'+a.accountId,observationId:'inventory_current_01',
   accountRevision:a.revision,bindingVersion:a.bindingVersion,observedAt:999}]);
 const refreshed=await next();assert.equal(refreshed.contextRefreshed,true);
 assert.equal(refreshed.record.state,original.state);
 assert.equal(refreshed.record.createOperationId,original.createOperationId);
 assert.equal(refreshed.record.createFingerprint,original.createFingerprint);
 assert.deepEqual(worker.ledger,[]);
 const readback=await next();assert.equal(readback.record.state,'PRIVATE_EMPTY_CONFIRMED');
 assert.deepEqual(worker.ledger,[],'no CREATE or RENAME replay on resumed uncertainty');
});

test('J01 Archive still requeues never-attempted automatic work before context recovery',async()=>{
 const ctx=await setup();
 const auto=await ctx.store.acceptCreate({origin:'OPERATOR',slug:'j01-auto-requeue',intentId:'intent_j01_auto'});
 const allocated=await ctx.store.allocateCreate(auto.record.intentId,auto.record.revision);
 assert.equal(allocated.record.state,'OWNER_READBACK_PENDING');
 const accounts=createAccountStore(ctx.db);
 await accounts.apply({type:'ARCHIVE',accountId:account.accountId,expectedRevision:account.revision});
 const out=await runner(ctx).worker.step(auto.record.intentId,allocated.record.revision);
 assert.equal(out.ok,true);assert.equal(out.record.state,'WAITING_CAPABILITY');
 assert.equal(out.record.accountId,null);
 const pinned=await ctx.store.getCreate(ctx.id);
 // The separately pinned reservation was never silently reassigned.
 assert.equal(pinned.record.accountId,account.accountId);
});

test('J02 unavailable provisional allocation waits through identity and inventory recovery before provider writes',async()=>{
 const ctx=await setup(),accounts=createAccountStore(ctx.db),r=runner(ctx,{gate:true});
 await put(ctx.db,[{key:'account:'+account.accountId,account:{...account,boundPrincipal:'a'.repeat(64)}}]);
 const hold=await accounts.apply({type:'REVERIFY',accountId:account.accountId,expectedRevision:4});
 assert.equal(hold.ok,true);assert.equal(hold.account.identity,null);
 const planned=await r.worker.step(ctx.id,1);
 assert.equal(planned.ok,true);assert.equal(planned.record.accountId,account.accountId);
 let current=await ctx.store.getCreate(ctx.id);
 assert.equal((await r.worker.step(ctx.id,current.record.revision)).code,'ACCOUNT_CONTEXT_CHANGED');
 assert.deepEqual(r.ledger,[]);assert.equal(ctx.db.keys('operations').length,0);
 const verified=await accounts.apply({type:'VERIFY',accountId:account.accountId,
  expectedRevision:hold.account.revision,requireInventory:true,proof:{
   source:'GUARDED_SESSION_READBACK',verified:true,personaUid:account.personaUid,
   principalFingerprint:'a'.repeat(64),observationId:'identity_j02_recovered'}});
 assert.equal(verified.ok,true);assert.equal(verified.account.state,'INVENTORY_PENDING');
 assert.equal((await r.worker.step(ctx.id,current.record.revision)).code,'ACCOUNT_CONTEXT_CHANGED');
 const synced=await createInventoryStore(ctx.db).applyObservation(verified.account,{
  source:'GUARDED_PERCHANCE_READBACK',complete:true,accountId:account.accountId,
  personaUid:account.personaUid,accountRevision:verified.account.revision,bindingVersion:1,
  principalFingerprint:'a'.repeat(64),observationId:'inventory_j02_recovered',
  observedAt:Date.now(),generators:[]});
 assert.equal(synced.ok,true);
 assert.equal((await accounts.confirmInventory(account.accountId,verified.account.revision)).ok,true);
 const restored=await r.worker.step(ctx.id,current.record.revision);
 assert.equal(restored.contextRefreshed,true);assert.deepEqual(r.ledger,[]);
 for(let i=0;i<3;i++){
  current=await ctx.store.getCreate(ctx.id);
  const out=await r.worker.step(ctx.id,current.record.revision);
  assert.equal(out.ok,true,JSON.stringify(out));
 }
 assert.deepEqual(r.ledger,['CREATE']);assert.equal(ctx.db.keys('operations').length,1);
});
