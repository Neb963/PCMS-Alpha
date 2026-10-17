// S02 candidate native-export transport. Not invoked by the installed UI:
// independent format/security review and privileged host installation are
// mandatory before the owning background coordinator may admit it.
import {compileV2,streamV2Frames} from './backup-v2-codec.mjs';
import {digest} from './backup-core.mjs';

const HOST='local.pcms.backup_v2',fail=c=>{throw Error(c)};
const validID=x=>typeof x==='string'&&/^s02_[a-f0-9]{32}$/.test(x);
const ref=x=>'backup:v2:'+x;
const assert=(v,c)=>{if(!v)fail(c)};
const states=new Set(['PREPARED','CREATE_POSSIBLE','OPEN_OBSERVED',
  'APPEND_POSSIBLE','FINISH_POSSIBLE','WRITTEN_UNVERIFIED',
  'AUTHENTICATED_INVENTORY_ONLY','RECOVERY_VERIFIED']);
function transaction(db,mode,handler){
  return new Promise((resolve,reject)=>{
    let tx,result;
    try{tx=db.transaction(['meta'],'readwrite');}
    catch{return reject(Error('BACKUP_V2_DB_UNAVAILABLE'));}
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(Error('BACKUP_V2_DB_ABORTED'));
    tx.onerror=()=>{};
    handler(tx.objectStore('meta'),value=>{result=value;},()=>{try{tx.abort();}catch{}});
  });
}
export function createV2Ledger(db){
  async function claim(runId,cutDigest,plaintextBytes){
    assert(validID(runId)&&/^[a-f0-9]{64}$/.test(cutDigest)&&
      Number.isSafeInteger(plaintextBytes)&&plaintextBytes>=0,
      'BACKUP_V2_CLAIM_INVALID');
    return transaction(db,'readwrite',(m,done,abort)=>{
      m.get('backup:v2:active').onsuccess=e=>{
        if(e.target.result){abort();return;}
        const row={key:ref(runId),runId,revision:1,state:'PREPARED',
          cutDigest,plaintextBytes,acceptedBytes:0,nextSequence:0};
        m.add(row);m.add({key:'backup:v2:active',runId});
        done(row);
      };
    });
  }
  async function advance(runId,revision,expected,next,patch={}){
    assert(validID(runId)&&states.has(expected)&&states.has(next)&&
      Number.isSafeInteger(revision)&&revision>=1,
      'BACKUP_V2_TRANSITION_INVALID');
    assert(Object.keys(patch).every(k=>['acceptedBytes','nextSequence',
      'lastDigest','ciphertextSha256','observedBlobs','preparedSha256'].includes(k)),
      'BACKUP_V2_PATCH_DENIED');
    return transaction(db,'readwrite',(m,done,abort)=>{
      m.get(ref(runId)).onsuccess=e=>{
        const before=e.target.result;
        if(!before||before.revision!==revision||before.state!==expected)
          {abort();return;}
        const row={...before,...patch,state:next,revision:revision+1};
        m.put(row);done(row);
      };
    });
  }
  async function inspect(runId){
    assert(validID(runId),'BACKUP_V2_RUN_INVALID');
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(['meta'],'readonly');
      tx.objectStore('meta').get(ref(runId)).onsuccess=e=>{
        const r=e.target.result;
        resolve(r?{runId:r.runId,state:r.state,revision:r.revision,
          acceptedBytes:r.acceptedBytes,plaintextBytes:r.plaintextBytes,
          ciphertextSha256:r.ciphertextSha256||null,
          preparedSha256:r.preparedSha256||null}:null);
      };
      tx.onabort=()=>reject(Error('BACKUP_V2_DB_UNAVAILABLE'));
    });
  }
  return Object.freeze({claim,advance,inspect});
}
const encode64=data=>{
  let text='';
  for(let i=0;i<data.length;i+=32768)
    text+=String.fromCharCode(...data.subarray(i,i+32768));
  return btoa(text);
};
export function createV2NativeConnection(api,{host=HOST}={}){
  assert(host===HOST,'BACKUP_V2_HOST_DENIED');
  const port=api.runtime.connectNative(HOST);
  let current=null,dead=false;
  port.onMessage.addListener(value=>{
    const p=current;current=null;
    if(!p)return;
    if(p.runId&&value?.ok===true&&value.runId!==p.runId)
      p.reject(Error('BACKUP_V2_NATIVE_ACK_UNBOUND'));
    else p.resolve(value);
  });
  port.onDisconnect.addListener(()=>{
    dead=true;const p=current;current=null;
    if(p)p.reject(Error('BACKUP_V2_NATIVE_ACK_UNKNOWN'));
  });
  return Object.freeze({
    async exchange(message){
      assert(!dead&&!current,'BACKUP_V2_PORT_UNAVAILABLE');
      return new Promise((resolve,reject)=>{
        current={resolve,reject,runId:message?.runId||null};
        try{port.postMessage(message)}
        catch{dead=true;current=null;reject(Error('BACKUP_V2_NATIVE_ACK_UNKNOWN'));}
      });
    },
    close(){try{port.disconnect();}catch{}}
  });
}
export async function exportV2Candidate({
  db,api,pcms,donorEnvelope,checkScope,checkRestoreHold,connect=createV2NativeConnection,
  runId='s02_'+crypto.randomUUID().replaceAll('-','')
}={}){
  // Caller must be the protected background authority; never pass untrusted
  // UI "approved" flags or infer approval from native availability.
  assert(typeof checkScope==='function'&&await checkScope()===true,
    'BACKUP_V2_NOT_ADMITTED');
  assert(typeof checkRestoreHold==='function'&&await checkRestoreHold()===false,
    'BACKUP_V2_RESTORE_HOLD');
  const plan=await compileV2(pcms,donorEnvelope);
  const cutDigest=await digest(JSON.stringify({storeCounts:plan.terminal.storeCounts,
    donorSha256:plan.terminal.donorSha256,
    rowDigestsSha256:plan.terminal.rowDigestsSha256,
    sourceRefsSha256:plan.terminal.sourceRefsSha256}));
  const ledger=createV2Ledger(db);
  let current=await ledger.claim(runId,cutDigest,plan.plaintextBytes);
  let connection=null;
  const move=async(expected,next,patch={})=>{
    current=await ledger.advance(runId,current.revision,expected,next,patch);
  };
  const answer=(value,state)=>{
    assert(value?.ok===true&&value.state===state&&value.runId===runId,
      'BACKUP_V2_ACK_UNVERIFIED');
  };
  try{
    await move('PREPARED','CREATE_POSSIBLE');
    connection=connect(api);
    answer(await connection.exchange({action:'export.begin',runId,
      cutDigest,expectedPlaintextBytes:plan.plaintextBytes,
      keyRef:'portable-recovery'}),'OPEN_OBSERVED');
    await move('CREATE_POSSIBLE','OPEN_OBSERVED');
    for await(const bytes of streamV2Frames(plan)){
      assert(bytes.length<=65536,'BACKUP_V2_FRAGMENT_INVALID');
      const sequence=current.nextSequence;
      const sha256=await digest(bytes);
      // If this persistence/dispatch/ACK is uncertain, never dispatch
      // this sequence again; only a native inspect may reconcile the effect.
      await move('OPEN_OBSERVED','APPEND_POSSIBLE',{lastDigest:sha256});
      const ack=await connection.exchange({action:'export.append',runId,
        sequence,bytes:encode64(bytes),sha256});
      answer(ack,'APPEND_OBSERVED');
      assert(ack.sequence===sequence&&
        ack.acceptedBytes===current.acceptedBytes+bytes.length,
        'BACKUP_V2_APPEND_ACK_MISMATCH');
      await move('APPEND_POSSIBLE','OPEN_OBSERVED',{
        acceptedBytes:ack.acceptedBytes,nextSequence:sequence+1});
    }
    assert(current.acceptedBytes===plan.plaintextBytes,
      'BACKUP_V2_PLAINTEXT_INCOMPLETE');
    await move('OPEN_OBSERVED','FINISH_POSSIBLE');
    answer(await connection.exchange({action:'export.finish',runId,
      sequence:current.nextSequence,cutDigest}),'WRITTEN_UNVERIFIED');
    await move('FINISH_POSSIBLE','WRITTEN_UNVERIFIED');
    const proof=await connection.exchange({action:'backup.verify',runId,
      keyRef:'portable-recovery'});
    assert(proof?.ok===true&&proof.runId===runId&&
      proof.state==='AUTHENTICATED_INVENTORY_ONLY'&&
      proof.uniqueBlobs===plan.terminal.uniqueBlobs&&
      proof.canonicalRows===plan.terminal.canonicalRows,
      'BACKUP_V2_DISK_INVENTORY_UNVERIFIED');
    await move('WRITTEN_UNVERIFIED','AUTHENTICATED_INVENTORY_ONLY',{
      ciphertextSha256:proof.sha256,observedBlobs:proof.uniqueBlobs});
    return {ok:true,runId,state:'AUTHENTICATED_INVENTORY_ONLY',
      ciphertextSha256:proof.sha256,
      recovery:'FULL_DONOR_AND_FRESH_PROFILE_NOT_PROVEN'};
  }finally{
    try{connection?.close();}catch{}
    // Ledger/active hold persists across failure, cold restart or lost ACK.
  }
}
