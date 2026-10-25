import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {planRestoredSource,commitRestoredSource} from '../src/runtime/restored-source.mjs';
import {planReadyDevelopment} from '../src/runtime/ready-development.mjs';
const H='a'.repeat(64),saved={ok:true,fingerprint:H,files:[],blobs:[]};
function fixture(){return {stage:{slug:'restored-fixture',revision:8,state:'SOURCE_VERIFIED',restoredHistorical:true,accountId:'account_fixture',personaUid:'old-persona',bindingVersion:1,accountRevision:2,principalFingerprint:H,remotePublicId:'public_fixture',readyIdentifier:'rev-fixture',readyInputFingerprint:H,candidate:saved,previous:{...saved,fingerprint:'b'.repeat(64)},nonce:'1'.repeat(32),sourceHead:'c'.repeat(40)},
 job:{revision:3,state:'TESTS_UNVERIFIED',native:{state:'CHAT2_OBSERVED_IDLE'},restoredEffects:[{state:'TESTS_VERIFIED',native:'CHAT2_OBSERVED_IDLE'}],finalSource:saved},
 release:{revision:2,state:'RESTORE_REVIEW_REQUIRED',dispatchPossible:false,approval:null,restoredEffects:[{state:'APPROVED',dispatchPossible:false}]},
 existing:null,writeback:{revision:1,state:'CONFIRMED',restoredEffects:[{state:'CONFIRMED'}]},
 account:{accountId:'account_fixture',revision:10,personaUid:'new-persona',bindingVersion:2,state:'VERIFIED',identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:2,principalFingerprint:H}},
 inventory:{slug:'restored-fixture',accountId:'account_fixture',personaUid:'new-persona',bindingVersion:2,ownerState:'OBSERVED_OWNER',remoteId:'public_fixture',visibility:'UNLISTED'},
 ready:{slug:'restored-fixture',revision:3,active:{identifier:'rev-fixture',inputFingerprint:H},desired:null},baseline:saved,gitCandidate:saved,outputAttested:false,nonce:'2'.repeat(32),at:200};}
async function seed(db,f){await new Promise((resolve,reject)=>{const t=db.transaction('meta','readwrite'),m=t.objectStore('meta');t.oncomplete=resolve;t.onabort=reject;
 for(const [prefix,field,value] of [['account','account',f.account],['inventory','generator',f.inventory],['stage','record',f.stage],['ai-job','job',f.job],['release','release',f.release],['s05-ready','record',f.ready],['writeback','record',f.writeback]])m.put({key:prefix+':'+(prefix==='account'?f.account.accountId:f.stage.slug),[field]:value});});}
test('restored idle source becomes a fresh untested current-context child; original P/F and old effects remain history',async()=>{
 const f=fixture(),db=fakeDatabase(),plan=planRestoredSource(f);assert.equal(plan.ok,true,JSON.stringify(plan));
 assert.equal(plan.child.personaUid,f.account.personaUid);assert.equal(plan.child.bindingVersion,2);assert.notEqual(plan.child.nonce,f.stage.nonce);
 assert.equal(plan.child.previous.fingerprint,f.stage.previous.fingerprint);assert.equal(plan.child.candidate.fingerprint,H);assert.equal(plan.child.writePrevious.fingerprint,H);
 await seed(db,f);assert.equal((await commitRestoredSource(db,f,plan)).ok,true);
 assert.equal(db.read('meta','stage:restored-fixture').record.revision,9);assert.equal(db.read('meta','ai-job:restored-fixture'),undefined);assert.equal(db.read('meta','release:restored-fixture'),undefined);
 assert.equal(db.read('meta','stage-history:restored-fixture:8').record.personaUid,'old-persona');
 assert.equal(db.read('meta','ai-history:restored-fixture:restored-3').job.state,'TESTS_UNVERIFIED');
 assert.equal(db.read('meta','writeback:restored-fixture').record.state,'CONFIRMED','historical attributed Git fact retained without changing its identity');
});
test('uncertain/human effects, source drift, changed owner/READY and ambiguous historical labels cannot be requalified',()=>{
 for(const change of [f=>f.stage.state='DISPATCH_POSSIBLE',f=>f.stage.state='HUMAN_OWNED',f=>f.stage.humanReclaimPending=true,f=>f.release.restoredEffects[0]={state:'PUBLICATION_UNCERTAIN',dispatchPossible:true},f=>f.release.restoredEffects=[{state:'RESTORE_REVIEW_REQUIRED'}],f=>f.job.restoredEffects[0].native='DISPATCH_POSSIBLE',f=>f.job.restoredEffects[0].state='HUMAN_OWNED',f=>f.writeback.restoredEffects[0].state='HELD_UNCERTAIN',f=>f.baseline={...saved,fingerprint:'d'.repeat(64)},f=>f.account.identity.principalFingerprint='e'.repeat(64),f=>f.ready.active.identifier='rev-other',f=>f.stage.restoredHistorical=false,f=>f.inventory.ownerState='OWNER_UNVERIFIED']){
  const f=fixture();change(f);assert.equal(planRestoredSource(f).ok,false);
 }
});
test('requalification transaction rejects concurrent owner or native changes and commits no child/history',async()=>{
 const f=fixture(),db=fakeDatabase(),plan=planRestoredSource(f);await seed(db,f);
 const changed=structuredClone(f.job);changed.native.state='RUNNING_OBSERVED';await new Promise(r=>{const t=db.transaction('meta','readwrite');t.oncomplete=r;t.objectStore('meta').put({key:'ai-job:restored-fixture',job:changed})});
 assert.equal((await commitRestoredSource(db,f,plan)).code,'RESTORED_SOURCE_CONTEXT_CHANGED');assert.equal(db.read('meta','stage:restored-fixture').record.revision,8);assert.equal(db.read('meta','stage-history:restored-fixture:8'),undefined);
});
test('background requalification is local; a recovered public source waits for a new READY before ordinary public-update flow',()=>{
 const f=fixture(),stage={ok:true,record:f.stage},ready={ok:true,record:f.ready};
 assert.equal(planReadyDevelopment({ready,stage,visibility:'UNLISTED'}).type,'REQUALIFY_RESTORED');
 f.inventory.visibility='PUBLIC';const plan=planRestoredSource(f);assert.equal(plan.ok,true);
 assert.equal(planReadyDevelopment({ready,stage:{ok:true,record:plan.child},visibility:'PUBLIC'}).code,'RESTORED_PUBLIC_SOURCE_CURRENT');
 ready.record.desired={identifier:'rev-new',inputFingerprint:'b'.repeat(64)};
 assert.equal(planReadyDevelopment({ready,stage:{ok:true,record:plan.child},visibility:'PUBLIC'}).type,'PREPARE_UPDATE');
});

test('safe unarmed Git receipt is retired, while a re-observed existing update gets a NEW current-context receipt preserving P',async()=>{
 const f=fixture(),db=fakeDatabase();f.writeback={revision:2,state:'RESTORE_REVIEW_REQUIRED',restoredEffects:[{state:'PREPARED'}]};
 f.existing={...f.stage,revision:4,state:'STAGE_CONFIRMED',operationId:'existing_old',nonce:'1'.repeat(32),previousFingerprint:f.stage.previous.fingerprint,recovery:{format:'PCMS_I13_P_PLAIN_V3'},priorSource:f.stage.previous};
 f.previousCheckpoint={ok:true,source:f.stage.previous};
 const plan=planRestoredSource(f);assert.equal(plan.ok,true,JSON.stringify(plan));
 assert.equal(plan.currentExisting.nonce,plan.child.nonce);assert.notEqual(plan.currentExisting.operationId,f.existing.operationId);
 assert.equal(plan.currentExisting.previousFingerprint,f.stage.previous.fingerprint);assert.equal(plan.currentExisting.personaUid,f.account.personaUid);
 await seed(db,f);await new Promise(r=>{const t=db.transaction('meta','readwrite');t.oncomplete=r;t.objectStore('meta').put({key:'existing-update:'+f.stage.slug,record:f.existing})});
 assert.equal((await commitRestoredSource(db,f,plan)).ok,true);
 assert.equal(db.read('meta','writeback:'+f.stage.slug),undefined);assert.equal(db.read('meta','writeback-history:'+f.stage.slug+':restored-2').record.restoredEffects[0].state,'PREPARED');
 assert.equal(db.read('meta','existing-update:'+f.stage.slug).record.nonce,plan.child.nonce);
 assert.equal(db.read('meta','existing-history:'+f.stage.slug+':restored-4').record.operationId,'existing_old');
});
test('requalified never-dispatched private child has current staging eligibility while old supply batch remains immutable',async()=>{
 const {findEligibleManagedSource}=await import('../src/runtime/staging-store.mjs');
 const f=fixture(),db=fakeDatabase();f.stage.state='PREPARED';f.stage.sourceOrigin='PRIVATE_NEW';f.stage.writePrevious=f.baseline;f.job=null;f.release=null;f.writeback=null;
 const plan=planRestoredSource(f);assert.equal(plan.ok,true,JSON.stringify(plan));assert.equal(plan.child.state,'PINNED');
 await seed(db,{...f,job:undefined,release:undefined,writeback:undefined});
 await new Promise(r=>{const t=db.transaction('meta','readwrite'),m=t.objectStore('meta');t.oncomplete=r;m.delete('ai-job:'+f.stage.slug);m.delete('release:'+f.stage.slug);m.delete('writeback:'+f.stage.slug);m.put({key:'source-link:'+f.stage.slug,link:{folder:'generators/'+f.stage.slug,accountId:f.account.accountId,personaUid:f.account.personaUid,bindingVersion:f.account.bindingVersion,remoteId:f.inventory.remoteId}})});
 assert.equal((await commitRestoredSource(db,f,plan)).ok,true);
 const eligible=await findEligibleManagedSource(db,f.stage.slug);assert.equal(eligible.ok,true,JSON.stringify(eligible));assert.equal(eligible.account.personaUid,f.account.personaUid);
});

test('observed-unlisted restore admission continues only this current source hold; Pause and another UNLIST remain denied',()=>{
 return import('../src/runtime/update-window.mjs').then(({updateWindowAvailable})=>{
  const f=fixture();f.existing={...f.stage,revision:4,state:'STAGE_CONFIRMED',operationId:'existing_old',previousFingerprint:f.stage.previous.fingerprint,recovery:{},windowAdmission:{version:1,mode:'OPERATOR_EARLY_UPDATE',personaUid:'old-persona'}};
  f.previousCheckpoint={ok:true,source:f.stage.previous};f.shadow={revision:4,globalPause:false,accounts:{},inflight:[],rows:[{slug:f.stage.slug,stableId:'row_fixture',accountId:f.account.accountId,personaUid:'old-persona',bindingVersion:1,remoteId:f.inventory.remoteId,phase:'ACTIVE',slot:true,sleepRemaining:0}]};
  const plan=planRestoredSource(f);assert.equal(plan.ok,true,JSON.stringify(plan));
  const row=plan.currentShadow.rows[0],owner={...f.account,principalFingerprint:f.account.identity.principalFingerprint,remotePublicId:f.inventory.remoteId};
  assert.equal(updateWindowAvailable(plan.currentShadow,row,f.ready,owner,f.stage.previous.fingerprint,plan.currentExisting),true);
  assert.equal(updateWindowAvailable({...plan.currentShadow,globalPause:true},row,f.ready,owner,f.stage.previous.fingerprint,plan.currentExisting),false);
  assert.equal(updateWindowAvailable(plan.currentShadow,row,f.ready,owner,f.stage.previous.fingerprint,{...plan.currentExisting,state:'PREPARED'}),false);
 });
});
