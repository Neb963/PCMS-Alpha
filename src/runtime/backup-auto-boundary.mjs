// I15 synchronous event listeners. Background scheduling never needs a PCMS tab.
import {trustedExtensionPage} from './command-boundary.mjs';
import {AUTO_ALARM,AUTO_PORT} from './backup-auto-core.mjs';
import {createAutoRunner} from './backup-auto-run.mjs';
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

export function createAutoBoundary(api,options={}){
  const runner=createAutoRunner(api,options);
  let registered=false;
  function wake(){
    try{Promise.resolve(api.alarms.create(AUTO_ALARM,{periodInMinutes:60})).catch(()=>{});}
    catch{/* status will report inability to run without alarm */}
    void runner.tick();
  }
  async function dispatch(message){
    if(message.action==='STATUS')return runner.status();
    if(message.action==='ENABLE'){
      await runner.enable(message.enabled);
      return runner.status();
    }
    if(message.action==='STORE_VAULT')return runner.setVault(message.passphrase);
    if(message.action==='RUN_NOW')return runner.tick();
    return fail('INVALID_COMMAND');
  }
  function validate(message){
    if(!message||typeof message!=='object'||Array.isArray(message)||
      !['STATUS','ENABLE','STORE_VAULT','RUN_NOW'].includes(message.action))
      return false;
    const keys=Object.keys(message).sort().join(',');
    return message.action==='ENABLE'?keys==='action,enabled'&&typeof message.enabled==='boolean':
      message.action==='STORE_VAULT'?keys==='action,passphrase'&&
        typeof message.passphrase==='string'&&message.passphrase.length<=4096:
        keys==='action';
  }
  function register(){
    if(registered)return;registered=true;
    api.runtime.onConnect.addListener(createDonorSnapshotPortHandler(api));
    api.runtime.onConnect.addListener(port=>{
      if(port?.name!==AUTO_PORT)return;
      if(!trustedExtensionPage(api,port.sender)){
        try{port.postMessage(fail('UNTRUSTED_SENDER'));}catch{}return;
      }
      port.onMessage.addListener(msg=>{
        let size=Infinity;
        try{size=JSON.stringify(msg)?.length||Infinity;}catch{}
        const answer=!validate(msg)||size>9000?
          Promise.resolve(fail('INVALID_COMMAND')):dispatch(msg);
        void Promise.resolve(answer).catch(()=>fail('BACKUP_UNAVAILABLE'))
          .then(value=>{try{port.postMessage(value);}catch{}});
      });
    });
    api.alarms.onAlarm.addListener(value=>{
      if(value?.name===AUTO_ALARM)void runner.tick();
    });
    api.runtime.onStartup.addListener(wake);
    api.runtime.onInstalled.addListener(wake);
    wake(); // restore alarm after startup; all effects require durable claims.
  }
  return Object.freeze({register,runner});
}
if(typeof browser!=='undefined')createAutoBoundary(browser).register();
