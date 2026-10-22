import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {census} from '../scripts/a01-readonly-census.mjs';
import {inspectUpgradeFixture} from '../scripts/a01-fixture-preflight.mjs';
import {createGitCredentialResolver} from '../src/runtime/git-credential.mjs';
import {coalesceCreation} from '../src/runtime/creation-intake.mjs';
import {transition} from '../src/runtime/journal.mjs';

const fixture=JSON.parse(await readFile(new URL('./fixtures/a01-recovery-scenarios.json',import.meta.url),'utf8'));
test('A01 X01-X14 complete ID/owner census; no invented Part 8 prose or PASS',()=>{
  assert.deepEqual(fixture.scenarios.map(x=>x.id),
    Array.from({length:14},(_,i)=>'X-'+String(i+1).padStart(2,'0')));
  const owners=['A03','A04','A03','A05','A05,A06','A06','A04,A06','A02,A03',
    'A02','A08','A07,A08','A07','A02','A07'];
  fixture.scenarios.forEach((x,i)=>{
    assert.equal(x.owner.join(','),owners[i]);
    assert.ok(x.acceptance.length);
    assert.equal(x.originalPart8Description,'UNAVAILABLE');
    assert.equal(x.status,'NOT_TESTED');
    assert.equal(x.effectAuthority,'NONE_IN_A01');
  });
});

test('A01 disposable upgrade fixtures include identity aliases, source and uncertain journal',()=>{
  const data=fixture.fixtures;
  assert.deepEqual(data.map(x=>x.profile),Array(3).fill('DISPOSABLE'));
  const old=data.find(x=>x.id==='old-public-identity');
  assert.ok(old.generators.some(x=>x.id.startsWith('public_')));
  assert.ok(old.generators.some(x=>x.id.startsWith('slug-')));
  assert.ok(old.operations.some(x=>x.status==='DISPATCH_POSSIBLE'));
  assert.ok(data.find(x=>x.id==='restore-interrupted').restore.resumeRequired);
  assert.ok(data.every(x=>!JSON.stringify(x).includes('ghp_')));
});

test('A01 source census is deterministic, readonly; unknown live state not misreported',async()=>{
  const before=await census(),after=await census();
  assert.deepEqual(before,after,'must not invent clock timestamps or mutate source');
  assert.equal(before.scope,'REPOSITORY_SOURCE_ONLY_NOT_OPERATOR_PROFILE');
  assert.ok(before.filesScanned>200,'must scan donor and PCMS, not cherry-picked files');
  for(const k of ['idbSchema','browserStorage','pcmsNativeHost','donorBridge',
      'sourceIntegrity','journalAndRecovery'])
    assert.ok(before.classes[k]>0,'missing migration-critical class '+k);
  const hostPaths=before.entries.filter(x=>x.signals.pcmsNativeHost).map(x=>x.path);
  assert.ok(hostPaths.some(x=>x.includes('git-credential.mjs')));
  assert.ok(before.entries.some(x=>x.symbols?.nativeHostIds?.includes('local.pcms.backup_v2')),
    'digit-bearing native IDs must not be truncated in the migration census');
  assert.ok(!before.entries.some(x=>x.symbols?.nativeHostIds?.includes('local.pcms.backup_v')),
    'census must not report a truncated false host identity');
  assert.ok(before.unknown.includes('operator Firefox profiles and cookies'));
  assert.ok(before.entries.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)));
  console.log('A01_SOURCE_CENSUS_SUMMARY',JSON.stringify({filesScanned:before.filesScanned,
    filesWithSignals:before.filesWithSignals,classes:before.classes}));
});

test('A01 all six real product oracles execute, classify red without faking acceptance',async()=>{
  const {inspectProductOracles,PRODUCT_ORACLES}=
    await import('../scripts/a01-product-oracles.mjs');
  const report=await inspectProductOracles();
  assert.equal(report.productAcceptance,'NOT_ACCEPTED_BY_A01');
  assert.deepEqual(report.entries.map(x=>x.id),PRODUCT_ORACLES.map(x=>x[0]));
  assert.ok(report.entries.every(x=>
    x.state==='ASSERTION_RED'||x.state==='ASSERTION_GREEN'));
  for(const observed of report.entries)
    console.log('A01 PRODUCT ORACLE',observed.id,observed.state);
});

test('A01 real Git resolver reports missing native vault, not fake authentication PASS',async()=>{
  let effects=0;
  const api={storage:{local:{get:async()=>({pcmsS03Git:{repositoryId:'123456',repository:'Neb963/per-gens'}})}},
    runtime:{sendNativeMessage:async()=>{effects++;throw Error('missing-native-host');}}};
  const out=await createGitCredentialResolver(api)();
  if(out.ok){assert.equal(effects,0);assert.ok(out.token);}
  else{assert.equal(out.code,'GIT_VAULT_UNAVAILABLE');assert.equal(effects,1);}
});

test('A01 legacy I17 quarantine still denies original uncertain CREATE',()=>{
  const source={type:'OPERATOR',intentId:'fixture_intent_00001',
    slug:'pcms-test-esr-chain-20261015-a01',accountId:'fixture_account_0001'};
  const result=coalesceCreation(null,source);
  assert.equal(result.ok,false);assert.match(result.code,/QUARANTINE/);
});

test('A01 journal denies forged ACK and repeat possible effect; recovery remains uncertain',()=>{
  const entity={id:'target_00001',revision:1,activeOperationId:'operation_00001'};
  const operation={operationId:'operation_00001',targetId:'target_00001',
    effectType:'CREATE',status:'DISPATCH_POSSIBLE',revision:2,fingerprint:'a'.repeat(64)};
  const replay=transition(entity,operation,{type:'MARK_DISPATCH',
    targetId:entity.id,operationId:operation.operationId,expectedRevision:2});
  assert.equal(replay.ok,false);
  const forged=transition(entity,operation,{type:'OBSERVED_EQUIVALENT',
    targetId:entity.id,operationId:operation.operationId,expectedRevision:2,
    proof:{source:'OPERATOR_ASSERTION',disposition:'EQUIVALENT'}});
  assert.equal(forged.ok,false);
  const recovered=transition(entity,operation,{type:'RECOVER',
    targetId:entity.id,operationId:operation.operationId,expectedRevision:2});
  assert.equal(recovered.ok,true);assert.equal(recovered.operation.status,'HELD_UNCERTAIN');
});

test('A01 upgrade preflight never writes identity/source, reconciles uncertain effects',()=>{
  const old=structuredClone(fixture.fixtures.find(x=>x.id==='old-public-identity'));
  const before=JSON.stringify(old);
  const check=inspectUpgradeFixture(old);
  assert.equal(check.ok,true);
  assert.equal(check.migrationPerformed,false);
  assert.equal(check.dispatchedEffects,0);
  assert.equal(check.status,'HELD_FOR_INSPECTION');
  assert.ok(check.holds.includes('POSSIBLE_EFFECT_READBACK_REQUIRED'));
  assert.ok(check.holds.includes('LEGACY_PUBLIC_ID_RECONCILIATION_REQUIRED'));
  assert.equal(JSON.stringify(old),before);
  const good=inspectUpgradeFixture(fixture.fixtures[0]);
  assert.equal(good.status,'READ_ONLY_CANDIDATE');
  assert.equal(good.migrationPerformed,false);
});

test('A01 adverse upgrade fixtures deny corrupt source, duplicate route, token-bearing export',()=>{
  const state=structuredClone(fixture.fixtures.find(x=>x.id==='restore-interrupted'));
  const original=JSON.stringify(state);
  const inspected=inspectUpgradeFixture(state);
  assert.equal(inspected.sourceDigests.length,1);
  assert.equal(inspected.sourceDigests[0].size,14);
  assert.match(inspected.sourceDigests[0].sha256,/^[a-f0-9]{64}$/);
  state.sourceBlobs[0].contentBase64='%%%';
  state.accounts=[{accountId:'fixture_account_0001',personaUid:'fixture_persona_0001',
     routeId:'fixture_route_0001'},
    {accountId:'fixture_account_0002',personaUid:'fixture_persona_0001',
     routeId:'fixture_route_0001'}];
  state.githubToken='fixture-must-never-be-exported';
  const denied=inspectUpgradeFixture(state);
  assert.equal(denied.status,'HELD_FOR_INSPECTION');
  for(const code of ['SOURCE_BLOB_INVALID','PERSONA_NOT_UNIQUE',
      'PROTECTED_ROUTE_NOT_UNIQUE','BACKUP_CREDENTIAL_INCLUDED'])
    assert.ok(denied.holds.includes(code),'missing hold '+code);
  assert.notEqual(JSON.stringify(state),original);
  assert.equal(denied.migrationPerformed,false);
});
