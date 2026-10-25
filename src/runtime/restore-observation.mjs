import {splitPortableLocal} from './portable-local.mjs';
// Nonsecret, durable expectations for cold local restore readback.
import {digest} from './backup-core.mjs';
import {BLOCK_ROUTE_ID} from '../lib/constants.js';
const hash=value=>digest(JSON.stringify(value));
const validMap=value=>value&&typeof value==='object'&&!Array.isArray(value)&&
 Object.keys(value).length<=100000&&Object.entries(value).every(([k,v])=>
 k.length>0&&k.length<=256&&typeof v==='string'&&v.length>0&&v.length<=256);
const validHashes=rows=>Array.isArray(rows)&&rows.length<=100000&&rows.every(r=>
 r&&typeof r.id==='string'&&r.id.length<=256&&/^[a-f0-9]{64}$/.test(r.sha256||''));
export function validDonorPreparation(r){
 return r?.schema===1&&['PREPARED','COMMIT_POSSIBLE'].includes(r.status)&&
 validMap(r.mappings)&&validMap(r.scriptMap)&&validMap(r.workflowMap)&&
 Array.isArray(r.sourcePersonas)&&r.sourcePersonas.length<=10000&&r.sourcePersonas.every(p=>
 typeof p.containerId==='string'&&typeof p.targetUid==='string'&&
 (p.sourceUid===null||typeof p.sourceUid==='string')&&(p.sourceId===null||typeof p.sourceId==='string'))&&
 ['profiles','scripts','workflows','untouchedProfiles'].every(k=>validHashes(r[k]))&&
 /^[a-f0-9]{64}$/.test(r.globalSha256||'')&&/^[a-f0-9]{64}$/.test(r.routesSha256||'');
}
export async function donorPreparationReceipt(prepared,baseline,mappings){
 const rows=async (ids,objects)=>Promise.all([...new Set(ids)].sort().map(async id=>({id,sha256:await hash(objects[id])})));
 const target=new Set(Object.values(mappings));
 const receipt={schema:1,status:'PREPARED',mappings:structuredClone(mappings),
 sourcePersonas:prepared.sourcePersonas.map(p=>({sourceUid:p.sourceUid||null,targetUid:p.targetUid,
 sourceId:p.sourceId||null,containerId:p.containerId})),
 scriptMap:structuredClone(prepared.scriptMap||{}),workflowMap:structuredClone(prepared.workflowMap||{}),
 profiles:await rows([...target],prepared.candidate.profiles||{}),
 scripts:await rows(Object.values(prepared.scriptMap||{}),prepared.candidate.scripts||{}),
 workflows:await rows(Object.values(prepared.workflowMap||{}),prepared.candidate.workflows||{}),
 untouchedProfiles:await rows(Object.keys(baseline.state.profiles||{}).filter(id=>!target.has(id)),baseline.state.profiles||{}),
 globalSha256:await hash(baseline.state.global),routesSha256:await hash(baseline.state.routes)};
 if(!validDonorPreparation(receipt))throw Error('RESTORE_DONOR_RECEIPT_INVALID');
 return receipt;
}
export async function observeDonorPreparation(receipt,snapshot){
 if(!validDonorPreparation(receipt)||receipt.status!=='COMMIT_POSSIBLE'||!snapshot?.state)return false;
 const state=snapshot.state;
 if(await hash(state.global)!==receipt.globalSha256||await hash(state.routes)!==receipt.routesSha256)return false;
 for(const [group,objects] of [['profiles',state.profiles],['untouchedProfiles',state.profiles],['scripts',state.scripts],['workflows',state.workflows]])
 for(const row of receipt[group])if(!objects?.[row.id]||await hash(objects[row.id])!==row.sha256)return false;
 for(const p of receipt.sourcePersonas){const r=state.profiles?.[p.containerId];
 if(!r||r.personaUid!==p.targetUid||r.routeId!==BLOCK_ROUTE_ID||r.killSwitch!==true||r.blockLocalNetwork!==true||r.managed!==true)return false;}
 for(const id of Object.values(receipt.scriptMap))if(state.scripts[id]?.enabled!==false||state.scripts[id]?.autoRun!==false)return false;
 for(const id of Object.values(receipt.workflowMap))if(state.workflows[id]?.enabled!==false)return false;
 return true;
}
export function checkpointCanonicalBaseline(checkpoint,current){
 checkpoint=splitPortableLocal(checkpoint).pcms;
 const self=new Set(['backup:manual-active','backup:manual-last-complete']);
 return {...checkpoint,stores:{...checkpoint.stores,meta:[...checkpoint.stores.meta.filter(r=>!self.has(r.key)),
 ...current.stores.meta.filter(r=>self.has(r.key))].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)}};
}

export function validDonorBaseline(r){return r?.schema===1&&validHashes(r.profiles)&&
 /^[a-f0-9]{64}$/.test(r.globalSha256||'')&&/^[a-f0-9]{64}$/.test(r.routesSha256||'');}
export async function donorBaselineReceipt(snapshot){
 return {schema:1,globalSha256:await hash(snapshot.state.global),routesSha256:await hash(snapshot.state.routes),
 profiles:await Promise.all(Object.keys(snapshot.state.profiles||{}).sort().map(async id=>({id,sha256:await hash(snapshot.state.profiles[id])})))};
}
export async function observeDonorBaseline(receipt,snapshot){
 if(!validDonorBaseline(receipt)||await hash(snapshot.state.global)!==receipt.globalSha256||await hash(snapshot.state.routes)!==receipt.routesSha256)return false;
 for(const row of receipt.profiles)if(!snapshot.state.profiles?.[row.id]||await hash(snapshot.state.profiles[row.id])!==row.sha256)return false;
 return true;
}

// Full restored ordinary history is kept canonically; donor history is a
// configured recent window. Imported active jobs become terminal history.
export async function restoredAutomationHistory(payload,receipt,epoch,at){
 const {remapAutomationHistory}=await import('../lib/backup-import.js');
 const normalized=(payload.automationHistory||[]).filter(j=>j&&!j.externalOwner).map((raw,i)=>{
  const job=structuredClone(raw);delete job._cancelled;delete job._deadline;
  job.sourceHistoryId=job.id||null;job.id='restored_'+epoch.slice(8)+'_'+i;
  if(['queued','preparing','running','stopping'].includes(job.state)){
   job.state='interrupted';job.finishedAt=new Date(at).toISOString();
   job.error='Imported historical job was active in the source backup';
  }
  return job;
 });
 return remapAutomationHistory(normalized,{workflow:receipt?.workflowMap||{},
 profileSource:Object.fromEntries((receipt?.sourcePersonas||[]).filter(p=>p.sourceId).map(p=>[p.sourceId,p.containerId]))});
}
export function canonicalWithAutomationHistory(snapshot,history,epoch){
 if(!history.length)return snapshot;
 const key='restore:automation-history:'+epoch;
 const value={key,source:'INSPECTED_PORTABLE_RESTORE',execution:'HISTORICAL_ONLY',jobs:history};
 const meta=[...snapshot.stores.meta.filter(r=>r.key!==key),{key,value}].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
 return {...snapshot,stores:{...snapshot.stores,meta}};
}
