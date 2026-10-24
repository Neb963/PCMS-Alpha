// Plain browser archive recovery evidence, never a disk/authentication claim.
// Called only from the export coordinator after codec/source audit and again
// after a matching browser download-completion receipt. No public port.
import {readPortableArchive} from './portable-archive.mjs';
import {recoveredAdoptionWitnesses} from './adoption-recovery.mjs';
import {createAdoptionStore} from './adoption-store.mjs';
const hash=/^[a-f0-9]{64}$/;
const validRun=v=>/^(auto|manual)_[a-f0-9]{32}$/.test(v||'');
function saved(db,runId,value){return new Promise((resolve,reject)=>{
 const tx=db.transaction(['meta'],value?'readwrite':'readonly'),meta=tx.objectStore('meta');let result;
 tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(Error('PORTABLE_WITNESS_STORE_FAILED'));
 const key='backup:portable-originals:'+runId;
 if(value){meta.put({key,...value});result=value;}
 else meta.get(key).onsuccess=e=>{result=e.target.result};
});}
export async function preparePortableOriginals(db,archive,runId,sha256){
 if(!validRun(runId)||!hash.test(sha256||''))throw Error('PORTABLE_WITNESS_INVALID');
 const decoded=await readPortableArchive(archive.blob);
 if(decoded.integrity!=='FRAME_AND_SOURCE_VERIFIED')throw Error('PORTABLE_SOURCE_NOT_VERIFIED');
 const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-256',await archive.blob.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(actual!==sha256)throw Error('PORTABLE_ARCHIVE_DIGEST_CHANGED');
 return saved(db,runId,{runId,sha256,bytes:archive.bytes,
  integrity:decoded.integrity,witnesses:recoveredAdoptionWitnesses(decoded.canonical),diskReadback:false});
}
export async function completePortableOriginals(db,{runId,sha256,bytes,browserCompleted}){
 if(!validRun(runId)||!hash.test(sha256||'')||browserCompleted!==true)return {ok:false,code:'PORTABLE_COMPLETION_REQUIRED'};
 const cut=await saved(db,runId);
 if(!cut||cut.sha256!==sha256||cut.bytes!==bytes||cut.integrity!=='FRAME_AND_SOURCE_VERIFIED')
  return {ok:false,code:'PORTABLE_SOURCE_WITNESS_REQUIRED'};
 const store=createAdoptionStore(db);let qualified=0,held=0,already=0;
 for(const w of cut.witnesses){
  const found=await store.getFull(w.slug),a=found.record;
  if(a?.originalCheckpoint?.receiptId===runId&&a.originalCheckpoint.archiveDigest===sha256){already++;continue;}
  if(!found.ok||a.archived||a.archiveState!=='ARCHIVED_GIT_CONFIRMED'||a.revision!==w.revision||
     a.accountId!==w.accountId||a.personaUid!==w.personaUid||a.bindingVersion!==w.bindingVersion||
     a.remotePublicId!==w.remotePublicId||a.original?.fingerprint!==w.fingerprint||
     a.archiveCommit!==w.archiveCommit||a.archiveRef!==w.archiveRef){held++;continue;}
  const out=await store.confirmCheckpoint({slug:w.slug,expectedRevision:w.revision,proof:{
    source:'INDEPENDENT_PORTABLE_SOURCE_RECOVERY',verified:true,receiptId:runId,
    archiveDigest:sha256,originalFingerprint:w.fingerprint,archiveCommit:w.archiveCommit,archiveRef:w.archiveRef}});
  if(out.ok)qualified++;else held++;
 }
 return {ok:true,qualified,held,already,diskReadback:false,source:'INDEPENDENT_PORTABLE_SOURCE_RECOVERY'};
}
