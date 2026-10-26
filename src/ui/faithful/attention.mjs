// Contextual navigation and non-authorizing, revision-fenced acknowledgement.
const settings=new Set(['connections','backups','diagnostics','refresher']);
export function validIncidentTarget(t){return t&&typeof t==='object'&&!Array.isArray(t)&&
 Object.keys(t).length===2&&typeof t.id==='string'&&(
 t.kind==='ACCOUNT'&&/^[A-Za-z0-9_-]{8,100}$/.test(t.id)||
 t.kind==='GENERATOR'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(t.id)||
 t.kind==='OPERATION'&&/^[A-Za-z0-9_-]{8,100}$/.test(t.id)||
 t.kind==='SETTINGS'&&settings.has(t.id));}
export function incidentDestination(n,{targetState='CURRENT'}={}){
 if(targetState==='CURRENT'&&validIncidentTarget(n.target))return n.target;
 if(n.code==='BACKUP_FAILED'||n.code==='RESTORE_IN_PROGRESS')return {kind:'SETTINGS',id:'backups'};
 if(n.code==='GIT_RECONNECT_REQUIRED')return {kind:'SETTINGS',id:'connections'};
 if(n.code==='CANONICAL_UNAVAILABLE')return {kind:'SETTINGS',id:'diagnostics'};
 if(n.code==='PROVIDER_OUTAGE')return {kind:'SETTINGS',id:'refresher'};
 return {kind:'CONTEXT',id:n.code};
}
export async function acknowledgeIncident(n,request){
 const observe=async()=>{
  const page=await request('LIST_NOTICE_PAGE',{after:'',limit:100,query:n.scopeId});
  if(!page?.ok)return null;
  return page.items?.find(x=>x.scopeId===n.scopeId&&x.code===n.code)||null;
 };
 const fresh=await observe();
 if(!fresh)return {ok:false,code:'NOTICE_READBACK_UNAVAILABLE'};
 if(fresh.reviewed)return {ok:true,stillActionable:true,reviewed:true,observed:true};
 if(fresh.revision!==n.revision)return {ok:false,code:'STALE_REVISION'};
 let result;try{result=await request('ACK_NOTICE',{scopeId:fresh.scopeId,code:fresh.code,expectedRevision:fresh.revision})}catch{}
 if(result?.ok&&result.stillActionable===true)return result;
 const after=await observe();
 return after?.revision===fresh.revision&&after.reviewed===true?
  {ok:true,stillActionable:true,reviewed:true,observed:true}:{ok:false,code:result?.code||'NOTICE_ACK_UNKNOWN'};
}
