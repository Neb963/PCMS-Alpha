// I17 initial READY bootstrap. Distinct from published generator source F:
// only a newly PCMS-reserved, independently confirmed non-READY private
// folder may be promoted. Typed exact source, no standing credentials.
import {trustedExtensionPage} from './command-boundary.mjs';
import {openCanonicalDatabase,createRestoreSentinel,fail} from './journal.mjs';
import {createSupplyStore} from './supply-store.mjs';
import {createAccountStore} from './accounts.mjs';
import {validateOwnerContext} from './supply-plan.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {readNonReadyFolder} from './supply-git.mjs';
import {exactInitialSource,writeInitialReadySource,inspectInitialReadySource} from './ready-source-git.mjs';
export const READY_SOURCE_PORT='pcms-i17-initial-ready';
const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const SHA=/^[a-f0-9]{64}$/;
const validId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,110}$/.test(s);
const key=s=>'ready-source:'+s;
const allowed=new Set(['PREVIEW','ARM','COMMIT','STATUS','RECONCILE']);
const clean=o=>o&&typeof o==='object'&&!Array.isArray(o);
export function validateReadyMessage(api,sender,message){
  if(!trustedExtensionPage(api,sender))return fail('UNTRUSTED_SENDER');
  let encoded;try{encoded=JSON.stringify(message);}catch{return fail('INVALID_MESSAGE');}
  if(!clean(message)||Object.keys(message).some(x=>!['type','params'].includes(x))||
     !allowed.has(message.type)||!encoded||encoded.length>2200000)
    return fail('INVALID_MESSAGE');
  const p=message.params||{};
  if(!clean(p))return fail('INVALID_PARAMS');
  const fields=message.type==='PREVIEW'?['slug','pjs','html']:
    message.type==='ARM'?['slug','pjs','html','token','batchId','itemId','expectedRevision','confirmation']:
    message.type==='COMMIT'?['slug','batchId','itemId','expectedRevision','fingerprint']:
    message.type==='RECONCILE'?['slug','token']:['slug'];
  if(Object.keys(p).some(x=>!fields.includes(x))||!SLUG.test(p.slug||''))
    return fail('INVALID_PARAMS');
  if(['PREVIEW','ARM'].includes(message.type)&&
     (typeof p.pjs!=='string'||typeof p.html!=='string'))return fail('INVALID_PARAMS');
  if(message.type==='ARM'&&(!validId(p.batchId)||!validId(p.itemId)||
     !Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1||
     typeof p.token!=='string'||p.token.length<12||p.token.length>512||
     typeof p.confirmation!=='string'||p.confirmation.length>190))
    return fail('INVALID_PARAMS');
  if(message.type==='COMMIT'&&(!validId(p.batchId)||!validId(p.itemId)||
     !Number.isSafeInteger(p.expectedRevision)||p.expectedRevision<1||
     !SHA.test(p.fingerprint||'')))return fail('INVALID_PARAMS');
  if(message.type==='RECONCILE'&&
     (typeof p.token!=='string'||p.token.length<12||p.token.length>512))
    return fail('INVALID_PARAMS');
  return {ok:true};
}
export function createReadyBoundary(api,{
  open=openCanonicalDatabase,supplyFactory=createSupplyStore,
  accountFactory=createAccountStore,guard=internalPcmsGuard,
  markerRead=readNonReadyFolder,write=writeInitialReadySource,
  inspect=inspectInitialReadySource,clock=()=>performance.now()
}={}){
  let databasePromise=null,armed=null;
  const database=()=>databasePromise ||=open().catch(e=>{databasePromise=null;throw e;});
  const sentinel=createRestoreSentinel(api.storage.local);
  function receipt(db,slug){
    return new Promise((resolve,reject)=>{
      let tx;
      try{tx=db.transaction('meta','readonly');}
      catch{return reject(Error('READY_DB_UNAVAILABLE'));}
      tx.objectStore('meta').get(key(slug)).onsuccess=e=>
        resolve(e.target.result?.record||null);
      tx.onabort=()=>reject(Error('READY_DB_ABORTED'));
    });
  }
  function journal(db,slug,operation,expected=null){
    return new Promise((resolve,reject)=>{
      let tx,result=fail('READY_JOURNAL_UNVERIFIED');
      try{tx=db.transaction(['meta','events'],'readwrite');}
      catch{return reject(Error('READY_DB_UNAVAILABLE'));}
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(Error('READY_DB_ABORTED'));
      const meta=tx.objectStore('meta');
      meta.get(key(slug)).onsuccess=e=>{
        const prior=e.target.result?.record||null;
        if((expected===null&&prior!==null)||
           (expected!==null&&(!prior||prior.operationId!==expected.operationId||
             prior.state!==expected.state))){
          result=fail('READY_ALREADY_ARMED_OR_UNCERTAIN');return;
        }
        const next=typeof operation==='function'?operation(prior):operation;
        if(!next){result=fail('READY_JOURNAL_UNVERIFIED');return;}
        meta.put({key:key(slug),record:next});
        tx.objectStore('events').add({stage:'READY_'+next.state,
          slug,operationId:next.operationId,fingerprint:next.fingerprint});
        result={ok:true,record:next};
      };
    });
  }
  async function context(db,p){
    const batch=await supplyFactory(db).get(p.batchId);
    if(!batch.ok)return batch;
    const b=batch.batch,item=b.items.find(x=>x.itemId===p.itemId);
    if(!item||item.requestedSlug!==p.slug||item.state!=='CONFIRMED'||
       item.revision!==p.expectedRevision||item.folder!=='gens/'+p.slug)
      return fail('READY_SUPPLY_ITEM_UNVERIFIED');
    const found=await accountFactory(db).get(b.accountId);
    if(!found.ok||!validateOwnerContext(b,found.account).ok)
      return fail('READY_ACCOUNT_CHANGED');
    const g=guard(),route=await g?.getSafeRouteReadiness?.(b.personaUid);
    if(!route?.ready||route.personaUid!==b.personaUid||
       !route.cookieStoreId||!route.routeId)return fail('READY_PROTECTED_ROUTE_REQUIRED');
    return {ok:true,route,batch:b,item};
  }
  async function run(message,sender){
    const v=validateReadyMessage(api,sender,message);
    if(!v.ok)return v;
    const p=message.params||{};
    try{
      if(message.type==='PREVIEW'){
        const exact=await exactInitialSource(p);
        return exact.ok?{ok:true,slug:p.slug,fingerprint:exact.fingerprint,
          files:exact.files,publication:'OFF',kind:'INITIAL_PRIVATE_SOURCE_ONLY'}:exact;
      }
      const db=await database();
      if(message.type==='STATUS'){
        const old=await receipt(db,p.slug);
        return {ok:true,slug:p.slug,state:old?.state||'NONE',
          fingerprint:old?.fingerprint||null,sourceReady:old?.state==='CONFIRMED'};
      }
      if((await sentinel.inspect()).held)return fail('RESTORE_HOLD');
      if(message.type==='RECONCILE'){
        const old=await receipt(db,p.slug);
        if(!old||!['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(old.state))
          return fail('READY_RECONCILIATION_NOT_REQUIRED');
        const read=await inspect({slug:p.slug,token:p.token,
          expectedHead:old.baseHead,fingerprint:old.fingerprint,files:old.files});
        if(!read?.ok)return fail(read?.code||'READY_INDEPENDENT_RECONCILE_HELD');
        const completed=await journal(db,p.slug,prior=>
          ({...prior,state:'CONFIRMED',confirmedHead:read.head}),
          {operationId:old.operationId,state:old.state});
        return completed.ok?{ok:true,state:'CONFIRMED',ready:true,
          fingerprint:old.fingerprint,head:read.head}:completed;
      }
      if(message.type==='ARM'){
        const exact=await exactInitialSource(p);
        if(!exact.ok)return exact;
        if(p.confirmation!=='READY '+p.slug+' '+exact.fingerprint)
          return fail('READY_EXACT_SOURCE_CONFIRMATION_REQUIRED');
        if(armed&&clock()<armed.expiresAt)return fail('READY_ANOTHER_OPERATION_ARMED');
        if(await receipt(db,p.slug))return fail('READY_ALREADY_ARMED_OR_UNCERTAIN');
        const ctx=await context(db,p);
        if(!ctx.ok)return ctx;
        const marker=await markerRead({slug:p.slug,folder:'gens/'+p.slug,token:p.token});
        if(!marker.ok||!marker.head)return fail('READY_NON_READY_MARKER_REQUIRED');
        const fresh=await context(db,p);
        if(!fresh.ok||fresh.route.routeId!==ctx.route.routeId||
          fresh.route.cookieStoreId!==ctx.route.cookieStoreId||
          (await sentinel.inspect()).held)return fail('READY_CONTEXT_CHANGED');
        armed={...p,files:exact.files,fingerprint:exact.fingerprint,
          baseHead:marker.head,route:ctx.route,expiresAt:clock()+120000};
        return {ok:true,scope:'EXACT_INITIAL_SOURCE_ONLY',
          fingerprint:exact.fingerprint,expiresInSeconds:120};
      }
      if(message.type==='COMMIT'){
        const a=armed;
        if(!a||clock()>=a.expiresAt||a.slug!==p.slug||
           a.batchId!==p.batchId||a.itemId!==p.itemId||
           a.expectedRevision!==p.expectedRevision||
           a.fingerprint!==p.fingerprint)return fail('READY_NOT_ARMED');
        // Consume before any await so concurrent pages cannot dispatch twice.
        armed=null;
        const ctx=await context(db,p);
        if(!ctx.ok)return ctx;
        if(ctx.route.cookieStoreId!==a.route.cookieStoreId||
          ctx.route.routeId!==a.route.routeId)return fail('READY_ROUTE_CHANGED');
        const marker=await markerRead({slug:a.slug,folder:'gens/'+a.slug,token:a.token});
        if(!marker.ok||marker.head!==a.baseHead)return fail('READY_MARKER_OR_HEAD_CHANGED');
        if(clock()>=a.expiresAt||(await sentinel.inspect()).held)
          return fail('READY_CONSENT_EXPIRED');
        const op='ready_'+crypto.randomUUID().replaceAll('-','');
        const possible={operationId:op,state:'DISPATCH_POSSIBLE',slug:p.slug,
          batchId:a.batchId,itemId:a.itemId,itemRevision:a.expectedRevision,
          fingerprint:a.fingerprint,files:a.files,baseHead:a.baseHead,
          accountId:ctx.batch.accountId,personaUid:ctx.batch.personaUid,
          bindingVersion:ctx.batch.bindingVersion};
        const committed=await journal(db,p.slug,possible);
        if(!committed.ok)return committed;
        // Any failure AFTER this marker is uncertain, including guard loss.
        const again=await context(db,p);
        if(!again.ok||again.route.cookieStoreId!==a.route.cookieStoreId||
           again.route.routeId!==a.route.routeId||
           (await sentinel.inspect()).held)
          return fail('READY_JOURNALED_GUARD_LOST_RECONCILE');
        let result;
        try{result=await write({...a,expectedHead:a.baseHead});}
        catch{result=fail('READY_GIT_OUTCOME_UNKNOWN');}
        const ok=result?.ok===true&&result.ready===true&&
          result.fingerprint===a.fingerprint&&
          result.baseHead===a.baseHead&&
          result.source==='INDEPENDENT_GIT_HEAD_TREE_BYTES';
        const updated=await journal(db,p.slug,prior=>({...prior,
          state:ok?'CONFIRMED':'HELD_UNCERTAIN',
          ...(ok?{confirmedHead:result.head}:{})}),
          {operationId:op,state:'DISPATCH_POSSIBLE'});
        if(!updated.ok)return fail('READY_CHECKPOINT_UNCERTAIN');
        return ok?{ok:true,state:'CONFIRMED',ready:true,
          head:result.head,fingerprint:a.fingerprint}:
          fail(result?.code||'READY_GIT_OUTCOME_UNKNOWN');
      }
      return fail('READY_COMMAND_UNSUPPORTED');
    }catch{return fail('READY_CANONICAL_UNAVAILABLE');}
  }
  function register(){
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==READY_SOURCE_PORT)return;
      let busy=false;
      port.onMessage.addListener(msg=>{
        if(busy){try{port.postMessage(fail('BUSY'));}catch{}return;}
        busy=true;
        Promise.resolve(run(msg,port.sender))
          .then(out=>{try{port.postMessage(out);}catch{}})
          .catch(()=>{try{port.postMessage(fail('READY_CANONICAL_UNAVAILABLE'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });
  }
  return Object.freeze({register,run});
}
if(typeof browser!=='undefined')createReadyBoundary(browser).register();
