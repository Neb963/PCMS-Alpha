// I16 restore intent is outside replaceable canonical IndexedDB.
// Never clear the guard from a page, alarm, imported archive or failure handler.
export const RESTORE_GUARD_KEY='pcmsRestoreInProgress';
const digest64=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const token=s=>typeof s==='string'&&/^restore_[a-f0-9]{32}$/.test(s);
const fail=c=>{throw Error(c);};
export function safeRestoreReceipt(s){
  if(!s||s.active!==true)return {held:false,code:'NO_RESTORE_MARKER'};
  return {held:true,code:'RESTORE_IN_PROGRESS',epoch:s.epoch||null,
    status:s.status||'UNKNOWN',step:s.step||'NONE',groups:Object.entries(s.groups||{})
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
  async function begin({planSha256,archiveSha256,destinationSha256,checkpointSha256,
    reviewedPlanSha256,checkpointTier,fresh}){
    if(await read())fail('RESTORE_ALREADY_HELD');
    if(![planSha256,archiveSha256,destinationSha256,checkpointSha256,
      reviewedPlanSha256].every(digest64)||planSha256!==reviewedPlanSha256||
      checkpointTier!==3)fail('RESTORE_UNREVIEWED_OR_UNVERIFIED');
    const row={active:true,revision:1,epoch:'restore_'+uuid(),fresh:fresh===true,
      status:'GUARD_INSTALLED',step:'GUARD',planSha256,archiveSha256,
      destinationSha256,checkpointSha256,startedAt:now(),groups:{}};
    if(!token(row.epoch))fail('RESTORE_EPOCH_INVALID');
    // Any failure after this point retains a global mutating hold.
    return persist(row);
  }
  async function advance({epoch,revision,step,group,status,observation}){
    const prior=await read();
    if(!prior||prior.epoch!==epoch||prior.revision!==revision)
      fail('RESTORE_STALE_GUARD');
    if(!['BEFORE_DISPATCH','DISPATCH_POSSIBLE','OBSERVED','HELD_UNCERTAIN',
      'REVIEW_REQUIRED'].includes(status)||typeof step!=='string'||
      step.length>80||!/^[a-z0-9-]{2,64}$/.test(group||''))
      fail('RESTORE_RECEIPT_INVALID');
    if(status==='OBSERVED'&&
      (!observation||observation.source!=='INDEPENDENT_READBACK'||
        !digest64(observation.digest)))fail('RESTORE_INDEPENDENT_READBACK_REQUIRED');
    // Do not store raw imported data, credentials, cookies or service replies.
    const groups={...prior.groups,[group]:{status,step,
      observedDigest:status==='OBSERVED'?observation.digest:null}};
    return persist({...prior,revision:prior.revision+1,
      step,status:status==='HELD_UNCERTAIN'?'RESTORE_PARTIAL_HELD':'RESTORE_IN_PROGRESS',
      groups});
  }
  return Object.freeze({read,begin,advance,inspect:async()=>safeRestoreReceipt(await read())});
}
