// I12: one shadow queue. No provider, browser, Git, tab or native execution.
// Milliseconds are operational evidence budgets, never wall-clock deadlines.
import {fail, isSafeId} from './journal.mjs';
import {emptyRefreshEvidence,validRefreshEvidence} from './refresher-effect-core.mjs';
import {qualifyNativeOperatingInterval,qualifyBoundedObservedInterval} from './refresher-qualified-clock.mjs';
import {qualifyBrowserObservedInterval} from './refresher-browser-clock.mjs';
export const HOUR=3600000, MINUTE=60000;
export const REFRESHER_KEY='refresher:shadow:v1';
export const DEFAULT_POLICY=Object.freeze({activeMs:24*HOUR,sleepMs:72*HOUR,
  graceMs:HOUR,safetyCap:200,initialCap:10,manualCap:null,
  decreaseWindows:2,increaseWindows:3,maxAdmissions:4,staggerMs:1000,
  recentMs:10*MINUTE,statsMinMs:15*MINUTE,statsMaxMs:24*HOUR,
  readBudget:6,rawSamples:12,refreshEnabled:false});
const slugOK=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const number=(v,min,max)=>Number.isSafeInteger(v)&&v>=min&&v<=max;
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const stamp=n=>number(n,1,Number.MAX_SAFE_INTEGER);
export const queueOrder=(a,b)=>a.ordinal-b.ordinal||a.stableId.localeCompare(b.stableId,'en');

export function validatePolicy(p){
  if(!p||Object.keys(p).some(k=>!Object.hasOwn(DEFAULT_POLICY,k))||
    !number(p.activeMs,MINUTE,365*24*HOUR)||!number(p.sleepMs,MINUTE,365*24*HOUR)||
    !number(p.graceMs,MINUTE,24*HOUR)||!number(p.safetyCap,1,5000)||
    !number(p.initialCap,1,p.safetyCap)||
    !(p.manualCap===null||number(p.manualCap,1,p.safetyCap))||
    !number(p.decreaseWindows,2,12)||!number(p.increaseWindows,2,12)||
    !number(p.maxAdmissions,1,20)||!number(p.staggerMs,1000,MINUTE)||
    !number(p.recentMs,10*MINUTE,HOUR)||!number(p.statsMinMs,15*MINUTE,24*HOUR)||
    !number(p.statsMaxMs,p.statsMinMs,7*24*HOUR)||!number(p.readBudget,1,20)||
    !number(p.rawSamples,2,48)||
    (p.refreshEnabled!==undefined&&typeof p.refreshEnabled!=='boolean'))
    return fail('INVALID_REFRESHER_POLICY');
  return {ok:true};
}
export function emptyShadow(){
  return {schema:1,revision:1,mode:'SHADOW_ONLY',policy:{...DEFAULT_POLICY},
    rows:[],accounts:{},globalPause:false,nextOrdinal:1,
    capacity:{defensible:null,samples:[],observedAt:0},
    provider:{state:'UNKNOWN',witnesses:0,observedAt:0},
    bootId:null,lastTurnAt:0,nextWakeAt:0,nextAdmissionAt:0,dueIndex:[],
    nativeClock:null,browserClock:null,
    recent:{observedAt:0,total:null,complete:false,nextDueAt:0,failures:0,
      accountBackoff:{},endpointBackoffUntil:0},
    inflight:[],readWindow:{start:0,used:0},timeline:[],healthIntervals:[],
    diagnostics:{turns:0,unknownIntervals:0,replayedIntervals:0,
      admissions:0,graceReleases:0,reads:0,dropped:0,readPeak:0,queuePeak:0}};
}
export function validShadow(s){
  return s?.schema===1&&s.mode==='SHADOW_ONLY'&&number(s.revision,1,Number.MAX_SAFE_INTEGER)&&
    validatePolicy(s.policy).ok&&Array.isArray(s.rows)&&s.rows.length<=5000&&
    new Set(s.rows.map(r=>r.stableId)).size===s.rows.length&&
    s.rows.every(r=>isSafeId(r.stableId)&&slugOK(r.slug)&&isSafeId(r.accountId)&&
      number(r.ordinal,1,Number.MAX_SAFE_INTEGER)&&number(r.activeRemaining,0,365*24*HOUR)&&
      number(r.sleepRemaining,0,365*24*HOUR)&&
      (r.restCheckpointAt===undefined||number(r.restCheckpointAt,0,Number.MAX_SAFE_INTEGER))&&
      ['WAITING','ACTIVE','SLEEPING'].includes(r.phase)&&
      (!r.refresh||validRefreshEvidence(r.refresh)))&&
    Array.isArray(s.inflight)&&s.inflight.length<=2&&Array.isArray(s.timeline)&&
    s.timeline.length<=64&&Array.isArray(s.dueIndex)&&s.dueIndex.length<=5000;
}

// Only canonical account/inventory/release records supply these inputs. The
// extension command port cannot supply health, release or interval evidence.
export function reconcileShadow(s,inputs){
  if(!validShadow(s)||!Array.isArray(inputs)||inputs.length>5000)
    return fail('REFRESHER_INPUT_UNAVAILABLE');
  const seen=new Set();
  for(const item of inputs){
    if(!slugOK(item?.slug)||!isSafeId(item.accountId)||
      !number(item.bindingVersion,1,Number.MAX_SAFE_INTEGER)||
      typeof item.personaUid!=='string'||!isSafeId(item.remoteId)||seen.has(item.slug))
      return fail('REFRESHER_INPUT_AMBIGUOUS');
    seen.add(item.slug);
  }
  const out=structuredClone(s),bySlug=new Map(out.rows.map(r=>[r.slug,r]));
  for(const input of inputs){
    let r=bySlug.get(input.slug);
    if(!r){
      if(out.rows.length>=5000)return fail('REFRESHER_FLEET_LIMIT');
      const ordinal=out.nextOrdinal++;
      r={stableId:'rfgen_'+String(ordinal).padStart(12,'0'),slug:input.slug,
        accountId:input.accountId,personaUid:input.personaUid,bindingVersion:input.bindingVersion,
        remoteId:input.remoteId,phase:'WAITING',activeRemaining:out.policy.activeMs,
        sleepRemaining:0,ordinal,cycle:0,slot:false,paused:false,
        activeMs:out.policy.activeMs,sleepMs:out.policy.sleepMs,timingOverride:false,checkpoint:0,
        admittedAt:0,allocationEpoch:0,restCheckpointAt:0,refresh:emptyRefreshEvidence(),
        metrics:{raw:[],latest:null,nextDueAt:0,failures:0}};
      out.rows.push(r);bySlug.set(r.slug,r);
    }
    // Never transplant an old allocation/approval to a reincarnated target.
    const identityChanged=r.remoteId!==input.remoteId||r.accountId!==input.accountId||
      r.personaUid!==input.personaUid||r.bindingVersion!==input.bindingVersion;
    const releaseChanged=r.releaseFingerprint!=null&&
      r.releaseFingerprint!==input.releaseFingerprint;
    if(r.updateNow&&(identityChanged||input.updateNowComplete===true||input.updateNowCandidate===null||
       input.updateNowCandidate&&(r.updateNow.readyIdentifier!==input.updateNowCandidate.identifier||r.updateNow.readyInputFingerprint!==input.updateNowCandidate.inputFingerprint)))delete r.updateNow;
    r.identityHeld=identityChanged;
    // A new independently confirmed release F supersedes any prior marker
    // lineage; never reuse a saved marker as authority for the next source.
    if(identityChanged||releaseChanged||!r.refresh)r.refresh=emptyRefreshEvidence();
    r.ownerVerified=input.ownerVerified===true&&!identityChanged;
    r.releaseVerified=input.releaseVerified===true&&hex(input.releaseFingerprint)&&!identityChanged;
    r.releaseFingerprint=r.releaseVerified?input.releaseFingerprint:null;
    r.sourceAuthority=r.releaseVerified&&[
      'INDEPENDENT_PUBLICATION_READBACK','ADOPTED_FULL_ORIGINAL_READBACK'
    ].includes(input.sourceAuthority)?input.sourceAuthority:'UNVERIFIED';
    r.listing=input.listing==='PUBLIC'?'PUBLIC':input.listing==='UNLISTED'?'UNLISTED':'UNKNOWN';
    r.reviewHeld=input.reviewHeld===true;
    r.readyUpdate=input.readyUpdate===true;
    r.observedAt=input.observedAt||0;
    const a=out.accounts[r.accountId]||{paused:false,graceUsed:0,checkpoint:0,
      health:'UNKNOWN',bindingVersion:r.bindingVersion,personaUid:r.personaUid};
    if(a.bindingVersion!==input.bindingVersion||a.personaUid!==input.personaUid){
      a.health='UNKNOWN';a.graceUsed=0;
    }
    a.bindingVersion=input.bindingVersion;a.personaUid=input.personaUid;
    a.verifiedIdentity=input.accountVerified===true;
    a.principalFingerprint=input.principalFingerprint||null;
    out.accounts[r.accountId]=a;
  }
  for(const r of out.rows)if(!seen.has(r.slug)){r.ownerVerified=false;r.listing='UNKNOWN';}
  return {ok:true,state:out};
}

export function classifyProvider(witnesses,at){
  if(!Array.isArray(witnesses)||witnesses.length>50||!stamp(at))
    return {state:'UNKNOWN',witnesses:0,observedAt:0};
  // Distinct request IDs or Personas sharing one local dependency are NOT
  // independent corroboration. 429, login failures and local errors excluded.
  const usable=witnesses.filter(w=>w.routeVerified===true&&
    isSafeId(w.domain)&&isSafeId(w.accountId)&&w.observedAt===at&&
    ['HEALTHY','PROVIDER_UNAVAILABLE'].includes(w.result));
  const independent=kind=>new Set(usable.filter(w=>w.result===kind).map(w=>w.domain)).size;
  const up=independent('HEALTHY'),down=independent('PROVIDER_UNAVAILABLE');
  return {state:up>=2&&down===0?'HEALTHY':down>=2&&up===0?'OUTAGE':
    up||down?'SUSPECT':'UNKNOWN',witnesses:Math.max(up,down),observedAt:at};
}
export function rowBlocks(s,r){
  const a=s.accounts[r.accountId];
  return [s.globalPause&&'GLOBAL_PAUSE',a?.paused&&'ACCOUNT_PAUSE',r.paused&&'GENERATOR_PAUSE',
    r.identityHeld&&'BINDING_CHANGED',!r.ownerVerified&&'OWNER_UNVERIFIED',
    !r.releaseVerified&&'PUBLICATION_UNVERIFIED',r.listing!=='PUBLIC'&&'LISTING_UNVERIFIED',
    r.updateNow&&'OPERATOR_UPDATE_REQUESTED',r.reviewHeld&&'REVIEW_UNLISTING',r.refresh?.suspended&&'VISIBILITY_SUSPENDED',
    a?.health!=='HEALTHY'&&'ACCOUNT_UNAVAILABLE',
    s.provider.state==='OUTAGE'&&'PROVIDER_OUTAGE'].filter(Boolean);
}
export function admissionBlocks(s,r){
  return [...rowBlocks(s,r),r.readyUpdate&&'READY_UPDATE_FIRST',
    r.sleepRemaining>0&&'MINIMUM_SLEEP',r.slot&&'SLOT_OCCUPIED'].filter(Boolean);
}
export function effectiveCapacity(s,now){
  const population=s.rows.filter(r=>r.ownerVerified&&r.releaseVerified&&
    !r.identityHeld&&r.listing==='PUBLIC');
  const demand=population.reduce((sum,r)=>sum+r.activeMs/(r.activeMs+r.sleepMs),0);
  const practical=s.capacity.defensible??s.policy.initialCap;
  const planning=Math.max(population.length?1:0,Math.ceil(demand));
  const cap=Math.min(s.policy.safetyCap,practical,s.policy.manualCap??planning);
  return {cap,demand,population:population.length,practical,
    warning:s.capacity.defensible===null?'CAPACITY_UNOBSERVED':
      now-s.capacity.observedAt>3*s.policy.recentMs?'CAPACITY_STALE':
      s.policy.manualCap!==null&&s.policy.manualCap>practical?'OVERRIDE_ABOVE_OBSERVATION':null};
}
export function observeCapacity(s,{at,usablePositions,complete,credible=false}){
  if(!stamp(at)||!number(usablePositions,0,5000)||complete!==true)
    return fail('CAPACITY_OBSERVATION_UNVERIFIED');
  if(at<=s.capacity.observedAt)return fail('STALE_OBSERVATION');
  const out=structuredClone(s),c=out.capacity;
  c.observedAt=at;
  c.samples=[...c.samples,{at,value:usablePositions}].slice(-12);
  const current=c.defensible??out.policy.initialCap;
  const windows=usablePositions<current?out.policy.decreaseWindows:out.policy.increaseWindows;
  const last=c.samples.slice(-windows);
  // Increases need distinct ~10-minute windows. A complete page length is
  // merely a sample, never an exact or permanent provider slot promise.
  const consistent=last.length===windows&&last.every(x=>x.value===usablePositions)&&
    last.every((x,i)=>!i||x.at-last[i-1].at>=out.policy.recentMs);
  if(consistent||(credible===true&&usablePositions<current))c.defensible=usablePositions;
  return {ok:true,state:out};
}

function receiptValid(e,bootId){
  return e?.source==='GUARDED_OPERATIONAL_INTERVAL'&&isSafeId(e.id)&&
    e.browserRunning===true&&e.complete===true&&e.bootId===bootId&&
    stamp(e.from)&&stamp(e.to)&&e.to>e.from&&e.to-e.from<=12*HOUR&&
    Array.isArray(e.accounts)&&e.accounts.length<=1000&&
    new Set(e.accounts.map(a=>a.accountId)).size===e.accounts.length&&
    e.accounts.every(a=>isSafeId(a.accountId)&&number(a.bindingVersion,1,Number.MAX_SAFE_INTEGER)&&
      typeof a.personaUid==='string'&&
      (a.health!=='HEALTHY'||hex(a.principalFingerprint))&&
      ['HEALTHY','UNAVAILABLE','UNKNOWN'].includes(a.health)&&
      (a.health!=='HEALTHY'||(a.protected===true&&a.sessionVerified===true)));
}
export function advanceShadow(s,{now,bootId,receipt=null,nativeClock=undefined,
  browserClock=undefined,qualifiedCoverages=null}={}){
  if(!validShadow(s)||!stamp(now)||!isSafeId(bootId))return fail('REFRESHER_STATE_UNAVAILABLE');
  const out=structuredClone(s),changes=[];
  const restarted=out.bootId!==bootId;
  if(restarted){
    out.bootId=bootId;
    // No newly started background incarnation inherits an earlier uptime proof.
    out.browserClock=null;
    // Read-only claims interrupted by event-page death get cooldown, not a
    // replay on entry. No mutating claim exists in shadow mode.
    for(const claim of out.inflight){
      if(claim.kind==='RECENT')out.recent.nextDueAt=Math.max(now+MINUTE,out.recent.nextDueAt);
      else {const r=out.rows.find(x=>x.stableId===claim.stableId);
        if(r)r.metrics.nextDueAt=Math.max(now+MINUTE,r.metrics.nextDueAt);}
    }
    out.inflight=[];
    for(const a of Object.values(out.accounts))a.health='UNKNOWN';
  }
  // A guarded native witness alone never grants provider/account time.
  // It only seeds a prospective host-awake window for the NEXT turn. The
  // next turn requires the original uninterrupted native pipe *and* explicit
  // independent provider+account continuous coverage before any credit.
  let operationalReceipt=receipt;
  // Browser-only evidence: a bounded monotonic span within this same running
  // background incarnation, independently ready routes at both endpoints
  // and a previously complete recent feed. Lost wake, process death, suspend,
  // restart and clock jumps never produce retrospective active credit.
  if(browserClock!==undefined){
    const valid=b=>b&&Number.isSafeInteger(b.observedAtMs)&&
      b.observedAtMs>0&&b.observedAtMs<=now&&
      isSafeId(b.runtimeEpoch)&&Number.isFinite(b.monotonicMs)&&
      b.monotonicMs>=0&&Array.isArray(b.routes)&&b.routes.length<=1000;
    if(valid(browserClock)){
      const previous=out.browserClock?.witness;
      if(!operationalReceipt&&valid(previous)){
        const observed=qualifyBrowserObservedInterval({
          previous,next:browserClock,recent:out.recent,bootId,
          id:'browser_'+String(out.revision).padStart(8,'0'),
          accounts:Object.entries(out.accounts).map(([accountId,a])=>({
            accountId,...a}))});
        if(observed.ok)operationalReceipt=observed.receipt;
      }
      out.browserClock={bootId,witness:structuredClone(browserClock)};
    }else out.browserClock=null;
  }
  const nativeOK=n=>n&&Number.isSafeInteger(n.observedAtMs)&&
    n.observedAtMs>0&&n.observedAtMs<=now&&
    ['observerEpoch','systemBootId','nativeLifetimeId','observerConnectionId']
      .every(k=>isSafeId(n[k]))&&Number.isSafeInteger(n.sequence)&&n.sequence>0&&
    ['hostAwakeNs','hostBootNs'].every(k=>
      typeof n[k]==='string'&&/^\d{1,24}$/.test(n[k]));
  if(nativeOK(nativeClock)){
    const previous=out.nativeClock;
    // Never credit two windows in one reducer transition.
    // An event-page wake changes bootId but does not necessarily close the
    // ORIGINAL native connection. The OS boot/pipe/lifetime/sequence counters
    // and continuous provider/session coverage decide this, not a JS module
    // instance ID. Actual Firefox/native death changes those witnesses.
    if(!operationalReceipt&&nativeOK(previous?.witness)&&
       nativeClock.observedAtMs>previous.witness.observedAtMs&&
       qualifiedCoverages?.source==='DONOR_CONTINUOUS_COVERAGE'){
      const result=qualifyNativeOperatingInterval({
        previous:previous.witness,next:nativeClock,
        bootId,id:'qualified_'+String(out.revision).padStart(8,'0'),
        providerCoverages:qualifiedCoverages.providers,
        accountCoverages:qualifiedCoverages.accounts});
      if(result.ok)operationalReceipt=result.receipt;
    }
    // Production: use actual guarded feed and protected-route observations
    // at two consecutive original-native-pipe samples, not imaginary 24h
    // future-valid certificates. At most two minutes; unknown gaps freeze.
    if(!operationalReceipt&&nativeOK(previous?.witness)&&
       nativeClock.observedAtMs>previous.witness.observedAtMs&&
       Array.isArray(previous.witness.routes)&&Array.isArray(nativeClock.routes)){
      const bounded=qualifyBoundedObservedInterval({
        previous:previous.witness,next:nativeClock,recent:out.recent,
        accounts:Object.entries(out.accounts).map(([accountId,a])=>({
          accountId,...a})),bootId,
        id:'observed_'+String(out.revision).padStart(8,'0'),
        recentMs:out.policy.recentMs});
      if(bounded.ok)operationalReceipt=bounded.receipt;
    }
    // Keep only the last bounded sample in the canonical journal. A crash,
    // browser boot change, suspended interval or missing coverage cannot
    // retroactively be repaired by two later endpoint observations.
    out.nativeClock={bootId,witness:structuredClone(nativeClock)};
  }else if(nativeClock!==undefined){
    // A deliberate native sample failure severs continuity. An unrelated
    // canonical feed/statistic receipt does not sample the native host at
    // all and must not erase the original continuous pipe witness.
    out.nativeClock=null;
  }
  let credited=0,reason='CLOCK_EVIDENCE_INCOMPLETE';
  if(receiptValid(operationalReceipt,bootId)&&operationalReceipt.to<=now&&
    (!out.lastTurnAt||now>=out.lastTurnAt)){
    const e=operationalReceipt,provider=classifyProvider(e.witnesses,e.to);
    const priorProvider=out.provider.state;
    if(provider.observedAt>=out.provider.observedAt&&
      (['HEALTHY','OUTAGE'].includes(provider.state)||
        (out.provider.state!=='OUTAGE'&&
          (out.provider.state!=='HEALTHY'||provider.observedAt-out.provider.observedAt>MINUTE))))
      out.provider=provider;
    // C-68/C-69: one fleet-wide provider incident, resolved only by an
    // independently witnessed healthy provider observation.
    if(out.provider.state==='OUTAGE'&&priorProvider!=='OUTAGE')
      changes.push({code:'PROVIDER_OUTAGE',scopeId:'provider_perchance'});
    if(out.provider.state==='HEALTHY'&&priorProvider==='OUTAGE')
      changes.push({code:'PROVIDER_RECOVERED',scopeId:'provider_perchance'});
    reason=provider.state==='OUTAGE'?'PROVIDER_OUTAGE':
      e.origin==='S07_NATIVE_CAUSAL_WINDOW'?'NATIVE_ELIGIBILITY_CONFIRMED':
      e.origin==='S07_BOUNDED_OBSERVED'?'BOUNDED_GUARDED_ELIGIBILITY':
      e.origin==='A06_BROWSER_OBSERVED'?'BROWSER_MONOTONIC_ELIGIBILITY':'EVIDENCED_INTERVAL';
    const health=new Map(e.accounts.map(a=>[a.accountId,a]));
    for(const [id,a] of Object.entries(out.accounts)){
      const h=health.get(id),matched=h?.bindingVersion===a.bindingVersion&&
        h.personaUid===a.personaUid&&
        h.principalFingerprint===a.principalFingerprint;
      if(!h)continue;
      const interval=Math.max(0,e.to-Math.max(e.from,a.checkpoint));
      if(!interval)continue;
      a.checkpoint=e.to;
      const wasExpired=a.graceExpired===true;
      a.health=matched?h.health:'UNKNOWN';a.healthAt=e.to;
      if(a.health==='HEALTHY'){a.graceUsed=0;
        if(wasExpired){a.graceExpired=false;
          changes.push({code:'ACCOUNT_ROUTE_RECOVERED',scopeId:id});}}
      if(a.health==='UNAVAILABLE'&&provider.state==='HEALTHY')a.graceUsed+=interval;
      if(a.health==='UNAVAILABLE'&&a.graceUsed>=out.policy.graceMs){
        let released=0;
        for(const r of out.rows)if(r.accountId===id&&r.slot){
          r.slot=false;r.phase='WAITING';released++;out.diagnostics.graceReleases++;
        }
        if(released){a.graceExpired=true;
          changes.push({code:'ACCOUNT_GRACE_EXPIRED',scopeId:id,count:released});}
      }
    }
    for(const r of out.rows){
      const delta=Math.max(0,e.to-Math.max(e.from,r.checkpoint,r.admittedAt||0));
      if(!delta){out.diagnostics.replayedIntervals++;continue;}
      const h=health.get(r.accountId);
      if(h?.health!=='HEALTHY'||h.bindingVersion!==r.bindingVersion||
         h.personaUid!==r.personaUid||
         h.principalFingerprint!==out.accounts[r.accountId]?.principalFingerprint)continue;
      r.checkpoint=e.to;
      if(rowBlocks(out,r).length||r.phase==='WAITING')continue;
      let remaining=delta;
      if(r.phase==='ACTIVE'){
        const used=Math.min(remaining,r.activeRemaining);r.activeRemaining-=used;
        remaining-=used;credited+=used;
        if(r.activeRemaining===0){
          r.slot=false;r.phase='SLEEPING';r.sleepRemaining=r.sleepMs;
          r.restCheckpointAt=e.to;r.cycle++;
          changes.push({code:'ACTIVE_COMPLETED',scopeId:r.stableId});
        }
      }
      // Sleep is a wall-clock rest, not a qualified operating budget.
      // It is handled once below, even if the browser/provider is offline.
    }
  }else out.diagnostics.unknownIntervals++;
  // A06 wall rest: persist checkpoint per sleeping generator. Never credit a
  // reversed clock or a gross (>90-day) unexplained forward jump. A legacy
  // sleeping row without an anchor starts prospectively at this turn.
  // This logic runs even with a dead provider, no native host, or a new boot.
  for(const r of out.rows)if(r.phase==='SLEEPING'){
    if(!stamp(r.restCheckpointAt)){
      r.restCheckpointAt=now;
      continue;
    }
    const elapsed=now-r.restCheckpointAt;
    if(elapsed<=0)continue; // rollback cannot move the anchor backwards
    if(elapsed>90*24*HOUR){
      out.diagnostics.unknownIntervals++;
      r.restCheckpointAt=now; // isolate discontinuity; never grant 90d
      continue;
    }
    if(out.globalPause||out.accounts[r.accountId]?.paused||r.paused){
      r.restCheckpointAt=now;continue;
    }
    const used=Math.min(elapsed,r.sleepRemaining);
    r.sleepRemaining-=used;
    r.restCheckpointAt=now;
    if(r.sleepRemaining===0){
      r.phase='WAITING';r.activeRemaining=r.activeMs;r.ordinal=out.nextOrdinal++;
      r.restCheckpointAt=0;
      changes.push({code:'SLEEP_COMPLETED',scopeId:r.stableId});
    }
  }
  for(const a of Object.values(out.accounts))if(!a.healthAt||now-a.healthAt>MINUTE)
    a.health='UNKNOWN';
  for(const c of [...out.inflight])if(c.deadline<now){
    out.inflight=out.inflight.filter(x=>x.claimId!==c.claimId);
    out.diagnostics.dropped++;
    if(c.kind==='RECENT')out.recent.nextDueAt=now+out.policy.recentMs;
    else {const r=out.rows.find(x=>x.stableId===c.stableId);
      if(r)r.metrics.nextDueAt=now+out.policy.statsMinMs;}
  }
  const capacity=effectiveCapacity(out,now);
  let occupied=out.rows.filter(r=>r.slot).length;
  const perAccount=new Set();
  const candidates=out.rows.filter(r=>r.phase==='WAITING'&&!admissionBlocks(out,r).length).sort(queueOrder);
  for(const r of candidates){
    if(now<out.nextAdmissionAt)break;
    if(occupied>=capacity.cap||perAccount.size>=out.policy.maxAdmissions)break;
    if(perAccount.has(r.accountId))continue;
    r.slot=true;r.phase='ACTIVE';r.allocationEpoch++;
    r.admittedAt=now+perAccount.size*out.policy.staggerMs;
    r.checkpoint=Math.max(r.checkpoint,now);perAccount.add(r.accountId);occupied++;
    out.diagnostics.admissions++;changes.push({code:'SHADOW_ADMITTED',scopeId:r.stableId});
  }
  if(perAccount.size)out.nextAdmissionAt=now+MINUTE;
  out.timeline=[...out.timeline,{at:now,from:receipt?.from||null,to:receipt?.to||null,
    reason,creditedMs:credited}].slice(-64);
  out.lastTurnAt=Math.max(out.lastTurnAt,now);out.nextWakeAt=now+MINUTE;
  out.dueIndex=out.rows.filter(r=>r.phase!=='ACTIVE'||r.slot)
    .map(r=>({stableId:r.stableId,ordinal:r.ordinal,dueAt:
      r.phase==='WAITING'?now:now+Math.min(r.activeRemaining||r.sleepRemaining,MINUTE)}))
    .sort((a,b)=>a.dueAt-b.dueAt||queueOrder(a,b));
  out.diagnostics.turns++;out.diagnostics.queuePeak=Math.max(out.diagnostics.queuePeak,candidates.length);
  return {ok:true,state:out,changes,capacity,occupied,providerEffects:'OFF'};
}

export function applyStatistic(s,claim,sample,now){
  const out=structuredClone(s),r=out.rows.find(x=>x.stableId===claim?.stableId);
  if(!r||r.bindingVersion!==claim.bindingVersion||r.personaUid!==claim.personaUid||
    r.remoteId!==claim.remoteId||r.identityHeld||!r.ownerVerified)return fail('STATISTIC_CONTEXT_CHANGED');
  if(!stamp(sample?.observedAt)||sample.observedAt!==claim.startedAt||sample.observedAt>now||
    !number(sample.views,0,Number.MAX_SAFE_INTEGER)||sample.unit!=='VIEWS'||
    sample.source!=='GUARDED_READ_ONLY')return fail('STATISTIC_UNVERIFIED');
  const previous=r.metrics.latest;
  if(previous&&sample.observedAt<=previous.observedAt)return fail('STALE_OBSERVATION');
  const correction=previous?sample.views<previous.views:false;
  const point={views:sample.views,observedAt:sample.observedAt,unit:'VIEWS',
    source:'GUARDED_READ_ONLY',delta:previous&&!correction?sample.views-previous.views:null,
    correction};
  r.metrics.latest=point;r.metrics.raw=[...r.metrics.raw,point].slice(-out.policy.rawSamples);
  r.metrics.failures=0;
  const interval=r.phase==='ACTIVE'||r.metrics.demandUntil>now?
    out.policy.statsMinMs:Math.min(out.policy.statsMaxMs,4*out.policy.statsMinMs);
  r.metrics.nextDueAt=now+interval;
  return {ok:true,state:out};
}
export function claimObservation(s,{kind,stableId=null,now,bootId,claimId,preferredAccountId=null}={}){
  if(!validShadow(s)||!['RECENT','STATISTIC'].includes(kind)||!stamp(now)||
    !isSafeId(bootId)||!isSafeId(claimId))return fail('INVALID_OBSERVATION_CLAIM');
  const out=structuredClone(s);
  if(out.inflight.length>=2)return fail('READ_BACKPRESSURE');
  if(out.inflight.some(c=>c.claimId===claimId))return fail('OBSERVATION_ID_REUSED');
  if(now<out.readWindow.start||now-out.readWindow.start>=out.policy.recentMs)
    out.readWindow={start:now,used:0};
  if(out.readWindow.used>=out.policy.readBudget)return fail('SHARED_READ_BUDGET');
  const r=kind==='STATISTIC'?out.rows.find(x=>x.stableId===stableId):null;
  if(kind==='RECENT'&&out.recent.suspended)return fail('OBSERVATIONS_SUSPENDED');
  if(kind==='RECENT'&&(out.recent.endpointBackoffUntil||0)>now)
    return fail('RECENT_ENDPOINT_RATE_LIMITED');
  if(kind==='RECENT'&&(out.recent.nextDueAt>now||out.inflight.some(c=>c.kind==='RECENT')))
    return fail('OBSERVATION_COALESCED');
  if(kind==='STATISTIC'&&(!r||r.identityHeld||!r.ownerVerified||r.metrics.suspended||r.metrics.nextDueAt>now||
    out.inflight.some(c=>c.stableId===stableId||c.accountId===r.accountId)))
    return fail('STATISTIC_NOT_DUE');
  const accountId=r?.accountId||preferredAccountId||Object.entries(out.accounts).find(([id,a])=>
    a.verifiedIdentity&&!out.inflight.some(c=>c.accountId===id))?.[0];
  const a=out.accounts[accountId];
  if(!a||!a.verifiedIdentity)return fail('ACCOUNT_UNAVAILABLE');
  const claim={claimId,kind,bootId,startedAt:now,accountId,personaUid:a.personaUid,
    bindingVersion:a.bindingVersion,principalFingerprint:a.principalFingerprint,
    stableId:r?.stableId||null,slug:r?.slug||null,
    remoteId:r?.remoteId||null,deadline:now+30000};
  out.inflight.push(claim);out.readWindow.used++;out.diagnostics.reads++;
  out.diagnostics.readPeak=Math.max(out.diagnostics.readPeak,out.inflight.length);
  return {ok:true,state:out,claim};
}
