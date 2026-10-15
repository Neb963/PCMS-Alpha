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
  const {pcms,payload,archive}=await disposable(),target=donor();
  let writes=0;
  const output=await previewRestore({decodeDonor:decodeBackupEnvelope,archiveText:archive.text,password:pw,
    currentPcms:pcms,currentDonor:target,currentPortable:payload,containers:[],mappings:{}});
  assert.match(output.planSha256,/^[0-9a-f]{64}$/);
  assert.equal(output.plan.risk.importedApprovalStatus,'HISTORICAL_ONLY');
  assert.equal(output.plan.risk.routeStatus,'BLOCK_UNTIL_INDEPENDENT_ROUTE_REVIEW');
  for(const password of ['wrong','']){
    await assert.rejects(()=>previewRestore({decodeDonor:decodeBackupEnvelope,archiveText:archive.text,password,
      currentPcms:pcms,currentDonor:target,currentPortable:payload,containers:[],mappings:{}}));
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
  assert.equal(inspectRestoreMappings(p,{one:'firefox-container-1'},containers,
    {fresh:true})[0].freshProfile,'PREDECESSOR_UNVERIFIED');
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
  const {pcms,payload,archive}=await disposable();
  const got=await previewRestore({decodeDonor:decodeBackupEnvelope,archiveText:archive.text,password:pw,
    currentPcms:pcms,currentDonor:donor(),currentPortable:payload,mappings:{}});
  assert.equal(await revalidateRestorePlan({
    expectedPlanSha256:got.planSha256,expectedDestinationSha256:got.plan.destinationSha256,
    currentPcms:pcms,currentDonor:donor(),currentPortable:payload,plan:got.plan}),true);
  await assert.rejects(()=>revalidateRestorePlan({
    expectedPlanSha256:got.planSha256,expectedDestinationSha256:got.plan.destinationSha256,
    currentPcms:pcms,currentDonor:{state:{revision:2},containers:[]},currentPortable:payload,plan:got.plan}),
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

test('P55-07 X: independent portable/cookie/GM cut drift invalidates reviewed restore destination',async()=>{
  const {pcms,payload,archive}=await disposable();
  const p=await previewRestore({archiveText:archive.text,password:pw,
    decodeDonor:decodeBackupEnvelope,currentPcms:pcms,currentDonor:donor(),
    currentPortable:payload,mappings:{}});
  const changed=structuredClone(payload);changed.gmValues['imported-fixture']={counter:5};
  await assert.rejects(()=>revalidateRestorePlan({expectedPlanSha256:p.planSha256,
    expectedDestinationSha256:p.plan.destinationSha256,
    currentPcms:pcms,currentDonor:donor(),currentPortable:changed,plan:p.plan}),
    /RESTORE_DESTINATION_DRIFT/);
});

test('P55-07 UX-08: unresolved and Direct source preview discloses review flags instead of hiding archive',()=>{
  const donor={personas:[{key:'persona-1',sourceId:'firefox-old',profile:{routeMode:'direct'}}]};
  const readOnly=inspectRestoreMappings(donor,{},[],{fresh:true,strict:false});
  assert.equal(readOnly[0].status,'DIRECT_REVIEW_REQUIRED');
  assert.equal(readOnly[0].freshProfile,'PREDECESSOR_UNVERIFIED');
  assert.throws(()=>inspectRestoreMappings(donor,{},[],{fresh:true}),/RESTORE_MAPPING_INCOMPLETE/);
  const named={personas:[{key:'persona-1',profile:{routeMode:'route'}}]};
  const missing=inspectRestoreMappings(named,{},[{cookieStoreId:'id-1',name:'same'}],{strict:false});
  assert.equal(missing[0].status,'MAPPING_REQUIRED');
  assert.equal(restoreReadiness({planSha256:'a'.repeat(64),
    plan:{archiveSha256:'b'.repeat(64),fresh:false,groups:missing}},
    {verified:true,tier:3}).code,'RESTORE_MAPPING_OR_ROUTE_REVIEW_REQUIRED');
});

test('P55-09 X: imported accounts are rebound without carrying session or release approval',async()=>{
  const {prepareRestoredCanonical}=await import('../src/ui/restore-sanitize.mjs');
  const imported=empty(),current=empty(),oldUid='11111111-1111-4111-8111-111111111111',
    newUid='22222222-2222-4222-8222-222222222222';
  imported.stores.meta.push(
    {key:'account:restored-a',value:serializeClone({key:'account:restored-a',
      account:{accountId:'restored-a',personaUid:oldUid,state:'VERIFIED',
        identity:{principalFingerprint:'a'.repeat(64)},revision:2}})},
    {key:'release:test',value:serializeClone({key:'release:test',
      release:{state:'APPROVED',approval:{canPublish:true},
        dispatchPossible:false,source:'historical'}})},
    {key:'refresher:shadow:v1',value:serializeClone({key:'refresher:shadow:v1',
      state:{globalPause:false,rows:[{paused:false}],accounts:{x:{paused:false}},
        inflight:[{id:'historic'}]}})},
    {key:'backup:auto-state',value:serializeClone({key:'backup:auto-state',
      state:{enabled:true,active:{runId:'auto_fake'},status:'ACTIVE'}})},
    {key:'writeback-settings',value:serializeClone({key:'writeback-settings',
      setting:{revision:8,autoEnabled:true}})},
    {key:'ai-job:restored-test',value:serializeClone({key:'ai-job:restored-test',
      job:{slug:'restored-test',revision:7,sourceFingerprint:'a'.repeat(64),
        state:'PENDING_NATIVE_SESSION',
        automation:{enabled:true,slug:'restored-test',sourceFingerprint:'a'.repeat(64),
          stageRevision:2,personaUid:oldUid,nonce:'b'.repeat(32)},
        schedulerDeferredUntil:123456789,schedulerHold:'AI_AWAITING_ROUTE'}})}
  );
  imported.stores.entities.push({key:'generator-1',value:serializeClone({
    id:'generator-1',revision:7,activeOperationId:'pending-operation'})});
  imported.stores.operations.push({key:'pending-operation',value:serializeClone({
    operationId:'pending-operation',status:'DISPATCH_POSSIBLE',revision:2})});
  const prepared=prepareRestoredCanonical({incoming:imported,current,mode:'replace',
    uidRemap:{[oldUid]:newUid}});
  const meta=Object.fromEntries(prepared.stores.meta.map(x=>[x.key,x.value]));
  assert.equal(meta['account:restored-a'].account.personaUid,newUid);
  assert.equal(meta['account:restored-a'].account.identity,null);
  assert.equal(meta['account:restored-a'].account.state,'VERIFICATION_PENDING');
  assert.equal(meta['release:test'].release.state,'RESTORE_REVIEW_REQUIRED');
  assert.equal(meta['release:test'].release.approval,null);
  // The out-of-IDB restore sentinel is the safety hold; do not create a
  // fictitious user Pause where the operator did not set one.
  assert.equal(meta['refresher:shadow:v1'].state.globalPause,false);
  assert.equal(meta['refresher:shadow:v1'].state.inflight.length,0);
  assert.equal(meta['backup:auto-state'].state.enabled,false);
  assert.equal(meta['writeback-settings'].setting.autoEnabled,false);
  assert.equal(meta['ai-job:restored-test'].job.automation,null,
    'a restored source hash cannot resurrect authorized native AI effects');
  assert.equal(meta['ai-job:restored-test'].job.schedulerDeferredUntil,null);
  assert.equal(meta['ai-job:restored-test'].job.schedulerHold,null);
  assert.equal(meta['ai-job:restored-test'].job.state,'TESTS_UNVERIFIED');
  assert.equal(prepared.stores.entities[0].value.activeOperationId,null);
  assert.equal(prepared.stores.operations[0].value.status,'HELD_UNCERTAIN');
  await assert.rejects(async()=>prepareRestoredCanonical({
    incoming:imported,current,mode:'replace',uidRemap:{}}),/RESTORE_UID_MAPPING_MISSING/);
});
test('P55-08 X: merge conflict aborts all groups instead of overwriting active destination',async()=>{
  const {prepareRestoredCanonical}=await import('../src/ui/restore-sanitize.mjs');
  const incoming=empty(),current=empty();
  incoming.stores.meta.push({key:'release:a',value:serializeClone({key:'release:a',
    release:{state:'APPROVED'}})});
  current.stores.meta.push({key:'release:a',value:serializeClone({key:'release:a',
    release:{state:'CONFIRMED_PUBLIC'}})});
  assert.throws(()=>prepareRestoredCanonical({incoming,current,mode:'merge'}),
    /RESTORE_MERGE_CONFLICT/);
  assert.equal(current.stores.meta[0].value.release.state,'CONFIRMED_PUBLIC');
});
test('P55-12 X: bounded 50 account and 1000 generator archive stays inactive and preserves row count',async()=>{
  const {prepareRestoredCanonical}=await import('../src/ui/restore-sanitize.mjs');
  const incoming=empty(),current=empty(),uidMap={};
  for(let i=0;i<50;i++){
    const uid='00000000-0000-4000-8000-'+String(i+1).padStart(12,'0');
    const next='10000000-0000-4000-8000-'+String(i+1).padStart(12,'0');
    uidMap[uid]=next;
    incoming.stores.meta.push({key:'account:acc-'+i,value:serializeClone({
      key:'account:acc-'+i,account:{accountId:'acc-'+i,
      personaUid:uid,state:'VERIFIED',revision:1,identity:{observed:'fake'}}})});
  }
  for(let j=0;j<1000;j++)incoming.stores.entities.push({key:'gen-'+j,
    value:serializeClone({id:'gen-'+j,revision:1,activeOperationId:null})});
  const mapped=prepareRestoredCanonical({incoming,current,mode:'replace',uidRemap:uidMap});
  assert.equal(mapped.stores.entities.length,1000);
  assert.equal(mapped.stores.meta.length,50);
  for(const row of mapped.stores.meta)
    assert.equal(row.value.account.state,'VERIFICATION_PENDING');
  assert.throws(()=>prepareRestoredCanonical({incoming,current,mode:'replace',
    uidRemap:Object.fromEntries(Object.keys(uidMap).map(k=>[k,'duplicate']))}),
    /RESTORE_UID_MAPPING_COLLISION/);
});

test('P51-08/P55-09 X: same-profile idempotent merge invalidates owner evidence and maps revisions',async()=>{
  const {prepareRestoredCanonical}=await import('../src/ui/restore-sanitize.mjs');
  const a=empty(),old='11111111-1111-4111-8111-111111111111',
    next='22222222-2222-4222-8222-222222222222';
  a.stores.meta.push({key:'account:a',value:serializeClone({
    key:'account:a',account:{accountId:'a',personaUid:old,
      state:'VERIFIED',revision:5,bindingVersion:3,identity:{principalFingerprint:'f'.repeat(64)}}})});
  a.stores.meta.push({key:'inventory:g',value:serializeClone({
    key:'inventory:g',generator:{slug:'g',accountId:'a',personaUid:old,
      bindingVersion:3,accountRevision:5,ownerState:'OBSERVED_OWNER',
      management:'MANAGED',source:'SOURCE_READY',lastObservationId:'old-proof'}})});
  const same=structuredClone(a);
  const result=prepareRestoredCanonical({incoming:a,current:same,mode:'merge',
    uidRemap:{[old]:next}});
  const byKey=Object.fromEntries(result.stores.meta.map(r=>[r.key,r.value]));
  assert.equal(byKey['account:a'].account.state,'VERIFICATION_PENDING');
  assert.equal(byKey['account:a'].account.bindingVersion,4);
  assert.equal(byKey['inventory:g'].generator.ownerState,'OWNER_UNVERIFIED');
  assert.equal(byKey['inventory:g'].generator.source,'SOURCE_PENDING');
  assert.equal(byKey['inventory:g'].generator.personaUid,next);
  assert.equal(byKey['inventory:g'].generator.accountRevision,6);
  assert.equal(byKey['inventory:g'].generator.bindingVersion,4);
  assert.equal(byKey['inventory:g'].generator.lastObservationId,null);
  assert.equal(JSON.stringify(same),JSON.stringify(a));
});
test('P51-08 X: operator Pauses survive replacement; synthetic shadow hold is not a manual Pause',async()=>{
  const {prepareRestoredCanonical}=await import('../src/ui/restore-sanitize.mjs');
  const incoming=empty(),current=empty();
  const old='11111111-1111-4111-8111-111111111111',
    next='22222222-2222-4222-8222-222222222222';
  incoming.stores.meta.push({key:'refresher:shadow:v1',value:serializeClone({
    key:'refresher:shadow:v1',state:{globalPause:false,
      rows:[{stableId:'r1',personaUid:old,paused:false},
            {stableId:'r2',personaUid:old,paused:false}],
      accounts:{a:{personaUid:old,paused:false,verifiedIdentity:true,
        principalFingerprint:'f'.repeat(64)}},inflight:[{claimId:'old'}],
      dueIndex:['old'],nextWakeAt:90,nextAdmissionAt:91}})});
  current.stores.meta.push({key:'refresher:shadow:v1',value:serializeClone({
    key:'refresher:shadow:v1',state:{globalPause:true,
      rows:[{stableId:'r1',paused:true}],
      accounts:{a:{paused:true}}}})});
  const o=prepareRestoredCanonical({incoming,current,mode:'replace',
    uidRemap:{[old]:next}});
  const state=o.stores.meta[0].value.state;
  assert.equal(state.globalPause,true);
  assert.equal(state.rows[0].paused,true);
  assert.equal(state.rows[1].paused,false);
  assert.equal(state.accounts.a.paused,true);
  assert.equal(state.accounts.a.verifiedIdentity,false);
  assert.equal(state.accounts.a.principalFingerprint,null);
  assert.equal(state.rows[0].personaUid,next);
  assert.equal(state.inflight.length,0);
  assert.deepEqual(state.dueIndex,[]);
  assert.equal(state.nextWakeAt,0);
});
test('P55-09 X: two active accounts cannot bind the same restored target UID',async()=>{
  const {prepareRestoredCanonical}=await import('../src/ui/restore-sanitize.mjs');
  const a=empty(),uid='11111111-1111-4111-8111-111111111111',
    target='22222222-2222-4222-8222-222222222222';
  for(const id of ['a','b'])a.stores.meta.push({key:'account:'+id,
    value:serializeClone({key:'account:'+id,account:{accountId:id,personaUid:uid,
      state:'VERIFIED',revision:1,bindingVersion:1}})});
  assert.throws(()=>prepareRestoredCanonical({incoming:a,current:empty(),
    mode:'replace',uidRemap:{[uid]:target}}),/RESTORE_DUPLICATE_ACTIVE_BINDING/);
});

test('P55-07/P55-12 X: restore port bounds input before any archive decode or donor write',async()=>{
  const {validateRestoreTransport}=await import('../src/ui/restore-core.mjs');
  const template={archiveText:'archive',checkpointText:'checkpoint',
    password:'safe operator password',reviewedPlanSha256:'a'.repeat(64),
    mode:'merge',fresh:false,mappings:{'p-1':'container-1'}};
  assert.equal(validateRestoreTransport(template,{maxBytes:32}).ok,true);
  assert.equal(validateRestoreTransport({...template,
    archiveText:'x'.repeat(33)},{maxBytes:32}).code,'RESTORE_INPUT_INVALID');
  assert.equal(validateRestoreTransport({...template,
    checkpointText:'x'.repeat(33)},{maxBytes:32}).code,'RESTORE_INPUT_INVALID');
  assert.equal(validateRestoreTransport({...template,
    password:'x'.repeat(4097)},{maxBytes:32}).code,'RESTORE_INPUT_INVALID');
  assert.equal(validateRestoreTransport({...template,
    mode:'overwrite'},{maxBytes:32}).code,'RESTORE_INPUT_INVALID');
  assert.equal(validateRestoreTransport({...template,
    mappings:{'p-1':4}},{maxBytes:32}).code,'RESTORE_MAPPING_INVALID');
  assert.equal(validateRestoreTransport({...template,
    mappings:Array(4)},{maxBytes:32}).code,'RESTORE_INPUT_INVALID');
});

test('P55-08 X: guarded per-Persona created IDs persist and duplicate receipt is rejected',async()=>{
  const s=storage(),h='a'.repeat(64),gate=createRestoreGate(s,{uuid:()=>('a'.repeat(32))});
  const start=await gate.begin({planSha256:h,archiveSha256:h,
    destinationSha256:h,checkpointSha256:h,reviewedPlanSha256:h,
    checkpointTier:3,recovery:{mode:'merge',
      mappings:{p:'__create__',q:'__create__'}}});
  const a=await gate.advance({epoch:start.epoch,revision:start.revision,
    group:'donor-personas',step:'donor-personas',status:'BEFORE_DISPATCH',fingerprint:h});
  const b=await gate.advance({epoch:start.epoch,revision:a.revision,
    group:'donor-personas',step:'donor-personas',status:'DISPATCH_POSSIBLE'});
  const first=await gate.recordContainer({epoch:start.epoch,revision:b.revision,
    personaKey:'p',cookieStoreId:'firefox-container-101'});
  const fresh=createRestoreGate(s);
  assert.equal((await fresh.inspect()).createdContainers,1);
  assert.equal((await fresh.read()).createdContainers.p,'firefox-container-101');
  await assert.rejects(()=>fresh.recordContainer({epoch:start.epoch,
    revision:first.revision,personaKey:'q',
    cookieStoreId:'firefox-container-101'}),/RESTORE_CONTAINER_ID_DUPLICATE/);
  await assert.rejects(()=>fresh.recordContainer({epoch:start.epoch,
    revision:first.revision,personaKey:'p',
    cookieStoreId:'firefox-container-102'}),/RESTORE_CONTAINER_ID_CHANGED/);
  const second=await fresh.recordContainer({epoch:start.epoch,revision:first.revision,
    personaKey:'q',cookieStoreId:'firefox-container-102'});
  const observed=await fresh.advance({epoch:start.epoch,revision:second.revision,
    group:'donor-personas',step:'donor-personas',status:'OBSERVED',
    fingerprint:h,observation:{source:'INDEPENDENT_READBACK',digest:h}});
  assert.equal(observed.groups['donor-personas'].status,'OBSERVED');
  assert.equal((await fresh.inspect()).controller,'INACTIVE');
});

test('P55-08 X: every restore group crash cut is independently observed, never replayed',async()=>{
  const {createRestoreStageEngine}=await import('../src/ui/restore-stage.mjs');
  const {RESTORE_GROUPS}=await import('../src/ui/restore-core.mjs');
  const digest='c'.repeat(64),fingerprint='d'.repeat(64);
  for(const target of RESTORE_GROUPS){
    const store=storage(),gate=createRestoreGate(store,{uuid:()=>('a'.repeat(32))});
    let row=await gate.begin({planSha256:digest,archiveSha256:digest,
      destinationSha256:digest,checkpointSha256:digest,
      reviewedPlanSha256:digest,checkpointTier:3});
    for(const group of RESTORE_GROUPS){
      if(group===target)break;
      row=await gate.advance({epoch:row.epoch,revision:row.revision,
        group,step:group,status:'BEFORE_DISPATCH',fingerprint});
      row=await gate.advance({epoch:row.epoch,revision:row.revision,
        group,step:group,status:'DISPATCH_POSSIBLE'});
      row=await gate.advance({epoch:row.epoch,revision:row.revision,
        group,step:group,status:'OBSERVED',fingerprint,
        observation:{source:'INDEPENDENT_READBACK',digest:fingerprint}});
    }
    let effects=0,visible=false;
    const runner=createRestoreStageEngine(gate,{
      dispatch:async()=>{
        assert.equal((await gate.read()).groups[target].status,'DISPATCH_POSSIBLE');
        effects++;throw Error('RESPONSE_LOST_AFTER_EFFECT');
      },
      readback:async()=>({source:'INDEPENDENT_READBACK',
        digest:visible?fingerprint:'0'.repeat(64)})
    });
    row=await runner.execute({epoch:row.epoch,revision:row.revision,
      group:target,step:target,fingerprint});
    assert.equal(row.groups[target].status,'HELD_UNCERTAIN',target);
    assert.equal(effects,1,target);
    const restarted=createRestoreGate(store);
    await assert.rejects(()=>createRestoreStageEngine(restarted,{
      dispatch:async()=>{effects++;},
      readback:async()=>({source:'INDEPENDENT_READBACK',digest:fingerprint})
    }).execute({epoch:row.epoch,revision:row.revision,
      group:target,step:target,fingerprint}),/RESTORE_GROUP_ALREADY_STARTED/);
    visible=true;
    const recovered=await createRestoreStageEngine(restarted,{
      dispatch:async()=>{effects++;throw Error('FORBIDDEN_RETRY');},
      readback:async()=>({source:'INDEPENDENT_READBACK',digest:fingerprint})
    }).reconcile({epoch:row.epoch,revision:row.revision,group:target,
      step:target,fingerprint});
    assert.equal(recovered.groups[target].status,'OBSERVED');
    assert.equal(effects,1,'no duplicate effect for '+target);
    assert.equal((await restarted.inspect()).activation,'OFF');
  }
});
test('P55-08 X: crash after PREPARED but before DISPATCH cannot resume blindly',async()=>{
  const store=storage(),h='f'.repeat(64),g=createRestoreGate(store,{
    uuid:()=>('b'.repeat(32))});
  const r=await g.begin({planSha256:h,archiveSha256:h,destinationSha256:h,
    checkpointSha256:h,reviewedPlanSha256:h,checkpointTier:3});
  const prepared=await g.advance({epoch:r.epoch,revision:r.revision,
    group:'donor-personas',step:'donor-personas',status:'BEFORE_DISPATCH',fingerprint:h});
  let effects=0;
  const runner=(await import('../src/ui/restore-stage.mjs')).createRestoreStageEngine(
    createRestoreGate(store),{dispatch:async()=>effects++,
      readback:async()=>({source:'INDEPENDENT_READBACK',digest:h})});
  await assert.rejects(()=>runner.execute({epoch:r.epoch,
    revision:prepared.revision,group:'donor-personas',
    step:'donor-personas',fingerprint:h}),/RESTORE_GROUP_ALREADY_STARTED/);
  assert.equal(effects,0);
  assert.equal((await g.inspect()).held,true);
});
