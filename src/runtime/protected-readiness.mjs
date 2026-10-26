// Private same-background wake hints. These carry no credentials, route
// proofs or execution authority. Existing enrollment and donor guards decide
// every admission; a hint can only request their ordinary reconciliation.
import {trackPcmsWork} from './work-checkpoint.mjs';
const listeners=new Set();
let nativeFingerprint=null;
const uid=v=>typeof v==='string'&&/^[a-z0-9-]{8,128}$/i.test(v);
const emit=event=>{const results=[];for(const f of listeners)try{results.push(f(Object.freeze(event)));}catch{}return results;};
export function subscribeProtectedReadiness(fn){listeners.add(fn);return ()=>listeners.delete(fn);}
export function requestProtectedReadiness(personaUid){if(uid(personaUid))emit({kind:'DEMAND',personaUid});}
export async function awaitProtectedReadiness(personaUid){
 if(!uid(personaUid))return false;
 const work=emit({kind:'DEMAND',personaUid}).filter(r=>r&&typeof r.then==='function');
 if(!work.length)return false;
 let timer;try{await Promise.race([Promise.allSettled(work),new Promise(r=>{timer=setTimeout(r,40000);})]);return true;}
 finally{clearTimeout(timer)}
}
export function donorReadinessAvailable(){emit({kind:'DONOR_AVAILABLE'});}
export function accountReadinessObserved(personaUid){if(uid(personaUid))emit({kind:'ACCOUNT_READY',personaUid});}
export function publishNativeReadiness(status,{idle=false}={}){
 const value={installed:status?.installed===true,compatible:status?.compatible===true,
  ready:status?.ready===true,tunnelUp:status?.interface_up===true,
  proxyReachable:status?.base_proxy_reachable===true,pending:!!status?.pending_prepare_routes?.length,idle};
 value.code=status?.observation==='TIMED_OUT'?'MULLVAD_STATUS_TIMEOUT':!value.installed?'MULLVAD_LOCAL_SERVICE_UNAVAILABLE':
  !value.compatible?'MULLVAD_HELPER_INCOMPATIBLE':status?.interface_up===false?'MULLVAD_TUNNEL_UNAVAILABLE':
  status?.base_route_bound===false?'MULLVAD_TUNNEL_ROUTE_UNAVAILABLE':status?.base_proxy_reachable===false?'MULLVAD_PROXY_UNREACHABLE':
  value.ready?null:'MULLVAD_CONNECTION_UNVERIFIED';
 const fingerprint=JSON.stringify(value);if(fingerprint===nativeFingerprint)return;
 nativeFingerprint=fingerprint;emit({kind:'NATIVE_CHANGED',...value});
}

export const READINESS_FOLLOWUP_ALARM='pcms-protected-readiness-followup';
export const READINESS_RECEIPT='pcmsProtectedReadinessReceipt';
const retryable=code=>/^(MULLVAD_|DONOR_|PROTECTED_|GUARD_|LEASE_|SESSION_CONTEXT_CHANGED$|ROUTE_OBSERVATION_|ROUTE_CHECK_FAILED$|ROUTE_SEARCH_PENDING$|NO_ROUTE_CANDIDATES$|ENROLLMENT_|ACCOUNT_BUSY$|INVENTORY_UNAVAILABLE$)/.test(code||'');
const SAFE_STATE=new Set(['IDLE','WAITING_FOR_DONOR','CHECKING_ACCOUNTS','ACCOUNT_HELD','OBSERVED','FAILED']);
// A small fixed readiness queue, not another router or workflow executor.
// Only operator-bound accounts may enter. The durable queue is a retry hint;
// enrollment rereads canonical state and owns all potentially active effects.
export function createProtectedReadinessCoordinator(api,{list,connection,check,inUse=async()=>false,activePersonas=null,
 hold=()=>{},held=async()=>false,clock=Date.now,maxPerTurn=4,observationMs=40000,subscribe=subscribeProtectedReadiness}={}){
 if(!Number.isSafeInteger(observationMs)||observationMs<10||observationMs>40000)throw Error('INVALID_OBSERVATION_BUDGET');
 let flight=null,registered=false,hydrate=null,queue=new Map(),all=false,periodic=false,changed=false;
 const observations=new Map();
 async function observe(key,task){
  if(observations.has(key))return {ok:false,code:'ACCOUNT_BUSY'};
  const actual=trackPcmsWork(Promise.resolve().then(task).catch(()=>({ok:false,code:'ENROLLMENT_INTERRUPTED'})));
  observations.set(key,actual);
  void actual.finally(()=>{if(observations.get(key)===actual)observations.delete(key);});
  let timer;try{return await Promise.race([actual,new Promise(r=>{timer=setTimeout(()=>r({ok:false,code:'ROUTE_OBSERVATION_TIMEOUT'}),observationMs);})]);}
  finally{clearTimeout(timer)}
 }
 const demands=new Set();let lastSuccess=null,known=[],pendingWake=false,nativeReady=null,nativeGeneration=0,idleStopped=false,hostAttempts=0;
 async function load(){
  const saved=(await api.storage.local.get(READINESS_RECEIPT))?.[READINESS_RECEIPT];
  lastSuccess=Number.isSafeInteger(saved?.lastSuccess)?saved.lastSuccess:null;
  idleStopped=saved?.idleStopped===true;
  hostAttempts=Number.isSafeInteger(saved?.hostAttempts)?Math.max(0,Math.min(12,saved.hostAttempts)):0;
  for(const row of Array.isArray(saved?.pending)?saved.pending.slice(0,1000):[])
   if(typeof row?.accountId==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(row.accountId)&&Number.isSafeInteger(row.nextRetry))queue.set(row.accountId,{
    accountId:row.accountId,attempts:Number.isSafeInteger(row.attempts)?Math.max(0,Math.min(12,row.attempts)):0,
    nextRetry:Math.max(0,Math.min(clock()+300000,row.nextRetry)),lastAttempt:Number.isSafeInteger(row.lastAttempt)?Math.max(0,row.lastAttempt):0,
    failureCode:typeof row.failureCode==='string'&&/^[A-Z0-9_]{3,64}$/.test(row.failureCode)?row.failureCode:null});
  if(!saved)all=true;
 }
 const add=a=>{if(!queue.has(a.accountId))queue.set(a.accountId,{accountId:a.accountId,attempts:0,nextRetry:clock(),lastAttempt:0});};
 async function schedule(){
  if(!queue.size&&!pendingWake)return;
  const next=pendingWake?clock()+1000:Math.min(...[...queue.values()].map(r=>r.nextRetry));
  // A one-shot wake is coalesced; the existing ten-minute alarm is fallback.
  try{const old=await api.alarms?.get?.(READINESS_FOLLOWUP_ALARM);
   if(!old||old.scheduledTime>next+1000)await api.alarms?.create(READINESS_FOLLOWUP_ALARM,{when:Math.max(clock()+1000,next)});
  }catch{}
 }
 async function receipt(checkpoint,failureCode=null,scope=null){
  if(!SAFE_STATE.has(checkpoint))throw Error('INVALID_READINESS_CHECKPOINT');
  const next=queue.size?Math.min(...[...queue.values()].map(r=>r.nextRetry)):null;
  await api.storage.local.set({[READINESS_RECEIPT]:{schema:1,lastAttempt:clock(),lastSuccess,checkpoint,
   failureCode,nextSafeRetry:next,scope,causalRoot:failureCode?.startsWith('MULLVAD_')?'personamonkey_connection':'protected_account',
   idleStopped,hostAttempts,pending:[...queue.values()].slice(0,1000)}});
 }
 async function perform(){
  await (hydrate||=load().catch(error=>{hydrate=null;throw error}));
  if(await held())return {ok:false,code:'RESTORE_HOLD'};
  const listed=await list();if(!listed?.ok)throw Error('READINESS_RECORDS_UNAVAILABLE');
  known=listed.accounts.filter(a=>!a.removed);
  const active=known.filter(a=>a.state!=='ARCHIVED');
  const wanted=[...demands];demands.clear();const includeAll=all,inspectUse=periodic,recovered=changed;
  all=false;periodic=false;changed=false;pendingWake=false;
  // One donor-owned snapshot covers the fleet. A slow/unknown activity
  // observation cannot turn an idle account into permission to prepare it.
  const activity=inspectUse&&activePersonas?await observe('activity',activePersonas):null;
  const using=activity?.ok&&Array.isArray(activity.personas)?new Set(activity.personas):new Set();
  for(const a of known){
   if(a.state==='ARCHIVED'){
    if(a.route?.status!=='RELEASED')add(a);continue;
   }
   if(includeAll||wanted.includes(a.personaUid)||a.state==='PREPARING'||a.state==='INVENTORY_PENDING'||
      a.upgrade&&a.upgrade.phase!=='COMPLETE'||recovered&&a.route?.status!=='PINNED'||
      inspectUse&&(activePersonas?using.has(a.personaUid):await inUse(a)===true))add(a);
  }
  const ids=new Set(known.map(a=>a.accountId));for(const id of queue.keys())if(!ids.has(id))queue.delete(id);
  if(!queue.size){await receipt('IDLE');return {ok:true,checked:0};}
  // initialize/inspectConnection is donor-owned. Compatible but stopped is
  // eligible for ONE donor prepare to auto-start; waiting for ready here
  // would deadlock the donor's existing autoStart mechanism.
  const host=await observe('connection',connection);
  if(!host||host.installed!==true||host.compatible!==true){
   const code=host?.code||'DONOR_STARTING';
   const delay=Math.min(60000,1000*2**Math.min(6,hostAttempts++));
   for(const row of queue.values()){row.nextRetry=clock()+delay;row.failureCode=code;}
   await receipt('WAITING_FOR_DONOR',code);await schedule();return {ok:false,code};
  }
  hostAttempts=0;
  const selected=[...queue.values()].filter(r=>r.nextRetry<=clock())
   .sort((a,b)=>a.lastAttempt-b.lastAttempt||a.accountId.localeCompare(b.accountId)).slice(0,maxPerTurn);
  // Persist fair advancement before waiting on any potentially slow account.
  for(const row of selected){row.lastAttempt=clock();row.attempts=Math.min(12,row.attempts+1);row.nextRetry=clock()+60000;}
  await receipt('CHECKING_ACCOUNTS');
  let cursor=0,checked=0;const failures=[];
  await Promise.all(Array.from({length:Math.min(host.ready?2:1,selected.length)},async()=>{
   while(cursor<selected.length){
    const row=selected[cursor++];if(await held())break;
    const result=await observe(row.accountId,()=>check(row.accountId));
    checked++;
    if(result?.ok){queue.delete(row.accountId);lastSuccess=clock();
     const a=active.find(a=>a.accountId===row.accountId);if(a)accountReadinessObserved(a.personaUid);
    }else{
     const code=typeof result?.code==='string'&&/^[A-Z0-9_]{3,64}$/.test(result.code)?result.code:'ENROLLMENT_INTERRUPTED';
     row.failureCode=code;
     failures.push({accountId:row.accountId,code});
     if(retryable(code))row.nextRetry=clock()+Math.min(300000,15000*2**Math.min(5,row.attempts));
     else queue.delete(row.accountId); // explicit individual safety hold
    }
   }
  }));
  await receipt(failures.length?'ACCOUNT_HELD':'OBSERVED',failures[0]?.code||null,failures[0]?.accountId||null);
  await schedule();return {ok:failures.length===0,checked,failures};
 }
 function turn(){
  if(flight)return flight;
  flight=perform().catch(async()=>{try{await receipt('FAILED','READINESS_OBSERVATION_UNAVAILABLE');}catch{}
   return {ok:false,code:'READINESS_OBSERVATION_UNAVAILABLE'};
  }).finally(()=>{flight=null;if(pendingWake)void schedule();});return flight;
 }
 function wake({startup=false,personaUid=null,fallback=false,recovery=false}={}){
  all ||= startup;periodic ||= fallback;changed ||= recovery;if(uid(personaUid))demands.add(personaUid);
  pendingWake=true;return turn();
 }
 function register(){
  if(registered)return;registered=true;
  subscribe(event=>{
   if(event.kind==='DEMAND')return wake({personaUid:event.personaUid});
   else if(event.kind==='DONOR_AVAILABLE'){
    hostAttempts=0;
    for(const row of queue.values())if(row.failureCode==='DONOR_STARTING')row.nextRetry=clock();
    void wake();
   }
   else if(event.kind==='NATIVE_CHANGED'){
    const generation=++nativeGeneration;
    const recovered=event.ready&&nativeReady!==true;nativeReady=event.ready;
    if(event.idle){idleStopped=true;void receipt('IDLE').catch(()=>{});}
    if(!event.ready)for(const a of known)if(a.bindingId){
     try{void Promise.resolve(hold(a.bindingId,idleStopped?'ROUTE_IDLE':event.code||'DONOR_READINESS_LOST',a.accountId,
       ()=>generation===nativeGeneration&&nativeReady===false)).catch(()=>{});}catch{}
     if(!idleStopped&&a.state!=='ARCHIVED')add(a);
    }
    // An intentional idle stop does not enqueue healthy idle accounts.
    if(recovered){
     idleStopped=false;hostAttempts=0;
     for(const row of queue.values())if(/^(MULLVAD_|DONOR_)/.test(row.failureCode||''))row.nextRetry=clock();
     void wake({recovery:true});
    }
    else if(!event.ready&&!idleStopped)void wake();
   }
  });
  api.storage.onChanged?.addListener((changes,area)=>{
   if(area==='local'&&Object.keys(changes).some(k=>k.startsWith('personaMullvadPendingPrepare:')))void wake();
  });
  api.alarms?.onAlarm?.addListener(a=>{if(a?.name===READINESS_FOLLOWUP_ALARM)void wake();});
  api.runtime.onStartup?.addListener(()=>void wake({startup:true}));
  api.runtime.onInstalled?.addListener(()=>void wake({startup:true}));
  void wake();
 }
 return Object.freeze({register,wake,turn});
}
