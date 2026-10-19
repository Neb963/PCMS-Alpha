// S05 source-claim admission for successor candidate. Pure, fail-closed.
// The provider readback and native idle facts must be independently checked
// by the privileged boundary; this function never certifies their origin.
const fail=code=>({ok:false,code});
const activeNative=new Set(['DISPATCH_POSSIBLE','RUNNING_OBSERVED','STOP_DISPATCH_POSSIBLE']);
const idleNative=new Set(['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE']);
const unsafeRelease=new Set(['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN',
  'RECOVERY_HOLD','PUBLISHING','PUBLISH_UNCERTAIN']);
const unsafeUpdate=new Set(['UNLIST_DISPATCH_POSSIBLE','UNLIST_UNCERTAIN',
  'STAGE_DISPATCH_POSSIBLE','STAGE_UNCERTAIN',
  'RESTORE_DISPATCH_POSSIBLE','RESTORE_UNCERTAIN',
  'RECOVERY_UNLIST_DISPATCH_POSSIBLE','RECOVERY_UNLIST_UNCERTAIN']);
export function evaluateStageSuccessor({prior,previous,job,release,existing,ready,source}){
 if(!prior)return {ok:true,reason:'FIRST_CANDIDATE'};
 if(!previous?.ok||typeof previous.fingerprint!=='string')
   return fail('PREVIOUS_SOURCE_UNVERIFIED');
 if(!ready?.active||ready.desired||
    ready.active.identifier!==source?.gitReadyIdentifier||
    ready.active.inputFingerprint!==source?.gitReadyInputFingerprint)
   return fail('READY_CANDIDATE_NOT_ADMITTED');
 if(unsafeRelease.has(release?.state)||unsafeUpdate.has(existing?.state))
   return fail('POSSIBLE_REMOTE_EFFECT_RECONCILIATION_REQUIRED');
 if(prior.state==='HUMAN_OWNED'||prior.state==='HANDOFF_REQUESTED')
   return fail('HUMAN_SOURCE_OWNER');
 if(!['PINNED','SOURCE_VERIFIED'].includes(prior.state))
   return fail('PREVIOUS_SOURCE_EFFECT_UNCERTAIN');
 if(prior.accountId!==source?.accountId||
    prior.remotePublicId!==source?.remotePublicId||
    prior.personaUid!==source?.personaUid||
    prior.bindingVersion!==source?.bindingVersion)
   return fail('SOURCE_OWNER_CHANGED');
 if(prior.state==='PINNED'){
   if(prior.tab||job)return fail('OLDER_CANDIDATE_NOT_IDLE');
   if(prior.previous?.fingerprint!==previous.fingerprint)
     return fail('SAVED_SOURCE_CHANGED');
   return {ok:true,reason:'UNSAVED_CANDIDATE_REPLACED'};
 }
 if(job){
   if(job.stageRevision!==prior.revision||
      job.state==='HELD_RECONCILE'||job.state==='HUMAN_OWNED'||
      activeNative.has(job.native?.state)||
      (!idleNative.has(job.native?.state)&&job.native!==undefined)||
      (job.native===undefined&&job.state!=='PENDING_NATIVE_SESSION'))
     return fail('NATIVE_HELPER_NOT_PROVEN_IDLE');
   const final=job.finalSource?.fingerprint||
     (job.state==='PENDING_NATIVE_SESSION'?job.sourceFingerprint:null);
   if(!final||final!==previous.fingerprint)
     return fail('NATIVE_SAVED_SOURCE_UNVERIFIED');
 }else if(prior.candidate?.fingerprint!==previous.fingerprint)
   return fail('PREVIOUS_STAGED_SOURCE_CHANGED');
 return {ok:true,reason:'IDLE_VERIFIED_SUCCESSOR'};
}
