// S07 conservative host-awake to eligible-operating interval bridge.
// Produces a receipt ONLY from a continuous ORIGINAL native-pipe witness and
// prospective, independently attributed provider/account eligibility coverage.
// A route-test cache, endpoint pair, wall clock, or caller's "healthy" boolean
// is not interval coverage. No source mutations or network calls here.
import {closeQualifiedWindow} from './qualified-clock.mjs';

const ID=x=>typeof x==='string'&&/^[a-z0-9_-]{8,128}$/i.test(x);
const FP=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const INT=x=>Number.isSafeInteger(x)&&x>0;
const MAX_NATIVE_GAP=12*3600000;
const boundedNative=n=>n&&
  ['observerEpoch','systemBootId','nativeLifetimeId','observerConnectionId']
    .every(k=>ID(n[k]))&&INT(n.sequence)&&
  ['hostAwakeNs','hostBootNs'].every(k=>
    typeof n[k]==='string'&&/^\d{1,24}$/.test(n[k]));

// A prospective eligibility attestation is scoped to the very same native
// observer incarnation that supplied both monotonic samples. A cached donor
// health record from an older host/session cannot be promoted into an interval.
const GENERATION=['observerEpoch','systemBootId','nativeLifetimeId','observerConnectionId'];
function certified(c,source,native){
  return c?.source===source&&ID(c.id)&&INT(c.validFromMs)&&INT(c.validUntilMs)&&
    c.validUntilMs>c.validFromMs&&c.held===false&&c.generationValid===true&&
    GENERATION.every(field=>ID(c[field])&&c[field]===native[field]);
}
function window(previous,next,coverage,maxGapMs,uncertaintyMs){
  return closeQualifiedWindow(previous,next,{coverage,maxGapMs,uncertaintyMs});
}
const held=reason=>({ok:false,reason,creditedMs:0});

// "coverage" must be supplied from an independently verified continuous
// donor/host capability. S07 production has no such capability yet: null
// coverage -> zero credit. Never create coverage by checking two endpoints.
export function qualifyNativeOperatingInterval({previous,next,bootId,id,
  providerCoverages=[],accountCoverages=[],maxGapMs=MAX_NATIVE_GAP,
  uncertaintyMs=25}={}){
  if(!ID(bootId)||!ID(id)||!boundedNative(previous)||
     !boundedNative(next)||!INT(previous.observedAtMs)||
     !INT(next.observedAtMs)||
     !Array.isArray(providerCoverages)||providerCoverages.length>16||
     !Array.isArray(accountCoverages)||accountCoverages.length>1000||
     !INT(maxGapMs)||maxGapMs>MAX_NATIVE_GAP||
     !Number.isSafeInteger(uncertaintyMs)||uncertaintyMs<0||uncertaintyMs>1000)
    return held('NATIVE_INTERVAL_INVALID');
  const start=previous.observedAtMs;
  if(providerCoverages.length<2||providerCoverages.some(c=>
      !certified(c,'DONOR_CONTINUOUS_PROVIDER',previous)||!ID(c.domain)||
      !ID(c.accountId)||c.routeVerified!==true||
      c.result!=='HEALTHY'))
    return held('PROVIDER_COVERAGE_NOT_PROVEN');
  if(new Set(providerCoverages.map(c=>c.domain)).size<2||
     new Set(providerCoverages.map(c=>c.accountId)).size<2)
    return held('PROVIDER_DOMAINS_NOT_INDEPENDENT');
  const general=window(previous,next,providerCoverages,maxGapMs,uncertaintyMs);
  if(!general.creditedMs)return held(general.reason);
  const end=start+general.creditedMs;
  if(end<=start||end>next.observedAtMs)
    return held('NATIVE_BOUNDARY_INVALID');
  const accounts=[];
  const seen=new Set();
  for(const a of accountCoverages){
    if(!ID(a?.accountId)||seen.has(a.accountId)||!ID(a.personaUid)||
       !INT(a.bindingVersion)||!FP(a.principalFingerprint)||
       !certified(a.route,'DONOR_CONTINUOUS_ROUTE',previous)||
       !certified(a.session,'DONOR_CONTINUOUS_SESSION',previous)||
       !ID(a.route.routeId)||!ID(a.session.routeId)||
       !ID(a.route.cookieStoreId)||!ID(a.session.cookieStoreId)||
       a.route.routeId==='direct'||a.route.routeId==='block'||
       a.route.routeId!==a.session.routeId||
       a.route.cookieStoreId!==a.session.cookieStoreId||
       a.route.accountId!==a.accountId||a.session.accountId!==a.accountId||
       a.route.personaUid!==a.personaUid||a.session.personaUid!==a.personaUid||
       a.route.bindingVersion!==a.bindingVersion||
       a.session.bindingVersion!==a.bindingVersion||
       a.session.principalFingerprint!==a.principalFingerprint||
       a.route.protected!==true||a.session.verified===true&&a.session.held===true)
      return held('ACCOUNT_COVERAGE_AMBIGUOUS');
    seen.add(a.accountId);
    if(a.session.verified!==true)continue;
    const w=window(previous,next,[...providerCoverages,a.route,a.session],
      maxGapMs,uncertaintyMs);
    // Never extend a single account's healthy interval past its verified
    // coverage. Other accounts may be credited independently.
    if(w.creditedMs!==general.creditedMs)continue;
    accounts.push({accountId:a.accountId,personaUid:a.personaUid,
      bindingVersion:a.bindingVersion,principalFingerprint:a.principalFingerprint,
      protected:true,sessionVerified:true,health:'HEALTHY'});
  }
  if(!accounts.length)return held('NO_ELIGIBLE_ACCOUNT_COVERAGE');
  return {ok:true,creditedMs:general.creditedMs,
    receipt:{source:'GUARDED_OPERATIONAL_INTERVAL',origin:'S07_NATIVE_CAUSAL_WINDOW',
      id,bootId,browserRunning:true,complete:true,from:start,to:end,
      accounts,witnesses:providerCoverages.map(c=>({
        accountId:c.accountId,domain:c.domain,result:'HEALTHY',
        routeVerified:true,observedAt:end}))}};
}


// Practical S07 operational clock. This does NOT claim continuous provider
// availability between HTTP requests. It conservatively accounts for a short
// original-native-pipe awake interval only while a recent authenticated
// public-feed read remains current, and the same protected Persona route was
// individually observed ready at BOTH ends. Unknown route/response intervals
// and pauses are frozen. No fictional future-valid coverage certificate.
const SAME_ROUTE=['accountId','personaUid','bindingVersion','principalFingerprint',
  'cookieStoreId','routeId','healthDomain'];
const goodRoute=r=>r?.ready===true&&ID(r.accountId)&&ID(r.personaUid)&&
  INT(r.bindingVersion)&&FP(r.principalFingerprint)&&
  ID(r.cookieStoreId)&&ID(r.routeId)&&r.routeId!=='direct'&&
  r.routeId!=='block'&&ID(r.healthDomain);
export function qualifyBoundedObservedInterval({previous,next,recent,
  accounts=[],bootId,id,recentMs=600000,maxGapMs=120000,
  uncertaintyMs=25}={}){
  const held=reason=>({ok:false,reason,creditedMs:0});
  if(!ID(bootId)||!ID(id)||!boundedNative(previous)||
     !boundedNative(next)||!INT(previous.observedAtMs)||
     !INT(next.observedAtMs)||!Number.isSafeInteger(recentMs)||
     recentMs<60000||!Array.isArray(accounts)||accounts.length>1000||
     !Array.isArray(previous.routes)||!Array.isArray(next.routes)||
     previous.routes.length>1000||next.routes.length>1000)
    return held('OBSERVED_CLOCK_INVALID');
  // No unknown/partial/rate-limited feed is ever operational evidence.
  if(recent?.complete!==true||recent.suspended===true||
     // A feed read first performed after the interval BEGAN cannot justify
     // crediting time before that observation. The next short native window
     // can still accrue normally; no later endpoint can backfill this gap.
     !INT(recent.observedAt)||recent.observedAt>previous.observedAtMs||
     next.observedAtMs-recent.observedAt>recentMs)
    return held('PUBLIC_FEED_CURRENTLY_UNVERIFIED');
  for(const field of ['observerEpoch','systemBootId','nativeLifetimeId','observerConnectionId'])
    if(!ID(previous[field])||previous[field]!==next[field])
      return held('NATIVE_LIFETIME_CHANGED');
  if(next.sequence!==previous.sequence+1)
    return held('NATIVE_SAMPLE_GAP');
  const p=BigInt(previous.hostAwakeNs),n=BigInt(next.hostAwakeNs);
  const pb=BigInt(previous.hostBootNs),nb=BigInt(next.hostBootNs);
  if(n<=p||nb<pb||nb-n-(pb-p)>BigInt(uncertaintyMs)*1000000n||
     nb-pb<n-p)
    return held('NATIVE_SUSPENDED_OR_INVALID');
  const awakeMs=Number((n-p)/1000000n);
  if(!Number.isSafeInteger(awakeMs)||awakeMs<=uncertaintyMs||
     awakeMs>maxGapMs||next.observedAtMs<=previous.observedAtMs||
     next.observedAtMs-previous.observedAtMs>maxGapMs+1000)
    return held('UNKNOWN_AWAKE_INTERVAL');
  const start=previous.observedAtMs;
  const end=Math.min(next.observedAtMs,start+awakeMs)-uncertaintyMs;
  if(end<=start)return held('NO_ACCOUNTED_TIME');
  const before=new Map(previous.routes.filter(goodRoute).map(r=>[r.accountId,r]));
  const after=new Map(next.routes.filter(goodRoute).map(r=>[r.accountId,r]));
  const matched=[];
  for(const a of accounts){
    const p=before.get(a.accountId),n=after.get(a.accountId);
    if(!p||!n||!a.verifiedIdentity||a.paused||
       !FP(a.principalFingerprint)||!ID(a.personaUid)||
       !INT(a.bindingVersion)||
       p.principalFingerprint!==a.principalFingerprint||
       p.personaUid!==a.personaUid||p.bindingVersion!==a.bindingVersion||
       SAME_ROUTE.some(k=>p[k]!==n[k]))continue;
    matched.push({accountId:a.accountId,personaUid:a.personaUid,
      bindingVersion:a.bindingVersion,principalFingerprint:a.principalFingerprint,
      protected:true,sessionVerified:true,health:'HEALTHY'});
  }
  if(!matched.length)return held('NO_MATCHING_PROTECTED_ACCOUNT');
  const domain=after.get(matched[0].accountId).healthDomain;
  return {ok:true,creditedMs:end-start,receipt:{
    source:'GUARDED_OPERATIONAL_INTERVAL',origin:'S07_BOUNDED_OBSERVED',
    id,bootId,browserRunning:true,complete:true,from:start,to:end,
    accounts:matched,
    witnesses:[{accountId:matched[0].accountId,domain,
      result:'HEALTHY',routeVerified:true,observedAt:end}]
  }};
}
