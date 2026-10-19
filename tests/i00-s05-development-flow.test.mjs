import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createReadyStore} from '../src/runtime/ready-store.mjs';
import {createReadyDevelopment,planReadyDevelopment} from '../src/runtime/ready-development.mjs';
const s='s05-public-flow',repoId='1411034835',H='a'.repeat(64),F='b'.repeat(64);
const witness={slug:s,repositoryId:repoId,identifier:'rev-fixture-ready-01',
 declarationCommit:'c'.repeat(40),markerOid:'d'.repeat(40),inputFingerprint:H};
const save=async(db,row)=>new Promise((resolve,reject)=>{
 const t=db.transaction('meta','readwrite');
 t.oncomplete=resolve;t.onabort=()=>reject(Error('DB_ABORT'));
 t.objectStore('meta').put(row);
});
test('S05 READY planning selects single canonical action and preserves effect holds',()=>{
 const ready={ok:true,record:{revision:1,desired:{identifier:witness.identifier,
  inputFingerprint:H},active:null,hold:null}};
 const p=(options={})=>planReadyDevelopment({ready,visibility:'PUBLIC',...options});
 assert.equal(p().type,'PREPARE_UPDATE');
 assert.equal(p({existing:{ok:true,record:{state:'PREPARED'}},effects:false}).type,'HOLD');
 assert.equal(p({existing:{ok:true,record:{state:'PREPARED'}},effects:true}).type,'UNLIST');
 assert.equal(p({existing:{ok:true,record:{state:'UNLIST_UNCERTAIN'}}}).type,'RECHECK_UNLIST');
 assert.equal(p({existing:{ok:true,record:{state:'UNLIST_CONFIRMED'}}}).type,'PIN_STAGE');
 assert.equal(p({existing:{ok:true,record:{state:'UNLIST_CONFIRMED',
   stagedFingerprint:F}},effects:true}).type,'STAGE');
 assert.equal(p({existing:{ok:true,record:{state:'STAGE_UNCERTAIN'}}}).type,'RECHECK_STAGE');
 assert.equal(p({existing:{ok:true,record:{state:'RESTORE_UNCERTAIN'}}}).ok,false);
 assert.equal(p({ready:{ok:true,record:{...ready.record,hold:'OPERATOR_PAUSED'}}}).ok,false);
});
test('S05 installed journal composition advances public READY through I13 and AI one verified transition per wake',async()=>{
 const db=fakeDatabase(),queue=createReadyStore(db),actions=[],vault=[];
 await queue.observe(witness);
 await save(db,{key:'inventory:'+s,generator:{slug:s,visibility:'PUBLIC'}});
 const passphrase='fixture-recovery-secret';
 const mutate=async(key,record)=>save(db,{key,record});
 const result=(type,state)=>({ok:true,code:type,state,revision:state});
 const existing=()=>({runTrusted:async ({type,params})=>{
  actions.push(type);
  const row=db.read('meta','existing-update:'+s)?.record;
  let state,stagedFingerprint=row?.stagedFingerprint;
  switch(type){
   case 'PREPARE':state='PREPARED';break;
   case 'UNLIST':state='UNLIST_UNCERTAIN';break;
   case 'RECHECK_UNLIST':state='UNLIST_CONFIRMED';break;
   case 'PIN_STAGE':
    state='UNLIST_CONFIRMED';stagedFingerprint=F;
    await queue.handoff(s,1,{source:'TRUSTED_S05_ADMISSION_BOUNDARY',
      accountOwnerVerified:true,protectedRouteReady:true,
      completeRecoverableBaseline:true,humanEditorClean:true,
      noUncertainWriter:true,writerIdle:true,nativeIdle:true,
      providerEffectResolved:true,approvalEffectResolved:true});
    await mutate('stage:'+s,{slug:s,state:'PINNED',revision:1,
      candidate:{fingerprint:F},readyIdentifier:witness.identifier,
      readyInputFingerprint:H});
    break;
   case 'STAGE':state='STAGE_UNCERTAIN';
    await mutate('stage:'+s,{slug:s,state:'SAVED_UNVERIFIED',revision:2,
      candidate:{fingerprint:F},readyIdentifier:witness.identifier,
      readyInputFingerprint:H});
    break;
   case 'RECHECK_STAGE':state='STAGE_CONFIRMED';
    await mutate('stage:'+s,{slug:s,state:'SOURCE_VERIFIED',revision:3,
      candidate:{fingerprint:F},readyIdentifier:witness.identifier,
      readyInputFingerprint:H});break;
   default:throw Error('UNEXPECTED_PUBLIC_STEP '+type);
  }
  await mutate('existing-update:'+s,{slug:s,revision:(row?.revision||0)+1,
    state,stagedFingerprint});
  if(['RECHECK_UNLIST','RECHECK_STAGE'].includes(type))
   assert.equal(params.passphrase,undefined);
  if(['UNLIST','PIN_STAGE','STAGE','PREPARE'].includes(type))
   assert.equal(params.passphrase,passphrase);
  return result(type,state);
 }});
 const candidate={slug:s,revision:3,stageRevision:3,
   sourceFingerprint:F,state:'PENDING_NATIVE_SESSION',
   prompt:{tests:['default_generator_smoke']},
   chat1:{sessionDigest:null,tests:{}},chat2:null,native:null};
 const ai=()=>({runTrusted:async({type})=>{
  actions.push(type);
  if(type==='PREPARE_JOB'){
   await save(db,{key:'ai-job:'+s,accountId:'account1',job:candidate});
  }else if(type==='ADVANCE_JOB'){
   await save(db,{key:'ai-job:'+s,accountId:'account1',job:{
     ...candidate,state:'TESTS_VERIFIED',revision:4}});
  }else throw Error('UNEXPECTED_AI_STEP '+type);
  return {ok:true,code:type};
 }});
 const runner=createReadyDevelopment({storage:{local:{get:async()=>({})}}},{
  open:async()=>db,
  effectGate:()=>true,
  native:async p=>{vault.push(p.action);return {ok:true,passphrase};},
  makeReady:()=>({runTrusted:async({type})=>{
   assert.equal(type,'ASSESS_READY');actions.push(type);
   return {ok:true,code:'S05_PUBLIC_SLEEP_AND_UNLIST_REQUIRED'};
  }}),
  makeExisting:existing,makeStage:()=>({runTrusted:async()=>{throw Error('UNEXPECTED_I09')}}),
  makeAi:ai
 });
 for(let step=0;step<8;step++){
  const actual=await runner.tick();
  assert.equal(actual.ok,true,JSON.stringify({step,actual}));
 }
 assert.deepEqual(actions,[
  'PREPARE','ASSESS_READY','UNLIST','RECHECK_UNLIST','PIN_STAGE',
  'STAGE','RECHECK_STAGE','PREPARE_JOB','ADVANCE_JOB']);
 assert.equal(vault.length,4);
 const result=await runner.tick();
 assert.equal(result.code,'S05_NO_ELIGIBLE_ACTION');
 assert.equal(db.read('meta','stage:'+s).record.state,'SOURCE_VERIFIED');
 assert.equal(db.read('meta','ai-job:'+s).job.state,'TESTS_VERIFIED');
});
test('S05 missing activation stops before UNLIST even with complete prepared source',async()=>{
 const db=fakeDatabase();await createReadyStore(db).observe(witness);
 await save(db,{key:'inventory:'+s,generator:{slug:s,visibility:'PUBLIC'}});
 await save(db,{key:'existing-update:'+s,record:{slug:s,revision:1,state:'PREPARED'}});
 let called=0;
 const result=await createReadyDevelopment({storage:{local:{get:async()=>({})}}},{
  open:async()=>db,effectGate:()=>false,
  makeReady:()=>({runTrusted:async()=>{called++;return {ok:true};}}),
  makeExisting:()=>({runTrusted:async()=>{called++;return {ok:true};}}),
  makeStage:()=>({runTrusted:async()=>{called++;return {ok:true};}}),
  makeAi:()=>({runTrusted:async()=>{called++;return {ok:true};}})
 }).tick();
 assert.equal(result.code,'S05_NO_ELIGIBLE_ACTION');
 assert.equal(called,0);
 assert.equal(db.read('meta','existing-update:'+s).record.state,'PREPARED');
});

test('S05 READY B reconciles possible old native dispatch then requests one guarded Stop',()=>{
 const active={identifier:'rev-old',inputFingerprint:H};
 const desired={identifier:witness.identifier,inputFingerprint:H};
 const ready={ok:true,record:{active,desired,hold:'WAIT_FOR_SAFE_SOURCE_HANDOFF'}};
 const stage={ok:true,record:{revision:4,readyIdentifier:'rev-old'}};
 const old={stageRevision:4,state:'KNOWN_FAILURE',
  native:{state:'DISPATCH_POSSIBLE'}};
 const plan=native=>planReadyDevelopment({
   ready,stage,job:{ok:true,job:{...old,native}},effects:true,visibility:'UNLISTED'});
 assert.equal(plan({state:'DISPATCH_POSSIBLE'}).type,'PROBE_OLDER_NATIVE');
 assert.equal(plan({state:'RUNNING_OBSERVED'}).type,'STOP_OLDER_NATIVE');
 const held=planReadyDevelopment({ready,stage,
  job:{ok:true,job:{...old,native:{state:'RUNNING_OBSERVED'}}},
  effects:false,visibility:'UNLISTED'});
 assert.equal(held.type,'HOLD');
 assert.equal(held.code,'S05_OLDER_NATIVE_STOP_ACTIVATION_HELD');
});
