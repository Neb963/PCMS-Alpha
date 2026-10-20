// S07: pure, fail-closed admission and byte-preserving HTML marker planning.
import {exactSource,diffSource} from './staging-core.mjs';
// No provider, route, Git or browser side effects are performed here.
const ID=/^[A-Za-z0-9_-]{16,64}$/;
const MARKER='<!-- pcms-alpha-refresher:';
const TRAILER=/\n<!-- pcms-alpha-refresher:([A-Za-z0-9_-]{16,64}) -->$/;

export function qualifyRecentAbsence({row,recent,policy,now,reservedId=null}={}){
  if(!Number.isSafeInteger(now)||now<=0||!Number.isSafeInteger(policy?.recentMs)||
      policy.recentMs<60000)return {ok:false,code:'REFRESH_CLOCK_UNVERIFIED'};
  if(!row||row.phase!=='ACTIVE'||row.slot!==true||row.paused===true||
      row.reviewHeld===true||row.identityHeld===true||row.readyUpdate===true||
      row.ownerVerified!==true||row.releaseVerified!==true||row.listing!=='PUBLIC')
    return {ok:false,code:'REFRESH_TARGET_HELD'};
  if(recent?.complete!==true||!Number.isSafeInteger(recent.observedAt)||
      recent.observedAt<=0||recent.observedAt>now||
      now-recent.observedAt>2*policy.recentMs||recent.suspended===true)
    return {ok:false,code:'REFRESH_RECENT_UNKNOWN'};
  if(row.presence?.source!=='GUARDED_RECENT_LIST'||
      row.presence.observedAt!==recent.observedAt||
      row.presence.present!==false||row.presence.absence!=='NOT_A_DELETION')
    return {ok:false,code:'REFRESH_DISAPPEARANCE_UNPROVEN'};
  const initial=reservedId===null&&row.refresh?.state==='ABSENT_ONCE'&&
    row.refresh.intent===null;
  const reserved=reservedId!==null&&row.refresh?.state==='ATTEMPT_PENDING'&&
    row.refresh.intent?.id===reservedId&&row.refresh.intent?.state==='RESERVED'&&
    row.refresh.intent.at<=now;
  if((!initial&&!reserved)||row.refresh?.suspended===true||
      row.refresh?.awaitingVisibility===true||
      !Number.isSafeInteger(row.refresh.misses)||row.refresh.misses<1||
      row.refresh.nextAttemptAt>now)
    return {ok:false,code:'REFRESH_EFFECT_HELD'};
  return {ok:true,feedAt:recent.observedAt,stableId:row.stableId};
}

// The only permitted modification is to append/replace an owned trailing
// HTML comment. The rest of the HTML string is preserved exactly, including
// preceding whitespace. The caller must separately compare the entire saved
// source manifest and independently observe the provider result.
export function planOwnedSourceMarker(html,markerId){
  if(typeof html!=='string'||html.length>12*1024*1024||!ID.test(markerId))
    return {ok:false,code:'REFRESH_MARKER_INVALID'};
  const occurrences=html.split(MARKER).length-1;
  const previous=TRAILER.exec(html);
  if(occurrences>1||(occurrences===1&&!previous))
    return {ok:false,code:'REFRESH_MARKER_CONFLICT'};
  if(previous?.[1]===markerId)return {ok:false,code:'REFRESH_MARKER_REPLAY'};
  const base=previous?html.slice(0,-previous[0].length):html;
  const next=base+'\n'+MARKER+markerId+' -->';
  if(next===html||next.length>12*1024*1024)
    return {ok:false,code:'REFRESH_MARKER_LIMIT'};
  return {ok:true,html:next,previousMarker:previous?.[1]||null,
    changed:true};
}

export function countObservedOccupancy(rows,items,at){
  const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
  if(!Array.isArray(rows)||rows.length>5000||!Array.isArray(items)||items.length>5000||
      !Number.isSafeInteger(at)||at<=0||
      items.some(x=>!slug(x?.slug))||new Set(items.map(x=>x.slug)).size!==items.length)
    return {ok:false,code:'REFRESH_OCCUPANCY_UNVERIFIED'};
  const feed=new Set(items.map(x=>x.slug));
  let ownedPublic=0,ownedVisible=0,activeVisible=0;
  for(const r of rows){
    if(!slug(r?.slug)||r.ownerVerified!==true||r.releaseVerified!==true||
        r.listing!=='PUBLIC'||r.identityHeld===true)continue;
    ownedPublic++;
    if(feed.has(r.slug)){
      ownedVisible++;
      if(r.slot===true&&r.phase==='ACTIVE')activeVisible++;
    }
  }
  return {ok:true,sample:{at,feedSize:items.length,ownedPublic,ownedVisible,activeVisible}};
}

function encodeB64(bytes){
  let binary='';
  for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(binary);
}
// Produces a complete immutable source candidate for the ONE canonical writer.
// No file except index.html may change. Does not confer remote write authority.
export async function planRefresherSourceCandidate({files,expectedFingerprint,markerId}={}){
  if(typeof expectedFingerprint!=='string'||!/^[a-f0-9]{64}$/.test(expectedFingerprint))
    return {ok:false,code:'REFRESH_SOURCE_UNVERIFIED'};
  const prior=await exactSource(files);
  if(!prior.ok||prior.fingerprint!==expectedFingerprint)
    return {ok:false,code:'REFRESH_SOURCE_DRIFT'};
  const existing=prior.blobs.find(f=>f.path==='index.html');
  let html;
  try{
    html=new TextDecoder('utf-8',{fatal:true})
      .decode(Uint8Array.from(atob(existing.base64),ch=>ch.charCodeAt(0)));
  }catch{return {ok:false,code:'REFRESH_HTML_UNVERIFIED'};}
  const change=planOwnedSourceMarker(html,markerId);
  if(!change.ok)return change;
  const updated=prior.blobs.map(f=>f.path==='index.html'?
    {path:'index.html',base64:encodeB64(new TextEncoder().encode(change.html))}:f);
  const target=await exactSource(updated);
  if(!target.ok)return {ok:false,code:'REFRESH_TARGET_UNVERIFIED'};
  const diff=diffSource(prior,target);
  if(!diff.ok||diff.changes.length!==1||diff.changes[0].path!=='index.html'||
      diff.changes[0].kind!=='CHANGED'||target.fingerprint===prior.fingerprint)
    return {ok:false,code:'REFRESH_SCOPE_CONFLICT'};
  return {ok:true,source:'PCMS_CONTROLLED_MARKER_PLAN',markerId,
    fromFingerprint:prior.fingerprint,toFingerprint:target.fingerprint,
    previousFiles:prior.blobs,targetFiles:target.blobs,
    changedPaths:['index.html'],previousMarker:change.previousMarker};
}


// S07 -> S06/I13 bridge: select exact LIVE previous-source P for an upcoming
// sleeping READY update. A harmless marker is not a new reviewed F, but the
// recovery snapshot must contain its real saved bytes. Never reinterpret an
// unverified remote edit as PCMS source, or silently restore the stale F.
export async function resolveRefreshedPrevious({published,remote,row}={}){
  if(published?.ok!==true||remote?.ok!==true||
     !/^[a-f0-9]{64}$/.test(published.fingerprint||'')||
     !/^[a-f0-9]{64}$/.test(remote.fingerprint||'')||
     row?.releaseVerified!==true||row.releaseFingerprint!==published.fingerprint)
    return {ok:false,code:'REFRESH_PREVIOUS_AUTHORITY_UNKNOWN'};
  const marker=row.refresh;
  if(marker?.savedSourceFingerprint==null){
    return remote.fingerprint===published.fingerprint?
      {ok:true,source:remote,kind:'UNMODIFIED_PUBLISHED_F'}:
      {ok:false,code:'REMOTE_EDIT_NOT_REFRESHER'};
  }
  if(marker.intent!==null||marker.suspended===true||
     marker.awaitingVisibility!==false||
     marker.savedSourceFingerprint!==remote.fingerprint||
     !/^[A-Za-z0-9_-]{16,64}$/.test(marker.savedMarkerId||'')||
     !/^[a-f0-9]{32}$/.test(marker.savedNonce||''))
    return {ok:false,code:'REFRESH_PREVIOUS_UNRECONCILED'};
  const expected=await planRefresherSourceCandidate({
    files:published.blobs,expectedFingerprint:published.fingerprint,
    markerId:marker.savedMarkerId});
  if(expected.ok!==true||expected.toFingerprint!==remote.fingerprint)
    return {ok:false,code:'REFRESH_PREVIOUS_SOURCE_DRIFT'};
  return {ok:true,source:remote,kind:'VERIFIED_PCMS_S07_MARKER_P',
    publishedFingerprint:published.fingerprint,
    savedFingerprint:remote.fingerprint};
}
