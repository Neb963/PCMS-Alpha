// AC-09: user-authorized existing-owned generator rename.
// This is NOT I06's private/empty create rename. All remote effects pass the
// donor's protected Persona lease and a durable DISPATCH_POSSIBLE record.
// A lost ACK is never permission to execute again.
import {openCanonicalDatabase,createRestoreSentinel,fail} from './journal.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {exactSource} from './staging-core.mjs';
import {REVIEW_KEY,planMainFolderChanges} from './catalog-identity-review.mjs';
const REVIEW='pcmsR4ExistingRenameAttempt:',CATALOG='pcmsS03CatalogLastComplete',CONFIG='pcmsS03Git';
const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/,FP=/^[a-f0-9]{64}$/;
const reject=code=>({ok:false,code});
const key=slug=>REVIEW+slug;
function b64(source){
 const bytes=new TextEncoder().encode(source),parts=[];
 for(let i=0;i<bytes.length;i+=8192)
  parts.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
 return btoa(parts.join(''));
}
function readFacts(db,slug){
 return new Promise((resolve,reject)=>{
  let tx,out=rejectState('EXISTING_IDENTITY_NOT_VERIFIED');
  function rejectState(code){return {ok:false,code};}
  try{tx=db.transaction(['meta'],'readonly');}
  catch{return reject(Error('RENAME_DB_UNAVAILABLE'))}
  tx.oncomplete=()=>resolve(out);tx.onabort=()=>reject(Error('RENAME_DB_ABORT'));
  const m=tx.objectStore('meta');
  m.get('inventory:'+slug).onsuccess=e=>{
   const row=e.target.result?.generator;
   if(!row){out=rejectState('EXISTING_INVENTORY_NOT_FOUND');return}
   m.get('account:'+row.accountId).onsuccess=a=>{
    const account=a.target.result?.account;
    if(!account){out=rejectState('EXISTING_ACCOUNT_NOT_FOUND');return}
    m.get('inventory:'+row.slug).onsuccess=again=>{
     if(again.target.result?.generator?.revision!==row.revision){
      out=rejectState('INVENTORY_CHANGED');return}
     out={ok:true,row,account};
    };
   };
  };
 });
}
function validFacts(data,oldSlug){
 const {row:r,account:a}=data||{};
 return data?.ok===true&&r?.slug===oldSlug&&r.ownerState==='OBSERVED_OWNER'&&
  a?.state==='VERIFIED'&&a.accountId===r.accountId&&
  a.personaUid===r.personaUid&&r.bindingVersion===a.bindingVersion&&
  a.revision===r.accountRevision&&
  a.identity?.source==='GUARDED_SESSION_READBACK'&&
  a.identity.bindingVersion===r.bindingVersion&&
  FP.test(a.identity.principalFingerprint||'')&&
  typeof r.remoteId==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(r.remoteId);
}
async function readSource(g,{row,account},slug){
 let value;
 try{value=await g.observeReadOnly(row.personaUid,false,slug)}
 catch{return reject('SOURCE_READBACK_UNAVAILABLE')}
 const src=value?.original;
 if(value?.ok!==true||value.principalFingerprint!==account.identity.principalFingerprint||
   src?.ownerResult!=='IS_OWNER'||src.remotePublicId!==row.remoteId||
   src.visibility!=='PUBLIC'&&src.visibility!=='UNLISTED'||
   typeof src.pjs!=='string'||typeof src.html!=='string'||!Array.isArray(src.assets))
  return reject('RENAMED_OWNER_OR_SOURCE_UNVERIFIED');
 const source=await exactSource([{path:'main.pjs',base64:b64(src.pjs)},
  {path:'index.html',base64:b64(src.html)},...src.assets]);
 return source.ok?{ok:true,fingerprint:source.fingerprint,visibility:src.visibility}:
  reject('EXACT_SOURCE_UNVERIFIED');
}
async function readRoute(g,row){
 try{
  const r=await g.getSafeRouteReadiness(row.personaUid);
  if(r?.ready===true&&typeof r.routeId==='string'&&typeof r.cookieStoreId==='string')
   return {ok:true,route:r};
 }catch{}
 return reject('PROTECTED_ROUTE_UNVERIFIED');
}
function sameRoute(a,b){return a?.routeId===b?.routeId&&
 a?.cookieStoreId===b?.cookieStoreId&&a?.ready===true&&b?.ready===true}
export function createExistingRenameService(api,{
 guard=internalPcmsGuard,open=openCanonicalDatabase,clock=Date.now}={}){
 const sentinel=createRestoreSentinel(api.storage.local);
 let busy=false,dbPromise=null;
 const db=()=>dbPromise||=open().catch(error=>{dbPromise=null;throw error});
 async function current(newSlug){
  const saved=await api.storage.local.get([CONFIG,CATALOG,REVIEW_KEY,key(newSlug)]);
  const cfg=saved[CONFIG],snap=saved[CATALOG],all=saved[REVIEW_KEY]||[];
  if(cfg?.repository!=='Neb963/per-gens'||cfg.repositoryId!==snap?.repositoryId||
    snap.complete!==true)return reject('RENAME_GIT_MAIN_UNVERIFIED');
  const planned=planMainFolderChanges(null,snap,all);
  if(!planned.ok)return reject(planned.code);
  const review=planned.review.find(x=>x.newSlug===newSlug);
  if(!review||!review.oldSlug||!SLUG.test(review.oldSlug)||
    !snap.generators.some(x=>x.slug===newSlug&&
      x.folderTreeOid===review.newTreeOid&&x.markerOid===review.markerOid)||
    snap.generators.some(x=>x.slug===review.oldSlug)||
    planned.stale.includes(newSlug))
   return reject('RENAME_FOLDER_IDENTITY_CHANGED');
  return {ok:true,cfg,snap,review,attempt:saved[key(newSlug)]||null};
 }
 async function run({type,newSlug,expectedRevision},sender){
  if(!SLUG.test(newSlug||'')||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
   return reject('INVALID_RENAME_PARAMS');
  if(busy)return reject('RENAME_OPERATION_BUSY');
  busy=true;
  try{
   if((await sentinel.inspect()).held)return reject('RESTORE_HOLD');
   const state=await current(newSlug);if(!state.ok)return state;
   const {review,attempt}=state;
   const allowed=type==='PREPARE'?review.state==='RENAME_EXISTING_REQUESTED'&&!attempt:
     type==='EXECUTE'?attempt?.state==='RENAME_PREPARED':
     type==='RECONCILE'?['DISPATCH_POSSIBLE','OUTCOME_UNCERTAIN',
       'REMOTE_RENAME_VERIFIED_LINK_PENDING'].includes(attempt?.state):false;
   if(!allowed)return reject('RENAME_STAGE_NOT_ADMISSIBLE');
   const currentRevision=type==='PREPARE'?review.revision:attempt.revision;
   if(currentRevision!==expectedRevision)return reject('RENAME_STALE_REVISION');
   if(type==='RECONCILE'&&attempt.state==='REMOTE_RENAME_VERIFIED_LINK_PENDING')
    return {ok:true,code:'REMOTE_RENAME_VERIFIED_SOURCE_RELINK_PENDING',
      state:attempt.state,revision:attempt.revision,providerEffects:'NO_NEW_EFFECT'};
   const facts=await readFacts(await db(),review.oldSlug);
   if(!validFacts(facts,review.oldSlug))return reject('RENAMED_OWNER_CONTEXT_UNVERIFIED');
   if(attempt&&(facts.row.remoteId!==attempt.remoteId||
      facts.row.personaUid!==attempt.personaUid||
      facts.account.identity.principalFingerprint!==attempt.principalFingerprint))
    return reject('RENAMED_ACCOUNT_OR_REMOTE_ID_CHANGED');
   const g=guard(),route=await readRoute(g,facts.row);
   if(!route.ok)return route;
   if(type==='RECONCILE'){
    // A write may already have happened. Never reissue rename. Require
    // independent new-name/full-source owner readback AND old-name absence.
    const newSource=await readSource(g,facts,newSlug);
    if(!newSource.ok)return reject('RENAME_READBACK_PENDING');
    const sameIdentity=await g.runSupplyStep(facts.row.personaUid,{
      kind:'READ_EXISTING_RENAME',temporarySlug:review.oldSlug,slug:newSlug,
      remoteId:attempt.remoteId,principalFingerprint:attempt.principalFingerprint});
    const after=await readRoute(g,facts.row);
    if(!sameIdentity?.ok||sameIdentity.state!=='RENAMED_SAME_REMOTE_ID'||
      newSource.fingerprint!==attempt.sourceFingerprint||
      newSource.visibility!==attempt.visibility||!after.ok||
      !sameRoute(route.route,after.route))return reject('RENAME_READBACK_PENDING');
    const confirmed={...attempt,state:'REMOTE_RENAME_VERIFIED_LINK_PENDING',
      revision:attempt.revision+1,verifiedAt:clock(),readbackFingerprint:newSource.fingerprint};
    await api.storage.local.set({[key(newSlug)]:confirmed});
    const saved=(await api.storage.local.get(key(newSlug)))?.[key(newSlug)];
    if(saved?.revision!==confirmed.revision||saved?.state!==confirmed.state)
      return reject('RENAME_CONFIRMATION_UNCERTAIN');
    return {ok:true,code:'REMOTE_RENAME_VERIFIED_SOURCE_RELINK_PENDING',
      state:saved.state,revision:saved.revision,
      providerEffects:'NO_NEW_EFFECT',sourceRelink:'REQUIRED'};
   }
   const prior=await readSource(g,facts,review.oldSlug);
   if(!prior.ok)return prior;
   if(attempt&&(prior.fingerprint!==attempt.sourceFingerprint||
      prior.visibility!==attempt.visibility))
    return reject('ORIGINAL_SOURCE_CHANGED');
   const target=await g.runSupplyStep(facts.row.personaUid,{
    kind:'READ_TARGET',slug:newSlug,
    principalFingerprint:facts.account.identity.principalFingerprint});
   const after=await readRoute(g,facts.row);
   if(!target?.ok||target.state!=='MISSING_VERIFIED'||!after.ok||
      !sameRoute(route.route,after.route))return reject('RENAME_TARGET_NOT_CLEAR');
   if((await sentinel.inspect()).held)return reject('RESTORE_HOLD');
   // Re-check the exact complete main identity immediately before staging.
   const currentAgain=await current(newSlug);
   if(!currentAgain.ok||currentAgain.review.newTreeOid!==review.newTreeOid||
      currentAgain.review.state!==review.state)return reject('RENAME_GIT_IDENTITY_CHANGED');
   if(type==='PREPARE'){
    const prepared={schema:1,repositoryId:state.cfg.repositoryId,
      oldSlug:review.oldSlug,newSlug,markerOid:review.markerOid,
      folderTreeOid:review.newTreeOid,sourceFingerprint:prior.fingerprint,
      visibility:prior.visibility,remoteId:facts.row.remoteId,
      personaUid:facts.row.personaUid,
      accountId:facts.row.accountId,bindingVersion:facts.row.bindingVersion,
      principalFingerprint:facts.account.identity.principalFingerprint,
      state:'RENAME_PREPARED',revision:1,preparedAt:clock()};
    await api.storage.local.set({[key(newSlug)]:prepared});
    const saved=(await api.storage.local.get(key(newSlug)))?.[key(newSlug)];
    if(saved?.state!=='RENAME_PREPARED'||saved?.revision!==1)
      return reject('RENAME_PREPARATION_UNCERTAIN');
    return {ok:true,code:'EXACT_EXISTING_RENAME_PREPARED',state:saved.state,
      revision:1,providerEffects:'OFF'};
   }
   // Once this durable record may exist, NO automatic/manual retry of the
   // provider request is admissible. A lost storage ACK is itself a hold.
   const marked={...attempt,state:'DISPATCH_POSSIBLE',revision:attempt.revision+1,
     dispatchAt:clock(),operationId:'rename_'+crypto.randomUUID().replaceAll('-')};
   await api.storage.local.set({[key(newSlug)]:marked});
   const saved=(await api.storage.local.get(key(newSlug)))?.[key(newSlug)];
   if(saved?.state!=='DISPATCH_POSSIBLE'||saved?.revision!==marked.revision)
    return reject('RENAME_DISPATCH_OUTCOME_UNCERTAIN');
   if((await sentinel.inspect()).held)return reject('RENAME_DISPATCH_OUTCOME_UNCERTAIN');
   let result;
   try{result=await g.runSupplyStep(facts.row.personaUid,{
     kind:'RENAME_EXISTING',temporarySlug:review.oldSlug,slug:newSlug,
     remoteId:facts.row.remoteId,
     principalFingerprint:facts.account.identity.principalFingerprint});}
   catch{result=reject('RENAME_PROVIDER_OUTCOME_UNCERTAIN')}
   // No ACK is an independent source/identity success. Never repeat.
   const unknown={...marked,state:'OUTCOME_UNCERTAIN',revision:marked.revision+1,
     providerAcknowledged:result?.ok===true&&result.ack==='RENAME_EXISTING_ACK_ONLY'};
   try{await api.storage.local.set({[key(newSlug)]:unknown})}catch{}
   return {ok:true,code:'RENAME_OUTCOME_REQUIRES_READBACK',
     state:'OUTCOME_UNCERTAIN',revision:unknown.revision,
     providerEffects:'POSSIBLE',retryAllowed:false};
  }catch{return reject('RENAME_STAGE_UNAVAILABLE')}
  finally{busy=false}
 }
 return Object.freeze({run});
}
