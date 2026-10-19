// S05 candidate supersession fence for native work. An AI session can
// observe its existing uncertain effect after a newer READY, but it cannot
// start a new repair, mint test PASS or advance an obsolete source.
const fail=code=>({ok:false,code});
export function authorizeReadyAiAdvance(job,ready){
 if(!job?.readyIdentifier)return {ok:true,code:'LEGACY_JOB'};
 if(!ready?.ok||!ready.record?.active||
    ready.record.active.identifier!==job.readyIdentifier||
    ready.record.active.inputFingerprint!==job.readyInputFingerprint||
    ready.record.desired||ready.record.hold==='READY_REVOKED_NOT_READY')
   return fail('S05_READY_SUPERSEDED_RECONCILE_OLDER_SESSION');
 return {ok:true,code:'S05_CURRENT_READY'};
}
