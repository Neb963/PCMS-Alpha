import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createAiStore} from '../src/runtime/ai-store.mjs';
import {createReadyStore} from '../src/runtime/ready-store.mjs';
import {validateAiMessage} from '../src/runtime/ai-boundary.mjs';
import {validateCatalogMessage} from '../src/runtime/catalog-boundary.mjs';
const SHA='a'.repeat(64);
const mkJob=(slug,state)=>({
 schema:1,slug,revision:1,createdAt:1,state,
 sourceFingerprint:SHA,stageRevision:1,
 prompt:{revision:1,tests:['default_generator_smoke']},
 chat1:{state:'PENDING',sessionDigest:null,tests:{}},
 chat2:null,changes:[],hold:'NO_UNVERIFIED_PROGRESS'
});
const put=async(db,rows)=>new Promise((resolve,reject)=>{
 const tx=db.transaction(['meta'],'readwrite');
 tx.oncomplete=resolve;tx.onabort=()=>reject(Error('DB_ABORT'));
 for(const [key,value] of rows)tx.objectStore('meta').put({key,...value});
});
test('R4 AI: fleet-wide search/status filter precedes pagination across 1,024 canonical jobs',async()=>{
 const db=fakeDatabase(),store=createAiStore(db),rows=[];
 for(let i=0;i<1024;i++){
  const slug='gen-'+String(i).padStart(5,'0');
  rows.push(['ai-job:'+slug,{accountId:'account',job:mkJob(slug,
    i%2?'PENDING_NATIVE_SESSION':'TESTS_VERIFIED')}]);
 }
 await put(db,rows);
 const first=await store.list({query:'gen-',status:'NEEDS_ACTION',limit:25});
 assert.equal(first.ok,true);assert.equal(first.jobs.length,25);assert.equal(first.more,true);
 assert.ok(first.jobs.every(j=>j.state==='PENDING_NATIVE_SESSION'));
 const second=await store.list({query:'gen-',status:'NEEDS_ACTION',limit:25,after:first.nextCursor});
 assert.equal(second.jobs.length,25);
 assert.ok(second.jobs[0].slug>first.nextCursor);
 const specific=await store.list({query:'gen-01023',status:'NEEDS_ACTION',limit:20});
 assert.equal(specific.jobs.length,1);
 const excluded=await store.list({query:'gen-01023',status:'COMPLETED',limit:20});
 assert.equal(excluded.jobs.length,0);
 assert.equal((await store.list({query:'X'.repeat(101)})).code,'AI_PAGE_INVALID');
 assert.equal((await store.list({status:'DISPATCH_ANY'})).code,'AI_PAGE_INVALID');
});
test('R4 READY: exact slug/status query is canonical across 1,024 records',async()=>{
 const db=fakeDatabase(),store=createReadyStore(db),rows=[];
 for(let i=0;i<1024;i++){
  const slug='gen-'+String(i).padStart(5,'0');
  rows.push(['s05-ready:'+slug,{record:{slug,repositoryId:'42',revision:1,
    desired:i%2?{identifier:'ready-1',inputFingerprint:SHA}:null,
    active:null,hold:i%2?'OPERATOR_PAUSED':null}}]);
 }
 await put(db,rows);
 const first=await store.list({query:'gen-',status:'NEEDS_ACTION',limit:30});
 assert.equal(first.ok,true);assert.equal(first.items.length,30);assert.equal(first.more,true);
 const next=await store.list({query:'gen-',status:'NEEDS_ACTION',limit:30,after:first.nextCursor});
 assert.equal(next.items.length,30);assert.ok(next.items[0].slug>first.nextCursor);
 const lookup=await store.list({query:'gen-01023',status:'NEEDS_ACTION',limit:30});
 assert.equal(lookup.items.length,1);
 assert.equal((await store.list({query:'gen-01023',status:'WAITING'})).items.length,0);
 assert.equal((await store.list({status:'PROVIDER_READY'})).code,'READY_PAGE_INVALID');
});
test('R4 typed queue filters are origin-and-size checked before reaching canonical stores',()=>{
 const api={runtime:{id:'pcms-id',getURL:p=>'moz-extension://test/'+p}};
 const sender={id:'pcms-id',url:'moz-extension://test/pcms/index.html#work-queue'};
 assert.equal(validateAiMessage(api,sender,{type:'LIST_JOBS',params:{
  after:'',limit:20,query:'gen-',status:'NEEDS_ACTION'}}).ok,true);
 assert.equal(validateCatalogMessage(api,sender,{type:'LIST_READY',params:{
  after:'',limit:20,query:'gen-',status:'WAITING'}}).ok,true);
 assert.equal(validateAiMessage(api,sender,{type:'LIST_JOBS',params:{
  query:'gen-',status:'DISPATCH_ANY'}}).ok,false);
 assert.equal(validateCatalogMessage(api,sender,{type:'LIST_READY',params:{
  query:'gen-',status:'DISPATCH_ANY'}}).ok,false);
 assert.equal(validateAiMessage(api,{...sender,id:'foreign'},{
  type:'LIST_JOBS',params:{limit:20}}).ok,false);
});
