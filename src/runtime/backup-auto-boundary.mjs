// I15 synchronous event listeners. Background scheduling never needs a PCMS tab.
import {trustedExtensionPage} from './command-boundary.mjs';
import {AUTO_ALARM,AUTO_PORT} from './backup-auto-core.mjs';
import {createPortableRunner} from './portable-runner.mjs';
import {createDonorSnapshotPortHandler} from './backup-donor-port.mjs';
const fail=code=>({ok:false,code});
export function createAutoBoundary(api,options={}){
  const runner=createPortableRunner(api,options);
  let registered=false;
  function wake(){
    try{Promise.resolve(api.alarms.create(AUTO_ALARM,{periodInMinutes:60})).catch(()=>{});}
    catch{/* status will report inability to run without alarm */}
    void runner.tick();
  }
  async function dispatch(message){
    if(message.action==='STATUS')return runner.status();
    if(message.action==='CHECK_ARCHIVE')return runner.inspectArchive();
    if(message.action==='CHECK_RESTORE')return runner.inspectRestore();
    if(message.action==='ENABLE'){
      await runner.enable(message.enabled);
      return runner.status();
    }
    if(message.action==='RUN_NOW')return runner.tick();
    if(message.action==='MANUAL')return runner.manual();
    return fail('INVALID_COMMAND');
  }
  function validate(message){
    return !!message&&typeof message==='object'&&!Array.isArray(message)&&
      (Object.keys(message).length===1&&
        ['STATUS','RUN_NOW','MANUAL','CHECK_ARCHIVE','CHECK_RESTORE'].includes(message.action)||
      Object.keys(message).length===2&&message.action==='ENABLE'&&
        typeof message.enabled==='boolean');
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
export const autoBackup=typeof browser!=='undefined'?createAutoBoundary(browser):null;
autoBackup?.register();
