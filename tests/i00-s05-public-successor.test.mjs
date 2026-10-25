import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createReadyStore} from '../src/runtime/ready-store.mjs';
import {createStagingStore} from '../src/runtime/staging-store.mjs';
import {createExistingStore} from '../src/runtime/existing-update-store.mjs';
import {createExistingBoundary} from '../src/runtime/existing-update-boundary.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {sealPrevious} from '../src/runtime/existing-update-core.mjs';
import {REFRESHER_KEY} from '../src/runtime/refresher-core.mjs';
import {planReadyDevelopment} from '../src/runtime/ready-development.mjs';
globalThis.crypto??=webcrypto;
const slug='existing-s05-successor',repoId='1411034835',
 accountId='account-fixture',personaUid='persona-fixture',
 rid='remote-fixture',H='a'.repeat(64),nonce='b'.repeat(32);
const blobs=s=>[{path:'main.pjs',base64:Buffer.from(s).toString('base64')},
 {path:'index.html',base64:Buffer.from('<div>'+s+'</div>').toString('base64')}];
async function set(db,rows){
 await new Promise((resolve,reject)=>{
  const t=db.transaction(['meta'],'readwrite');
  t.oncomplete=resolve;t.onabort=()=>reject(Error('ABORT'));
  for(const r of rows)t.objectStore('meta').put(r);
 });
}
async function fixture({dirty=false,running=false,changed=false}={}){
 const db=fakeDatabase(),P=await exactSource(blobs('original public P')),
  A=await exactSource(blobs('source A saved')),
  B=await exactSource(blobs('source B READY'));
 const seal=await sealPrevious(P);
 const account={accountId,revision:2,state:'VERIFIED',
  personaUid,bindingVersion:1,
  identity:{source:'GUARDED_SESSION_READBACK',principalFingerprint:H}};
 const inv={slug,remoteId:rid,accountId,personaUid,bindingVersion:1,
  ownerState:'OBSERVED_OWNER'};
 const link={slug,folder:'generators/'+slug,accountId,personaUid,
  bindingVersion:1,remoteId:rid};
 const existing={slug,state:'STAGE_CONFIRMED',revision:8,nonce,
  accountId,personaUid,bindingVersion:1,accountRevision:2,
  principalFingerprint:H,remotePublicId:rid,
  previousFingerprint:P.fingerprint,recovery:seal,
  stagedFingerprint:A.fingerprint,stageSource:A};
 const stage={slug,state:'SOURCE_VERIFIED',revision:4,nonce,
  accountId,personaUid,bindingVersion:1,remotePublicId:rid,
  accountRevision:2,principalFingerprint:H,verifiedAt:100,
  previous:P,candidate:A,
  readyIdentifier:'rev-initial-ready',readyInputFingerprint:H};
 const ai={slug,revision:7,stageRevision:4,state:'KNOWN_FAILURE',
  native:{state:running?'RUNNING_OBSERVED':'CHAT1_OBSERVED_IDLE'},
  finalSource:{fingerprint:A.fingerprint}};
 await set(db,[
  {key:'account:'+accountId,account},
  {key:'inventory:'+slug,generator:inv},
  {key:'source-link:'+slug,link},
  {key:'adoption:'+slug,adoption:{slug}},
  {key:REFRESHER_KEY,state:{rows:[{slug}]}},
  {key:'existing-update:'+slug,record:existing},
  {key:'stage:'+slug,record:stage},
  {key:'ai-job:'+slug,accountId,job:ai}
 ]);
 const ready=createReadyStore(db);
 const a={slug,repositoryId:repoId,identifier:'rev-initial-ready',
  declarationCommit:'c'.repeat(40),markerOid:'d'.repeat(40),
  inputFingerprint:H};
 const b={slug,repositoryId:repoId,identifier:'rev-successor-ready',
  declarationCommit:'e'.repeat(40),markerOid:'f'.repeat(40),
  inputFingerprint:'7'.repeat(64)};
 await ready.observe(a);
 const proof={source:'TRUSTED_S05_ADMISSION_BOUNDARY',
  accountOwnerVerified:true,protectedRouteReady:true,
  completeRecoverableBaseline:true,humanEditorClean:true,
  noUncertainWriter:true,writerIdle:true,nativeIdle:true,
  providerEffectResolved:true,approvalEffectResolved:true};
 await ready.handoff(slug,1,proof);
 await ready.observe(b);
 const settings={pcmsS03Git:{repository:'Neb963/per-gens',repositoryId:repoId}};
 const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},
  storage:{local:{get:async k=>({[k]:settings[k]})}}};
 const guard={runExistingStep:async()=>{throw Error('NO_PROVIDER_EFFECT_ALLOWED');},
  getSafeRouteReadiness:async()=>({
    ready:true,routeId:'protected',cookieStoreId:'container-1'}),
  inspectStageEditor:async()=>dirty?{ok:false,code:'DIRTY'}:
    {ok:true,clean:true,source:'GUARDED_EDITOR_CLEAN'},
  observeReadOnly:async()=>({ok:true,principalFingerprint:H,
    original:{remotePublicId:rid,ownerResult:'IS_OWNER',
      visibility:'UNLISTED',pjs:changed?'external human source':'source A saved',
      html:'<div>source A saved</div>',assets:[]}})};
 const boundary=createExistingBoundary(api,{open:async()=>db,
  guard:()=>guard,existingFactory:createExistingStore,
  stageFactory:createStagingStore,
  scanCatalog:async()=>({ok:true,complete:true,
    source:'PINNED_MAIN_READ_ONLY',head:'8'.repeat(40),repositoryId:repoId}),
  inspectReady:async()=>({ok:true,code:'READY_COHERENT_INPUT_PINNED',
    slug,pinnedHead:'8'.repeat(40),inputFingerprint:b.inputFingerprint,
    legacy:false,token:'successor-ready',files:blobs('source B READY')}),
  native:async()=>({ok:true,credential:'fixture-vault-git'}),
  effectGate:()=>false
 });
 return {db,ready,existing,stage,ai,A,B,P,b,boundary,api};
}
test('S05 public update supersedes saved unlisted A with READY B without re-unlist or losing exact recoverable P',async()=>{
 const f=await fixture();
 const plan=planReadyDevelopment({
  ready:await f.ready.get(slug),
  existing:await createExistingStore(f.db).getFull(slug),
  stage:await createStagingStore(f.db).getFull(slug),
  job:{ok:true,job:f.ai},effects:false,visibility:'UNLISTED'});
 assert.equal(plan.type,'PIN_STAGE');
 const result=await f.boundary.run({
  type:'PIN_STAGE',params:{slug,expectedRevision:8}},
  {id:'fixture',url:'moz-extension://fixture/pcms/index.html'});
 assert.equal(result.ok,true,JSON.stringify(result));
 const old=f.db.read('meta','existing-update:'+slug).record;
 assert.equal(old.previousFingerprint,f.P.fingerprint,'restore P unchanged');
 assert.equal(old.recovery.fingerprint,f.existing.recovery.fingerprint);
 assert.deepEqual(old.recovery.blobs,f.existing.recovery.blobs);
 assert.equal(old.stagePreviousFingerprint,f.A.fingerprint,'stage from saved A');
 assert.equal(old.stagedFingerprint,f.B.fingerprint,'staging B');
 assert.equal(old.state,'UNLIST_CONFIRMED');
 const stage=f.db.read('meta','stage:'+slug).record;
 assert.equal(stage.revision,5);
 assert.equal(stage.previous.fingerprint,f.P.fingerprint,'release previous-good remains original public P');
 assert.equal(stage.writePrevious.fingerprint,f.A.fingerprint,'native source replacement uses saved unapproved F');
 assert.equal(stage.candidate.fingerprint,f.B.fingerprint);
 assert.equal((await f.ready.get(slug)).record.active.identifier,f.b.identifier);
 assert.equal(f.db.read('meta','stage-history:'+slug+':4').record.candidate.fingerprint,
  f.A.fingerprint);
});
test('S05 successor holds old running helper, human dirty editor and source drift without losing P',async()=>{
 for(const opts of [{running:true},{dirty:true},{changed:true}]){
  const f=await fixture(opts);
  const out=await f.boundary.run({type:'PIN_STAGE',params:{
    slug,expectedRevision:8}},
   {id:'fixture',url:'moz-extension://fixture/pcms/index.html'});
  assert.equal(out.ok,false,JSON.stringify({opts,out}));
  assert.equal(f.db.read('meta','existing-update:'+slug).record.state,'STAGE_CONFIRMED');
  assert.deepEqual(f.db.read('meta','existing-update:'+slug).record.recovery.blobs,
    f.existing.recovery.blobs);
  assert.equal((await f.ready.get(slug)).record.desired.identifier,f.b.identifier);
 }
});
