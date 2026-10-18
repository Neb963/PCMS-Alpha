// Narrow background-only donation of existing PersonaMonkey portable reads.
// This module has no runtime port, page API, native call, or capability mutation.
let source=null;
let signal;
const attached=new Promise(resolve=>{signal=resolve;});
export function attachPcmsBackupDonor(value){
 if(source)throw Error('BACKUP_DONOR_ALREADY_ATTACHED');
 if(typeof value?.snapshot!=='function'||typeof value?.cookies!=='function')
   throw Error('BACKUP_DONOR_INVALID');
 source=Object.freeze({snapshot:value.snapshot,cookies:value.cookies});
 signal(source);
}
export function getPcmsBackupDonor(){
 if(!source)throw Error('BACKUP_DONOR_UNAVAILABLE');
 return source;
}

// The donor background is dynamically imported only after the signed
// recovery bootstrap finishes. PCMS wake/backup listeners are registered
// synchronously first, so an early snapshot request must wait for this
// concrete adapter rather than race GET_SNAPSHOT over runtime.sendMessage.
// No retry, routing fallback or invented donor state is permitted.
export async function waitForPcmsBackupDonor({timeoutMs=8000}={}){
 if(source)return source;
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>8000)
   throw Error('BACKUP_DONOR_WAIT_INVALID');
 let timer;
 try{
   return await Promise.race([attached,new Promise((_,reject)=>{
     timer=setTimeout(()=>reject(Error('BACKUP_DONOR_UNAVAILABLE')),timeoutMs);
   })]);
 }finally{clearTimeout(timer);}
}
