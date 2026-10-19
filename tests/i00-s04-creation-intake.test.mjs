import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {coalesceCreation,validateGitCreationWitness} from '../src/runtime/creation-intake.mjs';
import {I17_QUARANTINED_SLUG} from '../src/runtime/legacy-quarantine.mjs';
const op=(id,slug='s04-test-one',accountId=null)=>({type:'OPERATOR',
  intentId:id,slug,accountId});
const witness=(slug='s04-test-one',markerOid='a'.repeat(40))=>({
  slug,repository:'Neb963/per-gens',repositoryId:'1411034835',
  head:'b'.repeat(40),markerOid,complete:true,verifiedMain:true
});
const git=(id='git_0123456789abcdef0123456789abcdef',w=witness())=>({
  type:'GITHUB_MAIN',intentId:id,witness:w
});
test('S04 D: canonical manual+Git intake coalesces without creating a second intent',()=>{
  const a=coalesceCreation(null,op('intent_0123456789'));
  assert.equal(a.ok,true);assert.equal(a.record.state,'WAITING_CAPABILITY');
  assert.equal(a.record.accountId,null);
  const b=coalesceCreation(a.record,git());
  assert.equal(b.ok,true);assert.equal(b.record.intentId,a.record.intentId);
  assert.equal(b.record.sources.length,2);
  assert.equal(b.record.revision,a.record.revision+1);
  assert.equal(b.record.hold,'S04_ADMISSION_NOT_VERIFIED');
  assert.equal(coalesceCreation(b.record,git()).duplicate,true);
  const c=coalesceCreation(b.record,op('intent_0123456789'));
  assert.equal(c.duplicate,true);
  // A second operator submission with same slug is a source, not a new job.
  const d=coalesceCreation(b.record,op('intent_abcdef0123456789'));
  assert.equal(d.record.intentId,a.record.intentId);
  assert.equal(d.record.sources.length,3);
});
test('S04 D: unrelated main head advance does not cause re-admission',()=>{
  const a=coalesceCreation(null,git());
  assert.equal(a.ok,true);
  const b=coalesceCreation(a.record,git('git_abcdef0123456789abcdef0123456789',{
    ...witness(),head:'c'.repeat(40)}));
  assert.equal(b.duplicate,true);
  assert.equal(b.record.revision,1);
  const c=coalesceCreation(a.record,git('git_abcdef0123456789abcdef0123456789',
    witness('s04-test-one','d'.repeat(40))));
  assert.equal(c.ok,true);
  assert.equal(c.record.state,'WAITING_CAPABILITY');
  assert.equal(c.record.sources.length,1);
});
test('S04 D: contradictory operator account pins retain existing source and hold',()=>{
  const a=coalesceCreation(null,op('intent_0123456789','s04-test-one','account_11111111'));
  const b=coalesceCreation(a.record,op('intent_abcdef0123456789',
    's04-test-one','account_22222222'));
  assert.equal(b.ok,true);assert.equal(b.conflict,true);
  assert.equal(b.record.accountId,'account_11111111');
  assert.equal(b.record.hold,'ACCOUNT_PIN_CONFLICT');
  assert.equal(b.record.sources.length,2);
  const uncertain={...a.record,state:'CREATE_UNCERTAIN',createOperationId:'create_123'};
  const c=coalesceCreation(uncertain,git());
  assert.equal(c.record.state,'CREATE_UNCERTAIN');
  assert.equal(c.record.createOperationId,'create_123');
  const drift=coalesceCreation({...c.record},git('git_abcdef0123456789abcdef0123456789',
    witness('s04-test-one','f'.repeat(40))));
  assert.equal(drift.conflict,true);
  assert.equal(drift.record.state,'CREATE_UNCERTAIN');
  assert.equal(drift.record.hold,'GIT_SOURCE_CHANGED_WITH_ACTIVE_OPERATION');
  assert.equal(drift.record.sources.at(-1).markerOid,'a'.repeat(40));
});
test('S04 D: untrusted/incomplete Git witness, foreign repo and quarantined target rejected',()=>{
  for(const broken of [
    {...witness(),complete:false},
    {...witness(),verifiedMain:false},
    {...witness(),markerOid:null},
    {...witness(),head:'bad'},
    {...witness(),repository:'https://evil.org/a'},
    {...witness(),slug:'BAD-UPPER'},
    {...witness(),slug:I17_QUARANTINED_SLUG}
  ])assert.equal(validateGitCreationWitness(broken).ok,false);
  const a=coalesceCreation(null,git());
  const other=git('git_abcdef0123456789abcdef0123456789',{
    ...witness(),repositoryId:'99999',repository:'Other/per-gens'});
  assert.equal(coalesceCreation(a.record,other).code,'GIT_REPOSITORY_COLLISION');
  assert.equal(coalesceCreation(null,op('intent_12345678',I17_QUARANTINED_SLUG)).ok,false);
});
test('S04 D: packaged coordinator must carry the coalescer into real Firefox',async()=>{
  const [overlay,store]=await Promise.all([
    readFile(new URL('../src/runtime/overlay.mjs',import.meta.url),'utf8'),
    readFile(new URL('../src/runtime/coordinator-store.mjs',import.meta.url),'utf8')
  ]);
  assert.match(overlay,/creation-intake\.mjs/);
  assert.match(store,/ingestVerifiedMain/);
  assert.doesNotMatch(store,/runSupplyStep|sendNativeMessage|fetch\s*\(/);
});
