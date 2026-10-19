// S05: a bounded production-workflow adapter for the existing catalog watcher.
// This is not a second coordinator or a source writer. Every decision reads
// canonical I13/I09/I10/READY journals; every action invokes their real
// privileged boundary and revalidates identity. ONE transition per tick.
// D/B fixtures may inject effect gates; the production default is fail-closed.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {createReadyStore} from './ready-store.mjs';
import {createStagingStore} from './staging-store.mjs';
import {createAiStore} from './ai-store.mjs';
import {createExistingStore} from './existing-update-store.mjs';
import {createReadyOperator} from './ready-operator.mjs';
import {createStagingBoundary} from './staging-boundary.mjs';
import {createExistingBoundary} from './existing-update-boundary.mjs';
import {createAiBoundary} from './ai-boundary.mjs';
import {planAiStep} from './ai-supervisor.mjs';
import {AI_BROWSER_ASSERTIONS} from './perchance-ai-oracle.mjs';
const fail=code=>({ok:false,code});
const possible=new Set(['UNLIST_DISPATCH_POSSIBLE','UNLIST_UNCERTAIN',
  'STAGE_DISPATCH_POSSIBLE','STAGE_UNCERTAIN']);
const stagePossible=new Set(['DISPATCH_POSSIBLE','HELD_UNCERTAIN','SAVED_UNVERIFIED']);
const stillRunning=new Set(['DISPATCH_POSSIBLE','RUNNING_OBSERVED']);
export function planReadyDevelopment({ready,stage,existing,job,visibility,effects=false}){
 if(!ready?.ok)return fail('S05_READY_NOT_OBSERVED');
 const r=ready.record,candidate=r.desired||r.active;
 if(!candidate||['OPERATOR_PAUSED','READY_REVOKED_NOT_READY'].includes(r.hold))
   return fail(r.hold||'S05_READY_NO_CURRENT_CANDIDATE');
 // A newer candidate never steals an in-flight old writer. First reconcile
 // any possible dispatch. Once the old helper is observed running, request
 // exactly one guarded STOP, then wait for independent saved-F idle proof.
 if(r.desired&&r.active&&stage?.ok&&job?.ok&&
    stage.record.readyIdentifier===r.active.identifier&&
    job.job.stageRevision===stage.record.revision&&
    job.job.state!=='HUMAN_OWNED'){
   if(job.job.native?.state==='DISPATCH_POSSIBLE')
     return {ok:true,type:'PROBE_OLDER_NATIVE'};
   if(job.job.native?.state==='RUNNING_OBSERVED')
     return {ok:true,type:effects?'STOP_OLDER_NATIVE':'HOLD',
       code:'S05_OLDER_NATIVE_STOP_ACTIVATION_HELD'};
 }
 if(existing?.ok){
   const s=existing.record?.state;
   if(s==='PREPARED')
     return {ok:true,type:effects?'UNLIST':'HOLD',code:'S05_UNLIST_ACTIVATION_HELD'};
   if(s==='UNLIST_DISPATCH_POSSIBLE'||s==='UNLIST_UNCERTAIN')
     return {ok:true,type:'RECHECK_UNLIST'};
   if(s==='UNLIST_CONFIRMED'){
     if(!existing.record.stagedFingerprint)
       return {ok:true,type:'PIN_STAGE'};
     // I13 must perform the guarded source replacement even if an I09
     // retained stage is SOURCE_VERIFIED from the preceding candidate.
     // Its own STAGE canonical marker decides when replacement happened.
     return {ok:true,type:effects?'STAGE':'HOLD',
       code:'S05_STAGE_ACTIVATION_HELD'};
   }
   if(s==='STAGE_DISPATCH_POSSIBLE'||s==='STAGE_UNCERTAIN')
     return {ok:true,type:'RECHECK_STAGE'};
   if(s==='STAGE_CONFIRMED'&&stage?.record?.state!=='SOURCE_VERIFIED')
     return fail('S05_SOURCE_VERIFICATION_REQUIRED');
   if(s==='STAGE_CONFIRMED'&&r.desired&&stage?.record?.state==='SOURCE_VERIFIED'&&
      stage.record.readyIdentifier!==r.desired.identifier)
     return {ok:true,type:'PIN_STAGE'};
   if(['RESTORE_DISPATCH_POSSIBLE','RESTORE_UNCERTAIN',
        'RECOVERY_UNLIST_DISPATCH_POSSIBLE','RECOVERY_UNLIST_UNCERTAIN',
        'RECOVERY_UNLIST_CONFIRMED','RESTORE_CONFIRMED'].includes(s))
     return fail('S05_RECOVERY_REVIEW_REQUIRED');
 }
 if(stage?.ok&&stage.record?.readyIdentifier===candidate.identifier&&
    stage.record?.readyInputFingerprint===candidate.inputFingerprint){
   if(stagePossible.has(stage.record.state))
     return {ok:true,type:'RECONCILE_STAGE'};
   if(stage.record.state==='PINNED')
     return {ok:true,type:effects?'STAGE_PRIVATE':'HOLD',
       code:'S05_STAGE_ACTIVATION_HELD'};
   if(stage.record.state==='SOURCE_VERIFIED'){
     if(!job?.ok||job.job?.stageRevision!==stage.record.revision)
       return {ok:true,type:'PREPARE_JOB'};
     if(job.job.state==='TESTS_VERIFIED')
       return {ok:true,type:'HOLD',code:'S05_TESTED_SOURCE_AWAITS_S06_REVIEW'};
     if(job.job.state==='HUMAN_OWNED'||job.job.state==='HELD_NO_PROGRESS')
       return fail('S05_NATIVE_HUMAN_OR_TERMINAL_HOLD');
     if(stillRunning.has(job.job.native?.state))
       return {ok:true,type:'PROBE_NATIVE'};
     const next=planAiStep(job.job,{oracleNames:AI_BROWSER_ASSERTIONS});
     if(!next.ok)return fail(next.code);
     if(next.type==='PROBE_NATIVE')
       return {ok:true,type:'PROBE_NATIVE'};
     return {ok:true,type:effects?'ADVANCE_JOB':'HOLD',
       code:'S05_NATIVE_ACTIVATION_HELD'};
   }
   return fail('S05_STAGE_HUMAN_OR_RECOVERY_HOLD');
 }
 if(existing?.ok){
   if(existing.record.state==='STAGE_CONFIRMED')
     return fail('S05_PRIOR_PUBLIC_REVIEW_REQUIRED');
   return fail('S05_EXISTING_SOURCE_RECONCILIATION_REQUIRED');
 }
 if(visibility==='PUBLIC')return {ok:true,type:'PREPARE_UPDATE'};
 return {ok:true,type:'PREPARE_LOCAL'};
}
export function createReadyDevelopment(api,{
 open=openCanonicalDatabase,effectGate=()=>false,
 makeReady=()=>createReadyOperator(api),
 makeExisting=()=>createExistingBoundary(api,{effectGate}),
 makeStage=()=>createStagingBoundary(api,{effectGate}),
 makeAi=()=>createAiBoundary(api,{effectGate}),
 native=p=>api.runtime.sendNativeMessage('local.pcms.backup_vault',p),
 maxCandidates=120
}={}){
 const sentinel=createRestoreSentinel(api.storage.local);
 let busy=null,connection=null,ports=null;
 const db=()=>connection||=open().catch(e=>{connection=null;throw e;});
 const boundaries=()=>ports||=(Object.freeze({
   ready:makeReady(),existing:makeExisting(),stage:makeStage(),ai:makeAi()
 }));
 async function tick(){
  if(busy)return fail('S05_TICK_BUSY');
  busy=perform();
  try{return await busy;}finally{busy=null;}
 }
 async function perform(){
  try{
   if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
   const database=await db(),queue=createReadyStore(database),b=boundaries();
   const cursorKey='pcmsS05DevelopmentCursor';
   const statusKey='pcmsS05DevelopmentReceipt';
   const before=(await api.storage.local.get(cursorKey))?.[cursorKey];
   let after=typeof before==='string'&&
     /^[a-z0-9][a-z0-9-]{0,99}$/.test(before)?before:'',
     examined=0,lastSeen=after;
   for(let page=0;page<64&&examined<maxCandidates;page++){
    const listing=await queue.list({after,limit:Math.min(200,maxCandidates-examined)});
    if(!listing.ok)return listing;
    for(let i=0;i<listing.items.length;i++){
     const row=listing.items[i];
     examined++;lastSeen=row.slug;
     if(!row.desired&&!row.active||
        ['OPERATOR_PAUSED','READY_REVOKED_NOT_READY'].includes(row.hold))continue;
     const full=await queue.get(row.slug);
     if(!full.ok||full.record.revision!==row.revision)continue;
     const stage=await createStagingStore(database).getFull(row.slug);
     const existing=await createExistingStore(database).getFull(row.slug);
     const job=await createAiStore(database).getJobFull(row.slug);
     const inventory=await new Promise((resolve,reject)=>{
      const t=database.transaction('meta','readonly');
      const q=t.objectStore('meta').get('inventory:'+row.slug);
      q.onsuccess=()=>resolve(q.result?.generator||null);
      q.onerror=()=>reject(Error('S05_INVENTORY_READ_FAILED'));
     });
     const chosen=planReadyDevelopment({ready:full,stage,existing,job,
       visibility:inventory?.visibility,
       effects:effectGate({phase:'S05',step:'AUTO_PROGRESS',slug:row.slug})===true});
     if(!chosen.ok||chosen.type==='HOLD')continue;
     // One source-heavy step at most per wake, so wrong-owner/missing vault
     // never causes a fleet-wide unlist or series of native sends.
     let outcome;
     const slug=row.slug,params={slug};
     const nextCursor=(i+1<listing.items.length||listing.more)?slug:'';
     const held=async(code,kind='NONE')=>{
       await api.storage.local.set({
         [cursorKey]:nextCursor,
         [statusKey]:{ok:false,code,slug,step:chosen.type,
           providerEffects:kind,observedAt:Date.now()}
       });
       return {ok:false,code,slug,step:chosen.type,providerEffects:kind};
     };
     try{
     if(chosen.type==='PREPARE_LOCAL')outcome=await b.ready.runTrusted({
       type:'PREPARE_LOCAL',params:{...params,expectedRevision:row.revision}});
     else if(chosen.type==='PREPARE_UPDATE'||chosen.type==='UNLIST'||
        chosen.type==='PIN_STAGE'||chosen.type==='STAGE'){
       const vault=await native({action:'get'});
       if(!vault?.ok||typeof vault.passphrase!=='string'||
          vault.passphrase.length<12||vault.passphrase.length>256)
         return held('S05_RECOVERY_SECRET_SERVICE_UNAVAILABLE');
       if(chosen.type==='UNLIST'){
         const current=await b.ready.runTrusted({type:'ASSESS_READY',
           params:{...params,expectedRevision:row.revision}});
         if(!current?.ok||current.code!=='S05_PUBLIC_SLEEP_AND_UNLIST_REQUIRED')
           return held(current?.code||'S05_MAIN_OR_OWNER_REVALIDATION_REQUIRED');
       }
       const step=chosen.type==='PREPARE_UPDATE'?'PREPARE':chosen.type;
       outcome=await b.existing.runTrusted({type:step,params:{
         ...params,...(step!=='PREPARE'?{expectedRevision:existing.record.revision}:{}),
         passphrase:vault.passphrase
       }});
     }else if(chosen.type==='RECHECK_UNLIST'||chosen.type==='RECHECK_STAGE'){
       outcome=await b.existing.runTrusted({type:chosen.type,params:{
         ...params,expectedRevision:existing.record.revision}});
     }else if(chosen.type==='STAGE_PRIVATE'||chosen.type==='RECONCILE_STAGE'){
       outcome=await b.stage.runTrusted({type:chosen.type,params:{
         ...params,expectedRevision:stage.record.revision}});
     }else if(chosen.type==='PREPARE_JOB'){
       outcome=await b.ai.runTrusted({type:'PREPARE_JOB',params:{
         ...params,expectedStageRevision:stage.record.revision}});
     }else if(['ADVANCE_JOB','PROBE_NATIVE','PROBE_OLDER_NATIVE',
        'STOP_OLDER_NATIVE'].includes(chosen.type)){
       const type=chosen.type==='PROBE_OLDER_NATIVE'?'PROBE_NATIVE':
         chosen.type==='STOP_OLDER_NATIVE'?'BEGIN_NATIVE':chosen.type;
       outcome=await b.ai.runTrusted({type,params:{
         ...params,expectedRevision:job.job.revision,
         ...(chosen.type==='STOP_OLDER_NATIVE'?{step:'STOP'}:{})}});
     }
     }catch{
       // An exception after a possible provider effect is never permission
       // to resend. Canonical I09/I13/I10 journals retain dispatch markers.
       return held('S05_STEP_INTERRUPTED_RECONCILE','UNKNOWN');
     }
     if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
     const receipt={ok:outcome?.ok===true,code:outcome?.code||'S05_STEP_UNVERIFIED',
       slug,step:chosen.type,providerEffects:
       ['UNLIST','STAGE','STAGE_PRIVATE','ADVANCE_JOB','STOP_OLDER_NATIVE'].includes(chosen.type)?
          'MAY_HAVE_DISPATCHED':'NONE'};
     // This cursor schedules fairness only. It never means a remote save
     // completed, nor authorizes replay of a failed or ambiguous effect.
     await api.storage.local.set({[cursorKey]:nextCursor,
       [statusKey]:{...receipt,observedAt:Date.now()}});
     return {...receipt,canonical:outcome};
    }
    if(!listing.more)break;
    if(!listing.nextCursor||listing.nextCursor<=after)
      return fail('S05_CURSOR_UNVERIFIED');
    after=listing.nextCursor;
   }
   await api.storage.local.set({[cursorKey]:
     examined>=maxCandidates?lastSeen:''});
   return {ok:true,code:'S05_NO_ELIGIBLE_ACTION',examined};
  }catch{return fail('S05_PROGRESS_UNAVAILABLE');}
 }
 return Object.freeze({tick});
}
