// S02 protected production-runner contract. All native responses here are
// simulated for negative/dispatch-controller logic; H proof is separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createAutoRunner} from '../src/runtime/backup-auto-run.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const id='a'.repeat(32),runId='s02_'+id,hash='a'.repeat(64),prepared='b'.repeat(64);
const storage={async get(){return {}},async set(){}};
function runner({reviewed=false,resolveDispatch=async()=>({ok:true,runId,
  state:'AUTHENTICATED_INVENTORY_ONLY',ciphertextSha256:hash}),
  resolveVerify=async()=>({ok:true,runId,state:'RECOVERY_VERIFIED',
    sha256:hash,preparedSha256:prepared,sourceRows:27}),
  effects=[]}={}){
  return createAutoRunner({storage:{local:storage}},{
    open:async()=>({}),newId:()=>id,clock:()=>1600000000000,
    reviewedV2:async()=>reviewed,
    native:async()=>{effects.push('VAULT_GET');return {ok:true,
      passphrase:'synthetic-ci-vault-password'}},
    captureV2:async()=>{effects.push('SOURCE_CUT');return {
      pcms:{schema:1,stores:{}},donorEnvelope:'sealed'}},
    dispatchV2:async()=>{effects.push('NATIVE_EXPORT');return resolveDispatch()},
    verifyV2:async()=>{effects.push('DISK_SOURCE_DONOR_RECOVERY');return resolveVerify()}
  });
}
test('S02 production default: manual v2 refused before vault, source, native or effects',async()=>{
  const effects=[];
  const output=await runner({effects}).manualV2Candidate();
  assert.deepEqual(output,{ok:false,code:'BACKUP_V2_REVIEW_REQUIRED'});
  assert.deepEqual(effects,[]);
});
test('S02 protected manual candidate: exact run, disk/source/donor terminal before success',async()=>{
  const effects=[],output=await runner({reviewed:true,effects}).manualV2Candidate();
  assert.equal(output.ok,true);
  assert.equal(output.runId,runId);
  assert.equal(output.state,'RECOVERY_VERIFIED');
  assert.equal(output.retentionSuccess,false,'manual backup does not count toward 14 daily files');
  assert.equal(output.activation,'OFF');
  assert.deepEqual(effects,['VAULT_GET','SOURCE_CUT','NATIVE_EXPORT',
    'DISK_SOURCE_DONOR_RECOVERY']);
});
test('S02 protected manual candidate: mismatched/wrong terminal cannot qualify success',async()=>{
  for(const bad of [
    {ok:true,runId:'s02_'+('1'.repeat(32)),state:'RECOVERY_VERIFIED',
      sha256:hash,preparedSha256:prepared},
    {ok:true,runId,state:'RECOVERY_VERIFIED',sha256:'d'.repeat(64),
      preparedSha256:prepared},
    {ok:true,runId,state:'AUTHENTICATED_INVENTORY_ONLY',
      sha256:hash,preparedSha256:prepared}
  ]){
    const output=await runner({reviewed:true,resolveVerify:async()=>bad})
      .manualV2Candidate();
    assert.deepEqual(output,{ok:false,code:'V2_NATIVE_OUTCOME_UNKNOWN'});
  }
});
test('S02 protected manual v2: same runner serializes concurrent manual and daily entry',async()=>{
  let complete;
  const release=new Promise(resolve=>{complete=resolve});
  const effects=[];
  const owner=runner({reviewed:true,effects,
    resolveDispatch:async()=>{await release;return {ok:true,runId,
      state:'AUTHENTICATED_INVENTORY_ONLY',ciphertextSha256:hash}}});
  const first=owner.manualV2Candidate();
  // Permit microtasks to reach the native export, but never release it.
  for(let i=0;i<10&&!effects.includes('NATIVE_EXPORT');i++)await Promise.resolve();
  assert.ok(effects.includes('NATIVE_EXPORT'));
  const duplicate=await owner.manualV2Candidate();
  const daily=await owner.tick();
  assert.deepEqual(duplicate,{ok:false,code:'BACKUP_INFLIGHT'});
  assert.deepEqual(daily,{ok:false,code:'BACKUP_INFLIGHT'});
  complete();
  assert.equal((await first).state,'RECOVERY_VERIFIED');
  assert.equal(effects.filter(x=>x==='NATIVE_EXPORT').length,1);
});
