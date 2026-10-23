import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createReadyStore} from '../src/runtime/ready-store.mjs';
import {createReadyDevelopment} from '../src/runtime/ready-development.mjs';

const slug='a05-public-autoprogress';
async function fixture(visibility='PUBLIC'){
 const db=fakeDatabase(),repo='1411034835';
 const ready=createReadyStore(db);
 const witness={slug,repositoryId:repo,identifier:'rev-autoa0501',
   declarationCommit:'d'.repeat(40),markerOid:'e'.repeat(40),
   inputFingerprint:'a'.repeat(64)};
 const queued=await ready.observe(witness);
 assert.equal(queued.ok,true,JSON.stringify(queued));
 await new Promise((resolve,reject)=>{
   const tx=db.transaction('meta','readwrite');
   tx.objectStore('meta').put({key:'inventory:'+slug,
     generator:{slug,visibility}});
   tx.oncomplete=resolve;tx.onabort=()=>reject(Error('INV_SEED_ABORTED'));
 });
 const data={};
 const api={storage:{local:{
   get:async key=>typeof key==='string'?{[key]:data[key]}:{},
   set:async values=>Object.assign(data,values)
 }}};
 return {db,api,ready,data};
}
test('A05 autonomous public READY prepares guarded source without native vault or passphrase',async()=>{
 const f=await fixture(),calls=[];
 const process=createReadyDevelopment(f.api,{
  open:async()=>f.db,effectGate:()=>true,
  makeReady:()=>({runTrusted:async()=>{throw Error('unexpected READY mutation')}}),
  makeExisting:()=>({runTrusted:async message=>{
    calls.push(message);
    return {ok:true,code:'EXISTING_PREPARED',slug};
  }}),
  makeStage:()=>({}),makeAi:()=>({}),maxCandidates:10
 });
 const out=await process.tick();
 assert.equal(out.ok,true,JSON.stringify(out));
 assert.equal(out.step,'PREPARE_UPDATE');
 assert.deepEqual(calls,[{type:'PREPARE',params:{slug}}]);
 assert.equal(f.data.pcmsS05DevelopmentReceipt.providerEffects,'NONE');
 assert.equal((await f.ready.get(slug)).ok,true);
});
test('A05 private READY preparation does not touch existing public-source mutation',async()=>{
 const f=await fixture('UNLISTED');const calls=[];
 const process=createReadyDevelopment(f.api,{
  open:async()=>f.db,effectGate:()=>true,
  makeReady:()=>({runTrusted:async message=>{
   calls.push(message);return {ok:true,code:'READY_PREPARED',slug};
  }}),
  makeExisting:()=>({runTrusted:async()=>{throw Error('PUBLIC_UPDATE_NOT_ALLOWED')}}),
  makeStage:()=>({}),makeAi:()=>({}),maxCandidates:10
 });
 const out=await process.tick();
 assert.equal(out.ok,true,JSON.stringify(out));
 assert.equal(out.step,'PREPARE_LOCAL');
 assert.deepEqual(calls,[{type:'PREPARE_LOCAL',
  params:{slug,expectedRevision:1}}]);
});
