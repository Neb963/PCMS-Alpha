// Fixed source writer under PersonaMonkey's existing conflict lease. Source
// authority comes from the current canonical dispatch journal, never a tab ID.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {exactSource} from './staging-core.mjs';
import {choosePrivateStageAdapter} from './ready-native-source.mjs';
import {perchanceEditorProbe} from './perchance-editor-probe.mjs';
import {perchanceAiNative} from './perchance-ai-native.mjs';
import {perchanceNoNativeProbe} from './manual-editor-bridge.mjs';
import {perchanceStageMain} from './perchance-stage.mjs';
import {perchanceExistingMain} from './perchance-existing.mjs';
import {renderPcmsEditorStrip} from './editor-strip.mjs';
const notInvoked=new WeakMap();
export const stageWasNotInvoked=(reply,record)=>!!reply&&JSON.stringify(notInvoked.get(reply))===JSON.stringify([record.slug,record.revision,record.nonce,record.candidate?.fingerprint,record.previous?.fingerprint]);
export function createStageEditorBridge({browser,getState,open=openCanonicalDatabase,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 let connection;const db=()=>connection||=open(),sentinel=createRestoreSentinel(browser.storage.local);
 const read=async key=>{const d=await db();return new Promise((resolve,reject)=>{const q=d.transaction('meta','readonly').objectStore('meta').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(Error('STAGE_READ_FAILED'))})};
 return async function stageEditor({personaUid,cookieStoreId,routeId},request){
  const fail=code=>({ok:false,code}),{slug,nonce}=request||{};
  if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug||'')||!/^[a-f0-9]{32}$/.test(nonce||'')||!Number.isSafeInteger(request.stageRevision))return fail('INVALID_STAGING_REQUEST');
  const pinned=(await read('stage:'+slug))?.record;
  if(!pinned)return fail('STAGE_NOT_FOUND');
  const retry=code=>{const reply=fail(code);notInvoked.set(reply,[pinned.slug,pinned.revision,pinned.nonce,pinned.candidate?.fingerprint,pinned.previous?.fingerprint]);return reply;};
  const valid=async()=>{const [st,state,hold]=await Promise.all([read('stage:'+slug),getState(),sentinel.inspect()]),s=st?.record,p=state.profiles?.[cookieStoreId];
   return !hold.held&&s?.state==='DISPATCH_POSSIBLE'&&s.revision===request.stageRevision&&s.nonce===nonce&&s.personaUid===personaUid&&s.candidate?.fingerprint===pinned.candidate.fingerprint&&s.previous?.fingerprint===request.previousFingerprint&&p?.personaUid===personaUid&&p.routeId===routeId&&!['direct','block'].includes(routeId)&&!!state.routes?.[routeId]&&state.routes[routeId].enabled!==false;
  };
  if(!await valid())return retry('STAGE_CONTEXT_CHANGED');
  const [previous,candidate]=await Promise.all([exactSource(request.previousFiles),exactSource(request.candidate)]);
  if(!previous.ok||!candidate.ok||previous.fingerprint!==pinned.previous.fingerprint||candidate.fingerprint!==pinned.candidate.fingerprint)return retry('STAGE_SOURCE_CHANGED');
  const url='https://perchance.org/'+slug+'#edit',tagKey='pcmsI09Owned';
  const matches=async()=> (await browser.tabs.query({})).filter(t=>{try{const u=new URL(t.url);return u.origin==='https://perchance.org'&&u.pathname==='/'+slug&&(t.cookieStoreId===cookieStoreId||u.hash.startsWith('#edit'))}catch{return false}});
  const owned=tag=>tag?.slug===slug&&tag.nonce===nonce&&tag.personaUid===personaUid&&tag.cookieStoreId===cookieStoreId&&['PCMS_I09','PCMS_I13'].includes(tag.createdBy)&&tag.humanIntent!==true;
  let tabs=await matches(),tab;
  if(!tabs.length){
   if(!await valid()||(await matches()).length)return retry('STAGE_CONTEXT_CHANGED');
   tab=await browser.tabs.create({url,cookieStoreId,active:false});
   if(!Number.isSafeInteger(tab?.id))return retry('TAB_CREATE_UNVERIFIED');
   await browser.sessions.setTabValue(tab.id,tagKey,{slug,nonce,personaUid,cookieStoreId,createdBy:'PCMS_I09',humanIntent:false});
  }else{
   if(tabs.length!==1||tabs[0].url!==url||tabs[0].cookieStoreId!==cookieStoreId||!owned(await browser.sessions.getTabValue(tabs[0].id,tagKey)))return retry('HUMAN_OR_AMBIGUOUS_EDITOR');
   tab=tabs[0];
  }
  const context=async()=>{const [latest,tag,all]=await Promise.all([browser.tabs.get(tab.id),browser.sessions.getTabValue(tab.id,tagKey),matches()]);return await valid()&&latest.url===url&&latest.cookieStoreId===cookieStoreId&&owned(tag)&&all.length===1&&all[0].id===tab.id;};
  const inject=async(func,args,world='MAIN')=>{const r=await browser.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world,func,args});return r?.length===1&&r[0].frameId===0&&!r[0].error?r[0].result:null};
  // Creation/navigation is not a source effect. Wait only with read-only
  // probes, and return a realm-local no-invocation receipt if still loading.
  let editor;
  for(let n=0;n<40;n++){
   if(!await context())return retry('STAGING_TAB_OR_ROUTE_CHANGED');
   try{editor=await inject(perchanceEditorProbe,[slug]);}catch{}
   if(editor?.ok)break;
   if(!['EDITOR_CONTRACT_UNVERIFIED',undefined].includes(editor?.code))return retry(editor.code);
   await wait(125);
  }
  if(!editor?.ok||editor.clean!==true)return retry(editor?.code||'EDITOR_NOT_READY');
  const job=(await read('ai-job:'+slug))?.job;
  const native=await inject(perchanceAiNative,[{slug,nonce,action:'OBSERVE'}]);
  if(native?.ok){
   if(native.busy!==false||native.editorClean!==true||native.sourceSaved!==true||native.hasQueue!==false||native.inputOccupied!==false||native.attachmentsPending!==false||native.sessionDigest!==(job?.native?.sessionDigest||null))return retry('STAGE_NATIVE_NOT_IDLE');
  }else{
   const absent=await inject(perchanceNoNativeProbe,[slug]);
   if(job?.native||!absent?.ok||absent.noNativeSession!==true)return retry('STAGE_NATIVE_NOT_IDLE');
  }
  if(!await context())return retry('STAGE_CONTEXT_CHANGED');
  await inject(renderPcmsEditorStrip,[{slug,nonce,accountId:'Verified account',personaUid}],'ISOLATED');
  const selection=choosePrivateStageAdapter(request.previousFiles);
  if(!selection.ok)return retry(selection.code);
  if(!await context())return retry('STAGE_CONTEXT_CHANGED');
  // From this point every error is uncertain; no no-invocation receipt can
  // be issued after the sole source adapter is called.
  const result=selection.adapter==='PRIVATE_EMPTY_I09'?
   await inject(perchanceStageMain,[{slug,files:request.candidate}]):
   await inject(perchanceExistingMain,[{action:'STAGE',slug,nonce,previousFiles:request.previousFiles,targetFiles:request.candidate}]);
  if(!await context())return fail('STAGING_TAB_OR_ROUTE_CHANGED');
  if(!result?.ok)return fail(result?.code||'EDITOR_SAVE_UNKNOWN');
  return {ok:true,code:'SAVE_ACK_ONLY',tab:{tabId:tab.id,cookieStoreId,ownershipNonce:nonce,location:url}};
 };
}
