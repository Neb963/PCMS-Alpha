import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createCreationWatcher} from '../src/runtime/creation-watch.mjs';
import {createCatalogWatcher,READY_PROGRESS_ALARM} from '../src/runtime/catalog-watch.mjs';
import {settlePcmsWork} from '../src/runtime/work-checkpoint.mjs';
const drain=async()=>{for(let i=0;i<300;i++)await Promise.resolve();};
function apiFixture(){
 const state=new Map(),listeners=[];
 const api={storage:{local:{get:async key=>({[key]:state.get(key)}),
  set:async values=>{for(const [k,v] of Object.entries(values))state.set(k,structuredClone(v));}}},
  alarms:{create:async()=>{},onAlarm:{addListener:fn=>listeners.push(fn)}},
  runtime:{onStartup:{addListener(){}},onInstalled:{addListener(){}}}};
 return {api,state,listeners};
}
function barrier(){let release;return {promise:new Promise(r=>release=r),release:()=>release()};}
async function seed(db,count,accountFor){
 const tx=db.transaction(['meta'],'readwrite');
 for(let i=0;i<count;i++){
  const intentId='intent_'+String(i).padStart(8,'0');
  tx.objectStore('meta').put({key:'s00-create-intent:'+intentId,
   record:{intentId,slug:'f2-owned-'+i,accountId:accountFor(i),
    revision:1,state:'OWNER_READBACK_PENDING'}});
 }
 await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=reject;});
}
test('F2 creation reaches healthy account behind 1,000 hung-account items before its first task settles',async()=>{
 const f=apiFixture(),db=fakeDatabase(),hung=barrier(),attempts=[];
 await seed(db,1001,i=>i<1000?'account_hung':'account_healthy');
 const make=()=>createCreationWatcher(f.api,{open:async()=>db,observationMs:10,
  createRunner:()=>({step:async(id,revision)=>{
   assert.equal(f.state.get('pcmsS04QueueCursor')===id||
    id==='intent_00000000',true,'cursor committed before external work');
   attempts.push(id);
   if(id==='intent_00000000')await hung.promise;
   return {ok:true,record:{revision:revision+1,state:'ASSOCIATED_NOT_READY'}};
  }})});
 try{
  const result=await make().tick();
  assert.equal(attempts.includes('intent_00001000'),true);
  assert.equal(attempts.filter(id=>id!=='intent_00001000').length,1);
  assert.equal(result.progressed,1);assert.equal(result.held,1);
  assert.equal(result.selected,2);
  const count=attempts.length;
  await make().tick();
  assert.equal(attempts.filter(id=>id!=='intent_00001000').length,1,
   'cold adapter cannot take over a timed-out actual account task');
  assert.ok(attempts.length>=count);
 }finally{hung.release();}
 await settlePcmsWork({timeoutMs:2000});
});
test('F2 fast single-account creation retains all eight safe transitions per wake',async()=>{
 const f=apiFixture(),db=fakeDatabase();await seed(db,16,()=> 'account_one');
 const attempts=[],watcher=createCreationWatcher(f.api,{open:async()=>db,
  createRunner:()=>({step:async(id,revision)=>{
   attempts.push(id);return {ok:true,record:{revision:revision+1,state:'ASSOCIATED_NOT_READY'}};
  }})});
 const first=await watcher.tick(),second=await watcher.tick();
 assert.equal(first.selected,8);assert.equal(first.progressed,8);
 assert.equal(second.selected,8);assert.equal(second.progressed,8);
 assert.equal(new Set(attempts).size,16);
});
for(const mode of ['REJECT','NEVER_UNTIL_RELEASE'])
 test('F2 '+mode+' READY progression cannot block changes, Git, cleanup or approved publication',async()=>{
  const f=apiFixture(),held=barrier(),visited=[];
  const watcher=createCatalogWatcher(f.api,{
   progressReady:async()=>{visited.push('ready');if(mode==='REJECT')throw Error('PRIVATE_TOKEN_CANARY');await held.promise;return {ok:true};},
   progressChanges:async()=>{visited.push('changes');return {ok:true};},
   progressWriteback:async()=>{visited.push('writeback');return {ok:true};},
   progressCleanBulk:async()=>{visited.push('cleanBulk');return {ok:true};},
   progressPublication:async()=>{visited.push('publication');return {ok:true};}
  });
  watcher.register();
  try{
   f.listeners[0]({name:READY_PROGRESS_ALARM});await drain();
   assert.deepEqual([...new Set(visited)].sort(),['changes','cleanBulk','publication','ready','writeback']);
   if(mode==='NEVER_UNTIL_RELEASE'){
    f.listeners[0]({name:READY_PROGRESS_ALARM});await drain();
    assert.equal(visited.filter(x=>x==='ready').length,1);
    assert.ok(visited.filter(x=>x==='publication').length>=2);
   }
   assert.equal(JSON.stringify([...f.state.values()]).includes('PRIVATE_TOKEN'),false);
  }finally{held.release();}
  await settlePcmsWork({timeoutMs:2000});await drain();
 });
