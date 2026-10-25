// Synchronous listeners, one coalesced scheduler alarm, canonical turn/claim
// fences. I14 conditional executor is present but default production gate OFF.
import {fail,openCanonicalDatabase,createRestoreSentinel,isSafeId,createCanonicalStore} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {createRefresherStore} from './refresher-store.mjs';
import {backfillLegacyAdoptions} from './refresher-adopted.mjs';
import {MINUTE,rowBlocks,effectiveCapacity} from './refresher-core.mjs';
import {qualifyRecentAbsence} from './refresher-admission.mjs';
import {createNoticeDispatcher} from './notices.mjs';
// A saved source marker is not an observation that the target returned to
// Perchance's independently read recent-generator feed.
export function verifiedRefreshFeed(row){
 const evidence=row?.refresh,last=evidence?.history?.at(-1);
 const feed=row?.presence;
 return last?.effect==='EFFECT_CONFIRMED'&&
   evidence.savedSourceFingerprint!=null&&
   evidence.awaitingVisibility===false&&
   !evidence.intent&&
   feed?.source==='GUARDED_RECENT_LIST'&&feed.present===true&&
   Number.isSafeInteger(feed.position)&&feed.position>=1&&
   Number.isSafeInteger(feed.observedAt)&&feed.observedAt>last.at;
}
// A legitimate active-time observation must happen before Firefox's idle
// event page can disappear. This is a work hint, never time/source authority.
export const REFRESHER_CLOCK_PULSE_MS=20_000;
export function needsActiveClock(state,routes=[],now=Date.now()){
 if(!state||!state.policy||!state.capacity||!state.accounts||state.globalPause||!Array.isArray(state.rows)||!Array.isArray(routes)||
    !Number.isSafeInteger(now)||state.recent?.complete!==true||state.recent.suspended||
    !Number.isSafeInteger(state.recent.observedAt)||state.recent.observedAt<=0||
    state.recent.observedAt>now||now-state.recent.observedAt>600_000)return false;
 const ready=new Set(routes.filter(r=>{
  const a=state.accounts?.[r.accountId];
  return r.ready===true&&a?.verifiedIdentity===true&&!a.paused&&
    r.personaUid===a.personaUid&&r.bindingVersion===a.bindingVersion&&
    r.principalFingerprint===a.principalFingerprint&&
    typeof r.cookieStoreId==='string'&&r.cookieStoreId&&
    typeof r.routeId==='string'&&r.routeId&&!['direct','block'].includes(r.routeId)&&
    typeof r.healthDomain==='string'&&r.healthDomain;
 }).map(r=>r.accountId));
 const occupied=state.rows.filter(r=>r.slot).length,capacity=effectiveCapacity(state,now).cap;
 return state.rows.some(r=>ready.has(r.accountId)&&!r.readyUpdate&&
   (r.phase==='ACTIVE'&&r.slot||r.phase==='WAITING'&&!r.slot&&!r.sleepRemaining&&occupied<capacity)&&
   rowBlocks(state,r).every(code=>code==='ACCOUNT_UNAVAILABLE'));
}
export const REFRESHER_PORT='pcms-i12-refresher',REFRESHER_ALARM='pcms-refresher-turn';
const types=new Set(['GET_REFRESHER','SET_POLICY','SET_PAUSE','SET_GENERATOR_POLICY','DEMAND_STATISTIC','OBSERVE_NOW','RESET_RECENT_BACKOFF','DIAGNOSTIC_TARGET_REFRESH']);
export function validateRefresherMessage(api,sender,message){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let encoded;try{encoded=JSON.stringify(message);}catch{return fail('INVALID_MESSAGE');}
  if(!message||typeof message!=='object'||Array.isArray(message)||!types.has(message.type)||
    !encoded||encoded.length>1600||Object.keys(message).some(k=>!['type','params'].includes(k)))
    return fail('INVALID_MESSAGE');
  const p=message.params||{};
  if(!p||typeof p!=='object'||Array.isArray(p))return fail('INVALID_PARAMS');
  const allowed=message.type==='GET_REFRESHER'?['query','phase','accountId','offset','limit']:
    message.type==='SET_POLICY'?['expectedRevision','policy']:
    message.type==='SET_PAUSE'?['expectedRevision','scope','target','paused']:
    message.type==='SET_GENERATOR_POLICY'?['expectedRevision','stableId','activeMs','sleepMs','useDefaults']:
    message.type==='DEMAND_STATISTIC'?['expectedRevision','stableId']:
    message.type==='RESET_RECENT_BACKOFF'?['expectedRevision']:
    message.type==='DIAGNOSTIC_TARGET_REFRESH'?['slug','accountId','runId']:[];
  if(Object.keys(p).some(k=>!allowed.includes(k)))return fail('INVALID_PARAMS');
  if(message.type==='SET_GENERATOR_POLICY'&&
     (p.useDefaults!==undefined&&typeof p.useDefaults!=='boolean'||
      p.useDefaults===true&&(p.activeMs!==undefined||p.sleepMs!==undefined)))return fail('INVALID_PARAMS');
  if(message.type==='GET_REFRESHER'){
    if((p.query!=null&&(typeof p.query!=='string'||p.query.length>80))||
      (p.accountId!=null&&p.accountId!==''&&!isSafeId(p.accountId))||
      (p.phase!=null&&!['ALL','WAITING','ACTIVE','SLEEPING','HELD','INELIGIBLE'].includes(p.phase))||
      (p.offset!=null&&(!Number.isSafeInteger(p.offset)||p.offset<0||p.offset>5000))||
      (p.limit!=null&&(!Number.isSafeInteger(p.limit)||p.limit<1||p.limit>50)))return fail('INVALID_PARAMS');
  }else if(message.type==='DIAGNOSTIC_TARGET_REFRESH'){
    if(typeof p.slug!=='string'||!/^pcms-test-[a-z0-9-]{1,86}$/.test(p.slug)||
      !isSafeId(p.accountId)||typeof p.runId!=='string'||
      !/^s08_[a-f0-9]{12,32}$/.test(p.runId))return fail('INVALID_PARAMS');
  }else if(message.type!=='OBSERVE_NOW'){
    if(!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1)return fail('INVALID_PARAMS');
    if(['DEMAND_STATISTIC','SET_GENERATOR_POLICY'].includes(message.type)&&!isSafeId(p.stableId))
      return fail('INVALID_PARAMS');
    if(message.type==='SET_POLICY'&&(!p.policy||typeof p.policy!=='object'||Array.isArray(p.policy)))
      return fail('INVALID_PARAMS');
    if(message.type==='SET_PAUSE'&&(!['GLOBAL','ACCOUNT','GENERATOR'].includes(p.scope)||
      (p.scope!=='GLOBAL'&&!isSafeId(p.target))||typeof p.paused!=='boolean'))return fail('INVALID_PARAMS');
  }
  return {ok:true};
}
export function createRefresherBoundary(api,{open=openCanonicalDatabase,storeFactory=createRefresherStore,
  guard=internalPcmsGuard,observationGate=()=>false,
  refreshGate=()=>false,qualificationFor=()=>null,refreshAdapter=null,clock=Date.now,
  nativeClockGate=()=>false,continuousCoverageFor=()=>null,
  browserClockGate=()=>false,monotonicClock=()=>performance.now(),
  clockPulseMs=REFRESHER_CLOCK_PULSE_MS,setClockTimer=(fn,ms)=>setTimeout(fn,ms),
  clearClockTimer=id=>clearTimeout(id),
  newId=()=>crypto.randomUUID().replaceAll('-','')}={}){
  let dbPromise,turnPromise=null,registered=false,alarmHeld=false,alarmTail=Promise.resolve();
  const bootId=newId(),sentinel=createRestoreSentinel(api.storage.local);
  let clockTimer=null,clockGeneration=0;
  const pulse=Number.isSafeInteger(clockPulseMs)&&clockPulseMs>=1000&&clockPulseMs<=REFRESHER_CLOCK_PULSE_MS?clockPulseMs:0;
  function stopActiveClock(){
    clockGeneration++;
    if(clockTimer!==null)try{clearClockTimer(clockTimer);}catch{}
    clockTimer=null;
  }
  function followActiveClock(state,routes){
    stopActiveClock();
    if(!registered||!pulse||!browserClockGate()||!needsActiveClock(state,routes,clock()))return;
    const generation=clockGeneration;
    clockTimer=setClockTimer(()=>{
      if(generation!==clockGeneration)return;
      clockTimer=null;void tick();
    },pulse);
    clockTimer?.unref?.();
  }
  const store=async()=>storeFactory(await (dbPromise ||=open().catch(e=>{dbPromise=null;throw e;})));
  async function notifyChanges(result){
    for(const change of result?.changes||[]){
      let d;try{d=createNoticeDispatcher(api,createCanonicalStore(await dbPromise));}catch{continue;}
      try{
        if(change.code==='ACCOUNT_GRACE_EXPIRED')await d.emit({scopeId:change.scopeId,
          code:'ROUTE_UNAVAILABLE',severity:'ACTION_REQUIRED',revision:result.revision,
          cause:'ACCOUNT_ROUTE_UNAVAILABLE'});
        else if(change.code==='ACCOUNT_ROUTE_RECOVERED')await d.resolve({scopeId:change.scopeId,
          code:'ROUTE_UNAVAILABLE',evidence:'ROUTE_HEALTH_OBSERVED'});
        else if(change.code==='PROVIDER_OUTAGE')await d.emit({scopeId:change.scopeId,
          code:'PROVIDER_OUTAGE',severity:'SERIOUS',revision:result.revision});
        else if(change.code==='PROVIDER_RECOVERED')await d.resolve({scopeId:change.scopeId,
          code:'PROVIDER_OUTAGE',evidence:'PROVIDER_HEALTH_WITNESSED'});
      }catch{}
    }
  }
  async function schedule(when){
    try{
      const desired=Math.max(clock()+MINUTE,when||0);
      // Every event-page wake (any 1-minute periodic alarm, port or startup)
      // runs a turn. Recreating the alarm at now+1min on each wake postponed
      // it forever, so the Refresher never woke on its own. Never move an
      // earlier pending (including overdue) alarm later; only advance it.
      let pending=null;try{pending=await api.alarms.get(REFRESHER_ALARM);}catch{}
      if(pending?.name===REFRESHER_ALARM&&Number.isFinite(pending.scheduledTime)&&
        pending.scheduledTime<=desired){alarmHeld=false;return;}
      await api.alarms.create(REFRESHER_ALARM,{when:desired});
      const actual=await api.alarms.get(REFRESHER_ALARM);
      if(!actual||actual.name!==REFRESHER_ALARM)alarmHeld=true;else alarmHeld=false;
    }catch{
      // An ambiguous create ACK is independently reconciled, not multiplied.
      try{alarmHeld=!(await api.alarms.get(REFRESHER_ALARM));}catch{alarmHeld=true;}
    }
  }
  async function safeBreadcrumb(result,code,sourceWritePossible=false){
    try{
      const d=result?.state?.diagnostics||{};
      const previous=(await api.storage.local.get('pcmsI12Status'))?.pcmsI12Status;
      const prior=Number.isSafeInteger(previous?.mutations)&&previous.mutations>=0?
        previous.mutations:0;
      // Redacted durable count of possibly dispatched guarded source writes.
      // Never report permanent zero after the operator enabled mutations.
      const mutations=Math.min(999999,prior+(sourceWritePossible?1:0));
      await api.storage.local.set({pcmsI12Status:{
        mode:result?.state?.policy?.refreshEnabled===true?
          'GUARDED_REFRESH_ENABLED':'SHADOW_ONLY',
        code:code||'SHADOW_READY',turns:d.turns||0,reads:d.reads||0,
        queuePeak:d.queuePeak||0,readPeak:d.readPeak||0,unknownIntervals:d.unknownIntervals||0,
        alarmHeld,mutations}});
    }catch{}
  }
  function alarmReceipt(){
    // Independent non-business diagnostic. It proves actual Firefox delivery,
    // while queue/clock/admission authority remains wholly in canonical IDB.
    alarmTail=alarmTail.then(async()=>{
      const old=(await api.storage.local.get('pcmsI12AlarmCount'))?.pcmsI12AlarmCount;
      await api.storage.local.set({pcmsI12AlarmCount:Math.min(999999,
        (Number.isSafeInteger(old)?old:0)+1)});
    }).catch(()=>{});
    return alarmTail;
  }
  // Fleet fairness: every verified account (up to the 1,000-account state
  // bound) is covered each turn, never only the first 100. Cached donor
  // readiness only (no network probe), computed once per turn and shared by
  // the clock sample and the observer.
  const FLEET_BOUND=1000;
  let recentCursor=null;
  const verifiedScopes=state=>Object.entries(state.accounts)
    .filter(([,a])=>a.verifiedIdentity===true)
    .sort(([x],[y])=>x<y?-1:x>y?1:0).slice(0,FLEET_BOUND);
  async function readinessFor(g,scopes){
    return new Map(await Promise.all(scopes.map(async([id,a])=>{
      try{return [id,await g.getSafeRouteReadiness(a.personaUid)];}catch{return [id,{ready:false}];}
    })));
  }
  async function observe(s,cached=null){
    if(!observationGate())return fail('MONITOR_ACTIVATION_HELD');
    const g=guard();if(!g?.observeMonitoring)return fail('GUARDED_MONITOR_UNAVAILABLE');
    const snapshot=await s.read();if(!snapshot.ok)return snapshot;
    const now=clock(),state=snapshot.state;
    const scopes=verifiedScopes(state);
    const before=cached&&scopes.every(([id])=>cached.has(id))?cached:await readinessFor(g,scopes);
    const due=state.rows.filter(r=>!r.identityHeld&&r.ownerVerified&&!r.metrics.suspended&&
      r.metrics.nextDueAt<=now&&before.get(r.accountId)?.ready)
      .sort((a,b)=>(b.metrics.demandUntil>now?1:0)-(a.metrics.demandUntil>now?1:0)||
        a.metrics.nextDueAt-b.metrics.nextDueAt||a.ordinal-b.ordinal);
    const claims=[];
    if(!state.recent.suspended&&state.recent.nextDueAt<=now){
      // Rotate the shared recent-feed read across ready accounts. A shared
      // endpoint backoff (429) applies to ALL accounts: rotation never evades it.
      const ready=scopes.filter(([id])=>before.get(id)?.ready).map(([id])=>id);
      const accountId=(state.recent.endpointBackoffUntil||0)>now?null:
        ready.find(id=>recentCursor===null||id>recentCursor)||ready[0];
      if(accountId)recentCursor=accountId;
      if(accountId){const out=await s.claim({kind:'RECENT',preferredAccountId:accountId,
        now,bootId,claimId:newId()});if(out.ok)claims.push(out.claim);}
    }
    for(const r of due){
      if(claims.length>=2)break;
      if(claims.some(c=>c.accountId===r.accountId))continue;
      const out=await s.claim({kind:'STATISTIC',stableId:r.stableId,now:clock(),bootId,claimId:newId()});
      if(out.ok)claims.push(out.claim);
    }
    if(!claims.length)return {ok:true,code:'NO_OBSERVATION_DUE'};
    const results=await Promise.all(claims.map(async c=>{
      let packet;
      try{
        if((await sentinel.inspect()).held)return {c,packet:{ok:false,code:'RESTORE_HOLD'}};
        const first=before.get(c.accountId);
        packet=await g.observeMonitoring(c.personaUid,{kind:c.kind,
          ...(c.kind==='STATISTIC'?{slug:c.slug}:{})});
        const after=await g.getSafeRouteReadiness(c.personaUid);
        if(!first?.ready||!after?.ready||first.cookieStoreId!==after.cookieStoreId||
          first.routeId!==after.routeId||first.healthDomain!==after.healthDomain)
          packet={ok:false,code:'MONITOR_CONTEXT_CHANGED'};
        else packet={...packet,interval:{source:'GUARDED_MONITOR_INTERVAL',bootId,
          from:c.startedAt,to:clock(),domain:first.healthDomain||null}};
      }catch{packet={ok:false,code:'MONITOR_READ_UNAVAILABLE'};}
      return {c,packet};
    }));
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    const evidenced=results.filter(({c,packet:p})=>p?.interval&&
      p.principalFingerprint===c.principalFingerprint&&
      (p.ok||p.code==='PROVIDER_UNAVAILABLE'));
    let group=null;
    if(evidenced.length===2){
      const from=Math.max(...evidenced.map(x=>x.packet.interval.from));
      const to=Math.min(...evidenced.map(x=>x.packet.interval.to));
      if(to>from){
        const accounts=evidenced.map(({c,packet:p})=>({accountId:c.accountId,
          personaUid:c.personaUid,bindingVersion:c.bindingVersion,
          principalFingerprint:c.principalFingerprint,health:p.ok?'HEALTHY':'UNKNOWN',
          protected:true,sessionVerified:p.ok===true}));
        // Only an independently observed shared healthy interval can consume
        // grace for a scoped protected-route failure. Unknown local errors
        // and healthy scopes without current session evidence remain frozen.
        for(const [id,a] of scopes){
          if(accounts.some(x=>x.accountId===id))continue;
          const old=before.get(id),current=await g.getSafeRouteReadiness(a.personaUid);
          const known=new Set(['DIRECT_FORBIDDEN','PROTECTED_ROUTE_UNVERIFIED',
            'PROTECTED_ROUTE_UNAVAILABLE','PERSONA_NOT_ACTIVE']);
          if(!old?.ready&&!current?.ready&&known.has(old?.code)&&known.has(current?.code))
            accounts.push({accountId:id,personaUid:a.personaUid,bindingVersion:a.bindingVersion,
              principalFingerprint:a.principalFingerprint,health:'UNAVAILABLE',protected:false,sessionVerified:false});
        }
        group={source:'GUARDED_OVERLAP',id:newId(),bootId,from,to,accounts,
          witnesses:evidenced.map(({c,packet:p})=>({accountId:c.accountId,
            principalFingerprint:c.principalFingerprint,domain:p.interval.domain,
            result:p.ok?'HEALTHY':'PROVIDER_UNAVAILABLE',routeVerified:true,observedAt:to}))};
      }
    }
    const completed=[];
    for(const {c,packet} of results)completed.push(await s.complete(c.claimId,
      {...packet,observedAt:c.startedAt,...(group?{group}:{})},clock()));
    const latest=completed.at(-1);
    return {...latest,code:completed.some(r=>r.accepted)?'OBSERVED':latest.code,
      changes:completed.flatMap(r=>r.changes||[])};
  }

  async function maybeRefresh(s,target=null){
    // No UI message can enable this gate or supply provider qualifications.
    // Production has no verified method/adapter and is unconditionally OFF.
    if(!refreshGate()||!refreshAdapter||!observationGate())return 'REFRESH_ACTIVATION_HELD';
    const enabled=await s.read();
    if(!enabled.ok||enabled.state.policy.refreshEnabled!==true)
      return 'REFRESH_OPERATOR_DISABLED';
    const g=guard();if(!g?.getSafeRouteReadiness)return 'GUARDED_REFRESH_UNAVAILABLE';
    const snapshot=await s.read();if(!snapshot.ok)return 'CANONICAL_UNAVAILABLE';
    // Reconcile a possibly-dispatched effect by independent READBACK ONLY.
    // A cold wake or lost response must never invoke execute a second time.
    const stranded=snapshot.state.rows.find(r=>(!target||
      (r.slug===target.slug&&r.accountId===target.accountId))&&
      r.refresh?.intent?.state==='RESERVED'&&
      clock()-r.refresh.intent.at>=MINUTE);
    if(stranded){
      // A RESERVED transaction has not crossed DISPATCH_POSSIBLE. A fresh
      // canonical read may clear it after cooldown, without touching provider.
      const done=await s.cancelReserved(stranded.stableId,stranded.refresh.intent.id,clock());
      return done.ok?'STALE_RESERVATION_ABORTED':done.code;
    }
    const uncertain=snapshot.state.rows.find(r=>(!target||
      (r.slug===target.slug&&r.accountId===target.accountId))&&
      r.refresh?.intent?.state==='DISPATCH_POSSIBLE'&&
      (r.refresh.probes||0)<3&&(r.refresh.nextAttemptAt||0)<=clock());
    if(uncertain){
      const intent=uncertain.refresh.intent,a=snapshot.state.accounts[uncertain.accountId];
      if(!uncertain.ownerVerified||!uncertain.releaseVerified||uncertain.identityHeld||
        uncertain.reviewHeld||uncertain.listing!=='PUBLIC'||!a?.verifiedIdentity||
        (uncertain.refresh?.savedSourceFingerprint||uncertain.releaseFingerprint)!==
          intent.sourceFingerprint)
        return 'REFRESH_RECONCILIATION_HELD';
      const first=await g.getSafeRouteReadiness(uncertain.personaUid);
      if(!first?.ready)return 'REFRESH_RECONCILIATION_ROUTE_HELD';
      const claim={id:intent.id,slug:uncertain.slug,stableId:uncertain.stableId,
        accountId:uncertain.accountId,personaUid:uncertain.personaUid,
        bindingVersion:uncertain.bindingVersion,
        principalFingerprint:a.principalFingerprint,remoteId:uncertain.remoteId,
        markerId:intent.markerId||null,nonce:intent.nonce||null,
        releaseFingerprint:uncertain.releaseFingerprint,
        sourceFingerprint:intent.sourceFingerprint,
        targetFingerprint:intent.targetFingerprint||null};
      let receipt={at:clock(),kind:'UNKNOWN',sourceFingerprint:null,
        targetMatched:false,principalMatched:false};
      try{
        const check=await refreshAdapter.readback(claim);
        const after=await g.getSafeRouteReadiness(uncertain.personaUid);
        const stable=after?.ready&&first.routeId===after.routeId&&
          first.cookieStoreId===after.cookieStoreId&&
          first.healthDomain===after.healthDomain;
        receipt={at:clock(),kind:check?.kind||'UNKNOWN',
          sourceFingerprint:check?.sourceFingerprint||null,
          targetMatched:check?.targetMatched===true&&stable===true,
          principalMatched:check?.principalMatched===true&&stable===true,feed:check?.feed};
      }catch{/* readback remains uncertain; bounded backoff applies */}
      const settled=await s.settleAttempt(uncertain.stableId,intent.id,receipt);
      return settled.ok?(settled.proof.effectVerified?
        'REFRESH_READBACK_EFFECT_PROVEN':'REFRESH_READBACK_HELD'):settled.code;
    }
    const row=snapshot.state.rows.find(r=>(!target||
      (r.slug===target.slug&&r.accountId===target.accountId))&&
      r.slot&&r.phase==='ACTIVE'&&
      r.ownerVerified&&r.releaseVerified&&!r.identityHeld&&!r.reviewHeld&&
      !r.refresh?.intent&&!r.refresh?.suspended&&
      (r.refresh?.nextAttemptAt||0)<=clock()&&
      snapshot.state.accounts[r.accountId]?.verifiedIdentity===true&&
      qualifyRecentAbsence({row:r,recent:snapshot.state.recent,
        policy:snapshot.state.policy,now:clock()}).ok);
    if(!row)return 'NO_REFRESH_DUE';
    const candidate=await qualificationFor(row,snapshot.state.accounts[row.accountId]);
    // A candidate from a fixture, code comment or stale source is not enough.
    const first=await g.getSafeRouteReadiness(row.personaUid);
    if(!first?.ready)return 'PROTECTED_ROUTE_UNAVAILABLE';
    const claimId=newId();
    const reserved=await s.reserveAttempt({stableId:row.stableId,id:claimId,now:clock(),
      candidate,liveAuthorized:refreshGate()});
    if(!reserved.ok)return reserved.code;
    const claim=reserved.claim;
    // All durable and guarded checks precede the dispatch-may-have-happened
    // receipt. After this receipt, NEVER replay on lost ACK or cold wake.
    if((await sentinel.inspect()).held||!refreshGate())return 'REFRESH_RESERVED_HELD';
    const second=await g.getSafeRouteReadiness(row.personaUid);
    if(!second?.ready||first.cookieStoreId!==second.cookieStoreId||
      first.routeId!==second.routeId||first.healthDomain!==second.healthDomain){
      await s.cancelReserved(claim.stableId,claim.id,clock());
      return 'REFRESH_ROUTE_CHANGED';
    }
    const possible=await s.markDispatch(claim,clock());
    if(!possible.ok)return possible.code;
    let receipt={at:clock(),kind:'UNKNOWN',sourceFingerprint:null,
      targetMatched:false,principalMatched:false};
    try{
      // The fixed installed I13 editor is the only guarded writer, and an
      // ACK remains insufficient: this separate readback validates full source.
      await refreshAdapter.execute({...claim,method:candidate.method,methodVersion:candidate.version});
      const check=await refreshAdapter.readback(claim);
      const final=await g.getSafeRouteReadiness(row.personaUid);
      const routeStable=final?.ready&&second.cookieStoreId===final.cookieStoreId&&
        second.routeId===final.routeId&&second.healthDomain===final.healthDomain;
      receipt={at:clock(),kind:check?.kind||'UNKNOWN',
        sourceFingerprint:check?.sourceFingerprint||null,
        targetMatched:check?.targetMatched===true&&routeStable===true,
        principalMatched:check?.principalMatched===true&&routeStable===true,
        feed:check?.feed};
    }catch{/* ambiguous remote effect: record held, never repeat */}
    const settled=await s.settleAttempt(claim.stableId,claim.id,receipt);
    return settled.ok?(settled.proof.effectVerified?'EFFECT_INDEPENDENTLY_PROVEN':
      'REFRESH_EFFECT_HELD'):settled.code;
  }
  function tick(){
    if(turnPromise)return turnPromise;
    turnPromise=(async()=>{
      try{
        if((await sentinel.inspect()).held){stopActiveClock();await safeBreadcrumb(null,'RESTORE_HOLD');return fail('RESTORE_HOLD');}
        const s=await store();
        // Passive additive migration of previously adopted public originals.
        // Independent hashing and CAS occur outside scheduler transactions;
        // changed/corrupt snapshots stay held, never promoted by timestamps.
        try{if(!(await sentinel.inspect()).held)
          await backfillLegacyAdoptions(await dbPromise,{shouldHold:async()=>
            (await sentinel.inspect()).held});}
        catch{/* migration failure never disables monitoring or grants a write */}
        let nativeClock=null,qualifiedCoverages=null,turnReadiness=null,browserClock=null;
        if(browserClockGate()){
          // The elapsed monotonic clock is meaningful only inside this one
          // executing Firefox background incarnation. Capture current donor
          // readiness without OS-PCMS clock or patched bridge dependencies.
          try{
            const g=guard(),previous=await s.read();
            const scopes=verifiedScopes(previous?.state||{accounts:{}});
            turnReadiness=await readinessFor(g,scopes);
            const routes=[];
            for(const [accountId,a] of scopes){
              const ready=turnReadiness.get(accountId);
              if(ready?.ready===true&&ready.personaUid===a.personaUid)
                routes.push({ready:true,accountId,personaUid:a.personaUid,
                  bindingVersion:a.bindingVersion,
                  principalFingerprint:a.principalFingerprint,
                  routeId:ready.routeId,cookieStoreId:ready.cookieStoreId,
                  healthDomain:ready.healthDomain});
            }
            browserClock={runtimeEpoch:bootId,monotonicMs:monotonicClock(),
              observedAtMs:clock(),routes};
          }catch{browserClock=null;turnReadiness=null;}
        }
        if(nativeClockGate()){
          // Existing donor pin + native witness; no new observer or synthetic
          // future certificates. A route failure at either endpoint freezes
          // that account's bounded native awake interval.
          try{
            const g=guard(),native=await g?.sampleNativeWitness?.();
            if(native?.ok===true&&native.witness){
              const previous=await s.read(),routes=[];
              const accounts=verifiedScopes(previous?.state||{accounts:{}});
              turnReadiness=await readinessFor(g,accounts);
              for(const [accountId,a] of accounts){
                const ready=turnReadiness.get(accountId);
                if(ready?.ready===true&&ready.personaUid===a.personaUid)
                  routes.push({ready:true,accountId,personaUid:a.personaUid,
                    bindingVersion:a.bindingVersion,
                    principalFingerprint:a.principalFingerprint,
                    routeId:ready.routeId,cookieStoreId:ready.cookieStoreId,
                    healthDomain:ready.healthDomain});
              }
              nativeClock={...native.witness,observedAtMs:clock(),routes};
              // Synthetic injection is retained for deterministic tests only.
              qualifiedCoverages=await continuousCoverageFor({
                at:nativeClock.observedAtMs,bootId,nativeClock});
            }
          }catch{/* no fake time credited on native/route failure */}
        }
        const now=clock(),result=await s.turn({now,bootId,nativeClock,qualifiedCoverages,browserClock});
        if(!result.ok){stopActiveClock();await safeBreadcrumb(null,'CANONICAL_UNAVAILABLE');return result;}
        await schedule(result.state.nextWakeAt);
        // At most two protected reads per turn. Persistent quota/coalescing spans
        // all wake sources and both recent-list/statistics request classes.
        const observed=await observe(s,turnReadiness);
        // Mutation failure cannot block the healthy shadow monitor.
        let refresh='REFRESH_ACTIVATION_HELD';
        try{refresh=await maybeRefresh(s);}catch{refresh='REFRESH_EFFECT_UNCERTAIN';}
        await notifyChanges(result);await notifyChanges(observed);
        // Read actual post-observation state: a first feed/account read can
        // bootstrap eligible work without keeping a dashboard or port open.
        const settledClock=await s.read();
        followActiveClock(settledClock?.state,browserClock?.routes||[]);
        const mutationPossible=['EFFECT_INDEPENDENTLY_PROVEN','REFRESH_EFFECT_HELD',
          'REFRESH_EFFECT_UNCERTAIN'].includes(refresh);
        await safeBreadcrumb(result,alarmHeld?'ALARM_UNVERIFIED':
          observed.code==='MONITOR_ACTIVATION_HELD'?'MONITOR_ACTIVATION_HELD':'SHADOW_READY',
          mutationPossible);
        return {ok:true,revision:result.revision,
          mode:result.state.policy?.refreshEnabled===true?
            'GUARDED_REFRESH_ENABLED':'SHADOW_ONLY',
          providerEffects:mutationPossible?'POSSIBLE_SOURCE_WRITE':
            'OFF',alarmHeld,observation:observed.code||'OBSERVED',refresh};
      }catch{stopActiveClock();await safeBreadcrumb(null,'CANONICAL_UNAVAILABLE');return fail('REFRESHER_AUTHORITY_UNAVAILABLE');}
      finally{turnPromise=null;}
    })();
    return turnPromise;
  }
  async function run(message,sender){
    const auth=validateRefresherMessage(api,sender,message);if(!auth.ok)return auth;
    try{
      const s=await store(),p=message.params||{};
      if(message.type==='GET_REFRESHER'){
        const view=await s.list(clock(),p),restore=await sentinel.inspect();
        return {...view,restoreHeld:restore.held,alarmHeld,monitoring:
          observationGate()?'GUARDED_READ_ONLY':'OFF_PENDING_ACTIVATION',
          refreshCapability:refreshGate()&&refreshAdapter?
            (view.policy?.refreshEnabled===true?
              'OPERATOR_ENABLED_GUARDED_WRITER':'OPERATOR_MUTATION_DISABLED'):
            'LIVE_REFRESH_OFF_UNTIL_PROVEN',
          // This reports the actual production gate, never assumes that
          // monotonic host time is eligible provider/account operating time.
          clockCapability:browserClockGate()?'BROWSER_MONOTONIC_ROUTE_FEED_ELIGIBILITY':
            nativeClockGate()?'BOUNDED_NATIVE_ROUTE_FEED_ELIGIBILITY':
            'CONTINUOUS_ELIGIBILITY_NOT_ESTABLISHED'};
      }
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      if(message.type==='DIAGNOSTIC_TARGET_REFRESH'){
        const saved=await api.storage.local.get([
          'pcmsS08DisposableScope','pcmsS08DiagnosticRun']);
        const scope=saved.pcmsS08DisposableScope,run=saved.pcmsS08DiagnosticRun;
        if(!scope||!run||run.runId!==p.runId||run.slug!==p.slug||
          run.config?.accountId!==p.accountId||
          scope.accountId!==p.accountId||
          scope.namespace!==run.config.namespace||
          !p.slug.startsWith(scope.namespace+'-')||
          run.config.personaUid!==scope.personaUid)
          return fail('DIAGNOSTIC_SCOPE_NOT_CONFIRMED');
        const before=await s.read();
        const targets=before?.state?.rows?.filter(row=>
          row.slug===p.slug&&row.accountId===p.accountId&&
          row.personaUid===scope.personaUid);
        if(!before?.ok||targets?.length!==1)
          return fail('DIAGNOSTIC_TEST_OWNERSHIP_UNVERIFIED');
        // If source was already read back, do not attempt a second save.
        // The one remaining proof is independent recent-feed placement.
        const prior=targets[0],sourceAlreadySaved=
          prior.refresh?.history?.at(-1)?.effect==='EFFECT_CONFIRMED';
        const code=verifiedRefreshFeed(prior)?'RECENT_FEED_VERIFIED':
          sourceAlreadySaved?'AWAITING_RECENT_FEED':
            await maybeRefresh(s,{slug:p.slug,accountId:p.accountId});
        if(!verifiedRefreshFeed(prior)&&observationGate())
          await observe(s); // real read-only feed claim; never calls maybeRefresh
        const after=await s.read();
        const latest=after?.state?.rows?.find(row=>row.slug===p.slug&&
          row.accountId===p.accountId&&row.personaUid===scope.personaUid);
        const feedVerified=after?.ok===true&&verifiedRefreshFeed(latest);
        return {ok:true,code:feedVerified?'RECENT_FEED_VERIFIED':code,
          scope:'DESIGNATED_TEST_ONLY',
          sourceVerified:latest?.refresh?.history?.at(-1)?.effect==='EFFECT_CONFIRMED',
          feedVerified, effectVerified:feedVerified};
      }
      if(message.type==='OBSERVE_NOW'){
        if(!observationGate())return fail('MONITOR_ACTIVATION_HELD');
        const requested=await s.demandRecent(clock());if(!requested.ok)return requested;
        return tick();
      }
      let result;
      if(message.type==='SET_POLICY')result=await s.changePolicy(p.expectedRevision,p.policy);
      if(message.type==='SET_PAUSE')result=await s.pause(p.expectedRevision,p.scope,p.target,p.paused);
      if(message.type==='SET_GENERATOR_POLICY')result=await s.generatorPolicy(
        p.expectedRevision,p.stableId,p.activeMs,p.sleepMs,{useDefaults:p.useDefaults===true});
      if(message.type==='DEMAND_STATISTIC')result=await s.demand(p.expectedRevision,p.stableId,clock());
      if(message.type==='RESET_RECENT_BACKOFF')result=await s.resetRecentBackoff(p.expectedRevision,clock());
      return result?.ok?{ok:true,revision:result.revision,providerEffects:'OFF'}:result||fail('CAPABILITY_OFF');
    }catch{return fail('REFRESHER_AUTHORITY_UNAVAILABLE');}
  }
  function register(){
    if(registered)return;
    // Never await anything before these listener registrations.
    api.alarms.onAlarm.addListener(alarm=>{
      if(alarm?.name===REFRESHER_ALARM){void alarmReceipt();void tick();}
    });
    // Firefox discards alarms on a full exit. Recreate the one wake alarm
    // *before* slow IDB migration, route readiness or provider monitoring.
    // Scheduling is a wake hint only; it confers no operating-time credit.
    const coldWake=()=>{void schedule(clock()+MINUTE);void tick();};
    api.runtime.onStartup.addListener(coldWake);
    api.runtime.onInstalled.addListener(coldWake);
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==REFRESHER_PORT)return;
      let busy=false;
      port.onMessage.addListener(message=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        run(message,port.sender).then(out=>{try{port.postMessage(out);}catch{}})
          .catch(()=>{try{port.postMessage(fail('REFRESHER_AUTHORITY_UNAVAILABLE'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });
    registered=true;coldWake();
  }
  return Object.freeze({register,tick,run});
}
// Entry owns the single registration. Importing this factory for packaged
// tests or another extension page must never create a second controller.
