// I15: unattended encryption via operator's OS vault, never default/local
// key material. Background-only. No Perchance, Mullvad or Git effects.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {vaultResponse,VAULT_HOST,safeStatus} from './backup-auto-core.mjs';
import {createAutoStore} from './backup-auto-store.mjs';
import {makeRetention} from './backup-auto-retention.mjs';
import {inspectAuto,awaitAuto} from './backup-auto-download.mjs';
import {sealAutomatic,captureV2SourceCut} from './backup-auto-export.mjs';
import {exportV2Candidate} from './backup-v2-session.mjs';
const fail=code=>({ok:false,code});
const sanitize=e=>/^[A-Z_]{4,60}$/.test(e?.message||'')?e.message:'BACKUP_FAILED';
export function createAutoRunner(api,{open=openCanonicalDatabase,clock=Date.now,
  newId=()=>crypto.randomUUID().replaceAll('-',''),
  native=msg=>api.runtime.sendNativeMessage(VAULT_HOST,msg),
  seal=sealAutomatic,
  // Not supplied by production until independent E-06 review. This is a
  // protected coordinator injection, never a UI message or stored toggle.
  reviewedV2=()=>false,captureV2=captureV2SourceCut,
  dispatchV2=exportV2Candidate}={}){
  let dbPromise=null,task=null;
  const sentinel=createRestoreSentinel(api.storage.local);
  const database=()=>dbPromise ||= open().catch(e=>{dbPromise=null;throw e;});
  const store=async()=>createAutoStore(await database(),clock);
  const status=async()=>{const current=await (await store()).read();
    return current.ok?safeStatus(current.state):current;};
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
              sha256:'0'.repeat(64),bytes:0});
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
              checkScope:async()=>!(await sentinel.inspect()).held &&
                (await s.read()).state?.active?.runId===runId,
              checkRestoreHold:async()=>(await sentinel.inspect()).held
            });
            // Even a valid full-disk GCM receipt is NOT a source-complete,
            // independently applied, successfully restorable daily archive.
            const held=await s.move(runId,'DISPATCH_POSSIBLE','HELD',{
              code:v2?.state==='AUTHENTICATED_INVENTORY_ONLY'?
                'V2_NATIVE_INVENTORY_ONLY':'V2_NATIVE_RESULT_UNKNOWN'});
            if(!held.ok)return held;
            return fail('BACKUP_V2_FULL_RECOVERY_PENDING');
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
    })().finally(()=>{task=null;});
    return task;
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
    tick,status,setVault,
    enable:async enabled=>{
      const s=await store(),result=await s.enabled(enabled);
      if(result.ok&&enabled)void tick();return result;
    },
    recover:async()=>reconcile(await store())
  });
}
