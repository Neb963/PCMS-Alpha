// S08: dedicated, strictly read-only test cleanup observer.
// Ordinary S00 coordinator remains effect-free and cannot observe providers.
import {fail,openCanonicalDatabase,createRestoreSentinel,isSafeId} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {createCoordinatorStore} from './coordinator-store.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
export const S08_CLEANUP_PORT='pcms-s08-cleanup';
export function validateCleanupMessage(api,sender,message){
 if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
 const p=message?.params;
 if(message?.type!=='VERIFY_TEST_REMOTE_ABSENCE'||!p||
    typeof p!=='object'||Array.isArray(p)||
    Object.keys(message).some(k=>!['type','params'].includes(k))||
    Object.keys(p).some(k=>!['intentId','runId'].includes(k))||
    !isSafeId(p.intentId)||!isSafeId(p.runId))
   return fail('INVALID_CLEANUP_MESSAGE');
 return {ok:true};
}
export function createS08CleanupBoundary(api,{open=openCanonicalDatabase,
 guard=internalPcmsGuard}={}){
 let dbPromise;
 const sentinel=createRestoreSentinel(api.storage.local);
 const database=()=>dbPromise||=open().catch(e=>{dbPromise=null;throw e;});
  // Read-only cleanup verification. No provider delete command is exposed.
  // The operator must remove test resources explicitly in their native UIs.
  async function verifyTestRemote(p,s){
    const saved=await api.storage.local.get([
      'pcmsS08DisposableScope','pcmsS08DiagnosticRun']);
    const cfg=saved.pcmsS08DisposableScope,r=saved.pcmsS08DiagnosticRun;
    if(!cfg||!r||r.runId!==p.runId||r.intentId!==p.intentId||
       r.config?.accountId!==cfg.accountId||
       r.config?.personaUid!==cfg.personaUid||
       r.config?.namespace!==cfg.namespace||
       r.config?.repositoryId!==cfg.repositoryId||
       typeof r.slug!=='string'||!r.slug.startsWith(cfg.namespace+'-'))
      return fail('TEST_CLEANUP_SCOPE_UNVERIFIED');
    const intent=await s.getCreate(p.intentId);
    if(!intent.ok||intent.record.slug!==r.slug||
       intent.record.accountId!==cfg.accountId)
      return fail('TEST_CREATION_INTENT_MISMATCH');
    const db=await database();
    const account=await new Promise((resolve,reject)=>{
      const tx=db.transaction(['meta'],'readonly');
      let a=null;
      tx.objectStore('meta').get('account:'+cfg.accountId).onsuccess=e=>{
        a=e.target.result?.account||null;
      };
      tx.oncomplete=()=>resolve(a);
      tx.onabort=()=>reject(Error('TEST_ACCOUNT_READ_FAILED'));
    });
    if(account?.state!=='VERIFIED'||account.personaUid!==cfg.personaUid||
       account.identity?.source!=='GUARDED_SESSION_READBACK'||
       account.identity.bindingVersion!==account.bindingVersion||
       !/^[a-f0-9]{64}$/.test(account.identity.principalFingerprint||''))
      return fail('TEST_ACCOUNT_NO_LONGER_VERIFIED');
    const g=guard();
    if(!g?.getSafeRouteReadiness||!g?.runSupplyStep)
      return fail('PROTECTED_PROVIDER_OBSERVER_UNAVAILABLE');
    const before=await g.getSafeRouteReadiness(account.personaUid);
    if(!before?.ready||before.personaUid!==account.personaUid||
       before.principalFingerprint!==account.identity.principalFingerprint)
      return fail('TEST_ROUTE_OR_IDENTITY_CHANGED');
    const observed=await g.runSupplyStep(account.personaUid,{
      kind:'READ_TARGET',slug:r.slug,
      principalFingerprint:account.identity.principalFingerprint});
    const after=await g.getSafeRouteReadiness(account.personaUid);
    if(!after?.ready||after.routeId!==before.routeId||
       after.cookieStoreId!==before.cookieStoreId||
       after.principalFingerprint!==before.principalFingerprint||
       (await sentinel.inspect()).held)
      return fail('TEST_ROUTE_CHANGED_DURING_OBSERVATION');
    if(observed?.ok!==true||
       observed.source!=='INDEPENDENT_TARGET_READBACK'||
       observed.state!=='MISSING_VERIFIED')
      return fail(observed?.code||'TEST_REMOTE_ABSENCE_NOT_VERIFIED');
    return {ok:true,code:'TEST_REMOTE_ABSENCE_INDEPENDENTLY_VERIFIED',
      slug:r.slug,accountId:cfg.accountId,source:'PROTECTED_TARGET_READBACK'};
  }

 async function run(message,sender){
  const validation=validateCleanupMessage(api,sender,message);
  if(!validation.ok)return validation;
  try{
   const h=await sentinel.inspect();if(h.held)return fail(h.code);
   const db=await database();
   return await verifyTestRemote(message.params,createCoordinatorStore(db));
  }catch{return fail('TEST_CLEANUP_OBSERVATION_UNAVAILABLE');}
 }
 function register(){
  api.runtime.onConnect.addListener(port=>{
   if(port?.name!==S08_CLEANUP_PORT)return;
   if(!trustedExtensionPage(api,port.sender)){
    try{port.postMessage(fail('UNTRUSTED_SENDER'));}catch{}return;
   }
   let busy=false;
   port.onMessage.addListener(message=>{
    if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
    busy=true;
    Promise.resolve(run(message,port.sender))
     .then(out=>{try{port.postMessage(out);}catch{}})
     .catch(()=>{try{port.postMessage(fail('TEST_CLEANUP_OBSERVATION_UNAVAILABLE'));}catch{}})
     .finally(()=>{busy=false;});
   });
  });
 }
 return Object.freeze({run,register});
}
if(typeof browser!=='undefined')createS08CleanupBoundary(browser).register();
