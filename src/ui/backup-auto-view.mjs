// A02 daily portable backups: one canonical background alarm/runner.
import {AUTO_PORT} from './backup-auto-core.mjs';
const el=id=>document.getElementById(id);
const status=el('pcms-auto-backup-status');
const enabled=el('pcms-auto-backup-enabled');
const buttons=['pcms-auto-backup-save','pcms-auto-backup-run',
  'pcms-auto-backup-refresh'].map(el).filter(Boolean);
let pending=false;
const communicate=action=>new Promise(resolve=>{
  let port,done=false;
  const finish=value=>{if(done)return;done=true;
    try{port?.disconnect();}catch{}resolve(value)};
  try{
    port=browser.runtime.connect({name:AUTO_PORT});
    port.onMessage.addListener(finish);
    port.onDisconnect.addListener(()=>finish({ok:false,code:'BACKUP_RESULT_UNKNOWN'}));
    port.postMessage(action);
  }catch{finish({ok:false,code:'BACKUP_PORT_UNAVAILABLE'});}
});
async function send(action){
  if(pending)return;pending=true;
  buttons.forEach(b=>b.disabled=true);
  try{
    const result=await communicate(action);
    if(result?.ok&&typeof result.enabled==='boolean')enabled.checked=result.enabled;
    if(result?.ok){
      status.textContent='Daily portable backup: '+(result.status||result.code||'ACKNOWLEDGED')+
        '. '+(result.code||'')+
        (Number.isSafeInteger(result.retained)?' · tracked successful: '+result.retained:'')+
        (result.active?' · in progress: '+result.active:'')+
        (result.deletionHeld?' · deletion held: '+result.deletionHeld:'')+
        '. Downloads metadata does not prove disk file bytes.';
    }else{
      status.textContent='Daily backup held: '+(result?.code||'BACKUP_RESULT_UNKNOWN')+
        '. No new successful archive inferred.';
    }
  }finally{pending=false;buttons.forEach(b=>b.disabled=false);}
}
el('pcms-auto-backup-save')?.addEventListener('click',()=>void send({
  action:'ENABLE',enabled:enabled.checked}));
el('pcms-auto-backup-run')?.addEventListener('click',()=>void send({action:'RUN_NOW'}));
el('pcms-auto-backup-refresh')?.addEventListener('click',()=>void send({action:'STATUS'}));
void send({action:'STATUS'});
