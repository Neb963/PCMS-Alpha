// A06: additive, source-preserving upgrade of old I07 adoptions.
// Old originals used the PCMS_ORIGINAL_V1 digest; Refresher needs the separate
// PCMS_STAGED_SOURCE_V1 digest of EXACTLY the same complete bytes. No provider,
// Git, native host, source change, or implicit publication occurs here.
import {exactSource} from './staging-core.mjs';
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
  .map(x=>x.toString(16).padStart(2,'0')).join('');
const HEX=/^[a-f0-9]{64}$/;
const invalid=code=>({ok:false,code});
const safeFiles=v=>Array.isArray(v)&&v.length>=2&&v.length<=502&&v.every(f=>
  typeof f?.path==='string'&&Number.isSafeInteger(f.size)&&f.size>=0&&
  HEX.test(f.sha256||''));

export async function certifyLegacyAdoptionOriginal(original){
  if(original?.ok!==true||original.source!=='INDEPENDENT_FULL_BYTE_READBACK'||
     !HEX.test(original.fingerprint||'')||
     !safeFiles(original.files)||!Array.isArray(original.blobs)||
     original.blobs.length!==original.files.length)
    return invalid('ORIGINAL_PROVENANCE_UNVERIFIED');
  const actual=await exactSource(original.blobs);
  if(!actual.ok||actual.files.length!==original.files.length)
    return invalid('ORIGINAL_SOURCE_INVALID');
  const before=[...original.files].sort((a,b)=>a.path.localeCompare(b.path,'en'));
  const after=new Map(actual.files.map(f=>[f.path,f]));
  if(before.some(f=>{const x=after.get(f.path);return !x||
    x.size!==f.size||x.sha256!==f.sha256;}))
    return invalid('ORIGINAL_BYTES_CHANGED');
  const originalFingerprint=await sha(new TextEncoder().encode('PCMS_ORIGINAL_V1\n'+
    before.map(f=>JSON.stringify([f.path,f.size,f.sha256])).join('\n')));
  if(originalFingerprint!==original.fingerprint)
    return invalid('ORIGINAL_DIGEST_CHANGED');
  return {ok:true,sourceStage:'PCMS_STAGED_SOURCE_V1',
    stagedFingerprint:actual.fingerprint};
}

let lastCursor='';
function scanLegacy(db,limit){
  return new Promise((resolve,reject)=>{
    const candidates=[],past=[],prior=lastCursor;
    let tx,examined=0;
    try{tx=db.transaction(['meta'],'readonly');}catch{return reject(Error('ADOPTION_SCAN_UNAVAILABLE'));}
    tx.onabort=()=>reject(Error('ADOPTION_SCAN_ABORTED'));
    tx.oncomplete=()=>{
      // Rotation of candidate selection is an optimization, not authority.
      // Already migrated records are never processed again.
      const selected=candidates.length?candidates:past;
      if(selected.length)lastCursor=selected.at(-1).key;
      else lastCursor='';
      resolve(selected.slice(0,limit));
    };
    tx.objectStore('meta').openCursor().onsuccess=e=>{
      const cursor=e.target.result;
      if(!cursor)return;
      if(++examined>50000){tx.abort();return;}
      const k=cursor.key,a=cursor.value?.adoption;
      if(typeof k==='string'&&k.startsWith('adoption:')&&a&&
         a.original?.source==='INDEPENDENT_FULL_BYTE_READBACK'&&
         a.original?.sourceStage!=='PCMS_STAGED_SOURCE_V1'&&
         Number.isSafeInteger(a.revision)&&a.revision>0){
        const item={key:k,revision:a.revision,original:a.original};
        if(k>prior&&candidates.length<limit)candidates.push(item);
        else if(k<=prior&&past.length<limit)past.push(item);
      }
      cursor.continue();
    };
  });
}
function backfillOne(db,entry,verified){
  return new Promise((resolve,reject)=>{
    let tx,result={ok:false,code:'ADOPTION_RECONCILE_ABORTED'};
    try{tx=db.transaction(['meta','events'],'readwrite');}
    catch{return reject(Error('ADOPTION_UPDATE_UNAVAILABLE'));}
    tx.onabort=()=>reject(Error('ADOPTION_UPDATE_ABORTED'));
    tx.oncomplete=()=>resolve(result);
    const meta=tx.objectStore('meta');
    meta.get(entry.key).onsuccess=e=>{
      const saved=e.target.result,old=saved?.adoption;
      if(!old||old.revision!==entry.revision||
         old.original?.fingerprint!==entry.original.fingerprint||
         old.original?.sourceStage==='PCMS_STAGED_SOURCE_V1'||
         JSON.stringify(old.original?.files)!==JSON.stringify(entry.original.files)||
         JSON.stringify(old.original?.blobs)!==JSON.stringify(entry.original.blobs)){
        result=invalid('ADOPTION_CHANGED_DURING_PROOF');return;
      }
      const next={...old,revision:old.revision+1,
        original:{...old.original,...verified}};
      meta.put({...saved,adoption:next});
      tx.objectStore('events').add({stage:'ADOPTION_SOURCE_DIGEST_BACKFILLED',
        scopeId:old.slug,fingerprint:verified.stagedFingerprint,
        revision:next.revision});
      result={ok:true,code:'ADOPTION_SOURCE_PROVEN'};
    };
  });
}
// Called only by guarded background alarm; a failed candidate does not open
// source-writing authority. Limit cryptographic and IDB work per wake.
export async function backfillLegacyAdoptions(db,{limit=2,shouldHold=async()=>false}={}){
  if(typeof shouldHold!=='function')return invalid('MIGRATION_HOLD_CHECK_INVALID');
  if(await shouldHold())return invalid('RESTORE_HOLD');
  if(!Number.isSafeInteger(limit)||limit<1||limit>2)
    return invalid('MIGRATION_BATCH_INVALID');
  const candidates=await scanLegacy(db,limit);
  let migrated=0,held=0;
  for(const candidate of candidates){
    let proof;
    try{proof=await certifyLegacyAdoptionOriginal(candidate.original);}
    catch{proof=invalid('ORIGINAL_BYTES_INVALID');}
    if(!proof.ok){held++;continue;}
    if(await shouldHold())return {ok:false,code:'RESTORE_HOLD',migrated,held};
    try{
      const written=await backfillOne(db,candidate,proof);
      written.ok?migrated++:held++;
    }catch{held++;}
  }
  return {ok:true,migrated,held};
}
