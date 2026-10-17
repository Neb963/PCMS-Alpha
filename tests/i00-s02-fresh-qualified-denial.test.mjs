// S02 D-tier denial regression. These mocks test rejection only;
// actual successful qualification must be demonstrated via installed Firefox
// and the registered Python native host in scripts/s02-ci-native-host.py.
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {DB_STORES} from '../src/ui/backup-core.mjs';
import {prepareQualifiedV2FreshProfile} from '../src/ui/restore-v2-qualified.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const runId='s02_'+('3'.repeat(32));
const sha='a'.repeat(64),cut='b'.repeat(64),prepared='c'.repeat(64);
const empty=()=>({schema:1,stores:Object.fromEntries(DB_STORES.map(s=>[s,[]]))});
const base=(exchange,held=true)=>{
  const messages=[];
  return {
    messages,
    args:{
      api:{storage:{local:{}},runtime:{}},runId,currentPcms:empty(),
      guard:{inspect:async()=>({held,activation:'OFF'})},
      connectionFactory:()=>({exchange:async m=>{
        messages.push(m);
        return exchange(m);
      },close(){}}),
      openStage:async()=>{throw Error('MUST_NOT_STAGE_UNQUALIFIED_FILE')},
      vaultRead:async()=>{throw Error('MUST_NOT_READ_VAULT_UNQUALIFIED_FILE')}
    }
  };
};
const receipt={ok:true,runId,state:'RECOVERY_VERIFIED',
  acceptedBytes:108,expectedBytes:108,cutDigest:cut,
  ciphertextSha256:sha,preparedSha256:prepared};
test('S02 fresh profile: no I16 guard prohibits any native call',async()=>{
  const b=base(()=>{throw Error('UNEXPECTED_NATIVE')},false);
  await assert.rejects(()=>prepareQualifiedV2FreshProfile(b.args),
    /RESTORE_V2_GUARD_NOT_HELD/);
  assert.equal(b.messages.length,0);
});
test('S02 fresh profile: archived browser receipt, wrong run and invalid hash never stage',async()=>{
  for(const corrupt of [
    {...receipt,state:'WRITTEN_UNVERIFIED'},
    {...receipt,runId:'s02_'+('4'.repeat(32))},
    {...receipt,ciphertextSha256:'invalid'},
    {...receipt,acceptedBytes:107},
    {...receipt,preparedSha256:null}
  ]){
    const b=base(()=>corrupt);
    await assert.rejects(()=>prepareQualifiedV2FreshProfile(b.args),
      /RESTORE_V2_QUALIFIED_NATIVE_RECEIPT_REQUIRED/);
    assert.deepEqual(b.messages.map(m=>m.action),['archive.inspect']);
  }
});
test('S02 fresh profile: changing disk authentication or lost native ACK never begins staged restore',async()=>{
  for(const value of [
    {ok:true,runId,state:'AUTHENTICATED_INVENTORY_ONLY',
      sha256:'e'.repeat(64),canonicalRows:1074},
    {ok:true,runId,state:'WRITTEN_UNVERIFIED',sha256:sha,canonicalRows:1074},
    {ok:true,runId:'s02_'+('4'.repeat(32)),state:'AUTHENTICATED_INVENTORY_ONLY',
      sha256:sha,canonicalRows:1074},
    null
  ]){
    const b=base(m=>m.action==='archive.inspect'?receipt:value);
    await assert.rejects(()=>prepareQualifiedV2FreshProfile(b.args),
      /RESTORE_V2_INDEPENDENT_DISK_PROOF_REQUIRED/);
    assert.deepEqual(b.messages.map(m=>m.action),['archive.inspect','backup.verify']);
  }
  const b=base(m=>m.action==='archive.inspect'?receipt:
    Promise.reject(Error('NATIVE_PORT_DISCONNECTED')));
  await assert.rejects(()=>prepareQualifiedV2FreshProfile(b.args),
    /NATIVE_PORT_DISCONNECTED/);
  assert.deepEqual(b.messages.map(m=>m.action),['archive.inspect','backup.verify']);
});
