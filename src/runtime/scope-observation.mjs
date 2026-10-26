import {createWorkNoticeSink} from './work-notices.mjs';
// Private execution observation, not effect, route, task or restore authority.
// Only actual settlement releases ownership. Canonical journals still decide
// admissibility, CAS, intent-before-dispatch and restart reconciliation.
import {trackPcmsWork} from './work-checkpoint.mjs';
import {createRestoreSentinel} from './journal.mjs';
const DOMAINS=Object.freeze(['catalog','catalogIntake','readyIntake','ready',
 'changes','writeback','cleanBulk','publication','creation','creationIntake',
 'ai','refresherClock','refresher','inventory','adoption','rename','backup','legacyGit']);
const LIMIT=4,GLOBAL_LIMIT=32,RECENT=32,KEY='pcmsWorkObservation:';
const pools=new WeakMap();
const fail=code=>({ok:false,code});
const bounded=v=>Number.isSafeInteger(v)&&v>0;
const clone=v=>JSON.parse(JSON.stringify(v));
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest(
 'SHA-256',new TextEncoder().encode(value)))).map(b=>b.toString(16).padStart(2,'0')).join('');
function poolFor(api){
 const local=api.storage.local;let pool=pools.get(local);
 if(!pool){pool={owners:new Map(),domains:new Map(),receipts:new Map(),active:0};pools.set(local,pool);}
 return pool;
}
export function createScopeObservation(api,domain,{clock=Date.now,observationMs=10000,
 setTimer=setTimeout,clearTimer=clearTimeout,onFailure=typeof browser==='undefined'?null:createWorkNoticeSink(api,domain)}={}){
 if(!DOMAINS.includes(domain)||!bounded(observationMs)||observationMs>60000)
  throw Error('INVALID_SCOPE_OBSERVATION');
 const pool=poolFor(api),sentinel=createRestoreSentinel(api.storage.local);
 let diagnostics=pool.receipts.get(domain);
 if(!diagnostics){diagnostics={rows:new Map(),serial:null,dirty:false,loaded:false,
  unavailable:false,persisted:false,sequence:0,confirmed:0,versions:new Map(),pendingNotes:0};pool.receipts.set(domain,diagnostics);}
 const key=KEY+domain;
 function flush(){
  diagnostics.dirty=true;diagnostics.persisted=false;if(diagnostics.serial)return;
  diagnostics.serial=Promise.resolve().then(async()=>{
   if(!diagnostics.loaded){
    // A failed read cannot authorize replacing unknown previous-good receipts.
    const prior=(await api.storage.local.get(key))?.[key];
    if(prior?.schema===1&&Array.isArray(prior.rows)){
     const currentRows=[...diagnostics.rows.entries()],hydrated=new Map();
     for(const row of prior.rows.slice(-RECENT)){
      if(!/^[a-f0-9]{64}$/.test(row?.scope||'')||row.domain!==domain||
       !['ATTEMPTED','AWAITING_SETTLEMENT','FAILED','SETTLED','PROGRESSED'].includes(row.checkpoint))continue;
      const time=v=>Number.isSafeInteger(v)&&v>0?v:null;
      const old={domain,scope:row.scope,checkpoint:row.checkpoint,
       lastAttempt:time(row.lastAttempt),lastSuccessfulProgression:time(row.lastSuccessfulProgression),
       failureCode:['SCOPE_CHECKPOINT_FAILED','SCOPE_CHECKPOINT_UNVERIFIED','SCOPE_OBSERVATION_PENDING'].includes(row.failureCode)?row.failureCode:null,
       nextSafeRetry:time(row.nextSafeRetry),
       causalRoot:/^[a-f0-9]{64}$/.test(row.causalRoot||'')?row.causalRoot:null};
      hydrated.set(row.scope,old);
     }
     for(const [scope,current] of currentRows){
      const old=hydrated.get(scope);
      if(current.checkpoint!=='PROGRESSED'&&old){
       current.lastSuccessfulProgression??=old.lastSuccessfulProgression;
       current.failureCode??=old.failureCode;current.causalRoot??=old.causalRoot;
      }
      hydrated.delete(scope);hydrated.set(scope,current);
     }
     diagnostics.rows=new Map([...hydrated].slice(-RECENT));
    }
    diagnostics.loaded=true;
   }
   while(diagnostics.dirty){
    diagnostics.dirty=false;
    if((await sentinel.inspect()).held){diagnostics.unavailable=true;return;}
    const revision=diagnostics.sequence,rows=[...diagnostics.rows.values()].slice(-RECENT).map(clone);
    await api.storage.local.set({[key]:{schema:1,domain,rows}});
    const readback=(await api.storage.local.get(key))?.[key];
    if(JSON.stringify(readback)!==JSON.stringify({schema:1,domain,rows}))
     throw Error('OBSERVATION_READBACK_UNVERIFIED');
    diagnostics.confirmed=revision;diagnostics.unavailable=false;
    diagnostics.persisted=revision===diagnostics.sequence;
   }
  }).catch(()=>{diagnostics.unavailable=true;diagnostics.persisted=false;})
   .finally(()=>{diagnostics.serial=null;if(diagnostics.dirty&&!diagnostics.unavailable)flush();});
 }
 // Diagnostics never contain exception messages, credentials, URLs, raw IDs,
 // source, prompts or provider payloads, and are never portable authority.
 function note(owner,checkpoint,failureCode=null,{progressed=false,settled=false}={}){
  const sequence=++owner.sequence,version=++diagnostics.sequence,at=clock();diagnostics.pendingNotes++;
  void owner.digest.then(scope=>{
   if(owner.sequence!==sequence||(diagnostics.versions.get(scope)||0)>version)return;
   diagnostics.versions.set(scope,version);
   const previous=diagnostics.rows.get(scope);
   const row={domain,scope,lastAttempt:owner.startedAt,
    lastSuccessfulProgression:progressed?at:previous?.lastSuccessfulProgression??null,
    checkpoint,failureCode:failureCode||(progressed?null:previous?.failureCode??null),
    nextSafeRetry:settled?at:null,
    causalRoot:failureCode?scope:progressed?null:previous?.causalRoot??null};
   diagnostics.rows.delete(scope);diagnostics.rows.set(scope,row);
   while(diagnostics.rows.size>RECENT){const oldest=diagnostics.rows.keys().next().value;
    diagnostics.rows.delete(oldest);diagnostics.versions.delete(oldest);}
   flush();
   if((row.failureCode||checkpoint==='PROGRESSED')&&typeof onFailure==='function'){
    try{void Promise.resolve(onFailure(clone(row))).catch(()=>{});}catch{}
   }
  }).catch(()=>{diagnostics.unavailable=true;diagnostics.persisted=false;})
   .finally(()=>{diagnostics.pendingNotes--;});
 }
 function busy(scopes){
  return scopes.some(scope=>pool.owners.has(scope));
 }
 function run(scopes,fn,{progressed=()=>false,failure=value=>value?.ok===false&&/UNAVAILABLE|UNVERIFIED|INTERRUPTED|FAILED/.test(value?.code||''),diagnostic=true,onPending=null,timeoutMs=observationMs}={}){
  if(!Array.isArray(scopes)||!scopes.length||scopes.length>3||
    scopes.some(s=>typeof s!=='string'||s.length<1||s.length>256)||
    typeof fn!=='function'||!bounded(timeoutMs)||timeoutMs>60000)
   return Promise.resolve(fail('SCOPE_OBSERVATION_INVALID'));
  const unique=[...new Set(scopes)];
  if(busy(unique))return Promise.resolve(fail('SCOPE_ACTUAL_WORK_PENDING'));
  if((pool.domains.get(domain)||0)>=LIMIT||pool.active>=GLOBAL_LIMIT)
   return Promise.resolve(fail('SCOPE_CAPACITY_HELD'));
  const owner={startedAt:clock(),sequence:0,digest:hash(domain+'\0'+unique.join('\0'))};
  for(const scope of unique)pool.owners.set(scope,owner);
  pool.active++;pool.domains.set(domain,(pool.domains.get(domain)||0)+1);
  if(diagnostic)note(owner,'ATTEMPTED');
  // The original actual work, not this bounded observation, stays in the
  // existing restore drain. Diagnostic storage is deliberately outside it.
  const actual=trackPcmsWork(Promise.resolve().then(async()=>{
   if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
   return fn();
  }));
  const settled=actual.then(value=>{
   let advanced=false;try{advanced=progressed(value)===true;}catch{}
   let failed=false;try{failed=failure(value)===true;}catch{}
   if(diagnostic||failed||advanced)note(owner,advanced?'PROGRESSED':failed?'FAILED':'SETTLED',
    failed?'SCOPE_CHECKPOINT_UNVERIFIED':null,{progressed:advanced,settled:true});
   return value;
  },()=>{
   note(owner,'FAILED','SCOPE_CHECKPOINT_FAILED',{settled:true});
   return fail('SCOPE_CHECKPOINT_FAILED');
  }).finally(()=>{
   for(const scope of unique)if(pool.owners.get(scope)===owner)pool.owners.delete(scope);
   pool.active--;pool.domains.set(domain,Math.max(0,(pool.domains.get(domain)||1)-1));
  });
  let timer;
  return Promise.race([settled,new Promise(resolve=>{
   timer=setTimer(()=>{
    if(typeof onPending==='function')try{onPending();}catch{}
    note(owner,'AWAITING_SETTLEMENT','SCOPE_OBSERVATION_PENDING');
    resolve(fail('SCOPE_OBSERVATION_PENDING'));
   },timeoutMs);
  })]).finally(()=>clearTimer(timer));
 }
 function recordProgress(scopes){
  if(!Array.isArray(scopes)||!scopes.length)return;
  note({startedAt:clock(),sequence:0,digest:hash(domain+'\0'+[...new Set(scopes)].join('\0'))},
   'PROGRESSED',null,{progressed:true,settled:true});
 }
 function receipt(){
  return {ok:!diagnostics.unavailable,domain,
   durability:diagnostics.persisted&&diagnostics.pendingNotes===0?'VERIFIED':diagnostics.unavailable?'UNAVAILABLE':'PENDING',
   rows:[...diagnostics.rows.values()].slice(-RECENT).map(clone)};
 }
 return Object.freeze({run,busy,receipt,recordProgress});
}
