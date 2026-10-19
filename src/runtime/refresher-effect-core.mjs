// I14: deterministic proof and visibility reducer. Never calls a provider.
// A save ACK is not persisted effect evidence; feed rank is a separate observation.
export const REFRESH_PROOF_VERSION=1, RETRY_LIMIT=2, MAX_BACKOFF=24*3600000;
const safeId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(s);
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const time=t=>Number.isSafeInteger(t)&&t>0;
export function emptyRefreshEvidence(){
  return {version:REFRESH_PROOF_VERSION,state:'UNOBSERVED',misses:0,lastMissAt:0,
    lastSeenAt:0,lastRank:null,suspended:false,attempts:0,probes:0,nextAttemptAt:0,
    intent:null,history:[]};
}
export function validRefreshEvidence(e){
  return e?.version===1&&['UNOBSERVED','PRESENT','ABSENT_ONCE',
    'VISIBILITY_SUSPENDED','ATTEMPT_PENDING','DISPATCH_POSSIBLE',
    'EFFECT_UNVERIFIED','EFFECT_CONFIRMED','INEFFECTIVE'].includes(e.state)&&
    Number.isSafeInteger(e.misses)&&e.misses>=0&&e.misses<=3&&
    Number.isSafeInteger(e.attempts)&&e.attempts>=0&&e.attempts<=RETRY_LIMIT&&
    Number.isSafeInteger(e.probes)&&e.probes>=0&&e.probes<=3&&
    Array.isArray(e.history)&&e.history.length<=8&&
    (e.intent===null||safeId(e.intent.id));
}
// Only an independently sourced, complete, fresh recent-list sample counts.
// An absent recent-list item is never evidence that its generator was deleted.
export function observeRefreshPresence(current,{at,present,rank,complete,healthy,
  windowMs=600000}={}){
  const e=structuredClone(current||emptyRefreshEvidence());
  if(!validRefreshEvidence(e)||!time(at)||complete!==true||
      healthy!==true||typeof present!=='boolean'||
      (present&&(!Number.isSafeInteger(rank)||rank<1||rank>5000))||
      windowMs<60000)return {ok:false,code:'VISIBILITY_UNVERIFIED'};
  if(at<=Math.max(e.lastSeenAt,e.lastMissAt))return {ok:false,code:'STALE_VISIBILITY'};
  if(present){
    const wasSuspended=e.suspended;
    const uncertain=e.state==='EFFECT_UNVERIFIED'||e.intent?.state==='DISPATCH_POSSIBLE';
    e.misses=0;e.lastSeenAt=at;e.lastRank=rank;
    // Seeing a feed item cannot reconcile a possibly-dispatched mutation.
    if(!uncertain){e.suspended=false;if(!e.intent)e.state='PRESENT';}
    return {ok:true,evidence:e,resumed:wasSuspended&&!uncertain,releaseSlot:false};
  }
  e.lastRank=null;
  if(e.lastMissAt&&at-e.lastMissAt<windowMs)
    return {ok:false,code:'ABSENCE_WINDOW_NOT_INDEPENDENT'};
  e.lastMissAt=at;e.misses=Math.min(3,e.misses+1);
  if(e.misses>=3){e.suspended=true;if(!e.intent)e.state='VISIBILITY_SUSPENDED';}
  else if(!e.intent)e.state='ABSENT_ONCE';
  return {ok:true,evidence:e,releaseSlot:e.suspended,resumed:false};
}
// Provider support must be established outside the UI and separately activated.
// Neither HTTP success, an ordinary save nor a no-op is a qualifying method.
export function qualifyRefreshCandidate(candidate){
  const legacy=candidate?.method==='EXPLICIT_PROVIDER_REFRESH';
  const marker=candidate?.method==='CONTROLLED_SOURCE_MARKER'&&
    hex(candidate.targetFingerprint)&&
    candidate.targetFingerprint!==candidate.sourceFingerprint&&
    safeId(candidate.markerId);
  if(candidate?.status!=='SUPPORTED_AND_VERIFIED'||(!legacy&&!marker)||
    candidate.allowedByProvider!==true||!safeId(candidate.version)||
    !hex(candidate.sourceFingerprint)||!safeId(candidate.evidenceId)||
    candidate.meaningfulEffectVerified!==true)return {ok:false,code:'REFRESH_UNSUPPORTED'};
  return {ok:true,version:candidate.version,sourceFingerprint:candidate.sourceFingerprint,
    evidenceId:candidate.evidenceId,method:candidate.method,
    ...(marker?{targetFingerprint:candidate.targetFingerprint,markerId:candidate.markerId}:{})};
}
export function reserveRefreshAttempt(evidence,{id,at,slug,sourceFingerprint,
  candidate,eligible,liveAuthorized}={}){
  const e=structuredClone(evidence||emptyRefreshEvidence());
  const q=qualifyRefreshCandidate(candidate);
  if(!q.ok)return q;
  if(liveAuthorized!==true)return {ok:false,code:'REFRESH_ACTIVATION_HELD'};
  if(!validRefreshEvidence(e)||!safeId(id)||!safeId(slug)||!time(at)||!hex(sourceFingerprint)||
    q.sourceFingerprint!==sourceFingerprint||eligible!==true||
    e.intent||e.attempts>=RETRY_LIMIT||e.nextAttemptAt>at||e.suspended)
    return {ok:false,code:'REFRESH_ADMISSION_HELD'};
  e.intent={id,slug,at,sourceFingerprint,version:q.version,
    evidenceId:q.evidenceId,method:q.method,
    ...(q.method==='CONTROLLED_SOURCE_MARKER'?{
      targetFingerprint:q.targetFingerprint,markerId:q.markerId}:{}),
    state:'RESERVED',dispatchAt:0};
  e.state='ATTEMPT_PENDING';
  return {ok:true,evidence:e};
}
// Persist DISPATCH_POSSIBLE before any external call. Never replay a
// reserved/possibly dispatched operation after crash or lost ACK.
export function dispatchPossible(evidence,id,at){
  const e=structuredClone(evidence);
  if(!validRefreshEvidence(e)||e.intent?.id!==id||
    e.intent.state!=='RESERVED'||!time(at)||at<e.intent.at)
    return {ok:false,code:'REFRESH_INTENT_STALE'};
  e.intent.state='DISPATCH_POSSIBLE';e.intent.dispatchAt=at;
  e.state='DISPATCH_POSSIBLE';
  return {ok:true,evidence:e};
}
// Independent persisted-effect readback and separate recent-feed receipt.
// Only exact observed source fingerprints in the same owner/target context
// can establish an effect. UNKNOWN never opens retry eligibility.
export function reconcileRefreshAttempt(evidence,id,{at,kind,sourceFingerprint,
  targetMatched,principalMatched,feed}={}){
  const e=structuredClone(evidence);
  if(!validRefreshEvidence(e)||e.intent?.id!==id||
    e.intent.state!=='DISPATCH_POSSIBLE'||!time(at)||at<e.intent.dispatchAt)
    return {ok:false,code:'REFRESH_INTENT_STALE'};
  if(!['EFFECT_CHANGED','NO_EFFECT','UNKNOWN'].includes(kind))
    return {ok:false,code:'REFRESH_READBACK_INVALID'};
  const verified=targetMatched===true&&principalMatched===true&&
    hex(sourceFingerprint)&&kind==='EFFECT_CHANGED'&&
    sourceFingerprint!==e.intent.sourceFingerprint&&
    // For controlled source-marker writes, *any* changed source is NOT enough.
    // Only the planned complete source fingerprint proves a safe saved effect.
    (e.intent.method!=='CONTROLLED_SOURCE_MARKER'||
      sourceFingerprint===e.intent.targetFingerprint);
  const noEffect=targetMatched===true&&principalMatched===true&&
    kind==='NO_EFFECT'&&sourceFingerprint===e.intent.sourceFingerprint;
  const prior=e.intent;
  const already=e.history.some(h=>h.id===id);
  if(e.probes>=3&&kind==='UNKNOWN')return {ok:false,code:'READBACK_BUDGET_EXHAUSTED'};
  if(!already)e.attempts=Math.min(RETRY_LIMIT,e.attempts+1);
  e.probes=Math.min(3,e.probes+1);
  e.nextAttemptAt=at+Math.min(MAX_BACKOFF,600000*2**e.attempts);
  e.state=verified?'EFFECT_CONFIRMED':noEffect?'INEFFECTIVE':'EFFECT_UNVERIFIED';
  e.history=[...e.history.filter(h=>h.id!==id),{id,at,methodVersion:prior.version,
    dispatchAt:prior.dispatchAt,effect:e.state,
    // A feed result must carry its own complete timestamped independent proof.
    feed:feed?.independent===true&&feed.complete===true&&time(feed.observedAt)&&
      feed.observedAt>=prior.dispatchAt&&
      (feed.present===false||(feed.present===true&&
        Number.isSafeInteger(feed.rank)&&feed.rank>0&&feed.rank<=5000))?
        {state:feed.present?'PRESENT':'ABSENT',at:feed.observedAt,
          rank:feed.present?feed.rank:null}:
        {state:'UNKNOWN',at:0,rank:null}}].slice(-8);
  // No retry after an uncertain dispatch even if an adapter times out. No
  // automatic retry after an ineffective attempt without a fresh verified method.
  // Retain the dispatch receipt until independent saved-state readback
  // resolves it; a later guarded read can settle this SAME id without execute.
  e.intent=verified||noEffect?null:prior;
  if(!verified)e.suspended=true;
  return {ok:true,evidence:e,effectVerified:verified,
    feedState:e.history.at(-1).feed.state};
}
