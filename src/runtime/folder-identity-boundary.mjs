import {createScopeObservation} from './scope-observation.mjs';
import {checkpointed} from './work-checkpoint.mjs';
import {catalogWatcher} from './catalog-watch.mjs';
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
   !['LIST','LIST_PAGE','GET_CONTEXT','REFRESH_OBSERVATION','CHOOSE','GET_RENAME_ATTEMPT','PREPARE_RENAME','EXECUTE_RENAME','RECONCILE_RENAME','FINALIZE_RENAME','RUN_RENAME_JOB','REFRESH_REVIEW'].includes(message.type)||
   Object.keys(message).some(k=>!['type','params'].includes(k)))return fail('INVALID_MESSAGE');
 const p=message.params||{};
 if(['GET_CONTEXT','REFRESH_OBSERVATION'].includes(message.type))
  return p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===1&&typeof p.slug==='string'&&SLUG.test(p.slug)?{ok:true}:fail('INVALID_PARAMS');
 if(message.type==='LIST_PAGE'){
  return p&&typeof p==='object'&&!Array.isArray(p)&&
   Object.keys(p).every(k=>['kind','after','limit','query'].includes(k))&&
   ['MISSING','REVIEW'].includes(p.kind)&&
   (p.after===undefined||typeof p.after==='string'&&(p.after===''||SLUG.test(p.after)))&&
   (p.limit===undefined||Number.isInteger(p.limit)&&p.limit>=1&&p.limit<=100)&&
   (p.query===undefined||typeof p.query==='string'&&p.query.length<=100)?{ok:true}:fail('INVALID_PARAMS');
 }
 if(message.type==='REFRESH_REVIEW'){return p&&typeof p==='object'&&!Array.isArray(p)&&Object.keys(p).length===2&&SLUG.test(p.newSlug||'')&&Number.isSafeInteger(p.expectedRevision)&&p.expectedRevision>0?{ok:true}:fail('INVALID_PARAMS');}
 if(['GET_RENAME_ATTEMPT','RUN_RENAME_JOB'].includes(message.type)){
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
 if(Object.keys(p).some(k=>!['newSlug','choice','expectedTreeOid','expectedRevision','authorizeRename'].includes(k))||
   !SLUG.test(p.newSlug||'')||
   !['CREATE_SEPARATE','RENAME_EXISTING'].includes(p.choice)||
   !SHA.test(p.expectedTreeOid||'')||
   !Number.isInteger(p.expectedRevision)||p.expectedRevision<1||
   (p.authorizeRename!==undefined&&(p.authorizeRename!==true||p.choice!=='RENAME_EXISTING')))
   return fail('INVALID_PARAMS');
 return {ok:true};
}
export function createFolderIdentityBoundary(api,{clock=Date.now,renameService=null,refreshMain=options=>catalogWatcher?.tick(options),observationMs=10000}={}){
 const sentinel=createRestoreSentinel(api.storage.local);
 const scopes=createScopeObservation(api,'rename',{clock,observationMs});
 const existingRename=renameService||createExistingRenameService(api,{clock});
 const ALARM='pcms-r4-identity-followup';let ticking=null;
 let busy=false;
 async function dispatch(message,sender){
  const a=validateIdentityMessage(api,sender,message);if(!a.ok)return a;
  if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
  if(message.type==='REFRESH_OBSERVATION'){
    let refreshed;try{refreshed=await refreshMain({observeOnly:true});}catch{return fail('GIT_OBSERVATION_UNAVAILABLE');}
    if(refreshed?.ok!==true)return {...fail(refreshed?.code||'GIT_OBSERVATION_UNAVAILABLE'),providerEffects:'NONE',gitEffects:'NONE'};
    return dispatch({type:'GET_CONTEXT',params:{slug:message.params.slug}},sender);
  }
  if(message.type==='REFRESH_REVIEW'){
    if(busy||ticking)return fail('REVIEW_BUSY');busy=true;
    try{
      const synced=await refreshMain();if(synced?.ok!==true)return fail('GIT_MAIN_UNAVAILABLE');
      const data=await api.storage.local.get([LAST,REVIEW_KEY,CONFIG,'pcmsR4ExistingRenameAttempt:'+message.params.newSlug]);
      const rows=data[REVIEW_KEY]||[],review=rows.find(r=>r.newSlug===message.params.newSlug),snapshot=data[LAST],attempt=data['pcmsR4ExistingRenameAttempt:'+message.params.newSlug];
      if(!review||review.revision!==message.params.expectedRevision||snapshot?.complete!==true||snapshot.repositoryId!==data[CONFIG]?.repositoryId)return fail('REVIEW_REVISION_CHANGED');
      const target=snapshot.generators.find(g=>g.slug===review.newSlug);
      if(!target||review.oldSlug&&snapshot.generators.some(g=>g.slug===review.oldSlug))return fail('ORIGINAL_FOLDER_PRESENT_REVIEW_REQUIRED');
      if(attempt&&['DISPATCH_POSSIBLE','OUTCOME_UNCERTAIN'].includes(attempt.state))return fail('RENAME_READBACK_REQUIRED');
      if(attempt&&!['RENAME_PREPARED','REMOTE_RENAME_VERIFIED_LINK_PENDING'].includes(attempt.state))return fail('RENAME_STAGE_NOT_ADMISSIBLE');
      const linked=attempt?.state==='REMOTE_RENAME_VERIFIED_LINK_PENDING';
      const next={...review,newTreeOid:target.folderTreeOid,markerOid:target.markerOid,evidenceHead:snapshot.head,revision:review.revision+1,
        state:linked?'RENAME_EXISTING_REQUESTED':'REVIEW_REQUIRED',automaticRenameApproved:linked,sourceReviewAt:clock()};
      const patch={[REVIEW_KEY]:rows.map(r=>r===review?next:r)};
      if(attempt){patch['pcmsR4ExistingRenameHistory:'+review.newSlug+':'+attempt.revision]=attempt;
        patch['pcmsR4ExistingRenameAttempt:'+review.newSlug]=linked?{...attempt,folderTreeOid:target.folderTreeOid,markerOid:target.markerOid,revision:attempt.revision+1,sourceReviewAt:clock()}:null;}
      await api.storage.local.set(patch);
      if(linked)try{await api.alarms.create(ALARM+'-soon',{when:clock()+500});}catch{}
      return {ok:true,code:linked?'RENAMED_SOURCE_SCOPE_REVIEWED':'SOURCE_SCOPE_READY_FOR_REVIEW',providerEffects:'NONE'};
    }catch{return fail('REVIEW_REFRESH_UNAVAILABLE')}finally{busy=false}
  }
  if(message.type==='RUN_RENAME_JOB')return tick(message.params.newSlug);
  if(message.type==='GET_RENAME_ATTEMPT'){
    try{
      const key='pcmsR4ExistingRenameAttempt:'+message.params.newSlug;
      const data=await api.storage.local.get([key,REVIEW_KEY,'pcmsR4RenameProgress:'+message.params.newSlug]);
      const record=data[key],review=data[REVIEW_KEY]?.find(r=>r.newSlug===message.params.newSlug); 
      return {ok:true,automaticApproved:review?.automaticRenameApproved===true,progress:data['pcmsR4RenameProgress:'+message.params.newSlug]||null,state:record?.state||'NOT_PREPARED',
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
  if(message.type==='LIST_PAGE'||message.type==='GET_CONTEXT'){
    const missing=(await api.storage.local.get('pcmsR4MissingGitFolders'))?.pcmsR4MissingGitFolders;
    const missingSlugs=missing?.repositoryId===cfg.repositoryId&&Array.isArray(missing.slugs)?
      [...new Set(missing.slugs.filter(slug=>typeof slug==='string'&&SLUG.test(slug)))].sort():[];
    const receipt=(await api.storage.local.get('pcmsS03CatalogReceipt'))?.pcmsS03CatalogReceipt;
    const reviews=plan.review.map(r=>({newSlug:r.newSlug,oldSlug:r.oldSlug,newTreeOid:r.newTreeOid,
      oldTreeOid:r.oldTreeOid||null,evidenceHead:r.evidenceHead||null,
      revision:r.revision||1,state:r.state,reason:r.reason,stale:plan.stale.includes(r.newSlug)}));
    if(message.type==='GET_CONTEXT'){
      const slug=message.params.slug,present=observed.generators.find(g=>g.slug===slug);
      const related=reviews.filter(r=>r.newSlug===slug||r.oldSlug===slug);
      const historical=missing?.repositoryId===cfg.repositoryId?missing.observations?.[slug]:null;
      const sha=v=>SHA.test(v||'')?v:null;
      return {ok:true,slug,repository:observed.repository,repositoryId:cfg.repositoryId,
        head:observed.head,observedAt:Number.isSafeInteger(observed.observedAt)?observed.observedAt:null,
        presence:present?'PRESENT_IN_COMPLETE_MAIN':missingSlugs.includes(slug)?'MISSING_IN_COMPLETE_MAIN':'NOT_RECORDED',
        currentConnectionCode:typeof receipt?.code==='string'&&/^[A-Z_]{3,80}$/.test(receipt.code)?receipt.code:null,
        review:related.slice(0,20),reviewTotal:related.length,reviewMore:related.length>20,observation:historical?{firstAbsentHead:sha(historical.firstAbsentHead),
          lastAbsentHead:sha(historical.lastAbsentHead),lastPresentHead:sha(historical.lastPresentHead),
          oldTreeOid:sha(historical.oldTreeOid),returnedHead:sha(historical.returnedHead),
          observedAt:Number.isSafeInteger(historical.observedAt)?historical.observedAt:null,
          returnedAt:Number.isSafeInteger(historical.returnedAt)?historical.returnedAt:null}:null,
        providerEffects:'NONE',gitEffects:'NONE'};
    }
    const p=message.params,limit=p.limit||20,after=p.after||'',query=(p.query||'').toLowerCase();
    const all=p.kind==='MISSING'?missingSlugs.map(slug=>({slug})):
      reviews.filter(r=>['REVIEW_REQUIRED','RENAME_EXISTING_REQUESTED','REMOTE_RENAMED_LINK_PENDING'].includes(r.state)||r.stale);
    const key=r=>p.kind==='MISSING'?r.slug:r.newSlug;
    const ordered=all.sort((a,b)=>key(a)<key(b)?-1:key(a)>key(b)?1:0);
    const matching=ordered.filter(r=>!query||[key(r),r.oldSlug,r.state,r.reason].join(' ').toLowerCase().includes(query));
    const remaining=matching.filter(r=>!after||key(r)>after),more=remaining.length>limit,items=remaining.slice(0,limit);
    return {ok:true,head:observed.head,repository:observed.repository,
      items,total:matching.length,unfilteredTotal:all.length,more,next:more?key(items.at(-1)):null,
      currentConnectionCode:receipt?.code||null,providerEffects:'NONE',gitEffects:'NONE'};
  }
  if(message.type==='LIST')
    return {ok:true,head:observed.head,repository:observed.repository,
      items:plan.review.map(r=>({newSlug:r.newSlug,oldSlug:r.oldSlug,
        newTreeOid:r.newTreeOid,revision:r.revision||1,state:r.state,
        reason:r.reason,stale:plan.stale.includes(r.newSlug)})),
      missingFolders:(await api.storage.local.get('pcmsR4MissingGitFolders'))
        ?.pcmsR4MissingGitFolders?.slugs||[]};
  if(busy||ticking)return fail('REVIEW_BUSY');
  busy=true;
  try{
   const p=message.params;
   const current=plan.review.find(r=>r.newSlug===p.newSlug);
   if(!current||current.revision!==p.expectedRevision||current.newTreeOid!==p.expectedTreeOid)
     return fail('REVIEW_REVISION_CHANGED');
   if(plan.stale.includes(p.newSlug))return fail('REVIEW_SOURCE_CHANGED');
   if(current.oldSlug&&observed.generators.some(g=>g.slug===current.oldSlug))
     return fail('ORIGINAL_FOLDER_PRESENT_REVIEW_REQUIRED');
   const decision=current.state==='RENAME_EXISTING_REQUESTED'&&p.choice==='RENAME_EXISTING'&&p.authorizeRename===true?{ok:true,record:current}:chooseFolderIdentity(plan,p);
   if(!decision.ok)return decision;
   const next=records.map(r=>r.newSlug===p.newSlug?
     {...decision.record,revision:r.revision+1,decidedAt:clock(),
       ...(p.choice==='RENAME_EXISTING'?{automaticRenameApproved:p.authorizeRename===true}:{})}:r);
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
 async function performTick(onlySlug){
  if(busy)return fail('REVIEW_BUSY');
  if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
  const rows=(await api.storage.local.get(REVIEW_KEY))?.[REVIEW_KEY]||[];
  const attempts=await api.storage.local.get(rows.map(r=>'pcmsR4ExistingRenameAttempt:'+r.newSlug));
  // Existing possible effects remain observable after upgrade or source drift.
  // Only explicit current automatic approval can admit a new native effect.
  const candidates=rows.filter(r=>(!onlySlug||r.newSlug===onlySlug)&&(
    r.state==='RENAME_EXISTING_REQUESTED'&&r.automaticRenameApproved===true||
    ['DISPATCH_POSSIBLE','OUTCOME_UNCERTAIN'].includes(attempts['pcmsR4ExistingRenameAttempt:'+r.newSlug]?.state)));
  const progress=await api.storage.local.get(candidates.map(r=>'pcmsR4RenameProgress:'+r.newSlug));
  const review=candidates.filter(r=>!scopes.busy(['generator:'+r.newSlug,...(r.oldSlug?['generator:'+r.oldSlug]:[])])).sort((a,b)=>(progress['pcmsR4RenameProgress:'+a.newSlug]?.observedAt||0)-(progress['pcmsR4RenameProgress:'+b.newSlug]?.observedAt||0))[0];
  if(!review)return {ok:true,code:'NO_PENDING_RENAME'};
  const keys=['generator:'+review.newSlug,...(review.oldSlug?['generator:'+review.oldSlug]:[])];
  await api.storage.local.set({['pcmsR4RenameProgress:'+review.newSlug]:{
   code:'RENAME_OBSERVATION_PENDING',ok:false,observedAt:clock()}});
  return scopes.run(keys,async()=>{
  const saved=(await api.storage.local.get('pcmsR4ExistingRenameAttempt:'+review.newSlug))?.['pcmsR4ExistingRenameAttempt:'+review.newSlug];
  const type=!saved&&review.automaticRenameApproved===true?'PREPARE':saved?.state==='RENAME_PREPARED'&&review.automaticRenameApproved===true?'EXECUTE':['DISPATCH_POSSIBLE','OUTCOME_UNCERTAIN'].includes(saved?.state)?'RECONCILE':review.automaticRenameApproved===true&&['REMOTE_RENAME_VERIFIED_LINK_PENDING','RENAME_COMPLETED'].includes(saved?.state)?'FINALIZE':null;
  if(!type)return fail('RENAME_STAGE_NOT_ADMISSIBLE');
  const out=await existingRename.run({type,newSlug:review.newSlug,expectedRevision:saved?.revision||review.revision,
    ...(type==='EXECUTE'?{consent:'I APPROVE THE EXACT EXISTING GENERATOR RENAME'}:{})});
  await api.storage.local.set({['pcmsR4RenameProgress:'+review.newSlug]:{code:out.code,ok:out.ok,observedAt:clock()}});
  if(out.ok&&out.state!=='RENAME_COMPLETED')try{await api.alarms.create(ALARM+'-soon',{when:clock()+1000});}catch{}
  return out;
  },{progressed:r=>r?.ok===true&&Number.isSafeInteger(r?.revision)});
 }
 function tick(slug){return ticking||(ticking=performTick(slug).finally(()=>{ticking=null}))}
 function register(){
  api.alarms?.onAlarm?.addListener(event=>{if(event?.name===ALARM||event?.name===ALARM+'-soon')void tick().catch(()=>{})});
  api.runtime.onStartup?.addListener(()=>{void tick().catch(()=>{})});
  try{void Promise.resolve(api.alarms.create(ALARM,{periodInMinutes:1})).catch(()=>{})}catch{}
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
   dispatch=checkpointed(api,dispatch,{allowDuringRestore:message=>["LIST","LIST_PAGE","GET_CONTEXT","GET_RENAME_ATTEMPT"].includes(message?.type)});
  tick=checkpointed(api,tick);
  return Object.freeze({register,dispatch,tick});
}
if(typeof browser!=='undefined')createFolderIdentityBoundary(browser).register();
