// S02: qualified, independent fresh-Firefox-profile *read-only* recovery.
// No origin-profile IndexedDB receipt is trusted or copied. The fixed-purpose
// host owns the already qualified file; no canonical/donor application,
// activation, Persona rebinding or provider/network operation occurs here.
// This requires an existing protected I16 restore hold and explicit account choices.
import {createV2NativeConnection} from './backup-v2-session.mjs';
import {openV2StageDB,createV2InactiveStage} from './restore-v2-inactive-stage.mjs';
import {prepareInactiveV2FromStage} from './restore-v2-prep.mjs';
import {decodeBackupEnvelope} from '../lib/backup-package.js';
import {createRestoreGate} from './restore-gate.mjs';
import {validatePcmsSnapshot} from './backup-core.mjs';
import {vaultResponse,VAULT_HOST} from './backup-auto-core.mjs';

const check=(ok,code)=>{if(!ok)throw Error(code);};
const validId=x=>typeof x==='string'&&/^s02_[a-f0-9]{32}$/.test(x);
const validHash=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
function chunk(raw){
  check(typeof raw==='string'&&raw.length<=65536,'RESTORE_V2_NATIVE_FRAGMENT_INVALID');
  let text;try{text=atob(raw)}catch{throw Error('RESTORE_V2_NATIVE_FRAGMENT_INVALID')}
  check(text.length>0&&text.length<=49152,'RESTORE_V2_NATIVE_FRAGMENT_INVALID');
  return Uint8Array.from(text,x=>x.charCodeAt(0));
}
export async function prepareQualifiedV2FreshProfile({
  api,runId,currentPcms,uidRemap={},accountChoices={},mode='replace',
  guard=createRestoreGate(api.storage.local),
  connectionFactory=createV2NativeConnection,
  openStage=openV2StageDB,
  vaultRead=()=>api.runtime.sendNativeMessage(VAULT_HOST,{action:'get'}),
  decodeDonor=decodeBackupEnvelope
}={}){
  check(api&&validId(runId)&&mode==='replace',
    'RESTORE_V2_FRESH_ARGUMENT_INVALID');
  validatePcmsSnapshot(currentPcms);
  const held=async()=>{
    const state=await guard.inspect();
    check(state?.held===true&&state.activation==='OFF',
      'RESTORE_V2_GUARD_NOT_HELD');
    return true;
  };
  await held();
  const connection=connectionFactory(api);
  let db=null,started=false,completed=false;
  try{
    // A fresh profile has no original browser ledger. Trust only a native
    // qualified receipt bound to an immutable run, cut, digest and file size.
    const proof=await connection.exchange({action:'archive.inspect',runId});
    check(proof?.ok===true&&proof.runId===runId&&
      proof.state==='RECOVERY_VERIFIED'&&
      validHash(proof.ciphertextSha256)&&validHash(proof.preparedSha256)&&
      validHash(proof.cutDigest)&&
      Number.isSafeInteger(proof.acceptedBytes)&&proof.acceptedBytes>0&&
      proof.acceptedBytes===proof.expectedBytes,
      'RESTORE_V2_QUALIFIED_NATIVE_RECEIPT_REQUIRED');
    const disk=await connection.exchange({action:'backup.verify',runId,
      keyRef:'portable-recovery'});
    check(disk?.ok===true&&disk.runId===runId&&
      disk.state==='AUTHENTICATED_INVENTORY_ONLY'&&
      disk.sha256===proof.ciphertextSha256&&
      Number.isSafeInteger(disk.canonicalRows)&&disk.canonicalRows>=0,
      'RESTORE_V2_INDEPENDENT_DISK_PROOF_REQUIRED');
    await held();
    const began=await connection.exchange({action:'restore.begin',runId,
      keyRef:'portable-recovery'});
    check(began?.ok===true&&began.runId===runId&&
      began.state==='INACTIVE_STAGING_REQUIRED'&&
      began.sha256===proof.ciphertextSha256&&
      began.plaintextBytes===proof.acceptedBytes,
      'RESTORE_V2_NATIVE_FILE_IDENTITY_CHANGED');
    started=true;
    db=await openStage();
    const stage=createV2InactiveStage(db,{assertHeld:held});
    await stage.begin(runId,began);
    let terminal=null,sequence=0;
    while(!terminal){
      await held();
      const reply=await connection.exchange({action:'restore.read',runId,sequence});
      check(reply?.ok===true&&reply.runId===runId&&
        reply.sequence===sequence,'RESTORE_V2_NATIVE_SEQUENCE_CHANGED');
      const bytes=chunk(reply.bytes);
      await stage.append(runId,sequence++,bytes);
      if(reply.complete===true){
        check(reply.state==='AUTHENTICATED_SECOND_PASS'&&
          reply.sha256===proof.ciphertextSha256,
          'RESTORE_V2_TERMINAL_RECEIPT_CHANGED');
        terminal=reply;
      }else check(reply.complete===false&&
        reply.state==='INACTIVE_STAGING_FRAGMENT',
        'RESTORE_V2_NATIVE_FRAGMENT_STATE_INVALID');
    }
    await stage.finish(runId,terminal,sequence);
    const vault=vaultResponse(await vaultRead());
    check(vault.ok===true,'RESTORE_V2_VAULT_UNAVAILABLE');
    let prepared;
    try{
      prepared=await prepareInactiveV2FromStage({
        stage,runId,readback:terminal,
        expectedCiphertextSha256:proof.ciphertextSha256,
        password:vault.passphrase,decodeDonor,
        currentPcms,uidRemap,mode,fresh:true,accountChoices
      });
    }finally{vault.passphrase=null;}
    check(prepared.status==='INACTIVE_PREPARED_NOT_APPLIED'&&
      prepared.activation==='OFF'&&prepared.providerEffects==='OFF'&&
      prepared.archiveSha256===proof.ciphertextSha256,
      'RESTORE_V2_SOURCE_OR_AUTHORITY_INVALID');
    const final=await connection.exchange({action:'archive.inspect',runId});
    check(final?.ok===true&&final.runId===runId&&
      final.state==='RECOVERY_VERIFIED'&&
      final.ciphertextSha256===proof.ciphertextSha256&&
      final.preparedSha256===proof.preparedSha256&&
      final.cutDigest===proof.cutDigest,
      'RESTORE_V2_FINAL_NATIVE_RECEIPT_CHANGED');
    await held();
    await stage.drop(runId);
    completed=true;
    return Object.freeze({
      ok:true,runId,status:'INACTIVE_PREPARED_NOT_APPLIED',
      nativeReceipt:'RECOVERY_VERIFIED',ciphertextSha256:proof.ciphertextSha256,
      prepared,controller:'RESTORE_HELD',providerEffects:'OFF',
      activation:'OFF',donorApply:'NOT_AUTHORIZED',
      canonicalApply:'NOT_AUTHORIZED',freshProfile:true
    });
  }finally{
    if(started&&!completed){
      try{await connection.exchange({action:'restore.abort',runId})}catch{}
    }
    try{db?.close()}catch{}
    try{connection.close()}catch{}
    // On errors no activation is possible, and interrupted ciphertext-only
    // stage stays fenced. Never re-dispatch a native append/export.
  }
}
