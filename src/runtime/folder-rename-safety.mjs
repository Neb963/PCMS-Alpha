// Existing source actors remain authoritative. A rename may not move their
// identity while a write/helper or uncertain effect still owns that source.
import {openCanonicalDatabase} from './journal.mjs';
export function inspectCanonicalRenameSafety(db,slug){
 return new Promise((resolve,reject)=>{const tx=db.transaction(['meta','operations'],'readonly'),ids=new Set([slug]),operations=[];let hold=null;
  tx.oncomplete=()=>resolve(hold?{ok:false,code:hold}:{ok:true});tx.onabort=()=>reject(Error('SOURCE_ACTIVITY_UNAVAILABLE'));
  tx.objectStore('meta').openCursor().onsuccess=e=>{const c=e.target.result;if(!c)return
   const value=c.value,key=String(c.key),r=value?.record||value?.job||value?.release;
   if(r?.slug===slug){for(const id of [r.intentId,r.targetId,r.releaseId,r.stableId])if(id)ids.add(id);
    if(key.startsWith('stage:')&&!['SOURCE_VERIFIED'].includes(r.state))hold='RENAME_SOURCE_WORKFLOW_ACTIVE';
    if(key.startsWith('ai-job:')&&(r.state==='HUMAN_OWNED'||r.state==='HELD_RECONCILE'||['DISPATCH_POSSIBLE','RUNNING_OBSERVED','STOP_DISPATCH_POSSIBLE'].includes(r.native?.state)||!['TESTS_VERIFIED','COMPLETE'].includes(r.state)))hold='RENAME_SOURCE_WORKFLOW_ACTIVE';
    if(key.startsWith('existing-update:')&&!['STAGE_CONFIRMED','RESTORE_CONFIRMED','PUBLISHED_CONFIRMED','COMPLETE'].includes(r.state))hold='RENAME_SOURCE_WORKFLOW_ACTIVE';
    if(key.startsWith('release:')&&['APPROVED','DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN','PUBLISHING','PUBLISH_UNCERTAIN','RECOVERY_HOLD'].includes(r.state))hold='RENAME_SOURCE_WORKFLOW_ACTIVE';
   }
   const refresh=value?.state?.rows?.find(row=>row.slug===slug);
   if(refresh){ids.add(refresh.stableId);if(refresh.refresh?.intent&&!['CONFIRMED','ABORTED','REJECTED'].includes(refresh.refresh.intent.state))hold='RENAME_SOURCE_WORKFLOW_ACTIVE';}
   c.continue();
  };
  tx.objectStore('operations').openCursor().onsuccess=e=>{const c=e.target.result;if(c){operations.push(c.value);c.continue()}};
  // Cursor completion and tx completion are separate. Inspect correlations
  // after both cursors finished, before the result is published.
  const complete=tx.oncomplete;tx.oncomplete=()=>{if(operations.some(o=>ids.has(o.targetId)&&!['CONFIRMED','ABORTED','REJECTED'].includes(o.status)))hold='RENAME_SOURCE_EFFECT_UNCERTAIN';complete()};
 });
}
export async function defaultRenameSafety(slug){try{return await inspectCanonicalRenameSafety(await openCanonicalDatabase(),slug)}catch{return {ok:false,code:'RENAME_SOURCE_ACTIVITY_UNAVAILABLE'}}}
