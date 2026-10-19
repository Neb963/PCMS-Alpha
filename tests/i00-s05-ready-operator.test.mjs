import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createReadyStore} from '../src/runtime/ready-store.mjs';
import {createReadyOperator,validateReadyOperator}
 from '../src/runtime/ready-operator.mjs';
const id='s05-private-fixture',repositoryId='1411034835',H='a'.repeat(64);
const witness={repositoryId,slug:id,identifier:'rev-s05revtoken',
 declarationCommit:'1'.repeat(40),markerOid:'2'.repeat(40),
 inputFingerprint:H,testingOid:null};
const account={accountId:'acc-1',revision:3,state:'VERIFIED',
 personaUid:'persona-1',bindingVersion:1,
 identity:{source:'GUARDED_SESSION_READBACK',principalFingerprint:H}};
const link={slug:id,folder:'generators/'+id,
 accountId:account.accountId,personaUid:account.personaUid,
 bindingVersion:1,remoteId:'rid-1'};
const inventory={slug:id,remoteId:'rid-1',ownerState:'OBSERVED_OWNER'};
async function seed(db,rows){
 await new Promise((resolve,reject)=>{
  const t=db.transaction(['meta'],'readwrite');
  t.oncomplete=resolve;t.onabort=()=>reject(Error('ABORT'));
  for(const row of rows)t.objectStore('meta').put(row);
 });
}
function setup(){
 const db=fakeDatabase(),effects=[];
 const state={pcmsS03Git:{repository:'Neb963/per-gens',repositoryId}};
 const api={runtime:{id:'fixture-extension',
  getURL:p=>'moz-extension://fixture-extension/'+p},
  storage:{local:{get:async k=>({[k]:state[k]}),set:async rows=>Object.assign(state,rows)}}};
 const sender={id:'fixture-extension',url:'moz-extension://fixture-extension/pcms/index.html'};
 const opts={
  open:async()=>db,
  native:async payload=>{effects.push('vault:'+payload.action);
   return {ok:true,credential:'test-token-12345'};},
  scan:async()=>({ok:true,complete:true,repository:'Neb963/per-gens',
   repositoryId,head:'9'.repeat(40)}),
  inspect:async()=>({ok:true,legacy:false,token:'s05revtoken',inputFingerprint:H}),
  guard:()=>({
   getSafeRouteReadiness:async()=>({ready:true,personaUid:account.personaUid,
    cookieStoreId:'container-1',routeId:'guarded-1'}),
   observeReadOnly:async()=>({ok:true,principalFingerprint:H,
    original:{remotePublicId:link.remoteId,ownerResult:'IS_OWNER',
     visibility:'UNLISTED',pjs:'',html:'',assets:[]}})
  })
 };
 return {db,api,sender,effects,opts,operator:createReadyOperator(api,opts)};
}
test('S05 READY operator denies forged, invalid and stale requests before effects',async()=>{
 const h=setup();
 const pkt={type:'ASSESS_READY',params:{slug:id,expectedRevision:1}};
 assert.equal(validateReadyOperator(h.api,{id:'other',url:h.sender.url},pkt).code,
   'UNTRUSTED_SENDER');
 assert.equal((await h.operator.run(pkt,{id:'other',url:h.sender.url})).ok,false);
 assert.equal((await h.operator.run({type:'PIN_STAGE',
   params:{slug:id,expectedRevision:1}},h.sender)).code,'INVALID_READY_COMMAND');
 assert.equal((await h.operator.run(pkt,h.sender)).code,'READY_NOT_OBSERVED');
 assert.deepEqual(h.effects,[]);
});
test('S05 readiness assessed from independently checked private saved owner without source effects',async()=>{
 const h=setup(); const s=createReadyStore(h.db);
 assert.equal((await s.observe(witness)).ok,true);
 await seed(h.db,[
  {key:'account:'+account.accountId,account},
  {key:'source-link:'+id,link},
  {key:'inventory:'+id,generator:inventory}
 ]);
 const r=await h.operator.run({
   type:'ASSESS_READY',params:{slug:id,expectedRevision:1}},h.sender);
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.code,'S05_EDITOR_AND_NATIVE_ADMISSION_REQUIRED');
 assert.equal(r.providerVisibility,'UNLISTED');
 assert.equal(r.providerEffects,'NONE');
 assert.deepEqual(h.effects,['vault:git.get']);
 const stale=await h.operator.run({
   type:'ASSESS_READY',params:{slug:id,expectedRevision:2}},h.sender);
 assert.equal(stale.code,'STALE_REVISION');
 assert.equal(h.effects.length,1);
});
