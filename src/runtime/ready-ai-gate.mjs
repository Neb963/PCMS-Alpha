// S05 candidate supersession fence for native work. An AI session can
// observe its existing uncertain effect after a newer READY, but it cannot
// start a new repair, mint test PASS or advance an obsolete source.
const fail=code=>({ok:false,code});
export function authorizeReadyAiAdvance(job,ready){
 if(!job?.readyIdentifier)return {ok:true,code:'LEGACY_JOB'};
 if(!ready?.ok||!ready.record?.active||
    ready.record.active.identifier!==job.readyIdentifier||
    ready.record.active.inputFingerprint!==job.readyInputFingerprint||
    ready.record.desired||['READY_REVOKED_NOT_READY','OPERATOR_PAUSED'].includes(ready.record.hold))
   return fail('S05_READY_SUPERSEDED_RECONCILE_OLDER_SESSION');
 return {ok:true,code:'S05_CURRENT_READY'};
}

export function authorizeGitReadyAiAdvance(job,catalog,coherent,{repositoryId,slug}={}){
 if(!job?.readyIdentifier)return {ok:true,code:'LEGACY_JOB'};
 if(!catalog?.ok||catalog.complete!==true||
    catalog.source!=='PINNED_MAIN_READ_ONLY'||
    catalog.repositoryId!==repositoryId||
    !/^[a-f0-9]{40}$/.test(catalog.head||'')||
    !coherent?.ok||coherent.code!=='READY_COHERENT_INPUT_PINNED'||
    coherent.pinnedHead!==catalog.head||coherent.slug!==slug)
   return fail('S05_AI_MAIN_READY_UNVERIFIED');
 const identifier=coherent.legacy?
   'legacy-'+coherent.declarationCommit+'-'+coherent.markerOid:
   'rev-'+coherent.token;
 if(identifier!==job.readyIdentifier||
    coherent.inputFingerprint!==job.readyInputFingerprint)
   return fail('S05_AI_MAIN_READY_SUPERSEDED');
 return {ok:true,code:'S05_MAIN_READY_STILL_CURRENT',head:catalog.head};
}
