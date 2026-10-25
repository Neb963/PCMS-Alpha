import {checkpointed} from './work-checkpoint.mjs';
// S08: dedicated, strictly read-only test cleanup observer.
// Ordinary S00 coordinator remains effect-free and cannot observe providers.
import {fail,openCanonicalDatabase,createRestoreSentinel,isSafeId} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {createCoordinatorStore} from './coordinator-store.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {standingS06} from './s06-standing-authority.mjs';
import {createGitCredentialResolver} from './git-credential.mjs';
import {writeDiagnosticReady,observeDiagnosticReady} from './diagnostic-ready-git.mjs';
const READY_JOURNAL='pcmsS08ReadyDeclaration';
export const S08_CLEANUP_PORT='pcms-s08-cleanup';
export function validateCleanupMessage(api,sender,message){
 if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
 const p=message?.params;
 if(!['VERIFY_TEST_REMOTE_ABSENCE','DECLARE_TEST_READY'].includes(message?.type)||!p||
    typeof p!=='object'||Array.isArray(p)||
    Object.keys(message).some(k=>!['type','params'].includes(k))||
    Object.keys(p).some(k=>!['intentId','runId'].includes(k))||
    !isSafeId(p.intentId)||!isSafeId(p.runId))
   return fail('INVALID_CLEANUP_MESSAGE');
 return {ok:true};
}
export function createS08CleanupBoundary(api,{open=openCanonicalDatabase,
 guard=internalPcmsGuard,gitGate=()=>false,credential=createGitCredentialResolver(api),
 write=writeDiagnosticReady,observe=observeDiagnosticReady,
 storeFactory=createCoordinatorStore}={}){
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

 // The one-button diagnostic declares READY for its OWN disposable test
 // generator so the ordinary READY → native AI → writeback pipeline runs
 // without a hand-assembled Git folder. Only the designated namespace/run,
 // only the PCMS-created NOT_READY folder, only with the Git grant. A
 // possible effect is journaled first and reconciled by readback only.
 async function declareTestReady(p,s){
   const saved=await api.storage.local.get(['pcmsS08DisposableScope','pcmsS08DiagnosticRun',
     READY_JOURNAL,'pcmsS03Git']);
   const cfg=saved.pcmsS08DisposableScope,r=saved.pcmsS08DiagnosticRun,git=saved.pcmsS03Git;
   if(!cfg||!r||r.runId!==p.runId||r.intentId!==p.intentId||
      r.config?.accountId!==cfg.accountId||r.config?.namespace!==cfg.namespace||
      r.config?.repositoryId!==cfg.repositoryId||git?.repositoryId!==cfg.repositoryId||
      typeof r.slug!=='string'||!r.slug.startsWith(cfg.namespace+'-')||
      !/^s08_[a-f0-9]{12,32}$/.test(r.runId))
     return fail('TEST_READY_SCOPE_UNVERIFIED');
   const intent=await s.getCreate(p.intentId);
   if(!intent.ok||intent.record.slug!==r.slug||intent.record.accountId!==cfg.accountId)
     return fail('TEST_CREATION_INTENT_MISMATCH');
   if(intent.record.state!=='ASSOCIATED_NOT_READY')return fail('TEST_FOLDER_NOT_YET_ASSOCIATED');
   const cred=await credential();if(!cred.ok)return cred;
   const request={repository:git.repository,repositoryId:git.repositoryId,slug:r.slug,
     readyRevision:'diag-'+r.runId.slice(4),token:cred.token};
   const journal=saved[READY_JOURNAL];
   const record=async state=>api.storage.local.set({[READY_JOURNAL]:state});
   if(journal?.runId===r.runId){
     if(journal.state==='CONFIRMED')return {ok:true,code:'TEST_READY_DECLARED',head:journal.head};
     const seen=await observe({...request,expectedHead:journal.expectedHead});
     if(seen.ok&&seen.present){
       await record({...journal,state:'CONFIRMED',head:seen.head});
       return {ok:true,code:'TEST_READY_DECLARED',head:seen.head};
     }
     // Never replay a possibly dispatched Git write.
     return fail('TEST_READY_WRITE_UNCERTAIN_RECONCILE');
   }
   if(gitGate()!==true)return fail('GIT_WRITE_GRANT_REQUIRED');
   const before=await observe({...request,expectedHead:'0'.repeat(40)});
   if(!before.ok)return before;
   if(before.present){
     await record({runId:r.runId,slug:r.slug,state:'CONFIRMED',head:before.head});
     return {ok:true,code:'TEST_READY_DECLARED',head:before.head};
   }
   if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
   await record({runId:r.runId,slug:r.slug,state:'DISPATCH_POSSIBLE',expectedHead:before.head,at:Date.now()});
   const out=await write({...request,expectedHead:before.head});
   if(out.ok){
     await record({runId:r.runId,slug:r.slug,state:'CONFIRMED',head:out.head,expectedHead:before.head});
     // Let the ordinary main observer ingest READY now, not in 15 minutes.
     try{await api.alarms?.create('pcms-s03-main-resume',{when:Date.now()+2000});}catch{}
     return {ok:true,code:'TEST_READY_DECLARED',head:out.head};
   }
   if(out.code!=='GIT_EFFECT_UNCERTAIN'){
     // Fully verified pre-dispatch refusal: nothing was written.
     await api.storage.local.remove?.(READY_JOURNAL);
     return out;
   }
   await record({runId:r.runId,slug:r.slug,state:'UNCERTAIN',expectedHead:before.head,at:Date.now()});
   return fail('TEST_READY_WRITE_UNCERTAIN_RECONCILE');
 }
 async function run(message,sender){
  const validation=validateCleanupMessage(api,sender,message);
  if(!validation.ok)return validation;
  try{
   const h=await sentinel.inspect();if(h.held)return fail(h.code);
   const db=await database();
   const s=storeFactory(db);
   if(message.type==='DECLARE_TEST_READY')return await declareTestReady(message.params,s);
   return await verifyTestRemote(message.params,s);
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
   run=checkpointed(api,run);
  return Object.freeze({run,register});
}
if(typeof browser!=='undefined')createS08CleanupBoundary(browser,{
  gitGate:()=>standingS06?.gate('gitWrite')===true}).register();
