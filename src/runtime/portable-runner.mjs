// A02: one browser-native daily and manual backup coordinator. Never invokes
// a PCMS native host, credential vault or source/provider/Git mutation.
import {openCanonicalDatabase,createRestoreSentinel,createCanonicalStore} from './journal.mjs';
import {createAutoStore} from './backup-auto-store.mjs';
import {dayAt,safeStatus} from './backup-auto-core.mjs';
import {makeRetention} from './backup-auto-retention.mjs';
import {inspectAuto,awaitAuto} from './backup-auto-download.mjs';
import {capturePortableCut,downloadPortable} from './portable-cut.mjs';
import {createNoticeDispatcher} from './notices.mjs';
const fail=code=>({ok:false,code});
const explain=e=>/^(BACKUP|PORTABLE|DOWNLOAD)_[A-Z0-9_]{3,70}$/.test(e?.message||'')?
  e.message:'BACKUP_OPERATION_FAILED';
const sha=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
const keepAliveMs=10*60000;
const manualReceipt=async(downloads,id,bytes)=>{
  let row;
  try{const found=await downloads.search({id});row=found?.length===1?found[0]:null;}
  catch{return null;}
  if(row?.id!==id||row?.state!=='complete'||row.exists!==true||
     row.fileSize!==bytes||typeof row.filename!=='string'||
     !/[/\\]pcms-backups[/\\]pcms-alpha-manual_[a-f0-9]{32}(?: \(\d+\))?\.pcms\.jsonl$/i.test(row.filename))return null;
  return {tier:2,code:'BROWSER_REPORTED_COMPLETE',filename:row.filename};
};
const awaitManual=async(downloads,id,bytes,timeoutMs=120000)=>new Promise(resolve=>{
  let ended=false;
  const done=value=>{if(ended)return;ended=true;clearTimeout(timer);
    try{downloads.onChanged.removeListener(changed);}catch{}resolve(value)};
  const inspect=async()=>{
    const proof=await manualReceipt(downloads,id,bytes);
    if(proof)return done(proof);
    const found=await downloads.search({id}).catch(()=>[]);
    if(found?.[0]?.state==='interrupted')done(null);
  };
  const changed=change=>{if(change?.id!==id)return;
    if(change.state?.current==='interrupted')done(null);
    else if(change.state?.current==='complete')void inspect();};
  const timer=setTimeout(()=>done(null),timeoutMs);
  try{downloads.onChanged.addListener(changed);}catch{return done(null);}
  void inspect();
});
export function createPortableRunner(api,{
  open=openCanonicalDatabase,clock=Date.now,
  nextId=()=>crypto.randomUUID().replaceAll('-',''),
  capture=capturePortableCut,dispatch=downloadPortable,wait=awaitAuto,
  observe=inspectAuto
}={}){
  let pending=null,manualTask=null,dbPromise=null;
  const db=()=>dbPromise ||= open().catch(e=>{dbPromise=null;throw e});
  const sentinel=createRestoreSentinel(api.storage.local);
  const store=async()=>createAutoStore(await db(),clock);
  async function recordManual(row){
    const database=await db();
    return new Promise((resolve,reject)=>{
      let tx;try{tx=database.transaction(['meta'],'readwrite');}
      catch{return reject(Error('BACKUP_IDB_UNAVAILABLE'));}
      const s=tx.objectStore('meta');
      tx.oncomplete=()=>resolve();
      tx.onabort=()=>reject(Error('BACKUP_MANUAL_RECEIPT_FAILED'));
      s.put({key:'backup:manual-active',...row,updatedAt:clock()});
    });
  }
  async function readManual(){
    const database=await db();
    return new Promise((resolve,reject)=>{
      let tx;try{tx=database.transaction(['meta'],'readonly');}
      catch{return reject(Error('BACKUP_IDB_UNAVAILABLE'));}
      tx.objectStore('meta').get('backup:manual-active').onsuccess=e=>
        resolve(e.target.result||null);
      tx.onabort=()=>reject(Error('BACKUP_IDB_UNAVAILABLE'));
    });
  }
  async function status(){
    const s=await (await store()).read();
    if(!s.ok)return s;
    let manual=null;try{manual=await readManual();}catch{}
    return {...safeStatus(s.state),format:'PORTABLE',passwordRequired:false,
      guarantee:'SOURCE_COMPLETE_PLAIN_BROWSER_ARCHIVE',
      manual:manual?{status:manual.status,code:manual.code||manual.status,
        tier:manual.tier||0,bytes:manual.bytes||0,runId:manual.runId}:null};
  }
  async function reconcile(s){
    const read=await s.read();
    if(!read.ok)return read;
    const a=read.state.active;
    if(!a)return {ok:true};
    if(['PREPARING','VERIFIED'].includes(a.status)){
      if(clock()-a.startedAt>=keepAliveMs)
        return s.move(a.runId,a.status,'FAILED',{code:'INTERRUPTED_BEFORE_DOWNLOAD'});
      return fail('BACKUP_INFLIGHT');
    }
    if(a.status==='DISPATCH_POSSIBLE')return fail('DOWNLOAD_OUTCOME_UNKNOWN');
    if(a.status==='DOWNLOAD_STARTED'){
      const proof=await observe(api.downloads,{runId:a.runId,day:a.day,
        sha256:a.sha256,bytes:a.bytes,id:a.downloadId});
      return proof?s.move(a.runId,'DOWNLOAD_STARTED','COMPLETE',{archive:proof}):
        s.move(a.runId,'DOWNLOAD_STARTED','HELD',{code:'DOWNLOAD_OUTCOME_UNKNOWN'});
    }
    return fail('BACKUP_INFLIGHT');
  }
  async function tick(){
    if(pending)return pending;
    if(manualTask)return fail('BACKUP_INFLIGHT');
    pending=(async()=>{
      let runId=null,url=null,s=null;
      try{
        if((await sentinel.inspect()).held)return fail('BACKUP_RESTORE_HOLD');
        s=await store();
        const retention=makeRetention(s,api.downloads);
        await retention.recover();
        const recovery=await reconcile(s);
        if(!recovery.ok)return recovery;
        runId='auto_'+nextId();
        const claim=await s.claim(runId,clock());
        if(!claim.ok)return claim;
        let archive;
        try{archive=await capture(api,await db(),sentinel);}
        catch(e){await s.move(runId,'PREPARING','FAILED',{code:explain(e)});
          return fail(explain(e));}
        const fileHash=await sha(archive.blob);
        const verified=await s.move(runId,'PREPARING','VERIFIED',
          {sha256:fileHash,bytes:archive.bytes});
        if(!verified.ok)return verified;
        if((await sentinel.inspect()).held){
          await s.move(runId,'VERIFIED','FAILED',{code:'BACKUP_RESTORE_HOLD'});
          return fail('BACKUP_RESTORE_HOLD');
        }
        const fenced=await s.edit(state=>{
          if(!state.enabled||state.active?.runId!==runId||
             state.active.status!=='VERIFIED')
            return {response:fail('BACKUP_ADMISSION_REVOKED')};
          state.active.status='DISPATCH_POSSIBLE';
          state.status='DISPATCH_POSSIBLE';
          state.code='DOWNLOAD_POSSIBLE';
          return {state,response:{ok:true}};
        });
        if(!fenced.ok)return fenced;
        let receipt;
        try{receipt=await dispatch(api,archive,{runId});url=receipt.objectUrl;}
        catch{return fail('DOWNLOAD_OUTCOME_UNKNOWN');}
        const started=await s.move(runId,'DISPATCH_POSSIBLE','DOWNLOAD_STARTED',
          {downloadId:receipt.downloadId});
        if(!started.ok)return started;
        const proof=await wait(api.downloads,{runId,day:claim.day,
          sha256:fileHash,bytes:archive.bytes,id:receipt.downloadId});
        if(!proof){
          await s.move(runId,'DOWNLOAD_STARTED','HELD',{code:'DOWNLOAD_OUTCOME_UNKNOWN'});
          return fail('DOWNLOAD_OUTCOME_UNKNOWN');
        }
        const complete=await s.move(runId,'DOWNLOAD_STARTED','COMPLETE',{archive:proof});
        if(!complete.ok)return complete;
        await retention.prune();
        return {ok:true,code:'BROWSER_REPORTED_COMPLETE',sha256:fileHash,
          bytes:archive.bytes,diskReadback:false};
      }catch(e){
        // Active dispatch uncertainty survives; never automatically replay.
        return fail(explain(e));
      }finally{if(url)URL.revokeObjectURL(url);}
    })().finally(()=>{pending=null});
    const result=await pending;
    try{
      const notices=createNoticeDispatcher(api,createCanonicalStore(await db()));
      if(result?.ok&&result.code==='BROWSER_REPORTED_COMPLETE')
        await notices.resolve({scopeId:'backup_automatic',code:'BACKUP_FAILED',
          evidence:'BROWSER_REPORTED_COMPLETE'});
      else if(!result?.ok&&!['AUTO_OFF','BACKUP_ALREADY_DONE','BACKUP_COOLDOWN',
        'BACKUP_INFLIGHT_OR_UNCERTAIN','BACKUP_INFLIGHT','BACKUP_RESTORE_HOLD'].includes(result?.code))
        await notices.emit({scopeId:'backup_automatic',code:'BACKUP_FAILED',
          severity:'ACTION_REQUIRED',revision:Math.max(1,clock())});
    }catch{}
    return result;
  }
  async function manual(){
    if(manualTask||pending)return fail('BACKUP_INFLIGHT');
    manualTask=(async()=>{
      let url=null,runId=null,possible=false,receipt=null;
      try{
        if((await sentinel.inspect()).held)return fail('BACKUP_RESTORE_HOLD');
        runId='manual_'+nextId();
        await recordManual({runId,status:'PREPARING',tier:0,
          startedAt:clock(),code:'PREPARING'});
        const archive=await capture(api,await db(),sentinel);
        const fileHash=await sha(archive.blob);
        await recordManual({runId,status:'INTERNAL_VERIFIED',tier:1,
          sha256:fileHash,bytes:archive.bytes,startedAt:clock()});
        if((await sentinel.inspect()).held)throw Error('BACKUP_RESTORE_HOLD');
        // Persist possible-download intent before irreversible browser dispatch.
        await recordManual({runId,status:'DISPATCH_POSSIBLE',tier:1,
          sha256:fileHash,bytes:archive.bytes,startedAt:clock()});
        possible=true;
        receipt=await dispatch(api,archive,{runId,manual:true});
        url=receipt.objectUrl;
        await recordManual({runId,status:'DOWNLOAD_STARTED',tier:1,
          sha256:fileHash,bytes:archive.bytes,downloadId:receipt.downloadId,
          startedAt:clock()});
        const proof=await awaitManual(api.downloads,receipt.downloadId,archive.bytes);
        if(!proof)throw Error('DOWNLOAD_OUTCOME_UNKNOWN');
        await recordManual({runId,status:'BROWSER_REPORTED_COMPLETE',tier:2,
          sha256:fileHash,bytes:archive.bytes,downloadId:receipt.downloadId,
          startedAt:clock(),code:'BROWSER_REPORTED_COMPLETE'});
        return {ok:true,code:'BROWSER_REPORTED_COMPLETE',tier:2,
          sha256:fileHash,bytes:archive.bytes,runId,
          downloadId:receipt.downloadId,diskReadback:false};
      }catch(e){
        if(runId){
          const code=possible?'DOWNLOAD_OUTCOME_UNKNOWN':explain(e);
          try{await recordManual({runId,status:possible?'HELD_UNCERTAIN':'FAILED',
            tier:0,downloadId:receipt?.downloadId??null,code});}catch{}
        }
        return fail(possible?'DOWNLOAD_OUTCOME_UNKNOWN':explain(e));
      }finally{if(url)URL.revokeObjectURL(url);}
    })();
    try{return await manualTask;}finally{manualTask=null;}
  }
  return Object.freeze({
    status,tick,manual,recover:async()=>reconcile(await store()),
    enable:async value=>{
      const s=await store(),out=await s.enabled(value);
      if(out.ok&&value)void tick();
      return out;
    },
    async requestFreshAfterRemoval(){
      const s=await store(),out=await s.requestFresh('ACCOUNT_REMOVED',clock());
      if(!out.ok)return out;
      if(!out.enabled)return fail('AUTO_BACKUP_NOT_ENABLED');
      void tick();
      return {ok:true,code:'FRESH_BACKUP_REQUESTED'};
    }
  });
}
