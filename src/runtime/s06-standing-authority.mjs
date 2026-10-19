// S06 standing operator authority, intentionally separate from source/route and
// provider permission proofs. No grant exists by default or after restore.
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
const valid=r=>r&&r.schema===1&&Number.isSafeInteger(r.revision)&&r.revision>0&&
 configured({repository:r.repository,repositoryId:r.repositoryId})&&
 grantsValid(r.grants);
const view=r=>({ok:true,record:{revision:r.revision,
 repository:r.repository,repositoryId:r.repositoryId,grants:{...r.grants},
 changedAt:r.changedAt||null,source:'EXPLICIT_OPERATOR_AUTHORITY'}});
export function createS06StandingAuthority(api){
 const sentinel=createRestoreSentinel(api.storage.local);
 let loaded=false,current=null,registered=false,serial=Promise.resolve();
 const disable=()=>{loaded=false;current=null;};
 const gate=scope=>loaded===true&&valid(current)&&
   Object.hasOwn(OFF,scope)&&current.grants[scope]===true;
 const enqueue=fn=>{
   const task=serial.then(fn);
   serial=task.catch(()=>{});
   return task;
 };
 async function state(){
   const record=(await api.storage.local.get(KEY))?.[KEY];
   const cfg=(await api.storage.local.get(CONFIG))?.[CONFIG];
   const restore=await sentinel.inspect();
   if(restore.held||!configured(cfg)||!valid(record)||
      record.repositoryId!==cfg.repositoryId){
     disable();
     return {ok:true,record:{revision:valid(record)?record.revision:1,
       repository:configured(cfg)?cfg.repository:null,
       repositoryId:configured(cfg)?cfg.repositoryId:null,
       grants:{...OFF},changedAt:null,source:'INACTIVE_NO_STANDING_GRANT'},
       reason:restore.held?'RESTORE_HOLD':'UNSCOPED_OR_UNCONFIGURED'};
   }
   current=record;loaded=true;return view(record);
 }
 async function revoke(){
   // Synchronous process-local revocation precedes the durable write. A
   // possible prior native/Git/provider dispatch still needs reconciliation.
   const previous=current;disable();
   const raw=(await api.storage.local.get(KEY))?.[KEY];
   const revision=Math.max(valid(raw)?raw.revision:1,valid(previous)?previous.revision:1);
   const cfg=(await api.storage.local.get(CONFIG))?.[CONFIG];
   const record={schema:1,revision:revision+1,
     repository:configured(cfg)?cfg.repository:'Neb963/per-gens',
     repositoryId:configured(cfg)?cfg.repositoryId:'0',
     grants:{...OFF},changedAt:Date.now()};
   await api.storage.local.set({[KEY]:record});
   // Even the write's post-return notification cannot turn this ON.
   return {ok:true,code:'STANDING_AUTHORITY_REVOKED',record:{
     ...view({...record,repositoryId:configured(cfg)?cfg.repositoryId:'1'}).record,
     repositoryId:configured(cfg)?cfg.repositoryId:null}};
 }
 async function update(p){
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
     original:{schema:1,revision:1,repository:cfg.repository,
       repositoryId:cfg.repositoryId,grants:{...OFF},changedAt:null};
   if(prior.revision!==p.expectedRevision)
     return fail('STANDING_AUTHORITY_STALE_REVISION');
   // A grant cannot self-certify completion of H/GIT/L or override a
   // source fence. It only enables subsequent protected runtime decisions.
   const next={schema:1,revision:prior.revision+1,
     repository:cfg.repository,repositoryId:cfg.repositoryId,
     grants:{...p.grants},changedAt:Date.now()};
   disable();
   await api.storage.local.set({[KEY]:next});
   if((await sentinel.inspect()).held){
     await revoke();return fail('RESTORE_HOLD');
   }
   const again=(await api.storage.local.get(CONFIG))?.[CONFIG];
   if(!configured(again)||again.repositoryId!==next.repositoryId){
     await revoke();return fail('STANDING_REPOSITORY_CHANGED');
   }
   current=next;loaded=true;return view(next);
 }
 async function handle(msg,sender){
   if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
   if(!msg||typeof msg!=='object'||Array.isArray(msg)||
      JSON.stringify(msg).length>900||
      !['GET','SET','REVOKE'].includes(msg.type)||
      Object.keys(msg).some(k=>!['type','params'].includes(k)))
     return fail('INVALID_MESSAGE');
   if(msg.type==='GET')return state();
   if(msg.type==='REVOKE')return revoke();
   return update(msg.params);
 }
 function register(){
   if(registered)return;registered=true;
   // Listener runs for the module lifetime even when no dashboard is open.
   api.storage.onChanged?.addListener((changes,area)=>{
     if(area==='local'&&(changes.pcmsRestoreInProgress||
        changes[CONFIG])){disable();void enqueue(revoke).catch(()=>{});}
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
 return Object.freeze({gate,register,state,update,revoke,handle});
}
export const standingS06=typeof browser==='undefined'?null:
  createS06StandingAuthority(browser);
if(standingS06)standingS06.register();
