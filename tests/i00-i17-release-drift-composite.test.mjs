import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {transitionAccount} from '../src/runtime/accounts.mjs';
import {releaseContext,releaseTestContext,releaseEditorContext,releaseGitContext,
 approvalTuple,matchesApproval,candidateManifest,safeRollbackAdmission}
  from '../src/runtime/release-core.mjs';
globalThis.crypto??=webcrypto;
const H='a'.repeat(64),N='b'.repeat(64);
const file=(path,bytes)=>({path,base64:Buffer.from(bytes).toString('base64')});
function base(){
  const stage={slug:'release-composite',accountId:'account_composite_01',
    personaUid:'persona-composite-01',bindingVersion:1,accountRevision:2,
    principalFingerprint:H,remotePublicId:'public_release_composite_01',
    revision:4,state:'SOURCE_VERIFIED',verifiedAt:1700000000000,
    nonce:'e'.repeat(32),sourceFolder:'gens/release-composite',
    sourceHead:'c'.repeat(40),testingSha:N};
  const account={accountId:stage.accountId,personaUid:stage.personaUid,
    revision:2,bindingVersion:1,state:'VERIFIED',
    identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,
      principalFingerprint:H},override:null,history:[]};
  const inventory={slug:stage.slug,accountId:stage.accountId,
    personaUid:stage.personaUid,bindingVersion:1,
    remoteId:stage.remotePublicId,ownerState:'OBSERVED_OWNER',visibility:'UNLISTED'};
  const route={ready:true,cookieStoreId:'firefox-container-test',routeId:'protected-egress'};
  const editor={ok:true,clean:true};
  const native={ok:true,busy:false,editorClean:true,sourceSaved:true,hasQueue:false,
    inputOccupied:false,attachmentsPending:false};
  const git={ok:true,ready:true,head:'d'.repeat(40),folder:stage.sourceFolder,
    fingerprint:N,testingSha:N,paths:[{path:'main.pjs'}]};
  return {stage,account,inventory,route,editor,native,git};
}
test('P56-01 F/X: human edit, relevant Git/source drift and explicit rebind revoke one generator release',async()=>{
  const f=base(),oldP=await exactSource([
    file('main.pjs','prior stable'),file('index.html','<p>prior</p>')]);
  const F=await exactSource([file('main.pjs','candidate F'),
    file('index.html','<p>candidate F</p>'),file('src/asset.bin',Uint8Array.from([0,255,27]))]);
  assert.equal(F.ok,true);assert.equal(oldP.ok,true);
  const job={slug:f.stage.slug,revision:6,stageRevision:f.stage.revision,
    sourceFingerprint:F.fingerprint,verifiedFinal:F.fingerprint,
    state:'TESTS_VERIFIED',executionSlotReleased:true,finalSource:F,
    prompt:{revision:9,tests:['default_generator_smoke']},
    native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:H},
    chat1:{tests:{default_generator_smoke:{
      result:'PASS',sourceFingerprint:F.fingerprint}}},chat2:null};
  assert.equal(releaseContext(f.stage,f.account,f.inventory).ok,true);
  assert.equal(releaseTestContext(f.stage,job).ok,true);
  assert.equal(releaseGitContext(f.stage,f.git).ok,true);
  assert.equal(releaseEditorContext({stage:f.stage,route:f.route,previousRoute:f.route,
    editor:f.editor,native:f.native}).ok,true);
  assert.equal((await candidateManifest(f.stage,job)).fingerprint,F.fingerprint);
  const proof=approvalTuple({slug:f.stage.slug,stage:f.stage,
    job,source:F,git:f.git,previous:oldP});
  assert.equal(proof.ok,true);
  const frozen=structuredClone(proof.tuple);
  assert.equal(matchesApproval(frozen,proof.tuple).ok,true);
  // Unrelated Git commit changes HEAD but does not change the independently
  // verified generator folder. A global HEAD comparison is NOT authority.
  const unrelatedHead={...f.git,head:'f'.repeat(40)};
  assert.equal(releaseGitContext(f.stage,unrelatedHead).ok,true);
  const stillSame=approvalTuple({slug:f.stage.slug,stage:f.stage,job,
    source:F,git:unrelatedHead,previous:oldP});
  assert.equal(matchesApproval(frozen,stillSame.tuple).ok,true);
  // Relevant READY revocation, incomplete F, manual human edits and route
  // rotation each deny the original approval without removing the old P.
  assert.equal(releaseGitContext(f.stage,{...f.git,ready:false}).ok,false);
  assert.equal(releaseEditorContext({stage:f.stage,route:f.route,previousRoute:f.route,
    editor:{ok:false,clean:false},native:f.native}).ok,false);
  assert.equal(releaseEditorContext({stage:f.stage,
    route:{...f.route,routeId:'changed-protected-route'},previousRoute:f.route,
    editor:f.editor,native:f.native}).ok,false);
  const changed=structuredClone(F);changed.blobs[2].base64=Buffer.from([0,255,29]).toString('base64');
  assert.equal((await candidateManifest(f.stage,{...job,finalSource:changed})).code,'FINAL_F_BYTES_CHANGED');
  const promptDrift=approvalTuple({slug:f.stage.slug,stage:f.stage,
    job:{...job,revision:7,prompt:{...job.prompt,revision:10}},
    source:F,git:f.git,previous:oldP});
  assert.equal(matchesApproval(frozen,promptDrift.tuple).code,'APPROVAL_STALE');
  const rebinding=transitionAccount(f.account,{type:'REBIND',
    accountId:f.account.accountId,personaUid:'persona-repair-composite-02',
    expectedRevision:f.account.revision,explicitRepair:true},[f.account]);
  assert.equal(rebinding.ok,true);
  assert.equal(releaseContext(f.stage,rebinding.account,f.inventory).code,
    'RELEASE_OWNER_OR_BINDING_CHANGED');
  // Neither recovery nor last-good source becomes implicit republishing.
  const held={state:'PUBLICATION_UNCERTAIN',approval:frozen};
  assert.equal(safeRollbackAdmission({release:held,previous:oldP,
    observed:{source:'INDEPENDENT_FULL_BYTE_READBACK',
      fingerprint:F.fingerprint,visibility:'PUBLIC'},
    editor:f.editor,restore:{held:false}}).ok,false);
  assert.equal(safeRollbackAdmission({release:held,previous:oldP,
    observed:{source:'INDEPENDENT_FULL_BYTE_READBACK',
      fingerprint:F.fingerprint,visibility:'UNLISTED'},
    editor:f.editor,restore:{held:false}}).willRemain,'UNLISTED');
  assert.equal(F.blobs.length,3);
  assert.equal(oldP.blobs.length,2);
});
