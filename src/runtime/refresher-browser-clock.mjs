// A06: browser-native prospective operating-time evidence, with no PCMS host.
// The monotonic counter is sampled inside ONE running background incarnation.
// Stored observations from a prior Firefox/background incarnation cannot earn
// active time. Two valid route endpoints and pre-existing complete feed evidence
// bound the credit; never backfill time from browser.alarms or wall clocks.
const ID=s=>typeof s==='string'&&/^[a-z0-9_-]{8,128}$/i.test(s);
const FP=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const goodTime=x=>Number.isFinite(x)&&x>=0&&x<=Number.MAX_SAFE_INTEGER;
const goodRoute=r=>r?.ready===true&&ID(r.accountId)&&ID(r.personaUid)&&
  Number.isSafeInteger(r.bindingVersion)&&r.bindingVersion>0&&
  FP(r.principalFingerprint)&&ID(r.cookieStoreId)&&
  ID(r.routeId)&&!['direct','block'].includes(r.routeId)&&ID(r.healthDomain);
const SAME=['accountId','personaUid','bindingVersion','principalFingerprint',
  'cookieStoreId','routeId','healthDomain'];
const hold=reason=>({ok:false,reason,creditedMs:0});
export function qualifyBrowserObservedInterval({previous,next,recent,accounts=[],
  bootId,id,maxGapMs=90_000,driftToleranceMs=1_500}={}){
  if(!ID(bootId)||!ID(id)||!ID(previous?.runtimeEpoch)||
    previous.runtimeEpoch!==next?.runtimeEpoch||
    !goodTime(previous.monotonicMs)||!goodTime(next.monotonicMs)||
    !Number.isSafeInteger(previous.observedAtMs)||previous.observedAtMs<=0||
    !Number.isSafeInteger(next.observedAtMs)||next.observedAtMs<=0||
    !Array.isArray(accounts)||accounts.length>1000||
    !Array.isArray(previous.routes)||!Array.isArray(next.routes)||
    previous.routes.length>1000||next.routes.length>1000||
    !Number.isSafeInteger(maxGapMs)||maxGapMs>90_000||maxGapMs<1000||
    !Number.isSafeInteger(driftToleranceMs)||driftToleranceMs<0||
    driftToleranceMs>1500)return hold('BROWSER_INTERVAL_INVALID');
  const wall=next.observedAtMs-previous.observedAtMs;
  const mono=next.monotonicMs-previous.monotonicMs;
  if(wall<=0||mono<=0||wall>maxGapMs||mono>maxGapMs||
    Math.abs(wall-mono)>driftToleranceMs)
    return hold('BROWSER_GAP_OR_CLOCK_DRIFT');
  // The complete feed must have been read before the interval started.
  // Later reobservation cannot retroactively qualify an unknown gap.
  if(recent?.complete!==true||recent.suspended===true||
    !Number.isSafeInteger(recent.observedAt)||recent.observedAt<=0||
    recent.observedAt>previous.observedAtMs||
    next.observedAtMs-recent.observedAt>600_000)
    return hold('RECENT_FEED_NOT_CONTINUOUSLY_ELIGIBLE');
  const before=new Map(previous.routes.filter(goodRoute).map(x=>[x.accountId,x]));
  const after=new Map(next.routes.filter(goodRoute).map(x=>[x.accountId,x]));
  const healthy=[],witnesses=[];
  for(const a of accounts){
    const p=before.get(a.accountId),n=after.get(a.accountId);
    if(!p||!n||a.verifiedIdentity!==true||a.paused===true||
      !FP(a.principalFingerprint)||!ID(a.personaUid)||
      p.principalFingerprint!==a.principalFingerprint||
      p.personaUid!==a.personaUid||
      p.bindingVersion!==a.bindingVersion||
      SAME.some(k=>p[k]!==n[k]))continue;
    healthy.push({accountId:a.accountId,personaUid:a.personaUid,
      bindingVersion:a.bindingVersion,principalFingerprint:a.principalFingerprint,
      protected:true,sessionVerified:true,health:'HEALTHY'});
    witnesses.push({accountId:a.accountId,domain:n.healthDomain,
      result:'HEALTHY',routeVerified:true,observedAt:next.observedAtMs});
  }
  if(!healthy.length)return hold('NO_MATCHING_PROTECTED_ACCOUNT');
  // Floor and subtract the drift allowance rather than claiming unobserved
  // fractional millisecond time. No account may get a full assumed alarm period.
  const credited=Math.floor(Math.min(wall,mono));
  if(credited<=0)return hold('NO_ACCOUNTED_TIME');
  return {ok:true,creditedMs:credited,
    receipt:{source:'GUARDED_OPERATIONAL_INTERVAL',origin:'A06_BROWSER_OBSERVED',
      id,bootId,browserRunning:true,complete:true,
      from:previous.observedAtMs,to:previous.observedAtMs+credited,
      accounts:healthy,witnesses:witnesses.map(w=>({...w,
        observedAt:previous.observedAtMs+credited}))}};
}
