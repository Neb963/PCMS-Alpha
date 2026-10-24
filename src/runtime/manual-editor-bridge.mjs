// C48 never-dispatched helper fallback. No SID or test PASS is invented.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {perchanceEditorProbe} from './perchance-editor-probe.mjs';
import {renderPcmsEditorStrip} from './editor-strip.mjs';
export function perchanceNoNativeProbe(slug){
 if(location.origin!=='https://perchance.org'||location.pathname!=='/'+slug||location.hash!=='#edit')return {ok:false,code:'EDITOR_TARGET_CHANGED'};
 try{
  if(typeof window.srcState?.getDraftChatSid!=='function')return {ok:false,code:'NATIVE_ABSENCE_UNVERIFIED'};
  const sid=window.srcState.getDraftChatSid();if(sid!==null&&sid!=='')return {ok:false,code:'NATIVE_SESSION_EXISTS'};
  const ids=['aiAgentSendBtn','aiAgentStopBtn','aiAgentNewChatBtn','aiAgentInputEl','aiAgentMsgsEl','aiAgentWallEl','aiAgentQueueRowEl','aiAgentAttachChipsEl'],elements=ids.map(id=>document.getElementById(id));
  if(elements.some(Boolean)){
   if(!elements.every(Boolean))return {ok:false,code:'NATIVE_ABSENCE_UNVERIFIED'};
   const [,stop,,input,,wall,queue,attachments]=elements;
   if(stop.hidden!==true||wall.hidden!==true||typeof input.value!=='string'||input.value.trim()||attachments.childElementCount!==0||!(queue.hidden===true||queue.style.display==='none'))return {ok:false,code:'NATIVE_WORK_NOT_QUIESCENT'};
  }
  return {ok:true,noNativeSession:true,source:'NATIVE_NEVER_STARTED_OBSERVATION'};
 }catch{return {ok:false,code:'NATIVE_ABSENCE_UNVERIFIED'}}
}
export function createManualEditorBridge({browser,getState,open=openCanonicalDatabase}){
 let connection;const db=()=>connection||=open(),sentinel=createRestoreSentinel(browser.storage.local);
 const read=async key=>{const d=await db();return new Promise((resolve,reject)=>{const q=d.transaction('meta','readonly').objectStore('meta').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(Error('MANUAL_EDITOR_READ_FAILED'))})};
 return async function manualEditor(context,{slug,nonce,prepare=false}){
  const {personaUid,cookieStoreId,routeId}=context,fail=code=>({ok:false,code});
  if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug||'')||!/^[a-f0-9]{32}$/.test(nonce||''))return fail('MANUAL_EDITOR_INVALID');
  async function valid(){const [st,ai,state,hold]=await Promise.all([read('stage:'+slug),read('ai-job:'+slug),getState(),sentinel.inspect()]),s=st?.record,j=ai?.job,p=state.profiles?.[cookieStoreId];
   if(hold.held||!s||!j||j.native||j.stageRevision!==s.revision||s.state!=='SOURCE_VERIFIED'||s.nonce!==nonce||s.personaUid!==personaUid||p?.personaUid!==personaUid||p.routeId!==routeId||['direct','block'].includes(routeId)||!state.routes?.[routeId]||state.routes[routeId].enabled===false)return false;
   if(!prepare)return true;
   const [ex,rl]=await Promise.all([read('s06-exception:'+slug),read('release:'+slug)]),e=ex?.record,r=rl?.release;
   return j.exceptionQuiescence==='NEVER_DISPATCHED_SOURCE'&&j.exceptionFrozen&&e?.state==='RECORDED'&&e.jobRevision===j.revision&&e.stageRevision===s.revision&&e.sourceFingerprint===j.sourceFingerprint&&r?.state==='APPROVED'&&r.approval?.aiVerified===false&&r.approval.jobRevision===j.revision&&r.approval.stageRevision===s.revision&&r.approval.sourceFingerprint===j.sourceFingerprint;
  }
  if(!await valid())return fail('MANUAL_EDITOR_CONTEXT_CHANGED');
  const url='https://perchance.org/'+slug+'#edit',matches=async()=> (await browser.tabs.query({})).filter(t=>{try{const u=new URL(t.url);return u.origin==='https://perchance.org'&&u.pathname==='/'+slug&&u.hash.startsWith('#edit')}catch{return false}});
  let tabs=await matches();
  if(!tabs.length&&!prepare){if(!await valid()||(await matches()).length)return fail('MANUAL_EDITOR_CONTEXT_CHANGED');return {ok:true,clean:true,noEditors:true,noNativeSession:true,source:'GUARDED_NEVER_DISPATCHED_NO_EDITOR'};}
  if(!tabs.length){if(!await valid()||(await matches()).length)return fail('MANUAL_EDITOR_CONTEXT_CHANGED');const tab=await browser.tabs.create({url,cookieStoreId,active:false});
   await browser.sessions.setTabValue(tab.id,'pcmsManualReview',{slug,nonce,personaUid,cookieStoreId});tabs=[tab];}
  if(tabs.length!==1||tabs[0].cookieStoreId!==cookieStoreId||tabs[0].url!==url)return fail('MANUAL_EDITOR_AMBIGUOUS');
  const tab=tabs[0],owned=await browser.sessions.getTabValue(tab.id,'pcmsI09Owned'),pending=await browser.sessions.getTabValue(tab.id,'pcmsManualReview'),tag=owned||pending;
  if(tag?.slug!==slug||tag.nonce!==nonce||tag.personaUid!==personaUid||tag.cookieStoreId!==cookieStoreId||owned?.humanIntent===true)return fail('MANUAL_EDITOR_NOT_OWNED');
  const inject=async(func,args)=>{const r=await browser.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'MAIN',func,args});return r?.length===1&&r[0].frameId===0&&!r[0].error?r[0].result:null};
  const editor=await inject(perchanceEditorProbe,[slug]),native=await inject(perchanceNoNativeProbe,[slug]);
  if(!editor?.ok||!native?.ok||native.noNativeSession!==true)return fail(native?.code||editor?.code||'MANUAL_EDITOR_UNVERIFIED');
  const after=await browser.tabs.get(tab.id),again=await matches();if(!await valid()||after.url!==url||after.cookieStoreId!==cookieStoreId||again.length!==1||again[0].id!==tab.id)return fail('MANUAL_EDITOR_CONTEXT_CHANGED');
  if(prepare&&!owned){await browser.sessions.setTabValue(tab.id,'pcmsI09Owned',{slug,nonce,personaUid,cookieStoreId,createdBy:'PCMS_I09',humanIntent:false});
   await browser.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',func:renderPcmsEditorStrip,args:[{slug,nonce,accountId:'Verified account',personaUid}]});}
  return {ok:true,clean:true,noEditors:false,noNativeSession:true,tabId:tab.id,source:'GUARDED_NEVER_DISPATCHED_CLEAN_EDITOR'};
 };
}
