// S05: deterministic admission for coherent, already-witnessed Git main READY.
// Planning local intent never authorizes a provider save, AI effect or publication.
const sha40=/^[0-9a-f]{40}$/;
const sha64=/^[0-9a-f]{64}$/;
const slug=/^[a-z0-9][a-z0-9-]{0,99}$/;
const revision=/^[A-Za-z0-9_.:-]{8,128}$/;
const fail=code=>({ok:false,code});
export function normalizeReadyWitness(w){
  if(!w||!slug.test(w.slug||'')||
    !/^[1-9][0-9]{0,19}$/.test(w.repositoryId||'')||
    !sha40.test(w.declarationCommit||'')||
    !sha40.test(w.markerOid||'')||
    !sha64.test(w.inputFingerprint||'')||
    typeof w.identifier!=='string'||
    !(w.identifier==='legacy-'+w.declarationCommit+'-'+w.markerOid||
      (w.identifier.startsWith('rev-')&&revision.test(w.identifier.slice(4)))))
    return fail('READY_WITNESS_UNVERIFIED');
  return {ok:true,identity:[w.repositoryId,w.slug,w.identifier].join(':'),
    repositoryId:w.repositoryId,slug:w.slug,identifier:w.identifier,
    declarationCommit:w.declarationCommit,markerOid:w.markerOid,
    inputFingerprint:w.inputFingerprint,testingOid:w.testingOid||null};
}
export function planReadyObservation(previous,witness){
  const current=normalizeReadyWitness(witness);
  if(!current.ok)return current;
  if(previous&&(previous.slug!==current.slug||
    previous.repositoryId!==current.repositoryId))return fail('READY_ASSOCIATION_CHANGED');
  if(!previous)return {ok:true,changed:true,code:'READY_QUEUED',
    next:{slug:current.slug,repositoryId:current.repositoryId,
      revision:1,active:null,desired:current,hold:null}};
  const same=x=>x?.identity===current.identity;
  if(same(previous.active)||same(previous.desired)){
    const old=same(previous.active)?previous.active:previous.desired;
    return old.inputFingerprint===current.inputFingerprint&&
      old.markerOid===current.markerOid&&old.declarationCommit===current.declarationCommit?
      {ok:true,changed:false,code:'READY_ALREADY_OBSERVED',next:previous}:
      fail('READY_REVISION_REUSED_WITH_DIFFERENT_SOURCE');
  }
  if(previous.active?.identifier===current.identifier||
    previous.desired?.identifier===current.identifier)
    return fail('READY_REVISION_REUSED_WITH_DIFFERENT_SOURCE');
  const blocked=previous.active&&previous.active.state!=='RETIRED';
  return {ok:true,changed:true,code:blocked?'READY_SUCCESSOR_PENDING':'READY_QUEUED',
    next:{...previous,revision:previous.revision+1,desired:current,
      hold:blocked?'WAIT_FOR_SAFE_SOURCE_HANDOFF':null}};
}
// Handoff needs actual independently established writer, native, provider,
// editor and approval observations. A route expiry is not proof of helper idle.
export function planReadyHandoff(previous,expectedRevision,proof){
  if(!previous?.desired)return fail('READY_NOT_QUEUED');
  if(previous.hold==='READY_REVOKED_NOT_READY')return fail('READY_REVOKED_NOT_READY');
  if(previous.revision!==expectedRevision)return fail('STALE_REVISION');
  // Initial admission needs source/route/owner/baseline evidence just as much
  // as a successor. The local queue cannot mint these facts by itself.
  if(proof?.source!=='TRUSTED_S05_ADMISSION_BOUNDARY'||
     proof?.accountOwnerVerified!==true||
     proof?.protectedRouteReady!==true||
     proof?.completeRecoverableBaseline!==true||
     proof?.humanEditorClean!==true||
     proof?.noUncertainWriter!==true)
    return fail('READY_ADMISSION_UNVERIFIED');
  if(previous.active&&(proof.writerIdle!==true||proof.nativeIdle!==true||
    proof.providerEffectResolved!==true||
    proof.approvalEffectResolved!==true))
    return fail('SOURCE_HANDOFF_UNVERIFIED');
  const active={...previous.desired,state:'ACTIVE'};
  return {ok:true,changed:true,code:'READY_ADMITTED_LOCAL_ONLY',
    next:{...previous,revision:previous.revision+1,
      active,desired:null,hold:null},retired:previous.active||null};
}
