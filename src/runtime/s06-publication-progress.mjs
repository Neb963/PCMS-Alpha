import {createScopeObservation} from './scope-observation.mjs';
// Continue persisted human approvals through the existing READY alarm.
// One step per wake; a possible effect is reconciled and never replayed.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {createReleaseStore} from './release-store.mjs';
import {createReleaseBoundary} from './release-boundary.mjs';
const active=['APPROVED','DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN','RECOVERY_HOLD'];
export function createS06PublicationProgress(api,{open=openCanonicalDatabase,effectGate=()=>false,
 makeRelease=()=>createReleaseBoundary(api,{open,effectGate}),observationMs=10000}={}){
 const sentinel=createRestoreSentinel(api.storage.local);
 const scopes=createScopeObservation(api,'publication',{observationMs});let connection,busy=false,boundary;
 const db=()=>connection||=open();
 async function tick(){if(busy)return {ok:false,code:'S06_PUBLICATION_BUSY'};busy=true;
  try{
   if((await sentinel.inspect()).held)return {ok:false,code:'RESTORE_HOLD'};
   const store=createReleaseStore(await db()),key='pcmsS06PublicationCursor';
   let after=(await api.storage.local.get(key))?.[key]||'';
   if(typeof after!=='string'||!/^(?:[a-z0-9][a-z0-9-]{0,99})?$/.test(after))after='';
   let wrapped=false;
   for(let examined=0;examined<120;examined++){
    const page=await store.list({after,limit:1,states:active});
    if(!page.ok)return page;
    if(!page.items.length&&after&&!wrapped){after='';wrapped=true;continue;}
    const row=page.items[0];if(!row)return {ok:true,code:'S06_NO_APPROVED_PUBLICATION'};
    after=row.slug;
    // Cursor is only fairness. Canonical approval/possible-dispatch journals
    // remain the sole publication authority, including after lost responses.
    await api.storage.local.set({[key]:row.slug});
    const keys=['generator:'+row.slug];if(scopes.busy(keys))continue;
    return await scopes.run(keys,async()=>{
     if((await sentinel.inspect()).held)return {ok:false,code:'RESTORE_HOLD'};
     boundary||=makeRelease();const type=row.state==='APPROVED'?'DISPATCH':'RECONCILE';
     const outcome=await boundary.runTrusted({type,params:{slug:row.slug,expectedRevision:row.revision}});
     if(type==='DISPATCH'&&outcome?.ok===false&&/^[A-Z0-9_]{1,90}$/.test(outcome.code||''))
      await store.recordProgress(row.slug,row.revision,outcome.code);
     return {...outcome,slug:row.slug,progressAction:type,
      checkpointAdvanced:outcome?.ok===true&&(outcome?.record?.revision||outcome?.revision||0)>row.revision};
    },{progressed:r=>r?.checkpointAdvanced===true});
   }
   return {ok:true,code:'S06_PUBLICATION_SCOPES_PENDING'};
  }catch{return {ok:false,code:'S06_PUBLICATION_PROGRESS_UNAVAILABLE'}}finally{busy=false}
 }
 return Object.freeze({tick});
}
