// Attention projection for fixed work observations. This never admits,
// retries, cancels or resolves a provider effect. Only observed canonical
// progression can resolve this exact diagnostic incident.
import {openCanonicalDatabase,createCanonicalStore,createRestoreSentinel} from './journal.mjs';
import {createNoticeDispatcher} from './notices.mjs';
import {trackPcmsWork} from './work-checkpoint.mjs';
const valid=row=>row&&/^[a-f0-9]{64}$/.test(row.scope||'')&&
 ['SCOPE_CHECKPOINT_FAILED','SCOPE_CHECKPOINT_UNVERIFIED','SCOPE_OBSERVATION_PENDING',null].includes(row.failureCode);
export function createWorkNoticeSink(api,domain,{open=openCanonicalDatabase,
 makeStore=createCanonicalStore,clock=Date.now}={}){
 const sentinel=createRestoreSentinel(api.storage.local);
 const pending=new Map();let flight=null,connection=null;
 function flush(){
  if(flight||!pending.size)return;
  flight=Promise.resolve().then(async()=>{
   const store=makeStore(await (connection||=open().catch(error=>{connection=null;throw error;})));
   const dispatcher=createNoticeDispatcher(api,{
    recordNotice:args=>trackPcmsWork(store.recordNotice(args)),
    resolveNotice:args=>trackPcmsWork(store.resolveNotice(args))
   });
   while(pending.size){
    if((await sentinel.inspect()).held)return;
    const [scope,row]=pending.entries().next().value;
    pending.delete(scope);
    const scopeId='work_'+scope.slice(0,60);
    if(row.checkpoint==='PROGRESSED'&&row.failureCode===null){
     for(const code of ['CANONICAL_UNAVAILABLE','OPERATION_UNCERTAIN']){
      if((await sentinel.inspect()).held)return;
      await dispatcher.resolve({scopeId,code,evidence:'OBSERVED_CANONICAL_PROGRESSION'});
     }
    }else if(row.failureCode){
     const code=row.failureCode==='SCOPE_OBSERVATION_PENDING'?'OPERATION_UNCERTAIN':'CANONICAL_UNAVAILABLE';
     const target={kind:'SETTINGS',id:domain==='backup'?'backups':
      ['refresher','refresherClock'].includes(domain)?'refresher':'diagnostics'};
     if((await sentinel.inspect()).held)return;
     await dispatcher.emit({scopeId,code,target,cause:'work_'+scope.slice(0,40),
      severity:'ACTION_REQUIRED',revision:Math.max(1,row.lastAttempt||clock())});
    }
   }
  }).catch(()=>{}).finally(()=>{flight=null;});
 }
 return row=>{
  if(!valid(row))return;
  pending.delete(row.scope);pending.set(row.scope,structuredClone(row));
  while(pending.size>32)pending.delete(pending.keys().next().value);
  flush();
 };
}
