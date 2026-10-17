// S02: independent read-only source/donor restoration oracle for the *same*
// I15 daily backup. No import, no effect replay or controller activation.
// The native ciphertext is read in a second protected port, scanned through
// ephemeral-key-encrypted IndexedDB staging, and checked by the real donor
// decoder. No plaintext archive is persisted, even on a cold restart.
import {createV2Ledger,createV2NativeConnection} from './backup-v2-session.mjs';
import {openV2StageDB,createV2InactiveStage} from './restore-v2-inactive-stage.mjs';
import {decodeV2InactiveFrames} from './restore-v2-stream-decode.mjs';
import {decodeBackupEnvelope} from '../lib/backup-package.js';
import {canonicalJSON,preserveNegativeZero} from './backup-v2-codec.mjs';
import {digest} from './backup-core.mjs';
const requireCheck=(ok,code)=>{if(!ok)throw Error(code)};
const nameOK=v=>typeof v==='string'&&/^s02_[0-9a-f]{32}$/.test(v);
const shaOK=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
function decodeChunk(b64){
  requireCheck(typeof b64==='string'&&b64.length<=65536,'BACKUP_V2_READ_INVALID');
  let binary;try{binary=atob(b64)}catch{throw Error('BACKUP_V2_READ_INVALID')}
  requireCheck(binary.length>0&&binary.length<=49152,'BACKUP_V2_READ_INVALID');
  return Uint8Array.from(binary,s=>s.charCodeAt(0));
}
export async function verifyV2StoredArchive({
  api,db,runId,password,
  assertNotRestoring,connectionFactory=createV2NativeConnection,
  openStage=openV2StageDB,decoder=decodeBackupEnvelope
}={}){
  requireCheck(nameOK(runId)&&typeof password==='string'&&password.length>=12&&
    typeof assertNotRestoring==='function'&&
    await assertNotRestoring()===true,'BACKUP_V2_RECOVERY_NOT_ADMITTED');
  const ledger=createV2Ledger(db);
  const found=await ledger.inspect(runId);
  requireCheck(found?.state==='AUTHENTICATED_INVENTORY_ONLY'&&
    shaOK(found.ciphertextSha256)&&
    found.acceptedBytes===found.plaintextBytes,
    'BACKUP_V2_DISK_RECEIPT_REQUIRED');
  const connection=connectionFactory(api);
  let stageDb=null,opened=false;
  try{
    const start=await connection.exchange({action:'restore.begin',
      runId,keyRef:'portable-recovery'});
    requireCheck(start?.ok===true&&start.runId===runId&&
      start.state==='INACTIVE_STAGING_REQUIRED'&&
      start.sha256===found.ciphertextSha256&&
      start.plaintextBytes===found.plaintextBytes,
      'BACKUP_V2_READBACK_IDENTITY_CHANGED');
    opened=true;
    stageDb=await openStage();
    const stage=createV2InactiveStage(stageDb,{assertHeld:assertNotRestoring});
    await stage.begin(runId,start);
    let terminal=null,seq=0;
    while(terminal===null){
      requireCheck(await assertNotRestoring()===true,
        'BACKUP_V2_RESTORE_ADMISSION_REVOKED');
      const next=await connection.exchange({action:'restore.read',runId,sequence:seq});
      requireCheck(next?.ok===true&&next.runId===runId&&
        next.sequence===seq,'BACKUP_V2_READBACK_SEQUENCE_INVALID');
      const bytes=decodeChunk(next.bytes);
      await stage.append(runId,seq++,bytes);
      if(next.complete===true){
        requireCheck(next.state==='AUTHENTICATED_SECOND_PASS'&&
          next.sha256===found.ciphertextSha256,
          'BACKUP_V2_READBACK_AUTH_INVALID');
        terminal=next;
      }else requireCheck(next.complete===false&&
        next.state==='INACTIVE_STAGING_FRAGMENT',
        'BACKUP_V2_READBACK_AUTH_INVALID');
    }
    await stage.finish(runId,terminal,seq);
    const exact=await decodeV2InactiveFrames(stage.frames(runId),{
      password,decodeDonor:decoder});
    const preparedSha256=await digest(canonicalJSON(preserveNegativeZero({
      inventory:exact.inventory,pcms:exact.pcms,donor:exact.donor
    })));
    requireCheck(await assertNotRestoring()===true,'BACKUP_V2_RESTORE_ADMISSION_REVOKED');
    const qualified=await connection.exchange({action:'archive.recovery.complete',
      runId,sha256:found.ciphertextSha256,preparedSha256,
      status:'READONLY_RECOVERY_VERIFIED'});
    requireCheck(qualified?.ok===true&&qualified.runId===runId&&
      qualified.state==='RECOVERY_VERIFIED'&&
      qualified.sha256===found.ciphertextSha256&&
      qualified.activation==='OFF','BACKUP_V2_QUALIFICATION_ACK_INVALID');
    // Qualify one *immutable* known run; do not alter or replay any provider
    // operation, publication approval, source or route during verification.
    const advanced=await ledger.advance(runId,found.revision,
      'AUTHENTICATED_INVENTORY_ONLY','RECOVERY_VERIFIED',{
        preparedSha256,ciphertextSha256:qualified.sha256});
    requireCheck(advanced.state==='RECOVERY_VERIFIED',
      'BACKUP_V2_QUALIFICATION_JOURNAL_FAILED');
    await stage.drop(runId);
    return {ok:true,state:'RECOVERY_VERIFIED',runId,
      sha256:qualified.sha256,preparedSha256,
      sourceAudit:exact.sourceAudit,sourceRows:exact.inventory.canonicalRows,
      activation:'OFF'};
  }finally{
    if(opened){
      try{await connection.exchange({action:'restore.abort',runId})}catch{}
    }
    try{stageDb?.close()}catch{}
    try{connection.close()}catch{}
    // Incomplete stages retain ciphertext only and have no replay authority.
  }
}
