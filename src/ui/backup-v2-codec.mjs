// S02 candidate-A source-bearing binary frame encoder/decoder (no native authority).
// Legacy v1 is unchanged. This module is NOT a production cryptographic verifier.
import {DB_STORES,validatePcmsSnapshot,deserializeClone,digest} from './backup-core.mjs';
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
export function canonicalJSON(value){
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
      else blobs.set(proof.sha256,{base64:b.base64,size:proof.size});
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
export async function compileV2(pcms,donorEnvelope){
  validatePcmsSnapshot(pcms);
  await preflightSourceRecovery(pcms);
  check(typeof donorEnvelope==='string'&&donorEnvelope.length>0,'BACKUP_V2_DONOR_MISSING');
  const donor=bytes(donorEnvelope);
  check(donor.length<=V2_LIMITS.donor,'BACKUP_V2_DONOR_LIMIT');
  // A donor envelope is encrypted, not a plaintext export or an assertion.
  let parsed;try{parsed=JSON.parse(donorEnvelope)}catch{fail('BACKUP_V2_DONOR_INVALID');}
  check(parsed?.format==='personamonkey-backup'&&parsed?.formatVersion===1&&
    parsed?.encryption?.scheme==='PBKDF2-SHA256/AES-256-GCM'&&
    typeof parsed.sealedPayload==='string'&&!Object.hasOwn(parsed,'payload'),
    'BACKUP_V2_DONOR_INVALID');
  const blobs=new Map(),rows=[],rowHashes=[],counts=Object.create(null);
  for(const store of DB_STORES){
    counts[store]=0;
    for(const row of [...pcms.stores[store]].sort((a,b)=>canonicalJSON(a.key)<canonicalJSON(b.key)?-1:canonicalJSON(a.key)>canonicalJSON(b.key)?1:0)){
      const refs=new Set();
      const transformed=replaceSource(row.value,refs,blobs);
      const record={store,key:row.key,value:transformed,refs:[...refs].sort()};
      const payload=bytes(canonicalJSON(record));
      check(payload.length>0&&payload.length<=V2_LIMITS.canonical,'BACKUP_V2_CANONICAL_LIMIT');
      rows.push(payload);rowHashes.push(await digest(payload));counts[store]++;
    }
  }
  const refs=[...blobs.keys()].sort();
  const terminal={schema:2,canonicalRows:rows.length,storeCounts:counts,
    uniqueBlobs:refs.length,donorSections:1,
    sourceRefsSha256:await digest(refs.join('\n')),
    rowDigestsSha256:await digest(rowHashes.join('\n')),
    donorSha256:await digest(donor)};
  const ending=bytes(canonicalJSON(terminal));
  check(ending.length<=V2_LIMITS.end,'BACKUP_V2_END_LIMIT');
  let plaintextBytes=0;
  for(const sha of refs)plaintextBytes+=9+32+blobs.get(sha).size;
  for(const row of rows)plaintextBytes+=9+row.length;
  plaintextBytes+=9+donor.length+9+ending.length;
  check(Number.isSafeInteger(plaintextBytes)&&plaintextBytes<=(2**36-32),
    'BACKUP_V2_LENGTH_INVALID');
  return Object.freeze({blobs,rows,donor,ending,refs,terminal,plaintextBytes});
}
export async function* streamV2Frames(plan){
  for(const sha of plan.refs){
    const data=from64(plan.blobs.get(sha).base64);
    check(data.length===plan.blobs.get(sha).size&&await digest(data)===sha,
      'BACKUP_V2_BLOB_CHANGED');
    yield frameHeader(V2_FRAME.BLOB,32+data.length);
    yield fromHex(sha);
    for(let i=0;i<data.length;i+=V2_LIMITS.fragment)
      yield data.subarray(i,i+V2_LIMITS.fragment);
  }
  for(const row of plan.rows)yield* fragments(V2_FRAME.CANONICAL,row);
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
      check(canonicalJSON(end)===readText.decode(payload),'BACKUP_V2_NONCANONICAL');
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
