// I15 synchronous event listeners. Background scheduling never needs a PCMS tab.
import {trustedExtensionPage} from './command-boundary.mjs';
import {AUTO_ALARM,AUTO_PORT} from './backup-auto-core.mjs';
import {createAutoRunner,operatorSelectedV2} from './backup-auto-run.mjs';
import {createDonorSnapshotPortHandler} from './backup-donor-port.mjs';
const fail=code=>({ok:false,code});
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
    if(message.action==='RUN_V2_MANUAL')return runner.manualV2Candidate();
    if(message.action==='SET_FORMAT')return runner.setFormat(message.format);
    return fail('INVALID_COMMAND');
  }
  function validate(message){
    if(!message||typeof message!=='object'||Array.isArray(message)||
      !['STATUS','ENABLE','STORE_VAULT','RUN_NOW','RUN_V2_MANUAL','SET_FORMAT'].includes(message.action))
      return false;
    const keys=Object.keys(message).sort().join(',');
    if(message.action==='SET_FORMAT')return keys==='action,format'&&['V1','V2'].includes(message.format);
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
// Single registration; exported so a completed account removal can request
// the C-75 follow-up backup through the same coordinator (no second runner).
export const autoBackup=typeof browser!=='undefined'?createAutoBoundary(browser,{
  reviewedV2:operatorSelectedV2(browser)}):null;
autoBackup?.register();
