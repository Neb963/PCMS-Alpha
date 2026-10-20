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

function certified(c,source){
  return c?.source===source&&ID(c.id)&&INT(c.validFromMs)&&INT(c.validUntilMs)&&
    c.validUntilMs>c.validFromMs&&c.held===false&&c.generationValid===true;
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
  if(!ID(bootId)||!ID(id)||!previous||!next||
     !INT(previous.observedAtMs)||!INT(next.observedAtMs)||
     !Array.isArray(providerCoverages)||providerCoverages.length>16||
     !Array.isArray(accountCoverages)||accountCoverages.length>1000||
     !INT(maxGapMs)||maxGapMs>MAX_NATIVE_GAP||
     !Number.isSafeInteger(uncertaintyMs)||uncertaintyMs<0||uncertaintyMs>1000)
    return held('NATIVE_INTERVAL_INVALID');
  const start=previous.observedAtMs;
  if(providerCoverages.length<2||providerCoverages.some(c=>
      !certified(c,'DONOR_CONTINUOUS_PROVIDER')||!ID(c.domain)||
      !ID(c.accountId)||c.routeVerified!==true||
      c.result!=='HEALTHY'))
    return held('PROVIDER_COVERAGE_NOT_PROVEN');
  if(new Set(providerCoverages.map(c=>c.domain)).size<2)
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
       !certified(a.route,'DONOR_CONTINUOUS_ROUTE')||
       !certified(a.session,'DONOR_CONTINUOUS_SESSION')||
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
