// S02 same-XPI guarded donor readiness bridge; independent of v2 native code.
import {trustedExtensionPage} from './command-boundary.mjs';
import {waitForPcmsBackupDonor} from './backup-auto-donor.mjs';
const fail=code=>({ok:false,code});
// Donor background.js loads asynchronously AFTER the signed recovery bootstrap.
// Legacy sendMessage(GET_SNAPSHOT) can resolve undefined during a Firefox
// event-page wake even when synchronous PCMS listeners are available.
// This exact-scope same-XPI port waits for actual donor attachment; it never
// fabricates a snapshot, retries a possible effect, or changes route authority.
export const BACKUP_DONOR_PORT='pcms-s02-backup-donor-readonly';
export function createDonorSnapshotPortHandler(api,{wait=waitForPcmsBackupDonor}={}){
  return port=>{
    if(port?.name!==BACKUP_DONOR_PORT)return;
    if(!trustedExtensionPage(api,port.sender)){
      try{port.postMessage(fail('UNTRUSTED_SENDER'));}catch{}
      return;
    }
    let used=false;
    port.onMessage.addListener(message=>{
      if(used){try{port.postMessage(fail('BACKUP_PORT_BUSY'));}catch{}return;}
      used=true;
      if(!message||Array.isArray(message)||Object.keys(message).length!==1||
         message.action!=='SNAPSHOT'){
        try{port.postMessage(fail('BACKUP_COMMAND_SCHEMA'));}catch{}
        return;
      }
      void Promise.resolve().then(()=>wait()).then(adapter=>adapter.snapshot())
        .then(snapshot=>{
          if(!snapshot?.state||typeof snapshot.state!=='object'||
             !Array.isArray(snapshot.containers))
            throw Error('BACKUP_DONOR_UNAVAILABLE');
          return {ok:true,state:snapshot.state,containers:snapshot.containers};
        }).catch(()=>fail('BACKUP_DONOR_UNAVAILABLE'))
        .then(answer=>{try{port.postMessage(answer);}catch{}});
    });
  };
}

