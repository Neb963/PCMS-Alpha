import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
globalThis.crypto??=webcrypto;
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
 bindingVersion:1,remoteId:'rid-1',
 source:'S04_INDEPENDENT_NOT_READY_ASSOCIATION'};
const inventory={slug:id,remoteId:'rid-1',accountId:account.accountId,
 personaUid:account.personaUid,bindingVersion:1,ownerState:'OBSERVED_OWNER',
 management:'MANAGED_CREATED',source:'SOURCE_PENDING',visibility:'UNLISTED'};
async function seed(db,rows){
 await new Promise((resolve,reject)=>{
  const t=db.transaction(['meta'],'readwrite');
  t.oncomplete=resolve;t.onabort=()=>reject(Error('ABORT'));
  for(const row of rows)t.objectStore('meta').put(row);
 });
}
const blobs=[{path:'main.pjs',base64:Buffer.from('ready-source').toString('base64')},
 {path:'index.html',base64:Buffer.from('<main>ready-source</main>').toString('base64')}];
function setup({publicSource=false,dirtyEditor=false}={}){
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
   repositoryId,head:'9'.repeat(40),source:'PINNED_MAIN_READ_ONLY'}),
  inspect:async()=>({ok:true,code:'READY_COHERENT_INPUT_PINNED',
    legacy:false,token:'s05revtoken',inputFingerprint:H,
    pinnedHead:'9'.repeat(40),slug:id,files:blobs,
    optionalTesting:{state:'ABSENT',sha256:null}}),
  guard:()=>({
   getSafeRouteReadiness:async()=>({ready:true,personaUid:account.personaUid,
    cookieStoreId:'container-1',routeId:'guarded-1'}),
   inspectSourceEditorIdle:async()=>dirtyEditor?
     {ok:false,code:'S05_EDITOR_TAB_PRESENT'}:
     {ok:true,source:'GUARDED_NO_LOCAL_EDITOR',clean:true},
   observeReadOnly:async()=>({ok:true,principalFingerprint:H,
    original:{remotePublicId:link.remoteId,ownerResult:'IS_OWNER',
     visibility:publicSource?'PUBLIC':'UNLISTED',pjs:'',html:'',assets:[]}})
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

test('S05 effect-free local READY admission pins coherent Git source exactly once',async()=>{
 const h=setup(),s=createReadyStore(h.db);
 await s.observe(witness);
 await seed(h.db,[
  {key:'account:'+account.accountId,account},
  {key:'source-link:'+id,link},
  {key:'inventory:'+id,generator:inventory}
 ]);
 const message={type:'PREPARE_LOCAL',params:{slug:id,expectedRevision:1}};
 const first=await h.operator.run(message,h.sender);
 assert.equal(first.code,'S05_LOCAL_STAGE_PINNED',JSON.stringify(first));
 assert.equal(first.providerEffects,'NONE');
 assert.equal(first.stageRevision,1);
 const recorded=await s.get(id);
 assert.equal(recorded.record.active.identifier,witness.identifier);
 assert.equal(recorded.record.desired,null);
 assert.equal(h.db.read('meta','stage:'+id).record.readyIdentifier,witness.identifier);
 assert.equal(h.db.keys('events').length,3);
 const again=await createReadyOperator(h.api,h.opts).run({
   type:'PREPARE_LOCAL',params:{slug:id,expectedRevision:2}},h.sender);
 assert.equal(again.code,'S05_ALREADY_PINNED_LOCAL',JSON.stringify(again));
 assert.equal(h.db.keys('events').length,3);
 assert.deepEqual(h.effects,['vault:git.get','vault:git.get']);
});
test('S05 public or dirty browser editor never handoff READY or create source stage',async()=>{
 for(const opts of [{publicSource:true},{dirtyEditor:true}]){
  const h=setup(opts),s=createReadyStore(h.db);
  await s.observe(witness);
  await seed(h.db,[
   {key:'account:'+account.accountId,account},
   {key:'source-link:'+id,link},
   {key:'inventory:'+id,generator:inventory}
  ]);
  const result=await h.operator.run({type:'PREPARE_LOCAL',
    params:{slug:id,expectedRevision:1}},h.sender);
  assert.equal(result.ok,false,JSON.stringify(result));
  assert.equal((await s.get(id)).record.revision,1);
  assert.equal(h.db.read('meta','stage:'+id),undefined);
  assert.equal(h.db.keys('events').length,1);
 }
});
test('S05 stage transaction abort after READY handoff does not pretend source pinned',async()=>{
 const h=setup(),s=createReadyStore(h.db);
 await s.observe(witness);
 await seed(h.db,[
   {key:'account:'+account.accountId,account},
   {key:'source-link:'+id,link},
   {key:'inventory:'+id,generator:inventory}
 ]);
 // Fail the next committed readwrite, which is READY handoff. It must not
 // create either an active candidate or a stage.
 h.db.failNextCommit();
 const attempted=await h.operator.run({type:'PREPARE_LOCAL',
   params:{slug:id,expectedRevision:1}},h.sender);
 assert.equal(attempted.ok,false);
 assert.equal((await s.get(id)).record.active,null);
 assert.equal(h.db.read('meta','stage:'+id),undefined);
});
