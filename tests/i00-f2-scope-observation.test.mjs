import test from 'node:test';
import assert from 'node:assert/strict';
import {createScopeObservation} from '../src/runtime/scope-observation.mjs';
import {settlePcmsWork} from '../src/runtime/work-checkpoint.mjs';
const drain=async()=>{for(let i=0;i<200;i++)await Promise.resolve();};
async function until(predicate){
 const deadline=Date.now()+2000;
 while(!predicate()){
  assert.ok(Date.now()<deadline,'Expected actual asynchronous receipt did not settle');
  await new Promise(resolve=>setImmediate(resolve));
 }
}
const barrier=()=>{let release;return {promise:new Promise(r=>release=r),release:()=>release()};};
function fixture({holdWrites=false,failReads=false}={}){
 const rows=new Map(),writes=[],bar=barrier();let blocked=holdWrites;
 const api={storage:{local:{
  get:async key=>{if(failReads)throw Error('PRIVATE_TOKEN_CANARY');return {[key]:rows.get(key)};},
  set:async value=>{writes.push(value);if(blocked)await bar.promise;for(const [k,v] of Object.entries(value))rows.set(k,structuredClone(v));}
 }}};
 return {api,rows,writes,release:()=>{blocked=false;bar.release();}};
}
test('F2 observation expiry retains actual ownership across adapters and domains until settlement',async()=>{
 const f=fixture(),held=barrier(),a=createScopeObservation(f.api,'ready',{observationMs:10});
 const other=createScopeObservation({...f.api},'publication',{observationMs:10});
 let called=0;
 const first=a.run(['generator:PRIVATE_CANARY'],async()=>{called++;await held.promise;return {ok:true,revision:2};},{progressed:r=>r.revision===2});
 try{
  assert.equal((await first).code,'SCOPE_OBSERVATION_PENDING');
  assert.equal((await other.run(['generator:PRIVATE_CANARY'],()=>{called++;})).code,'SCOPE_ACTUAL_WORK_PENDING');
  assert.equal(called,1);
  assert.equal(await other.run(['generator:healthy'],async()=>({ok:true})).then(r=>r.ok),true);
  await assert.rejects(settlePcmsWork({timeoutMs:10}),/RESTORE_LOCAL_WORK_BUSY/);
 }finally{held.release();}
 await settlePcmsWork({timeoutMs:1000});await until(()=>a.receipt().durability==='VERIFIED');
 assert.equal((await other.run(['generator:PRIVATE_CANARY'],async()=>({ok:true}))).ok,true);
 assert.equal(called,1);
 assert.equal(a.receipt().rows.at(-1).lastSuccessfulProgression!==null,true);
 assert.equal(JSON.stringify(f.writes).includes('PRIVATE_CANARY'),false);
 assert.equal(a.receipt().durability,'VERIFIED');
});
test('F2 bounded saturated domain permits other domains and never takes over expired work',async()=>{
 const f=fixture(),held=barrier(),a=createScopeObservation(f.api,'ready',{observationMs:10});
 const tasks=Array.from({length:4},(_,i)=>a.run(['generator:hung'+i],()=>held.promise));
 try{
  assert.equal((await a.run(['generator:fifth'],async()=>({ok:true}))).code,'SCOPE_CAPACITY_HELD');
  assert.equal((await createScopeObservation(f.api,'backup').run(['backup:local'],async()=>({ok:true}))).ok,true);
  assert.equal((await Promise.all(tasks)).every(r=>r.code==='SCOPE_OBSERVATION_PENDING'),true);
  assert.equal((await a.run(['generator:fifth'],async()=>({ok:true}))).code,'SCOPE_CAPACITY_HELD');
 }finally{held.release();}
 await settlePcmsWork({timeoutMs:1000});
 assert.equal((await a.run(['generator:fifth'],async()=>({ok:true}))).ok,true);
});
test('F2 hung diagnostics neither block healthy progression nor join actual restore ownership',async()=>{
 const f=fixture({holdWrites:true}),a=createScopeObservation(f.api,'creation');
 try{
  assert.equal((await a.run(['generator:one'],async()=>({ok:true}),{progressed:r=>r.ok})).ok,true);
  await settlePcmsWork({timeoutMs:100});await until(()=>f.writes.length>0);
  assert.equal(a.receipt().durability,'PENDING');
  assert.equal((await a.run(['generator:two'],async()=>({ok:true}))).ok,true);
 }finally{f.release();}
 await until(()=>a.receipt().durability==='VERIFIED');assert.equal(a.receipt().durability,'VERIFIED');
});
test('F2 receipt failure remains visible through idle results and only observed progression clears it',async()=>{
 const f=fixture(),a=createScopeObservation(f.api,'writeback');
 await a.run(['generator:one'],async()=>{throw Error('PRIVATE_TOKEN_CANARY');});await until(()=>a.receipt().durability==='VERIFIED');
 assert.equal(a.receipt().rows[0].failureCode,'SCOPE_CHECKPOINT_FAILED');
 assert.equal(a.receipt().rows[0].lastSuccessfulProgression,null);
 await a.run(['generator:one'],async()=>({ok:true,code:'NO_WORK'}));await until(()=>a.receipt().durability==='VERIFIED');
 assert.equal(a.receipt().rows[0].failureCode,'SCOPE_CHECKPOINT_FAILED');
 assert.equal(a.receipt().rows[0].lastSuccessfulProgression,null);
 await a.run(['generator:one'],async()=>({ok:true,revision:2}),{progressed:r=>r.revision===2});await until(()=>a.receipt().durability==='VERIFIED');
 assert.equal(a.receipt().rows[0].failureCode,null);
 assert.ok(a.receipt().rows[0].lastSuccessfulProgression);
 assert.equal(JSON.stringify(f.writes).includes('PRIVATE_TOKEN'),false);
});
test('F2 failed diagnostic hydration never overwrites a previous-good durable record',async()=>{
 const f=fixture(),key='pcmsWorkObservation:inventory';
 const previous={schema:1,domain:'inventory',rows:[{scope:'a'.repeat(64),domain:'inventory',checkpoint:'PROGRESSED',lastAttempt:1,lastSuccessfulProgression:1}]};
 f.rows.set(key,previous);
 const rawGet=f.api.storage.local.get;
 f.api.storage.local.get=async k=>{if(k===key)throw Error('PRIVATE_TOKEN_CANARY');return rawGet(k);};
 const a=createScopeObservation(f.api,'inventory');
 assert.equal((await a.run(['inventory:one'],async()=>({ok:true}))).ok,true);await until(()=>a.receipt().durability==='UNAVAILABLE');
 assert.equal(a.receipt().durability,'UNAVAILABLE');assert.equal(f.writes.length,0);
 assert.deepEqual(f.rows.get(key),previous);
});
test('F2 restore hold denies task entry and grants no progress credit',async()=>{
 const f=fixture();f.rows.set('pcmsRestoreInProgress',{active:true,status:'PREPARING'});
 let called=false;const a=createScopeObservation(f.api,'adoption');
 assert.equal((await a.run(['generator:one'],async()=>{called=true;return {ok:true};})).code,'RESTORE_HOLD');
 await until(()=>a.receipt().rows.length>0);assert.equal(called,false);assert.equal(a.receipt().rows[0].lastSuccessfulProgression,null);
});

test('F2 unknown or malformed durable receipt schema remains intact and reports unavailable',async()=>{
 for(const previous of [{schema:99,domain:'inventory',rows:[]},
  {schema:1,domain:'inventory',rows:[{scope:'PRIVATE_TOKEN_CANARY',checkpoint:'PROGRESSED'}]}]){
  const f=fixture(),key='pcmsWorkObservation:inventory';f.rows.set(key,structuredClone(previous));
  const a=createScopeObservation(f.api,'inventory');
  assert.equal((await a.run(['inventory:one'],async()=>({ok:true}))).ok,true);
  await until(()=>a.receipt().durability==='UNAVAILABLE');
  assert.deepEqual(f.rows.get(key),previous);assert.equal(f.writes.length,0);
  assert.equal(JSON.stringify(a.receipt()).includes('PRIVATE_TOKEN'),false);
 }
});
