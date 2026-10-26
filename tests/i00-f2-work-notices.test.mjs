import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createScopeObservation} from '../src/runtime/scope-observation.mjs';
import {createWorkNoticeSink} from '../src/runtime/work-notices.mjs';
async function until(predicate){
 const deadline=Date.now()+2000;
 while(!predicate()){assert.ok(Date.now()<deadline,'Canonical incident did not settle');
  await new Promise(resolve=>setImmediate(resolve));}
}
function fixture(){
 const db=fakeDatabase(),data=new Map(),desktop=[];
 const api={runtime:{getURL:p=>'moz-extension://fixture/'+p},
  storage:{local:{get:async k=>({[k]:data.get(k)}),set:async rows=>{
   for(const [k,v] of Object.entries(rows))data.set(k,structuredClone(v));}}},
  notifications:{create:async row=>desktop.push(row)}};
 const sink=createWorkNoticeSink(api,'ready',{open:async()=>db});
 return {db,data,desktop,api,sink,
  notes:()=>db.keys('meta').filter(k=>k.startsWith('attention:')).map(k=>db.read('meta',k))};
}
test('F2 actual diagnostic failures project distinct canonical Attention; idle cannot resolve, exact progression can',async()=>{
 const f=fixture(),a=createScopeObservation(f.api,'ready',{onFailure:f.sink});
 await a.run(['generator:PRIVATE_SOURCE_CANARY'],async()=>{throw Error('PRIVATE_TOKEN_CANARY');});
 await until(()=>f.notes().length===1);
 const first=f.notes()[0];
 assert.equal(first.state,'ACTIVE');assert.equal(first.target.kind,'SETTINGS');
 assert.equal(first.target.id,'diagnostics');assert.match(first.scopeId,/^work_[a-f0-9]{60}$/);
 await a.run(['generator:another'],async()=>{throw Error('PRIVATE_TOKEN_CANARY');});
 await until(()=>f.notes().length===2);
 assert.notEqual(f.notes()[0].cause,f.notes()[1].cause);
 await a.run(['generator:PRIVATE_SOURCE_CANARY'],async()=>({ok:true,code:'NO_WORK'}));
 await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.db.read('meta',first.key).state,'ACTIVE');
 await a.run(['generator:PRIVATE_SOURCE_CANARY'],async()=>({ok:true,revision:2}),{progressed:r=>r.revision===2});
 await until(()=>f.db.read('meta',first.key).state==='RESOLVED');
 assert.equal(f.notes().filter(row=>row.state==='ACTIVE').length,1);
 const text=JSON.stringify({notes:f.notes(),desktop:f.desktop,receipts:[...f.data.values()]});
 assert.equal(text.includes('PRIVATE_TOKEN'),false);assert.equal(text.includes('PRIVATE_SOURCE'),false);
});
test('F2 restore starting during incident-store acquisition prevents the later canonical incident write',async()=>{
 const f=fixture();let entered,release;
 const seen=new Promise(r=>entered=r),held=new Promise(r=>release=r);
 const sink=createWorkNoticeSink(f.api,'ready',{open:async()=>{entered();await held;return f.db;}});
 sink({scope:'a'.repeat(64),failureCode:'SCOPE_CHECKPOINT_FAILED',checkpoint:'FAILED',lastAttempt:1});
 await seen;f.data.set('pcmsRestoreInProgress',{active:true,status:'PREPARING'});release();
 for(let i=0;i<20;i++)await new Promise(resolve=>setImmediate(resolve));
 assert.equal(f.notes().length,0);assert.equal(f.desktop.length,0);
});

test('F2 failed receipt persistence itself reaches Attention and clears only after actual storage readback recovers',async()=>{
 const f=fixture(),key='pcmsWorkObservation:ready',raw=f.api.storage.local.get;let failed=true;
 f.api.storage.local.get=async k=>{if(k===key&&failed)throw Error('PRIVATE_TOKEN_CANARY');return raw(k);};
 const a=createScopeObservation(f.api,'ready',{onFailure:f.sink});
 assert.equal((await a.run(['generator:one'],async()=>({ok:true}))).ok,true);
 await until(()=>f.notes().length===1);
 const note=f.notes()[0];assert.equal(note.state,'ACTIVE');assert.equal(a.receipt().durability,'UNAVAILABLE');
 failed=false;await a.run(['generator:one'],async()=>({ok:true,code:'NO_WORK'}));
 await until(()=>a.receipt().durability==='VERIFIED'&&f.db.read('meta',note.key).state==='RESOLVED');
 assert.equal(a.receipt().rows[0].lastSuccessfulProgression,null,'repairing diagnostics does not invent source progression');
 assert.equal(JSON.stringify(f.notes()).includes('PRIVATE_TOKEN'),false);
});
