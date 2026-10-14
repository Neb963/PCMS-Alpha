// I16 operator preflight. Preview is read-only and never sets the global restore
// guard or imports donor/cookie/PCMS state. Mutating stages remain unexposed.
import {openCanonicalDatabase} from './journal.mjs';
import {snapshotCanonical,MAX_ARCHIVE_BYTES} from './backup-core.mjs';
import {createPortableBackupPayload,decodeBackupEnvelope} from '../lib/backup-package.js';
import {filterOrdinaryAutomationJobs} from '../lib/automation-history.js';
import {previewRestore,verifyCheckpoint,revalidateRestorePlan} from './restore-core.mjs';
import {createRestoreGate} from './restore-gate.mjs';
const $=id=>document.getElementById(id);
const source=$('pcms-restore-archive'),checkpoint=$('pcms-restore-checkpoint'),
  pass=$('pcms-restore-passphrase'),mode=$('pcms-restore-mode'),
  mappings=$('pcms-restore-mappings'),fresh=$('pcms-restore-fresh'),
  preview=$('pcms-restore-preview'),verify=$('pcms-restore-verify'),
  details=$('pcms-restore-details'),status=$('pcms-restore-status');
const fault=e=>/^[A-Z][A-Z0-9_]{3,64}$/.test(e?.message||'')?e.message:'RESTORE_PREFLIGHT_FAILED';
let review=null,checkpointProof=null;
function invalidate(){
  review=null;checkpointProof=null;verify.disabled=true;
  $('pcms-restore-apply').disabled=true;
  details.textContent='No authenticated restore plan. Existing state remains unchanged.';
}
for(const el of [source,checkpoint,pass,mode,mappings,fresh])
  el.addEventListener('change',invalidate);
const readFile=async input=>{
  const f=input.files?.[0];
  if(!f||f.size<=0||f.size>MAX_ARCHIVE_BYTES)throw Error('RESTORE_ARCHIVE_LIMIT');
  const text=await f.text();
  if(new TextEncoder().encode(text).length>MAX_ARCHIVE_BYTES)throw Error('RESTORE_ARCHIVE_LIMIT');
  return text;
};
async function snapshot(){
  const response=await browser.runtime.sendMessage({type:'GET_SNAPSHOT'});
  if(!response?.state||!Array.isArray(response.containers))
    throw Error('RESTORE_DONOR_UNAVAILABLE');
  const db=await openCanonicalDatabase();let pcms;
  try{pcms=await snapshotCanonical(db);}finally{db.close();}
  return {pcms,donor:response};
}
async function portableCurrent(donor){
  const local=await browser.storage.local.get(null),extra=Object.create(null);
  for(const [key,value] of Object.entries(local||{}))
    if(key==='automationJobs'||key.startsWith('gm-values:'))extra[key]=value;
  const params={state:donor.state,containers:donor.containers,userscriptData:extra,
    automationHistory:filterOrdinaryAutomationJobs(Object.values(extra.automationJobs||{})),
    selection:{kind:'full'}};
  const initially=createPortableBackupPayload(params),cookies=Object.create(null);
  for(const persona of initially.personas){
    const list=await browser.runtime.sendMessage({type:'PERSONA_COOKIES_LIST',profileId:persona.sourceId});
    if(!Array.isArray(list))throw Error('RESTORE_COOKIE_UNAVAILABLE');
    cookies[persona.sourceId]=list;
  }
  return createPortableBackupPayload({...params,cookiesByProfile:cookies});
}
function summary(plan,proof){
  details.textContent=[
    'Authenticated plan: '+plan.planSha256,
    'Destination mode: '+plan.plan.mode+(plan.plan.fresh?' · fresh controller remains inactive':' · existing controller held'),
    'Imported Personas: '+plan.plan.risk.importedPersonas,
    'Missing explicit mappings: '+plan.plan.risk.unmappedPersonas,
    'Direct-route security review required: '+plan.plan.risk.directRouteReviews,
    ...plan.plan.groups.map(g=>'Persona '+g.key+': '+g.status+
      (g.targetId?' → '+g.targetId:' · no trusted mapping')),
    'Imported cookies: '+plan.plan.risk.importedCookies,
    'Canonical rows: '+plan.plan.risk.canonicalRows,
    'Route status: '+plan.plan.risk.routeStatus,
    'Prior approvals: '+plan.plan.risk.importedApprovalStatus,
    'Unverified identities: '+plan.plan.risk.sessionStatus,
    'Excluded: '+plan.plan.exclusions.join('; '),
    'Pre-restore checkpoint: '+(proof?.verified?'independent selected-file readback + authenticated destination cut':'NOT VERIFIED'),
    'Restore activation: OFF. No imported source, routes, cookies or provider commands applied.'
  ].join('\n');
}
preview.addEventListener('click',async()=>{
  if(preview.disabled)return;preview.disabled=true;verify.disabled=true;review=null;checkpointProof=null;
  status.textContent='Authenticating encrypted archive and comparing current destination. No mutation.';
  try{
    if(pass.value.length<12)throw Error('RESTORE_PASSPHRASE_REQUIRED');
    const raw=await readFile(source),current=await snapshot();
    const currentPortable=await portableCurrent(current.donor);
    let map;try{map=JSON.parse(mappings.value||'{}');}catch{throw Error('RESTORE_MAPPING_INVALID');}
    const plan=await previewRestore({archiveText:raw,password:pass.value,decodeDonor:decodeBackupEnvelope,
      mode:mode.value,fresh:fresh.checked,mappings:map,
      currentPcms:current.pcms,currentDonor:current.donor,currentPortable,
      containers:current.donor.containers});
    review={plan,current,raw};
    summary(plan,null);
    status.textContent='Preview authenticated; mapping is only a proposed identity association. Review exclusions and checkpoint.';
    verify.disabled=false;
  }catch(e){invalidate();status.textContent='Restore held: '+fault(e)+'. No donor or canonical write.';}
  finally{preview.disabled=false;}
});
verify.addEventListener('click',async()=>{
  if(verify.disabled||!review)return;verify.disabled=true;
  $('pcms-restore-apply').disabled=true;
  status.textContent='Re-reading selected checkpoint and current destination. No restore or remote action.';
  try{
    const checkpointText=await readFile(checkpoint);
    const observed=await snapshot();
    const donorPortable=await portableCurrent(observed.donor);
    await revalidateRestorePlan({expectedPlanSha256:review.plan.planSha256,
      expectedDestinationSha256:review.plan.plan.destinationSha256,
      currentPcms:observed.pcms,currentDonor:observed.donor,
      currentPortable:donorPortable,plan:review.plan.plan});
    const proof=await verifyCheckpoint({checkpointText,password:pass.value,
      decodeDonor:decodeBackupEnvelope,currentPcms:observed.pcms,
      currentPortable:donorPortable,archivedAtLeastTier:3});
    checkpointProof=proof;
    summary(review.plan,proof);
    syncApply();
    status.textContent='Checkpoint file independently re-read, authenticated and matched to current destination. Restore mutation remains OFF.';
  }catch(e){checkpointProof=null;syncApply();status.textContent='Checkpoint not proven: '+fault(e)+'. Restore not started.';}
  finally{verify.disabled=false;}
});
async function health(){
  try{
    const gate=createRestoreGate(browser.storage.local);
    const state=await gate.inspect();
    if(state.held){
      status.textContent='Restore hold active ('+state.status+'). Read-only preview remains accessible; no automatic resume, retry or activation. Groups: '+
        state.groups.map(g=>g.key+'='+g.status).join(', ')+'. Use emergency diagnostics for recovery.';
    }
  }catch{
    status.textContent='Restore guard cannot be read. Mutating restore is unavailable; read-only archive inspection remains possible.';
  }
}
void health();

const reviewedHash=$('pcms-restore-reviewed-hash');
const approval=$('pcms-restore-consent');
const apply=$('pcms-restore-apply');
function syncApply(){
  apply.disabled=!(review&&checkpointProof?.verified&&approval.checked&&
    reviewedHash.value===review.plan.planSha256);
}
reviewedHash.addEventListener('input',syncApply);
approval.addEventListener('change',syncApply);
function portCommand(message){
  return new Promise(resolve=>{
    let done=false,port;
    try{port=browser.runtime.connect({name:'pcms-i16-restore'});}
    catch{return resolve({ok:false,code:'RESTORE_PORT_UNAVAILABLE'});}
    const settle=result=>{
      if(done)return;done=true;
      try{port.disconnect();}catch{}
      resolve(result);
    };
    port.onMessage.addListener(settle);
    port.onDisconnect.addListener(()=>settle({ok:false,code:'RESTORE_RESULT_UNKNOWN'}));
    try{port.postMessage(message);}
    catch{settle({ok:false,code:'RESTORE_PORT_WRITE_FAILED'});}
  });
}
apply.addEventListener('click',async()=>{
  if(apply.disabled||!review||!checkpointProof?.verified||!approval.checked||
    reviewedHash.value!==review.plan.planSha256)return;
  apply.disabled=true;verify.disabled=true;preview.disabled=true;
  status.textContent='Restoring under the independent safety hold. Do not repeat an uncertain import.';
  try{
    const [archiveText,checkpointText,current]=await Promise.all([
      readFile(source),readFile(checkpoint),snapshot()
    ]);
    const currentPortable=await portableCurrent(current.donor);
    await revalidateRestorePlan({
      expectedPlanSha256:review.plan.planSha256,
      expectedDestinationSha256:review.plan.plan.destinationSha256,
      currentPcms:current.pcms,currentDonor:current.donor,
      currentPortable,plan:review.plan.plan
    });
    const independent=await verifyCheckpoint({
      checkpointText,password:pass.value,decodeDonor:decodeBackupEnvelope,
      currentPcms:current.pcms,currentPortable,archivedAtLeastTier:3
    });
    if(independent.sha256!==checkpointProof.sha256)
      throw Error('RESTORE_CHECKPOINT_CHANGED');
    const requested=JSON.parse(mappings.value||'{}');
    const result=await portCommand({action:'APPLY',params:{
      archiveText,checkpointText,password:pass.value,
      reviewedPlanSha256:review.plan.planSha256,
      mode:mode.value,fresh:fresh.checked,mappings:requested
    }});
    const held=await portCommand({action:'STATUS'});
    status.textContent=result?.ok?
      'Restored data under inactive controller. Routes, accounts and approvals still require independent review. '+(held.status||'RESTORE_HELD'):
      'Restore uncertain/held: '+(result?.code||'RESTORE_RESULT_UNKNOWN')+
      ' / '+(held?.status||'STATUS_UNAVAILABLE')+'. Never resend a possibly completed write.';
  }catch(e){
    status.textContent='Restore not confirmed: '+fault(e)+'. Inspect restore guard before any further action.';
  }finally{
    pass.value='';review=null;checkpointProof=null;
    apply.disabled=true;preview.disabled=false;
    void health();
  }
});

$('pcms-restore-reconcile').addEventListener('click',async event=>{
  const button=event.currentTarget;
  if(button.disabled)return;button.disabled=true;
  status.textContent='Observing the interrupted restore. No remote or local import is retried.';
  try{
    const [archiveText,checkpointText]=await Promise.all([readFile(source),readFile(checkpoint)]);
    if(pass.value.length<12)throw Error('RESTORE_PASSPHRASE_REQUIRED');
    const result=await portCommand({action:'RECONCILE',params:{
      archiveText,checkpointText,password:pass.value}});
    const current=await portCommand({action:'STATUS'});
    status.textContent=(result?.ok?
      'Readback: '+result.code:
      'Readback held: '+(result?.code||'RESTORE_RESULT_UNKNOWN'))+
      '. '+(result?.group||'No stage')+'; '+(current?.status||'INACTIVE')+
      '. No duplicate effect dispatched; activation OFF.';
  }catch(e){
    status.textContent='Reconciliation held: '+fault(e)+'. No retry performed.';
  }finally{pass.value='';button.disabled=false;void health();}
});
