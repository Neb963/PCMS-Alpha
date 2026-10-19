import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createWritebackStore} from '../src/runtime/writeback-store.mjs';
import {planS06Writeback} from '../src/runtime/s06-writeback-progress.mjs';

const name='s06-generator',F='a'.repeat(64),H='b'.repeat(64),
  P='c'.repeat(64),S='d'.repeat(40),HEAD='e'.repeat(40),ID='rev-s06-01';
const stage=()=>({slug:name,revision:4,state:'SOURCE_VERIFIED',verifiedAt:1,
  candidate:{fingerprint:P},sourceHead:S,sourceFolder:'generators/'+name,
  accountId:'account-1',personaUid:'persona-1',
  principalFingerprint:F,remotePublicId:'remote-1',
  readyIdentifier:ID,readyInputFingerprint:H,testingSha:null});
const job=()=>({slug:name,revision:7,stageRevision:4,verifiedFinal:F,
  readyIdentifier:ID,readyInputFingerprint:H,
  sourceFingerprint:F,finalSource:{fingerprint:F,files:[],blobs:[]},
  state:'TESTS_VERIFIED',executionSlotReleased:true,
  native:{state:'CHAT1_OBSERVED_IDLE'},prompt:{revision:1,tests:[]},
  chat1:{state:'RUNNING',tests:{}},chat2:null});
const ready=()=>({slug:name,revision:3,active:{
  identifier:ID,inputFingerprint:H},desired:null,hold:null});
const writeback=(state,overrides={})=>({
  state,revision:2,slug:name,mode:'S06',operationId:'writeback_'+'1'.repeat(32),
  stageRevision:4,jobRevision:7,sourceFingerprint:F,
  readyIdentifier:ID,readyInputFingerprint:H,testingSha:null,
  accountId:'account-1',
  personaUid:'persona-1',principalFingerprint:F,remotePublicId:'remote-1',
  folder:'generators/'+name,baseHead:S,expectedHead:HEAD,
  settingRevision:1,commitSha:HEAD,...overrides});
async function dbSeed(r=ready(),old=null){
 const db=fakeDatabase();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('meta','readwrite');
  tx.oncomplete=resolve;tx.onabort=()=>reject(Error('DB'));
  const m=tx.objectStore('meta');
  m.put({key:'stage:'+name,record:stage()});
  m.put({key:'ai-job:'+name,job:job()});
  if(r)m.put({key:'s05-ready:'+name,record:r});
  if(old)m.put({key:'writeback:'+name,record:old});
 });
 return {db,store:createWritebackStore(db)};
}
test('S06 planned writeback respects final F and immutable current READY',()=>{
 const canonical={ready:ready(),stage:stage(),job:job()};
 assert.equal(planS06Writeback(canonical).type,'PREPARE');
 assert.equal(planS06Writeback({...canonical,writeback:writeback('PREPARED')}).type,'COMMIT');
 assert.equal(planS06Writeback({...canonical,writeback:writeback('DISPATCH_POSSIBLE')}).type,'RECONCILE');
 assert.equal(planS06Writeback({...canonical,writeback:writeback('HELD_UNCERTAIN')}).type,'RECONCILE');
 assert.equal(planS06Writeback({...canonical,writeback:writeback('CONFIRMED')}).type,'REVIEW');
 for(const changed of [
  {ready:{...ready(),active:null,desired:{identifier:ID,inputFingerprint:H}}},
  {ready:{...ready(),hold:'READY_REVOKED_NOT_READY'}},
  {ready:{...ready(),active:{identifier:'older',inputFingerprint:P}}},
  {ready:{...ready(),desired:{identifier:'another',inputFingerprint:H}}},
  {stage:{...stage(),readyInputFingerprint:P}},
  {stage:{...stage(),sourceFolder:'gens/'+name}},
  {job:{...job(),state:'KNOWN_FAILURE'}},
  {job:{...job(),verifiedFinal:P}},
  {writeback:writeback('CONFIRMED',{mode:'MANUAL'})},
  {writeback:writeback('CONFIRMED',{readyIdentifier:'rev-forged'})},
  {writeback:writeback('PREPARED',{testingSha:F})},
 ]){
  assert.equal(planS06Writeback({...canonical,...changed}).ok,false,
    JSON.stringify(changed));
 }
});
test('S06 historical uncertain Git intent is read-only reconciled despite a newer READY or paused account',()=>{
 const original={ready:ready(),stage:stage(),job:job()};
 const newer={...ready(),desired:{identifier:'rev-successor',inputFingerprint:H}};
 const stale={...stage(),readyIdentifier:'rev-obsolete'};
 for(const state of ['DISPATCH_POSSIBLE','HELD_UNCERTAIN']){
   const uncertain=writeback(state);
   for(const context of [
      {ready:newer,stage:stale,job:null},
      {ready:{...ready(),hold:'OPERATOR_PAUSED'},stage:null,job:null},
      {ready:{...ready(),active:null,desired:newer.desired},stage:null,job:null}
   ]){
     const plan=planS06Writeback({...original,...context,writeback:uncertain});
     assert.equal(plan.type,'RECONCILE',JSON.stringify(plan));
     assert.equal(plan.readOnly,true);
     assert.equal(plan.revision,uncertain.revision);
   }
   assert.equal(planS06Writeback({...original,ready:newer,
     writeback:{...uncertain,mode:'MANUAL'}}).ok,false);
 }
 assert.equal(planS06Writeback({...original,ready:newer,
   writeback:writeback('PREPARED')}).ok,false,
   'An unsent preparation must NOT be committed after newer READY');
});
test('S06 Git dispatch CAS refuses superseded, paused and revoked READY',async()=>{
 const variations=[
  null,{...ready(),hold:'READY_REVOKED_NOT_READY'},
  {...ready(),active:null,desired:{identifier:ID,inputFingerprint:H}},
  {...ready(),hold:'OPERATOR_PAUSED'},
  {...ready(),desired:{identifier:'newer',inputFingerprint:H}},
  {...ready(),active:{identifier:'older',inputFingerprint:P}},
 ];
 for(const r of variations){
  const {db,store}=await dbSeed(r,writeback('PREPARED'));
  const out=await store.arm(name,2);
  assert.equal(out.code,'S06_READY_CHANGED_OR_SUPERSEDED',JSON.stringify(r));
  assert.equal(db.read('meta','writeback:'+name).record.state,'PREPARED');
  assert.equal(db.keys('events').length,0);
 }
});
test('S06 current READY permits exactly one durable dispatch-possible claim',async()=>{
 const {db,store}=await dbSeed(ready(),writeback('PREPARED'));
 const first=await store.arm(name,2);
 assert.equal(first.state,'DISPATCH_POSSIBLE',JSON.stringify(first));
 assert.equal(db.keys('events').length,1);
 const second=await store.arm(name,2);
 assert.equal(second.ok,false);
 assert.equal(db.keys('events').length,1);
});
test('S06 next tested stage archives confirmed prior Git history without effect replay',async()=>{
 const prior=writeback('CONFIRMED');
 const newer={...stage(),revision:5};
 const j={...job(),stageRevision:5,revision:8};
 const {db,store}=await dbSeed(ready(),prior);
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('meta','readwrite');tx.oncomplete=resolve;tx.onabort=reject;
  const m=tx.objectStore('meta');
  m.put({key:'stage:'+name,record:newer});
  m.put({key:'ai-job:'+name,job:j});
 });
 const out=await store.prepare({name,stage:newer,job:j,
   probe:{head:HEAD,baseHead:S,folder:newer.sourceFolder},
   mode:'S06',message:'PCMS verified '+name+' candidate',
   operationId:'writeback_'+'2'.repeat(32)});
 assert.equal(out.state,'PREPARED',JSON.stringify(out));
 assert.equal(db.read('meta','writeback-history:'+name+':'+prior.operationId)
   .record.state,'CONFIRMED');
 assert.equal(db.read('meta','writeback:'+name).record.operationId,
   'writeback_'+'2'.repeat(32));
});
test('S06 uncertain and pending Git effects cannot be superseded',async()=>{
 for(const state of ['PREPARED','DISPATCH_POSSIBLE','HELD_UNCERTAIN']){
  const {db,store}=await dbSeed(ready(),writeback(state));
  const newer={...stage(),revision:5};
  const j={...job(),stageRevision:5,revision:8};
  const out=await store.prepare({name,stage:newer,job:j,
    probe:{head:HEAD,baseHead:S,folder:newer.sourceFolder},
    mode:'S06',message:'PCMS verified '+name+' candidate',
    operationId:'writeback_'+'2'.repeat(32)});
  assert.equal(out.code,'WRITEBACK_ALREADY_EXISTS',state);
  assert.equal(db.read('meta','writeback:'+name).record.state,state);
 }
});
