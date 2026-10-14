// I15 tracked automatic Downloads deletion; never traverse by pathname.
import {selectRetention,deletionProof} from './backup-auto-core.mjs';
const fail=code=>({ok:false,code});
export async function observeItem(downloads,id){
  try{
    const records=await downloads.search({id});
    return records?.length===1&&records[0]?.id===id?records[0]:null;
  }catch{return null;}
}
export function makeRetention(store,downloads){
  async function mark(runId,status){
    return store.edit(s=>{
      const row=s.archives.find(r=>r.runId===runId);
      if(!row||row.state!=='DELETION_POSSIBLE')return {response:fail('DELETE_STATE_CHANGED')};
      row.state=status;
      if(status==='DELETE_HELD')s.code='RETENTION_INCOMPLETE';
      return {state:s,response:{ok:true}};
    });
  }
  async function recover(){
    const state=await store.read();
    if(!state.ok)return state;
    for(const entry of state.state.archives.filter(x=>x.state==='DELETION_POSSIBLE')){
      const row=await observeItem(downloads,entry.downloadId);
      // A prior removeFile may have completed. Never issue removeFile again.
      await mark(entry.runId,row?.id===entry.downloadId&&row.exists===false?
        'REMOVED':'DELETE_HELD');
    }
    return {ok:true};
  }
  async function prune(){
    for(let i=0;i<50;i++){
      const result=await store.edit(s=>{
        const oldest=selectRetention(s.archives)[0];
        if(!oldest)return {response:{ok:true,done:true}};
        const entry=s.archives.find(x=>x.runId===oldest.runId);
        if(!entry||entry.state!=='COMPLETE')return {response:fail('DELETE_STATE_CHANGED')};
        entry.state='DELETION_POSSIBLE';
        return {state:s,response:{ok:true,entry:{...entry}}};
      });
      if(!result.ok||result.done)return result;
      const entry=result.entry;
      const row=await observeItem(downloads,entry.downloadId);
      if(!deletionProof(entry,row).ok){
        await mark(entry.runId,row?.id===entry.downloadId&&row.exists===false?
          'REMOVED':'DELETE_HELD');
        return fail('RETENTION_INCOMPLETE');
      }
      try{await downloads.removeFile(entry.downloadId);}
      catch{
        // Lost ACK might mean the file is gone; do not call removeFile twice.
        const after=await observeItem(downloads,entry.downloadId);
        await mark(entry.runId,after?.id===entry.downloadId&&after.exists===false?
          'REMOVED':'DELETE_HELD');
        return fail('RETENTION_INCOMPLETE');
      }
      const after=await observeItem(downloads,entry.downloadId);
      if(after?.id===entry.downloadId&&after.exists===false)
        await mark(entry.runId,'REMOVED');
      else{
        await mark(entry.runId,'DELETE_HELD');
        return fail('RETENTION_INCOMPLETE');
      }
      // Intentionally do not erase history: it is evidence after crashes.
    }
    return fail('RETENTION_BOUNDED');
  }
  return Object.freeze({prune,recover});
}
