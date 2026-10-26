import {createScopeObservation} from './scope-observation.mjs';
import {checkpointed} from './work-checkpoint.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {createCleanBulkStore,cleanBulkId,inspectCleanCandidate} from './clean-bulk-release.mjs';
import {createReleaseStore} from './release-store.mjs';
import {createReleaseBoundary} from './release-boundary.mjs';
import {matchesApproval} from './release-core.mjs';
import {issueCleanBulkAuthorization} from './clean-bulk-authority.mjs';
export const CLEAN_BULK_PORT='pcms-j04-clean-publication';
const fail=code=>({ok:false,code});
export function validateCleanBulkMessage(api,sender,msg){
 if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
 const fields={PREPARE:['slugs'],GET:['id','offset','limit'],LIST:['after','limit'],APPROVE:['id','expectedRevision','digest','explicitApproval'],CANCEL:['id','expectedRevision']};
 let json;try{json=JSON.stringify(msg)}catch{return fail('INVALID_MESSAGE')}
 if(!msg||typeof msg!=='object'||Array.isArray(msg)||!fields[msg.type]||Object.keys(msg).some(k=>!['type','params'].includes(k))||json.length>(msg.type==='PREPARE'?12000000:1500))return fail('INVALID_MESSAGE');
 const p=msg.params||{};if(typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!fields[msg.type].includes(k)))return fail('INVALID_PARAMS');
 if(msg.type==='PREPARE'&&(!Array.isArray(p.slugs)||!p.slugs.length||p.slugs.length>100000||new Set(p.slugs).size!==p.slugs.length||p.slugs.some(s=>typeof s!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(s))))return fail('INVALID_SELECTION');
 if(['GET','APPROVE','CANCEL'].includes(msg.type)&&!cleanBulkId(p.id))return fail('INVALID_PARAMS');
 if(['APPROVE','CANCEL'].includes(msg.type)&&(!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1))return fail('INVALID_PARAMS');
 if(msg.type==='APPROVE'&&(!/^[a-f0-9]{64}$/.test(p.digest||'')||p.explicitApproval!==true))return fail('INVALID_PARAMS');
 if(p.offset!==undefined&&(!Number.isSafeInteger(p.offset)||p.offset<0||p.offset>100000)||p.limit!==undefined&&(!Number.isInteger(p.limit)||p.limit<1||p.limit>100)||p.after!==undefined&&p.after!==''&&!cleanBulkId(p.after))return fail('INVALID_PARAMS');
 return {ok:true};
}
export function createCleanBulkBoundary(api,{open=openCanonicalDatabase}={}){
 let connection;const db=()=>connection||=open(),sentinel=createRestoreSentinel(api.storage.local);
 async function run(msg,sender){const valid=validateCleanBulkMessage(api,sender,msg);if(!valid.ok)return valid;
  try{const store=createCleanBulkStore(await db()),p=msg.params||{};
   if(msg.type==='GET')return store.get(p.id,p);if(msg.type==='LIST')return store.list(p);
   if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
   if(msg.type==='PREPARE')return store.prepare(p.slugs);if(msg.type==='APPROVE')return store.approve(p.id,p.expectedRevision,p.digest);if(msg.type==='CANCEL')return store.cancel(p.id,p.expectedRevision);
  }catch{return fail('CLEAN_BULK_UNAVAILABLE')}
 }
 function register(){api.runtime.onConnect.addListener(port=>{if(port?.name!==CLEAN_BULK_PORT)return;let busy=false;port.onMessage.addListener(msg=>{if(busy){try{port.postMessage(fail('BUSY'))}catch{}return}busy=true;Promise.resolve(run(msg,port.sender)).then(out=>{try{port.postMessage(out)}catch{}}).finally(()=>busy=false)})})}
   run=checkpointed(api,run,{allowDuringRestore:message=>["GET","LIST"].includes(message?.type)});
  return Object.freeze({run,register});
}
export function createCleanBulkProgress(api,{open=openCanonicalDatabase,makeRelease=()=>createReleaseBoundary(api,{open}),observationMs=10000}={}){
 let connection,busy=false,release;const db=()=>connection||=open(),sentinel=createRestoreSentinel(api.storage.local);
 const scopes=createScopeObservation(api,'cleanBulk',{observationMs});
 async function tick(){if(busy)return fail('CLEAN_BULK_BUSY');busy=true;
  try{
   if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
   const d=await db(),store=createCleanBulkStore(d),releases=createReleaseStore(d),cursorKey='pcmsCleanBulkCursor';
   let after=(await api.storage.local.get(cursorKey))?.[cursorKey]||'';if(after&&!cleanBulkId(after))after='';
   let page=await store.list({after,limit:1,activeOnly:true});if(page.ok&&!page.items.length&&after)page=await store.list({limit:1,activeOnly:true});if(!page.ok)return page;
   if(!page.items.length)return {ok:true,code:'CLEAN_BULK_NO_ACTIVE_SET'};
   const full=await store.getFull(page.items[0].id);if(!full.ok)return full;const r=full.record;
   await api.storage.local.set({[cursorKey]:r.id});
   const hint=(await api.storage.local.get('pcmsCleanBulkScopeCursor'))?.pcmsCleanBulkScopeCursor;
   const start=hint?.id===r.id&&Number.isInteger(hint.index)&&hint.index>=0&&hint.index<r.items.length?hint.index:r.cursor;
   let index=-1;for(let n=0;n<r.items.length;n++){
    const i=(start+n)%r.items.length,item=r.items[i];
    if(!['CONFIRMED','CANCELED'].includes(item.state)&&!(item.state==='HELD'&&item.requiresNewReview)&&
       !scopes.busy(['generator:'+item.slug])){index=i;break}
   }
   if(index<0)return {ok:true,code:'CLEAN_BULK_WAITING_FOR_FINISH'};
   const item=r.items[index];
   await api.storage.local.set({pcmsCleanBulkScopeCursor:{id:r.id,index:(index+1)%r.items.length}});
   const observed=await scopes.run(['generator:'+item.slug],async()=>{
   const existing=await releases.getFull(item.slug),same=existing.ok&&matchesApproval(existing.record.approval,item.snapshot.tuple).ok;
   const update=patch=>store.update(r.id,r.revision,index,patch);
   if(existing.ok&&['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN','RECOVERY_HOLD'].includes(existing.record.state))return update({state:'VERIFYING',code:'PUBLICATION_READBACK_PENDING',...(same?{releaseId:existing.record.releaseId}:{})});
   if(same&&existing.record.state==='CONFIRMED_PUBLIC')return update({state:'CONFIRMED',code:'INDEPENDENT_PUBLIC_READBACK',releaseId:existing.record.releaseId});
   if(same&&existing.record.state==='CANCELED'&&(item.previousRelease?.state!=='CANCELED'||item.previousRelease.releaseId!==existing.record.releaseId||item.previousRelease.revision!==existing.record.revision))
    return update({state:'CANCELED',code:'INDIVIDUAL_PUBLICATION_APPROVAL_CANCELED'});
   if(r.state==='CANCEL_REQUESTED'){
    if(same&&existing.record.state==='APPROVED'&&existing.record.cleanBulkSetId===r.id){
     const canceled=await releases.cancelApproved(item.slug,existing.record.revision);if(!canceled.ok)return update({state:'WAITING',code:canceled.code});
    }
    return update({state:'CANCELED',code:'CANCELED_BEFORE_DISPATCH'});
   }
   if(same&&existing.record.state==='APPROVED')return update({state:'APPROVED',releaseId:existing.record.releaseId,code:existing.record.progressHold||'PUBLICATION_QUEUED'});
   const current=await inspectCleanCandidate(d,item.slug);
   if(!current.ok||JSON.stringify(current.snapshot)!==JSON.stringify(item.snapshot))return update({state:'HELD',code:current.code||'CLEAN_CANDIDATE_CHANGED',requiresNewReview:current.code!=='CLEAN_CANDIDATE_OPERATOR_HOLD'});
   // Persist request intent before the local approval boundary. After a lost
   // response the exact normal release is read above, never published twice.
   const marked=await update({state:'APPROVAL_REQUESTED',code:null});if(!marked.ok)return marked;
   if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
   release||=makeRelease();const t=item.snapshot.tuple,out=await release.runTrusted({type:'APPROVE',bulkAuthorization:issueCleanBulkAuthorization(r,index),params:{slug:item.slug,expectedStageRevision:t.stageRevision,expectedJobRevision:t.jobRevision,fingerprint:t.sourceFingerprint,explicitApproval:true}});
   const latest=await store.getFull(r.id);if(!latest.ok)return latest;
   if(latest.record.state!=='APPROVED')return fail('CLEAN_BULK_AUTHORITY_REVOKED');
   const observed=await releases.getFull(item.slug),matched=observed.ok&&matchesApproval(observed.record.approval,item.snapshot.tuple).ok;
   return store.update(r.id,latest.record.revision,index,matched?{state:observed.record.state==='CONFIRMED_PUBLIC'?'CONFIRMED':'APPROVED',releaseId:observed.record.releaseId,code:'PUBLICATION_QUEUED'}:
    {state:'WAITING',code:out?.code||'APPROVAL_RESPONSE_UNKNOWN'});
   },{progressed:out=>out?.ok===true&&out?.revision>r.revision});
   return observed?.code==='SCOPE_CHECKPOINT_FAILED'?fail('CLEAN_BULK_PROGRESS_UNAVAILABLE'):observed;
  }catch{return fail('CLEAN_BULK_PROGRESS_UNAVAILABLE')}finally{busy=false}
 }
 tick=checkpointed(api,tick);
 return Object.freeze({tick});
}
if(typeof browser!=='undefined')createCleanBulkBoundary(browser).register();
