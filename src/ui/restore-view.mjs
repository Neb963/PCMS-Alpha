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
    status.textContent='Checkpoint file independently re-read, authenticated and matched to current destination. Restore mutation remains OFF.';
  }catch(e){checkpointProof=null;status.textContent='Checkpoint not proven: '+fault(e)+'. Restore not started.';}
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
