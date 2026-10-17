import {scanV2AuthenticatedFrames} from './restore-v2-frame-scanner.mjs';
// S02 bounded-memory, inactive second-pass staging in a disposable/held Firefox
// profile. Plaintext cannot be read as authoritative until terminal native
// second-pass authentication and exact immutable ciphertext digest agree.
// Does not mutate the canonical database, donor, routes, provider or Git.
const NAME='pcms-alpha-v2-restore-stage',MAX_CHUNK=49152;
// Never persist plaintext source, cookies or donor in browser IndexedDB.
// Stage keys are nonextractable and transient to this live extension context;
// an event-page cold restart deliberately makes old stages unreadable/HELD.
const volatileKeys=new Map();
async function freshKey(){
  return crypto.subtle.generateKey({name:'AES-GCM',length:256},false,
    ['encrypt','decrypt']);
}
async function sealChunk(runId,bytes){
  const key=volatileKeys.get(runId);
  insist(key,'RESTORE_V2_VOLATILE_KEY_UNAVAILABLE');
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const sealed=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,bytes);
  return {ciphertext:base64(new Uint8Array(sealed)),iv:base64(iv)};
}
async function openChunk(runId,row){
  const key=volatileKeys.get(runId);
  insist(key,'RESTORE_V2_VOLATILE_KEY_UNAVAILABLE');
  insist(row&&typeof row.ciphertext==='string'&&typeof row.iv==='string',
    'RESTORE_V2_STAGE_UNSEALED');
  const iv=unbase64(row.iv);
  insist(iv.length===12,'RESTORE_V2_STAGE_IV_INVALID');
  let raw;
  try{
    raw=await crypto.subtle.decrypt({name:'AES-GCM',iv},key,
      unbase64(row.ciphertext));
  }catch{throw Error('RESTORE_V2_STAGE_AUTH_FAILED')}
  return new Uint8Array(raw);
}
const runOK=s=>typeof s==='string'&&/^s02_[a-f0-9]{32}$/.test(s);
const digestOK=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const insist=(v,code)=>{if(!v)throw Error(code)};
const validEvidence=e=>e&&e.state==='INACTIVE_STAGING_REQUIRED'&&
  digestOK(e.sha256)&&Number.isSafeInteger(e.plaintextBytes)&&
  e.plaintextBytes>=0&&e.plaintextBytes<=2**36-32;
function base64(bytes){
  let raw='';for(let i=0;i<bytes.length;i+=32768)
    raw+=String.fromCharCode(...bytes.subarray(i,i+32768));
  return btoa(raw);
}
function unbase64(value){
  insist(typeof value==='string'&&value.length<=Math.ceil((MAX_CHUNK+16)/3)*4+4,
    'RESTORE_V2_FRAGMENT_INVALID');
  const b=atob(value);
  insist(b.length<=MAX_CHUNK+16,'RESTORE_V2_FRAGMENT_INVALID');
  return Uint8Array.from(b,ch=>ch.charCodeAt(0));
}
export function openV2StageDB({indexed=indexedDB}={}){
  return new Promise((resolve,reject)=>{
    const req=indexed.open(NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      db.createObjectStore('runs',{keyPath:'runId'});
      db.createObjectStore('chunks',{keyPath:'key'});
    };
    req.onerror=()=>reject(Error('RESTORE_V2_STAGE_DB_UNAVAILABLE'));
    req.onsuccess=()=>resolve(req.result);
  });
}
function transact(db,callback){
  return new Promise((resolve,reject)=>{
    let result,code='RESTORE_V2_STAGE_TRANSACTION_FAILED';
    let tx;
    try{tx=db.transaction(['runs','chunks'],'readwrite')}
    catch{return reject(Error(code))}
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(Error(code));
    tx.onerror=()=>{};
    const abort=c=>{code=c;try{tx.abort()}catch{}};
    try{callback(tx.objectStore('runs'),tx.objectStore('chunks'),v=>{result=v},abort)}
    catch{abort('RESTORE_V2_STAGE_TRANSACTION_FAILED')}
  });
}
function find(db,runId){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('runs','readonly');
    tx.objectStore('runs').get(runId).onsuccess=e=>resolve(e.target.result||null);
    tx.onabort=()=>reject(Error('RESTORE_V2_STAGE_READ_FAILED'));
  });
}
const fragmentKey=(runId,sequence)=>runId+':'+String(sequence).padStart(15,'0');
export function createV2InactiveStage(db,{assertHeld}={}){
  insist(typeof assertHeld==='function','RESTORE_V2_OUTER_GUARD_REQUIRED');
  async function held(){
    insist(await assertHeld()===true,'RESTORE_V2_OUTER_GUARD_REQUIRED');
  }
  async function begin(runId,evidence){
    insist(runOK(runId)&&validEvidence(evidence),'RESTORE_V2_INITIAL_PROOF_INVALID');
    await held();
    const key=await freshKey();
    const outcome=await transact(db,(runs,chunks,done,abort)=>{
      runs.get(runId).onsuccess=e=>{
        if(e.target.result){abort('RESTORE_V2_RUN_ALREADY_USED');return;}
        const row={runId,state:'INACTIVE_STAGING',ciphertextSha256:evidence.sha256,
          expectedBytes:evidence.plaintextBytes,acceptedBytes:0,nextSequence:0};
        runs.add(row);done({state:row.state,runId});
      };
    });
    volatileKeys.set(runId,key);
    return outcome;
  }
  async function append(runId,sequence,bytes){
    insist(runOK(runId)&&Number.isSafeInteger(sequence)&&sequence>=0&&
      ArrayBuffer.isView(bytes)&&bytes.byteLength<=MAX_CHUNK&&bytes.byteLength>0,
      'RESTORE_V2_FRAGMENT_INVALID');
    await held();
    const dataBytes=new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    const sealed=await sealChunk(runId,dataBytes);
    return transact(db,(runs,chunks,done,abort)=>{
      runs.get(runId).onsuccess=e=>{
        const row=e.target.result;
        if(!row||row.state!=='INACTIVE_STAGING'||row.nextSequence!==sequence)
          {abort('RESTORE_V2_FRAGMENT_SEQUENCE_INVALID');return;}
        if(row.acceptedBytes+bytes.length>row.expectedBytes)
          {abort('RESTORE_V2_FRAGMENT_OVERRUN');return;}
        chunks.add({key:fragmentKey(runId,sequence),...sealed});
        const next={...row,acceptedBytes:row.acceptedBytes+bytes.length,
          nextSequence:sequence+1};
        runs.put(next);done({state:next.state,nextSequence:next.nextSequence,
          acceptedBytes:next.acceptedBytes});
      };
    });
  }
  async function finish(runId,terminal,expectedSequence){
    insist(runOK(runId)&&terminal?.state==='AUTHENTICATED_SECOND_PASS'&&
      terminal.complete===true&&digestOK(terminal.sha256)&&
      Number.isSafeInteger(expectedSequence)&&expectedSequence>=0,
      'RESTORE_V2_TERMINAL_AUTH_REQUIRED');
    await held();
    return transact(db,(runs,chunks,done,abort)=>{
      runs.get(runId).onsuccess=e=>{
        const row=e.target.result;
        if(!row||row.state!=='INACTIVE_STAGING'||row.nextSequence!==expectedSequence||
           row.acceptedBytes!==row.expectedBytes||row.ciphertextSha256!==terminal.sha256)
          {abort('RESTORE_V2_SOURCE_INCOMPLETE');return;}
        const next={...row,state:'READY_FOR_INACTIVE_DECODER'};
        runs.put(next);
        done({state:next.state,runId,acceptedBytes:next.acceptedBytes,
          ciphertextSha256:next.ciphertextSha256,
          activation:'OFF',providerEffects:'OFF'});
      };
    });
  }
  async function* fragments(runId){
    insist(runOK(runId),'RESTORE_V2_RUN_INVALID');
    await held();
    const row=await find(db,runId);
    insist(row?.state==='READY_FOR_INACTIVE_DECODER'&&
      Number.isSafeInteger(row.nextSequence),'RESTORE_V2_NOT_AUTHENTICATED');
    for(let i=0;i<row.nextSequence;i++){
      await held();
      const observed=await find(db,runId);
      insist(observed?.state==='READY_FOR_INACTIVE_DECODER'&&
        observed.ciphertextSha256===row.ciphertextSha256,
        'RESTORE_V2_STAGE_INVALIDATED');
      const data=await new Promise((resolve,reject)=>{
        const tx=db.transaction('chunks','readonly');
        tx.objectStore('chunks').get(fragmentKey(runId,i)).onsuccess=e=>
          resolve(e.target.result||null);
        tx.onabort=()=>reject(Error('RESTORE_V2_STAGE_READ_FAILED'));
      });
      insist(data!==null,'RESTORE_V2_FRAGMENT_MISSING');
      yield await openChunk(runId,data);
    }
  }
  async function inspect(runId){
    insist(runOK(runId),'RESTORE_V2_RUN_INVALID');
    const row=await find(db,runId);
    return row?{runId,state:row.state,acceptedBytes:row.acceptedBytes,
      expectedBytes:row.expectedBytes,nextSequence:row.nextSequence}:null;
  }
  // Streaming decoder is available only through the same terminal-gated,
  // reopened IndexedDB fragments. No complete-archive allocation here.
  async function* frames(runId){
    for await(const frame of scanV2AuthenticatedFrames(fragments(runId)))
      yield frame;
  }
  // Decommission only after source/donor readback or an explicit abandoned
  // candidate. A crash still leaves only ciphertext and a HELD run.
  async function drop(runId){
    insist(runOK(runId),'RESTORE_V2_RUN_INVALID');
    await held();
    await transact(db,(runs,chunks,done,abort)=>{
      runs.get(runId).onsuccess=e=>{
        const row=e.target.result;
        if(!row){abort('RESTORE_V2_RUN_UNAVAILABLE');return;}
        for(let i=0;i<row.nextSequence;i++)
          chunks.delete(fragmentKey(runId,i));
        runs.delete(runId);done({dropped:true});
      };
    });
    volatileKeys.delete(runId);
    return {ok:true,runId};
  }
  return Object.freeze({begin,append,finish,fragments,frames,inspect,drop});
}
