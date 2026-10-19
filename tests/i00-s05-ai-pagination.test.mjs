import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createAiStore} from '../src/runtime/ai-store.mjs';
import {createAiBoundary} from '../src/runtime/ai-boundary.mjs';
const SHA='a'.repeat(64);
const mk=(slug,createdAt=1)=>({
 schema:1,slug,revision:1,createdAt,state:'PENDING_NATIVE_SESSION',
 sourceFingerprint:SHA,stageRevision:1,
 prompt:{revision:1,tests:['default_generator_smoke']},
 chat1:{state:'PENDING',sessionDigest:null,tests:{}},
 chat2:null,changes:[],hold:'NATIVE_AI_ACTIVATION_NOT_PROVEN'
});
async function seed(db,rows){
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(['meta'],'readwrite');
  tx.oncomplete=resolve;tx.onabort=()=>reject(Error('DB_ABORT'));
  for(const job of rows)tx.objectStore('meta').put({
    key:'ai-job:'+job.slug,accountId:'account',job
  });
 });
}
test('S05 persistent AI job listing pages through 225 records without silent truncation',async()=>{
 const db=fakeDatabase(),store=createAiStore(db);
 await seed(db,Array.from({length:225},(_,i)=>mk('safe-'+String(i).padStart(4,'0'))));
 const a=await store.list({limit:100});
 const b=await store.list({limit:100,after:a.nextCursor});
 const c=await createAiStore(db).list({limit:100,after:b.nextCursor});
 assert.equal(a.jobs.length,100);assert.equal(a.more,true);
 assert.equal(b.jobs.length,100);assert.equal(b.more,true);
 assert.equal(c.jobs.length,25);assert.equal(c.more,false);
 assert.equal(new Set([...a.jobs,...b.jobs,...c.jobs].map(r=>r.slug)).size,225);
 assert.equal((await store.list({limit:201})).code,'AI_PAGE_INVALID');
});
test('S05 background scheduler examines next page rather than treating first as complete',async()=>{
 const lookups=[],pages=[];
 const eligible=mk('z-eligible',200);
 const api={
  runtime:{id:'fixture-extension',
    getURL:x=>'moz-extension://fixture/'+x,
    onConnect:{addListener:()=>{}},
    onStartup:{addListener:()=>{}},onInstalled:{addListener:()=>{}}},
  storage:{local:{get:async()=>({})}},
  alarms:{onAlarm:{addListener:()=>{}},create:()=>{}}
 };
 const service=createAiBoundary(api,{
  open:async()=>({}),effectGate:()=>true,clock:()=>1000,
  storeFactory:()=>({
   list:async ({after}={})=>{
    pages.push(after||'');
    return after?{ok:true,jobs:[{slug:'z-eligible'}],truncated:false,more:false}:
     {ok:true,jobs:[{slug:'a-held'}],truncated:true,more:true,nextCursor:'a-held'};
   },
   getJobFull:async name=>{
    lookups.push(name);
    return {ok:true,job:name==='z-eligible'?eligible:
      {...mk('a-held'),state:'HELD_NO_PROGRESS',hold:'RESOURCE_HELD'}};
   },
   deferScheduler:async()=>({ok:true})
  }),
  stageFactory:()=>({getFull:async name=>({
    ok:true,record:{slug:name,revision:1,state:'SOURCE_VERIFIED',
      personaUid:'protected-persona'}
  })}),
  guard:()=>({getSafeRouteReadiness:async()=>({ready:false,
    code:'PROTECTED_ROUTE_UNVERIFIED'}),runNativeAiStep:async()=>{
     throw Error('native should not run');
  }})
 });
 const result=await service.tick();
 assert.deepEqual(pages,['','a-held']);
 assert.deepEqual(lookups.slice(0,2),['a-held','z-eligible']);
 assert.equal(result.code,'PROTECTED_ROUTE_UNVERIFIED');
});
