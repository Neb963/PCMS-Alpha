// One narrowly fixed operation hosted by the existing donor lease registry.
import {perchanceRefreshMain} from './perchance-refresh.mjs';
import {perchanceEditorProbe} from './perchance-editor-probe.mjs';
import {perchanceReadIsolated} from './perchance-observer.mjs';
import {waitForOwnedEditor} from './editor-readiness.mjs';
import {renderPcmsEditorStrip} from './editor-strip.mjs';
import {exactSource} from './staging-core.mjs';
import {encodeText,validMarkerPlan} from './refresh-marker.mjs';
export async function runRefreshOwnedTab(browser,{getState,validate,routeTest},lease,request,beforeSave){
  const fail=code=>({ok:false,code,effectBoundary:'NOT_DISPATCHED'});
  const {personaUid,cookieStoreId,routeId}=lease;
  if(typeof beforeSave!=='function'||!validMarkerPlan(request?.plan)||
    request.nonce!==request.plan.operationId||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(request.slug||''))
    return fail('REFRESH_FIXED_REQUEST_REQUIRED');
  async function valid(){
    try{
      const s=await getState(),p=s.profiles?.[cookieStoreId],l=await validate(personaUid,lease.leaseId);
      return p?.personaUid===personaUid&&p.routeId===routeId&&!['direct','block','__direct__','__block__'].includes(routeId)&&
        !!s.routes?.[routeId]&&s.routes[routeId].enabled!==false&&l.cookieStoreId===cookieStoreId&&
        (await routeTest(s,cookieStoreId))?.ok===true;
    }catch{return false;}
  }
  if(!await valid())return fail('REFRESH_PROTECTED_ROUTE_CHANGED');
  const url='https://perchance.org/'+request.slug+'#edit',tagKey='pcmsI09Owned';
  const tabs=await browser.tabs.query({});
  const targets=tabs.filter(t=>{try{const u=new URL(t.url);return u.origin==='https://perchance.org'&&
    u.pathname==='/'+request.slug&&(t.cookieStoreId===cookieStoreId||u.hash.startsWith('#edit'));}catch{return false;}});
  if(targets.length)return fail('HUMAN_OR_AMBIGUOUS_EDITOR');
  const tab=await browser.tabs.create({url,cookieStoreId,active:false});
  if(!Number.isSafeInteger(tab?.id))return fail('REFRESH_TAB_CREATE_UNKNOWN');
  await browser.sessions.setTabValue(tab.id,tagKey,{slug:request.slug,nonce:request.nonce,
    personaUid,cookieStoreId,createdBy:'PCMS_I17_REFRESH',humanIntent:false});
  async function owned(){
    try{
      const t=await browser.tabs.get(tab.id),tag=await browser.sessions.getTabValue(tab.id,tagKey);
      return t?.url===url&&t.active!==true&&t.cookieStoreId===cookieStoreId&&tag?.nonce===request.nonce&&
        tag.personaUid===personaUid&&tag.createdBy==='PCMS_I17_REFRESH'&&tag.humanIntent!==true&&await valid();
    }catch{return false;}
  }
  const loaded=await waitForOwnedEditor(browser,{tabId:tab.id,slug:request.slug,cookieStoreId,
    nonce:request.nonce,validate:owned});
  if(!loaded.ok)return {...loaded,effectBoundary:'NOT_DISPATCHED'};
  await browser.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',
    func:renderPcmsEditorStrip,args:[{slug:request.slug,nonce:request.nonce,accountId:'Verified account',personaUid,mode:'SOURCE_REFRESH'}]});
  const execute=async(action)=>{
    if(!await owned())return fail('REFRESH_OWNED_TAB_CHANGED');
    const out=await browser.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'MAIN',
      func:perchanceRefreshMain,args:[{...request,action}]});
    return out?.length===1&&out[0].frameId===0&&!out[0].error?out[0].result:fail('REFRESH_INJECTION_UNVERIFIED');
  };
  const preflight=await execute('PREFLIGHT');if(!preflight?.ok)return preflight||fail('REFRESH_PREFLIGHT_FAILED');
  // Verify the actual editor tab's authenticated account and persisted bytes
  // independently in ISOLATED world before committing DISPATCH_POSSIBLE.
  const packets=await browser.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',
    func:perchanceReadIsolated,args:[{originalSlug:request.slug}]});
  const packet=packets?.length===1&&!packets[0].error&&packets[0].frameId===0?packets[0].result:null,o=packet?.original;
  if(!packet?.ok||packet.principalFingerprint!==request.principalFingerprint||o?.ownerResult!=='IS_OWNER'||
    o.remotePublicId!==request.remoteId||o.visibility!=='PUBLIC'||typeof o.pjs!=='string'||typeof o.html!=='string'||
    !Array.isArray(o.assets))return fail('REFRESH_EDITOR_SESSION_OR_OWNER_CHANGED');
  const source=await exactSource([{path:'main.pjs',base64:encodeText(o.pjs)},
    {path:'index.html',base64:encodeText(o.html)},...o.assets]);
  if(!source.ok||source.fingerprint!==request.plan.expectedPreSaveFingerprint)return fail('REFRESH_PERSISTED_SOURCE_CHANGED');
  if(!await owned())return fail('REFRESH_PRE_DISPATCH_GUARD_CHANGED');
  const marked=await beforeSave('MARK');if(!marked?.ok)return fail(marked?.code||'REFRESH_JOURNAL_NOT_COMMITTED');
  // From this line onward all failures remain possibly dispatched. No replay.
  try{
    if(!await owned()||!(await beforeSave('CHECK'))?.ok)
      return {ok:false,code:'REFRESH_FINAL_ADMISSION_CHANGED',effectBoundary:'DISPATCH_POSSIBLE'};
    const result=await execute('SAVE');
    if(!await owned())return {ok:false,code:'REFRESH_POST_SAVE_GUARD_CHANGED',effectBoundary:'DISPATCH_POSSIBLE'};
    // The native adapter affirmatively checked clean/saved. Only this exact
    // PCMS tab may be closed. Uncertain/dirty/human-taken tabs are preserved.
    if(result?.ok===true){
      const clean=await browser.scripting.executeScript({target:{tabId:tab.id,frameIds:[0]},world:'MAIN',
        func:perchanceEditorProbe,args:[request.slug,{expectedPrivate:false}]});
      if(clean?.length===1&&!clean[0].error&&clean[0].result?.clean===true&&await owned())
        await browser.tabs.remove(tab.id);
    }
    return {...result,effectBoundary:'DISPATCH_POSSIBLE'};
  }catch{return {ok:false,code:'REFRESH_NATIVE_RESPONSE_LOST',effectBoundary:'DISPATCH_POSSIBLE'};}
}
