// I15 browser metadata is tier 2, never independent disk-byte proof.
import {archiveFromDownload} from './backup-auto-core.mjs';
import {observeItem} from './backup-auto-retention.mjs';
export async function inspectAuto(downloads,{runId,day,sha256,bytes,id}){
  const row=await observeItem(downloads,id);
  if(!row||!row.filename?.includes(runId))return null;
  return archiveFromDownload(runId,day,sha256,bytes,row);
}
export async function awaitAuto(downloads,receipt,timeoutMs=120000){
  return new Promise(resolve=>{
    let settled=false;
    const done=value=>{
      if(settled)return;settled=true;clearTimeout(timer);
      try{downloads.onChanged.removeListener(changed);}catch{}
      resolve(value);
    };
    const inspect=async()=>{
      const proof=await inspectAuto(downloads,receipt);
      if(proof)return done(proof);
      const item=await observeItem(downloads,receipt.id);
      if(item?.state==='interrupted')done(null);
    };
    const changed=e=>{
      if(e?.id!==receipt.id)return;
      if(e.state?.current==='interrupted')done(null);
      else if(e.state?.current==='complete')void inspect();
    };
    const timer=setTimeout(()=>done(null),timeoutMs);
    try{downloads.onChanged.addListener(changed);}
    catch{return done(null);}
    void inspect();
  });
}
