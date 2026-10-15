// Local source-transform consent/review, separate from release approval.
// All writes resolve only on IDB commit. No IO in transactions.
import {fail} from './journal.mjs';
import {MARKER_POLICY} from './refresh-marker.mjs';
const key=slug=>'refresh-source:'+slug;
export function createRefreshSourceStore(db){
  function tx(mode,work){return new Promise((resolve,reject)=>{
    let result=fail('REFRESH_SOURCE_TRANSACTION_INCOMPLETE'),t;
    try{t=db.transaction(mode==='readonly'?['meta']:['meta','events'],mode);}
    catch{return reject(Error('REFRESH_SOURCE_DB_UNAVAILABLE'));}
    t.oncomplete=()=>resolve(result);t.onabort=()=>reject(Error('REFRESH_SOURCE_DB_ABORTED'));t.onerror=()=>{};
    try{work(t,x=>{result=x;});}catch{t.abort();}
  });}
  const readKey=k=>tx('readonly',(t,done)=>{
    t.objectStore('meta').get(k).onsuccess=e=>done({ok:true,record:e.target.result?.record||null});
  });
  const read=slug=>readKey(key(slug));
  const putKey=(k,expectedRevision,record)=>tx('readwrite',(t,done)=>{
    const m=t.objectStore('meta');m.get(k).onsuccess=e=>{
      if((e.target.result?.record?.revision||0)!==expectedRevision){done(fail('STALE_REFRESH_SOURCE'));return;}
      const next={...record,revision:expectedRevision+1};m.put({key:k,record:next});
      t.objectStore('events').add({stage:'REFRESH_SOURCE_REVIEW',operationId:record.preview?.plan?.operationId||null,
        policy:MARKER_POLICY,revision:next.revision});done({ok:true,record:next});
    };
  });
  const put=(slug,expectedRevision,record)=>tx('readwrite',(t,done)=>{
    const m=t.objectStore('meta'),values={},keys=['account:'+record.accountId,'inventory:'+slug,'release:'+slug,key(slug)];
    let remaining=keys.length;
    for(const k of keys)m.get(k).onsuccess=e=>{
      values[k]=e.target.result;if(--remaining)return;
      const a=values[keys[0]]?.account,g=values[keys[1]]?.generator,r=values[keys[2]]?.release,old=values[keys[3]]?.record;
      if((old?.revision||0)!==expectedRevision){done(fail('STALE_REFRESH_SOURCE'));return;}
      if(a?.state!=='VERIFIED'||a.personaUid!==record.personaUid||a.bindingVersion!==record.bindingVersion||
        a.identity?.principalFingerprint!==record.principalFingerprint||a.identity?.source!=='GUARDED_SESSION_READBACK'||
        a.identity.bindingVersion!==a.bindingVersion||g?.accountId!==record.accountId||g.personaUid!==a.personaUid||
        g.bindingVersion!==a.bindingVersion||g.remoteId!==record.remoteId||g.ownerState!=='OBSERVED_OWNER'||
        g.visibility!=='PUBLIC'||r?.state!=='CONFIRMED_PUBLIC'||r.sourceFingerprint!==record.approvedBaseFingerprint||
        r.remoteId!==record.remoteId||r.principalFingerprint!==record.principalFingerprint){
        done(fail('REFRESH_SOURCE_CONTEXT_CHANGED'));return;
      }
      const next={...record,revision:expectedRevision+1};m.put({key:key(slug),record:next});
      t.objectStore('events').add({stage:'REFRESH_SOURCE_'+(record.state||'REVIEW'),slug,
        operationId:record.preview?.plan?.operationId||null,revision:next.revision});
      done({ok:true,record:next});
    };
  });
  return Object.freeze({read,put,readKey,putKey});
}
