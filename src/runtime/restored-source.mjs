// Requalify history through current readbacks; never move an uncertain effect.
const fail=code=>({ok:false,code});
const idleNative=new Set(['CHAT1_OBSERVED_IDLE','CHAT2_OBSERVED_IDLE']);
const safeRelease=new Set(['APPROVED','CANCELED','CONFIRMED_PUBLIC','RESTORED_UNLISTED']);
const safeWriteback=new Set(['PREPARED','CANCELED','CONFIRMED']);
const safeExisting=new Set(['PREPARED','UNLIST_CONFIRMED','STAGE_CONFIRMED','RESTORE_CONFIRMED']);
const effects=(row,current)=>[...(row?.restoredEffects||[]),current].filter(Boolean);
export function planRestoredSource({stage,job,release,existing,writeback,account,inventory,adoption=null,shadow=null,ready,baseline,gitCandidate,outputAttested=false,previousCheckpoint=null,nonce,at}){
 if(stage?.restoredHistorical!==true||!['PINNED','PREPARED','SOURCE_VERIFIED'].includes(stage.state)||stage.humanReclaimPending)
  return fail('RESTORED_SOURCE_EFFECT_RECONCILIATION_REQUIRED');
 if(account?.state!=='VERIFIED'||!account.identity||account.identity.source!=='GUARDED_SESSION_READBACK'||
  account.identity.bindingVersion!==account.bindingVersion||inventory?.ownerState!=='OBSERVED_OWNER'||
  inventory.accountId!==account.accountId||inventory.personaUid!==account.personaUid||
  inventory.bindingVersion!==account.bindingVersion||stage.accountId!==account.accountId||
  typeof stage.remotePublicId!=='string'||!stage.remotePublicId||stage.remotePublicId!==inventory.remoteId||stage.principalFingerprint!==account.identity.principalFingerprint)
  return fail('RESTORED_SOURCE_OWNER_UNVERIFIED');
 if(!ready?.active||['OPERATOR_PAUSED','READY_REVOKED_NOT_READY'].includes(ready.hold)||
  stage.readyIdentifier!==ready.active.identifier||stage.readyInputFingerprint!==ready.active.inputFingerprint)
  return fail('RESTORED_SOURCE_READY_CHANGED');
 if(release&&(!release.restoredEffects?.length||release.dispatchPossible===true||
   ![...safeRelease,'RESTORE_REVIEW_REQUIRED'].includes(release.state)||
   release.restoredEffects.some(e=>!safeRelease.has(e.state)||e.dispatchPossible===true&&
     !(e.state==='CONFIRMED_PUBLIC'&&e.source==='INDEPENDENT_PUBLICATION_READBACK'&&e.sourceFingerprint===baseline?.fingerprint))))
  return fail('RESTORED_PUBLICATION_RECONCILIATION_REQUIRED');
 if(writeback&&(!writeback.restoredEffects?.length||!['PREPARED','CANCELED','CONFIRMED','RESTORE_REVIEW_REQUIRED'].includes(writeback.state)||
   writeback.restoredEffects.some(e=>!safeWriteback.has(e.state))))
  return fail('RESTORED_GIT_RECONCILIATION_REQUIRED');
 if(existing&&(existing.accountId!==stage.accountId||existing.remotePublicId!==stage.remotePublicId||existing.personaUid!==stage.personaUid||existing.bindingVersion!==stage.bindingVersion||existing.principalFingerprint!==stage.principalFingerprint||!safeExisting.has(existing.state)||inventory.visibility==='UNLISTED'&&
   (existing.nonce!==stage.nonce||(stage.state==='SOURCE_VERIFIED'?existing.state!=='STAGE_CONFIRMED':existing.state!=='UNLIST_CONFIRMED')||existing.previousFingerprint!==stage.previous?.fingerprint||
    !previousCheckpoint?.ok||previousCheckpoint.source?.fingerprint!==stage.previous?.fingerprint)))return fail('RESTORED_UPDATE_RECONCILIATION_REQUIRED');
 if(job){
  if(stage.state!=='SOURCE_VERIFIED'||job.operatorPaused||effects(job,{state:job.state,native:job.native?.state}).some(e=>
    ['HUMAN_OWNED','HELD_RECONCILE','HELD_NO_PROGRESS'].includes(e.state)||
    e.native&&!idleNative.has(e.native)||!e.native&&!['PENDING_NATIVE_SESSION','TESTS_UNVERIFIED'].includes(e.state)))
   return fail('RESTORED_NATIVE_RECONCILIATION_REQUIRED');
 }
 const saved=stage.state!=='SOURCE_VERIFIED'?(stage.writePrevious||stage.previous):job?.finalSource||stage.candidate;
 if(!baseline?.ok||!saved?.ok||baseline.fingerprint!==saved.fingerprint)
  return fail('RESTORED_SAVED_SOURCE_CHANGED');
 if(!gitCandidate?.ok||(!ready.desired&&!outputAttested&&gitCandidate.fingerprint!==stage.candidate?.fingerprint))
  return fail('RESTORED_GIT_LINEAGE_CHANGED');
 if(!/^[a-f0-9]{32}$/.test(nonce||'')||nonce===stage.nonce||!Number.isSafeInteger(at)||at<1)
  return fail('RESTORED_CHILD_IDENTITY_INVALID');
 const child={...structuredClone(stage),revision:stage.revision+1,state:stage.state==='PREPARED'?'PINNED':stage.state,
  requalifiedPublicPending:inventory.visibility==='PUBLIC'&&stage.state!=='SOURCE_VERIFIED',
  accountRevision:account.revision,personaUid:account.personaUid,bindingVersion:account.bindingVersion,
  principalFingerprint:account.identity.principalFingerprint,nonce,tab:null,reason:null,
  restoredHistorical:false,restoredParent:{revision:stage.revision,jobRevision:job?.revision||null,personaUid:stage.personaUid,
   bindingVersion:stage.bindingVersion,sourceHead:stage.sourceHead},parentStageRevision:stage.revision,
  writePrevious:structuredClone(baseline),
  ...(stage.state==='SOURCE_VERIFIED'?{candidate:structuredClone(baseline),verifiedAt:at,
   requalifiedPublicHistory:inventory.visibility==='PUBLIC'}:{})};
 let currentShadow=null;
 if(shadow){
  const row=shadow.rows?.find(r=>r.slug===stage.slug);
  if(row&&(shadow.inflight?.some(r=>r.stableId===row.stableId)||['ATTEMPT_PENDING','DISPATCH_POSSIBLE','EFFECT_UNVERIFIED'].includes(row.refresh?.state)))
   return fail('RESTORED_REFRESH_RECONCILIATION_REQUIRED');
  if(row&&row.accountId===account.accountId&&row.remoteId===inventory.remoteId){
   currentShadow=structuredClone(shadow);const target=currentShadow.rows.find(r=>r.stableId===row.stableId);
   target.personaUid=account.personaUid;target.bindingVersion=account.bindingVersion;target.accountRevision=account.revision;
   target.ownerVerified=true;currentShadow.revision++;
  }
 }
 const currentExisting=existing&&inventory.visibility==='UNLISTED'?{
  ...structuredClone(existing),revision:existing.revision+1,accountId:account.accountId,remotePublicId:inventory.remoteId,accountRevision:account.revision,
  personaUid:account.personaUid,bindingVersion:account.bindingVersion,principalFingerprint:account.identity.principalFingerprint,
  inventoryRevision:inventory.revision,adoptionRevision:adoption?.revision||existing.adoptionRevision,
  nonce,operationId:'existing_'+nonce,state:stage.state==='SOURCE_VERIFIED'?'STAGE_CONFIRMED':'UNLIST_CONFIRMED',stageSource:structuredClone(child.candidate),stagedFingerprint:child.candidate.fingerprint,
  windowAdmission:{version:1,mode:'RESTORED_OBSERVED_UNLISTED',nonce,accountId:account.accountId,personaUid:account.personaUid,bindingVersion:account.bindingVersion,principalFingerprint:account.identity.principalFingerprint,remotePublicId:inventory.remoteId,previousFingerprint:existing.previousFingerprint,observedAt:at},
  ...(stage.state!=='SOURCE_VERIFIED'?{stagePreviousSource:structuredClone(baseline),stagePreviousFingerprint:baseline.fingerprint}:{}),
  restoredParentOperation:existing.operationId,source:'RESTORED_CURRENT_OWNER_FULL_SOURCE_READBACK',restoredHistorical:false}:null;
 return {ok:true,child,currentExisting,currentShadow,code:'RESTORED_SOURCE_REQUALIFIED',providerEffects:'NONE',importedTests:'INVALID',importedApproval:'INVALID'};
}
export function commitRestoredSource(db,expected,planned){
 if(!planned?.ok)return Promise.resolve(planned);
 return new Promise((resolve,reject)=>{
  let result=fail('RESTORED_SOURCE_TRANSACTION_INCOMPLETE');const tx=db.transaction(['meta','events'],'readwrite'),m=tx.objectStore('meta');
  tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(Error('RESTORED_SOURCE_TRANSACTION_ABORTED'));
  const keys=['account:'+expected.account.accountId,'inventory:'+expected.stage.slug,'s05-ready:'+expected.stage.slug,
   'stage:'+expected.stage.slug,'ai-job:'+expected.stage.slug,'release:'+expected.stage.slug,'existing-update:'+expected.stage.slug,'writeback:'+expected.stage.slug,'adoption:'+expected.stage.slug,'refresher:shadow:v1'];
  const values=[{account:expected.account},{generator:expected.inventory},{record:expected.ready},{record:expected.stage},
   expected.job?{job:expected.job}:null,expected.release?{release:expected.release}:null,
   expected.existing?{record:expected.existing}:null,expected.writeback?{record:expected.writeback}:null,expected.adoption?{adoption:expected.adoption}:null,expected.shadow?{state:expected.shadow}:null];
  let pending=keys.length,changed=false;
  keys.forEach((key,i)=>{m.get(key).onsuccess=e=>{
   const field=i===0?'account':i===1?'generator':i===4?'job':i===5?'release':i===8?'adoption':i===9?'state':'record';
   if(JSON.stringify(e.target.result?.[field]||null)!==JSON.stringify(values[i]?.[field]||null))changed=true;
   if(--pending)return;
   if(changed){result=fail('RESTORED_SOURCE_CONTEXT_CHANGED');return}
   const slug=expected.stage.slug;
   m.put({key:'stage-history:'+slug+':'+expected.stage.revision,record:structuredClone(expected.stage)});
   for(const [prefix,field,row] of [['ai','job',expected.job],['release','release',expected.release],['existing','record',expected.existing]]){
    if(!row)continue;
    m.put({key:prefix+'-history:'+slug+':restored-'+row.revision,[field]:structuredClone(row)});
    m.delete((prefix==='ai'?'ai-job':prefix==='existing'?'existing-update':prefix)+':'+slug);
   }
   if(expected.writeback&&expected.writeback.state!=='CONFIRMED'){
    m.put({key:'writeback-history:'+slug+':restored-'+expected.writeback.revision,record:structuredClone(expected.writeback)});m.delete('writeback:'+slug);
   }
   if(planned.currentShadow)m.put({key:'refresher:shadow:v1',state:planned.currentShadow});
   if(planned.currentExisting)m.put({key:'existing-update:'+slug,record:planned.currentExisting});
   m.put({key:'stage:'+slug,record:planned.child});
   m.put({key:'s05-ready:'+slug,record:{...expected.ready,restoredHistorical:false,revision:expected.ready.revision+1}});
   tx.objectStore('events').add({stage:'RESTORED_SOURCE_REQUALIFIED',slug,fromRevision:expected.stage.revision,
    toRevision:planned.child.revision,sourceFingerprint:planned.child.candidate.fingerprint,providerEffects:'NONE'});
   result={ok:true,code:planned.code,stageRevision:planned.child.revision,providerEffects:'NONE'};
  }});
 });
}
