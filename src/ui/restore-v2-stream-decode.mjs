// S02 stage decoder. Input MUST come from terminal-gated inactive staging;
// this module does not decrypt or authenticate ciphertext or admit a restore.
// It constructs canonical/donor state without allocating an entire plaintext
// archive, checking every frame and source reference before any caller write.
import {DB_STORES,digest,validatePcmsSnapshot,preflightSourceRecovery} from './backup-core.mjs';
import {canonicalJSON} from './backup-v2-codec.mjs';
const decode=new TextDecoder('utf-8',{fatal:true}),HEX=/^[a-f0-9]{64}$/;
const deny=code=>{throw Error(code)};
const check=(v,c)=>{if(!v)deny(c)};
const obj=o=>o!==null&&typeof o==='object'&&!Array.isArray(o);
const toHex=bytes=>Array.from(bytes,v=>v.toString(16).padStart(2,'0')).join('');
const from64=bytes=>{
  let raw='';
  for(let i=0;i<bytes.length;i+=32768)
    raw+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(raw);
};
function references(node,found=new Set(),depth=0){
  check(depth<=40,'RESTORE_V2_STRUCTURE_TOO_DEEP');
  if(Array.isArray(node)){for(const entry of node)references(entry,found,depth+1);return found}
  if(!obj(node))return found;
  if(Object.hasOwn(node,'__pcmsV2BlobRef')){
    check(Object.keys(node).length===1&&HEX.test(node.__pcmsV2BlobRef),
      'RESTORE_V2_SOURCE_REF_INVALID');
    found.add(node.__pcmsV2BlobRef);
  }else for(const entry of Object.values(node))references(entry,found,depth+1);
  return found;
}
function hydrate(value,blobs,depth=0){
  check(depth<=40,'RESTORE_V2_STRUCTURE_TOO_DEEP');
  if(Array.isArray(value))return value.map(item=>hydrate(item,blobs,depth+1));
  if(!obj(value))return value;
  if(Object.hasOwn(value,'__pcmsV2BlobRef')){
    const ref=value.__pcmsV2BlobRef;
    check(Object.keys(value).length===1&&HEX.test(ref)&&blobs.has(ref),
      'RESTORE_V2_SOURCE_REF_MISSING');
    return from64(blobs.get(ref));
  }
  return Object.fromEntries(Object.entries(value).map(([k,v])=>
    [k,hydrate(v,blobs,depth+1)]));
}
const sortedEqual=(a,b)=>a.length===b.length&&a.every((x,i)=>x===b[i]);
const cleanJson=(data,code)=>{
  let value,text;
  try{text=decode.decode(data);value=JSON.parse(text)}
  catch{deny(code)}
  check(canonicalJSON(value)===text,code);
  return value;
};
export async function decodeV2InactiveFrames(frames,{password,decodeDonor}={}){
  check(frames&&typeof frames[Symbol.asyncIterator]==='function',
    'RESTORE_V2_FRAMES_REQUIRED');
  check(typeof decodeDonor==='function','RESTORE_V2_DONOR_DECODER_REQUIRED');
  const blobs=new Map(),rows=Object.fromEntries(DB_STORES.map(store=>[store,[]])),
    seen=Object.fromEntries(DB_STORES.map(store=>[store,new Set()])),
    counts=Object.fromEntries(DB_STORES.map(store=>[store,0])),
    referencesSet=new Set(),rowDigests=[];
  const donorParts=[];let donorDecoder=new TextDecoder('utf-8',{fatal:true}),
    donorComplete=false,end=null,firstRow=false;
  for await(const frame of frames){
    const kind=frame?.kind;
    if(kind==='BLOB'){
      check(!firstRow&&!donorComplete&&end===null,'RESTORE_V2_FRAME_ORDER');
      const data=frame.bytes;
      check(data instanceof Uint8Array&&data.length>=32,'RESTORE_V2_BLOB_INVALID');
      const ref=toHex(data.subarray(0,32)),value=data.subarray(32);
      check(!blobs.has(ref)&&await digest(value)===ref,'RESTORE_V2_BLOB_INVALID');
      blobs.set(ref,Uint8Array.from(value));
    }else if(kind==='CANONICAL'){
      check(!donorComplete&&end===null,'RESTORE_V2_FRAME_ORDER');firstRow=true;
      const record=cleanJson(frame.bytes,'RESTORE_V2_CANONICAL_INVALID');
      check(obj(record)&&Object.keys(record).sort().join(',')==='key,refs,store,value'&&
        DB_STORES.includes(record.store)&&Array.isArray(record.refs)&&
        record.refs.every(ref=>typeof ref==='string'&&HEX.test(ref)),
        'RESTORE_V2_CANONICAL_INVALID');
      const refs=[...references(record.value)].sort();
      check(sortedEqual(record.refs,refs),'RESTORE_V2_REF_MISMATCH');
      const key=canonicalJSON(record.key);
      check(!seen[record.store].has(key),'RESTORE_V2_DUPLICATE_KEY');
      seen[record.store].add(key);
      for(const ref of refs)referencesSet.add(ref);
      rows[record.store].push(record);counts[record.store]++;
      rowDigests.push(await digest(frame.bytes));
    }else if(kind==='DONOR_FRAGMENT'){
      check(!donorComplete&&end===null,'RESTORE_V2_FRAME_ORDER');
      try{donorParts.push(donorDecoder.decode(frame.bytes,{stream:true}))}
      catch{deny('RESTORE_V2_DONOR_UTF8_INVALID')}
    }else if(kind==='DONOR_END'){
      check(!donorComplete&&end===null,'RESTORE_V2_DUPLICATE_DONOR');
      try{donorParts.push(donorDecoder.decode())}
      catch{deny('RESTORE_V2_DONOR_UTF8_INVALID')}
      donorComplete=true;
    }else if(kind==='END'){
      check(donorComplete&&end===null,'RESTORE_V2_END_ORDER');
      end=cleanJson(frame.bytes,'RESTORE_V2_END_INVALID');
    }else deny('RESTORE_V2_FRAME_INVALID');
  }
  check(obj(end)&&end.schema===2&&end.donorSections===1&&donorComplete&&
    end.uniqueBlobs===blobs.size&&
    end.canonicalRows===rowDigests.length&&
    obj(end.storeCounts)&&
    Object.keys(end.storeCounts).sort().join(',')===DB_STORES.slice().sort().join(',')&&
    DB_STORES.every(store=>counts[store]===end.storeCounts[store])&&
    sortedEqual([...referencesSet].sort(),[...blobs.keys()].sort())&&
    end.sourceRefsSha256===await digest([...referencesSet].sort().join('\n'))&&
    end.rowDigestsSha256===await digest(rowDigests.join('\n')),
    'RESTORE_V2_INVENTORY_INCOMPLETE');
  const donorEnvelope=donorParts.join('');
  check(end.donorSha256===await digest(donorEnvelope),'RESTORE_V2_DONOR_DIGEST_INVALID');
  let donor;
  try{donor=(await decodeDonor(donorEnvelope,password)).payload}
  catch{deny('RESTORE_V2_DONOR_AUTH_FAILED')}
  check(obj(donor),'RESTORE_V2_DONOR_INVALID');
  const stores=Object.fromEntries(DB_STORES.map(store=>[store,
    rows[store].map(r=>({key:r.key,value:hydrate(r.value,blobs)}))]));
  const pcms={schema:1,stores};
  validatePcmsSnapshot(pcms);
  const audit=await preflightSourceRecovery(pcms);
  return {pcms,donor,donorEnvelope,inventory:end,sourceAudit:audit,
    status:'AUTHENTICATED_INACTIVE_DECODED_NOT_APPLIED'};
}
