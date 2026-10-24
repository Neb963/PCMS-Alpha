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
// The same source-verifying guarded handler serves the primary workspace and
// the historic recovery panel until distribution cutover. No DOM forwarding.
export function mountPortableRestore(root=document){
const el=id=>root.querySelector('#'+id);
const archive=el('pcms-restore-archive'),checkpoint=el('pcms-restore-checkpoint'),
  mode=el('pcms-restore-mode'),fresh=el('pcms-restore-fresh'),
  mappings=el('pcms-restore-mappings'),choices=el('pcms-restore-account-choices'),
  preview=el('pcms-restore-preview'),
  verify=el('pcms-restore-verify'),apply=el('pcms-restore-apply'),
  details=el('pcms-restore-details'),status=el('pcms-restore-status'),
  checked=el('pcms-restore-consent'),reviewedHash=el('pcms-restore-reviewed-hash');
const fault=e=>/^(RESTORE|PORTABLE|BACKUP)_[A-Z0-9_]{3,70}$/.test(e?.message||'')?
  e.message:'RESTORE_HELD_UNKNOWN';
let review=null,sourceScope=null,checkpointScope=null,proof=null,working=false;
function invalidate(){
  review=null;proof=null;sourceScope=null;checkpointScope=null;
  verify.disabled=true;apply.disabled=true;
  details.textContent='No reviewed portable restore plan. Existing state is unchanged.';
}
for(const control of [archive,mode,fresh,mappings,choices])
  control.addEventListener('change',invalidate);
checkpoint.addEventListener('change',()=>{
  proof=null;checkpointScope=null;apply.disabled=true;
  if(review)verify.disabled=false;
});
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
  return {pcms,donor,portable};
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
function readMapping(){
  let value;try{value=JSON.parse(mappings.value||'{}')}
  catch{throw Error('RESTORE_MAPPING_INVALID')}
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw Error('RESTORE_MAPPING_INVALID');
  return value;
}
function readChoices(){
  let value;try{value=JSON.parse(choices.value||'{}');}
  catch{throw Error('RESTORE_ACCOUNT_CHOICES_INVALID');}
  if(!value||typeof value!=='object'||Array.isArray(value))
    throw Error('RESTORE_ACCOUNT_CHOICES_INVALID');
  return value;
}
function displayPlan(row,checkpointVerified){
  const plan=row.plan,risks=plan.risk;
  details.textContent=[
    'Inspected portable file: '+plan.archiveSha256,
    'Exact reviewed plan SHA-256: '+row.planSha256,
    'Destination: '+plan.mode+(plan.fresh?' · predecessor proof required':''),
    'Imported Personas: '+risks.importedPersonas,
    'Imported accounts: '+risks.importedAccounts,
    'Accounts awaiting explicit fresh-profile decision: '+risks.accountDecisionsMissing,
    'Unmapped Personas: '+risks.unmappedPersonas,
    'Direct-route reviews: '+risks.directRouteReviews,
    'Imported cookies: '+risks.importedCookies,
    'Canonical records: '+risks.canonicalRows,
    ...plan.groups.map(g=>'Persona '+g.key+': '+g.status+
      (g.targetId?' → '+g.targetId:'')),
    'Existing routes and sessions: NOT VERIFIED',
    'Prior publication approvals: HISTORY ONLY',
    'Excluded: '+plan.exclusions.join('; '),
    'Independent pre-restore file checkpoint: '+(checkpointVerified?'MATCHED':'NOT VERIFIED'),
    'Controller activation: OFF. No provider or Git effect is authorized.'
  ].join('\n');
}
function syncApply(){
  const p=review?.plan;
  let n=0;try{n=Object.keys(readMapping()).length}catch{}
  const complete=!!p&&p.risk.accountDecisionsMissing===0&&
    p.risk.unmappedPersonas===0&&
    p.risk.directRouteReviews===0&&p.groups.every(g=>
      ['MAPPING_ONLY_UNVERIFIED','CREATE_REQUESTED'].includes(g.status));
  apply.disabled=!(complete&&n===p.risk.importedPersonas&&
    proof?.verified===true&&checked.checked===true&&
    reviewedHash.value===review.planSha256&&
    sourceScope&&checkpointScope&&!working);
}
checked.addEventListener('change',syncApply);
reviewedHash.addEventListener('input',syncApply);
preview.addEventListener('click',async()=>{
  if(working)return;working=true;preview.disabled=true;verify.disabled=true;
  apply.disabled=true;review=null;proof=null;
  status.textContent='Inspecting portable file; verifying source and record integrity.';
  try{
    const file=archive.files?.[0];
    if(!file||!file.size)throw Error('PORTABLE_INPUT_MISSING');
    const staged=await preparePortableStage(file),incoming=await readPortableStage(staged.scope);
    const current=await destination(),requested=readMapping();
    review=await inspectPortableRestore({incoming,
      mode:mode.value,fresh:fresh.checked,mappings:requested,
      accountChoices:readChoices(),currentPcms:current.pcms,currentDonor:current.donor,
      currentPortable:current.portable,containers:current.donor.containers});
    sourceScope=staged.scope;checkpointScope=null;
    displayPlan(review,false);verify.disabled=false;
    status.textContent=review.plan.risk.unmappedPersonas||
      review.plan.risk.directRouteReviews?
      'Import held until every Persona mapping and protected route is reviewed.':
      'Integrity verified. Review exact plan, then choose a separate local checkpoint.';
  }catch(e){invalidate();status.textContent='Restore preview held: '+fault(e)+'. No writes performed.';}
  finally{working=false;preview.disabled=false;}
});
verify.addEventListener('click',async()=>{
  if(working||!review||!sourceScope)return;
  working=true;verify.disabled=true;apply.disabled=true;
  status.textContent='Reading independent checkpoint from selected browser file.';
  try{
    const file=checkpoint.files?.[0];
    if(!file||!file.size)throw Error('RESTORE_CHECKPOINT_FILE_REQUIRED');
    const staged=await preparePortableStage(file);
    if(staged.scope===sourceScope)throw Error('RESTORE_CHECKPOINT_SAME_SCOPE');
    const observed=await destination(),checkpointData=await readPortableStage(staged.scope);
    const p=await inspectPortableRestore({
      incoming:await readPortableStage(sourceScope),
      mode:mode.value,fresh:fresh.checked,mappings:readMapping(),
      accountChoices:readChoices(),currentPcms:observed.pcms,currentDonor:observed.donor,
      currentPortable:observed.portable,containers:observed.donor.containers});
    if(p.planSha256!==review.planSha256)throw Error('RESTORE_DESTINATION_DRIFT');
    proof=await verifyPortableCheckpoint({
      checkpoint:checkpointData,currentPcms:observed.pcms,
      currentPortable:observed.portable});
    checkpointScope=staged.scope;
    displayPlan(review,true);syncApply();
    status.textContent='Selected checkpoint re-read and matched. Controller remains inactive.';
  }catch(e){proof=null;checkpointScope=null;
    status.textContent='Checkpoint held: '+fault(e)+'. Restore not started.';}
  finally{working=false;verify.disabled=false;}
});
apply.addEventListener('click',async()=>{
  if(apply.disabled||!review||!sourceScope||!checkpointScope||
    !checked.checked||reviewedHash.value!==review.planSha256)return;
  working=true;apply.disabled=true;preview.disabled=true;verify.disabled=true;
  status.textContent='Applying reviewed data under durable inactive restore guard.';
  try{
    const out=await portCommand({action:'APPLY_PORTABLE',params:{
      stageScope:sourceScope,checkpointScope,reviewedPlanSha256:review.planSha256,
      mode:mode.value,fresh:fresh.checked,mappings:readMapping(),
      accountChoices:readChoices()}});
    const held=await portCommand({action:'STATUS'});
    status.textContent=out?.ok?
      'Portable data restored in inactive controller. Routes, owners and sessions require separate verification.':
      'Restore held: '+(out?.code||'RESTORE_RESULT_UNKNOWN')+
      '. '+(held?.status||'STATUS_UNKNOWN')+'. Never retry an uncertain effect.';
    details.textContent+='\nRestore state: '+(held?.status||'UNKNOWN')+
      '; runtime activation OFF; live effects NOT VERIFIED.';
  }catch(e){status.textContent='Restore held: '+fault(e)+'. Do not repeat without reconciliation.';}
  finally{working=false;review=null;proof=null;
    apply.disabled=true;preview.disabled=false;verify.disabled=true;
    void refreshStatus();}
});
el('pcms-restore-reconcile').addEventListener('click',async e=>{
  const button=e.currentTarget;if(working)return;working=true;button.disabled=true;
  status.textContent='Independently observing interrupted restore. No step will be repeated.';
  try{
    const held=await portCommand({action:'STATUS'});
    const stages=held?.portableScopes;
    if(!stages?.stageScope||!stages?.checkpointScope)
      throw Error('RESTORE_PORTABLE_RECONCILE_SCOPE');
    const out=await portCommand({action:'RECONCILE_PORTABLE',params:stages});
    status.textContent=(out?.ok?'Readback: ':'Readback held: ')+
      (out?.code||'RESTORE_RESULT_UNKNOWN')+
      '; controller remains inactive.';
  }catch(e){status.textContent='Reconciliation held: '+fault(e)+'. No replay.';}
  finally{working=false;button.disabled=false;void refreshStatus();}
});
const box=el('pcms-restore-reactivate-box'),reactivate=el('pcms-restore-reactivate'),
  stopped=el('pcms-restore-predecessor'),phrase=el('pcms-restore-reactivate-phrase');
const consent='THE PREVIOUS PCMS INSTALLATION IS STOPPED';
let activeGuard=null;
async function refreshStatus(){
  const held=await portCommand({action:'STATUS'});
  const overview=el('pcms-overview-restore');
  if(overview)overview.textContent=held?.held?
    'Restore '+(held.status||'HELD')+' · controller inactive.':
    'No active restore guard.';
  activeGuard=held?.held&&held.status==='COMPLETE_INACTIVE'?held:null;
  if(box)box.hidden=!activeGuard;
  if(reactivate)reactivate.disabled=!(activeGuard&&stopped.checked&&
    phrase.value.trim()===consent);
  if(held?.held&&!working)status.textContent=
    'Restore '+held.status+'. Inactive controller; re-observe uncertain steps, never retry.';
}
stopped?.addEventListener('change',()=>void refreshStatus());
phrase?.addEventListener('input',()=>{
  reactivate.disabled=!(activeGuard&&stopped.checked&&phrase.value.trim()===consent);
});
reactivate?.addEventListener('click',async()=>{
  if(!activeGuard||reactivate.disabled)return;
  reactivate.disabled=true;
  const out=await portCommand({action:'REACTIVATE',params:{
    epoch:activeGuard.epoch,revision:activeGuard.revision,
    predecessorStopped:stopped.checked===true,
    consent:phrase.value.trim()}});
  status.textContent=out?.ok?
    'Controller reactivated. Reconnect Git, verify account identities and explicitly grant protected workflows.':
    'Reactivation held: '+(out?.code||'UNKNOWN')+'.';
  phrase.value='';stopped.checked=false;void refreshStatus();
});
void refreshStatus();

}
// Historical standalone recovery panel remains independently functional.
if(document.getElementById('pcms-restore-archive'))mountPortableRestore(document);
