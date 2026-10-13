// Synchronous listeners, one coalesced scheduler alarm, canonical turn/claim
// fences. Production observation activation is OFF; mutations have no path.
import {fail,openCanonicalDatabase,createRestoreSentinel,isSafeId,createCanonicalStore} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {createRefresherStore} from './refresher-store.mjs';
import {MINUTE} from './refresher-core.mjs';
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
  guard=internalPcmsGuard,observationGate=()=>false,clock=Date.now,
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
    const due=state.rows.filter(r=>!r.identityHeld&&r.ownerVerified&&!r.metrics.suspended&&r.metrics.nextDueAt<=now)
      .sort((a,b)=>(b.metrics.demandUntil>now?1:0)-(a.metrics.demandUntil>now?1:0)||
        a.metrics.nextDueAt-b.metrics.nextDueAt||a.ordinal-b.ordinal);
    const kind=!state.recent.suspended&&state.recent.nextDueAt<=now?'RECENT':'STATISTIC';
    if(kind==='STATISTIC'&&!due.length)return {ok:true,code:'NO_OBSERVATION_DUE'};
    const claimed=await s.claim({kind,stableId:kind==='STATISTIC'?due[0].stableId:null,
      now,bootId,claimId:newId()});
    if(!claimed.ok)return claimed;
    const c=claimed.claim;
    let packet;
    try{
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      const before=await g.getSafeRouteReadiness(c.personaUid);
      if(!before?.ready)packet={ok:false,code:'PROTECTED_ROUTE_UNAVAILABLE'};
      else {
        packet=await g.observeMonitoring(c.personaUid,{kind:c.kind,
          ...(c.kind==='STATISTIC'?{slug:c.slug}:{})});
        const after=await g.getSafeRouteReadiness(c.personaUid);
        if(!after?.ready||before.cookieStoreId!==after.cookieStoreId||before.routeId!==after.routeId)
          packet={ok:false,code:'MONITOR_CONTEXT_CHANGED'};
        else packet={...packet,interval:{source:'GUARDED_MONITOR_INTERVAL',bootId,
          from:c.startedAt,to:clock(),domain:before.healthDomain||null}};
      }
    }catch{packet={ok:false,code:'MONITOR_READ_UNAVAILABLE'};}
    if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
    // Admission time is the observation watermark; slow stale responses must
    // not look newer just because they arrive last.
    const finished=clock();
    return s.complete(c.claimId,{...packet,observedAt:c.startedAt,
      ...(packet?.interval?{interval:{...packet.interval,to:finished}}:{})},finished);
  }
  function tick(){
    if(turnPromise)return turnPromise;
    turnPromise=(async()=>{
      try{
        if((await sentinel.inspect()).held){await safeBreadcrumb(null,'RESTORE_HOLD');return fail('RESTORE_HOLD');}
        const s=await store(),now=clock(),result=await s.turn({now,bootId});
        if(!result.ok){await safeBreadcrumb(null,'CANONICAL_UNAVAILABLE');return result;}
        await schedule(result.state.nextWakeAt);
        // One bounded read per turn. Shared persistent quota/coalescing spans
        // all wake sources and both recent-list/statistics request classes.
        const observed=await observe(s);
        await notifyChanges(result);await notifyChanges(observed);
        await safeBreadcrumb(result,alarmHeld?'ALARM_UNVERIFIED':
          observed.code==='MONITOR_ACTIVATION_HELD'?'MONITOR_ACTIVATION_HELD':'SHADOW_READY');
        return {ok:true,revision:result.revision,mode:'SHADOW_ONLY',providerEffects:'OFF',
          alarmHeld,observation:observed.code||'OBSERVED'};
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
          observationGate()?'GUARDED_READ_ONLY':'OFF_PENDING_ACTIVATION'};
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
      if(alarm?.name===REFRESHER_ALARM)void alarmReceipt().then(()=>tick());
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
if(typeof browser!=='undefined')createRefresherBoundary(browser).register();
