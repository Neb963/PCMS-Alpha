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
function setup({publicSource=false,dirtyEditor=false,priorText='',
 currentToken='s05revtoken',currentHash=H}={}){
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
    legacy:false,token:currentToken,inputFingerprint:currentHash,
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
     visibility:publicSource?'PUBLIC':'UNLISTED',pjs:priorText,
     html:priorText?'<div>'+priorText+'</div>':'',assets:[]}})
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
  assert.equal(h.db.keys('events').length,opts.publicSource?2:1);
  if(opts.publicSource){assert.equal(result.code,'S05_LISTING_OBSERVATION_REFRESHED');assert.equal(h.db.read('meta','inventory:'+id).generator.visibility,'PUBLIC');}
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

test('S05 retry never converts uncertain or changed stage to a successful pin receipt',async()=>{
 for(const mutate of [
  old=>({...old,state:'HELD_UNCERTAIN'}),
  old=>({...old,remotePublicId:'different-owner'}),
  old=>({...old,readyInputFingerprint:'b'.repeat(64)}),
  old=>({...old,previous:{...old.previous,fingerprint:'c'.repeat(64)}})
 ]){
  const h=setup(),store=createReadyStore(h.db);
  await store.observe(witness);
  await seed(h.db,[
    {key:'account:'+account.accountId,account},
    {key:'source-link:'+id,link},
    {key:'inventory:'+id,generator:inventory}
  ]);
  const command={type:'PREPARE_LOCAL',params:{slug:id,expectedRevision:1}};
  const first=await h.operator.run(command,h.sender);
  assert.equal(first.code,'S05_LOCAL_STAGE_PINNED',JSON.stringify(first));
  const row=h.db.read('meta','stage:'+id);
  await seed(h.db,[{...row,record:mutate(row.record)}]);
  const replay=await h.operator.run({
    type:'PREPARE_LOCAL',params:{slug:id,expectedRevision:2}},h.sender);
  assert.equal(replay.code,'S05_PINNED_STAGE_RECONCILIATION_REQUIRED',
    JSON.stringify(replay));
  assert.equal(h.db.keys('events').length,3,'no false replay success event');
 }
});

test('S05 private nonempty saved F safely supersedes idle old helper without publishing',async()=>{
 const token='second-token-2026',hash='f'.repeat(64),oldText='saved old';
 const h=setup({priorText:oldText,currentToken:token,currentHash:hash});
 const queue=createReadyStore(h.db);
 const old=await (async()=>{
  const {exactSource}=await import('../src/runtime/staging-core.mjs');
  return exactSource([{path:'main.pjs',base64:Buffer.from(oldText).toString('base64')},
   {path:'index.html',base64:Buffer.from('<div>'+oldText+'</div>').toString('base64')}]);
 })();
 assert.equal(old.ok,true);
 const previousStage={slug:id,revision:8,state:'SOURCE_VERIFIED',
  accountId:account.accountId,personaUid:account.personaUid,
  bindingVersion:account.bindingVersion,remotePublicId:link.remoteId,
  nonce:'a'.repeat(32),verifiedAt:100,
  candidate:old,previous:old};
 const priorJob={stageRevision:8,state:'KNOWN_FAILURE',
   native:{state:'CHAT1_OBSERVED_IDLE'},
   finalSource:{fingerprint:old.fingerprint}};
 await seed(h.db,[
  {key:'account:'+account.accountId,account},
  {key:'source-link:'+id,link},
  {key:'inventory:'+id,generator:inventory},
  {key:'stage:'+id,record:previousStage},
  {key:'ai-job:'+id,job:priorJob}
 ]);
 await queue.observe(witness);
 const proof={source:'TRUSTED_S05_ADMISSION_BOUNDARY',
  accountOwnerVerified:true,protectedRouteReady:true,
  completeRecoverableBaseline:true,humanEditorClean:true,
  noUncertainWriter:true,writerIdle:true,nativeIdle:true,
  providerEffectResolved:true,approvalEffectResolved:true};
 assert.equal((await queue.handoff(id,1,proof)).ok,true);
 const newer={...witness,identifier:'rev-'+token,inputFingerprint:hash,
  declarationCommit:'3'.repeat(40),markerOid:'4'.repeat(40)};
 assert.equal((await queue.observe(newer)).changed,true);
 const result=await h.operator.run({type:'PREPARE_LOCAL',
  params:{slug:id,expectedRevision:3}},h.sender);
 assert.equal(result.code,'S05_LOCAL_STAGE_PINNED',JSON.stringify(result));
 const stage=h.db.read('meta','stage:'+id).record;
 assert.equal(stage.revision,9);
 assert.equal(stage.previous.fingerprint,old.fingerprint);
 assert.equal(stage.readyIdentifier,newer.identifier);
 assert.equal(h.db.read('meta','stage-history:'+id+':8').record.state,
  'SOURCE_VERIFIED');
 assert.equal((await queue.get(id)).record.active.identifier,newer.identifier);
 assert.equal(result.providerEffects,'NONE');
});

test('S05 operator pause/resume are revision-fenced; resume rechecks Git main first',async()=>{
 const h=setup(),q=createReadyStore(h.db);
 await q.observe(witness);
 const paused=await h.operator.run({type:'PAUSE_READY',
   params:{slug:id,expectedRevision:1}},h.sender);
 assert.equal(paused.code,'READY_OPERATOR_PAUSED',JSON.stringify(paused));
 assert.equal(h.effects.length,0,'pause does not fetch credentials or touch provider');
 const denied=await h.operator.run({type:'PREPARE_LOCAL',
   params:{slug:id,expectedRevision:2}},h.sender);
 assert.equal(denied.code,'READY_OPERATOR_PAUSED');
 await seed(h.db,[
  {key:'account:'+account.accountId,account},
  {key:'source-link:'+id,link},
  {key:'inventory:'+id,generator:inventory}
 ]);
 const wrong=await h.operator.run({type:'RESUME_READY',
   params:{slug:id,expectedRevision:1}},h.sender);
 assert.equal(wrong.code,'STALE_REVISION');
 const resumed=await h.operator.run({type:'RESUME_READY',
   params:{slug:id,expectedRevision:2}},h.sender);
 assert.equal(resumed.code,'READY_OPERATOR_RESUMED',JSON.stringify(resumed));
 assert.equal((await q.get(id)).record.hold,null);
 assert.deepEqual(h.effects,['vault:git.get']);
});
test('S05 operator cannot resume a paused token after current Git main changes',async()=>{
 const h=setup({currentToken:'different-new-main'});
 const q=createReadyStore(h.db);
 await q.observe(witness);
 await q.pause(id,1);
 await seed(h.db,[
  {key:'account:'+account.accountId,account},
  {key:'source-link:'+id,link},
  {key:'inventory:'+id,generator:inventory}
 ]);
 const result=await h.operator.run({type:'RESUME_READY',
   params:{slug:id,expectedRevision:2}},h.sender);
 assert.equal(result.code,'S05_READY_REVISED_OR_REVOKED');
 assert.equal((await q.get(id)).record.hold,'OPERATOR_PAUSED');
});

test('J04 explicit Update now preserves active/sleep budgets and is scoped to exact public READY/owner while blocking fresh Refresher writes',async()=>{
 const {emptyShadow,reconcileShadow,REFRESHER_KEY,rowBlocks}=await import('../src/runtime/refresher-core.mjs');
 const {operatorUpdateWindow,updateWindowAvailable}=await import('../src/runtime/update-window.mjs');
 for(const dirtyEditor of [true,false]){
  const h=setup({publicSource:true,dirtyEditor}),queue=createReadyStore(h.db);await queue.observe(witness);
  const ownerAccount={...account,accountId:'account-update-now'},ownerLink={...link,accountId:ownerAccount.accountId,remoteId:'remote-update-now'};
  const baseGuard=h.opts.guard(),operator=createReadyOperator(h.api,{...h.opts,guard:()=>({...baseGuard,observeReadOnly:async(...args)=>{const p=await baseGuard.observeReadOnly(...args);p.original.remotePublicId=ownerLink.remoteId;return p}})});
  const inv={...inventory,accountId:ownerAccount.accountId,remoteId:ownerLink.remoteId,revision:1,management:'ADOPTED_PUBLIC',visibility:'PUBLIC'},state=reconcileShadow(emptyShadow(),[{...inv,ownerVerified:true,releaseVerified:true,releaseFingerprint:H}]).state,row=state.rows[0];row.phase='ACTIVE';row.slot=true;row.activeRemaining=123456;row.sleepRemaining=0;
  await seed(h.db,[{key:'account:'+ownerAccount.accountId,account:ownerAccount},{key:'inventory:'+id,generator:inv},{key:'source-link:'+id,link:ownerLink},{key:'adoption:'+id,adoption:{archiveState:'ARCHIVED_GIT_CONFIRMED',originalCheckpoint:{qualified:true}}},{key:REFRESHER_KEY,state}]);
  const msg={type:'UPDATE_NOW',params:{slug:id,expectedRevision:1}};
  assert.equal(validateReadyOperator(h.api,h.sender,{...msg,params:{...msg.params,windowOverride:true}}).ok,false);
  const out=await operator.run(msg,h.sender);
  if(dirtyEditor){assert.equal(out.code,'S05_EDITOR_TAB_PRESENT');assert.equal(h.db.read('meta',REFRESHER_KEY).state.rows[0].updateNow,undefined);continue;}
  assert.equal(out.code,'UPDATE_NOW_QUEUED',JSON.stringify(out));assert.equal(out.providerEffects,'NONE');
  const saved=h.db.read('meta',REFRESHER_KEY).state,target=saved.rows[0],r=(await queue.get(id)).record,owner={...ownerAccount,principalFingerprint:H,remotePublicId:inv.remoteId};
  assert.deepEqual([target.phase,target.slot,target.activeRemaining,target.sleepRemaining],['ACTIVE',true,123456,0]);assert.ok(rowBlocks(saved,target).includes('OPERATOR_UPDATE_REQUESTED'));
  assert.equal(operatorUpdateWindow(target,r,owner,target.updateNow.previousFingerprint),true);assert.equal(updateWindowAvailable(saved,target,r,owner,target.updateNow.previousFingerprint),true);
  assert.equal(updateWindowAvailable({...saved,inflight:[{stableId:target.stableId}]},target,r,owner),false);
  assert.equal(operatorUpdateWindow(target,{...r,desired:{identifier:'other',inputFingerprint:H}},owner),false);assert.equal(operatorUpdateWindow(target,r,{...owner,bindingVersion:2}),false);
  const completed=reconcileShadow(saved,[{...inv,ownerVerified:true,releaseVerified:true,releaseFingerprint:H,updateNowComplete:true}]).state.rows[0];assert.equal(completed.updateNow,undefined);assert.deepEqual([completed.phase,completed.activeRemaining,completed.sleepRemaining],['ACTIVE',123456,0]);
 }
});

test('J06 primary source requalification uses current guarded source/Git/editor reads and records no provider effect',async()=>{
 const {exactSource}=await import('../src/runtime/staging-core.mjs');
 for(const dirtyEditor of [true,false]){
  const h=setup({dirtyEditor}),ready=createReadyStore(h.db);await ready.observe(witness);
  await ready.handoff(id,1,{source:'TRUSTED_S05_ADMISSION_BOUNDARY',accountOwnerVerified:true,protectedRouteReady:true,completeRecoverableBaseline:true,humanEditorClean:true,noUncertainWriter:true,writerIdle:true,nativeIdle:true,providerEffectResolved:true,approvalEffectResolved:true});
  const current={...account,identity:{...account.identity,bindingVersion:1}},empty=await exactSource([{path:'main.pjs',base64:''},{path:'index.html',base64:''}]);
  const stage={slug:id,revision:4,state:'PINNED',restoredHistorical:true,accountId:current.accountId,accountRevision:1,personaUid:'old-persona',bindingVersion:0,principalFingerprint:H,remotePublicId:inventory.remoteId,candidate:await exactSource(blobs),previous:empty,nonce:'f'.repeat(32),readyIdentifier:witness.identifier,readyInputFingerprint:H};
  await seed(h.db,[{key:'account:'+current.accountId,account:current},{key:'source-link:'+id,link},{key:'inventory:'+id,generator:inventory},{key:'stage:'+id,record:stage}]);
  const out=await h.operator.run({type:'REQUALIFY_RESTORED',params:{slug:id,expectedRevision:2}},h.sender);
  assert.equal(out.ok,!dirtyEditor,JSON.stringify(out));
  assert.equal(out.code,dirtyEditor?'RESTORED_EDITOR_NOT_IDLE':'RESTORED_SOURCE_REQUALIFIED');
  const stored=h.db.read('meta','stage:'+id).record;
  assert.equal(stored.revision,dirtyEditor?4:5);assert.equal(stored.personaUid,dirtyEditor?'old-persona':current.personaUid);
  assert.deepEqual(h.effects,['vault:git.get']);
 }
});
