import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fakeDatabase} from './fake-idb.mjs';
import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';

// A04 red reproductions: the previous UI rejects 101 slugs and the canonical
// store has no durable batch receipt, so closing the dashboard loses intake.
test('A04 RED: creator must not impose a 100-generator product cap',async()=>{
 const ui=await readFile(new URL('../src/ui/faithful/bridge.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(ui,/slugs\.length\s*>\s*100/);
});
test('A04 RED: batch manifest must be durable before acknowledging intake',()=>{
 const store=createCoordinatorStore(fakeDatabase());
 assert.equal(typeof store.beginBatch,'function');
 assert.equal(typeof store.appendBatch,'function');
 assert.equal(typeof store.finalizeBatch,'function');
 assert.equal(typeof store.processBatch,'function');
 assert.equal(typeof store.getBatch,'function');
});


import {createBatchStore,batchIntentId} from '../src/runtime/creation-batch.mjs';
import {createCreationWatcher} from '../src/runtime/creation-watch.mjs';
import {I17_QUARANTINED_SLUG} from '../src/runtime/legacy-quarantine.mjs';

const id='batch_'+'a'.repeat(32);
const other='batch_'+'b'.repeat(32);
const slugAt=i=>'a04-generator-'+String(i).padStart(5,'0');

async function seedBatch(s,n,batchId=id,accountId=null){
 const begun=await s.beginBatch({batchId,total:n,accountId});
 assert.equal(begun.ok,true,JSON.stringify(begun));
 for(let offset=0;offset<n;offset+=32){
  const slugs=Array.from({length:Math.min(32,n-offset)},(_,i)=>slugAt(offset+i));
  const a=await s.appendBatch({batchId,offset,slugs});
  assert.equal(a.ok,true,JSON.stringify(a));
 }
 const closed=await s.finalizeBatch({batchId});
 assert.equal(closed.ok,true,JSON.stringify(closed));
 assert.equal(closed.batch.state,'QUEUED');
}
test('A04: manifest, chunks, offset and finalization have immutable idempotent receipts',async()=>{
 const db=fakeDatabase(),s=createCoordinatorStore(db);
 assert.equal((await s.beginBatch({batchId:id,total:3})).ok,true);
 assert.equal((await s.finalizeBatch({batchId:id})).code,'BATCH_INCOMPLETE');
 assert.equal((await s.beginBatch({batchId:id,total:4})).code,'BATCH_ID_CONFLICT');
 assert.equal((await s.appendBatch({batchId:id,offset:1,slugs:['one']})).code,
  'BATCH_OFFSET_CONFLICT');
 assert.equal((await s.appendBatch({batchId:id,offset:0,slugs:['one','two']})).ok,true);
 const replay=await s.appendBatch({batchId:id,offset:0,slugs:['one','two']});
 assert.equal(replay.duplicate,true);
 assert.equal((await s.appendBatch({batchId:id,offset:0,slugs:['other']})).code,
  'BATCH_CHUNK_CONFLICT');
 assert.equal((await s.appendBatch({batchId:id,offset:2,
  slugs:[I17_QUARANTINED_SLUG]})).ok,false);
 assert.equal((await s.appendBatch({batchId:id,offset:2,slugs:['three']})).ok,true);
 assert.equal((await s.finalizeBatch({batchId:id})).ok,true);
 assert.equal((await s.finalizeBatch({batchId:id})).duplicate,true);
 assert.equal((await s.appendBatch({batchId:id,offset:3,slugs:['four']})).ok,false);
 assert.deepEqual((await s.getBatch({batchId:id})).batch,
  {batchId:id,accountId:null,total:3,appended:3,processed:0,state:'QUEUED',revision:4,held:0,lastHold:null});
 assert.equal(db.keys('operations').length,0);
});
test('A04: aborted append must not acknowledge missing input',async()=>{
 const db=fakeDatabase(),s=createCoordinatorStore(db);
 await s.beginBatch({batchId:id,total:2});
 db.failNextCommit();
 await assert.rejects(s.appendBatch({batchId:id,offset:0,slugs:['one','two']}));
 assert.equal((await s.getBatch({batchId:id})).batch.appended,0);
 assert.equal(db.read('meta','s04-batch-chunk:'+id+':'+String(0).padStart(16,'0')),undefined);
 assert.equal((await s.appendBatch({batchId:id,offset:0,slugs:['one','two']})).ok,true);
});
test('A04: interrupted progress replays deterministic canonical ID without duplicate slug',async()=>{
 const db=fakeDatabase(),s=createCoordinatorStore(db);
 await seedBatch(s,2);
 const ghost=createBatchStore(db,{acceptCreate:async input=>{
  const out=await s.acceptCreate(input);
  assert.equal(out.ok,true);
  throw Error('WORKER_STOP_AFTER_RESERVATION');
 }});
 await assert.rejects(ghost.processBatch({batchId:id}),/WORKER_STOP/);
 assert.equal((await s.getBatch({batchId:id})).batch.processed,0);
 assert.equal(db.read('meta','s00-create-intent:'+batchIntentId(id,0)).record.slug,slugAt(0));
 const replay=await s.processBatch({batchId:id});
 assert.equal(replay.ok,true);
 assert.equal((await s.processBatch({batchId:id})).batch.state,'INTAKE_COMPLETE');
 assert.equal(db.keys('meta').filter(k=>k.startsWith('s00-create-slug:')).length,2);
 assert.equal(db.keys('operations').length,0,'batch intake must never dispatch effects');
});
test('A04: concurrent identical process attempts never advance cursor twice',async()=>{
 const db=fakeDatabase(),s=createCoordinatorStore(db);
 await seedBatch(s,2);
 const out=await Promise.all([s.processBatch({batchId:id}),s.processBatch({batchId:id})]);
 assert.equal(out.filter(x=>x.ok).length,1);
 assert.equal((await s.getBatch({batchId:id})).batch.processed,1);
 assert.equal((await s.processBatch({batchId:id})).ok,true);
 assert.equal((await s.getBatch({batchId:id})).batch.processed,2);
 assert.equal(db.keys('meta').filter(k=>k.startsWith('s00-create-slug:')).length,2);
});
test('A04: operator and main Git input coalesce during batch processing',async()=>{
 const db=fakeDatabase(),s=createCoordinatorStore(db);
 await seedBatch(s,1);
 const git=await s.ingestVerifiedMain({
  slug:slugAt(0),repository:'Neb963/per-gens',repositoryId:'1411034835',
  head:'a'.repeat(40),markerOid:'b'.repeat(40),complete:true,verifiedMain:true
 });
 assert.equal(git.ok,true);
 assert.equal((await s.processBatch({batchId:id})).ok,true);
 const canonical=db.read('meta','s00-create-intent:'+git.record.intentId).record;
 assert.deepEqual(canonical.sources.map(x=>x.type).sort(),['GITHUB_MAIN','OPERATOR']);
 assert.equal(db.keys('meta').filter(k=>k.startsWith('s00-create-slug:')).length,1);
});
test('A04: 1,001 acknowledged slugs progress through canonical IDB, page-closed',async()=>{
 const db=fakeDatabase(),s=createCoordinatorStore(db);
 await seedBatch(s,1001);
 for(let i=0;i<1001;i++){
  const out=await s.processBatch({batchId:id});
  assert.equal(out.ok,true,'item '+i+': '+JSON.stringify(out));
 }
 const final=(await s.getBatch({batchId:id})).batch;
 assert.equal(final.state,'INTAKE_COMPLETE');
 assert.equal(final.processed,1001);
 assert.equal(db.keys('meta').filter(k=>k.startsWith('s00-create-slug:')).length,1001);
 assert.equal(db.keys('operations').length,0);
 const page=await s.listCreate({limit:100});
 assert.equal(page.ok,true);assert.equal(page.truncated,true);
});
test('A04: closed-dashboard watcher resumes finalized batch across event-page restart',async()=>{
 const db=fakeDatabase(),s=createCoordinatorStore(db);
 await seedBatch(s,68);
 const values=new Map();
 const api={storage:{local:{get:async k=>({[k]:values.get(k)}),
  set:async obj=>{for(const [k,v] of Object.entries(obj))values.set(k,v);}}},
  alarms:{create:async()=>{},onAlarm:{addListener(){}}},
  runtime:{onStartup:{addListener(){}},onInstalled:{addListener(){}}}};
 const options={open:async()=>db,maxPerWake:8,
   createRunner:()=>({step:async()=>({ok:false,code:'NO_LIVE_ROUTE'})})};
 const first=createCreationWatcher(api,options);
 const step1=await first.tick();
 assert.equal(step1.batchProgressed,32);
 assert.equal((await s.getBatch({batchId:id})).batch.processed,32);
 const rebooted=createCreationWatcher(api,options);
 const step2=await rebooted.tick();
 assert.equal(step2.batchProgressed,32);
 const step3=await rebooted.tick();
 assert.equal(step3.batchProgressed,4);
 assert.equal((await s.getBatch({batchId:id})).batch.state,'INTAKE_COMPLETE');
 assert.equal(db.keys('meta').filter(k=>k.startsWith('s00-create-slug:')).length,68);
});

test('A04: held intake does not starve healthy batch items; only repaired hold retries',async()=>{
 const db=fakeDatabase(),s=createCoordinatorStore(db);
 await seedBatch(s,3);
 let failOne=true;
 const batch=createBatchStore(db,{acceptCreate:async item=>
   failOne&&item.slug===slugAt(1)?{ok:false,code:'OWNER_UNVERIFIED'}:
   s.acceptCreate(item)});
 assert.equal((await batch.processBatch({batchId:id})).held,false);
 const blocked=await batch.processBatch({batchId:id});
 assert.equal(blocked.ok,true);assert.equal(blocked.held,true);
 assert.equal(blocked.code,'OWNER_UNVERIFIED');
 assert.equal((await batch.processBatch({batchId:id})).ok,true);
 const state=(await batch.getBatch({batchId:id})).batch;
 assert.equal(state.state,'INTAKE_HELD');assert.equal(state.held,1);
 const names=db.keys('meta').filter(k=>k.startsWith('s00-create-slug:'));
 assert.equal(names.length,2);
 assert.equal(db.read('meta','s00-create-slug:'+slugAt(1)),undefined);
 const pending=await batch.listBatchHolds({batchId:id});
 assert.equal(pending.ok,true);assert.equal(pending.items.length,1);
 assert.equal(pending.items[0].slug,slugAt(1));
 assert.equal((await batch.retryBatchHold({batchId:id,index:1})).code,'OWNER_UNVERIFIED');
 assert.equal((await batch.getBatch({batchId:id})).batch.held,1);
 failOne=false;
 const retried=await batch.retryBatchHold({batchId:id,index:1});
 assert.equal(retried.ok,true);
 assert.equal(retried.batch.state,'INTAKE_COMPLETE');assert.equal(retried.batch.held,0);
 assert.equal((await batch.retryBatchHold({batchId:id,index:1})).code,'BATCH_HOLD_NOT_FOUND');
 assert.equal((await batch.listBatchHolds({batchId:id})).items.length,0);
 assert.equal(db.keys('meta').filter(k=>k.startsWith('s00-create-slug:')).length,3);
 assert.equal(db.keys('operations').length,0);
});

test('A04: only archived, unpinned, never-dispatched allocations can rebalance',async()=>{
 const db=fakeDatabase(),s=createCoordinatorStore(db);
 const cases=[
  {id:'auto',state:'OWNER_READBACK_PENDING',pin:null,effect:null,expect:true},
  {id:'pinned',state:'OWNER_READBACK_PENDING',pin:'account_archive1',effect:null,expect:false},
  {id:'prepared',state:'CREATE_PREPARED',pin:null,effect:'operation_possible1',expect:false},
  {id:'uncertain',state:'CREATE_UNCERTAIN',pin:null,effect:'operation_possible2',expect:false},
  {id:'adoption',state:'ADOPTION_ORIGINAL_PENDING',pin:null,effect:null,expect:false}
 ];
 const tx=db.transaction(['meta'],'readwrite');
 const meta=tx.objectStore('meta');
 meta.put({key:'account:account_archive1',account:{
  accountId:'account_archive1',state:'ARCHIVED',revision:4}});
 for(const x of cases)meta.put({
  key:'s00-create-intent:intent_'+x.id+'0000',
  record:{
   intentId:'intent_'+x.id+'0000',slug:'a04-archive-'+x.id,
   state:x.state,revision:7,accountId:'account_archive1',
   accountRevision:4,personaUid:'persona_old',bindingVersion:2,
   sources:[{type:'OPERATOR',intentId:'intent_'+x.id+'0000',
     accountId:x.pin}],...(x.effect?{createOperationId:x.effect}:{})
  }
 });
 await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=reject;});
 for(const x of cases){
  const id='intent_'+x.id+'0000';
  const result=await s.requeueArchivedUnattempted(id,7);
  assert.equal(result.ok,x.expect,x.id+': '+JSON.stringify(result));
  const saved=db.read('meta','s00-create-intent:'+id).record;
  assert.equal(saved.state,x.expect?'WAITING_CAPABILITY':x.state);
  assert.equal(saved.accountId,x.expect?null:'account_archive1');
  assert.equal(saved.revision,x.expect?8:7);
 }
 assert.equal((await s.requeueArchivedUnattempted('intent_auto0000',7)).code,
   'STALE_REVISION');
 const t=db.transaction(['meta'],'readwrite');
 t.objectStore('meta').put({key:'account:account_archive1',
  account:{accountId:'account_archive1',state:'VERIFIED',revision:5}});
 await new Promise(resolve=>{t.oncomplete=resolve;});
 assert.equal((await s.requeueArchivedUnattempted('intent_pinned0000',7)).ok,false);
});
