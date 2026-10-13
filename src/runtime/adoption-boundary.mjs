// I07 same-XPI adoption port. Explicit consent never authorizes source writes.
import {fail,openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {createAdoptionStore} from './adoption-store.mjs';
import {validateAdoptionIntent,verifyOriginal} from './adoption.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {writeArchive,inspectArchive} from './adoption-git.mjs';
export const ADOPTION_PORT='pcms-i07-adoption';
const slug=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
export function validateAdoptionMessage(api,sender,msg){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let json;try{json=JSON.stringify(msg);}catch{return fail('INVALID_MESSAGE');}
  if(!msg||typeof msg!=='object'||Array.isArray(msg)||typeof json!=='string'||
     json.length>700||Object.keys(msg).some(k=>!['type','params'].includes(k)))
    return fail('INVALID_MESSAGE');
  if(!['GET_ADOPTION','LIST_ADOPTIONS','CAPTURE_ADOPTION','ARCHIVE_LOCAL','ARCHIVE_GIT','RECHECK_GIT','ABORT_GIT_PREPARED'].includes(msg.type))
    return fail('CAPABILITY_OFF');
  const p=msg.params||{};
  if(!p||typeof p!=='object'||Array.isArray(p))return fail('INVALID_PARAMS');
  const allowed=msg.type==='LIST_ADOPTIONS'?[]:
    msg.type==='CAPTURE_ADOPTION'?['slug','expectedRevision','explicitPublicConsent']:
    msg.type==='GET_ADOPTION'?['slug']:
    ['ARCHIVE_GIT','RECHECK_GIT'].includes(msg.type)?['slug','expectedRevision','token']:
    ['slug','expectedRevision'];
  if(Object.keys(p).some(k=>!allowed.includes(k))||
     (msg.type!=='LIST_ADOPTIONS'&&!slug(p.slug)))return fail('INVALID_PARAMS');
  if(['ARCHIVE_LOCAL','CAPTURE_ADOPTION','ARCHIVE_GIT','RECHECK_GIT','ABORT_GIT_PREPARED'].includes(msg.type)&&
     (!Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1))
    return fail('INVALID_PARAMS');
  if(['ARCHIVE_GIT','RECHECK_GIT'].includes(msg.type)&&
     (typeof p.token!=='string'||p.token.length<12||p.token.length>512||
      !/^[\x21-\x7e]+$/.test(p.token)))return fail('INVALID_PARAMS');
  if(msg.type==='CAPTURE_ADOPTION'&&typeof p.explicitPublicConsent!=='boolean')
    return fail('INVALID_PARAMS');
  return {ok:true};
}
function readRow(db,slug){
  return new Promise((resolve,reject)=>{
    let r=fail('TARGET_NOT_OBSERVED'),t;
    try{t=db.transaction(['meta'],'readonly');}catch{return reject(Error('DB_UNAVAILABLE'));}
    t.oncomplete=()=>resolve(r);t.onabort=()=>reject(Error('DB_ABORT'));
    const m=t.objectStore('meta');
    m.get('inventory:'+slug).onsuccess=e=>{
      const row=e.target.result?.generator;
      if(!row)return;
      m.get('account:'+row.accountId).onsuccess=a=>{
        const account=a.target.result?.account;
        r=account?{ok:true,row,account}:fail('ACCOUNT_CONTEXT_CHANGED');
      };
    };
  });
}
export function createAdoptionBoundary(api,{
  open=openCanonicalDatabase,guard=internalPcmsGuard,storeFactory=createAdoptionStore,
  gitWrite=writeArchive,gitRead=inspectArchive
}={}){
  let dbPromise;
  const db=()=>dbPromise ||=open();
  const sentinel=createRestoreSentinel(api.storage.local);
  async function run(msg,sender){
    const valid=validateAdoptionMessage(api,sender,msg);
    if(!valid.ok)return valid;
    const p=msg.params||{};
    try{
      const database=await db(),store=storeFactory(database);
      if(msg.type==='LIST_ADOPTIONS')return await store.list();
      if(msg.type==='GET_ADOPTION')return await store.get(p.slug);
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      if(msg.type==='ARCHIVE_LOCAL')return await store.archiveLocal(p.slug,p.expectedRevision);
      if(msg.type==='ABORT_GIT_PREPARED'){
        const cancelled=await store.archiveStage(p.slug,p.expectedRevision,'ABORT_PREPARED');
        return cancelled.ok?{ok:true,slug:p.slug,archive:'ARCHIVE_PENDING',
          providerWrites:'OFF'}:cancelled;
      }

      if(['ARCHIVE_GIT','RECHECK_GIT'].includes(msg.type)){
        const saved=await store.getFull(p.slug);
        if(!saved.ok)return saved;
        const rec=saved.record;
        if(rec.revision!==p.expectedRevision)return fail('STALE_REVISION');
        if(rec.archived)return fail('TOMBSTONE_HELD');
        const g=guard();
        if(!g?.getSafeRouteReadiness)return fail('DONOR_GUARD_UNAVAILABLE');
        const route=await g.getSafeRouteReadiness(rec.personaUid);
        if(!route?.ready)return fail(route?.code||'PROTECTED_ROUTE_UNVERIFIED');
        const params={slug:rec.slug,original:rec.original,
          folder:rec.archiveFolder||'gens/'+rec.slug,token:p.token};
        if(msg.type==='RECHECK_GIT'){
          if(!['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(rec.archiveState))
            return fail('ARCHIVE_RECONCILIATION_NOT_REQUIRED');
          let proof;
          try{proof=await gitRead(params);}catch{return fail('GIT_READBACK_UNAVAILABLE');}
          if(!proof?.ok)return fail('ARCHIVE_RECONCILIATION_REQUIRED');
          if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
          const updated=await store.archiveStage(p.slug,rec.revision,'CONFIRM',proof);
          return updated.ok?{...updated,record:undefined,
            archive:'ARCHIVED_GIT_CONFIRMED',providerWrites:'OFF'}:updated;
        }
        if(rec.archiveState!=='ARCHIVE_PENDING')
          return fail('ARCHIVE_RECONCILIATION_REQUIRED');
        let at=await store.archiveStage(p.slug,rec.revision,'PREPARE');
        if(!at.ok)return at;
        const route2=await g.getSafeRouteReadiness(rec.personaUid);
        if(!route2?.ready||route2.cookieStoreId!==route.cookieStoreId||
           route2.routeId!==route.routeId||(await sentinel.inspect()).held)
          return fail('GIT_PREPARED_HELD');
        at=await store.archiveStage(p.slug,at.record.revision,'MARK_DISPATCH');
        if(!at.ok)return at;
        // DISPATCH_POSSIBLE committed before the first Git API write.
        let result;
        try{result=await gitWrite({...params,folder:at.record.archiveFolder});}
        catch{result=fail('GIT_WRITE_UNCERTAIN');}
        if(!result?.ok){
          await store.archiveStage(p.slug,at.record.revision,'HELD_UNCERTAIN');
          return fail('GIT_WRITE_UNCERTAIN');
        }
        if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
        const confirmed=await store.archiveStage(p.slug,at.record.revision,'CONFIRM',result);
        return confirmed.ok?{ok:true,slug:p.slug,
          archive:'ARCHIVED_GIT_CONFIRMED',originalFingerprint:rec.original.fingerprint,
          providerWrites:'OFF',publication:'OFF'}:fail('GIT_WRITE_UNCERTAIN');
      }

      const context=await readRow(database,p.slug);
      if(!context.ok)return context;
      const eligible=validateAdoptionIntent(context.row,context.account,p);
      if(!eligible.ok)return eligible;
      const g=guard();
      if(!g?.observeReadOnly||!g.getSafeRouteReadiness)return fail('GUARD_NOT_READY');
      const ready=await g.getSafeRouteReadiness(context.row.personaUid);
      if(!ready?.ready)return fail(ready?.code||'PROTECTED_ROUTE_UNVERIFIED');
      // Independent exact source readbacks; a changed source is held.
      const read=async()=>{
        const raw=await g.observeReadOnly(context.row.personaUid,false,p.slug);
        if(!raw?.ok||!raw.original||
           raw.principalFingerprint!==context.account.identity.principalFingerprint)
          return fail('ORIGINAL_SOURCE_READBACK_UNAVAILABLE');
        return verifyOriginal({...raw.original,ok:true,
          source:'DONOR_GUARDED_ORIGINAL_READBACK',slug:p.slug,
          accountId:context.row.accountId,personaUid:context.row.personaUid,
          principalFingerprint:raw.principalFingerprint,observedAt:Date.now()},
          context.row,context.account);
      };
      const first=await read();
      if(!first.ok)return first;
      const second=await read();
      if(!second.ok)return second;
      if(first.fingerprint!==second.fingerprint||
         first.remotePublicId!==second.remotePublicId||
         first.visibility!==second.visibility)return fail('ORIGINAL_SOURCE_DRIFT');
      const after=await g.getSafeRouteReadiness(context.row.personaUid);
      if(!after?.ready||after.cookieStoreId!==ready.cookieStoreId||
         after.routeId!==ready.routeId||
         (await sentinel.inspect()).held)return fail('SESSION_CONTEXT_CHANGED');
      // Atomic commit rechecks the account/Persona and exact row revision.
      return await store.adopt(p,second);
    }catch{return fail('ADOPTION_AUTHORITY_UNAVAILABLE');}
  }
  function register(){
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==ADOPTION_PORT)return;
      let busy=false;
      port.onMessage.addListener(message=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        Promise.resolve(run(message,port.sender)).then(result=>{
          try{port.postMessage(result);}catch{}
        }).catch(()=>{try{port.postMessage(fail('ADOPTION_AUTHORITY_UNAVAILABLE'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });
  }
  return Object.freeze({run,register});
}
if(typeof browser!=='undefined')createAdoptionBoundary(browser).register();
