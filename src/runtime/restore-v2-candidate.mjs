// S02: protected-boundary candidate only. Not registered as an operator action
// until independent E-06 review, disposable host installation and gate proof.
// No browser page supplies a terminal receipt, checksum, source or plaintext.
// The same native port supplies all sequencing and final two-pass authentication.
import {createV2NativeConnection,createV2Ledger} from './backup-v2-session.mjs';
import {openV2StageDB,createV2InactiveStage} from './restore-v2-inactive-stage.mjs';
import {prepareInactiveV2FromStage} from './restore-v2-prep.mjs';
import {decodeBackupEnvelope} from '../lib/backup-package.js';
import {createRestoreGate} from './restore-gate.mjs';
import {vaultResponse,VAULT_HOST} from './backup-auto-core.mjs';
const bad=code=>{throw Error(code)};
const check=(v,code)=>{if(!v)bad(code)};
const idOK=v=>typeof v==='string'&&/^s02_[a-f0-9]{32}$/.test(v);
const digestOK=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function rawBytes64(value){
  check(typeof value==='string'&&value.length<=65536,
    'RESTORE_V2_NATIVE_FRAGMENT_INVALID');
  let text;try{text=atob(value)}catch{bad('RESTORE_V2_NATIVE_FRAGMENT_INVALID')}
  check(text.length<=49152,'RESTORE_V2_NATIVE_FRAGMENT_INVALID');
  return Uint8Array.from(text,x=>x.charCodeAt(0));
}
// Exports a candidate, NOT privileged restore authorization. The explicit
// preexisting I16 guard is outside the replaceable canonical database.
export async function prepareTrackedV2Restore({
  api,canonicalDb,runId,currentPcms,uidRemap={},mode='merge',
  decodedDonor=decodeBackupEnvelope,
  vaultRead=()=>api.runtime.sendNativeMessage(VAULT_HOST,{action:'get'}),
  connectionFactory=createV2NativeConnection,openStage=openV2StageDB,
  guard=createRestoreGate(api.storage.local)
}={}){
  check(idOK(runId)&&api&&canonicalDb,'RESTORE_V2_ARGUMENT_INVALID');
  const previous=await createV2Ledger(canonicalDb).inspect(runId);
  check(previous?.runId===runId&&
    previous.state==='AUTHENTICATED_INVENTORY_ONLY'&&
    digestOK(previous.ciphertextSha256)&&
    previous.acceptedBytes===previous.plaintextBytes,
    'RESTORE_V2_TRACKED_ARCHIVE_UNVERIFIED');
  const held=async()=>{
    const existing=await guard.inspect();
    check(existing?.held===true&&existing.activation==='OFF',
      'RESTORE_V2_GUARD_NOT_HELD');
    return true;
  };
  await held();
  // A disconnected/replaced port never allows the next sequence to run.
  // The one reader below must not be implicitly restarted after a lost ACK.
  const connection=connectionFactory(api);
  let stageDb=null,restoreBegan=false,completed=false;
  try{
    const opened=await connection.exchange({
      action:'restore.begin',runId,keyRef:'portable-recovery'});
    check(opened?.ok===true&&opened.state==='INACTIVE_STAGING_REQUIRED'&&
      opened.sha256===previous.ciphertextSha256&&
      Number.isSafeInteger(opened.plaintextBytes)&&opened.plaintextBytes>0&&
      opened.plaintextBytes===previous.plaintextBytes,
      'RESTORE_V2_NATIVE_BEGIN_MISMATCH');
    restoreBegan=true;
    await held();
    stageDb=await openStage();
    const stage=createV2InactiveStage(stageDb,{assertHeld:held});
    // The run may have existed from an interrupted attempt. Never accept a
    // second mutable stage for the same ciphertext/run ID.
    await stage.begin(runId,opened);
    let sequence=0,terminal=null;
    while(terminal===null){
      await held();
      const answer=await connection.exchange({action:'restore.read',runId,sequence});
      check(answer?.ok===true&&answer.sequence===sequence&&
        typeof answer.bytes==='string'&&
        (answer.state==='INACTIVE_STAGING_FRAGMENT'||
         answer.state==='AUTHENTICATED_SECOND_PASS'),
        'RESTORE_V2_NATIVE_ACK_INVALID');
      const bytes=rawBytes64(answer.bytes);
      check(bytes.length>0,'RESTORE_V2_NATIVE_EMPTY_FRAGMENT');
      await stage.append(runId,sequence,bytes);
      sequence++;
      if(answer.complete===true){
        check(answer.state==='AUTHENTICATED_SECOND_PASS'&&
          answer.sha256===previous.ciphertextSha256,
          'RESTORE_V2_NATIVE_TERMINAL_MISMATCH');
        terminal=answer;
      }else check(answer.complete===false&&
        answer.state==='INACTIVE_STAGING_FRAGMENT',
        'RESTORE_V2_NATIVE_PARTIAL_INVALID');
    }
    await held();
    await stage.finish(runId,terminal,sequence);
    // Existing I15 vault authority supplies a transient key only AFTER
    // native terminal receipt. It is not accepted from the renderer/UI or
    // persisted in the stage/ledger.
    const key=vaultResponse(await vaultRead());
    check(key.ok===true,'RESTORE_V2_VAULT_UNAVAILABLE');
    let prepared;
    try{
      prepared=await prepareInactiveV2FromStage({
        stage,runId,readback:terminal,
        expectedCiphertextSha256:previous.ciphertextSha256,
        password:key.passphrase,decodeDonor:decodedDonor,
        currentPcms,uidRemap,mode
      });
    }finally{key.passphrase=null;}
    await held();
    const qualified=await connection.exchange({
      action:'archive.recovery.complete',runId,
      sha256:previous.ciphertextSha256,
      preparedSha256:prepared.preparedSha256,
      status:'INACTIVE_PREPARED_NOT_APPLIED'});
    check(qualified?.ok===true&&qualified.state==='RECOVERY_VERIFIED'&&
      qualified.runId===runId&&
      qualified.sha256===previous.ciphertextSha256&&
      qualified.activation==='OFF',
      'RESTORE_V2_RECOVERY_ACK_UNKNOWN');
    completed=true;
    return {ok:true,runId,prepared,
      status:'INACTIVE_PREPARED_NOT_APPLIED',
      nativeReceipt:'RECOVERY_VERIFIED',
      controller:'RESTORE_HELD',providerEffects:'OFF'};
  }finally{
    if(restoreBegan&&!completed){
      try{await connection.exchange({action:'restore.abort',runId})}catch{}
    }
    try{stageDb?.close()}catch{}
    try{connection.close()}catch{}
    // All interrupted and uncertain restore stages remain held on disk.
  }
}
