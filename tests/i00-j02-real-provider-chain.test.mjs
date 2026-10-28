import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createInventoryStore} from '../src/runtime/inventory.mjs';
import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';
import {createCreationRunner} from '../src/runtime/creation-runner.mjs';
import {perchanceSupplyIsolated} from '../src/runtime/perchance-supply.mjs';
globalThis.crypto??=webcrypto;
const user={loggedIn:true,email:'pinned-fixture@example.invalid',sessionToken:'fixture-no-live-token'};
const principal=Buffer.from(await crypto.subtle.digest('SHA-256',
 new TextEncoder().encode(user.email))).toString('hex');
const account={accountId:'account_provider_chain_01',personaUid:'persona_provider_chain_01',state:'VERIFIED',
 revision:4,bindingVersion:1,boundPrincipal:principal,
 identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:principal}};
const target='new-disposable-chain',temp='temporary-chain-fixture';
const makeGenerator=(name,publicId,source='')=>({name,publicId,isPrivate:true,
 modelText:source,outputTemplate:'',srcManifest:{}});
async function storeRow(db,row){
 await new Promise((resolve,reject)=>{const tx=db.transaction(['meta'],'readwrite');
  tx.oncomplete=resolve;tx.onabort=reject;tx.objectStore('meta').put(row);});
}
async function setup({absence='HTTP404',foreign=false,lostCreateAck=false,wrongPrincipal=false}={}){
 const prior={location:globalThis.location,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
 const db=fakeDatabase(),effects=[],calls=[],resources=new Map([
  ['old-owned-1',makeGenerator('old-owned-1','known_000001','saved source')],
  ['old-owned-2',makeGenerator('old-owned-2','known_000002','saved source')]
 ]);
 const foreignResources=new Map(foreign?[[target,makeGenerator(target,'foreign_001')]]:[]);
 let localRaw=JSON.stringify({user}),sequence=0;
 globalThis.location={origin:'https://perchance.org'};
 globalThis.localStorage={getItem:k=>k==='app-storage'?localRaw:'unchanged'};
 globalThis.fetch=async(url,params)=>{
  const name=url.split('/').at(-1),req=JSON.parse(params.body),slug=req.generatorName;
  calls.push({name,slug:slug||null,method:params.method});
  const response=(body,code=200)=>({status:code,headers:{get:()=> 'application/json'},json:async()=>body});
  if(name==='getGeneratorsByUser')return response({status:'success',
   generators:[...resources.values()].map(g=>({name:g.name,isPrivate:g.isPrivate})),generatorFolderMap:{}});
  if(name==='checkGeneratorOwnership')return response({status:resources.has(slug)?'is-owner':'is-not-owner'});
  if(name==='getGeneratorPageData'){
   if(slug==='minimal')return response({status:'success',generator:{
    ...makeGenerator('minimal','minimal_001','template'),isPrivate:false}});
   const value=resources.get(slug)||foreignResources.get(slug);
   return value?response({status:'success',generator:value}):
    absence==='HTTP404'?response({status:'not-found'},404):response({status:'generator-does-not-exist'});
  }
  if(name==='save'){
   assert.equal(req.generator?.isPrivate,true);assert.equal(req.generator?.modelText,'');
   assert.equal(req.generator?.outputTemplate,'');assert.deepEqual(req.srcManifest,[]);
   assert.equal(req.generator?.name,'minimal');
   const g=makeGenerator(temp,'created_public_001');assert.equal(resources.has(temp),false);
   resources.set(temp,g);effects.push({type:'CREATE',slug:temp});
   return response(lostCreateAck?{status:'unverified'}:{status:'created',name:temp});
  }
  if(name==='changeGeneratorName'){
   assert.equal(req.currentName,temp);assert.equal(req.newName,target);
   const old=resources.get(temp);assert.ok(old);assert.equal(resources.has(target),false);
   resources.delete(temp);resources.set(target,{...old,name:target});
   effects.push({type:'RENAME',slug:target});
   return response({status:'success'});
  }
  throw Error('UNEXPECTED_PROVIDER_ENDPOINT:'+name);
 };
 await storeRow(db,{key:'account:'+account.accountId,
  account:wrongPrincipal?{...account,identity:{...account.identity,principalFingerprint:'f'.repeat(64)}}:account});
 const inventory=createInventoryStore(db);
 await inventory.applyObservation(account,{source:'GUARDED_PERCHANCE_READBACK',
  complete:true,accountId:account.accountId,personaUid:account.personaUid,
  accountRevision:account.revision,bindingVersion:account.bindingVersion,
  principalFingerprint:principal,observationId:'provider_chain_census1',observedAt:Date.now(),
  generators:[...resources.values()].map((g,i)=>({slug:g.name,remoteId:'slug-'+g.name,
   ownerResult:'IS_OWNER',ownerPrincipalFingerprint:principal,
   ownerObservationId:'chain_owner_'+i,visibility:'UNLISTED'}))});
 const store=createCoordinatorStore(db);
 const accepted=await store.acceptCreate({intentId:'intent_provider_chain_001',slug:target,
  accountId:account.accountId,origin:'OPERATOR'});
 assert.equal(accepted.ok,true);
 const guarded={
  getSafeRouteReadiness:async()=>({ready:true,personaUid:account.personaUid,
   cookieStoreId:'provider-fixture-container',routeId:'provider-fixture-protected',principalFingerprint:principal}),
  runSupplyStep:async(_uid,r)=>perchanceSupplyIsolated(r)
 };
 const runner=createCreationRunner({storage:{local:{get:async()=>({})}}},{
  open:async()=>db,guard:()=>guarded,effectGate:()=>true,
  syncInventory:async()=>({ok:true}),importGuard:async()=>({ok:true}),
  createGit:()=>({step:async()=>({ok:false,code:'GIT_RECONNECT_REQUIRED'})})});
 const next=async()=>{
  const current=(await store.getCreate(accepted.record.intentId)).record;
  return runner.step(current.intentId,current.revision);
 };
 const close=()=>{for(const [k,v] of Object.entries(prior)){
  if(v===undefined)delete globalThis[k];else globalThis[k]=v;
 }};
 return {db,resources,foreignResources,effects,calls,store,next,close};
}
for(const absence of ['HTTP404','JSON_MISSING']){
 test('J02 real adapter + canonical coordinator + runner completes protected private CREATE and RENAME with '+absence,async()=>{
  const f=await setup({absence});
  try{
   const expected=['OWNER_READBACK_PENDING','OWNER_MISSING_VERIFIED','CREATE_PREPARED',
    'CREATE_OBSERVING','PRIVATE_EMPTY_CONFIRMED','RENAME_PREPARED',
    'RENAME_OBSERVING','GIT_INIT_PENDING'];
   for(const state of expected){
    const out=await f.next();
    assert.equal(out.ok,true,JSON.stringify(out));
    assert.equal(out.record.state,state);
   }
   const git=await f.next();assert.equal(git.code,'GIT_RECONNECT_REQUIRED');
   assert.deepEqual(f.effects.map(x=>x.type),['CREATE','RENAME']);
   assert.equal(f.resources.has(target),true);
   assert.equal(f.resources.has(temp),false);
   const g=f.resources.get(target);assert.equal(g.isPrivate,true);
   assert.equal(g.modelText,'');assert.equal(g.outputTemplate,'');
   assert.deepEqual(g.srcManifest,{});
   const operationRows=f.db.keys('operations').map(k=>f.db.read('operations',k));
   assert.equal(operationRows.length,2);
   assert.ok(operationRows.every(r=>r.status==='CONFIRMED'));
   assert.equal(f.db.read('meta','inventory:'+target).generator.ownerState,'OBSERVED_OWNER');
  }finally{f.close();}
 });
}
test('foreign target is a collision, never a staged CREATE/RENAME',async()=>{
 const f=await setup({foreign:true});
 try{
  assert.equal((await f.next()).record.state,'OWNER_READBACK_PENDING');
  assert.equal((await f.next()).record.state,'TARGET_COLLISION_HELD');
  assert.equal((await f.next()).ok,false);
  assert.deepEqual(f.effects,[]);
  assert.equal(f.db.keys('operations').length,0);
 }finally{f.close();}
});
test('lost ACK after real adapter CREATE produces durable uncertainty and no replay on subsequent checks',async()=>{
 const f=await setup({lostCreateAck:true});
 try{
  for(const state of ['OWNER_READBACK_PENDING','OWNER_MISSING_VERIFIED','CREATE_PREPARED']){
   assert.equal((await f.next()).record.state,state);
  }
  assert.equal((await f.next()).record.state,'CREATE_UNCERTAIN');
  assert.deepEqual(f.effects.map(x=>x.type),['CREATE']);
  const held=await f.next();assert.equal(held.code,'CREATE_OUTCOME_UNKNOWN_NO_IDENTITY');
  assert.deepEqual(f.effects.map(x=>x.type),['CREATE']);
  assert.equal(f.db.keys('operations').length,1);
  assert.equal(f.db.read('operations',f.db.keys('operations')[0]).status,'HELD_UNCERTAIN');
 }finally{f.close();}
});
