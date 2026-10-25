// Operator notes and report history are ordinary canonical backup data.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
export function createOperatorRecords({open=openCanonicalDatabase,storage=globalThis.browser?.storage.local,admitted=false}={}){
 const valid=key=>typeof key==='string'&&/^ui:(?:operator-checklist|diagnostic-report):[A-Za-z0-9_-]{1,100}$/.test(key);
 async function get(key){
  if(!valid(key))throw Error('OPERATOR_RECORD_KEY_INVALID');
  const db=await open();
  try{return await new Promise((resolve,reject)=>{let value;const tx=db.transaction('meta','readonly'),q=tx.objectStore('meta').get(key);q.onsuccess=()=>{value=q.result||null};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(Error('OPERATOR_RECORD_READ_FAILED'))})}
  finally{db.close()}
 }
 async function put(key,record,{expectedRevision=null,mirror=null}={}){
  if(!valid(key))throw Error('OPERATOR_RECORD_KEY_INVALID');
  if(!admitted&&globalThis.browser?.runtime?.connect)return new Promise((resolve,reject)=>{
   const port=browser.runtime.connect({name:'pcms-operator-records'});let done=false;
   const timer=setTimeout(()=>finish(null,Error('OPERATOR_RECORD_WRITE_UNKNOWN')),30000);
   function finish(out,error){if(done)return;done=true;clearTimeout(timer);try{port.disconnect()}catch{};error?reject(error):resolve(out)}
   port.onMessage.addListener(out=>out?.code==='RESTORE_HOLD'?finish(null,Error('OPERATOR_RECORD_RESTORE_HOLD')):finish(out));
   port.onDisconnect.addListener(()=>finish(null,Error('OPERATOR_RECORD_WRITE_UNKNOWN')));
   port.postMessage({key,record,expectedRevision,mirror});
  });
  if(![null,'RUN','ARCHIVE_RUN','CONFIG','INDEPENDENT'].includes(mirror)||
    mirror==='RUN'&&(!record.run||key!=='ui:diagnostic-report:'+record.run.runId)||
    mirror==='ARCHIVE_RUN'&&(!record.run?.restoredHistorical||key!=='ui:diagnostic-report:'+record.run.runId)||
    mirror==='CONFIG'&&(key!=='ui:diagnostic-report:configuration'||!record.configuration)||
    mirror==='INDEPENDENT'&&(key!=='ui:diagnostic-report:independent_'+record.independent?.checkedAt||!record.independent))
   throw Error('OPERATOR_RECORD_MIRROR_INVALID');
  if(!storage||(await createRestoreSentinel(storage).inspect()).held)throw Error('OPERATOR_RECORD_RESTORE_HOLD');
  const db=await open();
  try{const written=await new Promise((resolve,reject)=>{
   let result;const tx=db.transaction('meta','readwrite'),store=tx.objectStore('meta');
   tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(Error('OPERATOR_RECORD_WRITE_FAILED'));
   store.get(key).onsuccess=e=>{const before=e.target.result?.revision||0;
    if(expectedRevision!==null&&before!==expectedRevision){result={ok:false,code:'STALE_REVISION'};return}
    const row={key,revision:before+1,record:structuredClone(record)};store.put(row);result={ok:true,row};
   };
  });
   if(written.ok){
    if(mirror==='RUN')await storage.set({pcmsS08DiagnosticRun:record.run});
    if(mirror==='ARCHIVE_RUN')await storage.remove('pcmsS08DiagnosticRun');
    if(mirror==='CONFIG')await storage.set({pcmsS08DisposableScope:record.configuration});
    if(mirror==='INDEPENDENT')await storage.set({pcmsS08IndependentReadOnly:record.independent});
   }
   return written;
  }finally{db.close()}
 }
 async function list(prefix){
  if(!['ui:operator-checklist:','ui:diagnostic-report:'].includes(prefix))throw Error('OPERATOR_RECORD_KEY_INVALID');
  const db=await open();
  try{return await new Promise((resolve,reject)=>{
   const rows=[],tx=db.transaction('meta','readonly'),q=tx.objectStore('meta').openCursor(IDBKeyRange.bound(prefix,prefix+'\uffff'));
   tx.oncomplete=()=>resolve(rows);tx.onabort=()=>reject(Error('OPERATOR_RECORD_READ_FAILED'));
   q.onsuccess=e=>{const row=e.target.result;if(row){rows.push(row.value);row.continue()}};
  })}finally{db.close()}
 }
 return Object.freeze({get,put,list});
}
export function downloadOperatorFile(name,text,type='text/markdown'){
 const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
