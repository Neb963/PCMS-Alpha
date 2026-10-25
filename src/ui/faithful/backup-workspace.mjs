import {openCanonicalDatabase} from '../journal.mjs';
import {snapshotCanonicalV2,preflightSourceRecovery} from '../backup-core.mjs';
import {preparePortableStage,readPortableStage,discardPortableStage} from '../portable-restore-stage.mjs';
const summary=good=>good?(good.kind==='DAILY'?'Daily':'Manual')+' backup · '+
 new Date(good.completedAt||good.day*86400000).toLocaleString()+' · '+good.bytes.toLocaleString()+' bytes':'No completed backup recorded.';
function exportFile(name,value,type='application/json'){
 const blob=new Blob([typeof value==='string'?value:JSON.stringify(value,null,2)+'\n'],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');
 a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function historyPage(offset,limit=25){
 const db=await openCanonicalDatabase();
 try{return await new Promise((resolve,reject)=>{
  const rows=[];let skipped=0,more=false;
  const tx=db.transaction('meta','readonly'),range=IDBKeyRange.bound('restore:automation-history:','restore:automation-history:\uffff');
  tx.oncomplete=()=>resolve({rows,more});tx.onabort=()=>reject(Error('RESTORE_HISTORY_UNAVAILABLE'));
  tx.objectStore('meta').openCursor(range).onsuccess=e=>{
   const cursor=e.target.result;if(!cursor)return;
   for(const job of cursor.value.jobs||[]){
    if(skipped++<offset)continue;
    if(rows.length===limit){more=true;return}
    rows.push(structuredClone(job));
   }
   cursor.continue();
  };
 })}finally{db.close()}
}
export function mountBackupWorkspace(container,{card,el,b,request,mountRestore}){
 const section=card(container,'Backups','Save accounts, sources, settings and recovery history without a password. Older files may contain accounts removed here.'),
 actions=el('div','form-foot'),status=el('p','setting-note','Reading backup status…'),last=el('p','setting-note'),
 daily=el('input'),label=el('label','setting-option'),details=el('details'),raw=el('pre','table-wrap');
 status.setAttribute('role','status');daily.type='checkbox';daily.id='pcms-backup-daily';
 label.append(daily,document.createTextNode(' Daily automatic backups · retain the latest 14 successes'));
 details.append(el('summary','','Backup details'),raw);raw.style.whiteSpace='pre-wrap';
 section.append(label,actions,last,status,details);
 let busy=false,epoch=0;
 function controls(){for(const button of actions.querySelectorAll('button'))button.disabled=busy;daily.disabled=busy}
 function render(result){
  if(!result?.ok){status.textContent='Backup status could not be read. Try Check status.';raw.textContent=result?.code||'BACKUP_RESULT_UNKNOWN';return}
  daily.checked=result.enabled===true;last.textContent=summary(result.lastSuccess);
  const failed=['FAILED','HELD_UNCERTAIN'].includes(result.manual?.status);
  status.textContent=failed?'The latest manual attempt did not complete. The last completed copy is kept. Check status before saving another.':
   result.active?'A backup is in progress.':'Daily backups '+(result.enabled?'enabled':'off')+' · '+result.retained+' successful daily copies tracked.';
  raw.textContent=JSON.stringify(result,null,2)+'\nDownload completion is reported by Firefox. Use Check a saved file below to verify a selected file.';
 }
 async function refresh(){const n=++epoch;const result=await request({action:'STATUS'});if(n===epoch&&section.isConnected)render(result)}
 async function run(message){
  if(busy)return;busy=true;controls();status.textContent=message.action==='MANUAL'?'Saving your backup…':'Updating backup status…';
  try{
   const out=await request(message,150000);await refresh();
   if(!out?.ok){status.textContent=out?.code==='BACKUP_INFLIGHT'?'A backup is already in progress. Check status shortly.':'Backup did not complete. Check status and the details before repeating it.';raw.textContent+='\n'+(out?.code||'BACKUP_RESULT_UNKNOWN')}
   else if(message.action==='MANUAL'&&out.code==='BROWSER_REPORTED_COMPLETE')status.textContent=out.recovered?'The earlier download was found and verified by Firefox. No second copy was started.':'Backup saved in your Firefox downloads, in pcms-backups.';
  }catch{status.textContent='The result was not received. Check status before saving another copy.'}
  finally{busy=false;controls()}
 }
 actions.append(b('Download complete backup',()=>void run({action:'MANUAL'}),'btn primary'),
 b('Save daily schedule',()=>void run({action:'ENABLE',enabled:daily.checked}),'btn small'),
 b('Run daily backup now',()=>void run({action:'RUN_NOW'}),'btn small'),
 b('Check status',()=>void run({action:'STATUS'}),'btn small'));
 const inspect=el('section','setting-note'),file=el('input'),fileStatus=el('p','setting-note');
 file.style.display='block';file.style.maxWidth='100%';file.style.marginBlock='8px';
 file.type='file';file.id='pcms-backup-inspect-file';file.accept='.pcms.jsonl,.jsonl,application/x-ndjson';
 const fileLabel=el('label','','Check a saved file');fileLabel.htmlFor=file.id;fileLabel.style.display='block';
 const verify=b('Verify selected backup',()=>void(async()=>{
  if(!file.files?.[0]){fileStatus.textContent='Choose a saved backup first.';return}
  verify.disabled=true;file.disabled=true;let scope='portable_'+crypto.randomUUID().replaceAll('-',''),reused=false;
  fileStatus.textContent='Reading the selected file and checking its records and source bytes…';
  try{
   await preparePortableStage(file.files[0],{scope});const opened=await readPortableStage(scope);
   fileStatus.textContent='Selected file verified · '+opened.receipt.rows+' records. It can be inspected for restore below.';
  }catch(error){reused=error?.message==='PORTABLE_STAGE_REUSED';fileStatus.textContent='This file could not be verified. Choose an intact backup and try again.';raw.textContent+='\n'+String(error?.message||'FILE_READ_FAILED')}
  finally{if(!reused)try{await discardPortableStage(scope)}catch{}verify.disabled=false;file.disabled=false}
 })(),'btn small');
 inspect.append(fileLabel,file,verify,fileStatus);section.append(inspect);
 const checks=el('details');checks.append(el('summary','','Local functional checks'));
 const checked=el('p','setting-note');checked.setAttribute('role','status');
 const test=b('Test backup and isolated restore',()=>void(async()=>{
  test.disabled=true;checked.textContent='Checking source recovery, archive integrity and a disposable data restore…';
  try{
   const a=await request({action:'CHECK_ARCHIVE'},150000),r=await request({action:'CHECK_RESTORE'},150000);
   checked.textContent=a?.ok&&r?.ok?'Archive and isolated data restore verified. Your current installation was kept.':
    'One local check did not pass. Other modules remain available; see Backup details.';
   raw.textContent=JSON.stringify({archive:a,isolatedRestore:r},null,2);
  }catch{checked.textContent='The check result could not be read. Try again when PCMS responds.'}
  finally{test.disabled=false}
 })(),'btn small');
 checks.append(test,checked);section.append(checks);
 mountRestore(container);
 const history=card(container,'Restored automation history','Complete recovered workflow history is kept here. Existing PersonaMonkey live jobs and its recent-job window are preserved.'),
 historyStatus=el('p','setting-note'),list=el('div'),foot=el('div','form-foot');
 history.id='pcms-restored-history';history.append(historyStatus,list,foot);let offset=0,loading=false;
 const prev=b('Previous history',()=>{offset=Math.max(0,offset-25);void loadHistory()},'btn small'),next=b('Next history',()=>{offset+=25;void loadHistory()},'btn small'),reload=b('Refresh restored history',()=>void loadHistory(),'btn small');
 foot.append(prev,next,reload);
 async function loadHistory(){
  if(loading)return;loading=true;prev.disabled=next.disabled=reload.disabled=true;
  try{
   const result=await historyPage(offset);if(!history.isConnected)return;list.replaceChildren();
   for(const job of result.rows){
    const row=el('details','setting-note');row.append(el('summary','',(job.workflowName||job.workflowId||'Workflow')+' · '+job.state));
    const data=el('pre','table-wrap',JSON.stringify(job,null,2));data.style.whiteSpace='pre-wrap';
    row.append(data,b('Download history record',()=>exportFile('pcms-restored-workflow-'+job.id+'.json',job),'btn small'));list.append(row);
   }
   historyStatus.textContent=result.rows.length?'Records '+(offset+1)+'–'+(offset+result.rows.length)+'. Historical records do not restart workflows.':'No restored workflow history recorded.';
   prev.disabled=offset===0;next.disabled=!result.more;
  }catch{historyStatus.textContent='Restored history could not be read. Retry Refresh restored history.'}
  finally{loading=false;reload.disabled=false}
 }
 void refresh();void loadHistory();
 const changed=()=>{if(!history.isConnected){window.removeEventListener('pcms-restore-completed',changed);return}void loadHistory()};
 window.addEventListener('pcms-restore-completed',changed);
}
