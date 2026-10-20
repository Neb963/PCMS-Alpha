// Synchronous listeners, one coalesced scheduler alarm, canonical turn/claim
// fences. I14 conditional executor is present but default production gate OFF.
import {fail,openCanonicalDatabase,createRestoreSentinel,isSafeId,createCanonicalStore} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {createRefresherStore} from './refresher-store.mjs';
import {MINUTE} from './refresher-core.mjs';
import {qualifyRecentAbsence} from './refresher-admission.mjs';
import {createNoticeDispatcher} from './notices.mjs';
export const REFRESHER_PORT='pcms-i12-refresher',REFRESHER_ALARM='pcms-refresher-turn';
const types=new Set(['GET_REFRESHER','SET_POLICY','SET_PAUSE','SET_GENERATOR_POLICY','DEMAND_STATISTIC','OBSERVE_NOW','RESET_RECENT_BACKOFF']);
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
    message.type==='SET_GENERATOR_POLICY'?['expectedRevision','stableId','activeMs','sleepMs']:
    message.type==='DEMAND_STATISTIC'?['expectedRevision','stableId']:
    message.type==='RESET_RECENT_BACKOFF'?['expectedRevision']:[];
  if(Object.keys(p).some(k=>!allowed.includes(k)))return fail('INVALID_PARAMS');
  if(message.type==='GET_REFRESHER'){
    if((p.query!=null&&(typeof p.query!=='string'||p.query.length>80))||
      (p.accountId!=null&&p.accountId!==''&&!isSafeId(p.accountId))||
      (p.phase!=null&&!['ALL','WAITING','ACTIVE','SLEEPING'].includes(p.phase))||
      (p.offset!=null&&(!Number.isSafeInteger(p.offset)||p.offset<0||p.offset>5000))||
      (p.limit!=null&&(!Number.isSafeInteger(p.limit)||p.limit<1||p.limit>50)))return fail('INVALID_PARAMS');
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
  newId=()=>crypto.randomUUID().replaceAll('-','')}={}){
  let dbPromise,turnPromise=null,registered=false,alarmHeld=false,alarmTail=Promise.resolve();
  const bootId=newId(),sentinel=createRestoreSentinel(api.storage.local);
  const store=async()=>storeFactory(await (dbPromise ||=open().catch(e=>{dbPromise=null;throw e;})));
  async function notifyChanges(result){
    for(const change of result?.changes||[])if(change.code==='ACCOUNT_GRACE_EXPIRED'){
      try{await createNoticeDispatcher(api,createCanonicalStore(await dbPromise)).emit({
        scopeId:change.scopeId,code:'ROUTE_UNAVAILABLE',severity:'ACTION_REQUIRED',
        revision:result.revision});}catch{}
    }
  }
  async function schedule(when){
    try{
      await api.alarms.create(REFRESHER_ALARM,{when:Math.max(clock()+MINUTE,when||0)});
      const actual=await api.alarms.get(REFRESHER_ALARM);
      if(!actual||actual.name!==REFRESHER_ALARM)alarmHeld=true;else alarmHeld=false;
    }catch{
      // An ambiguous create ACK is independently reconciled, not multiplied.
      try{alarmHeld=!(await api.alarms.get(REFRESHER_ALARM));}catch{alarmHeld=true;}
    }
  }
  async function safeBreadcrumb(result,code){
    try{
      const d=result?.state?.diagnostics||{};
      await api.storage.local.set({pcmsI12Status:{mode:'SHADOW_ONLY',
        code:code||'SHADOW_READY',turns:d.turns||0,reads:d.reads||0,
        queuePeak:d.queuePeak||0,readPeak:d.readPeak||0,unknownIntervals:d.unknownIntervals||0,
        alarmHeld,mutations:0}});
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
  async function observe(s){
    if(!observationGate())return fail('MONITOR_ACTIVATION_HELD');
    const g=guard();if(!g?.observeMonitoring)return fail('GUARDED_MONITOR_UNAVAILABLE');
    const snapshot=await s.read();if(!snapshot.ok)return snapshot;
    const now=clock(),state=snapshot.state;
    // Cached donor readiness only; no new route/native probe. The explicit
    // bound limits liveness classification cost; unobserved scopes stay unknown.
    const scopes=Object.entries(state.accounts).filter(([,a])=>a.verifiedIdentity).slice(0,100);
    const before=new Map(await Promise.all(scopes.map(async([id,a])=>{
      try{return [id,await g.getSafeRouteReadiness(a.personaUid)];}catch{return [id,{ready:false}];}
    })));
    const due=state.rows.filter(r=>!r.identityHeld&&r.ownerVerified&&!r.metrics.suspended&&
      r.metrics.nextDueAt<=now&&before.get(r.accountId)?.ready)
      .sort((a,b)=>(b.metrics.demandUntil>now?1:0)-(a.metrics.demandUntil>now?1:0)||
        a.metrics.nextDueAt-b.metrics.nextDueAt||a.ordinal-b.ordinal);
    const claims=[];
    if(!state.recent.suspended&&state.recent.nextDueAt<=now){
      const accountId=scopes.find(([id])=>before.get(id)?.ready&&
        (state.recent.accountBackoff?.[id]||0)<=now)?.[0];
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

  async function maybeRefresh(s){
    // No UI message can enable this gate or supply provider qualifications.
    // Production has no verified method/adapter and is unconditionally OFF.
    if(!refreshGate()||!refreshAdapter||!observationGate())return 'REFRESH_ACTIVATION_HELD';
    const g=guard();if(!g?.getSafeRouteReadiness)return 'GUARDED_REFRESH_UNAVAILABLE';
    const snapshot=await s.read();if(!snapshot.ok)return 'CANONICAL_UNAVAILABLE';
    // Reconcile a possibly-dispatched effect by independent READBACK ONLY.
    // A cold wake or lost response must never invoke execute a second time.
    const stranded=snapshot.state.rows.find(r=>r.refresh?.intent?.state==='RESERVED'&&
      clock()-r.refresh.intent.at>=MINUTE);
    if(stranded){
      // A RESERVED transaction has not crossed DISPATCH_POSSIBLE. A fresh
      // canonical read may clear it after cooldown, without touching provider.
      const done=await s.cancelReserved(stranded.stableId,stranded.refresh.intent.id,clock());
      return done.ok?'STALE_RESERVATION_ABORTED':done.code;
    }
    const uncertain=snapshot.state.rows.find(r=>r.refresh?.intent?.state==='DISPATCH_POSSIBLE'&&
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
    const row=snapshot.state.rows.find(r=>r.slot&&r.phase==='ACTIVE'&&
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
      // The installed application has no provider-specific implementation or
      // authorization. Tests inject an isolated deterministic effect ledger.
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
        if((await sentinel.inspect()).held){await safeBreadcrumb(null,'RESTORE_HOLD');return fail('RESTORE_HOLD');}
        const s=await store();
        let nativeClock=null,qualifiedCoverages=null;
        if(nativeClockGate()){
          // Original native-connection counters only. No fallback from wall
          // time or two HTTP requests. A sampling exception is UNKNOWN.
          try{
            const native=await guard()?.sampleNativeWitness?.();
            if(native?.ok===true&&native.witness){
              nativeClock={...native.witness,observedAtMs:clock()};
              // Independent continuous coverage must be supplied by a real
              // donor/host monitor. This callback has no production provider.
              qualifiedCoverages=await continuousCoverageFor({
                at:nativeClock.observedAtMs,bootId,nativeClock});
            }
          }catch{/* no fake time credited on native/coverage failure */}
        }
        const now=clock(),result=await s.turn({now,bootId,nativeClock,qualifiedCoverages});
        if(!result.ok){await safeBreadcrumb(null,'CANONICAL_UNAVAILABLE');return result;}
        await schedule(result.state.nextWakeAt);
        // At most two protected reads per turn. Persistent quota/coalescing spans
        // all wake sources and both recent-list/statistics request classes.
        const observed=await observe(s);
        // Mutation failure cannot block the healthy shadow monitor.
        let refresh='REFRESH_ACTIVATION_HELD';
        try{refresh=await maybeRefresh(s);}catch{refresh='REFRESH_EFFECT_UNCERTAIN';}
        await notifyChanges(result);await notifyChanges(observed);
        await safeBreadcrumb(result,alarmHeld?'ALARM_UNVERIFIED':
          observed.code==='MONITOR_ACTIVATION_HELD'?'MONITOR_ACTIVATION_HELD':'SHADOW_READY');
        return {ok:true,revision:result.revision,mode:'SHADOW_ONLY',providerEffects:'OFF',
          alarmHeld,observation:observed.code||'OBSERVED',refresh};
      }catch{await safeBreadcrumb(null,'CANONICAL_UNAVAILABLE');return fail('REFRESHER_AUTHORITY_UNAVAILABLE');}
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
            'TEST_OR_AUTHORIZED_CAPABILITY_GATED':'LIVE_REFRESH_OFF_UNTIL_PROVEN',
          // This reports the actual production gate, never assumes that
          // monotonic host time is eligible provider/account operating time.
          clockCapability:nativeClockGate()?
            'AWAKE_CLOCK_ON_COVERAGE_INDEPENDENTLY_REQUIRED':
            'CONTINUOUS_ELIGIBILITY_NOT_ESTABLISHED'};
      }
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      if(message.type==='OBSERVE_NOW'){
        if(!observationGate())return fail('MONITOR_ACTIVATION_HELD');
        return tick();
      }
      let result;
      if(message.type==='SET_POLICY')result=await s.changePolicy(p.expectedRevision,p.policy);
      if(message.type==='SET_PAUSE')result=await s.pause(p.expectedRevision,p.scope,p.target,p.paused);
      if(message.type==='SET_GENERATOR_POLICY')result=await s.generatorPolicy(
        p.expectedRevision,p.stableId,p.activeMs,p.sleepMs);
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
    api.runtime.onStartup.addListener(()=>void tick());
    api.runtime.onInstalled.addListener(()=>void tick());
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
    registered=true;void tick();
  }
  return Object.freeze({register,tick,run});
}
// Entry owns the single registration. Importing this factory for packaged
// tests or another extension page must never create a second controller.
