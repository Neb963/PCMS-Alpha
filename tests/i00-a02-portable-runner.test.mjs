import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createAutoStore} from '../src/runtime/backup-auto-store.mjs';
import {archiveFromDownload} from '../src/runtime/backup-auto-core.mjs';
import {createPortableRunner} from '../src/runtime/portable-runner.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
function fixture({failedDispatch=false}={}){
  const db=fakeDatabase(),local=new Map();
  let effects=0,captures=0,id=11;
  const downloaded=new Map();
  const listeners=new Set();
  const api={
    storage:{local:{
      get:async key=>key===null?Object.fromEntries(local):Array.isArray(key)?
        Object.fromEntries(key.filter(k=>local.has(k)).map(k=>[k,local.get(k)])):
        {[key]:local.get(key)},
      set:async entries=>{for(const [k,v] of Object.entries(entries))local.set(k,v);}
    }},
    downloads:{
      search:async({id})=>downloaded.has(id)?[downloaded.get(id)]:[],
      onChanged:{addListener:l=>listeners.add(l),removeListener:l=>listeners.delete(l)}
    },
    runtime:{sendNativeMessage:()=>{throw Error('FORBIDDEN_NATIVE_HOST')}}
  };
  let next=0;
  const runId=n=>'auto_'+n.toString(16).padStart(32,'0');
  const body=new Blob(['portable fixture with exact bytes']);
  const capture=async()=>{captures++;return {blob:body,bytes:body.size,
    sourceAudit:{manifests:0,uniqueBlobs:0}}};
  const dispatch=async (_api,archive,{runId})=>{
    effects++;
    if(failedDispatch)throw Error('LOST_ACK');
    const row={id:id++,filename:'/tmp/Downloads/pcms-backups/pcms-alpha-'+
      runId+'.pcms.jsonl',state:'complete',fileSize:archive.bytes,exists:true};
    downloaded.set(row.id,row);
    return {downloadId:row.id,objectUrl:null};
  };
  const wait=async (_api,receipt)=>{
    const row=downloaded.get(receipt.id);
    return row?archiveFromDownload(receipt.runId,receipt.day,
      receipt.sha256,receipt.bytes,row):null;
  };
  return {db,api,store:createAutoStore(db,()=>100000000),local,
    runner:createPortableRunner(api,{open:async()=>db,clock:()=>100000000,
      nextId:()=>String(++next).padStart(32,'0'),capture,dispatch,wait}),
    effects:()=>effects,captures:()=>captures};
}
test('A02 daily portable backup journals the effect, completes and never calls native vault',async()=>{
  const f=fixture();
  await f.store.enabled(true);
  const first=await f.runner.tick();
  assert.equal(first.ok,true,JSON.stringify(first));
  assert.equal(first.code,'BROWSER_REPORTED_COMPLETE');
  assert.equal(f.effects(),1);
  const state=await f.store.read();
  assert.equal(state.state.archives.length,1);
  assert.equal(state.state.archives[0].kind,'AUTO');
  assert.ok(state.state.lastSuccessDay>=0);
  assert.equal((await f.runner.tick()).code,'BACKUP_ALREADY_DONE');
  assert.equal(f.effects(),1);
});
test('A02 lost download ACK journals uncertainty and blocks replay, including new runner',async()=>{
  const f=fixture({failedDispatch:true});
  await f.store.enabled(true);
  const result=await f.runner.tick();
  assert.equal(result.ok,false);
  assert.equal(result.code,'DOWNLOAD_OUTCOME_UNKNOWN');
  assert.equal(f.effects(),1);
  const held=await f.store.read();
  assert.equal(held.state.active.status,'DISPATCH_POSSIBLE');
  assert.equal((await f.runner.tick()).ok,false);
  const cold=createPortableRunner(f.api,{open:async()=>f.db,clock:()=>100000000,
    nextId:()=>String(44).padStart(32,'0'),capture:async()=>{throw Error('DO_NOT_CAPTURE');}});
  assert.equal((await cold.tick()).code,'DOWNLOAD_OUTCOME_UNKNOWN');
  assert.equal(f.effects(),1);
});

test('A02 manual lost browser ACK is durable and cannot dispatch a second file',async()=>{
  const f=fixture({failedDispatch:true});
  const first=await f.runner.manual();
  assert.equal(first.ok,false);
  assert.equal(first.code,'DOWNLOAD_OUTCOME_UNKNOWN');
  assert.equal(f.effects(),1);
  const cold=createPortableRunner(f.api,{open:async()=>f.db,
    clock:()=>100000000,nextId:()=>('f'.repeat(32)),
    capture:async()=>{throw Error('DUPLICATE_BACKUP_PREVENTED')}});
  const second=await cold.manual();
  assert.equal(second.code,'MANUAL_DOWNLOAD_UNCERTAIN');
  assert.equal(f.effects(),1);
  const last=f.db.read('meta','backup:manual-active');
  assert.equal(last.status,'HELD_UNCERTAIN');
});
