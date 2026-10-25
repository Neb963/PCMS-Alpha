import {validShadow} from './refresher-core.mjs';
// Durable explicit C32 exception. Only the trusted READY boundary writes the
// canonical marker. The marker never grants source, Git or publication authority.
export function operatorUpdateWindow(row,ready,owner,fingerprint=null){
 const p=row?.updateNow,candidate=ready?.desired||ready?.active;
 return !!(p?.version===1&&candidate&&(!ready.hold||ready.hold==='WAIT_FOR_SAFE_SOURCE_HANDOFF')&&p.stableId===row.stableId&&
  p.readyIdentifier===candidate.identifier&&p.readyInputFingerprint===candidate.inputFingerprint&&
  p.accountId===owner?.accountId&&p.personaUid===owner.personaUid&&p.bindingVersion===owner.bindingVersion&&
  p.remotePublicId===owner.remotePublicId&&p.principalFingerprint===owner.principalFingerprint&&
  p.accountId===row.accountId&&p.personaUid===row.personaUid&&p.bindingVersion===row.bindingVersion&&p.remotePublicId===row.remoteId&&
  (fingerprint===null||p.previousFingerprint===fingerprint));
}
export function updateWindowAvailable(state,row,ready,owner,fingerprint=null){
 if(!row||['OPERATOR_PAUSED','READY_REVOKED_NOT_READY'].includes(ready?.hold)||state?.globalPause||state?.accounts?.[row.accountId]?.paused||row.paused||
    state?.inflight?.some(x=>x.stableId===row.stableId)||
    ['ATTEMPT_PENDING','DISPATCH_POSSIBLE','EFFECT_UNVERIFIED'].includes(row.refresh?.state))return false;
 return row.phase==='SLEEPING'&&row.slot!==true&&row.sleepRemaining>0||operatorUpdateWindow(row,ready,owner,fingerprint);
}

export function requestOperatorUpdate(db,{name,ready,account,inventory,sourceFingerprint}){
 return new Promise((resolve,reject)=>{let result={ok:false,code:'UPDATE_NOW_CONTEXT_CHANGED'};
  const t=db.transaction(['meta','events'],'readwrite'),m=t.objectStore('meta');t.oncomplete=()=>resolve(result);t.onabort=()=>reject(Error('UPDATE_NOW_ABORTED'));
  m.get('s05-ready:'+name).onsuccess=rd=>m.get('account:'+account.accountId).onsuccess=ac=>m.get('inventory:'+name).onsuccess=iv=>m.get('refresher:shadow:v1').onsuccess=sh=>{
   const r=rd.target.result?.record,a=ac.target.result?.account,i=iv.target.result?.generator,state=sh.target.result?.state,row=state?.rows?.find(x=>x.slug===name),wanted=r?.desired||r?.active,expected=ready.desired||ready.active;
   if(!wanted||r.revision!==ready.revision||(r.hold&&r.hold!=='WAIT_FOR_SAFE_SOURCE_HANDOFF')||wanted.identifier!==expected.identifier||wanted.inputFingerprint!==expected.inputFingerprint||a?.revision!==account.revision||a.state!=='VERIFIED'||a.personaUid!==account.personaUid||a.bindingVersion!==account.bindingVersion||a.identity?.principalFingerprint!==account.identity?.principalFingerprint||i?.revision!==inventory.revision||i.remoteId!==inventory.remoteId||i.visibility!=='PUBLIC'||i.ownerState!=='OBSERVED_OWNER'||!validShadow(state)||!row||row.accountId!==a.accountId||row.personaUid!==a.personaUid||row.bindingVersion!==a.bindingVersion||row.remoteId!==i.remoteId||state.globalPause||state.accounts?.[a.accountId]?.paused||row.paused)return;
   const next=structuredClone(state),target=next.rows.find(x=>x.slug===name);target.updateNow={version:1,stableId:row.stableId,accountId:a.accountId,personaUid:a.personaUid,bindingVersion:a.bindingVersion,principalFingerprint:a.identity.principalFingerprint,remotePublicId:i.remoteId,previousFingerprint:sourceFingerprint,readyIdentifier:wanted.identifier,readyInputFingerprint:wanted.inputFingerprint,requestedAt:Date.now()};
   next.revision++;m.put({key:'refresher:shadow:v1',state:next});t.objectStore('events').add({stage:'UPDATE_NOW_REQUESTED',slug:name,readyIdentifier:wanted.identifier,providerEffects:'NONE'});result={ok:true,code:'UPDATE_NOW_QUEUED',slug:name,providerEffects:'NONE'};
  };
 });
}
