// Strict bounded optimistic retry for an authenticated v2 source cut.
// A changed cut is discarded in full. No remote/native dispatch occurs here.
export async function retryS02ConsistentCut(readOnce,{maxAttempts=3}={}){
  if(typeof readOnce!=='function'||!Number.isSafeInteger(maxAttempts)||
     maxAttempts<1||maxAttempts>3)throw Error('BACKUP_V2_RETRY_INVALID');
  for(let attempt=1;attempt<=maxAttempts;attempt++){
    try{return await readOnce();}
    catch(error){
      if(error?.message!=='BACKUP_SOURCE_CUT_CHANGED'||attempt===maxAttempts)
        throw error;
    }
  }
  throw Error('BACKUP_SOURCE_CUT_CHANGED');
}
