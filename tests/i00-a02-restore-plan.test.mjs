import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {DB_STORES} from '../src/ui/backup-core.mjs';
import {inspectPortableRestore,verifyPortableCheckpoint} from
  '../src/runtime/portable-restore-plan.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const hash='a'.repeat(64);
const empty=()=>({schema:1,stores:Object.fromEntries(DB_STORES.map(k=>[k,[]]))});
const donor=()=>({version:1,settings:null,routes:[],personas:[],scripts:[],
  workflows:[],cookies:{},gmValues:{},automationHistory:[]});
const incoming=()=>({sourceVerified:true,receipt:{status:'READY',chain:hash,
  rows:0},canonical:empty(),donor:donor()});
const destination=()=>({currentPcms:empty(),currentDonor:{state:{},containers:[]},
  currentPortable:donor(),containers:[]});
test('A02 passwordless restore plan remains inactive; staged frame alone cannot authorize',async()=>{
  const data=incoming(),current=destination();
  data.sourceVerified=false;
  await assert.rejects(()=>inspectPortableRestore({incoming:data,...current}),
    /PORTABLE_STAGE_NOT_VERIFIED/);
  data.sourceVerified=true;
  const reviewed=await inspectPortableRestore({incoming:data,...current});
  assert.equal(reviewed.plan.risk.routeStatus,'BLOCK_UNTIL_INDEPENDENT_ROUTE_REVIEW');
  assert.equal(reviewed.plan.risk.providerEffects,'OFF');
  assert.match(reviewed.planSha256,/^[a-f0-9]{64}$/);
  assert.equal('password' in reviewed.plan,false);
});
test('A02 checkpoint independently matches all state except its own terminal download receipt',async()=>{
  const checkpoint=incoming(),dest=destination();
  checkpoint.canonical.stores.meta.push({key:'backup:manual-active',
    value:{status:'PREPARING',runId:'manual_fixture'}});
  dest.currentPcms.stores.meta.push({key:'backup:manual-active',
    value:{status:'BROWSER_REPORTED_COMPLETE',runId:'manual_fixture'}});
  dest.currentPcms.stores.meta.push({key:'backup:manual-last-complete',value:{status:'BROWSER_REPORTED_COMPLETE',runId:'manual_fixture'}});
  const proof=await verifyPortableCheckpoint({
    checkpoint,currentPcms:dest.currentPcms,currentPortable:dest.currentPortable});
  assert.equal(proof.verified,true);assert.equal(proof.tier,3);
  assert.equal(proof.evidence,'OPERATOR_SELECTED_FILE_INDEPENDENT_READBACK');
  checkpoint.canonical.stores.meta.push({key:'critical-operation',
    value:{status:'POSSIBLE_EFFECT'}});
  await assert.rejects(()=>verifyPortableCheckpoint({
    checkpoint,currentPcms:dest.currentPcms,currentPortable:dest.currentPortable}),
    /RESTORE_CHECKPOINT_PCMS_DRIFT/);
  checkpoint.canonical=empty();
  await assert.rejects(()=>verifyPortableCheckpoint({
    checkpoint,currentPcms:empty(),
    currentPortable:{...donor(),personas:[{key:'unverified'}]}}),
    /RESTORE_CHECKPOINT_DONOR_DRIFT/);
});

test('A02 fresh profile requires one explicit decision per imported account, pinned to plan',async()=>{
  const inc=incoming(),current=destination();
  inc.canonical.stores.meta.push({key:'account:fixture',value:{
    account:{accountId:'fixture_account',state:'VERIFICATION_PENDING',revision:1}}});
  const undecided=await inspectPortableRestore({incoming:inc,fresh:true,...current});
  assert.equal(undecided.plan.risk.importedAccounts,1);
  assert.equal(undecided.plan.risk.accountDecisionsMissing,1);
  const chosen=await inspectPortableRestore({incoming:inc,fresh:true,
    accountChoices:{fixture_account:'EXCLUDE'},...current});
  assert.equal(chosen.plan.risk.accountDecisionsMissing,0);
  assert.notEqual(chosen.planSha256,undecided.planSha256);
  await assert.rejects(()=>inspectPortableRestore({incoming:inc,fresh:true,
    accountChoices:{another_account:'INCLUDE_INACTIVE'},...current}),
    /RESTORE_ACCOUNT_CHOICES_INVALID/);
  await assert.rejects(()=>inspectPortableRestore({incoming:inc,fresh:true,
    accountChoices:{fixture_account:'ACTIVATE'},...current}),
    /RESTORE_ACCOUNT_CHOICES_INVALID/);
});
