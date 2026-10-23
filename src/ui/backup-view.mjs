// A02 browser-only manual backup and source audit. All filesystem download
// effects and their durable intent are owned by the background coordinator.
import {openCanonicalDatabase} from './journal.mjs';
import {snapshotCanonicalV2,preflightSourceRecovery} from './backup-core.mjs';
import {AUTO_PORT} from './backup-auto-core.mjs';
const el=id=>document.getElementById(id);
const button=el('pcms-backup-export'),status=el('pcms-backup-status');
const audit=el('pcms-backup-audit'),auditStatus=el('pcms-backup-audit-status');
const overview=el('pcms-overview-backup');
const safe=e=>/^(BACKUP|PORTABLE|DOWNLOAD)_[A-Z0-9_]{3,70}$/.test(e?.message||'')?
  e.message:'BACKUP_UNAVAILABLE';
function call(action){
  return new Promise(resolve=>{
    let port,closed=false;
    const finish=result=>{if(closed)return;closed=true;
      try{port?.disconnect();}catch{}resolve(result);};
    try{
      port=browser.runtime.connect({name:AUTO_PORT});
      port.onMessage.addListener(finish);
      port.onDisconnect.addListener(()=>finish({ok:false,code:'BACKUP_RESULT_UNKNOWN'}));
      port.postMessage({action});
    }catch{finish({ok:false,code:'BACKUP_PORT_UNAVAILABLE'});}
  });
}
async function refresh(){
  const current=await call('STATUS');
  const manual=current?.manual;
  if(overview)overview.textContent=manual?
    'Last portable backup: '+manual.status+' · evidence tier '+manual.tier+
      ' · '+manual.code+'.':
    'No new portable backup receipt.';
}
button?.addEventListener('click',()=>{
  if(button.disabled)return;button.disabled=true;
  status.textContent='Capturing exact source, Personas and cookies. No password or provider writes.';
  void call('MANUAL').then(result=>{
    status.textContent=result?.ok&&result.code==='BROWSER_REPORTED_COMPLETE'?
      'Firefox reports the portable archive download complete ('+result.bytes+
      ' bytes, SHA-256 '+result.sha256+'). No independent disk readback was performed.':
      'Portable backup '+(result?.ok?'unconfirmed':'held')+': '+
      (result?.code||'BACKUP_RESULT_UNKNOWN')+
      '. Inspect Firefox Downloads and backup status before repeating.';
  }).finally(()=>{button.disabled=false;void refresh();});
});
audit?.addEventListener('click',()=>{
  if(audit.disabled)return;audit.disabled=true;
  auditStatus.textContent='Auditing every retained source manifest and blob locally.';
  void (async()=>{let db;
    try{
      db=await openCanonicalDatabase();
      const snap=await snapshotCanonicalV2(db,{serializedValues:true});
      const result=await preflightSourceRecovery(snap);
      auditStatus.textContent='Source closure verified: '+result.manifests+
        ' manifests, '+result.uniqueBlobs+' unique blobs, '+result.uniqueBytes+
        ' unique source bytes. No disk-backup proof implied.';
    }catch(e){auditStatus.textContent='Source closure held: '+safe(e)+'. No state changed.';}
    finally{try{db?.close();}catch{}audit.disabled=false;}
  })();
});
void refresh();
