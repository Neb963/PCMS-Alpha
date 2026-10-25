import {validDonorPreparation,validDonorBaseline} from './restore-observation.mjs';
// I16 restore intent is outside replaceable canonical IndexedDB.
// Effect-free PREPARING may be explicitly cancelled. Once sealed, only explicit
// reactivation of a fully observed COMPLETE_INACTIVE restore releases the hold.
export const RESTORE_GUARD_KEY='pcmsRestoreInProgress';
const digest64=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const token=s=>typeof s==='string'&&/^restore_[a-f0-9]{32}$/.test(s);
const fail=c=>{throw Error(c);};
const writers=new WeakMap();
const validScope=s=>typeof s==='string'&&/^portable_[a-f0-9]{32}$/.test(s);
export function safeRestoreReceipt(s){
  if(!s||s.active!==true)return {held:false,code:'NO_RESTORE_MARKER'};
  return {held:true,code:'RESTORE_IN_PROGRESS',epoch:s.epoch||null,revision:s.revision,
    status:s.status||'UNKNOWN',step:s.step||'NONE',createdContainers:Object.keys(s.createdContainers||{}).length,groups:Object.entries(s.groups||{})
      .map(([key,v])=>({key,status:v.status})),controller:'INACTIVE',activation:'OFF'};
}
export function createRestoreGate(storage,{now=()=>Date.now(),
  uuid=()=>crypto.randomUUID().replaceAll('-','')}={}){
  const read=async()=>{
    let row;try{row=(await storage.get(RESTORE_GUARD_KEY))?.[RESTORE_GUARD_KEY];}
    catch{fail('RESTORE_GUARD_UNAVAILABLE');}
    if(row!==undefined&&(!row||row.active!==true||!token(row.epoch)||
      !Number.isSafeInteger(row.revision)||row.revision<1))
      fail('RESTORE_GUARD_CORRUPT');
    return row||null;
  };
  async function persist(value){
    try{await storage.set({[RESTORE_GUARD_KEY]:value});}
    catch{fail('RESTORE_GUARD_WRITE_FAILED');}
    const observed=await read();
    if(JSON.stringify(observed)!==JSON.stringify(value))fail('RESTORE_GUARD_READBACK_FAILED');
    return observed;
  }
  // Durable hold before the safety copy: no imported effects or invented proofs.
  async function prepare({stageScope,archiveSha256}){
    if(await read())fail('RESTORE_ALREADY_HELD');
    if(!validScope(stageScope)||!digest64(archiveSha256))fail('RESTORE_PREPARATION_INVALID');
    const row={active:true,revision:1,epoch:'restore_'+uuid(),status:'PREPARING',
      step:'SAFETY_COPY',startedAt:now(),archiveSha256,stageScope,
      groups:{},createdContainers:{},recovery:null};
    if(!token(row.epoch))fail('RESTORE_EPOCH_INVALID');
    return persist(row);
  }
  async function cancel({epoch,revision}){
    const prior=await read();
    if(!prior||prior.epoch!==epoch||prior.revision!==revision)fail('RESTORE_STALE_GUARD');
    if(prior.status!=='PREPARING'||Object.keys(prior.groups||{}).length||
       Object.keys(prior.createdContainers||{}).length)fail('RESTORE_CANCEL_DENIED');
    try{await storage.remove(RESTORE_GUARD_KEY)}catch{fail('RESTORE_GUARD_WRITE_FAILED')}
    if(await read())fail('RESTORE_GUARD_READBACK_FAILED');
    return {ok:true,code:'RESTORE_PREPARATION_CANCELLED',epoch};
  }
  async function begin({planSha256,archiveSha256,destinationSha256,checkpointSha256,
    reviewedPlanSha256,checkpointTier,fresh,recovery=null,preparation=null,protocol=1,donorBaseline=null}){
    const prior=await read();
    if(preparation){
      if(!prior||prior.status!=='PREPARING'||prior.epoch!==preparation.epoch||
         prior.revision!==preparation.revision||prior.archiveSha256!==archiveSha256||
         recovery?.portableStageScope!==prior.stageScope||
         Object.keys(prior.groups||{}).length||Object.keys(prior.createdContainers||{}).length)
        fail('RESTORE_STALE_PREPARATION');
    }else if(prior)fail('RESTORE_ALREADY_HELD');
    if(![planSha256,archiveSha256,destinationSha256,checkpointSha256,
      reviewedPlanSha256].every(digest64)||planSha256!==reviewedPlanSha256||
      checkpointTier!==3)fail('RESTORE_UNREVIEWED_OR_UNVERIFIED');
    if(recovery!==null&&(!recovery||!['merge','replace'].includes(recovery.mode)||
       !recovery.mappings||typeof recovery.mappings!=='object'||
       Array.isArray(recovery.mappings)||Object.keys(recovery.mappings).length>10000||
       Object.entries(recovery.mappings).some(([k,v])=>k.length>256||
         typeof v!=='string'||v.length>256)))
       fail('RESTORE_RECOVERY_PLAN_INVALID');
    if(![1,2].includes(protocol)||protocol===2&&!validDonorBaseline(donorBaseline))fail('RESTORE_PROTOCOL_INVALID');
    const row={active:true,protocol,donorBaseline,revision:prior?prior.revision+1:1,epoch:prior?.epoch||'restore_'+uuid(),fresh:fresh===true,
      status:'GUARD_INSTALLED',step:'GUARD',planSha256,archiveSha256,
      destinationSha256,checkpointSha256,startedAt:prior?.startedAt||now(),groups:{},createdContainers:{},recovery};
    if(!token(row.epoch))fail('RESTORE_EPOCH_INVALID');
    // Any failure after this point retains a global mutating hold.
    return persist(row);
  }
  async function advance({epoch,revision,step,group,status,observation,fingerprint}){
    const prior=await read();
    if(!prior||prior.epoch!==epoch||prior.revision!==revision)
      fail('RESTORE_STALE_GUARD');
    if(prior.status==='PREPARING')fail('RESTORE_NOT_SEALED');
    if(!['BEFORE_DISPATCH','DISPATCH_POSSIBLE','OBSERVED','HELD_UNCERTAIN',
      'REVIEW_REQUIRED'].includes(status)||typeof step!=='string'||
      step.length>80||!/^[a-z0-9-]{2,64}$/.test(group||''))
      fail('RESTORE_RECEIPT_INVALID');
    if(status==='OBSERVED'&&
      (!observation||observation.source!=='INDEPENDENT_READBACK'||
        !digest64(observation.digest)))fail('RESTORE_INDEPENDENT_READBACK_REQUIRED');
    const before=prior.groups[group]?.status||null;
    const allowed=before===null?status==='BEFORE_DISPATCH':
      before==='BEFORE_DISPATCH'?status==='DISPATCH_POSSIBLE':
      ['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(before)?
        ['OBSERVED','HELD_UNCERTAIN'].includes(status):false;
    if(!allowed)fail('RESTORE_STEP_TRANSITION_DENIED');
    if(fingerprint!==undefined&&(!digest64(fingerprint)||
      (before&&prior.groups[group].fingerprint&&
        fingerprint!==prior.groups[group].fingerprint)))
      fail('RESTORE_STEP_FINGERPRINT_CHANGED');
    // Only non-secret effect fingerprints are stored outside replaceable IDB.
    const groups={...prior.groups,[group]:{status,step,
      fingerprint:prior.groups[group]?.fingerprint||fingerprint||null,
      observedDigest:status==='OBSERVED'?observation.digest:null}};
    const allDone=['donor-personas','donor-cookies','donor-portable','pcms-canonical']
      .every(k=>groups[k]?.status==='OBSERVED');
    return persist({...prior,revision:prior.revision+1,
      step,status:status==='HELD_UNCERTAIN'?'RESTORE_PARTIAL_HELD':
        allDone?'COMPLETE_INACTIVE':'RESTORE_IN_PROGRESS',
      groups});
  }
  async function prepareContainer({epoch,revision,personaKey,name}){
    const prior=await read();
    if(!prior||prior.protocol!==2||prior.epoch!==epoch||prior.revision!==revision||
      !['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(prior.groups['donor-personas']?.status)||
      prior.recovery?.mappings?.[personaKey]!=='__create__'||
      typeof name!=='string'||!/^PCMS Restore [a-f0-9]{12} [0-9]{3,5}$/.test(name))
      fail('RESTORE_CONTAINER_INTENT_INVALID');
    if(prior.containerIntents?.[personaKey])fail('RESTORE_CONTAINER_ALREADY_POSSIBLE');
    return persist({...prior,revision:prior.revision+1,
      containerIntents:{...(prior.containerIntents||{}),[personaKey]:{name,status:'CREATE_POSSIBLE'}}});
  }
  async function recordContainer({epoch,revision,personaKey,cookieStoreId}){
    const prior=await read();
    if(!prior||prior.epoch!==epoch||prior.revision!==revision||
       !['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(prior.groups['donor-personas']?.status))
      fail('RESTORE_CONTAINER_RECEIPT_STALE');
    if(typeof personaKey!=='string'||personaKey.length>256||
       prior.recovery?.mappings?.[personaKey]!=='__create__'||
       typeof cookieStoreId!=='string'||!/^firefox-container-[0-9]+$/.test(cookieStoreId))
      fail('RESTORE_CONTAINER_RECEIPT_INVALID');
    const entries=prior.createdContainers||{};
    if(entries[personaKey]&&entries[personaKey]!==cookieStoreId)
      fail('RESTORE_CONTAINER_ID_CHANGED');
    if(Object.entries(entries).some(([k,id])=>k!==personaKey&&id===cookieStoreId))
      fail('RESTORE_CONTAINER_ID_DUPLICATE');
    return persist({...prior,revision:prior.revision+1,
      createdContainers:{...entries,[personaKey]:cookieStoreId}});
  }
  async function donorReceipt({epoch,revision,receipt,commitPossible=false}){
    const prior=await read();
    if(!prior||prior.protocol!==2||prior.epoch!==epoch||prior.revision!==revision||
       !['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(prior.groups['donor-personas']?.status))
      fail('RESTORE_DONOR_RECEIPT_STALE');
    // Callers validate the fixed nonsecret receipt schema before this CAS.
    if(commitPossible){
      if(prior.donorPreparation?.status!=='PREPARED')fail('RESTORE_DONOR_COMMIT_ALREADY_POSSIBLE');
      return persist({...prior,revision:prior.revision+1,
        donorPreparation:{...prior.donorPreparation,status:'COMMIT_POSSIBLE'}});
    }
    if(prior.donorPreparation?.status==='COMMIT_POSSIBLE'||!validDonorPreparation(receipt)||receipt.status!=='PREPARED')
      fail('RESTORE_DONOR_RECEIPT_INVALID');
    return persist({...prior,revision:prior.revision+1,donorPreparation:structuredClone(receipt)});
  }
  // The ONLY guard release: an explicit operator reactivation of a fully
  // observed (COMPLETE_INACTIVE) restore. A partial/uncertain restore stays
  // held. The receipt moves to bounded history; grants remain revoked.
  async function reactivate({epoch,revision,at=now()}){
    const prior=await read();
    if(!prior||prior.epoch!==epoch||prior.revision!==revision)fail('RESTORE_STALE_GUARD');
    const done=['donor-personas','donor-cookies','donor-portable','pcms-canonical']
      .every(k=>prior.groups?.[k]?.status==='OBSERVED');
    if(prior.status!=='COMPLETE_INACTIVE'||!done)fail('RESTORE_NOT_COMPLETE_INACTIVE');
    let history=[];
    try{history=(await storage.get('pcmsRestoreHistory'))?.pcmsRestoreHistory||[];}catch{}
    if(!Array.isArray(history))history=[];
    try{await storage.set({pcmsRestoreHistory:[...history,{epoch:prior.epoch,
      planSha256:prior.planSha256,archiveSha256:prior.archiveSha256,
      startedAt:prior.startedAt,reactivatedAt:at,fresh:prior.fresh===true}].slice(-20)});}
    catch{fail('RESTORE_HISTORY_WRITE_FAILED');}
    try{await storage.remove(RESTORE_GUARD_KEY);}catch{fail('RESTORE_GUARD_WRITE_FAILED');}
    if(await read())fail('RESTORE_GUARD_READBACK_FAILED');
    return {ok:true,code:'CONTROLLER_REACTIVATED',epoch:prior.epoch};
  }
  // Share a writer queue across gate instances in this background. No imported
  // record can race a cancellation or turn a late safety-copy result into a seal.
  const serialized=fn=>(...args)=>{
    const task=(writers.get(storage)||Promise.resolve()).then(()=>fn(...args));
    writers.set(storage,task.catch(()=>{}));return task;
  };
  return Object.freeze({read,prepare:serialized(prepare),cancel:serialized(cancel),
    begin:serialized(begin),advance:serialized(advance),
    donorReceipt:serialized(donorReceipt),
    prepareContainer:serialized(prepareContainer),recordContainer:serialized(recordContainer),reactivate:serialized(reactivate),
    inspect:async()=>safeRestoreReceipt(await read())});
}
