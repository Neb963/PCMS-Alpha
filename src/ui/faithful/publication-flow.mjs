// A05 primary UI continuation of an exact, persisted publication approval.
// Approval itself cannot be evidence of a listing effect. Never resend a
// possibly-dispatched effect after a missing/late response or tab closure.
const pending=new Set(['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN','RECOVERY_HOLD']);
const noEffect=new Set(['PUBLICATION_ACTIVATION_HELD','APPROVAL_STALE',
  'STALE_RELEASE','S06_CURRENT_CANDIDATE_GIT_PROOF_REQUIRED','RESTORE_HOLD']);
const fail=(code,state='UNKNOWN')=>({ok:false,code,state});
export async function advanceApprovedPublication({slug,approval,invoke}={}){
  if(typeof invoke!=='function'||typeof slug!=='string'||
     !/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)||
     approval?.ok!==true||approval.slug!==slug||
     approval.state!=='APPROVED'||
     !Number.isSafeInteger(approval.revision)||approval.revision<1)
    return fail('APPROVAL_RECEIPT_REQUIRED');

  let sent;
  try{sent=await invoke('DISPATCH',{slug,expectedRevision:approval.revision});}
  catch{sent=null;}
  // A concrete refusal before DISPATCH_POSSIBLE is not a publication.
  // Otherwise the request could have reached the provider despite a lost ACK.
  if(sent?.ok===false&&noEffect.has(sent.code))
    return fail(sent.code,'APPROVED');
  let current;
  try{current=await invoke('GET',{slug});}catch{return fail('PUBLISH_OUTCOME_UNKNOWN');}
  if(!current?.ok||current.slug!==slug)
    return fail('PUBLISH_OUTCOME_UNKNOWN');
  if(current.state==='CONFIRMED_PUBLIC')
    return {ok:true,state:current.state,code:'PUBLICATION_INDEPENDENTLY_VERIFIED'};
  if(!pending.has(current.state))
    return fail(sent?.code||'PUBLISH_NOT_DISPATCHED',current.state);
  // Read-only reconciliation is safe even when the dispatch reply was lost.
  // No second DISPATCH is permitted in this invocation.
  try{
    const observed=await invoke('RECONCILE',{
      slug,expectedRevision:current.revision});
    if(observed?.ok===true&&observed.slug===slug&&
       observed.state==='CONFIRMED_PUBLIC')
      return {ok:true,state:'CONFIRMED_PUBLIC',code:'PUBLICATION_INDEPENDENTLY_VERIFIED'};
    return fail(observed?.code||'PUBLICATION_UNCERTAIN',
      observed?.state||current.state);
  }catch{return fail('PUBLICATION_UNCERTAIN',current.state);}
}
