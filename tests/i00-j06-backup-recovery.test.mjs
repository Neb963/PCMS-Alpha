import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createPortableRunner} from '../src/runtime/portable-runner.mjs';
import {createAutoStore} from '../src/runtime/backup-auto-store.mjs';
import {archiveFromDownload} from '../src/runtime/backup-auto-core.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const put=(db,row)=>new Promise(resolve=>{const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put(row);tx.oncomplete=resolve});
function fixture({lostAck=false,interrupted=false,root='/tmp/Downloads'}={}){
 const db=fakeDatabase(),downloads=new Map(),removed=[],events=new Set(),local=new Map(),body=new Blob(['J06 independently recorded export bytes']);
 let sequence=0,effects=0,failCapture=false;
 const api={storage:{local:{get:async key=>({[key]:local.get(key)}),set:async o=>{for(const [k,v] of Object.entries(o))local.set(k,v)}}},
  runtime:{sendNativeMessage(){throw Error('NATIVE_FORBIDDEN')}},
  downloads:{removeFile:async id=>{removed.push(id);if(downloads.has(id))downloads.get(id).exists=false},erase:async()=>{throw Error('UNTRACKED_HISTORY_ERASURE_FORBIDDEN')},search:async q=>q.id!==undefined?(downloads.has(q.id)?[structuredClone(downloads.get(q.id))]:[]):[...downloads.values()].filter(x=>x.filename.includes(q.query?.[0]||'!')).slice(0,q.limit||20).map(x=>structuredClone(x)),
   onChanged:{addListener:f=>events.add(f),removeListener:f=>events.delete(f)}}};
 const capture=async()=>{if(failCapture)throw Error('BACKUP_SOURCE_UNAVAILABLE');return {blob:body,bytes:body.size,sourceAudit:{manifests:0,uniqueBlobs:0}}};
 const dispatch=async(_api,archive,{runId})=>{effects++;const id=effects+100;downloads.set(id,{id,filename:root+'/pcms-backups/pcms-alpha-'+runId+'.pcms.jsonl',fileSize:archive.bytes,state:interrupted?'interrupted':'complete',exists:!interrupted});if(lostAck)throw Error('ACK_LOST_AFTER_EXTERNAL_EFFECT');return {downloadId:id,objectUrl:null}};
 const wait=async(_downloads,r)=>{const row=downloads.get(r.id);return row?.state==='complete'?archiveFromDownload(r.runId,r.day,r.sha256,r.bytes,row):null};
 const options={open:async()=>db,clock:()=>100000000,nextId:()=>String(++sequence).padStart(32,'0'),prepareOriginals:async()=>{},completeOriginals:async()=>{},capture,dispatch,wait};
 return {db,downloads,removed,api,runner:createPortableRunner(api,options),cold:()=>createPortableRunner(api,options),store:createAutoStore(db,()=>100000000),
  effects:()=>effects,failCapture:()=>{failCapture=true},finish:()=>{for(const r of downloads.values()){r.state='complete';r.exists=true}}};
}
test('J06 no-ID manual lost ACK is found by the exact journaled run, never downloaded again, and STATUS exposes the durable success',async()=>{
 const f=fixture({lostAck:true});assert.equal((await f.runner.manual()).code,'DOWNLOAD_OUTCOME_UNKNOWN');assert.equal(f.effects(),1);
 const before=f.db.read('meta','backup:manual-active');assert.equal(before.downloadId,null);
 const recovered=await f.cold().manual();assert.equal(recovered.ok,true);assert.equal(recovered.recovered,true);assert.equal(recovered.runId,before.runId);assert.equal(f.effects(),1);
 const status=await f.cold().status();assert.equal(status.manual.status,'BROWSER_REPORTED_COMPLETE');assert.equal(status.lastSuccess.runId,before.runId);assert.equal(status.lastSuccess.completedAt,100000000);assert.equal(status.lastSuccess.diskReadback,false);
});
test('J06 daily known-ID HELD and no-ID dispatch uncertainty reconcile independently after a cold wake without new effects',async()=>{
 for(const options of [{interrupted:true},{lostAck:true}]){
  const f=fixture(options);await f.store.enabled(true);assert.equal((await f.runner.tick()).code,'DOWNLOAD_OUTCOME_UNKNOWN');
  const before=(await f.store.read()).state.active;assert.equal(before.status,'DISPATCH_POSSIBLE');assert.equal(f.effects(),1);f.finish();
  const status=await f.cold().status();assert.equal(status.status,'COMPLETE');assert.equal(status.lastSuccess.runId,before.runId);assert.equal(status.lastSuccess.kind,'DAILY');assert.equal(status.lastSuccess.completedAt,100000000);
  assert.equal((await f.cold().tick()).code,'BACKUP_ALREADY_DONE');assert.equal(f.effects(),1);
 }
});
test('J06 ambiguous, truncated, foreign-folder, missing, wrong-size and malformed-ID observations cannot close uncertainty',async()=>{
 for(const mutate of [
  f=>{const r=[...f.downloads.values()][0];f.downloads.set(222,{...r,id:222})},
  f=>{f.api.downloads.search=async()=>Array.from({length:20},(_,n)=>({...f.downloads.values().next().value,id:100+n}))},
  f=>{f.downloads.values().next().value.filename='/tmp/Downloads/unrelated/pcms-alpha-'+f.db.read('meta','backup:manual-active').runId+'.pcms.jsonl'},
  f=>f.downloads.clear(),
  f=>{f.downloads.values().next().value.fileSize++},
  f=>{f.downloads.values().next().value.id=-1}
 ]){
  const f=fixture({lostAck:true});await f.runner.manual();mutate(f);
  assert.equal((await f.cold().manual()).code,'MANUAL_DOWNLOAD_UNCERTAIN');assert.equal(f.effects(),1);
  assert.equal(f.db.read('meta','backup:manual-active').status,'HELD_UNCERTAIN');
 }
});
test('J06 a failed later export preserves its previous verified complete receipt',async()=>{
 const f=fixture();const good=await f.runner.manual();assert.equal(good.ok,true);f.failCapture();
 const failed=await f.runner.manual();assert.equal(failed.code,'BACKUP_SOURCE_UNAVAILABLE');
 const status=await f.cold().status();assert.equal(status.manual.status,'FAILED');assert.equal(status.lastSuccess.runId,good.runId);assert.equal(status.lastSuccess.sha256,good.sha256);assert.equal(f.effects(),1);
});
test('J06 delayed completion readback cannot overwrite a newer possible-download intent',async()=>{
 const f=fixture({lostAck:true});await f.runner.manual();const prior=f.db.read('meta','backup:manual-active');
 let release,entered;const ready=new Promise(r=>entered=r),original=f.api.downloads.search;
 f.api.downloads.search=async q=>{const rows=await original(q);if(q.query){entered();await new Promise(r=>release=r)}return rows};
 const pending=f.cold().recoverManual();await ready;
 const newer={...prior,runId:'manual_'+'f'.repeat(32),status:'DISPATCH_POSSIBLE',downloadId:null};
 await put(f.db,newer);release();assert.equal((await pending).code,'MANUAL_RUN_CHANGED');
 assert.equal(f.db.read('meta','backup:manual-active').runId,newer.runId);assert.equal(f.db.read('meta','backup:manual-active').status,'DISPATCH_POSSIBLE');assert.equal(f.effects(),1);
});

test('J06 a recovered fifteenth daily success is retained/pruned on the ordinary tick without a new export; STATUS never deletes',async()=>{
 const f=fixture({lostAck:true});
 const archives=Array.from({length:14},(_,i)=>{
  const runId='auto_'+String(500+i).padStart(32,'0'),row={id:i+1,state:'complete',exists:true,fileSize:38,filename:'/tmp/Downloads/pcms-backups/pcms-alpha-'+runId+'.pcms.jsonl'};
  f.downloads.set(row.id,row);return archiveFromDownload(runId,0,'a'.repeat(64),38,row);
 });
 f.downloads.set(999,{id:999,state:'complete',exists:true,fileSize:38,filename:'/tmp/Downloads/user-manual-note.jsonl'});
 await f.store.edit(state=>{state.enabled=true;state.archives=archives;state.lastSuccessDay=0;return {state,response:{ok:true}}});
 await f.runner.tick();const recovered=await f.cold().status();assert.equal(recovered.retained,15);assert.equal(f.removed.length,0);
 assert.equal((await f.cold().tick()).code,'BACKUP_ALREADY_DONE');
 assert.equal((await f.store.read()).state.archives.filter(x=>x.state==='COMPLETE').length,14);
 assert.equal(f.removed.length,1);assert.equal(f.downloads.get(101).exists,true);assert.equal(f.downloads.get(999).exists,true);assert.equal(f.effects(),1);
});
test('J06 automatic lost-ACK readback works in a custom Firefox download directory',async()=>{
 const f=fixture({lostAck:true,root:'/tmp/Saved files'});await f.store.enabled(true);await f.runner.tick();
 const status=await f.cold().status();assert.equal(status.status,'COMPLETE');assert.equal(f.effects(),1);assert.equal(status.lastSuccess.kind,'DAILY');
});
test('J06 last-success ordering follows actual completion, not the earlier scheduled day',async()=>{
 const f=fixture(),id='auto_'+'a'.repeat(32),row={id:44,state:'complete',exists:true,fileSize:38,filename:'/tmp/Downloads/pcms-backups/pcms-alpha-'+id+'.pcms.jsonl'};
 const archive={...archiveFromDownload(id,0,'a'.repeat(64),38,row),completedAt:86400000+20000};
 await f.store.edit(state=>{state.archives=[archive];state.lastSuccessDay=0;return {state,response:{ok:true}}});
 await put(f.db,{key:'backup:manual-last-complete',status:'BROWSER_REPORTED_COMPLETE',tier:2,runId:'manual_'+'b'.repeat(32),bytes:38,sha256:'c'.repeat(64),startedAt:86400000+5000,completedAt:86400000+10000});
 assert.equal((await f.cold().status()).lastSuccess.runId,id);
});

test('J06 foreign or malformed last-good receipt cannot be promoted by STATUS',async()=>{
 const f=fixture();
 for(const value of [
 {status:'RESTORED_HISTORY_ONLY',tier:0,runId:'manual_'+'a'.repeat(32),bytes:38,sha256:'a'.repeat(64)},
 {status:'BROWSER_REPORTED_COMPLETE',tier:2,runId:'invalid',bytes:38,sha256:'a'.repeat(64)},
 {status:'BROWSER_REPORTED_COMPLETE',tier:2,runId:'manual_'+'a'.repeat(32),bytes:0,sha256:'a'.repeat(64)}
 ]){
  await put(f.db,{key:'backup:manual-last-complete',...value});
  assert.equal((await f.cold().status()).lastSuccess,null);
 }
});

test('J06 restore safety copy uses the same real download coordinator without adoption qualification',async()=>{
 const f=fixture();let prepared=0,qualified=0;
 // Observable counters distinguish a backup from a source-authority mutation.
 const owner={epoch:'restore_'+'a'.repeat(32),revision:1,stageScope:'portable_'+'b'.repeat(32)};
 await f.api.storage.local.set({pcmsRestoreInProgress:{active:true,status:'PREPARING',...owner,groups:{},createdContainers:{}}});
 assert.equal((await f.runner.manual()).code,'RESTORE_HOLD');
 const result=await f.runner.checkpoint(owner);assert.equal(result.ok,true);assert.equal(result.purpose,'RESTORE_CHECKPOINT');
 assert.equal(f.db.read('meta','backup:manual-active').purpose,'RESTORE_CHECKPOINT');assert.equal(f.effects(),1);
 assert.equal((await f.runner.status()).lastSuccess.runId,result.runId);
 await f.api.storage.local.set({pcmsRestoreInProgress:{active:true,status:'GUARD_INSTALLED',...owner}});
 assert.equal((await f.runner.checkpoint(owner)).code,'BACKUP_RESTORE_HOLD');assert.equal(f.effects(),1);
});
