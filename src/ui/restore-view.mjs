import {collectPortableLocal} from './portable-local.mjs';
// A02 portable file restore: local read-only inspection followed by the
// existing guarded background stage engine. No password, vault or native PCMS
// service. Imported source, identities, approvals and routes are never active.
import {openCanonicalDatabase} from './journal.mjs';
import {readProtectedDonorSnapshot} from './donor-snapshot.mjs';
import {snapshotCanonicalV2} from './backup-core.mjs';
import {createPortableBackupPayload} from '../lib/backup-package.js';
import {filterOrdinaryAutomationJobs} from '../lib/automation-history.js';
import {preparePortableStage,readPortableStage} from './portable-restore-stage.mjs';
import {inspectPortableRestore,verifyPortableCheckpoint} from './portable-restore-plan.mjs';
import {portableRestoreTemplate} from './faithful/portable-restore-template.mjs';
export function mountPortableRestore(root=document){
 let el=id=>root.querySelector('#'+id);
 if(!el('pcms-restore-summary')){
  const old=el('pcms-restore-archive')?.closest('section');
  if(old){const template=document.createElement('template');template.innerHTML=portableRestoreTemplate;old.replaceWith(template.content)}
 }
 const archive=el('pcms-restore-archive'),checkpoint=el('pcms-restore-checkpoint'),
 mode=el('pcms-restore-mode'),fresh=el('pcms-restore-fresh'),preview=el('pcms-restore-preview'),
 verify=el('pcms-restore-verify'),apply=el('pcms-restore-apply'),checked=el('pcms-restore-consent'),
 status=el('pcms-restore-status'),details=el('pcms-restore-details'),summary=el('pcms-restore-summary'),
 options=el('pcms-restore-options'),accounts=el('pcms-restore-accounts'),personas=el('pcms-restore-personas'),
 copy=el('pcms-restore-save-checkpoint'),showCopy=el('pcms-restore-show-checkpoint'),
 copyStatus=el('pcms-restore-copy-status'),cancel=el('pcms-restore-cancel'),
 reconcile=el('pcms-restore-reconcile'),reviewBox=el('pcms-restore-review'),
 stopped=el('pcms-restore-predecessor'),reactivate=el('pcms-restore-reactivate'),
 activationBox=el('pcms-restore-reactivate-box');
 let incoming=null,sourceScope=null,checkpointScope=null,review=null,proof=null,
 preparation=null,activeGuard=null,heldImport=false,working=false,copyId=null;
 const fault=e=>/^(RESTORE|PORTABLE|BACKUP)_[A-Z0-9_]{3,70}$/.test(e?.message||'')?e.message:'RESTORE_HELD_UNKNOWN';
 const messages={
 RESTORE_CHECKPOINT_PCMS_DRIFT:'PCMS data changed after the safety copy. Save a new safety copy and select it again.',
 RESTORE_CHECKPOINT_DONOR_DRIFT:'Persona data changed after the safety copy. Save and check a new copy.',
 RESTORE_PLAN_CHANGED:'The destination changed. Check the safety copy and review the import again.',
 RESTORE_DESTINATION_DRIFT:'The destination changed. Check the safety copy and review the import again.',
 RESTORE_LOCAL_WORK_BUSY:'Existing PCMS work is still settling. Preparation remains held; try saving the safety copy again.',
 BACKUP_PREVIOUS_DOWNLOAD_UNCERTAIN:'An earlier download needs checking. Cancel preparation, check backup status, then prepare again.',
 RESTORE_RESULT_UNKNOWN:'The connection closed before a result arrived. Check restore status before continuing.',
 RESTORE_MERGE_CONFLICT:'This backup conflicts with existing data. Review Replace PCMS data if you intend to replace it.',
 RESTORE_REMOVED_ACCOUNT_REQUIRES_SEPARATE_REVIEW:'An account was removed on this installation. Leave it unchecked and review it separately after restore.',
 PORTABLE_INPUT_MISSING:'Choose a backup file first.'
 };
 function report(code){status.textContent=messages[code]||'Restore is held. Check the details and try the corrected step.';details.textContent+='\n'+code}
 function node(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n}
 function invalidate(){review=null;proof=null;checkpointScope=null;checked.checked=false;reviewBox.replaceChildren();sync()}
 function mappings(){return Object.fromEntries([...personas.querySelectorAll('select')].filter(x=>x.value).map(x=>[x.dataset.persona,x.value]))}
 function choices(){return Object.fromEntries([...accounts.querySelectorAll('input')].map(x=>[x.dataset.account,x.checked?'INCLUDE_INACTIVE':'EXCLUDE']))}
 function sync(){
  apply.disabled=working||!review||!proof?.verified||!checked.checked||!sourceScope||!checkpointScope;
  verify.disabled=working||!incoming||!preparation||!checkpoint.files?.[0];
  preview.disabled=working||!!preparation||heldImport;
  copy.disabled=working||!incoming||heldImport;
  cancel.hidden=!preparation;cancel.disabled=working;
  archive.disabled=working||!!preparation||heldImport;
  for(const control of [mode,fresh,...accounts.querySelectorAll('input'),...personas.querySelectorAll('select')])control.disabled=working||heldImport;
  reactivate.disabled=working||!activeGuard||!stopped.checked;
  showCopy.hidden=copyId===null;
 }
 function snapshotPortable(donor,local){
  const extra=Object.create(null);
  for(const [key,value] of Object.entries(local||{}))
    if(key==='automationJobs'||key.startsWith('gm-values:'))extra[key]=value;
  const params={state:donor.state,containers:donor.containers,
    userscriptData:extra,selection:{kind:'full'},
    automationHistory:filterOrdinaryAutomationJobs(Object.values(extra.automationJobs||{}))};
  return {extra,params};
}
async function destination(){
  let donor;
  try{donor=await readProtectedDonorSnapshot(browser);}
  catch{throw Error('RESTORE_DONOR_UNAVAILABLE');}
  const db=await openCanonicalDatabase();let pcms;
  try{pcms=await snapshotCanonicalV2(db,{serializedValues:true});}
  finally{db.close();}
  const local=await browser.storage.local.get(null);
  const {params}=snapshotPortable(donor,local);
  const preliminary=createPortableBackupPayload(params),cookies=Object.create(null);
  for(const p of preliminary.personas){
    const records=await browser.runtime.sendMessage({
      type:'PERSONA_COOKIES_LIST',profileId:p.sourceId});
    if(!Array.isArray(records))throw Error('RESTORE_COOKIE_UNAVAILABLE');
    cookies[p.sourceId]=records;
  }
  const portable=createPortableBackupPayload({...params,cookiesByProfile:cookies});
  return {pcms,donor,portable,local:collectPortableLocal(local)};
}
function portCommand(message){
  return new Promise(resolve=>{
    let port,finished=false;
    const complete=result=>{
      if(finished)return;finished=true;
      try{port?.disconnect()}catch{}
      resolve(result);
    };
    try{
      port=browser.runtime.connect({name:'pcms-i16-restore'});
      port.onMessage.addListener(complete);
      port.onDisconnect.addListener(()=>
        complete({ok:false,code:'RESTORE_RESULT_UNKNOWN'}));
      port.postMessage(message);
    }catch{complete({ok:false,code:'RESTORE_PORT_UNAVAILABLE'})}
  });
}

 async function renderChoices(){
  const current=await destination();accounts.replaceChildren();personas.replaceChildren();
  const known=new Map(current.pcms.stores.meta.filter(r=>typeof r.key==='string'&&
   r.key.startsWith('account:')&&r.value?.account).map(r=>[r.value.account.accountId,r.value.account]));
  fresh.checked=known.size===0;
  fresh.closest('label')?.setAttribute('hidden','');
  const rows=incoming.canonical.stores.meta.filter(r=>typeof r.key==='string'&&r.key.startsWith('account:')&&r.value?.account);
  const removals=new Map(current.pcms.stores.meta.filter(r=>typeof r.key==='string'&&r.key.startsWith('removal:')&&r.value?.state==='REMOVED_ONLY_LOCALLY').map(r=>[r.key.slice(8),r.value]));
  for(const row of rows){
   const a=row.value.account,label=node('label'),input=node('input');
   input.type='checkbox';input.dataset.account=a.accountId;
   const removed=(removals.get(a.accountId)?.revision||0)>a.revision;
   input.checked=!fresh.checked&&known.has(a.accountId)&&known.get(a.accountId).state!=='REMOVED'&&!removed;
   if(removed)input.dataset.removed='true';
   input.addEventListener('change',invalidate);
   label.append(input,document.createTextNode(' '+(a.alias||a.label||a.accountId)+(removed?' — removed here; select only to recover it inactive':'')));accounts.append(label,node('br'));
  }
  if(!rows.length)accounts.append(node('p','This backup contains no PCMS accounts.'));
  for(const p of incoming.donor.personas){
   const label=node('label',p.name||p.profile?.name||'Persona '+(personas.children.length+1)),
    select=node('select');select.dataset.persona=p.key;
   for(const [value,text] of [['','Choose a destination…'],['__create__','Create a new protected Persona'],...current.donor.containers.map(c=>[c.cookieStoreId,c.name||c.cookieStoreId])]){
    const option=node('option',text);option.value=value;select.append(option);
   }
   select.addEventListener('change',invalidate);label.append(select);personas.append(label);
  }
  if(!incoming.donor.personas.length)personas.append(node('p','This backup contains no Personas.'));
  summary.textContent=rows.length+' accounts · '+incoming.donor.personas.length+' Personas · '+incoming.receipt.rows+' records. File integrity and source recovery verified.';
  options.hidden=false;invalidate();
 }
 async function refreshStatus({resume=true}={}){
  const held=await portCommand({action:'STATUS'});
  if(!held?.ok){report(held?.code||'RESTORE_RESULT_UNKNOWN');return}
  const overview=el('pcms-overview-restore');
  if(overview)overview.textContent=held.held?'Restore '+held.status+' · work held.':'No restore in progress.';
  activeGuard=held.held&&held.status==='COMPLETE_INACTIVE'?held:null;
  preparation=held.preparation||null;heldImport=held.held&&!preparation;activationBox.hidden=!activeGuard;
  reconcile.hidden=!held.held||!!preparation||!!activeGuard;
  if(preparation&&resume&&!incoming){
   sourceScope=preparation.stageScope;
   try{incoming=await readPortableStage(sourceScope);await renderChoices();status.textContent='Restore preparation recovered. Select your safety copy, then review the import.'}
   catch(e){report(fault(e))}
  }else if(activeGuard)status.textContent='Data restored. Confirm other PCMS installations are closed to continue.';
  else if(held.held&&!preparation)status.textContent='An interrupted restore is held. Check and continue to verify saved results and finish only work that never started.';
  sync();return held;
 }
 async function action(fn){
  if(working)return;working=true;sync();
  try{await fn()}catch(e){report(fault(e))}
  finally{working=false;sync()}
 }
 archive.addEventListener('change',()=>{incoming=null;sourceScope=null;summary.textContent='';options.hidden=true;invalidate()});
 for(const c of [mode,fresh])c.addEventListener('change',()=>{invalidate();if(c===fresh&&incoming)for(const box of accounts.querySelectorAll('input'))box.checked=false});
 checkpoint.addEventListener('change',invalidate);checked.addEventListener('change',sync);
 preview.addEventListener('click',()=>action(async()=>{
  const file=archive.files?.[0];if(!file?.size)throw Error('PORTABLE_INPUT_MISSING');
  status.textContent='Checking the backup and every saved source record…';
  const staged=await preparePortableStage(file);incoming=await readPortableStage(staged.scope);sourceScope=staged.scope;
  await renderChoices();status.textContent='Choose the accounts and Persona destinations, then save a safety copy.';
 }));
 copy.addEventListener('click',()=>action(async()=>{
  if(!incoming||!sourceScope)return;
  invalidate();status.textContent='Holding new PCMS work and letting existing work settle…';
  const prepared=await portCommand({action:'PREPARE_PORTABLE',params:{stageScope:sourceScope}});
  await refreshStatus({resume:false});if(!prepared?.ok)throw Error(prepared?.code||'RESTORE_RESULT_UNKNOWN');
  preparation=prepared.preparation;
  status.textContent='Saving a safety copy in your Firefox downloads…';
  const out=await portCommand({action:'CHECKPOINT_PORTABLE',params:preparation});
  if(!out?.ok)throw Error(out?.code||'RESTORE_RESULT_UNKNOWN');
  copyId=out.downloadId;copyStatus.textContent='Safety copy saved in pcms-backups. Select that downloaded file below so PCMS can read and verify it.';
  status.textContent='Safety copy saved. PCMS work remains held until you restore or cancel preparation.';
 }));
 showCopy.addEventListener('click',()=>action(async()=>{if(copyId!==null)await browser.downloads.show(copyId)}));
 verify.addEventListener('click',()=>action(async()=>{
  if(!incoming||!preparation)return;invalidate();
  const file=checkpoint.files?.[0];if(!file?.size)throw Error('RESTORE_CHECKPOINT_FILE_REQUIRED');
  const staged=await preparePortableStage(file),observed=await destination();
  const checkedFile=await readPortableStage(staged.scope);
  proof=await verifyPortableCheckpoint({checkpoint:checkedFile,currentPcms:observed.pcms,currentPortable:observed.portable,currentLocal:observed.local});
  const result=await inspectPortableRestore({incoming,mode:mode.value,fresh:fresh.checked,mappings:mappings(),accountChoices:choices(),
   currentPcms:observed.pcms,currentDonor:observed.donor,currentPortable:observed.portable,currentLocal:observed.local,containers:observed.donor.containers});
  if(result.plan.risk.accountDecisionsMissing||result.plan.risk.unmappedPersonas||result.plan.risk.directRouteReviews||
   !result.plan.groups.every(g=>['MAPPING_ONLY_UNVERIFIED','CREATE_REQUESTED'].includes(g.status)))throw Error('RESTORE_MAPPING_UNVERIFIED');
  review=result;checkpointScope=staged.scope;
  const included=Object.values(choices()).filter(x=>x==='INCLUDE_INACTIVE').length;
  reviewBox.replaceChildren(node('p','Ready to '+(mode.value==='replace'?'replace PCMS data':'merge this backup')+': '+included+' selected accounts and '+review.plan.risk.importedPersonas+' Personas. Safety copy verified. Restored accounts and automations stay held for review.'));
  details.textContent=JSON.stringify({plan:review.plan,planSha256:review.planSha256,safetyCopy:proof.evidence},null,2);
  status.textContent='Review the import above and confirm to restore.';
 }));
 apply.addEventListener('click',()=>action(async()=>{
  if(!review||!proof?.verified||!checked.checked||!preparation)return;
  const out=await portCommand({action:'APPLY_PORTABLE',params:{stageScope:sourceScope,checkpointScope,preparation,
   reviewedPlanSha256:review.planSha256,mode:mode.value,fresh:fresh.checked,mappings:mappings(),accountChoices:choices()}});
  invalidate();await refreshStatus();
  if(!out?.ok)throw Error(out?.code||'RESTORE_RESULT_UNKNOWN');
  status.textContent='Selected data restored. Review the continuation step below.';
  window.dispatchEvent(new Event('pcms-restore-completed'));
 }));
 cancel.addEventListener('click',()=>action(async()=>{
  if(!preparation)return;
  const out=await portCommand({action:'CANCEL_PREPARATION',params:{epoch:preparation.epoch,revision:preparation.revision}});
  if(!out?.ok)throw Error(out?.code||'RESTORE_RESULT_UNKNOWN');
  preparation=null;invalidate();await refreshStatus();status.textContent='Restore preparation cancelled. Existing data was kept; ordinary PCMS work can continue.';
 }));
 reconcile.addEventListener('click',()=>action(async()=>{
  const held=await portCommand({action:'STATUS'});if(!held?.portableScopes)throw Error('RESTORE_PORTABLE_RECONCILE_SCOPE');
  const out=await portCommand({action:'RECONCILE_PORTABLE',params:held.portableScopes});await refreshStatus();
  if(!out?.ok)throw Error(out?.code||'RESTORE_RESULT_UNKNOWN');
  window.dispatchEvent(new Event('pcms-restore-completed'));
 }));
 stopped.addEventListener('change',sync);
 reactivate.addEventListener('click',()=>action(async()=>{
  if(!activeGuard||!stopped.checked)return;
  const out=await portCommand({action:'REACTIVATE',params:{epoch:activeGuard.epoch,revision:activeGuard.revision,
   predecessorStopped:true,consent:'THE PREVIOUS PCMS INSTALLATION IS STOPPED'}});
  if(!out?.ok)throw Error(out?.code||'RESTORE_RESULT_UNKNOWN');
  activeGuard=null;stopped.checked=false;await refreshStatus();
  status.textContent='PCMS can continue. Reconnect GitHub and verify account logins and protected routes in Accounts.';
 }));
 void refreshStatus();
}
if(document.getElementById('pcms-restore-archive'))mountPortableRestore(document);
