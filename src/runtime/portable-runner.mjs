import {inspectDisposableRestore} from './functional-restore.mjs';
import {checkpointed} from './work-checkpoint.mjs';
import {preparePortableOriginals,completePortableOriginals} from './portable-originals.mjs';
// A02: one browser-native daily and manual backup coordinator. Never invokes
// a PCMS native host, credential vault or source/provider/Git mutation.
import {openCanonicalDatabase,createRestoreSentinel,createCanonicalStore} from './journal.mjs';
import {createAutoStore} from './backup-auto-store.mjs';
import {dayAt,safeStatus,DAY} from './backup-auto-core.mjs';
import {makeRetention} from './backup-auto-retention.mjs';
import {inspectAuto,awaitAuto} from './backup-auto-download.mjs';
import {capturePortableCut,downloadPortable} from './portable-cut.mjs';
import {createNoticeDispatcher} from './notices.mjs';
import {readPortableArchive} from './portable-archive.mjs';
const fail=code=>({ok:false,code});
const explain=e=>/^(BACKUP|PORTABLE|DOWNLOAD|RESTORE)_[A-Z0-9_]{3,70}$/.test(e?.message||'')?
  e.message:'BACKUP_OPERATION_FAILED';
const sha=async blob=>Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',await blob.arrayBuffer())),x=>x.toString(16).padStart(2,'0')).join('');
const keepAliveMs=10*60000;
const manualReceipt=async(downloads,id,bytes,runId)=>{
  if(typeof runId!=='string'||!/^manual_[a-f0-9]{32}$/.test(runId))return null;
  let row;
  try{const found=await downloads.search({id});row=found?.length===1?found[0]:null;}
  catch{return null;}
  const matched=typeof row?.filename==='string'?
    /[/\\]pcms-backups[/\\]pcms-alpha-(manual_[a-f0-9]{32})(?: \(\d+\))?\.pcms\.jsonl$/i.exec(row.filename):null;
  if(row?.id!==id||row?.state!=='complete'||row.exists!==true||
     row.fileSize!==bytes||matched?.[1]!==runId)return null;
  return {tier:2,code:'BROWSER_REPORTED_COMPLETE',filename:row.filename};
};
const awaitManual=async(downloads,id,bytes,runId,timeoutMs=120000)=>new Promise(resolve=>{
  let ended=false;
  const done=value=>{if(ended)return;ended=true;clearTimeout(timer);
    try{downloads.onChanged.removeListener(changed);}catch{}resolve(value)};
  const inspect=async()=>{
    const proof=await manualReceipt(downloads,id,bytes,runId);
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
// Exact readback of an already journaled plain export, never disk hash proof.
async function locatePortableDownload(downloads,run){
  if(!/^(auto|manual)_[a-f0-9]{32}$/.test(run?.runId||'')||
     !Number.isSafeInteger(run.bytes)||run.bytes<=0||
     !/^[a-f0-9]{64}$/.test(run.sha256||''))return null;
  const known=Number.isSafeInteger(run.downloadId)&&run.downloadId>=0;
  if(run.downloadId!=null&&!known)return null;
  let rows;try{rows=await downloads.search(known?{id:run.downloadId}:{query:[run.runId],limit:20})}catch{return null}
  if(!Array.isArray(rows)||known&&rows.length!==1||!known&&rows.length>=20)return null;
  const pattern=new RegExp('[/\\\\]pcms-backups[/\\\\]pcms-alpha-'+run.runId+'(?: \\(\\d+\\))?\\.pcms\\.jsonl$','i');
  const matches=rows.filter(row=>Number.isSafeInteger(row?.id)&&row.id>=0&&
    (!known||row.id===run.downloadId)&&row.state==='complete'&&row.exists===true&&
    row.fileSize===run.bytes&&typeof row.filename==='string'&&pattern.test(row.filename));
  return matches.length===1?matches[0]:null;
}
export function createPortableRunner(api,{
  open=openCanonicalDatabase,clock=Date.now,
  nextId=()=>crypto.randomUUID().replaceAll('-',''),
  capture=capturePortableCut,dispatch=downloadPortable,wait=awaitAuto,
  observe=inspectAuto,prepareOriginals=preparePortableOriginals,completeOriginals=completePortableOriginals
}={}){
  let pending=null,manualTask=null,inspection=null,dbPromise=null;
  const db=()=>dbPromise ||= open().catch(e=>{dbPromise=null;throw e});
  const sentinel=createRestoreSentinel(api.storage.local);
  const store=async()=>createAutoStore(await db(),clock);
  async function recordManual(row,{expectedRunId=null}={}){
    const database=await db();
    return new Promise((resolve,reject)=>{
      let tx,out={ok:true};try{tx=database.transaction(['meta'],'readwrite')}
      catch{return reject(Error('BACKUP_IDB_UNAVAILABLE'))}
      const meta=tx.objectStore('meta');
      tx.oncomplete=()=>resolve(out);
      tx.onabort=()=>reject(Error('BACKUP_MANUAL_RECEIPT_FAILED'));
      function apply(){
        const saved={...row,updatedAt:clock()};
        meta.put({key:'backup:manual-active',...saved});
        if(saved.status==='BROWSER_REPORTED_COMPLETE'&&saved.tier===2&&
           /^[a-f0-9]{64}$/.test(saved.sha256||'')&&Number.isSafeInteger(saved.bytes)&&saved.bytes>0)
          meta.put({key:'backup:manual-last-complete',...saved,completedAt:saved.completedAt||clock()});
      }
      if(expectedRunId===null){apply();return}
      meta.get('backup:manual-active').onsuccess=e=>{
        const current=e.target.result;
        if(current?.runId!==expectedRunId){out=fail('MANUAL_RUN_CHANGED');return}
        if(current.status==='BROWSER_REPORTED_COMPLETE'){out={ok:true,alreadyComplete:true};return}
        if(!['DISPATCH_POSSIBLE','DOWNLOAD_STARTED','HELD_UNCERTAIN'].includes(current.status)){
          out=fail('MANUAL_RUN_CHANGED');return;
        }
        apply();
      };
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
  async function readLastManual(){
    const database=await db();
    return new Promise((resolve,reject)=>{
      const tx=database.transaction(['meta'],'readonly');
      tx.objectStore('meta').get('backup:manual-last-complete').onsuccess=e=>resolve(e.target.result||null);
      tx.onabort=()=>reject(Error('BACKUP_IDB_UNAVAILABLE'));
    });
  }
  async function recoverManual(owner=null){
    if(owner&&!await ownsPreparation(owner))return fail('BACKUP_RESTORE_HOLD');
    const previous=await readManual();
    if(owner&&(previous?.purpose!=='RESTORE_CHECKPOINT'||previous.preparationEpoch!==owner.epoch))
      return fail('BACKUP_PREVIOUS_DOWNLOAD_UNCERTAIN');
    if(!previous||!['DISPATCH_POSSIBLE','DOWNLOAD_STARTED','HELD_UNCERTAIN'].includes(previous.status))
      return {ok:true,recovered:false};
    const row=await locatePortableDownload(api.downloads,previous);
    if(!row)return fail('MANUAL_DOWNLOAD_UNCERTAIN');
    const proof=await manualReceipt(api.downloads,row.id,previous.bytes,previous.runId);
    if(!proof)return fail('MANUAL_DOWNLOAD_UNCERTAIN');
    if(previous.purpose!=='RESTORE_CHECKPOINT')await completeOriginals(await db(),{runId:previous.runId,sha256:previous.sha256,bytes:previous.bytes,browserCompleted:true});
    const recorded=await recordManual({...previous,downloadId:row.id,status:'BROWSER_REPORTED_COMPLETE',
      code:'BROWSER_REPORTED_COMPLETE',tier:2,completedAt:clock()},{expectedRunId:previous.runId});
    if(!recorded.ok)return recorded;
    return {ok:true,recovered:true,code:'BROWSER_REPORTED_COMPLETE',tier:2,
      runId:previous.runId,downloadId:row.id,sha256:previous.sha256,bytes:previous.bytes,diskReadback:false};
  }
  async function status(){
    // Only receipt readback; never dispatch a download from STATUS.
    if(!pending&&!manualTask&&!(await sentinel.inspect()).held){
      try{await reconcile(await store())}catch{}
      try{await recoverManual()}catch{}
    }
    const s=await (await store()).read();
    if(!s.ok)return s;
    let manual=null,lastManual=null;try{manual=await readManual();lastManual=await readLastManual()}catch{}
    const qualified=row=>row?.status==='BROWSER_REPORTED_COMPLETE'&&row.tier===2&&
      /^manual_[a-f0-9]{32}$/.test(row.runId||'')&&/^[a-f0-9]{64}$/.test(row.sha256||'')&&
      Number.isSafeInteger(row.bytes)&&row.bytes>0;
    if(!qualified(lastManual))lastManual=qualified(manual)?manual:null;
    const clean=row=>row?{status:row.status,code:row.code||row.status,tier:row.tier||0,
      bytes:row.bytes||0,runId:row.runId,sha256:row.sha256||null,
      startedAt:row.startedAt||null,updatedAt:row.updatedAt||null,
      completedAt:row.completedAt||row.updatedAt||null}:null;
    const daily=s.state.archives.filter(a=>a.kind==='AUTO'&&a.state==='COMPLETE'&&
      /\.pcms\.jsonl$/i.test(a.filename||'')).map(a=>({kind:'DAILY',runId:a.runId,
        bytes:a.bytes,sha256:a.sha256,completedAt:a.completedAt||null,day:a.day,
        precision:a.completedAt?'MILLISECOND':'DAY',tier:2,diskReadback:false}));
    const successes=[...daily,...(lastManual?[{...clean(lastManual),kind:'MANUAL',
      day:Math.floor((lastManual.completedAt||lastManual.updatedAt||lastManual.startedAt||0)/DAY),
      precision:lastManual.completedAt||lastManual.updatedAt?'MILLISECOND':'DAY',
      tier:2,diskReadback:false}]:[])].sort((a,b)=>(b.completedAt??b.day*DAY)-(a.completedAt??a.day*DAY));
    return {...safeStatus(s.state),format:'PORTABLE',passwordRequired:false,
      guarantee:'SOURCE_COMPLETE_PLAIN_BROWSER_ARCHIVE',
      manual:clean(manual),lastSuccess:successes[0]||null};
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
    if(['DISPATCH_POSSIBLE','DOWNLOAD_STARTED'].includes(a.status)){
      const row=await locatePortableDownload(api.downloads,a);
      if(!row)return fail('DOWNLOAD_OUTCOME_UNKNOWN');
      const proof=await observe(api.downloads,{runId:a.runId,day:a.day,
        sha256:a.sha256,bytes:a.bytes,id:row.id});
      if(!proof||proof.downloadId!==row.id||proof.runId!==a.runId||
         proof.sha256!==a.sha256||proof.bytes!==a.bytes)return fail('DOWNLOAD_OUTCOME_UNKNOWN');
      if(a.status==='DISPATCH_POSSIBLE'){
        const identified=await s.move(a.runId,a.status,'DOWNLOAD_STARTED',{downloadId:row.id});
        if(!identified.ok)return identified;
      }
      const done=await s.move(a.runId,'DOWNLOAD_STARTED','COMPLETE',{archive:proof});
      if(done.ok)await completeOriginals(await db(),{runId:a.runId,sha256:a.sha256,bytes:a.bytes,browserCompleted:true});
      return done;
    }
    return fail('BACKUP_INFLIGHT');
  }
  async function tick(){
    if(pending)return pending;
    if(manualTask||inspection)return fail('BACKUP_INFLIGHT');
    pending=(async()=>{
      let runId=null,url=null,s=null;
      try{
        if((await sentinel.inspect()).held)return fail('BACKUP_RESTORE_HOLD');
        s=await store();
        const retention=makeRetention(s,api.downloads);
        await retention.recover();
        const recovery=await reconcile(s);
        if(!recovery.ok)return recovery;
        if((await s.read()).state.enabled)await retention.prune();
        runId='auto_'+nextId();
        const claim=await s.claim(runId,clock());
        if(!claim.ok)return claim;
        let archive;
        try{archive=await capture(api,await db(),sentinel);}
        catch(e){await s.move(runId,'PREPARING','FAILED',{code:explain(e)});
          return fail(explain(e));}
        const fileHash=await sha(archive.blob);
        await prepareOriginals(await db(),archive,runId,fileHash);
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
        await completeOriginals(await db(),{runId,sha256:fileHash,bytes:archive.bytes,browserCompleted:true});
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
  async function inspectArchive(){
    if(inspection)return inspection;
    if(pending||manualTask)return fail('BACKUP_INFLIGHT');
    inspection=(async()=>{
      try{
        if((await sentinel.inspect()).held)return fail('BACKUP_RESTORE_HOLD');
        const archive=await capture(api,await db(),sentinel);
        if(!(archive?.blob instanceof Blob)||archive.bytes!==archive.blob.size)
          return fail('BACKUP_ARCHIVE_UNVERIFIED');
        const opened=await readPortableArchive(archive.blob);
        if(opened.integrity!=='FRAME_AND_SOURCE_VERIFIED'||
           JSON.stringify(opened.archiveSourceAudit)!==JSON.stringify(archive.sourceAudit))
          return fail('BACKUP_ARCHIVE_UNVERIFIED');
        return {ok:true,code:'IN_MEMORY_SOURCE_AND_DONOR_VERIFIED',
          format:'PORTABLE',passwordRequired:false,bytes:archive.bytes,
          sha256:await sha(archive.blob),sourceAudit:opened.archiveSourceAudit,
          checkedAt:clock(),diskReadback:false,downloads:0,providerEffects:'OFF'};
      }catch(e){return fail(explain(e))}
    })();
    try{return await inspection}finally{inspection=null}
  }
  async function inspectRestore(){
    if(pending||manualTask||inspection)return fail('BACKUP_INFLIGHT');
    inspection=(async()=>{
      try{
        if((await sentinel.inspect()).held)return fail('BACKUP_RESTORE_HOLD');
        const archive=await capture(api,await db(),sentinel);
        return await inspectDisposableRestore(archive);
      }catch(e){return fail(explain(e))}
    })();
    try{return await inspection}finally{inspection=null}
  }
  async function ownsPreparation(owner){
    if(!owner||!/^restore_[a-f0-9]{32}$/.test(owner.epoch||'')||
       !Number.isSafeInteger(owner.revision)||!/^portable_[a-f0-9]{32}$/.test(owner.stageScope||''))return false;
    const row=(await api.storage.local.get('pcmsRestoreInProgress'))?.pcmsRestoreInProgress;
    return row?.active===true&&row.status==='PREPARING'&&row.epoch===owner.epoch&&
      row.revision===owner.revision&&row.stageScope===owner.stageScope&&
      !Object.keys(row.groups||{}).length&&!Object.keys(row.createdContainers||{}).length;
  }
  async function manual(preparation=null){
    if(preparation&&!(await ownsPreparation(preparation)))return fail('BACKUP_RESTORE_HOLD');
    if(manualTask||pending||inspection)return fail('BACKUP_INFLIGHT');
    manualTask=(async()=>{
      let url=null,runId=null,possible=false,receipt=null,startedAt=null;
      let verifiedBytes=null,verifiedSha256=null;
      try{
        if(preparation?!await ownsPreparation(preparation):(await sentinel.inspect()).held)
          return fail('BACKUP_RESTORE_HOLD');
        // A prior possible download must be observed before another local
        // export. A lost browser ACK is not evidence that nothing happened.
        const previous=await readManual();
        if(previous&&['DISPATCH_POSSIBLE','DOWNLOAD_STARTED','HELD_UNCERTAIN'].includes(previous.status)){
          // Return the observed original. A deliberate new export is a later action.
          return preparation?await recoverManual(preparation):await recoverManual();
        }
        if(previous&&['PREPARING','INTERNAL_VERIFIED'].includes(previous.status)&&
          clock()-(previous.updatedAt||previous.startedAt||clock())<keepAliveMs)
          return fail('BACKUP_INFLIGHT');
        runId='manual_'+nextId();startedAt=clock();
        await recordManual({runId,status:'PREPARING',tier:0,
          startedAt,purpose:preparation?'RESTORE_CHECKPOINT':'MANUAL',preparationEpoch:preparation?.epoch||null,code:'PREPARING'});
        const ownedSentinel=preparation?{inspect:async()=>({held:!await ownsPreparation(preparation)})}:sentinel;
        const archive=await capture(api,await db(),ownedSentinel);
        const fileHash=await sha(archive.blob);
        if(!preparation)await prepareOriginals(await db(),archive,runId,fileHash);
        verifiedBytes=archive.bytes;verifiedSha256=fileHash;
        await recordManual({runId,status:'INTERNAL_VERIFIED',tier:1,
          purpose:preparation?'RESTORE_CHECKPOINT':'MANUAL',preparationEpoch:preparation?.epoch||null,sha256:fileHash,bytes:archive.bytes,startedAt});
        if(preparation?!await ownsPreparation(preparation):(await sentinel.inspect()).held)throw Error('BACKUP_RESTORE_HOLD');
        // Persist possible-download intent before irreversible browser dispatch.
        await recordManual({runId,status:'DISPATCH_POSSIBLE',tier:1,
          purpose:preparation?'RESTORE_CHECKPOINT':'MANUAL',preparationEpoch:preparation?.epoch||null,sha256:fileHash,bytes:archive.bytes,startedAt});
        possible=true;
        receipt=await dispatch(api,archive,{runId,manual:true});
        url=receipt.objectUrl;
        await recordManual({runId,status:'DOWNLOAD_STARTED',tier:1,
          purpose:preparation?'RESTORE_CHECKPOINT':'MANUAL',preparationEpoch:preparation?.epoch||null,sha256:fileHash,bytes:archive.bytes,downloadId:receipt.downloadId,
          startedAt});
        const proof=await awaitManual(api.downloads,receipt.downloadId,archive.bytes,runId);
        if(!proof)throw Error('DOWNLOAD_OUTCOME_UNKNOWN');
        await recordManual({runId,status:'BROWSER_REPORTED_COMPLETE',tier:2,
          purpose:preparation?'RESTORE_CHECKPOINT':'MANUAL',preparationEpoch:preparation?.epoch||null,sha256:fileHash,bytes:archive.bytes,downloadId:receipt.downloadId,
          startedAt,code:'BROWSER_REPORTED_COMPLETE',completedAt:clock()});
        if(!preparation)await completeOriginals(await db(),{runId,sha256:fileHash,bytes:archive.bytes,browserCompleted:true});
        return {ok:true,code:'BROWSER_REPORTED_COMPLETE',tier:2,
          purpose:preparation?'RESTORE_CHECKPOINT':'MANUAL',preparationEpoch:preparation?.epoch||null,sha256:fileHash,bytes:archive.bytes,runId,
          downloadId:receipt.downloadId,diskReadback:false};
      }catch(e){
        if(runId){
          const code=possible?'DOWNLOAD_OUTCOME_UNKNOWN':explain(e);
          // Preserve the independently verified size/digest even when the
          // Downloads API reports interruption or its ACK is lost. Without
          // these fields subsequent read-only reconciliation is impossible.
          try{await recordManual({runId,status:possible?'HELD_UNCERTAIN':'FAILED',
            tier:possible?1:0,purpose:preparation?'RESTORE_CHECKPOINT':'MANUAL',preparationEpoch:preparation?.epoch||null,startedAt,bytes:verifiedBytes,sha256:verifiedSha256,
            downloadId:receipt?.downloadId??null,code});}catch{}
        }
        return fail(possible?'DOWNLOAD_OUTCOME_UNKNOWN':explain(e));
      }finally{if(url)URL.revokeObjectURL(url);}
    })();
    try{return await manualTask;}finally{manualTask=null;}
  }
  status=checkpointed(api,status,{allowDuringRestore:true});
  tick=checkpointed(api,tick);
  manual=checkpointed(api,manual,{allowDuringRestore:owner=>!!owner});
  recoverManual=checkpointed(api,recoverManual,{allowDuringRestore:owner=>!!owner});
  inspectArchive=checkpointed(api,inspectArchive);
  inspectRestore=checkpointed(api,inspectRestore);
  return Object.freeze({
    status,tick,manual:()=>manual(),checkpoint:owner=>manual(owner),recoverManual,inspectArchive,inspectRestore,requestOriginalCheckpoint:()=>manual(),recover:checkpointed(api,async()=>reconcile(await store())),
    enable:checkpointed(api,async value=>{
      const s=await store(),out=await s.enabled(value);
      if(out.ok&&value)void tick();
      return out;
    }),
    requestFreshAfterRemoval:checkpointed(api,async()=>{
      const s=await store(),out=await s.requestFresh('ACCOUNT_REMOVED',clock());
      if(!out.ok)return out;
      if(!out.enabled)return fail('AUTO_BACKUP_NOT_ENABLED');
      void tick();
      return {ok:true,code:'FRESH_BACKUP_REQUESTED'};
    })
  });
}
