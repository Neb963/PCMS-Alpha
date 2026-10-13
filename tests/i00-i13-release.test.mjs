import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {releaseContext,releaseTestContext,candidateManifest,releaseGitContext,
  existingUpdateAdmission,approvalTuple,matchesApproval,publicationReadback,
  safeRollbackAdmission} from '../src/runtime/release-core.mjs';
import {validateReleaseMessage,createReleaseBoundary} from '../src/runtime/release-boundary.mjs';
globalThis.crypto??=webcrypto;
const H='a'.repeat(64),N='b'.repeat(64);
const bin=s=>Buffer.from(s).toString('base64');
const fakeFiles=asset=>[
  {path:'main.pjs',base64:bin('PJS F version')},
  {path:'index.html',base64:bin('<p>F version</p>')},
  {path:'src/a.bin',base64:Buffer.from(asset).toString('base64')}
];
async function fixture(){
  const source=await exactSource(fakeFiles([0,255,28]));
  const previous=await exactSource([
    {path:'main.pjs',base64:bin('')},{path:'index.html',base64:bin('')}
  ]);
  const stage={slug:'generator-one',accountId:'account_fixture_01',
    personaUid:'persona_fixture_01',bindingVersion:1,accountRevision:2,
    principalFingerprint:H,remotePublicId:'public_generatorfixture001',
    revision:4,state:'SOURCE_VERIFIED',verifiedAt:1234,nonce:'e'.repeat(32),
    sourceFolder:'gens/generator-one',sourceHead:'c'.repeat(40),
    testingSha:N,candidate:source,previous};
  const job={slug:stage.slug,revision:6,stageRevision:stage.revision,
    sourceFingerprint:source.fingerprint,verifiedFinal:source.fingerprint,
    state:'TESTS_VERIFIED',executionSlotReleased:true,
    finalSource:source,prompt:{revision:9,tests:['default_generator_smoke']},
    native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:H},
    chat1:{tests:{default_generator_smoke:{
      result:'PASS',sourceFingerprint:source.fingerprint
    }}},chat2:null};
  const account={accountId:stage.accountId,personaUid:stage.personaUid,
    bindingVersion:1,revision:2,state:'VERIFIED',identity:{
      source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:H}};
  const inventory={slug:stage.slug,accountId:stage.accountId,
    personaUid:stage.personaUid,bindingVersion:1,remoteId:stage.remotePublicId,
    ownerState:'OBSERVED_OWNER',visibility:'UNLISTED',revision:3};
  const git={ok:true,ready:true,head:'d'.repeat(40),folder:stage.sourceFolder,
    fingerprint:N,testingSha:N,paths:[{path:'main.pjs'}]};
  return {source,previous,stage,job,account,inventory,git};
}
test('P53-07 F: exact full F and test attribution, Git HEAD independent of approval',async()=>{
  const f=await fixture();
  assert.equal(releaseContext(f.stage,f.account,f.inventory).ok,true);
  assert.equal(releaseTestContext(f.stage,f.job).ok,true);
  assert.equal((await candidateManifest(f.stage,f.job)).fingerprint,f.source.fingerprint);
  assert.equal(releaseGitContext(f.stage,f.git).ok,true);
  const sealed=approvalTuple({slug:f.stage.slug,stage:f.stage,job:f.job,
    source:f.source,git:f.git,previous:f.previous});
  assert.equal(sealed.ok,true);
  const changed=structuredClone(sealed.tuple);
  changed.files[2].sha256='0'.repeat(64);
  assert.equal(matchesApproval(sealed.tuple,changed).code,'APPROVAL_STALE');
  changed.files=sealed.tuple.files;
  changed.testPromptRevision++;
  assert.equal(matchesApproval(sealed.tuple,changed).code,'APPROVAL_STALE');
  const changedHead={...f.git,head:'f'.repeat(40)};
  assert.equal(releaseGitContext(f.stage,changedHead).ok,true);
  const revoked={...f.git,ready:false};
  assert.equal(releaseGitContext(f.stage,revoked).ok,false);
  assert.equal(releaseGitContext(f.stage,{...f.git,testingSha:H}).ok,false);
  assert.equal(releaseContext(f.stage,{...f.account,bindingVersion:2},f.inventory).ok,false);
  assert.equal(releaseContext(f.stage,f.account,{...f.inventory,remoteId:'reincarnated'}).ok,false);
  assert.equal(releaseTestContext(f.stage,{...f.job,sourceFingerprint:H}).ok,false);
  assert.equal(releaseTestContext(f.stage,{...f.job,state:'KNOWN_FAILURE'}).ok,false);
});
test('P53-07/P53-08 X: listed status without independent full bytes never confirms publication',async()=>{
  const f=await fixture(),approved=approvalTuple({slug:f.stage.slug,stage:f.stage,
    job:f.job,source:f.source,git:f.git,previous:f.previous}).tuple;
  const payload={ok:true,source:'DONOR_GUARDED_ORIGINAL_READBACK',
    slug:f.stage.slug,accountId:f.stage.accountId,personaUid:f.stage.personaUid,
    principalFingerprint:H,remotePublicId:f.stage.remotePublicId,
    ownerResult:'IS_OWNER',visibility:'PUBLIC',pjs:'PJS F version',
    html:'<p>F version</p>',
    assets:[{path:'src/a.bin',base64:Buffer.from([0,255,28]).toString('base64')}],
    observedAt:Date.now(),observationId:'observed_fixture_01'};
  assert.equal((await publicationReadback(approved,payload,{guardReady:true})).ok,true);
  for(const bad of [
    {...payload,visibility:'UNLISTED'},
    {...payload,ownerResult:'IS_NOT_OWNER'},
    {...payload,remotePublicId:'public_other'},
    {...payload,assets:[{path:'src/a.bin',base64:Buffer.from([0,255,29]).toString('base64')}]},
    {...payload,assets:[]},
    {...payload,observationId:'not a safe id'},
    {...payload,source:'AI_ASSERTION'}
  ])assert.equal((await publicationReadback(approved,bad,{guardReady:true})).ok,false);
  assert.equal((await publicationReadback(approved,payload,{guardReady:false})).ok,false);
});
test('P53-08 X: rollback never overwrites changed or still-public F',async()=>{
  const f=await fixture(),approval=approvalTuple({slug:f.stage.slug,stage:f.stage,
    job:f.job,source:f.source,git:f.git,previous:f.previous}).tuple;
  const row={state:'PUBLICATION_UNCERTAIN',approval};
  const params={release:row,previous:f.previous,
    observed:{source:'INDEPENDENT_FULL_BYTE_READBACK',
      fingerprint:f.source.fingerprint,visibility:'UNLISTED'},
    editor:{ok:true,clean:true},restore:{held:false}};
  assert.equal(safeRollbackAdmission(params).ok,true);
  assert.equal(safeRollbackAdmission({...params,
    observed:{...params.observed,visibility:'PUBLIC'}}).ok,false);
  assert.equal(safeRollbackAdmission({...params,editor:{ok:false}}).ok,false);
  assert.equal(safeRollbackAdmission({...params,restore:{held:true}}).ok,false);
  assert.equal(safeRollbackAdmission({...params,
    observed:{...params.observed,fingerprint:N}}).ok,false);
});
test('I13 F existing-source mutation held without original archive, sleep and recovery',async()=>{
  const f=await fixture();
  const gate={adoption:{original:{fingerprint:f.previous.fingerprint,
    blobs:f.previous.blobs},archiveState:'ARCHIVED_GIT_CONFIRMED',
    accountId:f.stage.accountId,bindingVersion:1,
    remotePublicId:f.stage.remotePublicId},
    inventory:f.inventory,previous:f.previous,
    archive:{ok:true,fingerprint:f.previous.fingerprint},
    backup:{ok:true,decryptable:true,sourceFingerprint:f.previous.fingerprint},
    shadow:{phase:'SLEEPING',sleepRemaining:7200000,\n      sleepEvidence:'GUARDED_OPERATIONAL_INTERVAL',paused:false,
      listingEvidence:'INDEPENDENT_UNLISTED_READBACK'}};
  assert.equal(existingUpdateAdmission(gate).ok,true);
  for(const bad of [
    {...gate,backup:{ok:false}},
    {...gate,shadow:{...gate.shadow,phase:'ACTIVE'}},
    {...gate,shadow:{...gate.shadow,listingEvidence:'UNKNOWN'}},
    {...gate,adoption:{...gate.adoption,archiveState:'HELD_UNCERTAIN'}},
    {...gate,inventory:{...gate.inventory,visibility:'PUBLIC'}}
  ])assert.equal(existingUpdateAdmission(bad).ok,false);
});
const sender={id:'fixture',url:'moz-extension://fixture/pcms/index.html#work-queue'};
const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},
  storage:{local:{get:async()=>({})}}};
test('P53-07 F/X: forged publication, bulk, bypass, unsafe sender and stale approvals denied',async()=>{
  const msg={type:'APPROVE',params:{slug:'generator-one',token:'ephemeral-git-token',
    expectedStageRevision:4,expectedJobRevision:6,fingerprint:H,
    explicitApproval:true}};
  assert.equal(validateReleaseMessage(api,sender,msg).ok,true);
  for(const bad of [
    {...msg,params:{...msg.params,explicitApproval:false}},
    {...msg,params:{...msg.params,sourceBytes:'forged'}},
    {...msg,params:{...msg.params,expectedStageRevision:0}},
    {type:'BULK_APPROVE',params:msg.params},
    {type:'PUBLISH_NOW',params:{slug:'generator-one'}},
    {type:'DISPATCH',params:{slug:'generator-one',token:'ephemeral-git-token'}},
    {type:'RECONCILE',params:{slug:'../wrong',token:'ephemeral-git-token',expectedRevision:2}}
  ])assert.equal(validateReleaseMessage(api,sender,bad).ok,false);
  assert.equal(validateReleaseMessage(api,{...sender,url:'https://perchance.org/'},msg).code,'UNTRUSTED_SENDER');
  let effects=0;const boundary=createReleaseBoundary(api,{
    open:async()=>({}),releaseFactory:()=>({get:async()=>({ok:false,code:'NO_RECORD'})}),
    dispatch:async()=>{effects++;return {ok:true}}});
  const result=await boundary.run({type:'GET',params:{slug:'generator-one'}},sender);
  assert.equal(result.code,'NO_RECORD');assert.equal(effects,0);
});
test('I13 F: assembled XPI imports fixed guard release adapter and shows no generic page execution',async()=>{
  const entry=await readFile('src/runtime/entry.mjs','utf8');
  const overlay=await readFile('src/runtime/overlay.mjs','utf8');
  const guard=await readFile('src/runtime/persona-guard.mjs','utf8');
  assert.match(entry,/import '\.\/release-boundary\.mjs'/);
  assert.match(overlay,/func:perchanceReleaseMain,args:\[request\]/);
  assert.match(overlay,/tag\.createdBy==='PCMS_I09'/);
  assert.match(overlay,/RELEASE_PROTECTED_ROUTE_CHANGED/);
  assert.match(guard,/acquireConflictGuard\(personaUid\)/);
  assert.match(guard,/runReleaseStep/);
});
