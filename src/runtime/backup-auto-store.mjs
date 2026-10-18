// I15 durable canonical-state transactions, separate from all browser effects.
import {AUTO_KEY,emptyAuto,validAuto,admission,RETRY} from './backup-auto-core.mjs';
const fail=code=>({ok:false,code});
export function createAutoStore(db,clock=Date.now){
  function edit(reduce){
    return new Promise((resolve,reject)=>{
      let tx,out=fail('BACKUP_TX_ABORTED');
      try{tx=db.transaction(['meta'],'readwrite');}
      catch{return reject(Error('BACKUP_IDB_UNAVAILABLE'));}
      tx.onabort=()=>reject(Error('BACKUP_TX_ABORTED'));
      tx.oncomplete=()=>resolve(out);
      tx.objectStore('meta').get(AUTO_KEY).onsuccess=e=>{
        const prior=e.target.result?.state||emptyAuto();
        if(!validAuto(prior)){out=fail('BACKUP_STATE_CORRUPT');return;}
        try{
          const result=reduce(structuredClone(prior));
          out=result?.response||fail('BACKUP_TRANSITION_FAILED');
          if(result?.state){
            result.state.revision=prior.revision+1;
            if(!validAuto(result.state)){tx.abort();return;}
            tx.objectStore('meta').put({key:AUTO_KEY,state:result.state});
          }
        }catch{tx.abort();}
      };
    });
  }
  const read=()=>edit(s=>({response:{ok:true,state:s}}));
  function claim(runId,now){
    return edit(s=>{
      const allowed=admission(s,now);
      if(!allowed.ok)return {response:allowed};
      if(!/^auto_[a-f0-9]{32}$/.test(runId))return {response:fail('BACKUP_INVALID_ID')};
      s.active={runId,day:allowed.day,startedAt:now,status:'PREPARING'};
      s.lastAttemptDay=allowed.day;s.status='PREPARING';s.code='PREPARING';
      return {state:s,response:{ok:true,day:allowed.day,catchUp:allowed.catchUp}};
    });
  }
  function move(runId,from,to,details={}){
    return edit(s=>{
      if(s.active?.runId!==runId||s.active.status!==from)
        return {response:fail('BACKUP_RUN_CHANGED')};
      const allowed={
        PREPARING:['VERIFIED','FAILED','SUSPENDED'],
        VERIFIED:['DISPATCH_POSSIBLE','FAILED'],
        DISPATCH_POSSIBLE:['DOWNLOAD_STARTED','HELD','COMPLETE'],
        DOWNLOAD_STARTED:['COMPLETE','HELD']
      };
      if(!allowed[from]?.includes(to))return {response:fail('BACKUP_TRANSITION_DENIED')};
      if(to==='COMPLETE'){
        const archive=details.archive;
        const qualifiedNative=from==='DISPATCH_POSSIBLE'&&
          archive?.kind==='AUTO_NATIVE'&&
          archive.runId===runId&&archive.nativeRunId==='s02_'+runId.slice(5)&&
          archive.state==='COMPLETE'&&archive.tier===3&&
          /^[a-f0-9]{64}$/.test(archive.sha256||'')&&
          /^[a-f0-9]{64}$/.test(archive.preparedSha256||'')&&
          Number.isSafeInteger(archive.bytes)&&archive.bytes>0&&
          archive.day===s.active.day;
        const qualifiedLegacy=from==='DOWNLOAD_STARTED'&&
          archive?.runId===runId&&archive.state==='COMPLETE'&&archive.tier===2;
        if(!qualifiedNative&&!qualifiedLegacy)
          return {response:fail('BACKUP_DOWNLOAD_UNVERIFIED')};
        s.archives.push(details.archive);
        s.lastSuccessDay=Math.max(s.lastSuccessDay,s.active.day);
        s.active=null;s.nextAttemptAt=0;s.status='COMPLETE';s.code=qualifiedNative?
          'NATIVE_READONLY_SOURCE_RECOVERY':'BROWSER_REPORTED_COMPLETE';
      }else if(to==='FAILED'||to==='SUSPENDED'){
        s.active=null;s.nextAttemptAt=clock()+RETRY;
        s.status=to;s.code=details.code||'BACKUP_INCOMPLETE';
      }else if(to==='HELD'){
        // Status deliberately stays possible until independent reconciliation.
        s.active.status='DISPATCH_POSSIBLE';
        s.status='HELD_UNCERTAIN';s.code=details.code||'DOWNLOAD_OUTCOME_UNKNOWN';
      }else{
        if(to==='DOWNLOAD_STARTED'&&!Number.isSafeInteger(details.downloadId))
          return {response:fail('DOWNLOAD_ID_INVALID')};
        s.active={...s.active,status:to,...(to==='VERIFIED'?{
          sha256:details.sha256,bytes:details.bytes}:{}),
          ...(to==='DOWNLOAD_STARTED'?{downloadId:details.downloadId}:{})};
        s.status=to;s.code=to;
      }
      return {state:s,response:{ok:true}};
    });
  }
  function enabled(value){
    return edit(s=>{
      if(typeof value!=='boolean')return {response:fail('INVALID_ENABLED')};
      s.enabled=value;
      if(!s.active){s.status=value?'SUSPENDED':'DISABLED';
        s.code=value?'SUSPENDED_KEY_UNAVAILABLE':'AUTO_OFF';}
      return {state:s,response:{ok:true,enabled:value}};
    });
  }
  return Object.freeze({edit,read,claim,move,enabled});
}
