import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createReadyStore} from '../src/runtime/ready-store.mjs';
import {createExistingBoundary} from '../src/runtime/existing-update-boundary.mjs';
import {createStagingStore} from '../src/runtime/staging-store.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {sealPrevious} from '../src/runtime/existing-update-core.mjs';
import {REFRESHER_KEY} from '../src/runtime/refresher-core.mjs';
globalThis.crypto??=webcrypto;
const slug='existing-s05-safe',rid='remote-owned-1',accountId='account-one',
  personaUid='persona-verified-one',nonce='a'.repeat(32),
  hash='b'.repeat(64),repoId='1411034835',head='c'.repeat(40);
const b64=s=>Buffer.from(s).toString('base64');
const files=s=>[{path:'main.pjs',base64:b64(s)},
 {path:'index.html',base64:b64('<div>'+s+'</div>')}];
const witness={slug,repositoryId:repoId,identifier:'rev-revision00001',
 declarationCommit:'d'.repeat(40),markerOid:'e'.repeat(40),
 inputFingerprint:hash};
const account={accountId,revision:7,state:'VERIFIED',
 personaUid,bindingVersion:1,
 identity:{source:'GUARDED_SESSION_READBACK',principalFingerprint:hash}};
const link={slug,folder:'generators/'+slug,accountId,personaUid,
 bindingVersion:1,remoteId:rid};
const inventory={slug,remoteId:rid,accountId,personaUid,
 bindingVersion:1,ownerState:'OBSERVED_OWNER'};
const runner=async ({dirty=false,sourceChanged=false,restored=false}={})=>{
 const db=fakeDatabase();
 const previous=await exactSource(files('safe old source'));
 const candidate=await exactSource(files('source v2'));
 const sealed=await sealPrevious(previous);
 assert.equal(sealed.ok,true);
 const record={slug,state:'UNLIST_CONFIRMED',revision:3,nonce,
  accountId,accountRevision:account.revision,personaUid,bindingVersion:1,
  principalFingerprint:hash,remotePublicId:rid,
  previousFingerprint:previous.fingerprint,recovery:sealed};
 const state={pcmsS03Git:{repository:'Neb963/per-gens',repositoryId:repoId}};
 const api={runtime:{id:'test-extension',getURL:p=>'moz-extension://test/'+p},
  storage:{local:{get:async key=>({[key]:state[key]})}}};
 const sender={id:'test-extension',url:'moz-extension://test/pcms/index.html'};
 const g={getSafeRouteReadiness:async()=>({ready:true,
   routeId:'protected-route',cookieStoreId:'container-01'}),
  runExistingStep:async()=>{throw Error('no provider operation expected');},
  inspectSourceEditorIdle:async()=>dirty?{ok:false,code:'EDITOR_DIRTY'}:{ok:true,clean:true,source:'GUARDED_NO_LOCAL_EDITOR'},
  inspectStageEditor:async()=>restored?{ok:false,code:'NO_OLD_EDITOR'}:dirty?{ok:false,code:'EDITOR_DIRTY'}:
   {ok:true,clean:true,source:'GUARDED_EDITOR_CLEAN'},
  observeReadOnly:async()=>({ok:true,principalFingerprint:hash,
   original:{remotePublicId:rid,ownerResult:'IS_OWNER',visibility:'UNLISTED',
    pjs:sourceChanged?'external human edit':'safe old source',
    html:'<div>safe old source</div>',assets:[]}})};
 await new Promise((resolve,reject)=>{
   const tx=db.transaction(['meta'],'readwrite');
   tx.oncomplete=resolve;tx.onabort=()=>reject(Error('SEED_FAIL'));
   const m=tx.objectStore('meta');
   for(const row of [
    {key:'source-link:'+slug,link},
    {key:'account:'+accountId,account},
    {key:'inventory:'+slug,generator:inventory},
    {key:'adoption:'+slug,adoption:{slug}},
    {key:REFRESHER_KEY,state:{rows:[{slug}]}}
   ])m.put(row);
 });
 const ready=createReadyStore(db);
 if(restored){
  const old={...witness,identifier:'rev-old0000001'};await ready.observe(old);
  await ready.handoff(slug,1,{source:'TRUSTED_S05_ADMISSION_BOUNDARY',accountOwnerVerified:true,protectedRouteReady:true,completeRecoverableBaseline:true,humanEditorClean:true,noUncertainWriter:true,writerIdle:true,nativeIdle:true,providerEffectResolved:true,approvalEffectResolved:true});
  const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put({key:'stage:'+slug,record:{slug,revision:2,state:'PINNED',restoredHistorical:false,restoredParent:{revision:1},nonce,accountId,accountRevision:account.revision,personaUid,bindingVersion:1,principalFingerprint:hash,remotePublicId:rid,previous,candidate,readyIdentifier:old.identifier,readyInputFingerprint:hash}});await new Promise(r=>{tx.oncomplete=r});record.stagedFingerprint=candidate.fingerprint;
 }
 await ready.observe(witness);
 const seen={effects:0};
 const boundary=createExistingBoundary(api,{
   open:async()=>db,
   guard:()=>g,
   existingFactory:()=>({
    getFull:async()=>({ok:true,record}),
    pinStage:async()=>({ok:true,revision:4})
   }),
   stageFactory:createStagingStore,
   scanCatalog:async()=>({ok:true,complete:true,source:'PINNED_MAIN_READ_ONLY',
     repositoryId:repoId,head}),
   inspectReady:async()=>({ok:true,code:'READY_COHERENT_INPUT_PINNED',
     slug,pinnedHead:head,token:'revision00001',legacy:false,
     inputFingerprint:hash,files:files('source v2')}),
   native:async()=>({ok:true,credential:'private-fixture-token'}),
   inspect:async()=>{throw Error('legacy git fetch must not run')},
   effectGate:()=>{seen.effects++;return false}
 });
 const result=await boundary.run({type:'PIN_STAGE',params:{
   slug,expectedRevision:3
 }},sender);
 return {db,ready,record,result,previous,candidate,seen};
};
test('S05 I13 confirmed unlisting + authenticated old P admits exact new READY and stages locally',async()=>{
 const x=await runner();
 assert.equal(x.result.ok,true,JSON.stringify(x.result));
 assert.equal(x.result.stageRevision,1);
 const q=(await x.ready.get(slug)).record;
 assert.equal(q.active.identifier,witness.identifier);
 assert.equal(q.desired,null);
 const stage=x.db.read('meta','stage:'+slug).record;
 assert.equal(stage.readyIdentifier,witness.identifier);
 assert.equal(stage.previous.fingerprint,x.previous.fingerprint);
 assert.equal(stage.candidate.fingerprint,x.candidate.fingerprint);
 assert.equal(x.seen.effects,0);
});
test('S05 I13 refuses dirty editor or external source drift before READY admission',async()=>{
 for(const opts of [{dirty:true},{sourceChanged:true}]){
  const x=await runner(opts);
  assert.equal(x.result.ok,false,JSON.stringify({opts,result:x.result}));
  const q=(await x.ready.get(slug)).record;
  assert.equal(q.revision,1);
  assert.equal(q.active,null);
  assert.equal(x.db.read('meta','stage:'+slug),undefined);
  assert.equal(x.seen.effects,0);
 }
});

test('J06 a restored never-dispatched update admits a newer READY through ordinary PIN_STAGE without an old editor or native effect',async()=>{
 const {planReadyDevelopment}=await import('../src/runtime/ready-development.mjs');
 const x=await runner({restored:true});assert.equal(x.result.ok,true,JSON.stringify(x.result));
 const stage=x.db.read('meta','stage:'+slug).record;assert.equal(stage.revision,3);assert.equal(stage.readyIdentifier,witness.identifier);assert.equal(stage.previous.fingerprint,x.previous.fingerprint);assert.equal(x.seen.effects,0);
 const desired={ok:true,record:{active:{identifier:'rev-old0000001'},desired:{identifier:witness.identifier}}};
 assert.equal(planReadyDevelopment({ready:desired,stage:{ok:true,record:{...stage,revision:2,state:'PINNED',restoredHistorical:false,restoredParent:{revision:1},readyIdentifier:'rev-old0000001'}},existing:{ok:true,record:x.record},visibility:'UNLISTED'}).type,'PIN_STAGE');
 const held=await runner({restored:true,dirty:true});assert.equal(held.result.ok,false);assert.equal(held.db.read('meta','stage:'+slug).record.revision,2);assert.equal(held.seen.effects,0);
});
