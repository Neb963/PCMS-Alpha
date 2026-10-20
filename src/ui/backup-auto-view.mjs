// I15 UI keeps only transient operator secrets; canonical writes via background.
import {AUTO_PORT} from './backup-auto-core.mjs';
const el=id=>document.getElementById(id),status=el('pcms-auto-backup-status');
const enabled=el('pcms-auto-backup-enabled');
const format=el('pcms-auto-backup-format');
const buttons=['pcms-auto-backup-vault','pcms-auto-backup-save','pcms-auto-backup-run','pcms-auto-backup-refresh',
  'pcms-auto-backup-format-save','pcms-auto-backup-v2-now'];
const GUARANTEE={V1:'legacy browser download — not source-complete',
  V2:'source-complete native archive with authenticated full readback'};
let busy=false;
function call(message){
 return new Promise(resolve=>{
  let port,done=false;
  const finish=value=>{if(done)return;done=true;try{port?.disconnect();}catch{}resolve(value)};
  try{
    port=browser.runtime.connect({name:AUTO_PORT});
    port.onMessage.addListener(finish);
    port.onDisconnect.addListener(()=>finish({ok:false,code:'BACKUP_PORT_CLOSED'}));
    port.postMessage(message);
  }catch{finish({ok:false,code:'BACKUP_PORT_UNAVAILABLE'});}
 });
}
async function send(message){
 if(busy)return;
 busy=true;for(const id of buttons)el(id).disabled=true;
 try{
  const answer=await call(message);
  if(answer?.ok&&typeof answer.enabled==='boolean')enabled.checked=answer.enabled;
  if(answer?.ok&&['V1','V2'].includes(answer.format))format.value=answer.format;
  status.textContent=answer?.ok&&answer.state==='RECOVERY_VERIFIED'?
    'Source-complete backup verified: '+answer.sourceRows+' source rows, archive '+
    String(answer.ciphertextSha256||'').slice(0,12)+'…':
    answer?.ok?
    'Daily backup: '+(answer.status||answer.code||'ACKNOWLEDGED')+
    (answer.format?' · format: '+GUARANTEE[answer.format]:'')+
    ' · '+(answer.code||'')+
    (Number.isSafeInteger(answer.retained)?' · tracked browser-confirmed: '+answer.retained:'')+
    (answer.active?' · pending: '+answer.active:'')+
    (answer.deletionHeld?' · deletion held: '+answer.deletionHeld:'')+
    '. Tier 2 is browser metadata, not independently verified disk bytes.':
    'Daily backup unavailable/held: '+(answer?.code||'STATUS_UNKNOWN')+
    '. No encrypted-file success inferred.';
 }finally{busy=false;for(const id of buttons)el(id).disabled=false;}
}
el('pcms-auto-backup-vault').addEventListener('click',()=>{
 const a=el('pcms-auto-backup-pass'),b=el('pcms-auto-backup-confirm');
 if(a.value.length<12||a.value!==b.value){
  status.textContent='Recovery passphrases must match and contain at least 12 characters.';
  b.focus();return;
 }
 const passphrase=a.value;a.value='';b.value='';
 void send({action:'STORE_VAULT',passphrase});
});
el('pcms-auto-backup-save').addEventListener('click',()=>void send({action:'ENABLE',enabled:enabled.checked}));
el('pcms-auto-backup-run').addEventListener('click',()=>void send({action:'RUN_NOW'}));
el('pcms-auto-backup-refresh').addEventListener('click',()=>void send({action:'STATUS'}));
el('pcms-auto-backup-format-save').addEventListener('click',()=>void send({action:'SET_FORMAT',format:format.value}));
el('pcms-auto-backup-v2-now').addEventListener('click',()=>void send({action:'RUN_V2_MANUAL'}));
void send({action:'STATUS'});
