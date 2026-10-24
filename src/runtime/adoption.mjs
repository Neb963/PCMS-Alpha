// I07 — exact, bounded, fail-closed original-source evidence. No provider effects.
import {fail,isSafeId} from './journal.mjs';
import {exactSource} from './staging-core.mjs';
const slugPattern=/^[a-z0-9][a-z0-9-]{0,99}$/;
const hex=/^[a-f0-9]{64}$/;
const assetPath=p=>typeof p==='string' && p.startsWith('src/') &&
  p.length<=240 && p===p.normalize('NFC') &&
  p.split('/').every(x=>/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,99}$/.test(x) &&
    x!=='.' && x!=='..' && !x.endsWith('.'));
const sha256=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
  .map(x=>x.toString(16).padStart(2,'0')).join('');
const utf8=s=>new TextEncoder().encode(s);
const toBase64=bytes=>{let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);};
function decode(b64) {
  if(typeof b64!=='string'||b64.length>16000000||
     !/^[a-zA-Z0-9+/]*={0,2}$/.test(b64))throw Error('INVALID_BASE64');
  const raw=atob(b64);
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
}
export function continuity(previous, observed) {
  if(!previous)return {ok:true,code:'NEW_TARGET'};
  if(previous.slug!==observed?.slug ||
     previous.accountId!==observed?.accountId ||
     previous.personaUid!==observed?.personaUid ||
     previous.bindingVersion!==observed?.bindingVersion ||
     previous.remotePublicId!==observed?.remotePublicId ||
     previous.principalFingerprint!==observed?.principalFingerprint)
    return fail('REASSOCIATION_REQUIRED');
  if(previous.archived===true)return fail('TOMBSTONE_HELD');
  return {ok:true,code:'SAME_TARGET'};
}
export function validateAdoptionIntent(row,account,request) {
  if(!row||!account||!request||!slugPattern.test(request.slug)||
     row.slug!==request.slug||row.ownerState!=='OBSERVED_OWNER'||
     !['PUBLIC','UNLISTED'].includes(row.visibility)||
     row.accountId!==account.accountId||row.personaUid!==account.personaUid||
     row.accountRevision!==account.revision||
     row.bindingVersion!==account.bindingVersion||
     account.state!=='VERIFIED'||account.identity?.source!=='GUARDED_SESSION_READBACK'||
     account.identity?.bindingVersion!==account.bindingVersion||
     !hex.test(account.identity?.principalFingerprint||''))
    return fail('OWNER_CONTEXT_UNVERIFIED');
  if(!Number.isSafeInteger(request.expectedRevision)||
     row.revision!==request.expectedRevision)return fail('STALE_REVISION');
  // C-10: the standing account-level management grant covers verified owned
  // public generators; no per-generator approval. Adoption is read-only.
  if(row.visibility==='PUBLIC'&&request.explicitPublicConsent!==true&&
     request.standingManagement!==true)
    return fail('PUBLIC_ADOPTION_CONSENT_REQUIRED');
  if(row.visibility==='UNLISTED'&&request.explicitPublicConsent===true)
    return fail('VISIBILITY_CHANGED');
  return {ok:true};
}
// A source fingerprint is computed from actual bytes, not a remote saved flag,
// srcManifest filenames, mutable URL, browser page text, or a Git folder name.
export async function verifyOriginal(packet, row, account) {
  if(!packet||packet.ok!==true||
     packet.source!=='DONOR_GUARDED_ORIGINAL_READBACK'||
     packet.slug!==row?.slug||packet.accountId!==row.accountId||
     packet.personaUid!==account?.personaUid||
     packet.principalFingerprint!==account?.identity?.principalFingerprint||
     packet.ownerResult!=='IS_OWNER'||packet.visibility!==row.visibility||
     typeof packet.remotePublicId!=='string'||!isSafeId(packet.remotePublicId)||
     !Number.isSafeInteger(packet.observedAt)||packet.observedAt<1 ||
     typeof packet.pjs!=='string'||typeof packet.html!=='string'||
     !Array.isArray(packet.assets)||packet.assets.length>500)
    return fail('ORIGINAL_SOURCE_UNVERIFIED');
  const pjs=utf8(packet.pjs),html=utf8(packet.html);
  if(pjs.length>8*1024*1024||html.length>8*1024*1024)
    return fail('ORIGINAL_SOURCE_TOO_LARGE');
  const blobs=[{path:'main.pjs',bytes:pjs},{path:'index.html',bytes:html}];
  const names=new Set(['main.pjs','index.html']);let bytes=pjs.length+html.length;
  try{
    for(const asset of packet.assets) {
      if(!assetPath(asset?.path)||names.has(asset.path.toLowerCase()))
        return fail('ORIGINAL_ASSET_PATH_UNVERIFIED');
      const raw=decode(asset.base64);
      if(raw.length!==asset.size||raw.length>12*1024*1024||
         !hex.test(asset.sha256)||await sha256(raw)!==asset.sha256)
        return fail('ORIGINAL_ASSET_BYTES_UNVERIFIED');
      names.add(asset.path.toLowerCase());bytes+=raw.length;
      if(bytes>16*1024*1024)return fail('ORIGINAL_SOURCE_TOO_LARGE');
      blobs.push({path:asset.path,bytes:raw});
    }
  }catch{return fail('ORIGINAL_ASSET_BYTES_UNVERIFIED');}
  blobs.sort((a,b)=>a.path.localeCompare(b.path,'en'));
  const fileProof=[];
  for(const b of blobs)fileProof.push({path:b.path,size:b.bytes.length,
    sha256:await sha256(b.bytes)});
  const fingerprint=await sha256(utf8('PCMS_ORIGINAL_V1\n'+
    fileProof.map(f=>JSON.stringify([f.path,f.size,f.sha256])).join('\n')));
  // Refresher uses the exact staged-source manifest encoding. Preserve the
  // independent I07 original fingerprint and original bytes unchanged.
  const staged=await exactSource(blobs.map(b=>({
    path:b.path,base64:toBase64(b.bytes)})));
  if(!staged.ok)return fail('ADOPTION_STAGED_SOURCE_UNVERIFIED');
  return {ok:true,source:'INDEPENDENT_FULL_BYTE_READBACK',
    stagedFingerprint:staged.fingerprint,sourceStage:'PCMS_STAGED_SOURCE_V1',
    fingerprint,remotePublicId:packet.remotePublicId,
    visibility:packet.visibility,observedAt:packet.observedAt,
    files:fileProof,blobs:blobs.map(b=>({
      path:b.path,base64:toBase64(b.bytes)
    }))};
}
export function publicAdoption(record) {
  if(!record)return fail('ADOPTION_NOT_FOUND');
  return {ok:true,slug:record.slug,accountId:record.accountId,
    visibility:record.visibility,management:record.management,
    revision:record.revision,archived:record.archived===true,
    originalFingerprint:record.original?.fingerprint||null,
    originalFiles:record.original?.files?.length||0,
    archive:record.archiveState||'ARCHIVE_PENDING',
    originalProtected:record.archiveState==='ARCHIVED_GIT_CONFIRMED'&&record.originalCheckpoint?.qualified===true,
    checkpointSource:record.originalCheckpoint?.source||null,
    source:'LOCAL_IMMUTABLE_ORIGINAL',providerWrites:'OFF',
    deployWrites:'OFF',publication:'OFF'};
}
