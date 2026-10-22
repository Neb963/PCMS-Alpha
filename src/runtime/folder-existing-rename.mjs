// AC-09: user-authorized existing-owned generator rename.
// This is NOT I06's private/empty create rename. All remote effects pass the
// donor's protected Persona lease and a durable DISPATCH_POSSIBLE record.
// A lost ACK is never permission to execute again.
import {openCanonicalDatabase,createRestoreSentinel,fail} from './journal.mjs';
import {internalPcmsGuard} from './persona-guard.mjs';
import {standingS06} from './s06-standing-authority.mjs';
import {verifyOriginal} from './adoption.mjs';
import {REVIEW_KEY,planMainFolderChanges} from './catalog-identity-review.mjs';
const REVIEW='pcmsR4ExistingRenameAttempt:',CATALOG='pcmsS03CatalogLastComplete',CONFIG='pcmsS03Git';
const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/,FP=/^[a-f0-9]{64}$/;
const reject=code=>({ok:false,code});
const key=slug=>REVIEW+slug;
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
    m.get('source-link:'+slug).onsuccess=linked=>{
     const link=linked.target.result?.link;
     if(!link){out=rejectState('EXISTING_SOURCE_ASSOCIATION_REQUIRED');return}
     m.get('inventory:'+row.slug).onsuccess=again=>{
      if(again.target.result?.generator?.revision!==row.revision){
       out=rejectState('INVENTORY_CHANGED');return}
      out={ok:true,row,account,link};
     };
    };
   };
  };
 });
}
// Reconciliation must remain possible after inventory synchronization removes
// the old slug. Only a previously verified durable attempt may supply old
// remote identity; the current account and protected route are still rechecked.
function readAttemptFacts(db,attempt){
 return new Promise((resolve,reject)=>{
  let tx,result=rejectState('RENAME_ACCOUNT_NOT_VERIFIED');
  function rejectState(code){return {ok:false,code}}
  try{tx=db.transaction(['meta'],'readonly')}
  catch{return reject(Error('RENAME_DB_UNAVAILABLE'))}
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(Error('RENAME_DB_ABORT'));
  const m=tx.objectStore('meta');
  m.get('account:'+attempt.accountId).onsuccess=e=>{
   const account=e.target.result?.account;
   if(account?.state!=='VERIFIED'||account.personaUid!==attempt.personaUid||
      account.bindingVersion!==attempt.bindingVersion||
      account.identity?.source!=='GUARDED_SESSION_READBACK'||
      account.identity.principalFingerprint!==attempt.principalFingerprint)return;
   m.get('source-link:'+attempt.oldSlug).onsuccess=s=>{
    const link=s.target.result?.link;
    if(!link)return;
    result={ok:true,account,link,row:{slug:attempt.oldSlug,
     accountId:attempt.accountId,remoteId:attempt.remoteId,
     personaUid:attempt.personaUid,bindingVersion:attempt.bindingVersion,
     accountRevision:account.revision,ownerState:'OBSERVED_OWNER'}};
   };
  };
 });
}
function readLinkedIdentity(db,slug){
 return new Promise((resolve,reject)=>{
  let tx,result=rejectState('RENAMED_SOURCE_LINK_NOT_VERIFIED');
  function rejectState(code){return {ok:false,code}}
  try{tx=db.transaction(['meta'],'readonly')}
  catch{return reject(Error('RENAME_DB_UNAVAILABLE'))}
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(Error('RENAME_DB_ABORT'));
  const m=tx.objectStore('meta');
  m.get('inventory:'+slug).onsuccess=e=>{
   const row=e.target.result?.generator;
   if(!row)return;
   m.get('source-link:'+slug).onsuccess=l=>{
    const link=l.target.result?.link;
    if(!link)return;
    m.get('account:'+row.accountId).onsuccess=a=>{
     const account=a.target.result?.account;
     result={ok:true,row,link,account};
    };
   };
  };
 });
}
function validFacts(data,oldSlug){
 const {row:r,account:a,link:l}=data||{};
 return data?.ok===true&&r?.slug===oldSlug&&r.ownerState==='OBSERVED_OWNER'&&
  l?.slug===oldSlug&&l.folder==='generators/'+oldSlug&&
  l.remoteId===r.remoteId&&l.accountId===r.accountId&&
  l.personaUid===r.personaUid&&l.bindingVersion===r.bindingVersion&&
  FP.test(l.fingerprint||'')&&
  a?.state==='VERIFIED'&&a.accountId===r.accountId&&
  a.personaUid===r.personaUid&&r.bindingVersion===a.bindingVersion&&
  a.revision===r.accountRevision&&
  a.identity?.source==='GUARDED_SESSION_READBACK'&&
  a.identity.bindingVersion===r.bindingVersion&&
  FP.test(a.identity.principalFingerprint||'')&&
  typeof r.remoteId==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(r.remoteId);
}
async function readSource(g,{row,account},slug){
 let packet;
 try{packet=await g.observeReadOnly(row.personaUid,false,slug)}
 catch{return reject('SOURCE_READBACK_UNAVAILABLE')}
 if(packet?.ok!==true)return reject('SOURCE_READBACK_UNAVAILABLE');
 // The donor's original-source packet is flat, not nested under `original`.
 // Reuse the established immutable adoption verifier. A rename may legitimately
 // change the observed slug but must preserve account, Persona, remote ID,
 // visibility and every original source/asset byte.
 const original=await verifyOriginal(packet,{...row,slug,
   visibility:row.visibility||packet.visibility},account);
 if(!original?.ok||original.remotePublicId!==row.remoteId)
  return reject('RENAMED_OWNER_OR_SOURCE_UNVERIFIED');
 return {ok:true,fingerprint:original.fingerprint,visibility:original.visibility};
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
 guard=internalPcmsGuard,open=openCanonicalDatabase,clock=Date.now,
 developmentGate=()=>standingS06?.gate('development')===true}={}){
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
 async function run({type,newSlug,expectedRevision,consent},sender){
  if(type==='EXECUTE'&&consent!=='I APPROVE THE EXACT EXISTING GENERATOR RENAME')return reject('EXPLICIT_RENAME_APPROVAL_REQUIRED');
  if(!SLUG.test(newSlug||'')||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
   return reject('INVALID_RENAME_PARAMS');
  if(busy)return reject('RENAME_OPERATION_BUSY');
  busy=true;
  try{
   if((await sentinel.inspect()).held)return reject('RESTORE_HOLD');
   if(type!=='RECONCILE'&&developmentGate()!==true)
    return reject('DEVELOPMENT_AUTHORITY_REQUIRED');
   const state=await current(newSlug);if(!state.ok)return state;
   const {review,attempt}=state;
   const allowed=type==='PREPARE'?review.state==='RENAME_EXISTING_REQUESTED'&&!attempt:
     type==='EXECUTE'?attempt?.state==='RENAME_PREPARED':
     type==='RECONCILE'?['DISPATCH_POSSIBLE','OUTCOME_UNCERTAIN',
       'REMOTE_RENAME_VERIFIED_LINK_PENDING'].includes(attempt?.state):
     type==='FINALIZE'?['REMOTE_RENAME_VERIFIED_LINK_PENDING',
       'RENAME_COMPLETED'].includes(attempt?.state):false;
   if(!allowed)return reject('RENAME_STAGE_NOT_ADMISSIBLE');
   const currentRevision=type==='PREPARE'?review.revision:attempt.revision;
   if(currentRevision!==expectedRevision)return reject('RENAME_STALE_REVISION');
   if(type==='RECONCILE'&&attempt.state==='REMOTE_RENAME_VERIFIED_LINK_PENDING')
    return {ok:true,code:'REMOTE_RENAME_VERIFIED_SOURCE_RELINK_PENDING',
      state:attempt.state,revision:attempt.revision,providerEffects:'NO_NEW_EFFECT'};
   if(type==='FINALIZE'){
    if(attempt.state==='RENAME_COMPLETED'&&review.state==='RENAME_EXISTING_COMPLETED')
     return {ok:true,code:'VERIFIED_EXISTING_RENAME_COMPLETED',
       state:attempt.state,revision:attempt.revision,providerEffects:'NO_NEW_EFFECT'};
    const linked=await readLinkedIdentity(await db(),newSlug);
    if(!linked.ok)return linked;
    const {row:newRow,link,account}=linked;
    if(account?.state!=='VERIFIED'||newRow.ownerState!=='OBSERVED_OWNER'||
       newRow.slug!==newSlug||newRow.remoteId!==attempt.remoteId||
       newRow.accountId!==attempt.accountId||
       newRow.personaUid!==attempt.personaUid||
       newRow.bindingVersion!==attempt.bindingVersion||
       newRow.accountRevision!==account.revision||
       account.personaUid!==attempt.personaUid||
       account.bindingVersion!==attempt.bindingVersion||
       account.identity?.principalFingerprint!==attempt.principalFingerprint||
       account.identity.source!=='GUARDED_SESSION_READBACK'||
       link.slug!==newSlug||link.folder!=='generators/'+newSlug||
       link.remoteId!==attempt.remoteId||link.accountId!==attempt.accountId||
       link.personaUid!==attempt.personaUid||
       link.bindingVersion!==attempt.bindingVersion||
       !FP.test(link.fingerprint||''))
      return reject('RENAMED_ASSOCIATION_OR_OWNER_UNVERIFIED');
    const done=attempt.state==='RENAME_COMPLETED'?attempt:{
      ...attempt,state:'RENAME_COMPLETED',revision:attempt.revision+1,
      associationFingerprint:link.fingerprint,finalizedAt:clock()};
    await api.storage.local.set({[key(newSlug)]:done});
    const savedAttempt=(await api.storage.local.get(key(newSlug)))?.[key(newSlug)];
    if(savedAttempt?.state!=='RENAME_COMPLETED'||savedAttempt?.revision!==done.revision)
     return reject('RENAME_FINALIZATION_UNCERTAIN');
    // Link verification is a READ ONLY canonical ledger fact. Source and old
    // original history are preserved; no provider, file, or Git writes here.
    const latest=await api.storage.local.get(REVIEW_KEY);
    const rows=latest?.[REVIEW_KEY];
    const idx=rows?.findIndex(x=>x.repositoryId===state.cfg.repositoryId&&
      x.newSlug===newSlug);
    if(!Array.isArray(rows)||idx<0||rows[idx].oldSlug!==attempt.oldSlug||
       rows[idx].newTreeOid!==attempt.folderTreeOid||
       !['RENAME_EXISTING_REQUESTED','RENAME_EXISTING_COMPLETED'].includes(rows[idx].state))
     return reject('RENAME_REVIEW_CHANGED');
    const completed=rows.map((r,i)=>i===idx?{...r,
      state:'RENAME_EXISTING_COMPLETED',revision:(r.revision||1)+1}:r);
    await api.storage.local.set({[REVIEW_KEY]:completed});
    const confirmed=(await api.storage.local.get(REVIEW_KEY))?.[REVIEW_KEY]
      ?.find(r=>r.repositoryId===state.cfg.repositoryId&&r.newSlug===newSlug);
    if(confirmed?.state!=='RENAME_EXISTING_COMPLETED')
     return reject('RENAME_REVIEW_COMMIT_UNCERTAIN');
    return {ok:true,code:'VERIFIED_EXISTING_RENAME_COMPLETED',
      state:'RENAME_COMPLETED',revision:done.revision,
      providerEffects:'NO_NEW_EFFECT',sourceRelink:'VERIFIED'};
   }

   let facts=await readFacts(await db(),review.oldSlug);
   if(type==='RECONCILE'&&!validFacts(facts,review.oldSlug)&&attempt)
    facts=await readAttemptFacts(await db(),attempt);
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
   if((await sentinel.inspect()).held||developmentGate()!==true)
    return reject('RENAME_DISPATCH_OUTCOME_UNCERTAIN');
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
