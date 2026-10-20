// S00: trusted, installed-XPI command ingress; no provider, Git or native writes.
import {fail,openCanonicalDatabase,createRestoreSentinel,isSafeId} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {createCoordinatorStore} from './coordinator-store.mjs';
import {createCreationRunner} from './creation-runner.mjs';
import {standingS06} from './s06-standing-authority.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
export const COORDINATOR_PORT='pcms-s00-coordinator';
const types=new Set(['ACCEPT_CREATE_INTENT','GET_CREATE_INTENT','LIST_CREATE_INTENTS','ALLOCATE_CREATE_INTENT','RUN_CREATE_STEP','ADVANCE_CREATE_INTENT','VERIFY_TEST_REMOTE_ABSENCE']);
export function validateCoordinatorMessage(api,sender,message){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let encoded;
  try{encoded=JSON.stringify(message);}catch{return fail('INVALID_MESSAGE');}
  if(!encoded||encoded.length>1600||!message||typeof message!=='object'||
     Array.isArray(message)||!types.has(message.type)||
     Object.keys(message).some(k=>!['type','params'].includes(k)))return fail('INVALID_MESSAGE');
  const p=message.params;
  if(!p||typeof p!=='object'||Array.isArray(p))return fail('INVALID_PARAMS');
  if(message.type==='ACCEPT_CREATE_INTENT'){
    if(Object.keys(p).some(k=>!['intentId','slug','origin','accountId'].includes(k)))
      return fail('INVALID_PARAMS');
  }else if(message.type==='GET_CREATE_INTENT'){
    if(Object.keys(p).some(k=>k!=='intentId')||!isSafeId(p.intentId))
      return fail('INVALID_PARAMS');
  }else if(message.type==='VERIFY_TEST_REMOTE_ABSENCE'){
    if(Object.keys(p).some(k=>!['intentId','runId'].includes(k))||
      !isSafeId(p.intentId)||!isSafeId(p.runId))
      return fail('INVALID_PARAMS');
  }else if(message.type==='LIST_CREATE_INTENTS'){
    if(Object.keys(p).some(k=>!['after','limit'].includes(k))||
       (p.after!==undefined&&p.after!==null&&!isSafeId(p.after))||
       (p.limit!==undefined&&(!Number.isSafeInteger(p.limit)||p.limit<1||p.limit>100)))
      return fail('INVALID_PARAMS');
  }else if(Object.keys(p).some(k=>!['intentId','expectedRevision'].includes(k))||
    !isSafeId(p.intentId)||!Number.isSafeInteger(p.expectedRevision))
    return fail('INVALID_PARAMS');
  return {ok:true};
}
export function createCoordinatorBoundary(api,{open=openCanonicalDatabase,
  factory=createCoordinatorStore,makeRunner=createCreationRunner}={}){
  let dbPromise;
  const runner=makeRunner(api,{open,factory:undefined,
    effectGate:()=>standingS06?.gate('development')===true,
    gitGate:()=>standingS06?.gate('gitWrite')===true});
  const sentinel=createRestoreSentinel(api.storage.local);
  const store=async()=>factory(await (dbPromise||=open().catch(e=>{dbPromise=null;throw e;})));
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
    const db=await (dbPromise||=open());
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
    const g=internalPcmsGuard();
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
    const v=validateCoordinatorMessage(api,sender,message);
    if(!v.ok)return v;
    const hold=await sentinel.inspect();
    if(hold.held)return fail(hold.code);
    try{
      const s=await store(),p=message.params;
      if(message.type==='ACCEPT_CREATE_INTENT')return await s.acceptCreate(p);
      if(message.type==='GET_CREATE_INTENT')return await s.getCreate(p.intentId);
      if(message.type==='LIST_CREATE_INTENTS')return await s.listCreate(p);
      if(message.type==='VERIFY_TEST_REMOTE_ABSENCE')return await verifyTestRemote(p,s);
      if(message.type==='ALLOCATE_CREATE_INTENT')
        return await s.allocateCreate(p.intentId,p.expectedRevision);
      if(message.type==='RUN_CREATE_STEP')
        return await runner.step(p.intentId,p.expectedRevision);
      return await s.advanceCreate(p.intentId,p.expectedRevision);
    }catch{return fail('COORDINATOR_UNAVAILABLE');}
  }
  function register(){
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==COORDINATOR_PORT)return;
      let busy=false;
      port.onMessage.addListener(message=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        Promise.resolve(run(message,port.sender)).then(out=>{
          try{port.postMessage(out);}catch{}
        }).catch(()=>{try{port.postMessage(fail('COORDINATOR_UNAVAILABLE'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });
  }
  return Object.freeze({run,register});
}
if(typeof browser!=='undefined')createCoordinatorBoundary(browser).register();
