// S06 standing operator authority, intentionally separate from source/route and
// provider permission proofs. No source/Git/publication grant exists by default
// or after restore. Scoped operator intent/read-only management is independent.
// There is no direct effect API here: every actor retains its original guards.
import {trustedExtensionPage} from './command-boundary.mjs';
import {createRestoreSentinel} from './journal.mjs';
const KEY='pcmsS06StandingAuthority',CONFIG='pcmsS03Git',PORT='pcms-s06-authority';
const RID=/^[1-9][0-9]{0,19}$/;
const ACK='I AUTHORIZE PROTECTED PCMS OPERATIONS';
const OFF=Object.freeze({development:false,gitWrite:false,publication:false});
const fail=code=>({ok:false,code});
const grantsValid=v=>v&&typeof v==='object'&&!Array.isArray(v)&&
 Object.keys(v).length===3&&Object.keys(OFF).every(k=>typeof v[k]==='boolean');
const configured=c=>c?.repository==='Neb963/per-gens'&&RID.test(c.repositoryId||'');
const policyValid=r=>r&&r.schema===1&&Number.isSafeInteger(r.revision)&&r.revision>0&&grantsValid(r.grants);
const revisionOf=r=>Number.isSafeInteger(r?.revision)&&r.revision>0?r.revision:1;
const valid=r=>policyValid(r)&&configured({repository:r.repository,repositoryId:r.repositoryId});
const view=r=>({ok:true,onboardingAllowed:r.revocationReason==='GIT_CONFIGURATION_CHANGED',record:{revision:r.revision,
 repository:r.repository,repositoryId:r.repositoryId,grants:{...r.grants},
 changedAt:r.changedAt||null,source:'EXPLICIT_OPERATOR_AUTHORITY'}});
export function createS06StandingAuthority(api){
 const sentinel=createRestoreSentinel(api.storage.local);
 let loaded=false,current=null,registered=false,serial=Promise.resolve(),mutationSerial=Promise.resolve(),generation=0,pendingChanges=0;
 const disable=()=>{generation++;loaded=false;current=null;};
 const gate=scope=>pendingChanges===0&&loaded===true&&valid(current)&&
   Object.hasOwn(OFF,scope)&&current.grants[scope]===true;
 const enqueue=fn=>{
   const task=serial.then(fn);
   serial=task.catch(()=>{});
   return task;
 };
 async function state(){
   await mutationSerial;
   const at=generation;
   const record=(await api.storage.local.get(KEY))?.[KEY];
   const cfg=(await api.storage.local.get(CONFIG))?.[CONFIG];
   const restore=await sentinel.inspect();
   if(restore.held||!configured(cfg)||!valid(record)||
      record.repositoryId!==cfg.repositoryId){
     disable();
     // Restored standing grants may never reactivate when the restore marker
     // is eventually cleared. Persistently revoke on a cold restart, too.
     if(restore.held&&(!policyValid(record)||record.operatorManagement!==false||
        Object.values(record.grants).some(Boolean)||record.revocationReason!=='RESTORE_HOLD')){
       const paused=await revoke('RESTORE_HOLD');
       return {...paused,reason:'RESTORE_HOLD'};
     }
     return {ok:true,onboardingAllowed:record===undefined||record?.revocationReason==='GIT_CONFIGURATION_CHANGED',record:{revision:revisionOf(record),
       repository:configured(cfg)?cfg.repository:null,
       repositoryId:configured(cfg)?cfg.repositoryId:null,
       grants:{...OFF},changedAt:null,source:'INACTIVE_NO_STANDING_GRANT'},
       reason:restore.held?'RESTORE_HOLD':'UNSCOPED_OR_UNCONFIGURED'};
   }
   if(at!==generation||pendingChanges)return {ok:true,record:{...view(record).record,grants:{...OFF}},reason:'POLICY_CHANGE_PENDING'};
   current=record;loaded=true;return view(record);
 }
 async function performRevoke(reason,knownCurrent=current){
   // Synchronous process-local revocation precedes the durable write. A
   // possible prior native/Git/provider dispatch still needs reconciliation.
   const previous=knownCurrent;disable();
   const raw=(await api.storage.local.get(KEY))?.[KEY];
   const revision=Math.max(revisionOf(raw),revisionOf(previous));
   const cfg=(await api.storage.local.get(CONFIG))?.[CONFIG];
   const effectiveReason=reason==='GIT_CONFIGURATION_CHANGED'&&raw?.grants?.development===false&&
     raw.revocationReason!=='GIT_CONFIGURATION_CHANGED'?(raw.revocationReason||'LEGACY_PAUSED'):reason;
   const record={schema:1,revision:revision+1,
     repository:configured(cfg)?cfg.repository:'Neb963/per-gens',
     repositoryId:configured(cfg)?cfg.repositoryId:'0',
     grants:{...OFF},changedAt:Date.now(),revocationReason:effectiveReason,
     ...(reason==='GIT_CONFIGURATION_CHANGED'?
       (typeof raw?.operatorManagement==='boolean'?{operatorManagement:raw.operatorManagement}:{}):{operatorManagement:false})};
   await api.storage.local.set({[KEY]:record});
   // Even the write's post-return notification cannot turn this ON.
   return {ok:true,code:'STANDING_AUTHORITY_REVOKED',record:{
     ...view({...record,repositoryId:configured(cfg)?cfg.repositoryId:'1'}).record,
     repositoryId:configured(cfg)?cfg.repositoryId:null}};
 }
 async function applyUpdate(p){
   if(!p||!grantsValid(p.grants)||!Number.isSafeInteger(p.expectedRevision)||
      p.expectedRevision<1||p.consent!==ACK||!RID.test(p.repositoryId||''))
     return fail('STANDING_CONSENT_INVALID');
   const guard=await sentinel.inspect();
   if(guard.held){disable();return fail('RESTORE_HOLD');}
   const cfg=(await api.storage.local.get(CONFIG))?.[CONFIG];
   if(!configured(cfg)||cfg.repositoryId!==p.repositoryId)
     return fail('STANDING_REPOSITORY_UNVERIFIED');
   const original=(await api.storage.local.get(KEY))?.[KEY];
   const prior=valid(original)&&original.repositoryId===cfg.repositoryId?
     original:{schema:1,revision:revisionOf(original),repository:cfg.repository,
       repositoryId:cfg.repositoryId,grants:{...OFF},changedAt:null};
   if(prior.revision!==p.expectedRevision)
     return fail('STANDING_AUTHORITY_STALE_REVISION');
   // A grant cannot self-certify completion of H/GIT/L or override a
   // source fence. It only enables subsequent protected runtime decisions.
   const next={schema:1,revision:prior.revision+1,
     repository:cfg.repository,repositoryId:cfg.repositoryId,
     grants:{...p.grants},changedAt:Date.now(),
     ...(p.grants.development===false?{revocationReason:'EXPLICIT_OPERATOR'}:{})};
   disable();
   await api.storage.local.set({[KEY]:next});
   if((await sentinel.inspect()).held){
     await performRevoke('RESTORE_HOLD');return fail('RESTORE_HOLD');
   }
   const again=(await api.storage.local.get(CONFIG))?.[CONFIG];
   if(!configured(again)||again.repositoryId!==next.repositoryId){
     await performRevoke('GIT_CONFIGURATION_CHANGED');return fail('STANDING_REPOSITORY_CHANGED');
   }
   current=next;loaded=true;return view(next);
 }
 // Scoped operator requests and read-only account originals are independent
 // of Git. A false legacy record has ambiguous provenance and stays paused.
 // New automatic invalidations distinguish Git changes from explicit revoke.
 async function allowsOperatorManagement(){
   const at=generation;if(pendingChanges)return false;
   try{
     const [data,restore]=await Promise.all([api.storage.local.get(KEY),sentinel.inspect()]);
     if(pendingChanges||at!==generation||restore.held)return false;
     const record=data?.[KEY];if(record===undefined)return true;
     if(!record||record.schema!==1||!Number.isSafeInteger(record.revision)||record.revision<1||!grantsValid(record.grants))return false;
     if(typeof record.operatorManagement==='boolean')return record.operatorManagement;
     return record.grants.development===true||record.revocationReason==='GIT_CONFIGURATION_CHANGED';
   }catch{return false;}
 }
 function mutation(fn){
   const task=mutationSerial.then(fn);mutationSerial=task.catch(()=>{});return task;
 }
 function revoke(reason='EXPLICIT_OPERATOR'){
   const knownCurrent=current;disable();pendingChanges++;
   return mutation(()=>performRevoke(reason,knownCurrent)).finally(()=>{pendingChanges--;});
 }
 function update(p){
   generation++;pendingChanges++;
   return mutation(()=>applyUpdate(p)).finally(()=>{pendingChanges--;});
 }
 async function operatorManagementState(){
   await mutationSerial;
   const raw=(await api.storage.local.get(KEY))?.[KEY];
   return {ok:true,revision:revisionOf(raw),
     enabled:await allowsOperatorManagement()};
 }
 async function applyOperatorManagement(p){
   if(!p||Object.keys(p).some(k=>!['enabled','expectedRevision'].includes(k))||
      typeof p.enabled!=='boolean'||!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1)
     return fail('INVALID_OPERATOR_MANAGEMENT_POLICY');
   {
     if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
     const raw=(await api.storage.local.get(KEY))?.[KEY];
     const revision=revisionOf(raw);
     if(p.expectedRevision!==revision)return fail('STALE_REVISION');
     // This scoped choice never grants source, Git or publication authority.
     const next={schema:1,revision:revision+1,repository:'Neb963/per-gens',repositoryId:'0',
       ...(valid(raw)?raw:{grants:{...OFF}}),
       revision:revision+1,operatorManagement:p.enabled,changedAt:Date.now()};
     await api.storage.local.set({[KEY]:next});
     if((await sentinel.inspect()).held){await performRevoke('RESTORE_HOLD');return fail('RESTORE_HOLD');}
     return {ok:true,revision:next.revision,enabled:p.enabled};
   }
 }
 function setOperatorManagement(p){
   generation++;pendingChanges++;
   return mutation(()=>applyOperatorManagement(p)).finally(()=>{pendingChanges--;});
 }
 async function handle(msg,sender){
   if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
   if(!msg||typeof msg!=='object'||Array.isArray(msg)||
      JSON.stringify(msg).length>900||
      !['GET','SET','REVOKE','GET_OPERATOR_MANAGEMENT','SET_OPERATOR_MANAGEMENT'].includes(msg.type)||
      Object.keys(msg).some(k=>!['type','params'].includes(k)))
     return fail('INVALID_MESSAGE');
   if(msg.type==='GET_OPERATOR_MANAGEMENT')return operatorManagementState();
   if(msg.type==='SET_OPERATOR_MANAGEMENT')return setOperatorManagement(msg.params);
   if(msg.type==='GET')return state();
   if(msg.type==='REVOKE')return revoke();
   return update(msg.params);
 }
 function register(){
   if(registered)return;registered=true;
   // Listener runs for the module lifetime even when no dashboard is open.
   api.storage.onChanged?.addListener((changes,area)=>{
     if(area==='local'&&(changes.pcmsRestoreInProgress||changes[CONFIG])){
       const reason=changes.pcmsRestoreInProgress?'RESTORE_HOLD':'GIT_CONFIGURATION_CHANGED';
       disable();void revoke(reason).catch(()=>{});
     }else if(area==='local'&&changes[KEY]){disable();void enqueue(state).catch(()=>{});}
   });
   api.runtime.onConnect.addListener(port=>{
     if(port.name!==PORT)return;
     let busy=false;
     port.onMessage.addListener(msg=>{
       if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
       busy=true;
       void enqueue(()=>handle(msg,port.sender))
         .then(x=>{try{port.postMessage(x);}catch{}})
         .catch(()=>{try{port.postMessage(fail('STANDING_AUTHORITY_UNAVAILABLE'));}catch{}})
         .finally(()=>{busy=false;});
     });
   });
   void enqueue(state).catch(disable);
 }
 return Object.freeze({gate,register,state,update,revoke,handle,allowsOperatorManagement,operatorManagementState,setOperatorManagement,policyGeneration:()=>generation});
}
export const standingS06=typeof browser==='undefined'?null:
  createS06StandingAuthority(browser);
// Only the background entrypoint registers this singleton. Importing a
// production adapter in another extension context must not create another
// policy writer or a second configuration-invalidation queue.
