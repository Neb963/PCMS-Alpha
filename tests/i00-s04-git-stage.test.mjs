import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';
import {createS04GitContinuation} from '../src/runtime/creation-git-runner.mjs';
const slug='s04-not-ready',intentId='intent_s04_gitstage',accountId='account_s04_gitstage';
const account={accountId,personaUid:'persona_s04_123',state:'VERIFIED',
  revision:4,bindingVersion:2,identity:{source:'GUARDED_SESSION_READBACK',
    bindingVersion:2,principalFingerprint:'a'.repeat(64)}};
const intent={intentId,slug,accountId,personaUid:account.personaUid,
  accountRevision:4,bindingVersion:2,remoteId:'public_12345678',
  state:'GIT_INIT_PENDING',revision:10,hold:'GIT_ASSOCIATION_PENDING'};
async function make(){
  const db=fakeDatabase(),tx=db.transaction(['meta'],'readwrite');
  tx.objectStore('meta').put({key:'account:'+accountId,account});
  tx.objectStore('meta').put({key:'s00-create-intent:'+intentId,record:intent});
  tx.objectStore('meta').put({key:'inventory:'+slug,generator:{
    slug,remoteId:intent.remoteId,accountId,
    ownerState:'OBSERVED_OWNER',visibility:'UNLISTED'}});
  await new Promise((r,j)=>{tx.oncomplete=r;tx.onabort=j;});
  return {db,store:createCoordinatorStore(db)};
}
const marker='b'.repeat(40),head='c'.repeat(40),operationId='git_123456789abcdef';
test('S04 Git D: existing complete NOT_READY main path associates atomically without mutation',async()=>{
  const {db,store}=await make();
  const result=await store.stageGit({intentId,expectedRevision:10,event:'EXISTING',proof:{
    source:'PINNED_MAIN_READ_ONLY',folder:'generators/'+slug,
    repositoryId:'42',head,markerOid:marker}});
  assert.equal(result.ok,true,result.code);
  assert.equal(result.record.state,'ASSOCIATED_NOT_READY');
  assert.equal(db.read('meta','source-link:'+slug).link.remoteId,intent.remoteId);
  assert.equal(db.keys('operations').length,0);
  assert.equal((await store.stageGit({intentId,expectedRevision:10,
    event:'EXISTING',proof:{}})).code,'STALE_REVISION');
});
test('S04 Git D: uncertain conditional ref has one operation and recovers only by readback',async()=>{
  const {db,store}=await make();
  const call=(revision,event,proof={})=>store.stageGit({
    intentId,expectedRevision:revision,event,proof});
  let r=await call(10,'PREPARE',{repositoryId:'42',operationId,
    fingerprint:'a'.repeat(64),baseHead:head,markerOid:marker});
  assert.equal(r.record.state,'GIT_PREPARED');
  r=await call(r.record.revision,'DISPATCH');
  assert.equal(r.record.state,'GIT_DISPATCH_POSSIBLE');
  r=await call(r.record.revision,'UNCERTAIN');
  assert.equal(r.record.state,'GIT_UNCERTAIN');
  assert.equal((await call(r.record.revision,'DISPATCH')).code,'GIT_NOT_ADMISSIBLE');
  r=await call(r.record.revision,'OBSERVING');
  const noAck=await call(r.record.revision,'CONFIRM',{source:'API_ACK',
    folder:'generators/'+slug,repositoryId:'42',head,markerOid:marker,ready:false});
  assert.equal(noAck.code,'INDEPENDENT_GIT_MARKER_REQUIRED');
  r=await call(r.record.revision,'CONFIRM',{
    source:'INDEPENDENT_GIT_BYTE_READBACK',folder:'generators/'+slug,
    repositoryId:'42',head,markerOid:marker,ready:false});
  assert.equal(r.record.state,'ASSOCIATED_NOT_READY');
  assert.equal(db.keys('operations').length,1);
  assert.equal(db.read('operations',operationId).status,'CONFIRMED');
  assert.equal(db.read('meta','source-link:'+slug).link.folder,'generators/'+slug);
});
test('S04 Git D: account rebind and wrong source association hold before mutation',async()=>{
  const {db,store}=await make();
  const tx=db.transaction(['meta'],'readwrite');
  tx.objectStore('meta').put({key:'account:'+accountId,
    account:{...account,revision:5}});
  await new Promise((r,j)=>{tx.oncomplete=r;tx.onabort=j;});
  assert.equal((await store.stageGit({intentId,expectedRevision:10,
    event:'PREPARE',proof:{repositoryId:'42',operationId,
      fingerprint:'a'.repeat(64),baseHead:head,markerOid:marker}})).code,
    'ACCOUNT_CONTEXT_CHANGED');
  assert.equal(db.keys('operations').length,0);
});

test('S04 Git D: existing valid human NOT_READY text keeps its OID and no write',async()=>{
  const {db,store}=await make();
  const config={repository:'Neb963/per-gens',repositoryId:'42'};
  const api={storage:{local:{get:async key=>
    key==='pcmsS03Git'?{pcmsS03Git:config}:{}}}};
  let writes=0;
  const runner=createS04GitContinuation(api,{open:async()=>db,
    guard:()=>({getSafeRouteReadiness:async()=>({
      ready:true,personaUid:account.personaUid,cookieStoreId:'fixture',routeId:'fixed'}),
      runSupplyStep:async()=>({ok:true,source:'INDEPENDENT_TARGET_READBACK',
        state:'OWNED_VERIFIED',ownerMatches:true,slug,remoteId:intent.remoteId,
        visibility:'UNLISTED'})}),
    vault:async()=>({ok:true,credential:'mock-native-secret-123456'}),
    scan:async()=>({ok:true,complete:true,repositoryId:'42',
      head:'c'.repeat(40),generators:[{slug,sourceState:'NOT_READY',
        folder:'generators/'+slug,markerOid:'f'.repeat(40)}]}),
    write:async()=>{writes++;throw Error('Must preserve existing Git tree');}});
  const result=await runner.step(intentId,10);
  assert.equal(result.ok,true,result.code);
  assert.equal(result.record.gitMarkerOid,'f'.repeat(40));
  assert.equal(result.record.state,'ASSOCIATED_NOT_READY');
  assert.equal(writes,0);
  assert.equal(db.keys('operations').length,0);
});
