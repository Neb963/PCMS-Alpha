// S02 source recovery: strict recovery preflight, separate from legacy v1 archive compatibility.
import {auditSourceClosure} from './backup-source-closure.mjs';
// I08: offline-verifiable, always-encrypted integrated PCMS + donor portable archive.
// No persistence, provider calls, filesystem reads, imports or activation authority.
export const FORMAT='pcms-alpha-integrated-backup';
export const VERSION=1;
export const DB_STORES=Object.freeze(['entities','operations','events','meta','observations']);
export const MAX_ARCHIVE_BYTES=64*1024*1024;
const codec=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
const token='__pcmsType';
const requireValid=(ok,code)=>{if(!ok)throw Error(code);};
// IndexedDB/Firefox WebDriver may cross JS compartments. Recognize ordinary
// objects by a direct root prototype while still rejecting class instances.
const plain=o=>{
  if(o===null||typeof o!=='object')return false;
  const p=Object.getPrototypeOf(o);
  return p===null||p===Object.prototype||
    (Object.prototype.toString.call(o)==='[object Object]'&&
      p!==null&&Object.getPrototypeOf(p)===null);
};
function base64(bytes){
  let out='';
  for(let i=0;i<bytes.length;i+=0x4000)out+=String.fromCharCode(...bytes.subarray(i,i+0x4000));
  return btoa(out);
}
function unbase64(value,max){
  requireValid(typeof value==='string' && value.length<=Math.ceil(max/3)*4+8 && /^[A-Za-z0-9+/]*={0,2}$/.test(value),'BACKUP_BINARY_INVALID');
  const raw=atob(value),data=new Uint8Array(raw.length);
  requireValid(data.length<=max,'BACKUP_TOO_LARGE');
  for(let i=0;i<raw.length;i++)data[i]=raw.charCodeAt(i);
  return data;
}
export async function digest(bytes){
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes instanceof Uint8Array?bytes:codec.encode(bytes)))).map(v=>v.toString(16).padStart(2,'0')).join('');
}
export function serializeClone(value,depth=0){
  requireValid(depth<=35,'BACKUP_DEPTH_LIMIT');
  // IndexedDB structured-clone records can legitimately retain undefined.
  // JSON.stringify would otherwise silently drop these fields.
  if(value===undefined)return {[token]:'Undefined'};
  if(value===null||typeof value==='string'||typeof value==='boolean')return value;
  if(typeof value==='number'){requireValid(Number.isFinite(value),'BACKUP_UNSUPPORTED_VALUE');return value;}
  if(value instanceof Date){requireValid(Number.isFinite(value.getTime()),'BACKUP_UNSUPPORTED_VALUE');return {[token]:'Date',data:value.toISOString()};}
  if(value instanceof ArrayBuffer || ArrayBuffer.isView(value)){
    const bytes=value instanceof ArrayBuffer?new Uint8Array(value):
      new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
    requireValid(bytes.byteLength<=MAX_ARCHIVE_BYTES,'BACKUP_TOO_LARGE');
    return {[token]:'Bytes',data:base64(bytes),
      kind:value instanceof ArrayBuffer?'ArrayBuffer':value.constructor.name};
  }
  if(Array.isArray(value))return value.map(v=>serializeClone(v,depth+1));
  if(!plain(value)){
    // Fixed type taxonomy only: never export source values or arbitrary keys.
    const kind=({'[object Map]':'MAP','[object Set]':'SET',
      '[object Blob]':'BLOB','[object File]':'FILE',
      '[object RegExp]':'REGEXP','[object Object]':'OBJECT',
      '[object BigInt]':'BIGINT'})[Object.prototype.toString.call(value)]||'OTHER';
    throw Error('BACKUP_UNSUPPORTED_VALUE_'+kind);
  }
  requireValid(Object.keys(value).length<=100000,'BACKUP_TOO_LARGE');
  const out=Object.create(null);
  for(const key of Object.keys(value)){
    requireValid(key!=='__proto__'&&key!=='constructor'&&key!=='prototype','BACKUP_UNSAFE_KEY');
    out[key]=serializeClone(value[key],depth+1);
  }
  return out;
}
export function deserializeClone(value,depth=0){
  requireValid(depth<=35,'BACKUP_DEPTH_LIMIT');
  if(value===null||typeof value==='string'||typeof value==='boolean'||typeof value==='number')return value;
  if(Array.isArray(value))return value.map(v=>deserializeClone(v,depth+1));
  requireValid(plain(value),'BACKUP_INVALID_SCHEMA');
  if(Object.hasOwn(value,token)){
    requireValid(Object.keys(value).every(k=>[token,'data','kind'].includes(k)),'BACKUP_INVALID_SCHEMA');
    if(value[token]==='Undefined'){
      requireValid(Object.keys(value).length===1,'BACKUP_INVALID_SCHEMA');return undefined;
    }
    if(value[token]==='Date'){
      requireValid(typeof value.data==='string'&&Number.isFinite(Date.parse(value.data)),'BACKUP_INVALID_SCHEMA');
      return new Date(value.data);
    }
    requireValid(value[token]==='Bytes'&&typeof value.kind==='string','BACKUP_INVALID_SCHEMA');
    const bytes=unbase64(value.data,MAX_ARCHIVE_BYTES);
    if(value.kind==='ArrayBuffer')return bytes.buffer;
    if(value.kind==='Uint8Array')return bytes;
    // Other typed-array representations must not silently lose element type.
    const ctor={Int8Array,Uint8ClampedArray,Int16Array,Uint16Array,
      Int32Array,Uint32Array,Float32Array,Float64Array,DataView}[value.kind];
    requireValid(Boolean(ctor),'BACKUP_INVALID_SCHEMA');
    requireValid(value.kind==='DataView'||bytes.byteLength%ctor.BYTES_PER_ELEMENT===0,'BACKUP_INVALID_SCHEMA');
    return new ctor(bytes.buffer);
  }
  const out=Object.create(null);
  for(const [key,entry] of Object.entries(value)){
    requireValid(!['__proto__','constructor','prototype'].includes(key),'BACKUP_UNSAFE_KEY');
    out[key]=deserializeClone(entry,depth+1);
  }
  return out;
}
export function validatePcmsSnapshot(snapshot){
  requireValid(plain(snapshot)&&snapshot.schema===1&&plain(snapshot.stores),'BACKUP_PCMS_SCHEMA_UNSUPPORTED');
  requireValid(Object.keys(snapshot.stores).length===DB_STORES.length,'BACKUP_INCOMPLETE');
  for(const store of DB_STORES){
    const entries=snapshot.stores[store];
    requireValid(Array.isArray(entries)&&entries.length<=100000,'BACKUP_INCOMPLETE');
    const keys=new Set();
    for(const row of entries){
      requireValid(plain(row)&&Object.keys(row).length===2&&
        Object.hasOwn(row,'key')&&Object.hasOwn(row,'value'),'BACKUP_INVALID_SCHEMA');
      const key=JSON.stringify(row.key);
      requireValid(!keys.has(key),'BACKUP_DUPLICATE_ROW');keys.add(key);
      // Reject unserializable source rather than dropping bytes.
      serializeClone(row.value);
    }
  }
  return snapshot;
}
export function identicalCut(a,b){return JSON.stringify(a)===JSON.stringify(b);}
export function consistentOrThrow(a,b){
  requireValid(identicalCut(a,b),'BACKUP_LOCAL_DRIFT');
}
function checkedJson(data){
  const text=JSON.stringify(data);
  requireValid(typeof text==='string'&&codec.encode(text).length<=MAX_ARCHIVE_BYTES,'BACKUP_TOO_LARGE');
  return text;
}
async function keyFor(passphrase,salt,usage){
  const key=await crypto.subtle.importKey('raw',codec.encode(passphrase),'PBKDF2',false,['deriveKey']);
  return crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',
    iterations:250000,salt},key,{name:'AES-GCM',length:256},false,[usage]);
}
const outerKeys=['format','version','encryption','sealedPayload'];
// v2 authoring must call this strict check before any encryption or download.
 // Legacy v1 archives may contain historical but incomplete source evidence:
 // preserving those records is not a source-complete recovery claim.
export async function preflightSourceRecovery(pcms) {
  validatePcmsSnapshot(pcms);
  return auditSourceClosure(pcms);
}
export async function encodeIntegrated({pcms,donorEnvelope,passphrase,createdAt=new Date().toISOString(),appVersion=''}={}){
  requireValid(typeof passphrase==='string'&&passphrase.length>=12&&codec.encode(passphrase).length<=4096,'BACKUP_PASSPHRASE_REQUIRED');
  validatePcmsSnapshot(pcms);
  requireValid(typeof donorEnvelope==='string'&&donorEnvelope.length<=MAX_ARCHIVE_BYTES,'BACKUP_DONOR_REQUIRED');
  let donor;try{donor=JSON.parse(donorEnvelope)}catch{throw Error('BACKUP_DONOR_INVALID');}
  requireValid(donor.format==='personamonkey-backup'&&donor.formatVersion===1&&
    !!donor.sealedPayload&&donor.encryption?.scheme==='PBKDF2-SHA256/AES-256-GCM'&&
    !Object.hasOwn(donor,'payload'),'BACKUP_DONOR_NOT_ENCRYPTED');
  const manifest={pcmsSha256:await digest(checkedJson(pcms)),
    donorSha256:await digest(donorEnvelope)};
  const payload=checkedJson({format:FORMAT,version:VERSION,
    createdAt,appVersion,exclusions:['WireGuard private/native configuration','External provider/editor unsaved state','Independent on-disk backup byte proof'],
    pcms,donorEnvelope,manifest});
  const salt=crypto.getRandomValues(new Uint8Array(16)),iv=crypto.getRandomValues(new Uint8Array(12));
  const key=await keyFor(passphrase,salt,'encrypt');
  const encrypted=new Uint8Array(await crypto.subtle.encrypt({name:'AES-GCM',iv},key,codec.encode(payload)));
  const envelope=checkedJson({format:FORMAT,version:VERSION,
    encryption:{scheme:'PBKDF2-SHA256/AES-256-GCM',iterations:250000,salt:base64(salt),iv:base64(iv)},
    sealedPayload:base64(encrypted)});
  return {text:envelope,bytes:codec.encode(envelope),sha256:await digest(envelope),
    inventory:{pcmsRows:DB_STORES.reduce((n,store)=>n+pcms.stores[store].length,0),
      sourceCompleteness:'NOT_PROVEN_LEGACY_V1',
      recoveryTier:'IN_MEMORY_ONLY'}};
}
export async function decodeIntegrated(text,passphrase,{decodeDonor}={}){
  requireValid(typeof text==='string'&&codec.encode(text).length<=MAX_ARCHIVE_BYTES,'BACKUP_TOO_LARGE');
  let envelope;
  try{envelope=JSON.parse(text);}catch{throw Error('BACKUP_INVALID_FORMAT');}
  requireValid(plain(envelope)&&Object.keys(envelope).length===outerKeys.length&&
    outerKeys.every(key=>Object.hasOwn(envelope,key))&&
    envelope.format===FORMAT&&envelope.version===VERSION,'BACKUP_INVALID_FORMAT');
  const e=envelope.encryption;
  requireValid(plain(e)&&Object.keys(e).length===4&&
    e.scheme==='PBKDF2-SHA256/AES-256-GCM'&&e.iterations===250000,'BACKUP_INVALID_CRYPTO');
  requireValid(typeof passphrase==='string'&&passphrase.length>0,'BACKUP_PASSPHRASE_REQUIRED');
  const salt=unbase64(e.salt,32),iv=unbase64(e.iv,32);
  requireValid(salt.length===16&&iv.length===12,'BACKUP_INVALID_CRYPTO');
  const body=unbase64(envelope.sealedPayload,MAX_ARCHIVE_BYTES);
  let decoded;
  try {
    const key=await keyFor(passphrase,salt,'decrypt');
    decoded=decoder.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv},key,body));
  }catch{throw Error('BACKUP_DECRYPT_FAILED');}
  let payload;
  try{payload=JSON.parse(decoded);}catch{throw Error('BACKUP_INVALID_SCHEMA');}
  requireValid(plain(payload)&&payload.format===FORMAT&&payload.version===VERSION&&
    typeof payload.createdAt==='string'&&plain(payload.manifest)&&
    typeof payload.donorEnvelope==='string','BACKUP_INVALID_SCHEMA');
  validatePcmsSnapshot(payload.pcms);
  requireValid(await digest(checkedJson(payload.pcms))===payload.manifest.pcmsSha256&&
    await digest(payload.donorEnvelope)===payload.manifest.donorSha256,'BACKUP_INTEGRITY_FAILED');
  // Verify the real donor decrypt+hash contract, not merely an embedded JSON shape.
  requireValid(typeof decodeDonor==='function','BACKUP_DONOR_DECODER_REQUIRED');
  try {
    const inner=await decodeDonor(payload.donorEnvelope,passphrase);
    requireValid(inner?.envelope?.encryption&&inner?.payload,'BACKUP_DONOR_INVALID');
  }catch{throw Error('BACKUP_DONOR_INVALID');}
  // Offline preview/roundtrip only; never persist to Canonical IDB.
  return payload;
}
// The entire read is one short IndexedDB transaction across all canonical stores.
// No await over cookies, crypto or downloads inside this transaction.
export function snapshotCanonical(db){
  return new Promise((resolve,reject)=>{
    if(!db||DB_STORES.some(s=>!db.objectStoreNames.contains(s))){reject(Error('BACKUP_INCOMPLETE'));return;}
    let tx;
    try{tx=db.transaction(DB_STORES,'readonly');}catch{reject(Error('BACKUP_IDB_UNAVAILABLE'));return;}
    const stores=Object.fromEntries(DB_STORES.map(k=>[k,[]]));let failed=false,seen=0;
    const stop=(code)=>{if(failed)return;failed=true;try{tx.abort();}catch{} reject(Error(code));};
    tx.onabort=()=>{if(!failed)reject(Error('BACKUP_IDB_ABORTED'));};
    tx.onerror=()=>{ /* abort owns failure */ };
    tx.oncomplete=()=>{
      if(failed)return;
      try{const snapshot={schema:1,stores};validatePcmsSnapshot(snapshot);
        if(codec.encode(JSON.stringify(snapshot)).length>MAX_ARCHIVE_BYTES)throw Error('BACKUP_TOO_LARGE');
        resolve(snapshot);
      }catch(err){reject(err);}
    };
    try{
      for(const store of DB_STORES){
        tx.objectStore(store).openCursor().onsuccess=event=>{
          const cursor=event.target.result;if(!cursor)return;
          if(++seen>100000){stop('BACKUP_TOO_LARGE');return;}
          try{stores[store].push({key:serializeClone(cursor.key),value:serializeClone(cursor.value)});}
          catch(e){stop(e.message);return;}
          cursor.continue();
        };
      }
    }catch{stop('BACKUP_IDB_UNAVAILABLE');}
  });
}
function downloadPathSafe(value){
  // Firefox search returns the actual full path, including uniquify suffix.
  return typeof value==='string'&&/[/\\]pcms-backups[/\\]pcms-alpha-[a-z0-9_-]+(?: \(\d+\))?\.encrypted$/i.test(value);
}
export function verifyBrowserDownload(row,{id,bytes}){
  if(!row||row.id!==id||row.state!=='complete'||row.exists!==true||
    !Number.isSafeInteger(row.fileSize)||row.fileSize!==bytes||
    !downloadPathSafe(row.filename))return {tier:1,code:'DOWNLOAD_NOT_CONFIRMED'};
  return {tier:2,code:'BROWSER_REPORTED_COMPLETE',downloadId:id,bytes:row.fileSize,
    actualName:row.filename.split(/[/\\]/).slice(-1)[0]};
}
export async function observeDownload(api,id,expectedBytes,{timeoutMs=120000}={}){
  requireValid(Number.isSafeInteger(id)&&id>=0,'DOWNLOAD_ID_INVALID');
  return new Promise(resolve=>{
    let settled=false;
    const done=value=>{if(settled)return;settled=true;
      clearTimeout(timer);try{api.onChanged.removeListener(changed);}catch{}resolve(value);};
    const inspect=async()=>{
      try{const records=await api.search({id});
        const check=verifyBrowserDownload(records?.[0],{id,bytes:expectedBytes});
        if(check.tier===2)return done(check);
        if(records?.[0]?.state==='interrupted')return done({tier:1,code:'DOWNLOAD_INTERRUPTED'});
      }catch{return done({tier:1,code:'DOWNLOAD_HISTORY_UNAVAILABLE'});}
    };
    const changed=delta=>{
      if(delta.id!==id)return;
      if(delta.state?.current==='interrupted')done({tier:1,code:'DOWNLOAD_INTERRUPTED'});
      else if(delta.state?.current==='complete')void inspect();
    };
    const timer=setTimeout(()=>done({tier:1,code:'DOWNLOAD_COMPLETION_UNVERIFIED'}),timeoutMs);
    try{api.onChanged.addListener(changed);}catch{return done({tier:1,code:'DOWNLOAD_OBSERVER_UNAVAILABLE'});}
    void inspect();
  });
}
