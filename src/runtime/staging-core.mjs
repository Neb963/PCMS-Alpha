// I09 byte-level source and editor admission. All functions are effect-free.
import {fail} from './journal.mjs';

const hex=/^[a-f0-9]{64}$/;
const utf8=new TextEncoder();
const id=/^[a-z0-9][a-z0-9-]{0,99}$/;
export const safeAssetPath=p=>typeof p==='string' && p.startsWith('src/') &&
  p.length<=240 && p===p.normalize('NFC') &&
  p.split('/').every(s=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(s) &&
    s!=='.'&&s!=='..'&&!s.endsWith('.'));
const allowed=p=>p==='main.pjs'||p==='index.html'||safeAssetPath(p);
async function sha(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
    .map(x=>x.toString(16).padStart(2,'0')).join('');
}
function decode(base64) {
  if(typeof base64!=='string'||base64.length>17_000_000||
     !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(base64))
    throw Error('INVALID_BASE64');
  return Uint8Array.from(atob(base64),ch=>ch.charCodeAt(0));
}
function sort(files) {
  return files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
}
export async function exactSource(files) {
  if(!Array.isArray(files)||files.length<2||files.length>502)return fail('SOURCE_MANIFEST_UNVERIFIED');
  let size=0;const seen=new Set(),proof=[],bytes=[];
  try{
    for(const item of files){
      if(!item||!allowed(item.path)||seen.has(item.path.toLowerCase()))
        return fail('SOURCE_PATH_UNVERIFIED');
      seen.add(item.path.toLowerCase());
      const raw=decode(item.base64);
      if(raw.length>12*1024*1024||(size+=raw.length)>16*1024*1024)
        return fail('SOURCE_TOO_LARGE');
      const digest=await sha(raw);
      if(item.size!==undefined&&item.size!==raw.length)return fail('SOURCE_BYTE_MISMATCH');
      if(item.sha256!==undefined&&(!hex.test(item.sha256)||item.sha256!==digest))
        return fail('SOURCE_BYTE_MISMATCH');
      // Root text must be valid UTF-8 and roundtrip without normalization.
      if(item.path==='main.pjs'||item.path==='index.html'){
        const text=new TextDecoder('utf-8',{fatal:true}).decode(raw);
        if(!utf8.encode(text).every((v,i)=>v===raw[i]))return fail('SOURCE_TEXT_UNVERIFIED');
      }
      proof.push({path:item.path,size:raw.length,sha256:digest});
      bytes.push({path:item.path,base64:item.base64});
    }
  }catch{return fail('SOURCE_BYTE_UNVERIFIED');}
  if(!seen.has('main.pjs')||!seen.has('index.html'))return fail('ROOT_FILES_REQUIRED');
  sort(proof);sort(bytes);
  const fingerprint=await sha(utf8.encode('PCMS_STAGED_SOURCE_V1\n'+
    proof.map(x=>JSON.stringify([x.path,x.size,x.sha256])).join('\n')));
  return {ok:true,fingerprint,files:proof,blobs:bytes,totalBytes:size};
}
export function editorAdmission({
  slug,expectedSlug,editor,tab,expectedTab,sourceFingerprint,expectedFingerprint
}) {
  if(!id.test(slug||'')||slug!==expectedSlug)return fail('GENERATOR_CHANGED');
  if(!tab||tab.tabId!==expectedTab?.tabId||
     tab.cookieStoreId!==expectedTab?.cookieStoreId||
     tab.ownershipNonce!==expectedTab?.ownershipNonce||
     tab.location!==`https://perchance.org/${slug}#edit`)
    return fail('TAB_OWNER_UNKNOWN');
  if(!editor||editor.dirty!==false||editor.srcDirty!==false||
     editor.savePending!==false||editor.collaboration!=='ABSENT'||
     editor.owner==='HUMAN'||editor.owner!=='PCMS'||
     editor.status!=='PROVEN_CLEAN')return fail('EDITOR_UNKNOWN');
  if(!hex.test(sourceFingerprint||'')||sourceFingerprint!==expectedFingerprint)
    return fail('SOURCE_DRIFT');
  return {ok:true,code:'EDITOR_ADMISSIBLE'};
}
export function diffSource(previous,candidate) {
  if(!previous?.ok||!candidate?.ok)return fail('SOURCE_UNVERIFIED');
  const old=new Map(previous.files.map(f=>[f.path,f]));
  const next=new Map(candidate.files.map(f=>[f.path,f]));
  const changes=[];
  for(const f of candidate.files) {
    const p=old.get(f.path);
    if(!p||p.sha256!==f.sha256)changes.push({path:f.path,kind:p?'CHANGED':'ADDED'});
  }
  for(const f of previous.files)if(!next.has(f.path))
    changes.push({path:f.path,kind:'DELETED'});
  changes.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  return {ok:true,changes};
}
export async function verifyReadback(expected, observed, context) {
  if(!expected?.ok||observed?.source!=='DONOR_GUARDED_ORIGINAL_READBACK'||
     observed.ok!==true||observed.slug!==context?.slug||
     observed.accountId!==context.accountId||
     observed.personaUid!==context.personaUid||
     observed.principalFingerprint!==context.principalFingerprint||
     observed.remotePublicId!==context.remotePublicId||
     observed.ownerResult!=='IS_OWNER'||observed.visibility!=='UNLISTED')
    return fail('SOURCE_READBACK_UNTRUSTED');
  const actual=await exactSource([
    {path:'main.pjs',base64:btoa(unescape(encodeURIComponent(observed.pjs||'')))},
    {path:'index.html',base64:btoa(unescape(encodeURIComponent(observed.html||'')))},
    ...(Array.isArray(observed.assets)?observed.assets:[])
  ]);
  if(!actual.ok)return actual;
  const diffs=diffSource(expected,actual);
  if(!diffs.ok||diffs.changes.length)
    return {ok:false,code:'SOURCE_UNVERIFIED',paths:diffs.changes.map(f=>f.path).slice(0,32)};
  return {ok:true,source:'INDEPENDENT_FULL_BYTE_READBACK',fingerprint:actual.fingerprint,
    files:actual.files};
}
