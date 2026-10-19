// S07: pure, fail-closed admission and byte-preserving HTML marker planning.
// No provider, route, Git or browser side effects are performed here.
const ID=/^[A-Za-z0-9_-]{16,64}$/;
const MARKER='<!-- pcms-alpha-refresher:';
const TRAILER=/\n<!-- pcms-alpha-refresher:([A-Za-z0-9_-]{16,64}) -->$/;

export function qualifyRecentAbsence({row,recent,policy,now}={}){
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
  if(row.refresh?.state!=='ABSENT_ONCE'||row.refresh?.suspended===true||
      !Number.isSafeInteger(row.refresh.misses)||row.refresh.misses<1||
      row.refresh.intent!=null||row.refresh.nextAttemptAt>now)
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
