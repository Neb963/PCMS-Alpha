// I15: unattended encryption via operator's OS vault, never default/local
// key material. Background-only. No Perchance, Mullvad or Git effects.
import {openCanonicalDatabase,createRestoreSentinel,createCanonicalStore} from './journal.mjs';
import {createNoticeDispatcher} from './notices.mjs';
import {vaultResponse,VAULT_HOST,safeStatus} from './backup-auto-core.mjs';
import {createAutoStore} from './backup-auto-store.mjs';
import {makeRetention} from './backup-auto-retention.mjs';
import {inspectAuto,awaitAuto} from './backup-auto-download.mjs';
import {sealAutomatic,captureV2SourceCut} from './backup-auto-export.mjs';
import {exportV2Candidate,createV2NativeConnection} from './backup-v2-session.mjs';
import {verifyV2StoredArchive} from './backup-v2-verify.mjs';
import {digest} from './backup-core.mjs';
const fail=code=>({ok:false,code});
// Operator-selected archive format. V2 is the source-complete native archive
// (full source bytes, native encryption, authenticated full readback and
// native 14-success retention). V1 is the legacy encrypted browser download,
// which does NOT guarantee source completeness. Selecting V2 is an explicit
// local setup step, never inferred, and is revoked by a restore hold.
export const BACKUP_FORMAT_KEY='pcmsBackupFormat';
export const FORMAT_GUARANTEE=Object.freeze({
  V1:'LEGACY_ENCRYPTED_DOWNLOAD_NOT_SOURCE_COMPLETE',
  V2:'SOURCE_COMPLETE_NATIVE_AUTHENTICATED_READBACK'});
export function operatorSelectedV2(api){
  return async()=>{
    try{
      const v=(await api.storage.local.get(BACKUP_FORMAT_KEY))?.[BACKUP_FORMAT_KEY];
      const held=(await api.storage.local.get('pcmsRestoreInProgress'))?.pcmsRestoreInProgress;
      return v?.schema===1&&v.format==='V2'&&!held;
    }catch{return false;}
  };
}
const sanitize=e=>/^[A-Z_]{4,60}$/.test(e?.message||'')?e.message:'BACKUP_FAILED';
export function createAutoRunner(api,{open=openCanonicalDatabase,clock=Date.now,
  newId=()=>crypto.randomUUID().replaceAll('-',''),
  native=msg=>api.runtime.sendNativeMessage(VAULT_HOST,msg),
  seal=sealAutomatic,
  // Production passes operatorSelectedV2(api): explicit local operator setup
  // after a native-host health check (setFormat). Tests inject directly.
  reviewedV2=()=>false,captureV2=captureV2SourceCut,
  probeV2=async()=>{const port=createV2NativeConnection(api);
    try{return await port.exchange({action:'resource.inspect'});}
    finally{port.close();}},
  dispatchV2=exportV2Candidate,verifyV2=verifyV2StoredArchive,
  nativeRetention=async()=>{const port=createV2NativeConnection(api);
    try{return await port.exchange({action:'archive.retention.prune'});}
    finally{port.close();}}
}={}){
  let dbPromise=null,task=null,manualTask=null;
  const sentinel=createRestoreSentinel(api.storage.local);
  const database=()=>dbPromise ||= open().catch(e=>{dbPromise=null;throw e;});
  const store=async()=>createAutoStore(await database(),clock);
  const status=async()=>{const current=await (await store()).read();
    if(!current.ok)return current;
    let stored=null;
    try{stored=(await api.storage.local.get(BACKUP_FORMAT_KEY))?.[BACKUP_FORMAT_KEY];}catch{}
    const format=await reviewedV2()===true||(stored?.schema===1&&stored.format==='V2')?'V2':'V1';
    return {...safeStatus(current.state),format,guarantee:FORMAT_GUARANTEE[format]};};
  async function setFormat(format){
    if(!['V1','V2'].includes(format))return fail('INVALID_FORMAT');
    if((await sentinel.inspect()).held)return fail('BACKUP_RESTORE_HOLD');
    if(task||manualTask)return fail('BACKUP_INFLIGHT');
    if(format==='V2'){
      // Prove the installed native v2 host and the OS vault respond before
      // switching. Missing setup is reported, never silently downgraded.
      let probe;try{probe=await probeV2();}catch{probe=null;}
      if(probe?.ok!==true)return fail('BACKUP_V2_HOST_UNAVAILABLE');
      let key;try{key=vaultResponse(await native({action:'get'}));}catch{key=null;}
      if(!key?.ok)return fail('SUSPENDED_KEY_UNAVAILABLE');
    }
    await api.storage.local.set({[BACKUP_FORMAT_KEY]:{schema:1,format,changedAt:clock()}});
    return status();
  }
  async function reconcile(s){
    const read=await s.read();if(!read.ok)return read;
    const a=read.state.active;
    if(!a)return {ok:true};
    if(['PREPARING','VERIFIED'].includes(a.status)){
      // No external download was possible before the durable dispatch marker.
      if(clock()-a.startedAt>=10*60000)
        return s.move(a.runId,a.status,'FAILED',{code:'INTERRUPTED_BEFORE_DOWNLOAD'});
      return fail('BACKUP_INFLIGHT');
    }
    if(a.status==='DISPATCH_POSSIBLE')return fail('DOWNLOAD_OUTCOME_UNKNOWN');
    if(a.status==='DOWNLOAD_STARTED'){
      const proof=await inspectAuto(api.downloads,{runId:a.runId,day:a.day,
        sha256:a.sha256,bytes:a.bytes,id:a.downloadId});
      if(proof)return s.move(a.runId,'DOWNLOAD_STARTED','COMPLETE',{archive:proof});
      return s.move(a.runId,'DOWNLOAD_STARTED','HELD',{code:'DOWNLOAD_OUTCOME_UNKNOWN'});
    }
    return fail('BACKUP_INFLIGHT');
  }
  async function tick(){
    if(manualTask)return fail('BACKUP_INFLIGHT');
    if(task)return task;
    task=(async()=>{
      try{
        if((await sentinel.inspect()).held)return fail('BACKUP_RESTORE_HOLD');
        const s=await store(),retention=makeRetention(s,api.downloads);
        await retention.recover();
        const recovered=await reconcile(s);
        if(!recovered.ok)return recovered;
        const runId='auto_'+newId(),now=clock();
        const claimed=await s.claim(runId,now);
        if(!claimed.ok)return claimed;
        // S02 uses the EXISTING daily admission/claim, vault and restart
        // policy. Only a separately reviewed background authority can switch
        // format; the installed boundary intentionally supplies no such token.
        // Native AUTHENTICATED_INVENTORY_ONLY never advances lastSuccessDay,
        // never enters v1 Downloads retention, and remains HELD pending full
        // donor + fresh-profile recovery and independent E-06 approval.
        if(await reviewedV2()===true){
          let attemptedNative=false;
          try{
            const key=vaultResponse(await native({action:'get'}));
            if(!key.ok){
              await s.move(runId,'PREPARING','SUSPENDED',{
                code:'SUSPENDED_KEY_UNAVAILABLE'});
              return fail('SUSPENDED_KEY_UNAVAILABLE');
            }
            const cut=await captureV2(api,await database(),key.passphrase,sentinel);
            const prepared=await s.move(runId,'PREPARING','VERIFIED',{
              // A real donor-envelope byte digest, not an invented disk proof.
              sha256:await digest(cut.donorEnvelope),
              bytes:new TextEncoder().encode(cut.donorEnvelope).byteLength});
            if(!prepared.ok)return prepared;
            if((await sentinel.inspect()).held){
              await s.move(runId,'VERIFIED','FAILED',{code:'BACKUP_RESTORE_HOLD'});
              return fail('BACKUP_RESTORE_HOLD');
            }
            const marked=await s.move(runId,'VERIFIED','DISPATCH_POSSIBLE');
            if(!marked.ok)return marked;
            attemptedNative=true;
            const v2=await dispatchV2({
              db:await database(),api,pcms:cut.pcms,
              donorEnvelope:cut.donorEnvelope,
              runId:'s02_'+runId.slice(5),
              checkScope:async()=>!(await sentinel.inspect()).held &&
                (await s.read()).state?.active?.runId===runId,
              checkRestoreHold:async()=>(await sentinel.inspect()).held
            });
            // Only actual host-file re-open, full typed source/donor
            // restoration in ephemeral-key staging and a second run-bound
            // native receipt can qualify a successful automatic archive.
            if(v2?.ok!==true||v2?.state!=='AUTHENTICATED_INVENTORY_ONLY')
              throw Error('BACKUP_V2_NATIVE_RESULT_UNKNOWN');
            const recovered=await verifyV2({
              api,db:await database(),runId:v2.runId,
              password:key.passphrase,
              assertNotRestoring:async()=>!(await sentinel.inspect()).held
            });
            if(recovered?.ok!==true||recovered.state!=='RECOVERY_VERIFIED'||
               recovered.runId!==v2.runId||
               recovered.sha256!==v2.ciphertextSha256||
               !/^[a-f0-9]{64}$/.test(recovered.preparedSha256||''))
              throw Error('BACKUP_V2_RECOVERY_UNVERIFIED');
            const certified=await s.move(runId,'DISPATCH_POSSIBLE','COMPLETE',{
              archive:{kind:'AUTO_NATIVE',runId,nativeRunId:v2.runId,
                sha256:recovered.sha256,
                preparedSha256:recovered.preparedSha256,
                day:claimed.day,tier:3,state:'COMPLETE',
                bytes:v2.plaintextBytes+66}
            });
            if(!certified.ok)return certified;
            // Native retention is distinct from legacy Downloads, but reuses
            // the same daily success and last-known-good controller. An
            // uncertain file removal never disqualifies the last good archive.
            try{await nativeRetention()}catch{}
            return {ok:true,code:'NATIVE_READONLY_SOURCE_RECOVERY'};
          }catch(e){
            const code=attemptedNative?'V2_NATIVE_OUTCOME_UNKNOWN':
              sanitize(e);
            if(attemptedNative)await s.move(runId,'DISPATCH_POSSIBLE','HELD',{code});
            else await s.move(runId,'PREPARING','FAILED',{code});
            return fail(code);
          }
        }
        let passphrase;
        try{
          let response;try{response=await native({action:'get'});}
          catch{response={ok:false,code:'UNAVAILABLE'};}
          const key=vaultResponse(response);
          if(!key.ok){
            await s.move(runId,'PREPARING','SUSPENDED',{code:
              key.code==='VAULT_PROTOCOL_INVALID'?'VAULT_PROTOCOL_INVALID':'SUSPENDED_KEY_UNAVAILABLE'});
            return fail('SUSPENDED_KEY_UNAVAILABLE');
          }
          passphrase=key.passphrase;
        }catch{
          await s.move(runId,'PREPARING','SUSPENDED',{code:'SUSPENDED_KEY_UNAVAILABLE'});
          return fail('SUSPENDED_KEY_UNAVAILABLE');
        }
        let archive;
        try{archive=await seal(api,await database(),passphrase,sentinel);}
        catch(e){await s.move(runId,'PREPARING','FAILED',{code:sanitize(e)});
          return fail(sanitize(e));}
        finally{passphrase=undefined;}
        const verified=await s.move(runId,'PREPARING','VERIFIED',
          {sha256:archive.sha256,bytes:archive.bytes.byteLength});
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
          state.status='DISPATCH_POSSIBLE';state.code='DOWNLOAD_POSSIBLE';
          return {state,response:{ok:true}};
        });
        if(!fenced.ok)return fenced;
        let url=null,id;
        try{
          url=URL.createObjectURL(new Blob([archive.bytes],{type:'application/octet-stream'}));
          id=await api.downloads.download({
            url,filename:'pcms-backups/pcms-alpha-'+runId+'.encrypted',
            conflictAction:'uniquify',saveAs:false});
        }catch{
          await s.move(runId,'DISPATCH_POSSIBLE','HELD',{code:'DOWNLOAD_OUTCOME_UNKNOWN'});
          return fail('DOWNLOAD_OUTCOME_UNKNOWN');
        }
        if(!Number.isSafeInteger(id)||id<0){
          await s.move(runId,'DISPATCH_POSSIBLE','HELD',{code:'DOWNLOAD_ID_INVALID'});
          return fail('DOWNLOAD_ID_INVALID');
        }
        const started=await s.move(runId,'DISPATCH_POSSIBLE','DOWNLOAD_STARTED',{downloadId:id});
        if(!started.ok)return started;
        let proof=null;
        try{proof=await awaitAuto(api.downloads,{runId,day:claimed.day,sha256:archive.sha256,
          bytes:archive.bytes.byteLength,id});}
        finally{if(url)URL.revokeObjectURL(url);}
        if(!proof){
          await s.move(runId,'DOWNLOAD_STARTED','HELD',{code:'DOWNLOAD_OUTCOME_UNKNOWN'});
          return fail('DOWNLOAD_OUTCOME_UNKNOWN');
        }
        const finished=await s.move(runId,'DOWNLOAD_STARTED','COMPLETE',{archive:proof});
        if(!finished.ok)return finished;
        await retention.prune();
        return {ok:true,code:'BROWSER_REPORTED_COMPLETE'};
      }catch{return fail('BACKUP_INTERNAL_ERROR');}
    })().then(async result=>{await reportIncident(result);return result;})
      .finally(()=>{task=null;});
    return task;
  }
  // C-68/C-69: one backup incident; resolved only by a verified successful
  // archive. Not-due/disabled/in-flight outcomes are not failures.
  const NOT_FAILURE=new Set(['AUTO_OFF','BACKUP_ALREADY_DONE','BACKUP_COOLDOWN',
    'BACKUP_INFLIGHT','BACKUP_INFLIGHT_OR_UNCERTAIN','BACKUP_RESTORE_HOLD']);
  async function reportIncident(result){
    try{
      const d=createNoticeDispatcher(api,createCanonicalStore(await database()));
      if(result?.ok&&['NATIVE_READONLY_SOURCE_RECOVERY','BROWSER_REPORTED_COMPLETE'].includes(result.code))
        await d.resolve({scopeId:'backup_automatic',code:'BACKUP_FAILED',evidence:'BACKUP_VERIFIED_COMPLETE'});
      else if(result&&!result.ok&&!NOT_FAILURE.has(result.code))
        await d.emit({scopeId:'backup_automatic',code:'BACKUP_FAILED',severity:'ACTION_REQUIRED',
          revision:Math.max(1,clock())});
    }catch{/* dashboard status still shows the outcome */}
  }
  // Manual source-complete v2 export shares I15's source cut, OS-vault
  // lookup, restore sentinel and same native ledger; no second scheduler.
  // Not wired into an operator command before independent E-06 review.
  // Same reviewed background coordinator as I15 daily. The privileged
  // admission token is injectable only by trusted construction; production
  // always supplies false until E-06 approval. No UI/stored toggle enables it.
  async function manualV2Candidate(){
    if(task||manualTask)return fail('BACKUP_INFLIGHT');
    manualTask=(async()=>{
      if(await reviewedV2()!==true)return fail('BACKUP_V2_REVIEW_REQUIRED');
      let dispatched=false;
      try{
        if((await sentinel.inspect()).held)return fail('BACKUP_RESTORE_HOLD');
        const key=vaultResponse(await native({action:'get'}));
        if(!key.ok)return fail('SUSPENDED_KEY_UNAVAILABLE');
        const db=await database();
        const cut=await captureV2(api,db,key.passphrase,sentinel);
        const runId='s02_'+newId();
        dispatched=true;
        const receipt=await dispatchV2({
          db,api,pcms:cut.pcms,donorEnvelope:cut.donorEnvelope,runId,
          checkScope:async()=>!(await sentinel.inspect()).held,
          checkRestoreHold:async()=>(await sentinel.inspect()).held
        });
        if(receipt?.ok!==true||receipt.runId!==runId||
           receipt.state!=='AUTHENTICATED_INVENTORY_ONLY')
          throw Error('BACKUP_V2_NATIVE_OUTCOME_UNKNOWN');
        const verified=await verifyV2({
          api,db,runId,password:key.passphrase,
          assertNotRestoring:async()=>!(await sentinel.inspect()).held
        });
        if(verified?.ok!==true||verified.runId!==runId||
           verified.state!=='RECOVERY_VERIFIED'||
           verified.sha256!==receipt.ciphertextSha256||
           !/^[a-f0-9]{64}$/.test(verified.preparedSha256||''))
          throw Error('BACKUP_V2_RECOVERY_UNVERIFIED');
        return {ok:true,runId,state:'RECOVERY_VERIFIED',
          code:'NATIVE_SOURCE_AND_DONOR_RECOVERY_VERIFIED',
          ciphertextSha256:verified.sha256,
          preparedSha256:verified.preparedSha256,
          sourceRows:verified.sourceRows,retentionSuccess:false,
          activation:'OFF',providerEffects:'OFF'};
      }catch(e){
        // A possible native file effect always remains journal-held. Never
        // retry or silently fall back to a legacy/manual download.
        return fail(dispatched?'V2_NATIVE_OUTCOME_UNKNOWN':sanitize(e));
      }
    })();
    try{return await manualTask;}
    finally{manualTask=null;}
  }
  async function setVault(secret){
    if(typeof secret!=='string'||secret.length<12||
      new TextEncoder().encode(secret).length>4096)return fail('INVALID_RECOVERY_PASSPHRASE');
    let result;
    try{result=await native({action:'set',passphrase:secret});}
    catch{return fail('VAULT_UNAVAILABLE');}
    if(result?.ok!==true||Object.keys(result).length!==1)
      return fail('VAULT_UNAVAILABLE');
    return {ok:true,code:'VAULT_STORED_OPERATOR_RECOVERY_REQUIRED'};
  }
  return Object.freeze({
    tick,status,setVault,manualV2Candidate,setFormat,
    // C-75: called after a completed permanent account removal. The removal
    // stays in force whatever this backup's outcome; the request persists
    // until a backup started after it completes.
    async requestFreshAfterRemoval(){
      const s=await store();
      const req=await s.requestFresh('ACCOUNT_REMOVED',clock());
      if(!req.ok)return req;
      if(!req.enabled)return fail('AUTO_BACKUP_NOT_ENABLED');
      void tick();
      return {ok:true,code:'FRESH_BACKUP_REQUESTED'};
    },
    enable:async enabled=>{
      const s=await store(),result=await s.enabled(enabled);
      if(result.ok&&enabled)void tick();return result;
    },
    recover:async()=>reconcile(await store())
  });
}
