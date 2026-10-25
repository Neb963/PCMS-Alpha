// A02 disposable cross-context restore staging. Never touches the canonical
// journal, donor identities, cookies, routes, Git or provider APIs. All rows
// are durable before a READY receipt; partial transfers are non-authorizing.
import {DB_STORES,validatePcmsSnapshot} from './backup-core.mjs';
import {auditSourceClosureRows} from './backup-source-closure.mjs';
import {readPortableArchive} from './portable-archive.mjs';
export const STAGE_DB='pcms-a02-portable-restore-stage';
const frameDigest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',new TextEncoder().encode(JSON.stringify(value)))),v=>
  v.toString(16).padStart(2,'0')).join('');
const goodId=x=>typeof x==='string'&&/^portable_[a-f0-9]{32}$/.test(x);
const requireValid=(value,code)=>{if(!value)throw Error(code)};
export function openRestoreStage(){
  return new Promise((resolve,reject)=>{
    let req;
    try{req=indexedDB.open(STAGE_DB,1);}
    catch{return reject(Error('PORTABLE_STAGE_UNAVAILABLE'));}
    req.onupgradeneeded=()=>{
      const db=req.result;
      db.createObjectStore('rows',{keyPath:['scope','group','position']});
      db.createObjectStore('sessions',{keyPath:'scope'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(Error('PORTABLE_STAGE_UNAVAILABLE'));
    req.onblocked=()=>reject(Error('PORTABLE_STAGE_BLOCKED'));
  });
}
function transaction(db,stores,mode,operation){
  return new Promise((resolve,reject)=>{
    let tx;
    try{tx=db.transaction(stores,mode);}
    catch{return reject(Error('PORTABLE_STAGE_UNAVAILABLE'));}
    let value;
    tx.oncomplete=()=>resolve(value);
    tx.onabort=()=>reject(Error('PORTABLE_STAGE_TRANSACTION_ABORTED'));
    try{value=operation(tx);}
    catch{try{tx.abort();}catch{}}
  });
}
async function putSession(db,scope,row){
  await transaction(db,['sessions'],'readwrite',tx=>
    tx.objectStore('sessions').put({...row,scope}));
}
async function getSession(db,scope){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['sessions'],'readonly');
    const get=tx.objectStore('sessions').get(scope);
    get.onsuccess=()=>resolve(get.result||null);
    get.onerror=()=>reject(Error('PORTABLE_STAGE_UNAVAILABLE'));
    tx.onabort=()=>reject(Error('PORTABLE_STAGE_UNAVAILABLE'));
  });
}
async function putRows(db,rows){
  if(!rows.length)return;
  await transaction(db,['rows'],'readwrite',tx=>{
    const store=tx.objectStore('rows');
    for(const row of rows)store.put(row);
  });
}
async function* streamRows(db,scope,group){
  requireValid(goodId(scope),'PORTABLE_STAGE_ID_INVALID');
  // Fetch one bounded page at a time so a 100k-row staging database is
  // inspected without materializing a second copy of the whole archive.
  let start=0;
  for(;;){
    const page=await new Promise((resolve,reject)=>{
      const rows=[],range=IDBKeyRange.bound([scope,group,start],[scope,group,Number.MAX_SAFE_INTEGER]);
      const tx=db.transaction(['rows'],'readonly');
      const req=tx.objectStore('rows').openCursor(range);
      req.onsuccess=()=>{
        const cursor=req.result;
        if(!cursor||rows.length>=64)return;
        rows.push(cursor.value);cursor.continue();
      };
      tx.oncomplete=()=>resolve(rows);
      tx.onabort=()=>reject(Error('PORTABLE_STAGE_READ_FAILED'));
    });
    if(!page.length)return;
    for(const row of page){
      requireValid(row.position===start,'PORTABLE_STAGE_ROW_GAP');
      requireValid(row.digest===await frameDigest(row.value),
        'PORTABLE_STAGE_ROW_DRIFT');
      yield row.value;start++;
    }
  }
}
export async function preparePortableStage(source,{db=openRestoreStage,
  scope='portable_'+crypto.randomUUID().replaceAll('-','')}={}){
  requireValid(goodId(scope),'PORTABLE_STAGE_ID_INVALID');
  const connection=await db();let buffer=[],rowCount=0,donorCount=0;
  try{
    requireValid(!(await getSession(connection,scope)),'PORTABLE_STAGE_REUSED');
    await putSession(connection,scope,{status:'PREPARING',startedAt:Date.now()});
    const flush=async()=>{const batch=buffer;buffer=[];await putRows(connection,batch)};
    const decoded=await readPortableArchive(source,{collect:false,
      onRecord:async({kind,store,record,value})=>{
        buffer.push({scope,group:kind==='donor'?'donor':store,
          position:record,value,digest:await frameDigest(value)});
        if(kind==='donor')donorCount++;else rowCount++;
        if(buffer.length>=32)await flush();
      },
      auditStaged:async()=>{
        await flush();
        return auditSourceClosureRows(streamRows(connection,scope,'meta'));
      }
    });
    requireValid(decoded.integrity==='FRAME_AND_SOURCE_VERIFIED'&&
      donorCount===1&&decoded.rows===rowCount,'PORTABLE_STAGE_INCOMPLETE');
    await putSession(connection,scope,{status:'READY',startedAt:Date.now(),
      rows:rowCount,frames:decoded.frames,chain:decoded.chain,
      sourceAudit:decoded.archiveSourceAudit});
    return {scope,status:'READY',rows:rowCount,frames:decoded.frames,
      sourceAudit:decoded.archiveSourceAudit,chain:decoded.chain};
  }catch(e){
    try{await putSession(connection,scope,{status:'HELD',
      code:/^PORTABLE_[A-Z0-9_]+$/.test(e?.message||'')?e.message:'PORTABLE_STAGE_FAILED'})}
    catch{}
    throw e;
  }finally{connection.close();}
}
export async function readPortableStage(scope,{db=openRestoreStage}={}){
  requireValid(goodId(scope),'PORTABLE_STAGE_ID_INVALID');
  const connection=await db();
  try{
    const receipt=await getSession(connection,scope);
    requireValid(receipt?.status==='READY','PORTABLE_STAGE_NOT_READY');
    const canonical={schema:1,stores:Object.fromEntries(DB_STORES.map(s=>[s,[]]))};
    for(const store of DB_STORES){
      for await(const item of streamRows(connection,scope,store))
        canonical.stores[store].push(item);
    }
    validatePcmsSnapshot(canonical);
    let donor=null;
    for await(const item of streamRows(connection,scope,'donor')){
      requireValid(donor===null,'PORTABLE_STAGE_DUPLICATE_DONOR');
      donor=item;
    }
    requireValid(donor!==null,'PORTABLE_STAGE_DONOR_MISSING');
    const sourceAudit=await auditSourceClosureRows(canonical.stores.meta);
    requireValid(JSON.stringify(sourceAudit)===JSON.stringify(receipt.sourceAudit),
      'PORTABLE_STAGE_SOURCE_DRIFT');
    const count=DB_STORES.reduce((n,s)=>n+canonical.stores[s].length,0);
    requireValid(count===receipt.rows,'PORTABLE_STAGE_COUNT_CHANGED');
    return {scope,receipt,canonical,donor,
      sourceVerified:true,activation:'OFF'};
  }finally{connection.close();}
}

// Dispose only a caller-owned inspection stage, never the canonical journal.
export async function discardPortableStage(scope,{db=openRestoreStage}={}){
 requireValid(goodId(scope),'PORTABLE_STAGE_ID_INVALID');
 const connection=await db();
 try{
  await new Promise((resolve,reject)=>{
   const tx=connection.transaction(['rows','sessions'],'readwrite');
   tx.oncomplete=resolve;tx.onabort=()=>reject(Error('PORTABLE_STAGE_DELETE_FAILED'));
   tx.objectStore('sessions').delete(scope);
   const range=IDBKeyRange.bound([scope,'',0],[scope,'\uffff',Number.MAX_SAFE_INTEGER]);
   tx.objectStore('rows').openCursor(range).onsuccess=e=>{const row=e.target.result;if(row){row.delete();row.continue()}};
  });
 }finally{connection.close()}
}
