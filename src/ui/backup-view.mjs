// I08: explicit local manual backup. No provider/Git writes, restore or key storage.
// Real donor portable serialization and independent decrypt verification are required.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {createPortableBackupPayload,encodeBackupEnvelope,decodeBackupEnvelope} from '../lib/backup-package.js';
import {filterOrdinaryAutomationJobs} from '../lib/automation-history.js';
import {snapshotCanonical,consistentOrThrow,encodeIntegrated,decodeIntegrated,
  observeDownload,MAX_ARCHIVE_BYTES} from './backup-core.mjs';

const $=id=>document.getElementById(id);
const button=$('pcms-backup-export'),pass=$('pcms-backup-passphrase');
const result=$('pcms-backup-status'),overview=$('pcms-overview-backup');
const waitMs=10*60*1000;
const codeOf=e=>{
  const code=e?.message||'BACKUP_FAILED';
  return /^[A-Z][A-Z0-9_]{3,60}$/.test(code)?code:'BACKUP_FAILED';
};
async function receipt(db,runId,status,details={}){
  return new Promise((resolve,reject)=>{
    let tx;
    try{tx=db.transaction(['meta'],'readwrite');}catch{reject(Error('BACKUP_IDB_UNAVAILABLE'));return;}
    let accepted=false;
    tx.oncomplete=()=>resolve(accepted);
    tx.onabort=()=>reject(Error('BACKUP_RECEIPT_FAILED'));
    const store=tx.objectStore('meta');
    store.get('backup:manual-active').onsuccess=event=>{
      const before=event.target.result;
      if(before?.runId!==runId){tx.abort();return;}
      store.put({key:'backup:manual-active',runId,startedAt:before.startedAt,
        status,updatedAt:Date.now(),tier:details.tier||0,
        code:details.code||status,expectedSha256:details.expectedSha256||before.expectedSha256||null,
        downloadId:Number.isSafeInteger(details.downloadId)?details.downloadId:
          Number.isSafeInteger(before.downloadId)?before.downloadId:null,
        expectedBytes:Number.isSafeInteger(details.expectedBytes)?details.expectedBytes:
          Number.isSafeInteger(before.expectedBytes)?before.expectedBytes:null});
      accepted=true;
    };
  });
}
async function claim(db){
  return new Promise((resolve,reject)=>{
    let tx;
    try{tx=db.transaction(['meta'],'readwrite');}catch{reject(Error('BACKUP_IDB_UNAVAILABLE'));return;}
    let runId=null;
    tx.oncomplete=()=>runId?resolve(runId):reject(Error('BACKUP_BUSY'));
    tx.onabort=()=>reject(Error('BACKUP_IDB_UNAVAILABLE'));
    const store=tx.objectStore('meta');
    store.get('backup:manual-active').onsuccess=event=>{
      const old=event.target.result;
      if(old&&['PREPARING','INTERNAL_VERIFIED','DOWNLOAD_STARTED'].includes(old.status)&&
        Date.now()-old.updatedAt<waitMs)return;
      runId='manual_'+crypto.randomUUID().replaceAll('-','');
      store.put({key:'backup:manual-active',runId,status:'PREPARING',
        tier:0,code:'PREPARING',startedAt:Date.now(),updatedAt:Date.now()});
    };
  });
}
async function currentReceipt(db){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(['meta'],'readonly');
    tx.objectStore('meta').get('backup:manual-active').onsuccess=e=>resolve(e.target.result||null);
    tx.onabort=()=>reject(Error('BACKUP_IDB_UNAVAILABLE'));
  });
}
async function readDonor(){
  const snapshot=await browser.runtime.sendMessage({type:'GET_SNAPSHOT'});
  if(!snapshot?.state||!Array.isArray(snapshot.containers))throw Error('BACKUP_DONOR_UNAVAILABLE');
  return {state:snapshot.state,containers:snapshot.containers};
}
function relevantStorage(snapshot){
  const out=Object.create(null);
  for(const [k,v] of Object.entries(snapshot||{})){
    if(k.startsWith('gm-values:')||k==='automationJobs')out[k]=v;
  }
  return out;
}
async function readDonorStorage(){
  try{return relevantStorage(await browser.storage.local.get(null));}
  catch{throw Error('BACKUP_DONOR_STORAGE_UNAVAILABLE');}
}
async function readCookies(portable){
  const result=Object.create(null);
  for(const p of portable.personas){
    let cookies;
    try{cookies=await browser.runtime.sendMessage({type:'PERSONA_COOKIES_LIST',profileId:p.sourceId});}
    catch{throw Error('BACKUP_COOKIE_UNAVAILABLE');}
    if(!Array.isArray(cookies))throw Error('BACKUP_COOKIE_UNAVAILABLE');
    result[p.sourceId]=cookies;
  }
  return result;
}
function fingerprint(value){
  // Explicitly checks changed source/schema/state rather than silently
  // upgrading a mixed donor/PCMS observation to an atomic snapshot.
  return JSON.stringify(value);
}
function archiveName(){
  return 'pcms-backups/pcms-alpha-'+new Date().toISOString().replace(/[:.]/g,'-').toLowerCase()+
    '-'+crypto.randomUUID().replaceAll('-','').slice(0,12)+'.encrypted';
}
async function exportManual(password){
  let db,runId=null,url=null;
  try{
    const sentinel=createRestoreSentinel(browser.storage.local);
    if((await sentinel.inspect()).held)throw Error('BACKUP_RESTORE_HOLD');
    db=await openCanonicalDatabase();
    runId=await claim(db);
    result.textContent='Preparing a consistent encrypted cut; no provider writes.';
    const donorBefore=await readDonor(),storageBefore=await readDonorStorage();
    const pcms=await snapshotCanonical(db);
    // Donor-approved complete serializer, no inferred right to export native
    // WireGuard private configurations or unportable browser secrets.
    const preliminary=createPortableBackupPayload({
      state:donorBefore.state,containers:donorBefore.containers,
      userscriptData:storageBefore,automationHistory:
        filterOrdinaryAutomationJobs(Object.values(storageBefore.automationJobs||{})),
      selection:{kind:'full'}
    });
    const cookies=await readCookies(preliminary);
    const portable=createPortableBackupPayload({
      state:donorBefore.state,containers:donorBefore.containers,
      cookiesByProfile:cookies,userscriptData:storageBefore,
      automationHistory:filterOrdinaryAutomationJobs(Object.values(storageBefore.automationJobs||{})),
      selection:{kind:'full'}
    });
    const donorEnvelope=await encodeBackupEnvelope({payload:portable,
      password,scope:{kind:'full'},appVersion:browser.runtime.getManifest().version,
      stateSchemaVersion:donorBefore.state.schemaVersion});
    // Re-read independent stores. A source/Persona/cookie change means the
    // mixed cut is not certified; none of the preliminary bytes may download.
    const [donorAfter,storageAfter,pcmsAfter,cookiesAfter]=await Promise.all([
      readDonor(),readDonorStorage(),snapshotCanonical(db),readCookies(preliminary)
    ]);
    consistentOrThrow(pcms,pcmsAfter);
    consistentOrThrow(fingerprint(donorBefore),fingerprint(donorAfter));
    consistentOrThrow(fingerprint(storageBefore),fingerprint(storageAfter));
    consistentOrThrow(fingerprint(cookies),fingerprint(cookiesAfter));
    if((await sentinel.inspect()).held)throw Error('BACKUP_RESTORE_HOLD');
    const archive=await encodeIntegrated({pcms,donorEnvelope,passphrase:password,
      appVersion:browser.runtime.getManifest().version});
    // True in-memory roundtrip including donor's own encrypted portable
    // source/hash validation. Not a claim that browser wrote bytes to disk.
    const opened=await decodeIntegrated(archive.text,password,{decodeDonor:decodeBackupEnvelope});
    consistentOrThrow(opened.pcms,pcms);
    if(archive.bytes.byteLength>MAX_ARCHIVE_BYTES)throw Error('BACKUP_TOO_LARGE');
    await receipt(db,runId,'INTERNAL_VERIFIED',{tier:1,code:'INTERNAL_VERIFIED',
      expectedSha256:archive.sha256,expectedBytes:archive.bytes.byteLength});
    result.textContent='Encrypted internal archive verified (tier 1). Starting browser download…';
    url=URL.createObjectURL(new Blob([archive.bytes],{type:'application/octet-stream'}));
    const id=await browser.downloads.download({url,filename:archiveName(),
      conflictAction:'uniquify',saveAs:false});
    if(!Number.isSafeInteger(id)||id<0)throw Error('DOWNLOAD_ID_INVALID');
    await receipt(db,runId,'DOWNLOAD_STARTED',{tier:1,downloadId:id});
    const proof=await observeDownload(browser.downloads,id,archive.bytes.byteLength);
    await receipt(db,runId,proof.tier===2?'BROWSER_REPORTED_COMPLETE':'DOWNLOAD_UNVERIFIED',{
      tier:proof.tier,code:proof.code,downloadId:id});
    if(proof.tier===2){
      result.textContent='Browser reported complete (tier 2): '+proof.actualName+
        '. '+archive.bytes.byteLength+' bytes. SHA-256 '+archive.sha256+
        '. Exact on-disk bytes have NOT been independently re-read. Restore remains disabled.';
    }else{
      result.textContent='Encrypted bytes verified in memory (tier 1), but browser download not confirmed: '+
        proof.code+'. No disk-backup success claimed; check Downloads.';
    }
  }catch(e){
    if(db&&runId){
      try{await receipt(db,runId,'FAILED',{tier:0,code:codeOf(e)});}catch{}
    }
    result.textContent='Backup not confirmed: '+codeOf(e)+
      '. No plaintext fallback and no recoverable-file claim.';
  }finally{
    if(url)URL.revokeObjectURL(url);
    try{db?.close();}catch{}
    button.disabled=false;pass.disabled=false;pass.value='';
  }
}
async function showLast(){
  let db;
  try{
    db=await openCanonicalDatabase();
    const row=await currentReceipt(db);
    overview.textContent=!row?'No manual integrated backup receipt.':
      'Last manual archive: '+row.status+
      ' · evidence tier '+row.tier+
      ' · '+row.code+
      '. Tier 2 means browser-reported, not independently verified disk bytes.';
  }catch{
    overview.textContent='Backup receipt unavailable. No verified backup inferred.';
  }finally{try{db?.close();}catch{}}
}
button.addEventListener('click',()=>{
  if(button.disabled)return;
  const value=pass.value;
  if(value.length<12){
    result.textContent='A portable recovery passphrase of at least 12 characters is required; no archive created.';
    pass.focus();return;
  }
  button.disabled=true;pass.disabled=true;pass.value='';
  void exportManual(value).finally(()=>void showLast());
});
void showLast();
