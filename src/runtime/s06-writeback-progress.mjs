// S06: use the existing S03/S05 background alarm, not a second scheduler.
// All Git credentials are retrieved on demand from native Secret Service.
// Only exact S05 TESTS_VERIFIED F is eligible. A lost Git ACK is *observed*;
// it is never retried by a new operation. Production activation defaults OFF.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {createReadyStore} from './ready-store.mjs';
import {createStagingStore} from './staging-store.mjs';
import {createAiStore} from './ai-store.mjs';
import {createWritebackStore} from './writeback-store.mjs';
import {createWritebackBoundary} from './writeback-boundary.mjs';
import {evaluation} from './ai-evidence.mjs';
import {isI17Quarantined} from './legacy-quarantine.mjs';
const fail=code=>({ok:false,code});
const ID=/^[a-z0-9][a-z0-9-]{0,99}$/;
const RID=/^[1-9][0-9]{0,19}$/;
const HEX=/^[0-9a-f]{64}$/;
export function planS06Writeback({ready,stage,job,writeback}={}){
  const record=ready?.record||ready,st=stage?.record||stage,j=job?.job||job;
  const previous=writeback?.record||writeback;
  // Historical possibly-dispatched Git effects must be reconciled even
  // after READY supersession, revoked admission or an AI stage transition.
  // This path can ONLY observe the sealed prior intent, never arm new work.
  if(previous?.mode==='S06'&&
     ['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(previous.state)&&
     ID.test(previous.slug||'')&&
     Number.isSafeInteger(previous.revision)&&previous.revision>0&&
     record?.slug===previous.slug)
    return {ok:true,type:'RECONCILE',slug:previous.slug,
      revision:previous.revision,readOnly:true};
  const wanted=record?.active;
  // A queued desired READY has no admission/writer authority. Only
  // current active READY without a successor may write back tested F.
  if(!record||!wanted||record.hold||record.desired)
    return fail('S06_CURRENT_READY_UNAVAILABLE');
  if(!st||!j||st.state!=='SOURCE_VERIFIED'||!st.verifiedAt||
     st.slug!==record.slug||!ID.test(st.slug||'')||
     st.sourceFolder!=='generators/'+st.slug||
     st.readyIdentifier!==wanted.identifier||
     st.readyInputFingerprint!==wanted.inputFingerprint||
     j.readyIdentifier!==wanted.identifier||
     j.readyInputFingerprint!==wanted.inputFingerprint||
     !HEX.test(j.verifiedFinal||'')||
     j.stageRevision!==st.revision||j.state!=='TESTS_VERIFIED'||
     j.executionSlotReleased!==true||j.verifiedFinal!==j.sourceFingerprint||
     j.finalSource?.fingerprint!==j.verifiedFinal||
     evaluation(j).state!=='TESTS_VERIFIED')
    return fail('S06_CANDIDATE_OR_TEST_EVIDENCE_UNVERIFIED');
  if(previous){
    if(previous.mode!=='S06'||
       previous.readyIdentifier!==wanted.identifier||
       previous.readyInputFingerprint!==wanted.inputFingerprint||
       (previous.testingSha??null)!==(st.testingSha??null))
      return fail('S06_WRITEBACK_READY_PROVENANCE_CHANGED');
    if(previous.state==='CONFIRMED'&&
       previous.stageRevision===st.revision&&
       previous.jobRevision===j.revision&&
       previous.sourceFingerprint===j.verifiedFinal)
      return {ok:true,type:'REVIEW',slug:st.slug,
        sourceFingerprint:j.verifiedFinal,commitSha:previous.commitSha};
    if(previous.state==='PREPARED'){
      if(previous.stageRevision!==st.revision||
         previous.jobRevision!==j.revision||
         previous.sourceFingerprint!==j.verifiedFinal)
        return fail('S06_OLDER_PREPARED_INTENT_REQUIRES_CANCELLATION');
      return {ok:true,type:'COMMIT',slug:st.slug,revision:previous.revision};
    }
    if(previous.state==='CONFIRMED'&&
       previous.stageRevision===st.revision)
      return fail('S06_CONFIRMED_CANDIDATE_CHANGED');
    if(previous.state!=='CONFIRMED'&&previous.state!=='CANCELED')
      return fail('S06_UNRESOLVED_GIT_OPERATION');
  }
  return {ok:true,type:'PREPARE',slug:st.slug,
    jobRevision:j.revision,sourceFingerprint:j.verifiedFinal};
}
export function createS06WritebackProgress(api,{
  open=openCanonicalDatabase,effectGate=()=>false,
  native=p=>api.runtime.sendNativeMessage('local.pcms.backup_vault',p),
  makeBoundary=(db)=>createWritebackBoundary(api,{open:async()=>db,
    effectGate:ctx=>effectGate({phase:'S06',step:ctx.step||'GIT_WRITE',slug:ctx.record?.slug})}),
  maxCandidates=100
}={}){
  const sentinel=createRestoreSentinel(api.storage.local);
  let connection=null,flight=null;
  const db=()=>connection||=open().catch(e=>{connection=null;throw e;});
  const cursorKey='pcmsS06GitWritebackCursor',statusKey='pcmsS06GitWritebackReceipt';
  async function perform(){
    try{
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      const database=await db(),queue=createReadyStore(database);
      const settings=(await api.storage.local.get(cursorKey))?.[cursorKey];
      let after=typeof settings==='string'&&ID.test(settings)?settings:'',
        examined=0,last='';
      for(let page=0;page<64&&examined<maxCandidates;page++){
        const listing=await queue.list({after,limit:Math.min(100,maxCandidates-examined)});
        if(!listing.ok)return listing;
        for(let i=0;i<listing.items.length;i++){
          const summary=listing.items[i];
          last=summary.slug;examined++;
          if(isI17Quarantined({slug:summary.slug}))continue;
          const ready=await queue.get(summary.slug),
            stage=await createStagingStore(database).getFull(summary.slug),
            job=await createAiStore(database).getJobFull(summary.slug),
            wb=await createWritebackStore(database).getFull(summary.slug);
          if(!ready.ok||ready.record.revision!==summary.revision)continue;
          const chosen=planS06Writeback({ready,stage,job,writeback:wb.ok?wb:null});
          if(!chosen.ok||chosen.type==='REVIEW')continue;
          const next=i+1<listing.items.length||listing.more?summary.slug:'';
          // No operator-configured repository or vault: do not touch a
          // private account, Git branch, source editor or remote publisher.
          const cfg=(await api.storage.local.get('pcmsS03Git'))?.pcmsS03Git;
          if(cfg?.repository!=='Neb963/per-gens'||!RID.test(cfg.repositoryId||'')){
            await api.storage.local.set({[cursorKey]:next});
            return fail('S06_REPOSITORY_NOT_CONNECTED');
          }
          if(chosen.type!=='RECONCILE'&&
             effectGate({phase:'S06',step:'GIT_WRITE',slug:chosen.slug})!==true){
            await api.storage.local.set({[cursorKey]:next});
            return fail('S06_PRIVATE_GIT_ACTIVATION_HELD');
          }
          const credential=await native({action:'git.get',repositoryId:cfg.repositoryId});
          if(!credential?.ok||typeof credential.credential!=='string'||
             credential.credential.length<12||credential.credential.length>512){
            await api.storage.local.set({[cursorKey]:next});
            return fail('S06_GIT_VAULT_UNAVAILABLE');
          }
          // Recheck revision after waiting for native host and before any
          // effect. CAS in writeback-store.arm is the final dispatch fence.
          const latest=await queue.get(summary.slug);
          if(!latest.ok||latest.record.revision!==summary.revision)
            return fail('S06_READY_CHANGED_DURING_CREDENTIAL_FETCH');
          const boundary=makeBoundary(database);
          let outcome;
          try{
            if(chosen.type==='PREPARE')
              outcome=await boundary.runTrusted({type:'PREPARE',params:{
                slug:chosen.slug,mode:'S06',
                message:'PCMS verified '+chosen.slug+' candidate',
                token:credential.credential,
                expectedJobRevision:chosen.jobRevision,
                fingerprint:chosen.sourceFingerprint}});
            else if(chosen.type==='COMMIT')
              outcome=await boundary.runTrusted({type:'COMMIT',params:{
                slug:chosen.slug,token:credential.credential,
                expectedRevision:chosen.revision}});
            else outcome=await boundary.runTrusted({type:'RECONCILE',params:{
              slug:chosen.slug,token:credential.credential,
              expectedRevision:chosen.revision}});
          }catch{outcome=fail('S06_OUTCOME_UNCERTAIN_RECONCILE');}
          const receipt={slug:chosen.slug,step:chosen.type,
            code:outcome?.code||'S06_CANONICAL_RECEIPT_REQUIRED',
            state:outcome?.state||null,ok:outcome?.ok===true,
            observedAt:Date.now(),
            remoteEffect:chosen.type==='COMMIT'?'MAY_HAVE_OCCURRED':'NONE'};
          // Never store credentials, sealed source or misleading ACKs here.
          if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
          await api.storage.local.set({[cursorKey]:next,[statusKey]:receipt});
          return receipt;
        }
        if(!listing.more)break;
        if(!listing.nextCursor||listing.nextCursor<=after)
          return fail('S06_READY_CURSOR_UNVERIFIED');
        after=listing.nextCursor;
      }
      await api.storage.local.set({[cursorKey]:examined>=maxCandidates?last:''});
      return {ok:true,code:'S06_NO_ELIGIBLE_GIT_ACTION',examined};
    }catch{return fail('S06_BACKGROUND_CHECK_UNAVAILABLE');}
  }
  function tick(){
    return flight||(flight=perform().finally(()=>{flight=null;}));
  }
  return Object.freeze({tick});
}
