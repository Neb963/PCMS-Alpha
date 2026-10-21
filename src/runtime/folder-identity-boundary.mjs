// R4: exact-scope identity review after a complete pinned main observation.
// A decision is not an owner, rename, publication, or effect receipt.
import {trustedExtensionPage} from './command-boundary.mjs';
import {createRestoreSentinel} from './journal.mjs';
import {planMainFolderChanges,chooseFolderIdentity,REVIEW_KEY} from './catalog-identity-review.mjs';
import {createExistingRenameService} from './folder-existing-rename.mjs';
export const IDENTITY_PORT='pcms-r4-folder-identity';
const LAST='pcmsS03CatalogLastComplete',CONFIG='pcmsS03Git';
const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const SHA=/^[0-9a-f]{40}$/;
const fail=code=>({ok:false,code});
export function validateIdentityMessage(api,sender,message){
 if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
 if(!message||typeof message!=='object'||Array.isArray(message)||
   !['LIST','CHOOSE','GET_RENAME_ATTEMPT','PREPARE_RENAME','EXECUTE_RENAME','RECONCILE_RENAME','FINALIZE_RENAME'].includes(message.type)||
   Object.keys(message).some(k=>!['type','params'].includes(k)))return fail('INVALID_MESSAGE');
 const p=message.params||{};
 if(message.type==='GET_RENAME_ATTEMPT'){
  return typeof p==='object'&&!Array.isArray(p)&&
    Object.keys(p).length===1&&SLUG.test(p.newSlug||'')?{ok:true}:fail('INVALID_PARAMS');
 }
 if(['PREPARE_RENAME','EXECUTE_RENAME','RECONCILE_RENAME','FINALIZE_RENAME'].includes(message.type)){
  const effect=message.type==='EXECUTE_RENAME';
  return typeof p==='object'&&!Array.isArray(p)&&
    Object.keys(p).length===(effect?3:2)&&
    Object.keys(p).every(k=>['newSlug','expectedRevision',...(effect?['consent']:[])].includes(k))&&
    (!effect||p.consent==='I APPROVE THE EXACT EXISTING GENERATOR RENAME')&&
    SLUG.test(p.newSlug||'')&&Number.isSafeInteger(p.expectedRevision)&&p.expectedRevision>0?
      {ok:true}:fail('INVALID_PARAMS');
 }

 if(typeof p!=='object'||Array.isArray(p))return fail('INVALID_PARAMS');
 if(message.type==='LIST')return Object.keys(p).length?fail('INVALID_PARAMS'):{ok:true};
 if(Object.keys(p).some(k=>!['newSlug','choice','expectedTreeOid','expectedRevision'].includes(k))||
   !SLUG.test(p.newSlug||'')||
   !['CREATE_SEPARATE','RENAME_EXISTING'].includes(p.choice)||
   !SHA.test(p.expectedTreeOid||'')||
   !Number.isInteger(p.expectedRevision)||p.expectedRevision<1)
   return fail('INVALID_PARAMS');
 return {ok:true};
}
export function createFolderIdentityBoundary(api,{clock=Date.now}={}){
 const sentinel=createRestoreSentinel(api.storage.local);
 const existingRename=createExistingRenameService(api,{clock});
 let busy=false;
 async function dispatch(message,sender){
  const a=validateIdentityMessage(api,sender,message);if(!a.ok)return a;
  if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
  if(message.type==='GET_RENAME_ATTEMPT'){
    try{
      const key='pcmsR4ExistingRenameAttempt:'+message.params.newSlug;
      const record=(await api.storage.local.get(key))?.[key];
      return {ok:true,state:record?.state||'NOT_PREPARED',
        revision:record?.revision||null,
        retryAllowed:record?.state==='RENAME_PREPARED',
        providerEffects:record?.state==='DISPATCH_POSSIBLE'||
          record?.state==='OUTCOME_UNCERTAIN'?'POSSIBLE':'OFF'};
    }catch{return fail('RENAME_ATTEMPT_UNAVAILABLE')}
  }
  if(['PREPARE_RENAME','EXECUTE_RENAME','RECONCILE_RENAME','FINALIZE_RENAME'].includes(message.type))
   return existingRename.run({
     type:message.type==='PREPARE_RENAME'?'PREPARE':
       message.type==='EXECUTE_RENAME'?'EXECUTE':
       message.type==='FINALIZE_RENAME'?'FINALIZE':'RECONCILE',
     ...message.params},sender);
  let observed,records,cfg;
  try{
   const saved=await api.storage.local.get([LAST,REVIEW_KEY,CONFIG]);
   observed=saved[LAST];records=saved[REVIEW_KEY]||[];cfg=saved[CONFIG];
  }catch{return fail('IDENTITY_STATE_UNAVAILABLE');}
  if(!observed?.complete||!cfg||cfg.repositoryId!==observed.repositoryId)
    return fail('COMPLETE_MAIN_REQUIRED');
  const plan=planMainFolderChanges(null,observed,records);
  if(!plan.ok)return fail(plan.code);
  if(message.type==='LIST')
    return {ok:true,head:observed.head,repository:observed.repository,
      items:plan.review.map(r=>({newSlug:r.newSlug,oldSlug:r.oldSlug,
        newTreeOid:r.newTreeOid,revision:r.revision||1,state:r.state,
        reason:r.reason,stale:plan.stale.includes(r.newSlug)})),
      missingFolders:(await api.storage.local.get('pcmsR4MissingGitFolders'))
        ?.pcmsR4MissingGitFolders?.slugs||[]};
  if(busy)return fail('REVIEW_BUSY');
  busy=true;
  try{
   const p=message.params;
   const current=plan.review.find(r=>r.newSlug===p.newSlug);
   if(!current||current.revision!==p.expectedRevision)
     return fail('REVIEW_REVISION_CHANGED');
   if(plan.stale.includes(p.newSlug))return fail('REVIEW_SOURCE_CHANGED');
   if(current.oldSlug&&observed.generators.some(g=>g.slug===current.oldSlug))
     return fail('ORIGINAL_FOLDER_PRESENT_REVIEW_REQUIRED');
   const decision=chooseFolderIdentity(plan,p);
   if(!decision.ok)return decision;
   const next=records.map(r=>r.newSlug===p.newSlug?
     {...decision.record,revision:r.revision+1,decidedAt:clock()}:r);
   await api.storage.local.set({[REVIEW_KEY]:next});
   const confirmed=(await api.storage.local.get(REVIEW_KEY))?.[REVIEW_KEY];
   const saved=confirmed?.find(r=>r.newSlug===p.newSlug);
   if(saved?.revision!==p.expectedRevision+1||
      saved.state!==decision.record.state)return fail('REVIEW_COMMIT_UNCERTAIN');
   if(p.choice==='CREATE_SEPARATE'){
    // Reobserves complete main before normal guarded admission. No dispatch
    // is performed by the operator choice itself.
    try{await api.alarms.create('pcms-s03-main-resume',{when:clock()+1000});}catch{}
   }
   return {ok:true,code:p.choice==='CREATE_SEPARATE'?
      'SEPARATE_IDENTITY_APPROVED_REOBSERVE_REQUIRED':
      'VERIFIED_OWNER_RENAME_PENDING',
      providerEffects:'OFF',gitEffects:'OFF',state:saved.state,
      revision:saved.revision};
  }catch{return fail('REVIEW_COMMIT_UNCERTAIN')}
  finally{busy=false;}
 }
 function register(){
  api.runtime.onConnect.addListener(port=>{
   if(port?.name!==IDENTITY_PORT)return;
   let running=false;
   port.onMessage.addListener(msg=>{
    if(running){try{port.postMessage(fail('BUSY'))}catch{}return;}
    running=true;
    void dispatch(msg,port.sender).then(r=>{try{port.postMessage(r)}catch{}})
      .catch(()=>{try{port.postMessage(fail('IDENTITY_REVIEW_UNAVAILABLE'))}catch{}})
      .finally(()=>{running=false});
   });
  });
 }
 return Object.freeze({register,dispatch});
}
if(typeof browser!=='undefined')createFolderIdentityBoundary(browser).register();
