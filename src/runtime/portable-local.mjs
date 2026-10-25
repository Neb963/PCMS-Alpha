import {PRESENTATION_KEY,normalizePresentation} from './presentation-preferences.mjs';
// Archive-only, nonsecret local settings and recovery history. No live mirror,
// credential, standing grant, runtime witness or restore marker is portable.
import {serializeClone,deserializeClone} from './backup-core.mjs';
export const PORTABLE_LOCAL_META='backup:portable-local-settings';
const exact=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const deny=code=>{throw Error(code)};
const fields=(value,names)=>{
 const out={};if(!value||typeof value!=='object'||Array.isArray(value))return out;
 for(const key of names)if(Object.hasOwn(value,key)){
  const v=value[key];if(v===null||['string','number','boolean'].includes(typeof v))out[key]=v;
 }
 return out;
};
const configFields=['accountId','personaUid','repositoryId','namespace','requiresRevalidation'];
const renameFields=['schema','repositoryId','oldSlug','newSlug','oldTreeOid','newTreeOid','folderTreeOid','markerOid','evidenceHead','reason','state','revision','automaticRenameApproved','sourceReviewAt','ownerChoiceSource','sourceFingerprint','visibility','remoteId','personaUid','accountId','bindingVersion','principalFingerprint','baselineKey','preparedAt','dispatchAt','operationId','lastPreInvocationHold','providerAcknowledged','verifiedAt','readbackFingerprint','associationFingerprint','finalizedAt','restoredHistorical'];
const eventFields=['stage','outcome','code','at','tier','proof','provenance','note'];
const runFields=['version','runId','slug','intentId','stage','status','startedAt','updatedAt','created','remoteArtifactsPreserved','remoteVisibility','remoteObservedAt','cleanup','restoredHistorical'];
const codeFields=['stage','code'];
function diagnostic(value){
 const out=fields(value,runFields);
 if(value?.config)out.config=fields(value.config,configFields);
 if(value?.build)out.build=fields(value.build,['version','extensionId','proof']);
 if(value?.firstFailure)out.firstFailure=fields(value.firstFailure,codeFields);
 if(value?.currentHold)out.currentHold=fields(value.currentHold,codeFields);
 if(Array.isArray(value?.events))out.events=value.events.map(r=>fields(r,eventFields));
 if(Array.isArray(value?.eventHistory))out.eventHistory=value.eventHistory.map(r=>fields(r,eventFields));
 return out;
}
function independent(value){
 const out=fields(value,['schema','checkedAt','mode','restoredHistorical']);
 if(Array.isArray(value?.rows))out.rows=value.rows.map(r=>fields(r,['id','outcome','code','tier','proof']));
 if(Array.isArray(value?.limitations))out.limitations=value.limitations.filter(x=>typeof x==='string');
 return out;
}
export function collectPortableLocal(local={}){
 const out={};
 for(const key of Object.keys(local).sort()){
  const value=local[key];
  if(key==='pcmsS03Git'){
   if(typeof value?.repository==='string'&&/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(value.repository)&&/^[1-9][0-9]{0,19}$/.test(value.repositoryId||''))
    out[key]={repository:value.repository,repositoryId:value.repositoryId};
  }else if(key===PRESENTATION_KEY){out[key]=normalizePresentation(value);
  }else if(/^personaMullvadPendingPrepare:[a-zA-Z0-9_-]{1,100}$/.test(key)&&value&&[1,2].includes(value.schema)){
   // Native credentials are machine-local and short lived. Preserve the
   // unresolved effect metadata, never its authentication secret.
   out[key]=fields(value,['schema','phase','operation','nonce','routeId','relayIp','relayPort','createdAtMs']);
  }else if(key==='pcmsUiGeneratorSelectionV1'){
   out[key]={schema:1,items:(value?.items||[]).map(r=>fields(r,['slug','accountId','revision']))};
  }else if(key==='pcmsR4FolderIdentityReviews'&&Array.isArray(value))out[key]=value.map(r=>fields(r,renameFields));
  else if(key==='pcmsR4MissingGitFolders'&&value&&typeof value.repositoryId==='string'&&Array.isArray(value.slugs))
   out[key]={repositoryId:value.repositoryId,slugs:value.slugs.filter(x=>typeof x==='string')};
  else if(/^pcmsR4ExistingRename(?:Attempt|History):[a-z0-9][a-z0-9-]{0,99}(?::[a-zA-Z0-9:_-]{1,200})?$/.test(key))
   out[key]=value===null?null:fields(value,renameFields);
  else if(key==='pcmsS08DisposableScope')out[key]=fields(value,configFields);
  else if(key==='pcmsS08DiagnosticRun')out[key]=diagnostic(value);
  else if(key==='pcmsS08DiagnosticHistory'&&Array.isArray(value))out[key]=value.map(diagnostic);
  else if(key==='pcmsS08IndependentReadOnly')out[key]=independent(value);
 }
 return out;
}
export function archiveWithPortableLocal(pcms,local){
 if(pcms.stores.meta.some(r=>r.key===PORTABLE_LOCAL_META))deny('PORTABLE_LOCAL_RESERVED_KEY');
 const values=collectPortableLocal(local);
 if(!Object.keys(values).length)return pcms;
 const value={key:PORTABLE_LOCAL_META,schema:1,values};
 const meta=[...pcms.stores.meta,{key:PORTABLE_LOCAL_META,value:serializeClone(value)}]
  .sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
 return {...pcms,stores:{...pcms.stores,meta}};
}
export function splitPortableLocal(pcms){
 const rows=pcms.stores.meta.filter(r=>r.key===PORTABLE_LOCAL_META);
 if(rows.length>1)deny('PORTABLE_LOCAL_SCHEMA_INVALID');
 let values=null;
 if(rows.length){
  const row=deserializeClone(rows[0].value);
  if(row?.key!==PORTABLE_LOCAL_META||row.schema!==1||!row.values||
    typeof row.values!=='object'||Array.isArray(row.values)||
    Object.keys(row).some(k=>!['key','schema','values'].includes(k))||
    !exact(collectPortableLocal(row.values),row.values))deny('PORTABLE_LOCAL_SCHEMA_INVALID');
  values=row.values;
 }
 return {values,pcms:{...pcms,stores:{...pcms.stores,meta:pcms.stores.meta.filter(r=>r.key!==PORTABLE_LOCAL_META)}}};
}
const uncertain=v=>['DISPATCH_POSSIBLE','OUTCOME_UNCERTAIN','REMOTE_RENAME_VERIFIED_LINK_PENDING'].includes(v?.state);
export function preparePortableLocalRestore(incoming,current,{mode='merge',uidRemap={}}={}){
 if(incoming===null)return {};
 const source=collectPortableLocal(incoming),destination=collectPortableLocal(current),patch={};
 for(const [key,raw] of Object.entries(source)){
  if(key.startsWith('personaMullvadPendingPrepare:')&&Object.hasOwn(current,key))continue;
  if(mode==='merge'&&Object.hasOwn(destination,key)&&!exact(destination[key],raw))
   deny('RESTORE_LOCAL_SETTINGS_CONFLICT');
  if(key.startsWith('pcmsR4ExistingRenameAttempt:')&&uncertain(destination[key])&&!exact(destination[key],raw))
   deny('RESTORE_LOCAL_RENAME_UNCERTAIN');
  let value=structuredClone(raw);
  if(key.startsWith('personaMullvadPendingPrepare:'))value.phase='RESTORED_UNCONFIRMED';
  if(key==='pcmsR4FolderIdentityReviews')value=value.map(r=>({...r,
   automaticRenameApproved:false,state:r.state==='RENAME_EXISTING_COMPLETED'?r.state:'REVIEW_REQUIRED',
   revision:(Number.isSafeInteger(r.revision)?r.revision:0)+1}));
  else if(key.startsWith('pcmsR4ExistingRename')&&value){
   delete value.ownerChoiceSource;value.restoredHistorical=true;
   if(value.state==='DISPATCH_POSSIBLE')value.state='OUTCOME_UNCERTAIN';
  }else if(key==='pcmsS08DisposableScope'&&value){
   value.personaUid=uidRemap[value.personaUid]||value.personaUid;value.requiresRevalidation=true;
  }else if(key==='pcmsS08DiagnosticRun'&&value){
   value.restoredHistorical=true;value.status='HELD';
   value.currentHold={stage:value.stage||'SCOPE',code:'RESTORED_DIAGNOSTIC_REQUIRES_SCOPE_REVALIDATION'};
  }else if(key==='pcmsS08IndependentReadOnly'&&value)value.restoredHistorical=true;
  patch[key]=value;
 }
 // Existing possible-effect WAL is retained even when absent from the archive.
 // The local apply operation writes only these allowlisted keys, never clears
 // unrelated destination recovery records, credentials or grants.
 return patch;
}
