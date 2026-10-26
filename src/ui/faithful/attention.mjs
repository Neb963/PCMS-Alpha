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

// Fresh observations are navigation context, never effect or ownership authority.
// An opaque incident scope is never converted into an account/slug/operation ID.
export async function readIncidentContext(snapshot,{getNotice,getAccount,getGenerator,getOperation}={}){
 const safe={ok:false,notice:snapshot,targetState:'UNAVAILABLE',
  destination:validIncidentTarget(snapshot?.target)&&snapshot.target.kind==='SETTINGS'?
   snapshot.target:incidentDestination({...snapshot,target:undefined},{targetState:'ABSENT'}),
  providerEffects:'NONE'};
 let response;try{response=await getNotice({scopeId:snapshot.scopeId,code:snapshot.code});}catch{return safe;}
 const n=response?.notice;
 if(response?.ok!==true||!n||n.scopeId!==snapshot.scopeId||n.code!==snapshot.code||
   !Number.isSafeInteger(n.revision)||n.revision<1)return safe;
 const result={ok:true,notice:n,targetState:'ABSENT',
  destination:incidentDestination({...n,target:undefined},{targetState:'ABSENT'}),providerEffects:'NONE'};
 if(!validIncidentTarget(n.target))return result;
 const target=n.target;
 if(target.kind==='SETTINGS')return {...result,targetState:'CURRENT',destination:target};
 let observed;
 try{observed=await (target.kind==='ACCOUNT'?getAccount(target.id):
  target.kind==='GENERATOR'?getGenerator(target.id,n.code):getOperation(target.id));}
 catch{return {...result,targetState:'UNAVAILABLE'};}
 const entity=target.kind==='ACCOUNT'?observed?.account:
  target.kind==='GENERATOR'?observed?.generator:observed?.context;
 const identity=target.kind==='ACCOUNT'?entity?.accountId:
  target.kind==='GENERATOR'?entity?.slug:entity?.operationId;
 if(observed?.ok===true&&identity===target.id&&
   Number.isSafeInteger(entity?.revision)&&entity.revision>0)
  return {...result,targetState:'CURRENT',destination:target,entity};
 return {...result,targetState:observed?.ok===false&&
  /UNAVAILABLE|HOLD|BUSY|TIMEOUT/.test(observed.code||'')?'UNAVAILABLE':'STALE'};
}
