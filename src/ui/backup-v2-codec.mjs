// S02 candidate-A source-bearing binary frame encoder/decoder (no native authority).
// Legacy v1 is unchanged. This module is NOT a production cryptographic verifier.
import {DB_STORES,validatePcmsSnapshot,serializeClone,digest} from './backup-core.mjs';
import {preflightSourceRecovery} from './backup-core.mjs';

const utf8=new TextEncoder(),readText=new TextDecoder('utf-8',{fatal:true});
const HEX=/^[a-f0-9]{64}$/;
export const V2_FRAME=Object.freeze({BLOB:1,CANONICAL:2,DONOR:3,END:255});
export const V2_LIMITS=Object.freeze({
  canonical:4*1024*1024,end:1024*1024,blob:12*1024*1024+32,
  donor:2*1024*1024*1024,fragment:65536
});
const fail=code=>{throw Error(code);};
const check=(condition,code)=>{if(!condition)fail(code);};
const plain=v=>v&&typeof v==='object'&&!Array.isArray(v);
const stable=value=>{
  if(value===null||typeof value!=='object')return JSON.stringify(value);
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  return '{'+Object.keys(value).sort().map(key=>
    JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
};
function rejectUnpaired(value,depth=0){
  check(depth<=45,'BACKUP_V2_DEPTH_INVALID');
  if(typeof value==='string'){
    for(let i=0;i<value.length;i++){
      const c=value.charCodeAt(i);
      if(c>=0xd800&&c<=0xdbff){
        check(i+1<value.length,'BACKUP_V2_UNPAIRED_SURROGATE');
        const low=value.charCodeAt(++i);
        check(low>=0xdc00&&low<=0xdfff,'BACKUP_V2_UNPAIRED_SURROGATE');
      }else check(c<0xdc00||c>0xdfff,'BACKUP_V2_UNPAIRED_SURROGATE');
    }
  }else if(value&&typeof value==='object'){
    for(const [key,child] of Object.entries(value)){
      if(!Array.isArray(value))rejectUnpaired(key,depth+1);
      rejectUnpaired(child,depth+1);
    }
  }
}
export function canonicalJSON(value){
  rejectUnpaired(value);
  const result=stable(value);
  check(typeof result==='string','BACKUP_V2_JSON_INVALID');
  return result;
}
const bytes=value=>utf8.encode(value);
const toHex=v=>Array.from(v,x=>x.toString(16).padStart(2,'0')).join('');
const fromHex=v=>Uint8Array.from(v.match(/../g),x=>parseInt(x,16));
function from64(value){
  check(typeof value==='string' && value.length<=Math.ceil((12*1024*1024)/3)*4+8 &&
    /^(?:[a-zA-Z0-9+/]{4})*(?:[a-zA-Z0-9+/]{2}==|[a-zA-Z0-9+/]{3}=)?$/.test(value),
    'BACKUP_V2_BASE64_INVALID');
  const raw=atob(value);
  return Uint8Array.from(raw,x=>x.charCodeAt(0));
}
function to64(raw) {
  let encoded='';
  for(let i=0;i<raw.length;i+=32768)encoded+=String.fromCharCode(...raw.subarray(i,i+32768));
  return btoa(encoded);
}
// Structured-clone Number(-0) needs an explicit v2-only wire discriminator:
// JSON.stringify(-0) is 0 and cannot preserve Object.is(value,-0).
// Other unsupported nonfinite types fail in the original strict serializer.
export function preserveNegativeZero(value,depth=0){
  check(depth<=35,'BACKUP_V2_DEPTH_INVALID');
  if(typeof value==='number'&&Object.is(value,-0))
    return {__pcmsType:'NumberNegativeZero'};
  if(Array.isArray(value))
    return value.map(v=>preserveNegativeZero(v,depth+1));
  if(value&&typeof value==='object'&&
     (Object.getPrototypeOf(value)===null||
      Object.getPrototypeOf(value)===Object.prototype)){
    return Object.fromEntries(Object.entries(value).map(([k,v])=>
      [k,preserveNegativeZero(v,depth+1)]));
  }
  return value;
}
// Caller supplies the actual raw IndexedDB structured-clone values in v2.
// A literal discriminator on an ordinary object is ambiguous with v1's
// marker vocabulary. Fail before any export effect, never reinterpret it.
export function rejectV2DiscriminatorCollisions(v,depth=0){
  check(depth<=35,'BACKUP_V2_DEPTH_INVALID');
  if(Array.isArray(v)){
    for(const child of v)rejectV2DiscriminatorCollisions(child,depth+1);
    return;
  }
  if(!v||typeof v!=='object')return;
  const tag=Object.prototype.toString.call(v);
  if(tag==='[object Date]'||tag==='[object ArrayBuffer]'||
     ArrayBuffer.isView(v))return;
  const proto=Object.getPrototypeOf(v);
  if(proto!==null&&proto!==Object.prototype&&
     !(tag==='[object Object]'&&Object.getPrototypeOf(proto)===null))
    return;
  check(!Object.hasOwn(v,'__pcmsType')&&!Object.hasOwn(v,'__pcmsV2BlobRef'),
    'BACKUP_V2_RESERVED_DISCRIMINATOR');
  for(const child of Object.values(v))
    rejectV2DiscriminatorCollisions(child,depth+1);
}
function isSource(v){
  return plain(v)&&typeof v.fingerprint==='string'&&Array.isArray(v.files)&&Array.isArray(v.blobs);
}
function replaceSource(node,refs,blobs,depth=0){
  check(depth<=40,'BACKUP_V2_DEPTH_INVALID');
  if(Array.isArray(node))return node.map(v=>replaceSource(v,refs,blobs,depth+1));
  if(!plain(node))return node;
  check(!Object.hasOwn(node,'__pcmsV2BlobRef'),'BACKUP_V2_RESERVED_KEY');
  if(isSource(node)){
    const proofs=new Map(node.files.map(f=>[f.path,f]));
    const out={...node,blobs:node.blobs.map(b=>{
      const proof=proofs.get(b.path);
      check(proof&&HEX.test(proof.sha256)&&Number.isSafeInteger(proof.size),
        'BACKUP_V2_SOURCE_MISSING');
      const previous=blobs.get(proof.sha256);
      if(previous)check(previous.size===proof.size,'BACKUP_V2_BLOB_COLLISION');
      else {
        check(blobs.size<100000,'BACKUP_V2_UNSUPPORTED_BLOB_COUNT');
        blobs.set(proof.sha256,{base64:b.base64,size:proof.size});
      }
      refs.add(proof.sha256);
      return {...b,base64:{__pcmsV2BlobRef:proof.sha256}};
    })};
    for(const [k,v] of Object.entries(out))if(k!=='blobs')
      out[k]=replaceSource(v,refs,blobs,depth+1);
    return out;
  }
  return Object.fromEntries(Object.entries(node).map(([k,v])=>
    [k,replaceSource(v,refs,blobs,depth+1)]));
}
function restoreSource(node,blobs,depth=0){
  check(depth<=40,'BACKUP_V2_DEPTH_INVALID');
  if(Array.isArray(node))return node.map(v=>restoreSource(v,blobs,depth+1));
  if(!plain(node))return node;
  if(Object.hasOwn(node,'__pcmsV2BlobRef')){
    check(Object.keys(node).length===1&&HEX.test(node.__pcmsV2BlobRef)&&
      blobs.has(node.__pcmsV2BlobRef),'BACKUP_V2_BLOB_REFERENCE_INVALID');
    return to64(blobs.get(node.__pcmsV2BlobRef));
  }
  return Object.fromEntries(Object.entries(node).map(([k,v])=>
    [k,restoreSource(v,blobs,depth+1)]));
}
function collectReferences(node,refs=new Set(),depth=0){
  check(depth<=40,'BACKUP_V2_DEPTH_INVALID');
  if(Array.isArray(node)){for(const value of node)collectReferences(value,refs,depth+1);return refs;}
  if(!plain(node))return refs;
  if(Object.hasOwn(node,'__pcmsV2BlobRef')){
    check(Object.keys(node).length===1&&HEX.test(node.__pcmsV2BlobRef),
      'BACKUP_V2_BLOB_REFERENCE_INVALID');
    refs.add(node.__pcmsV2BlobRef);return refs;
  }
  for(const value of Object.values(node))collectReferences(value,refs,depth+1);
  return refs;
}
export function frameHeader(tag,length){
  check(Object.values(V2_FRAME).includes(tag)&&Number.isSafeInteger(length)&&length>=0,
    'BACKUP_V2_FRAME_INVALID');
  const header=new Uint8Array(9),dv=new DataView(header.buffer);
  header[0]=tag;dv.setBigUint64(1,BigInt(length),false);
  return header;
}
function join(a,b){const x=new Uint8Array(a.length+b.length);x.set(a);x.set(b,a.length);return x;}
function* fragments(tag,payload){
  yield frameHeader(tag,payload.length);
  for(let i=0;i<payload.length;i+=V2_LIMITS.fragment)
    yield payload.subarray(i,i+V2_LIMITS.fragment);
}
// B1 incremental preparation: preserve only row descriptors and source-blob
// references, not a second fleet of encoded CANONICAL frame buffers. This is
// an allocation reduction, NOT a substitute for an immutable streaming cut:
// the legacy caller still owns the aggregate pcms snapshot (B1 remains HELD).
function encodeRow(row,store,blobIndex){
  const refs=new Set();
  rejectV2DiscriminatorCollisions(row.value);
  const transformed=replaceSource(
    serializeClone(preserveNegativeZero(row.value)),refs,blobIndex);
  const payload=bytes(canonicalJSON({
    store,key:row.key,value:transformed,refs:[...refs].sort()
  }));
  check(payload.length>0&&payload.length<=V2_LIMITS.canonical,
    'BACKUP_V2_CANONICAL_LIMIT');
  return payload;
}
export async function compileV2(pcms,donorEnvelope){
  validatePcmsSnapshot(pcms);
  const totalRows=DB_STORES.reduce((count,store)=>count+pcms.stores[store].length,0);
  check(Number.isSafeInteger(totalRows)&&totalRows<=100000,
    'BACKUP_V2_UNSUPPORTED_RECORD_COUNT');
  await preflightSourceRecovery(pcms);
  check(typeof donorEnvelope==='string'&&donorEnvelope.length>0,'BACKUP_V2_DONOR_MISSING');
  const donor=bytes(donorEnvelope);
  check(donor.length<=V2_LIMITS.donor,'BACKUP_V2_DONOR_LIMIT');
  let parsed;try{parsed=JSON.parse(donorEnvelope)}catch{fail('BACKUP_V2_DONOR_INVALID');}
  check(parsed?.format==='personamonkey-backup'&&parsed?.formatVersion===1&&
    parsed?.encryption?.scheme==='PBKDF2-SHA256/AES-256-GCM'&&
    typeof parsed.sealedPayload==='string'&&!Object.hasOwn(parsed,'payload'),
    'BACKUP_V2_DONOR_INVALID');
  const blobs=new Map(),rows=[],rowHashes=[],counts=Object.create(null);
  for(const store of DB_STORES){
    counts[store]=0;
    const sourceRows=pcms.stores[store];
    // Sorting indices avoids cloning the source-heavy row array.
    const indices=Array.from({length:sourceRows.length},(_,i)=>i).sort((a,b)=>{
      const x=canonicalJSON(sourceRows[a].key),y=canonicalJSON(sourceRows[b].key);
      return x<y?-1:x>y?1:0;
    });
    for(const index of indices){
      const payload=encodeRow(sourceRows[index],store,blobs);
      const sha256=await digest(payload);
      rows.push({store,index,length:payload.length,sha256});
      rowHashes.push(sha256);counts[store]++;
    }
  }
  const refs=[...blobs.keys()].sort();
  const terminal={schema:2,canonicalRows:rows.length,storeCounts:counts,
    uniqueBlobs:refs.length,donorSections:1,
    sourceRefsSha256:await digest(refs.join('\\n')),
    rowDigestsSha256:await digest(rowHashes.join('\\n')),
    donorSha256:await digest(donor)};
  const ending=bytes(canonicalJSON(terminal));
  check(ending.length<=V2_LIMITS.end,'BACKUP_V2_END_LIMIT');
  let plaintextBytes=0;
  for(const sha of refs)plaintextBytes+=9+32+blobs.get(sha).size;
  for(const row of rows)plaintextBytes+=9+row.length;
  plaintextBytes+=9+donor.length+9+ending.length;
  check(Number.isSafeInteger(plaintextBytes)&&plaintextBytes<=(2**36-32),
    'BACKUP_V2_LENGTH_INVALID');
  return Object.freeze({pcms,blobs,rows,donor,ending,refs,terminal,plaintextBytes});
}
export async function* streamV2Frames(plan){
  for(const sha of plan.refs){
    const blob=plan.blobs.get(sha);
    check(blob&&Number.isSafeInteger(blob.size),'BACKUP_V2_BLOB_CHANGED');
    const data=from64(blob.base64);
    check(data.length===blob.size&&await digest(data)===sha,
      'BACKUP_V2_BLOB_CHANGED');
    yield frameHeader(V2_FRAME.BLOB,32+data.length);
    yield fromHex(sha);
    for(let i=0;i<data.length;i+=V2_LIMITS.fragment)
      yield data.subarray(i,i+V2_LIMITS.fragment);
  }
  for(const row of plan.rows){
    const source=plan.pcms?.stores?.[row.store]?.[row.index];
    check(source,'BACKUP_V2_SOURCE_CUT_CHANGED');
    const data=encodeRow(source,row.store,new Map());
    check(data.length===row.length&&await digest(data)===row.sha256,
      'BACKUP_V2_SOURCE_CUT_CHANGED');
    yield* fragments(V2_FRAME.CANONICAL,data);
  }
  yield* fragments(V2_FRAME.DONOR,plan.donor);
  yield* fragments(V2_FRAME.END,plan.ending);
}
// Decode only already-authenticated plaintext under an inactive restore gate.
// This is NOT a crypto/authentication function.
export async function decodeAuthenticatedV2(plaintext,{decodeDonor,password}={}){
  check(plaintext instanceof Uint8Array,'BACKUP_V2_AUTH_REQUIRED');
  let offset=0,phase=0;
  const blobs=new Map(),rows=[],refs=new Set(),counts=Object.fromEntries(DB_STORES.map(k=>[k,0]));
  const rowHashes=[];
  let donor=null,end=null;
  while(offset<plaintext.length){
    check(offset+9<=plaintext.length,'BACKUP_V2_TRUNCATED');
    const header=new DataView(plaintext.buffer,plaintext.byteOffset+offset,9);
    const tag=header.getUint8(0),length=Number(header.getBigUint64(1,false));offset+=9;
    const max=tag===1?V2_LIMITS.blob:tag===2?V2_LIMITS.canonical:
      tag===3?V2_LIMITS.donor:tag===255?V2_LIMITS.end:0;
    check(max&&length>=1&&length<=max&&offset+length<=plaintext.length,
      'BACKUP_V2_FRAME_INVALID');
    const payload=plaintext.subarray(offset,offset+length);offset+=length;
    if(tag===1){
      check(phase===0&&length>=32,'BACKUP_V2_ORDER_INVALID');
      const sha=toHex(payload.subarray(0,32));
      check(!blobs.has(sha)&&await digest(payload.subarray(32))===sha,'BACKUP_V2_BLOB_INVALID');
      blobs.set(sha,payload.subarray(32));
    }else if(tag===2){
      check(phase<=1,'BACKUP_V2_ORDER_INVALID');phase=1;
      let row;try{row=JSON.parse(readText.decode(payload))}catch{fail('BACKUP_V2_CANONICAL_INVALID');}
      check(plain(row)&&Object.keys(row).sort().join(',')==='key,refs,store,value'&&
        DB_STORES.includes(row.store)&&Array.isArray(row.refs)&&
        row.refs.every(x=>HEX.test(x)),'BACKUP_V2_CANONICAL_INVALID');
      check(row.refs.length===new Set(row.refs).size&&
        row.refs.every((ref,i)=>i===0||row.refs[i-1]<ref)&&
        canonicalJSON([...collectReferences(row.value)].sort())===canonicalJSON(row.refs),
        'BACKUP_V2_BLOB_REFERENCE_INVALID');
      rowHashes.push(await digest(payload));
      check(canonicalJSON(row)===readText.decode(payload),'BACKUP_V2_NONCANONICAL');
      for(const ref of row.refs)refs.add(ref);
      counts[row.store]++;rows.push(row);
    }else if(tag===3){
      check(phase<=1&&donor===null,'BACKUP_V2_ORDER_INVALID');phase=2;
      donor=readText.decode(payload);
    }else{
      check(phase===2&&end===null&&offset===plaintext.length,'BACKUP_V2_ORDER_INVALID');
      try{end=JSON.parse(readText.decode(payload))}catch{fail('BACKUP_V2_END_INVALID');}
      check(plain(end)&&Object.keys(end).sort().join(',')===
        'canonicalRows,donorSections,donorSha256,rowDigestsSha256,schema,sourceRefsSha256,storeCounts,uniqueBlobs'&&
        canonicalJSON(end)===readText.decode(payload),'BACKUP_V2_NONCANONICAL');
      phase=3;
    }
  }
  check(phase===3&&donor!==null&&end?.schema===2&&end.canonicalRows===rows.length&&
    end.uniqueBlobs===blobs.size&&end.donorSections===1&&
    Object.keys(counts).every(k=>end.storeCounts?.[k]===counts[k])&&
    refs.size===blobs.size&&[...refs].every(k=>blobs.has(k))&&
    end.sourceRefsSha256===await digest([...refs].sort().join('\n'))&&
    end.rowDigestsSha256===await digest(rowHashes.join('\n'))&&
    end.donorSha256===await digest(donor),'BACKUP_V2_INVENTORY_INVALID');
  check(typeof decodeDonor==='function','BACKUP_V2_DONOR_DECODER_REQUIRED');
  let decoded;try{decoded=await decodeDonor(donor,password)}catch{fail('BACKUP_V2_DONOR_AUTH_FAILED');}
  check(decoded?.payload&&decoded?.envelope?.encryption,'BACKUP_V2_DONOR_AUTH_FAILED');
  const stores=Object.fromEntries(DB_STORES.map(k=>[k,[]]));
  const seen=Object.fromEntries(DB_STORES.map(k=>[k,new Set()]));
  for(const row of rows){
    const id=canonicalJSON(row.key);
    check(!seen[row.store].has(id),'BACKUP_V2_DUPLICATE_ROW');
    seen[row.store].add(id);
    const restored=restoreSource(row.value,blobs);
    stores[row.store].push({key:row.key,value:restored});
  }
  const pcms={schema:1,stores};
  validatePcmsSnapshot(pcms);
  return {pcms,donorEnvelope:donor,donor:decoded.payload,inventory:end};
}
