// S02 B1 — source-memory-bounded v2 frame planning from an immutable cut.
// An adapter MUST supply a transactionally frozen/replayable source; a label,
// digest or two unversioned database reads do not create that authority.
// Do not expose this interface to renderer messages or use an unpinned cursor.
import {DB_STORES,digest} from './backup-core.mjs';
import {auditSourceClosureRows} from './backup-source-closure.mjs';
import {V2_FRAME,V2_LIMITS,canonicalJSON,encodeV2Row,frameHeader}
  from './backup-v2-codec.mjs';

const encoder=new TextEncoder();
const validSha=s=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s);
const deny=code=>{throw Error(code)};
const requireValue=(condition,code)=>{if(!condition)deny(code)};
const hexBytes=s=>Uint8Array.from(s.match(/../g),x=>parseInt(x,16));
const chunks=function*(payload){
  for(let i=0;i<payload.length;i+=V2_LIMITS.fragment)
    yield payload.subarray(i,i+V2_LIMITS.fragment);
};
function requireCut(cut){
  requireValue(cut&&typeof cut.rows==='function'&&
    typeof cut.blob==='function'&&typeof cut.assertPinned==='function',
    'BACKUP_V2_PINNED_CUT_REQUIRED');
}
async function pinned(cut){
  requireValue(await cut.assertPinned()===true,'BACKUP_V2_PINNED_CUT_CHANGED');
}
async function* meta(cut){
  for await(const entry of cut.rows()){
    requireValue(entry&&DB_STORES.includes(entry.store)&&entry.row,
      'BACKUP_V2_PINNED_ROW_INVALID');
    if(entry.store==='meta')yield entry.row;
  }
}
function donorBytes(value){
  requireValue(typeof value==='string'&&value.length>0,
    'BACKUP_V2_DONOR_MISSING');
  const bytes=encoder.encode(value);
  requireValue(bytes.length<=V2_LIMITS.donor,'BACKUP_V2_DONOR_LIMIT');
  let data;
  try{data=JSON.parse(value)}catch{deny('BACKUP_V2_DONOR_INVALID')}
  requireValue(data?.format==='personamonkey-backup'&&
    data.formatVersion===1&&
    data.encryption?.scheme==='PBKDF2-SHA256/AES-256-GCM'&&
    typeof data.sealedPayload==='string'&&
    !Object.hasOwn(data,'payload'),'BACKUP_V2_DONOR_INVALID');
  return bytes;
}
// Preserve the frozen BLOB* CANONICAL* DONOR END grammar and native
// expectedPlaintextBytes requirement. Metadata is O(counts+digest-index)
// and never contains source base64, raw blobs or encoded CANONICAL frames.
// The donor envelope remains opaque and materialized by PersonaMonkey.
export async function compilePinnedV2(cut,donorEnvelope){
  requireCut(cut);
  await pinned(cut);
  const sourceAudit=await auditSourceClosureRows(meta(cut));
  await pinned(cut);
  const donor=donorBytes(donorEnvelope);
  const blobs=new Map(),rows=[],rowHashes=[];
  // Match the frozen compiler's null-prototype inventory dictionary.
  const counts=Object.create(null);
  for(const store of DB_STORES)counts[store]=0;
  let priorStore=-1,priorKey=null,plaintextBytes=0;
  for await(const {store,row} of cut.rows()){
    const storeIndex=DB_STORES.indexOf(store);
    requireValue(storeIndex>=0&&row&&
      Object.hasOwn(row,'key')&&Object.hasOwn(row,'value'),
      'BACKUP_V2_PINNED_ROW_INVALID');
    const key=canonicalJSON(row.key);
    requireValue(storeIndex>=priorStore&&
      (storeIndex!==priorStore||priorKey<key),
      'BACKUP_V2_PINNED_ROW_ORDER');
    priorStore=storeIndex;priorKey=key;
    requireValue(rows.length<100000,'BACKUP_V2_UNSUPPORTED_RECORD_COUNT');
    const local=new Map(),payload=encodeV2Row(row,store,local);
    const sha256=await digest(payload);
    for(const [sha,info] of local){
      requireValue(validSha(sha)&&
        Number.isSafeInteger(info.size)&&info.size>=0,
        'BACKUP_V2_BLOB_REFERENCE_INVALID');
      const previous=blobs.get(sha);
      if(previous!==undefined){
        requireValue(previous===info.size,'BACKUP_V2_BLOB_COLLISION');
      }else{
        requireValue(blobs.size<100000,'BACKUP_V2_UNSUPPORTED_BLOB_COUNT');
        blobs.set(sha,info.size);
        plaintextBytes+=9+32+info.size;
      }
    }
    // Retain a fixed-size key commitment, never cumulative multi-MiB IDB keys.
    rows.push({store,keySha256:await digest(key),length:payload.length,sha256});
    rowHashes.push(sha256);
    counts[store]++;
    plaintextBytes+=9+payload.length;
  }
  await pinned(cut);
  const refs=[...blobs.keys()].sort();
  const terminal={schema:2,canonicalRows:rows.length,
    storeCounts:counts,uniqueBlobs:blobs.size,donorSections:1,
    sourceRefsSha256:await digest(refs.join('\n')),
    rowDigestsSha256:await digest(rowHashes.join('\n')),
    donorSha256:await digest(donor)};
  const ending=encoder.encode(canonicalJSON(terminal));
  requireValue(ending.length<=V2_LIMITS.end,'BACKUP_V2_END_LIMIT');
  plaintextBytes+=9+donor.length+9+ending.length;
  requireValue(Number.isSafeInteger(plaintextBytes)&&
    plaintextBytes<=2**36-32,'BACKUP_V2_LENGTH_INVALID');
  return Object.freeze({cut,sourceAudit,blobs,rows,refs,donor,
    terminal,ending,plaintextBytes});
}
export async function* streamPinnedV2Frames(plan){
  requireValue(plan&&plan.cut&&Array.isArray(plan.refs)&&
    Array.isArray(plan.rows),'BACKUP_V2_PINNED_PLAN_REQUIRED');
  const cut=plan.cut;
  await pinned(cut);
  for(const sha of plan.refs){
    const raw=await cut.blob(sha);
    requireValue(raw instanceof Uint8Array&&
      raw.length===plan.blobs.get(sha)&&
      raw.length<=V2_LIMITS.blob-32&&
      await digest(raw)===sha,'BACKUP_V2_PINNED_BLOB_CHANGED');
    yield frameHeader(V2_FRAME.BLOB,raw.length+32);
    yield hexBytes(sha);
    yield* chunks(raw);
    await pinned(cut);
  }
  let i=0,priorStore=-1,priorKey=null;
  for await(const entry of cut.rows()){
    const descriptor=plan.rows[i++];
    requireValue(descriptor&&entry?.store===descriptor.store,
      'BACKUP_V2_PINNED_ROW_CHANGED');
    const key=canonicalJSON(entry.row?.key);
    const si=DB_STORES.indexOf(entry.store);
    requireValue(si>=priorStore&&
      (si!==priorStore||priorKey<key)&&
      await digest(key)===descriptor.keySha256,
      'BACKUP_V2_PINNED_ROW_CHANGED');
    priorStore=si;priorKey=key;
    const payload=encodeV2Row(entry.row,entry.store,new Map());
    requireValue(payload.length===descriptor.length&&
      await digest(payload)===descriptor.sha256,
      'BACKUP_V2_PINNED_ROW_CHANGED');
    yield frameHeader(V2_FRAME.CANONICAL,payload.length);
    yield* chunks(payload);
    await pinned(cut);
  }
  requireValue(i===plan.rows.length,'BACKUP_V2_PINNED_ROW_CHANGED');
  await pinned(cut);
  yield frameHeader(V2_FRAME.DONOR,plan.donor.length);
  yield* chunks(plan.donor);
  yield frameHeader(V2_FRAME.END,plan.ending.length);
  yield* chunks(plan.ending);
  await pinned(cut);
}
