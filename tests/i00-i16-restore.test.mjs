import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createPortableBackupPayload,encodeBackupEnvelope,decodeBackupEnvelope} from '../donor/personamonkey/extension/lib/backup-package.js';
import {DB_STORES,encodeIntegrated,serializeClone} from '../src/ui/backup-core.mjs';
import {previewRestore,verifyCheckpoint,revalidateRestorePlan,
  restoreReadiness,inspectRestoreMappings} from '../src/ui/restore-core.mjs';
import {createRestoreGate,RESTORE_GUARD_KEY} from '../src/ui/restore-gate.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const pw='I16_DISPOSABLE_OPERATOR_TEST_PASSWORD';
const empty=()=>({schema:1,stores:Object.fromEntries(DB_STORES.map(s=>[s,[]]))});
const donor=()=>({state:{},containers:[]});
const disposable=async()=>{
  const pcms=empty(),payload=createPortableBackupPayload({state:{},
    containers:[],selection:{kind:'full'}});
  const wrapped=await encodeBackupEnvelope({payload,password:pw,scope:{kind:'full'}});
  const archive=await encodeIntegrated({pcms,donorEnvelope:wrapped,passphrase:pw});
  return {pcms,payload,archive};
};
function storage(){
  const map=new Map();let failWrite=false;
  return {map,setFail(v){failWrite=v;},
    async get(k){return {[k]:map.get(k)};},
    async set(values){if(failWrite)throw Error('quota');for(const [k,v] of Object.entries(values))map.set(k,structuredClone(v));}};
}
test('P55-07: preview authenticates both encrypted layers; invalid password has zero side effects',async()=>{
  const {pcms,archive}=await disposable(),target=donor();
  let writes=0;
  const output=await previewRestore({decodeDonor:decodeBackupEnvelope,archiveText:archive.text,password:pw,
    currentPcms:pcms,currentDonor:target,containers:[],mappings:{}});
  assert.match(output.planSha256,/^[0-9a-f]{64}$/);
  assert.equal(output.plan.risk.importedApprovalStatus,'HISTORICAL_ONLY');
  assert.equal(output.plan.risk.routeStatus,'BLOCK_UNTIL_INDEPENDENT_ROUTE_REVIEW');
  for(const password of ['wrong','']){
    await assert.rejects(()=>previewRestore({decodeDonor:decodeBackupEnvelope,archiveText:archive.text,password,
      currentPcms:pcms,currentDonor:target,containers:[],mappings:{}}));
  }
  assert.equal(writes,0);
});
test('P55-07 and P55-12: independently read checkpoint must match every PCMS and donor byte',async()=>{
  const {pcms,payload,archive}=await disposable();
  await assert.rejects(()=>verifyCheckpoint({decodeDonor:decodeBackupEnvelope,checkpointText:archive.text,
    password:pw,currentPcms:pcms,currentPortable:payload,archivedAtLeastTier:2}),
    /RESTORE_CHECKPOINT_DISK_PROOF_REQUIRED/);
  const proof=await verifyCheckpoint({decodeDonor:decodeBackupEnvelope,checkpointText:archive.text,password:pw,
    currentPcms:pcms,currentPortable:payload,archivedAtLeastTier:3});
  assert.equal(proof.tier,3);
  const changed=structuredClone(pcms);
  changed.stores.meta.push({key:'target',value:serializeClone({value:'after-cut'})});
  await assert.rejects(()=>verifyCheckpoint({decodeDonor:decodeBackupEnvelope,checkpointText:archive.text,password:pw,
    currentPcms:changed,currentPortable:payload,archivedAtLeastTier:3}),
    /RESTORE_CHECKPOINT_PCMS_DRIFT/);
  await assert.rejects(()=>verifyCheckpoint({decodeDonor:decodeBackupEnvelope,checkpointText:archive.text,password:pw,
    currentPcms:pcms,currentPortable:{...payload,personas:[{key:'other'}]},
    archivedAtLeastTier:3}),/RESTORE_CHECKPOINT_DONOR_DRIFT/);
});
test('P55-09: explicit distinct positively observed existing-container mapping; never infer names or Direct',()=>{
  const p={personas:[{key:'one',sourceId:'old',profile:{routeMode:'route',
    personaUid:'persona-aaa'}}]};
  const containers=[{cookieStoreId:'firefox-container-1',name:'same'}];
  assert.throws(()=>inspectRestoreMappings(p,{},containers),/RESTORE_MAPPING_INCOMPLETE/);
  assert.throws(()=>inspectRestoreMappings(p,{one:'missing'},containers),/RESTORE_MAPPING_UNVERIFIED/);
  assert.equal(inspectRestoreMappings(p,{one:'firefox-container-1'},containers)[0].status,
    'MAPPING_ONLY_UNVERIFIED');
  assert.throws(()=>inspectRestoreMappings(p,{one:'firefox-container-1'},containers,
    {fresh:true}),/RESTORE_FRESH_BINDING_UNVERIFIED/);
  const direct=structuredClone(p);direct.personas[0].profile.routeMode='direct';
  assert.throws(()=>inspectRestoreMappings(direct,{one:'firefox-container-1'},containers),
    /RESTORE_DIRECT_REVIEW_REQUIRED/);
  const dupe={personas:[p.personas[0],{key:'two',profile:{}}]};
  assert.throws(()=>inspectRestoreMappings(dupe,
    {one:'firefox-container-1',two:'firefox-container-1'},containers),
    /RESTORE_MAPPING_COLLISION/);
});
test('P51-08/P55-08/P55-10: out-of-store barrier readback before stage; crash/uncertainty never releases',async()=>{
  const s=storage(),gate=createRestoreGate(s,{now:()=>1000,uuid:()=>('a'.repeat(32))});
  const h='f'.repeat(64);
  await assert.rejects(()=>gate.begin({planSha256:h,archiveSha256:h,destinationSha256:h,
    checkpointSha256:h,reviewedPlanSha256:'e'.repeat(64),checkpointTier:3}),
    /RESTORE_UNREVIEWED_OR_UNVERIFIED/);
  s.setFail(true);
  await assert.rejects(()=>gate.begin({planSha256:h,archiveSha256:h,destinationSha256:h,
    checkpointSha256:h,reviewedPlanSha256:h,checkpointTier:3}),/RESTORE_GUARD_WRITE_FAILED/);
  s.setFail(false);
  assert.equal((await gate.inspect()).held,false);
  const row=await gate.begin({planSha256:h,archiveSha256:h,destinationSha256:h,
    checkpointSha256:h,reviewedPlanSha256:h,checkpointTier:3,fresh:true});
  assert.equal(s.map.get(RESTORE_GUARD_KEY).active,true);
  await assert.rejects(()=>gate.begin({planSha256:h,archiveSha256:h,destinationSha256:h,
    checkpointSha256:h,reviewedPlanSha256:h,checkpointTier:3}),/RESTORE_ALREADY_HELD/);
  const another=createRestoreGate(s);
  assert.equal((await another.inspect()).controller,'INACTIVE');
  assert.equal((await another.inspect()).activation,'OFF');
  assert.equal(restoreReadiness({planSha256:h,plan:{archiveSha256:h,fresh:true}},
    {verified:true,tier:3}).code,'RESTORE_FRESH_CONTROLLER_INACTIVE');
  const firstStage=await another.advance({epoch:row.epoch,revision:1,
    step:'DONOR_IMPORT',group:'donor-personas',status:'BEFORE_DISPATCH'});
  const uncertain=await another.advance({epoch:row.epoch,revision:firstStage.revision,
    step:'DONOR_IMPORT',group:'donor-personas',status:'DISPATCH_POSSIBLE'});
  assert.equal(uncertain.groups['donor-personas'].status,'DISPATCH_POSSIBLE');
  await assert.rejects(()=>another.advance({epoch:row.epoch,revision:1,
    step:'DONOR_IMPORT',group:'donor-personas',status:'OBSERVED',
    observation:{source:'INDEPENDENT_READBACK',digest:h}}),/RESTORE_STALE_GUARD/);
  await assert.rejects(()=>another.advance({epoch:row.epoch,revision:3,
    step:'DONOR_IMPORT',group:'donor-personas',status:'OBSERVED',
    observation:{source:'UI_PROMISE',digest:h}}),/RESTORE_INDEPENDENT_READBACK_REQUIRED/);
  assert.equal((await another.inspect()).held,true);
});
test('P55-07: destination changed or plan changed after approval blocks before donor effect',async()=>{
  const {pcms,archive}=await disposable();
  const got=await previewRestore({decodeDonor:decodeBackupEnvelope,archiveText:archive.text,password:pw,
    currentPcms:pcms,currentDonor:donor(),mappings:{}});
  assert.equal(await revalidateRestorePlan({
    expectedPlanSha256:got.planSha256,expectedDestinationSha256:got.plan.destinationSha256,
    currentPcms:pcms,currentDonor:donor(),plan:got.plan}),true);
  await assert.rejects(()=>revalidateRestorePlan({
    expectedPlanSha256:got.planSha256,expectedDestinationSha256:got.plan.destinationSha256,
    currentPcms:pcms,currentDonor:{state:{revision:2},containers:[]},plan:got.plan}),
    /RESTORE_DESTINATION_DRIFT/);
});


test('P55-08 X: durable before-effect journal, lost ACK, independent observation and no blind replay',async()=>{
  const {createRestoreStageEngine}=await import('../src/ui/restore-stage.mjs');
  const s=storage(),h='d'.repeat(64),fingerprint='a'.repeat(64);
  let remoteEffects=0,cut='none';
  const gate=createRestoreGate(s,{uuid:()=>('b'.repeat(32))});
  const start=await gate.begin({planSha256:h,archiveSha256:h,
    destinationSha256:h,checkpointSha256:h,reviewedPlanSha256:h,checkpointTier:3});
  const ledger={};
  const runner=createRestoreStageEngine(gate,{
    dispatch:async({group})=>{
      assert.equal((await gate.read()).groups[group].status,'DISPATCH_POSSIBLE');
      remoteEffects++;ledger[group]=fingerprint;
      if(cut==='lost_reply')throw Error('LOST_ACK');
    },
    readback:async({group})=>({source:'INDEPENDENT_READBACK',
      digest:ledger[group]||'0'.repeat(64)})
  });
  cut='lost_reply';
  const final=await runner.execute({epoch:start.epoch,revision:1,group:'donor-personas',
    step:'map-id',fingerprint});
  assert.equal(final.groups['donor-personas'].status,'OBSERVED');
  assert.equal(remoteEffects,1);
  const recovered=createRestoreStageEngine(createRestoreGate(s),{
    readback:async()=>({source:'INDEPENDENT_READBACK',digest:fingerprint}),
    dispatch:()=>{throw Error('BLIND_REPLAY');}
  });
  await assert.rejects(()=>recovered.execute({epoch:start.epoch,revision:final.revision,
    group:'donor-personas',step:'map-id',fingerprint}),/RESTORE_GROUP_ALREADY_STARTED/);
  await assert.rejects(()=>recovered.reconcile({epoch:start.epoch,revision:final.revision,
    group:'donor-personas',step:'map-id',fingerprint}),
    /RESTORE_RECONCILIATION_NOT_REQUIRED/);
  assert.equal(remoteEffects,1);
  assert.equal((await gate.inspect()).activation,'OFF');
});
test('P55-08 X: partial failed independent readback holds; recovery only observes, never dispatches',async()=>{
  const {createRestoreStageEngine}=await import('../src/ui/restore-stage.mjs');
  const s=storage(),h='c'.repeat(64),f='f'.repeat(64);
  const g=createRestoreGate(s,{uuid:()=>('c'.repeat(32))});
  const start=await g.begin({planSha256:h,archiveSha256:h,
    destinationSha256:h,checkpointSha256:h,reviewedPlanSha256:h,checkpointTier:3,
    fresh:true});
  let calls=0,valid=false;
  const runner=createRestoreStageEngine(g,{dispatch:async()=>{calls++;},
    readback:async()=>({source:'INDEPENDENT_READBACK',digest:valid?f:'0'.repeat(64)})});
  const held=await runner.execute({epoch:start.epoch,revision:1,group:'donor-personas',
    step:'create-context',fingerprint:f});
  assert.equal(held.groups['donor-personas'].status,'HELD_UNCERTAIN');
  assert.equal(calls,1);
  await assert.rejects(()=>runner.execute({epoch:start.epoch,revision:held.revision,
    group:'donor-cookies',step:'cookies',fingerprint:f}),/RESTORE_DEPENDENCY_HELD/);
  valid=true;
  const observed=await runner.reconcile({epoch:start.epoch,revision:held.revision,
    group:'donor-personas',step:'create-context',fingerprint:f});
  assert.equal(observed.groups['donor-personas'].status,'OBSERVED');
  assert.equal(calls,1);
  assert.equal((await g.inspect()).controller,'INACTIVE');
  assert.equal((await g.inspect()).activation,'OFF');
});
