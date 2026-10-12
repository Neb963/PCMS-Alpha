import test from 'node:test';
import assert from 'node:assert/strict';
import {freezeSupply,moveSupply,publicSupply,validateOwnerContext}
  from '../src/runtime/supply-plan.mjs';
const account={accountId:'account_alpha_01',personaUid:'persona-aaaa-0001',
  state:'VERIFIED',revision:3,bindingVersion:1,
  identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1}};
const plan=(slugs=['alpha-slug'])=>freezeSupply({batchId:'batch_aaaa_0001',
  accountId:account.accountId,personaUid:account.personaUid,
  accountRevision:3,bindingVersion:1,slugs});
const step=(r,event,proof)=> {
  const next=moveSupply(r,event,proof);
  assert.equal(next.ok,true,next.code||event);
  return next.item;
};
test('P56-06 F: freeze 40 exact slugs, no case folding, duplicate or target reallocation',()=>{
  const entries=Array.from({length:40},(_,i)=>'slug-'+String(i).padStart(3,'0'));
  entries[11]='slug-001';entries[12]='Slug-002';entries[13]='missing space';
  const frozen=plan(entries);
  assert.equal(frozen.ok,true);
  assert.equal(frozen.batch.items.length,40);
  assert.equal(frozen.batch.items.filter(i=>i.state==='REJECTED').length,3);
  assert.deepEqual(frozen.batch.items.slice(11,14).map(i=>i.reason),
    ['DUPLICATE_SLUG','SLUG_NOT_CANONICAL','INVALID_SLUG']);
  assert.equal(frozen.batch.items[14].requestedSlug,'slug-014');
  assert.equal(frozen.batch.items.every(i=>i.accountId===account.accountId),true);
  const publicView=publicSupply(frozen.batch);
  assert.equal('remoteId' in publicView.items[0],false);
  assert.equal('personaUid' in publicView,false);
  assert.equal(validateOwnerContext(frozen.batch,account).ok,true);
  for(const altered of [
    {...account,revision:4},{...account,bindingVersion:2},
    {...account,personaUid:'persona-bbbb-0002'},
    {...account,state:'OVERRIDDEN',identity:null},
    {...account,identity:{source:'OPERATOR',bindingVersion:1}}
  ])assert.equal(validateOwnerContext(frozen.batch,altered).code,'ACCOUNT_STALE');
});
test('P52-02 F: two distinct journalable effects and independent create/rename readback',()=>{
  let item=plan().batch.items[0];
  item=step(item,'CREATE_PREPARED',{operationId:'op_create_0001'});
  item=step(item,'CREATE_DISPATCH_POSSIBLE');
  assert.equal(moveSupply(item,'CREATE_DISPATCH_POSSIBLE').code,'NOT_ADMISSIBLE');
  assert.equal(moveSupply(item,'RENAME_PREPARED',{operationId:'op_rename_0001'}).code,'NOT_ADMISSIBLE');
  item=step(item,'CREATE_OBSERVING');
  for(const proof of [
    {source:'API_ACK',privateEmpty:true,ownerMatches:true,remoteId:'remote_aaaa_0001',temporarySlug:'temp-1234'},
    {source:'INDEPENDENT_READBACK',privateEmpty:false,ownerMatches:true,remoteId:'remote_aaaa_0001',temporarySlug:'temp-1234'},
    {source:'INDEPENDENT_READBACK',privateEmpty:true,ownerMatches:false,remoteId:'remote_aaaa_0001',temporarySlug:'temp-1234'}
  ]) assert.equal(moveSupply(item,'CREATE_CONFIRMED',proof).code,'INDEPENDENT_CREATE_PROOF_REQUIRED');
  item=step(item,'CREATE_CONFIRMED',{source:'INDEPENDENT_READBACK',
    privateEmpty:true,ownerMatches:true,remoteId:'remote_aaaa_0001',temporarySlug:'temp-1234'});
  item=step(item,'RENAME_PREPARED',{operationId:'op_rename_0001'});
  item=step(item,'RENAME_DISPATCH_POSSIBLE');
  item=step(item,'RENAME_OBSERVING');
  assert.equal(moveSupply(item,'PROVIDER_CONFIRMED',{source:'API_ACK',
    privateEmpty:true,ownerMatches:true,remoteId:'remote_aaaa_0001',
    slug:'alpha-slug',previousSlug:'temp-1234'}).code,'INDEPENDENT_RENAME_PROOF_REQUIRED');
  item=step(item,'PROVIDER_CONFIRMED',{source:'INDEPENDENT_READBACK',
    privateEmpty:true,ownerMatches:true,remoteId:'remote_aaaa_0001',
    slug:'alpha-slug',previousSlug:'temp-1234'});
  assert.equal(item.state,'PROVIDER_CONFIRMED');
  item=step(item,'SOURCE_PENDING');
  assert.equal(moveSupply(item,'SOURCE_CONFIRMED',{source:'GIT_READBACK',
    ready:false,emptyFolder:true,folder:'gens/alpha-slug'}).code,'NOT_ADMISSIBLE');
  item=step(item,'GIT_PREPARED',{operationId:'git_marker_0001'});
  item=step(item,'GIT_DISPATCH_POSSIBLE');
  item=step(item,'GIT_OBSERVING');
  assert.equal(moveSupply(item,'SOURCE_CONFIRMED',{source:'GIT_READBACK',
    ready:true,emptyFolder:true,folder:'gens/alpha-slug'}).code,'GIT_MARKER_PROOF_REQUIRED');
  item=step(item,'SOURCE_CONFIRMED',{source:'GIT_READBACK',ready:false,
    emptyFolder:true,folder:'gens/alpha-slug'});
  assert.equal(item.state,'CONFIRMED');
});
test('P56-06 F: lost response and crash never return to dispatchable state',()=>{
  let item=plan().batch.items[0];
  item=step(item,'CREATE_PREPARED',{operationId:'op_create_0001'});
  item=step(item,'CREATE_DISPATCH_POSSIBLE');
  item=step(item,'CREATE_UNCERTAIN');
  assert.equal(moveSupply(item,'CREATE_PREPARED',{operationId:'op_create_0002'}).code,'NOT_ADMISSIBLE');
  assert.equal(moveSupply(item,'CREATE_DISPATCH_POSSIBLE').code,'NOT_ADMISSIBLE');
  assert.equal(moveSupply(item,'CREATE_CONFIRMED',{source:'API_ACK'}).code,'NOT_ADMISSIBLE');
  item=step(item,'CREATE_OBSERVING');
  item=step(item,'CREATE_CONFIRMED',{source:'INDEPENDENT_READBACK',
    privateEmpty:true,ownerMatches:true,remoteId:'remote_aaaa_0001',temporarySlug:'temp-1234'});
  item=step(item,'RENAME_PREPARED',{operationId:'op_rename_0001'});
  item=step(item,'RENAME_DISPATCH_POSSIBLE');
  item=step(item,'RENAME_UNCERTAIN');
  assert.equal(moveSupply(item,'RENAME_PREPARED',{operationId:'op_rename_0002'}).code,'NOT_ADMISSIBLE');
  assert.equal(moveSupply(item,'RENAME_DISPATCH_POSSIBLE').code,'NOT_ADMISSIBLE');
  assert.equal(moveSupply(item,'PROVIDER_CONFIRMED',{}).code,'NOT_ADMISSIBLE');
  item=step(item,'RENAME_OBSERVING');
  assert.equal(moveSupply(item,'PROVIDER_CONFIRMED',{source:'INDEPENDENT_READBACK',
    privateEmpty:true,ownerMatches:false,remoteId:'remote_aaaa_0001',
    slug:'alpha-slug',previousSlug:'temp-1234'}).code,'INDEPENDENT_RENAME_PROOF_REQUIRED');
});
test('S6-I06-ALLOCATION: bad identifiers, noncanonical names and invalid state fail closed',()=>{
  for(const slug of ['a'.repeat(101),'../escape','UPPER', ' leading','  ','áaaa']){
    assert.equal(plan([slug]).batch.items[0].state,'REJECTED',slug);
  }
  assert.equal(freezeSupply({batchId:'invalid',slugs:['valid-name']}).code,'INVALID_BATCH');
  assert.equal(moveSupply({itemId:'bad',state:'FROZEN'},'CREATE_PREPARED',{}).code,'INVALID_ITEM');
  assert.equal(moveSupply(plan().batch.items[0],'SOURCE_CONFIRMED',{}).code,'NOT_ADMISSIBLE');
});
