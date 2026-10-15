// Synchronous listeners, one coalesced scheduler alarm, canonical turn/claim
// fences. Production entry supplies the scoped native source-save adapter;
// bare factories retain their effect-free default for isolated callers.
import {fail,openCanonicalDatabase,createRestoreSentinel,isSafeId,createCanonicalStore} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {createRefresherStore} from './refresher-store.mjs';
import {MINUTE,rowBlocks,queueOrder} from './refresher-core.mjs';
import {createQualificationStore,createRefreshQualification} from './refresh-qualification.mjs';
import {SOURCE_REFRESH_COMMANDS} from './refresher-provider-adapter.mjs';
import {createNoticeDispatcher} from './notices.mjs';
export const REFRESHER_PORT='pcms-i12-refresher',REFRESHER_ALARM='pcms-refresher-turn';
const types=new Set([...SOURCE_REFRESH_COMMANDS,'GET_REFRESHER','SET_POLICY','SET_PAUSE','SET_GENERATOR_POLICY','DEMAND_STATISTIC','OBSERVE_NOW','RESET_RECENT_BACKOFF','GET_QUALIFICATION','BEGIN_QUALIFICATION','OBSERVE_QUALIFICATION']);
export function validateRefresherMessage(api,sender,message){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let encoded;try{encoded=JSON.stringify(message);}catch{return fail('INVALID_MESSAGE');}
  if(!message||typeof message!=='object'||Array.isArray(message)||!types.has(message.type)||
    !encoded||encoded.length>16384||Object.keys(message).some(k=>!['type','params'].includes(k)))
    return fail('INVALID_MESSAGE');
  const p=message.params||{};
  if(!p||typeof p!=='object'||Array.isArray(p))return fail('INVALID_PARAMS');
  const sourceCommand=SOURCE_REFRESH_COMMANDS.has(message.type);
  const allowed=sourceCommand?(['TRUST_REFRESH_REVIEWER'].includes(message.type)?['publicKey','confirmation']:
    message.type==='MEASURE_REFRESH_RESOURCES'?[]:
    ['GET_SOURCE_REFRESH','GET_REFRESH_REVIEW_CHALLENGE'].includes(message.type)?['stableId']:
    ['stableId','expectedRevision','confirmation','envelope','enabled']):message.type==='GET_REFRESHER'?['query','phase','accountId','offset','limit']:
    message.type==='GET_QUALIFICATION'?['stableId']:
    ['BEGIN_QUALIFICATION','OBSERVE_QUALIFICATION'].includes(message.type)?['stableId','expectedRevision','confirmation']:
    message.type==='SET_POLICY'?['expectedRevision','policy']:
    message.type==='SET_PAUSE'?['expectedRevision','scope','target','paused']:
    message.type==='SET_GENERATOR_POLICY'?['expectedRevision','stableId','activeMs','sleepMs']:
    message.type==='DEMAND_STATISTIC'?['expectedRevision','stableId']:
    message.type==='RESET_RECENT_BACKOFF'?['expectedRevision']:[];
  if(Object.keys(p).some(k=>!allowed.includes(k)))return fail('INVALID_PARAMS');
  if(sourceCommand){
    if(message.type==='TRUST_REFRESH_REVIEWER'){
      if(!p.publicKey||typeof p.publicKey!=='object'||Array.isArray(p.publicKey)||typeof p.confirmation!=='string'||p.confirmation.length>80)return fail('INVALID_PARAMS');
    }else if(message.type!=='MEASURE_REFRESH_RESOURCES'&&(!isSafeId(p.stableId)||
      (!['GET_SOURCE_REFRESH','GET_REFRESH_REVIEW_CHALLENGE'].includes(message.type)&&(!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<0))||
      (p.confirmation!==undefined&&(typeof p.confirmation!=='string'||p.confirmation.length>200))))return fail('INVALID_PARAMS');
  }else if(message.type==='GET_REFRESHER'){
    if((p.query!=null&&(typeof p.query!=='string'||p.query.length>80))||
      (p.accountId!=null&&p.accountId!==''&&!isSafeId(p.accountId))||
      (p.phase!=null&&!['ALL','WAITING','ACTIVE','SLEEPING'].includes(p.phase))||
      (p.offset!=null&&(!Number.isSafeInteger(p.offset)||p.offset<0||p.offset>5000))||
      (p.limit!=null&&(!Number.isSafeInteger(p.limit)||p.limit<1||p.limit>50)))return fail('INVALID_PARAMS');
  }else if(message.type.includes('QUALIFICATION')){
    if(!isSafeId(p.stableId)||
      (message.type!=='GET_QUALIFICATION'&&(!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<0))||
      (p.confirmation!==undefined&&(typeof p.confirmation!=='string'||p.confirmation.length>120)))return fail('INVALID_PARAMS');
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
  newId=()=>crypto.randomUUID().replaceAll('-','')}={}){
  let dbPromise,turnPromise=null,qualifying=false,registered=false,alarmHeld=false,alarmTail=Promise.resolve();
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
    const now=clock(),target=Math.max(now+MINUTE,when||0);
    let existing=null;
    try{existing=await api.alarms.get(REFRESHER_ALARM);}catch{}
    // Every Firefox event-page wake re-evaluates the shadow scheduler. Do NOT
    // postpone an already valid earlier alarm on unrelated donor/UI wakes;
    // otherwise repeated wakes can starve onAlarm indefinitely. Preserve a
    // slightly overdue browser-owned alarm for late Firefox delivery too.
    if(existing?.name===REFRESHER_ALARM&&
       Number.isFinite(existing.scheduledTime)&&
       existing.scheduledTime>=now-2*MINUTE&&
       existing.scheduledTime<=target){alarmHeld=false;return;}
    try{
      await api.alarms.create(REFRESHER_ALARM,{when:target});
      const actual=await api.alarms.get(REFRESHER_ALARM);
      if(!actual||actual.name!==REFRESHER_ALARM)alarmHeld=true;else alarmHeld=false;
    }catch{
      // An ambiguous create ACK is independently reconciled, not multiplied.
      try{alarmHeld=!(await api.alarms.get(REFRESHER_ALARM));}catch{alarmHeld=true;}
    }
  }
  const executionMode=()=>refreshAdapter?.requiresPreflight?'SCOPED_SOURCE_SAVE':'SHADOW_ONLY';
  async function safeBreadcrumb(result,code){
    try{
      const d=result?.state?.diagnostics||{};
      await api.storage.local.set({pcmsI12Status:{mode:executionMode(),
        code:code||'SHADOW_READY',turns:d.turns||0,reads:d.reads||0,
        queuePeak:d.queuePeak||0,readPeak:d.readPeak||0,unknownIntervals:d.unknownIntervals||0,
        alarmHeld,mutations:result?.state?.rows?.reduce((n,r)=>n+(r.refresh?.history?.length||0),0)||0}});
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
      const accountId=scopes.find(([id])=>before.get(id)?.ready)?.[0];
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

  async function performRefresh(s,row,candidate){
    const first=await guard()?.getSafeRouteReadiness(row.personaUid);
    if(!first?.ready)return fail(first?.code||'PROTECTED_ROUTE_UNAVAILABLE');
    const reserved=await s.reserveAttempt({stableId:row.stableId,id:candidate.plan?.operationId||newId(),
      now:clock(),candidate,liveAuthorized:true});
    if(!reserved.ok)return reserved;
    const claim=reserved.claim;let marked=false,result;
    try{
      result=await refreshAdapter.execute(claim,{beforeSave:async phase=>{
        if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
        if(phase==='CHECK')return s.checkDispatch(claim,clock());
        const out=await s.markDispatch(claim,clock());marked=out.ok;return out;
      }});
    }catch{result={ok:false,code:'REFRESH_EXECUTOR_UNKNOWN',effectBoundary:marked?'DISPATCH_POSSIBLE':'NOT_DISPATCHED'};}
    if(!marked){
      await s.cancelReserved(claim.stableId,claim.id,clock(),result?.code);
      return fail(result?.code||'REFRESH_PREFLIGHT_HELD');
    }
    let receipt={kind:'UNKNOWN',targetMatched:false,principalMatched:false};
    // Lost native ACK does not suppress independent observation.
    try{receipt=await refreshAdapter.readback(claim);}catch{}
    const final=await guard()?.getSafeRouteReadiness(row.personaUid);
    const stable=final?.ready&&first.cookieStoreId===final.cookieStoreId&&
      first.routeId===final.routeId&&first.healthDomain===final.healthDomain;
    const settled=await s.settleAttempt(claim.stableId,claim.id,{...receipt,at:clock(),
      targetMatched:receipt.targetMatched===true&&stable===true,
      principalMatched:receipt.principalMatched===true&&stable===true,
      attemptResult:{ack:result?.ok===true?'ACK_ONLY':'UNKNOWN',
        code:/^[A-Z0-9_]{1,80}$/.test(result?.code||'')?result.code:'REFRESH_OUTCOME_UNKNOWN'}});
    return settled.ok?{...settled,code:settled.proof.effectVerified?
      settled.proof.feedState==='PRESENT'?'RECENT_PRESENT':settled.proof.feedState==='ABSENT'?
        'RECENT_ABSENT':'SOURCE_CONFIRMED_RECENT_UNKNOWN':settled.proof.effectState==='INEFFECTIVE'?'SOURCE_SAVE_INEFFECTIVE':'HELD_UNCERTAIN'}:settled;
  }
  async function maybeRefresh(s){
    // A UI observation never grants fleet mutation authority. No legitimate
    // recurring provider action is established by frozen Discovery v3.
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
        uncertain.releaseFingerprint!==(intent.plan?.approvedBaseFingerprint||intent.sourceFingerprint))
        return 'REFRESH_RECONCILIATION_HELD';
      const first=await g.getSafeRouteReadiness(uncertain.personaUid);
      if(!first?.ready)return 'REFRESH_RECONCILIATION_ROUTE_HELD';
      const claim={...intent,...(intent.plan?{plan:intent.plan,remoteId:uncertain.remoteId}:{}),id:intent.id,slug:uncertain.slug,stableId:uncertain.stableId,
        accountId:uncertain.accountId,personaUid:uncertain.personaUid,
        bindingVersion:uncertain.bindingVersion,
        principalFingerprint:a.principalFingerprint,releaseFingerprint:intent.plan?.approvedBaseFingerprint||intent.sourceFingerprint};
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
    const pendingFeed=refreshAdapter.requiresPreflight&&snapshot.state.rows.find(r=>
      r.sourceRefresh?.lastProof?.effect==='EFFECT_CONFIRMED'&&!r.refresh?.intent&&
      r.refresh?.methodHold?.startsWith('SOURCE_CONFIRMED_RECENT_')&&
      (r.refresh.feedProbes||0)<3&&r.refresh.nextAttemptAt<=clock());
    if(pendingFeed){
      const a=snapshot.state.accounts[pendingFeed.accountId];
      const out=await s.observeSourceRefresh(pendingFeed.stableId,clock(),intent=>refreshAdapter.readback({
        ...pendingFeed,...intent,remoteId:pendingFeed.remoteId,principalFingerprint:a?.principalFingerprint}));
      return out.code||'RECENT_REOBSERVED';
    }
    const row=snapshot.state.rows.filter(r=>(!refreshAdapter.requiresPreflight||
      refreshGate(r)&&!rowBlocks(snapshot.state,r).length&&!r.readyUpdate&&
      !snapshot.state.recent.suspended&&!snapshot.state.recent.failures&&
      snapshot.state.recent.observedAt>0&&clock()-snapshot.state.recent.observedAt<=2*snapshot.state.policy.recentMs&&
      clock()-(snapshot.state.accounts[r.accountId]?.healthAt||0)<=2*snapshot.state.policy.recentMs&&
      r.sourceRefresh?.qualification?.validUntil>clock()&&
      (snapshot.state.nextRefreshAt||0)<=clock()&&
      (snapshot.state.accounts[r.accountId]?.nextRefreshAt||0)<=clock()&&
      (!r.refresh?.history?.length||r.refresh.history.at(-1).allocationEpoch!==r.allocationEpoch||
        r.refresh.history.at(-1).budgetAtSave-r.activeRemaining>=
          r.sourceRefresh.qualification.minimumIntervalMs))&&r.slot&&r.phase==='ACTIVE'&&
      r.ownerVerified&&r.releaseVerified&&!r.identityHeld&&!r.reviewHeld&&
      !r.refresh?.intent&&!r.refresh?.suspended&&(r.refresh?.nextAttemptAt||0)<=clock()&&
      snapshot.state.accounts[r.accountId]?.verifiedIdentity===true)
      .sort((a,b)=>(a.refresh?.history?.at(-1)?.at||0)-(b.refresh?.history?.at(-1)?.at||0)||queueOrder(a,b))[0];
    if(!row)return 'NO_REFRESH_DUE';
    const candidate=await qualificationFor(row);
    if(!candidate)return 'REFRESH_SCOPE_NOT_QUALIFIED';
    if(refreshAdapter.requiresPreflight){
      const out=await performRefresh(s,row,candidate);return out.code||'REFRESH_EFFECT_HELD';
    }
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
      // Legacy explicit-method factory path retained for inherited oracles.
      // Production source saves use the protected preflight branch above.
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
        const s=await store(),now=clock(),result=await s.turn({now,bootId});
        if(!result.ok){await safeBreadcrumb(null,'CANONICAL_UNAVAILABLE');return result;}
        await schedule(result.state.nextWakeAt);
        // At most two protected reads per turn. Persistent quota/coalescing spans
        // all wake sources and both recent-list/statistics request classes.
        const observed=await observe(s);
        // Mutation failure cannot block the healthy shadow monitor.
        let refresh='REFRESH_ACTIVATION_HELD';
        try{if(!qualifying)refresh=await maybeRefresh(s);}catch{refresh='REFRESH_EFFECT_UNCERTAIN';}
        await notifyChanges(result);await notifyChanges(observed);
        await safeBreadcrumb(result,alarmHeld?'ALARM_UNVERIFIED':
          observed.code==='MONITOR_ACTIVATION_HELD'?'MONITOR_ACTIVATION_HELD':executionMode()==='SHADOW_ONLY'?'SHADOW_READY':'SOURCE_SAVE_READY');
        return {ok:true,revision:result.revision,mode:executionMode(),providerEffects:executionMode()==='SHADOW_ONLY'?'OFF':'SCOPED',
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
        return {...view,mode:executionMode(),providerEffects:executionMode()==='SHADOW_ONLY'?'OFF':'SCOPED',restoreHeld:restore.held,alarmHeld,monitoring:
          observationGate()?'GUARDED_READ_ONLY':'OFF_PENDING_ACTIVATION',
          refreshCapability:refreshGate()&&refreshAdapter?
            refreshAdapter.requiresPreflight?'GUARDED_SOURCE_SAVE':'QUALIFIED_ADAPTER':'OPERATOR_QUALIFICATION_REQUIRED',
          qualificationAvailable:observationGate(),sourceSaveAvailable:refreshAdapter?.requiresPreflight===true,
          fleetMutationReady:(view.enabledTargets||0)>0};
      }
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      if(SOURCE_REFRESH_COMMANDS.has(message.type)){
        if(message.type==='GET_SOURCE_REFRESH'&&refreshAdapter?.requiresPreflight){
          const snap=await s.read();if(!snap.ok)return snap;
          const row=snap.state.rows.find(r=>r.stableId===p.stableId),account=snap.state.accounts[row?.accountId];
          return refreshAdapter.command(message.type,{row,account,p,s});
        }
        if(!refreshAdapter?.requiresPreflight||qualifying||turnPromise)return fail('REFRESH_OPERATION_BUSY_OR_UNAVAILABLE');
        qualifying=true;
        try{
          await s.turn({now:clock(),bootId});
          const snap=await s.read();if(!snap.ok)return snap;
          const row=snap.state.rows.find(r=>r.stableId===p.stableId),account=snap.state.accounts[row?.accountId];
          const out=await refreshAdapter.command(message.type,{row,account,p,s,
            perform:(r,c)=>performRefresh(s,r,c)});
          await s.turn({now:clock(),bootId});
          return out;
        }finally{qualifying=false;}
      }
      if(message.type.includes('QUALIFICATION')){
        if(qualifying)return fail('QUALIFICATION_BUSY');
        if(!observationGate())return fail('MONITOR_ACTIVATION_HELD');
        qualifying=true;
        try {
          const snap=await s.read();if(!snap.ok)return snap;
          const row=snap.state.rows.find(r=>r.stableId===p.stableId);
          const account=snap.state.accounts[row?.accountId];
          const qualificationStore=createQualificationStore(await dbPromise);
          const service=createRefreshQualification({store:qualificationStore,guard,clock,
            verify:async()=>{
              const latest=await s.read(),r=latest.state?.rows.find(x=>x.stableId===p.stableId),a=latest.state?.accounts[row?.accountId];
              return latest.ok&&!(await sentinel.inspect()).held&&r?.ownerVerified&&!r.identityHeld&&
                r.remoteId===row.remoteId&&r.personaUid===row.personaUid&&r.bindingVersion===row.bindingVersion&&
                a?.verifiedIdentity&&a.principalFingerprint===account.principalFingerprint&&
                (await qualificationStore.verify(row,account)).valid===true;
            }});
          return await service.run(message.type,{...p,row,account});
        } finally {qualifying=false;}
      }
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
      if(port?.name==='pcms-i17-refresh-handoff'){
        let used=false;
        port.onMessage.addListener(msg=>{
          if(used)return;used=true;
          (async()=>{
            const sender=port.sender,tab=sender?.tab;
            if(sender?.id!==api.runtime.id||sender.frameId!==0||!Number.isSafeInteger(tab?.id)||
              typeof msg?.slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(msg.slug)||
              !/^[a-f0-9]{32}$/.test(msg.nonce||'')||Object.keys(msg).some(k=>!['slug','nonce'].includes(k))||
              sender.url!=='https://perchance.org/'+msg.slug+'#edit')return fail('UNTRUSTED_EDITOR');
            const tag=await api.sessions.getTabValue(tab.id,'pcmsI09Owned'),actual=await api.tabs.get(tab.id);
            if(tag?.createdBy!=='PCMS_I17_REFRESH'||tag.nonce!==msg.nonce||tag.slug!==msg.slug||
              actual.url!==sender.url||actual.cookieStoreId!==tag.cookieStoreId)return fail('REFRESH_TAB_OWNER_UNKNOWN');
            // Retain this exact tab even if canonical storage is currently
            // unavailable. This only removes PCMS authority; never grants it.
            await api.sessions.setTabValue(tab.id,'pcmsI09Owned',{...tag,humanIntent:true});
            const s=await store(),snap=await s.read(),row=snap.state?.rows.find(r=>r.slug===msg.slug&&r.personaUid===tag.personaUid);
            if(!row)return fail('REFRESH_HANDOFF_RECORDED_CANONICAL_UNAVAILABLE');
            const pause=await s.pause(snap.state.revision,'GENERATOR',row.stableId,true);
            return pause.ok?{ok:true,state:'HUMAN_OWNED'}:pause;
          })().then(out=>{try{port.postMessage(out);}catch{}})
            .catch(()=>{try{port.postMessage(fail('REFRESH_HANDOFF_UNCERTAIN_TAB_RETAINED'));}catch{}});
        });
        return;
      }
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
