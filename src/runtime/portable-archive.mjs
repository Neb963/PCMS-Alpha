// A02 portable plaintext framing. Integrity detects partial/corrupt archives;
// it is not encryption or an authenticity signature. No OS native dependency.
import {DB_STORES,serializeClone,validatePcmsSnapshot,preflightSourceRecovery} from './backup-core.mjs';
import {validateBackupPayload,validateExternalArtifactHashes} from '../lib/backup-package.js';

export const PORTABLE_FORMAT='pcms-alpha-portable';
export const PORTABLE_VERSION=1;
export const MAX_FRAME_CHARS=96*1024;
export const MAX_ARCHIVE_LINE=1024*1024;
const encoder=new TextEncoder();
const hex=bytes=>Array.from(new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
const hash=async value=>hex(await crypto.subtle.digest('SHA-256',
  typeof value==='string'?encoder.encode(value):value));
const requireValid=(ok,code)=>{if(!ok)throw Error(code);};
const json=x=>JSON.stringify(x);
const secretKeys=new Set(['git:credential','git:token','github:token',
  'pcmsGitCredential','pcmsGitToken','pcmsS03GitToken','backup:passphrase']);
export function isExcludedCredential(store,key){
  return store==='meta'&&typeof key==='string'&&secretKeys.has(key);
}
const checkRow=(store,row)=>{
  requireValid(row&&typeof row==='object'&&Object.hasOwn(row,'key')&&
    Object.hasOwn(row,'value'),'PORTABLE_ROW_INVALID');
  requireValid(!isExcludedCredential(store,row.key),'PORTABLE_SECRET_ROW_PRESENT');
};
async function encodeFrame(index,kind,store,record,piece,pieces,value,previous){
  const body={i:index,kind,store,record,piece,pieces,value};
  const sha256=await hash(json(body));
  const chain=await hash(previous+'\n'+sha256);
  const line=json({...body,sha256,chain})+'\n';
  requireValid(encoder.encode(line).byteLength<=MAX_ARCHIVE_LINE,'PORTABLE_FRAME_TOO_LARGE');
  return {line,chain};
}
function validateInputs(pcms,donor){
  validatePcmsSnapshot(pcms);
  validateBackupPayload(donor);
  for(const store of DB_STORES){
    for(const row of pcms.stores[store])checkRow(store,row);
  }
}
// Full canonical snapshot is only a compatible input adapter. A02's bounded
// IDB paging and file staging use the record iterator below; no second whole
// JSON copy is made by this framing layer.
export async function encodePortableArchive({pcms,donor,appVersion='',createdAt=
  new Date().toISOString()}){
  validateInputs(pcms,donor);
  await validateExternalArtifactHashes(donor.scripts||[],{entries:true});
  const sourceAudit=await preflightSourceRecovery(pcms);
  const header={format:PORTABLE_FORMAT,version:PORTABLE_VERSION,
    createdAt,appVersion:String(appVersion),stores:[...DB_STORES],
    sourceAudit};
  const body=[json(header)+'\n'];
  let total=encoder.encode(body[0]).length,frames=0,chain=await hash(body[0]),rows=0;
  async function append(kind,store,record,serialized){
    // Split serialized source without re-encoding the entire archive.
    requireValid(serialized.length<=128*1024*1024,'PORTABLE_RECORD_TOO_LARGE');\n    const count=Math.max(1,Math.ceil(serialized.length/MAX_FRAME_CHARS));
    for(let part=0;part<count;part++){
      const fragment=await encodeFrame(frames++,kind,store,record,part,count,
        serialized.slice(part*MAX_FRAME_CHARS,(part+1)*MAX_FRAME_CHARS),chain);
      chain=fragment.chain;
      body.push(fragment.line);
      total+=encoder.encode(fragment.line).byteLength;
    }
  }
  for(const store of DB_STORES){
    const records=pcms.stores[store];
    for(let i=0;i<records.length;i++){
      await append('pcms',store,i,json({key:serializeClone(records[i].key),\n        value:serializeClone(records[i].value)}));
      rows++;
    }
  }
  await append('donor',null,0,json(donor));
  const footer={end:PORTABLE_FORMAT,version:PORTABLE_VERSION,
    frames,rows,chain,sourceAudit};
  const line=json(footer)+'\n';
  body.push(line);total+=encoder.encode(line).length;
  return Object.freeze({blob:new Blob(body,{type:'application/x-ndjson'}),
    bytes:total,frames,rows,sourceAudit,chain});
}
export async function* framedLines(source){
  // Works with a File/Blob, ReadableStream, or async byte iterable.
  const stream=typeof source?.stream==='function'?source.stream():source;
  const iterable=stream?.getReader?{
    async *[Symbol.asyncIterator](){
      const reader=stream.getReader();
      try{for(;;){const next=await reader.read();if(next.done)break;yield next.value;}}
      finally{reader.releaseLock();}
    }
  }:stream;
  requireValid(iterable&&Symbol.asyncIterator in Object(iterable),'PORTABLE_INPUT_INVALID');
  const decoder=new TextDecoder('utf-8',{fatal:true});
  let buffer='',lineCount=0;
  for await(const value of iterable){
    requireValid(value instanceof Uint8Array,'PORTABLE_CHUNK_INVALID');
    buffer+=decoder.decode(value,{stream:true});
    let end;
    while((end=buffer.indexOf('\n'))!==-1){
      const line=buffer.slice(0,end);buffer=buffer.slice(end+1);
      requireValid(encoder.encode(line).length<=MAX_ARCHIVE_LINE,'PORTABLE_LINE_TOO_LARGE');
      lineCount++;
      yield line;
    }
    requireValid(encoder.encode(buffer).length<=MAX_ARCHIVE_LINE,'PORTABLE_LINE_TOO_LARGE');
  }
  buffer+=decoder.decode();
  requireValid(buffer.length===0,'PORTABLE_TRUNCATED');
  requireValid(lineCount>=2,'PORTABLE_TRUNCATED');
}
export async function readPortableArchive(source,{onRecord,collect=true,
  auditSource=preflightSourceRecovery}={}){
  // onRecord MUST only write to a disposable staging area. The footer and
  // source closure are verified at the end; never mutate live state here.
  requireValid(typeof collect==='boolean','PORTABLE_COLLECT_INVALID');
  requireValid(!onRecord||typeof onRecord==='function','PORTABLE_SINK_INVALID');
  const canonical=collect?{schema:1,stores:Object.fromEntries(DB_STORES.map(s=>[s,[]]))}:null;
  let header=null,footer=null,frames=0,rows=0,donor=null,chain=null,pending=null;
  const seen=Object.fromEntries(DB_STORES.map(s=>[s,0]));
  for await(const line of framedLines(source)){
    let value;
    try{value=JSON.parse(line);}catch{throw Error('PORTABLE_JSON_INVALID');}
    if(!header){
      requireValid(value?.format===PORTABLE_FORMAT&&value.version===PORTABLE_VERSION&&
        json(value.stores)===json(DB_STORES)&&
        typeof value.sourceAudit==='object','PORTABLE_HEADER_INVALID');
      header=value;chain=await hash(line+'\n');continue;
    }
    requireValid(!footer,'PORTABLE_TRAILING_DATA');
    if(value?.end===PORTABLE_FORMAT){
      requireValid(!pending&&value.version===PORTABLE_VERSION&&
        value.frames===frames&&value.rows===rows&&value.chain===chain&&
        json(value.sourceAudit)===json(header.sourceAudit)&&donor,
        'PORTABLE_FOOTER_MISMATCH');
      footer=value;continue;
    }
    const {i,kind,store,record,piece,pieces,sha256}=value||{};\n    requireValid(donor===null,'PORTABLE_RECORD_ORDER');
    requireValid(i===frames&&['pcms','donor'].includes(kind)&&
      (kind==='donor'?store===null&&record===0:DB_STORES.includes(store))&&
      Number.isSafeInteger(piece)&&piece>=0&&
      Number.isSafeInteger(pieces)&&pieces>0&&pieces<=100000&&
      piece<pieces&&Number.isSafeInteger(record)&&record>=0&&\n      typeof value.value==='string'&&
      value.value.length<=MAX_FRAME_CHARS&&
      /^[a-f0-9]{64}$/.test(sha256||''),'PORTABLE_FRAME_INVALID');
    const body={i,kind,store,record,piece,pieces,value:value.value};
    requireValid(await hash(json(body))===sha256,'PORTABLE_FRAME_DIGEST');
    chain=await hash(chain+'\n'+sha256);
    requireValid(value.chain===chain,'PORTABLE_FRAME_CHAIN');
    frames++;
    if(!pending){
      requireValid(piece===0&&
        (kind==='donor'?donor===null&&DB_STORES.every(s=>seen[s]===
          (collect?canonical.stores[s].length:seen[s])):
          kind==='pcms'&&record===seen[store]),
        'PORTABLE_RECORD_ORDER');
      pending={kind,store,record,pieces,next:0,parts:[]};
    }
    requireValid(pending.kind===kind&&pending.store===store&&pending.record===record&&
      pending.pieces===pieces&&pending.next===piece,'PORTABLE_RECORD_FRAGMENT');
    pending.parts.push(value.value);pending.next++;\n    requireValid(pending.next*MAX_FRAME_CHARS<=128*1024*1024+MAX_FRAME_CHARS,\n      'PORTABLE_RECORD_TOO_LARGE');
    if(pending.next===pending.pieces){
      let item;
      try{item=JSON.parse(pending.parts.join(''));}catch{throw Error('PORTABLE_RECORD_JSON');}
      if(kind==='donor'){
        validateBackupPayload(item);
        await validateExternalArtifactHashes(item.scripts||[],{entries:true});
        donor=item;
      }else{
        checkRow(store,item);
        seen[store]++;
        rows++;
        if(collect)canonical.stores[store].push(item);
      }
      if(onRecord)await onRecord({kind,store,record,value:item});
      pending=null;
    }
  }
  requireValid(footer&&donor,'PORTABLE_FOOTER_MISSING');
  if(collect){
    validatePcmsSnapshot(canonical);
    const sourceAudit=await auditSource(canonical);
    requireValid(json(sourceAudit)===json(header.sourceAudit),'PORTABLE_SOURCE_CLOSURE');
  }
  return {format:PORTABLE_FORMAT,version:PORTABLE_VERSION,
    archiveSourceAudit:header.sourceAudit,canonical,donor,
    rows,frames,chain,integrity:'FRAME_AND_SOURCE_VERIFIED',
    diskReadback:false};
}
