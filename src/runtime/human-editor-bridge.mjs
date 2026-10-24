// Explicit C53 local-editor recovery. OBSERVE never tags, opens, navigates,
// closes or changes source. RECLAIM requires a committed untested child.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {perchanceEditorProbe} from './perchance-editor-probe.mjs';
import {perchanceAiNative} from './perchance-ai-native.mjs';
import {renderPcmsEditorStrip} from './editor-strip.mjs';
export function createHumanEditorBridge({browser,getState,open=openCanonicalDatabase}){
 let connection;const db=()=>connection||=open();
 const stage=async slug=>new Promise(async(resolve,reject)=>{try{const database=await db(),q=database.transaction('meta','readonly').objectStore('meta').get('stage:'+slug);q.onsuccess=()=>resolve(q.result?.record);q.onerror=()=>reject(Error('HUMAN_STAGE_UNAVAILABLE'))}catch(e){reject(e)}});
 const fail=code=>({ok:false,code}),sentinel=createRestoreSentinel(browser.storage.local);
 return async function humanReview({personaUid,cookieStoreId,routeId},request){
  const {slug,nonce,action,fingerprint}=request||{};
  if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug||'')||!/^[a-f0-9]{32}$/.test(nonce||'')||!['OBSERVE','OPEN','RECLAIM'].includes(action))return fail('HUMAN_EDITOR_REQUEST_INVALID');
  const valid=async()=>{const [s,state,hold]=await Promise.all([stage(slug),getState(),sentinel.inspect()]),p=state.profiles?.[cookieStoreId];
   return !hold.held&&s?.slug===slug&&s.nonce===nonce&&s.personaUid===personaUid&&p?.personaUid===personaUid&&p.routeId===routeId&&routeId!=='direct'&&routeId!=='block'&&state.routes?.[routeId]?.enabled!==false&&!!state.routes?.[routeId]&&
    (action!=='OPEN'||s.state==='HUMAN_OWNED')&&
    (action!=='RECLAIM'||s.state==='SOURCE_VERIFIED'&&s.humanReclaimPending===true&&s.candidate?.fingerprint===fingerprint);
  };
  if(!await valid())return fail('HUMAN_EDITOR_CONTEXT_CHANGED');
  const url='https://perchance.org/'+slug+'#edit';
  const matches=async()=>{const all=await browser.tabs.query({});return all.filter(t=>{try{const u=new URL(t.url);return u.origin==='https://perchance.org'&&u.pathname==='/'+slug&&u.hash.startsWith('#edit')}catch{return false}})};
  let tabs=await matches();
  if(action==='OPEN'){
   if(tabs.length>1||tabs.length===1&&(tabs[0].cookieStoreId!==cookieStoreId||tabs[0].url!==url))return fail('HUMAN_EDITOR_AMBIGUOUS');
   if(tabs.length){await browser.tabs.update(tabs[0].id,{active:true});return {ok:true,source:'HUMAN_EDITOR_FOCUSED'};}
   if(!await valid()||(await matches()).length)return fail('HUMAN_EDITOR_CONTEXT_CHANGED');
   const tab=await browser.tabs.create({url,cookieStoreId,active:true});
   await browser.sessions.setTabValue(tab.id,'pcmsHumanReview',{slug,nonce,personaUid,cookieStoreId,createdBy:'PCMS_C53_HANDOFF'});
   return {ok:true,source:'HUMAN_EDITOR_OPENED'};
  }
  if(!tabs.length&&action==='OBSERVE'){if(!await valid()||(await matches()).length)return fail('HUMAN_EDITOR_CONTEXT_CHANGED');return {ok:true,noEditors:true,clean:true,source:'GUARDED_HUMAN_NO_EDITOR'};}
  if(!tabs.length){
   if(!await valid()||(await matches()).length)return fail('HUMAN_EDITOR_CONTEXT_CHANGED');
   const tab=await browser.tabs.create({url,cookieStoreId,active:false});
   await browser.sessions.setTabValue(tab.id,'pcmsHumanReview',{slug,nonce,personaUid,cookieStoreId,createdBy:'PCMS_C53_RECLAIM'});
   tabs=[tab];
  }
  if(tabs.length!==1||tabs[0].cookieStoreId!==cookieStoreId||tabs[0].url!==url)return fail('HUMAN_EDITOR_AMBIGUOUS');
  const tab=tabs[0],tag=await browser.sessions.getTabValue(tab.id,'pcmsI09Owned');
  if(tag&&(tag.slug!==slug||tag.nonce!==nonce||tag.personaUid!==personaUid||tag.cookieStoreId!==cookieStoreId))return fail('HUMAN_EDITOR_DIFFERENT_OWNER');
  async function inject(func,args){const r=await browser.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'MAIN',func,args});return r?.length===1&&r[0].frameId===0&&!r[0].error?r[0].result:null;}
  const editor=await inject(perchanceEditorProbe,[slug,{allowHumanRead:true}]);
  const native=await inject(perchanceAiNative,[{slug,nonce,action:'OBSERVE'},{allowHumanRead:true}]);
  if(!editor?.ok||editor.clean!==true||!native?.ok||native.busy!==false||native.editorClean!==true||native.sourceSaved!==true||native.hasQueue!==false||native.inputOccupied!==false||native.attachmentsPending!==false)return fail('HUMAN_EDITOR_UNSAVED_OR_ACTIVE');
  const after=await browser.tabs.get(tab.id),again=await matches();
  if(!await valid()||after.url!==url||after.cookieStoreId!==cookieStoreId||again.length!==1||again[0].id!==tab.id)return fail('HUMAN_EDITOR_CONTEXT_CHANGED');
  if(action==='OBSERVE')return {ok:true,noEditors:false,clean:true,sessionDigest:native.sessionDigest,humanEpoch:editor.humanEpoch,source:'GUARDED_HUMAN_EDITOR_OBSERVATION'};
  // Tagging is local ownership admission only. No provider source is saved.
  // Any interruption retains the tab; the canonical pending child can retry.
  await browser.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',func:renderPcmsEditorStrip,args:[{slug,nonce,accountId:'Verified account',personaUid}]});
  if(!await valid())return fail('HUMAN_EDITOR_CONTEXT_CHANGED');
  await browser.sessions.setTabValue(tab.id,'pcmsI09Owned',{slug,nonce,personaUid,cookieStoreId,createdBy:'PCMS_I09',humanIntent:false});
  const reclaimed=await inject(perchanceEditorProbe,[slug,{allowHumanRead:true,reclaimNonce:nonce,expectedHumanEpoch:editor.humanEpoch??'0'}]);
  if(!reclaimed?.ok||!await valid())return fail('HUMAN_EDITOR_RECLAIM_PENDING');
  return {ok:true,clean:true,source:'GUARDED_HUMAN_EDITOR_RECLAIMED'};
 };
}

export async function handoffHumanEditor(browser,{personaUid,slug,nonce}) {
    if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)||!/^[a-f0-9]{32}$/.test(nonce||''))return {ok:false,code:'HANDOFF_IDENTITY_INVALID'};
    const tabs=await browser.tabs.query({}),found=[];
    for(const tab of tabs){
      if(tab.url!=='https://perchance.org/'+slug+'#edit')continue;
      const owned=await browser.sessions.getTabValue(tab.id,'pcmsI09Owned'),human=await browser.sessions.getTabValue(tab.id,'pcmsHumanReview');
      const tag=owned||human;
      if(tag?.slug===slug&&tag.nonce===nonce&&tag.personaUid===personaUid&&tag.cookieStoreId===tab.cookieStoreId)found.push({tab,owned,tag});
    }
    if(found.length===0&&!tabs.some(t=>t.url==='https://perchance.org/'+slug+'#edit'))return {ok:true,code:'HUMAN_TAB_ALREADY_ABSENT'};
    if(found.length!==1)return {ok:false,code:'HANDOFF_TAB_UNVERIFIED'};
    const {tab,owned,tag}=found[0];
    if(owned){await browser.sessions.setTabValue(tab.id,'pcmsHumanReview',{slug,nonce,personaUid,cookieStoreId:tag.cookieStoreId,createdBy:'PCMS_C53_HANDOFF'});
      await browser.sessions.removeTabValue(tab.id,'pcmsI09Owned');}
    return {ok:true,code:'HUMAN_TAB_RETAINED'};
  }
