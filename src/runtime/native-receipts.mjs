// Private background serialization for native intent and archive metadata.
// Storage-local has no compare-and-set: both writers must share this lock.
const locks=new Map();
export async function withNativeReceiptLock(key,action){
 const prior=locks.get(key)||Promise.resolve();let release;
 const gate=new Promise(resolve=>{release=resolve});locks.set(key,gate);
 await prior;
 try{return await action();}
 finally{release();if(locks.get(key)===gate)locks.delete(key);}
}
export async function restoreNativeReceipt(storage,key,incoming){
 return withNativeReceiptLock(key,async()=>{
  const current=(await storage.get(key))[key];
  if(current!==undefined)return {preserved:true};
  await storage.set({[key]:{...incoming,phase:'RESTORED_UNCONFIRMED'}});
  return {preserved:false};
 });
}
