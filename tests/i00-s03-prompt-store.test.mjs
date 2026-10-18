import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createGitPromptStore} from '../src/runtime/catalog-prompt-store.mjs';
import {createCatalogBoundary,validateCatalogMessage} from '../src/runtime/catalog-boundary.mjs';
globalThis.crypto??=webcrypto;
const oid='a'.repeat(40),head='b'.repeat(40),text='New authoritatively reviewed prompt';
const args={repositoryId:'42',baseOid:oid,text,expectedRevision:0,updatedAt:1};
const operationId='s03_'+'1'.repeat(32);
test('S03 local drafts revision fence, persistent bytes, ignored hostile input',async()=>{
  const db=fakeDatabase(),store=createGitPromptStore(db);
  assert.equal((await store.read('42')).code,'PROMPT_DRAFT_ABSENT');
  assert.equal((await store.save(args)).code,'PROMPT_DRAFT_SAVED');
  assert.equal(db.read('meta','s03-prompt:42').record.text,text);
  assert.equal((await store.save(args)).code,'PROMPT_DRAFT_STALE');
  assert.equal((await store.save({...args,expectedRevision:1,text:'second draft'})).revision,2);
  assert.equal((await store.read('42')).record.text,'second draft');
  for(const draft of ['', 'x'.repeat(131073)])
    assert.equal((await store.save({...args,expectedRevision:2,text:draft})).ok,false);
});
test('S03 durable dispatch-before-effect and uncertain response cannot double-commit',async()=>{
  const db=fakeDatabase(),store=createGitPromptStore(db);
  assert.equal((await store.save(args)).ok,true);
  const r=await store.prepare({repositoryId:'42',revision:1,operationId,
    baseHead:head,baseOid:oid,updatedAt:2});
  assert.equal(r.effect.state,'DISPATCH_POSSIBLE');
  assert.equal(db.read('meta','s03-prompt:42').record.effect.state,'DISPATCH_POSSIBLE');
  assert.equal(db.keys('events').length,2);
  assert.equal((await store.prepare({repositoryId:'42',revision:1,operationId,
    baseHead:head,baseOid:oid,updatedAt:2})).code,'PROMPT_EFFECT_ALREADY_RECORDED');
  assert.equal((await store.save({...args,expectedRevision:1})).code,'PROMPT_WRITE_UNCERTAIN');
  assert.equal((await store.reconcile({repositoryId:'42',operationId,state:'UNCERTAIN',
    possibleCommit:head,receipt:{code:'GIT_WRITE_UNCERTAIN'}})).code,'PROMPT_UNCERTAIN');
  assert.equal(db.read('meta','s03-prompt:42').record.effect.possibleCommit,head);
  assert.equal((await store.reconcile({repositoryId:'42',operationId,state:'UNCERTAIN',
    possibleCommit:head})).code,'PROMPT_RECEIPT_DUPLICATE');
});
test('S03 aborted dispatch transaction cannot execute remote effect',async()=>{
  const db=fakeDatabase(),store=createGitPromptStore(db);
  await store.save(args);
  db.failNextCommit();
  await assert.rejects(store.prepare({repositoryId:'42',revision:1,operationId,
    baseHead:head,baseOid:oid,updatedAt:2}));
  assert.equal(db.read('meta','s03-prompt:42').record.effect,null);
  assert.equal(db.keys('events').length,1);
});
test('S03 inactive runtime defaults to no Git write while accepting canonical draft only',async()=>{
  const db=fakeDatabase(),config={repository:'Neb963/per-gens',repositoryId:'42'},state=new Map([
    ['pcmsS03Git',config]
  ]);
  const api={runtime:{id:'fixed-id',getURL:p=>'moz-extension://t/'+p},
    storage:{local:{
      get:async k=>state.has(k)?{[k]:state.get(k)}:{},
      set:async o=>Object.entries(o).forEach(([k,v])=>state.set(k,v)),
      remove:async k=>state.delete(k)
    }}};
  const sender={id:'fixed-id',url:'moz-extension://t/pcms/index.html'};
  const boundary=createCatalogBoundary(api,{open:async()=>db,
    native:async()=>{throw Error('no remote request permitted')},
    scan:async()=>{throw Error('no remote request permitted')},
    writePrompt:async()=>{throw Error('must stay dormant')}});
  assert.equal((await boundary.run({type:'SAVE_PROMPT_DRAFT',params:{
    repositoryId:'42',baseOid:oid,text,expectedRevision:0}},sender)).code,'PROMPT_DRAFT_SAVED');
  assert.equal((await boundary.run({type:'COMMIT_PROMPT',params:{
    repositoryId:'42',expectedRevision:1,expectedHead:head}},sender)).code,
    'GIT_WRITE_ACTIVATION_HELD');
  assert.equal((await boundary.run({type:'GET_PROMPT_DRAFT'},sender)).record.text,text);
  assert.equal(db.keys('events').length,1);
  assert.equal(validateCatalogMessage(api,sender,{type:'COMMIT_PROMPT',
    params:{repositoryId:'42',expectedRevision:1,expectedHead:head,force:true}}).ok,false);
  assert.equal(validateCatalogMessage(api,{id:'untrusted'},{
    type:'SAVE_PROMPT_DRAFT',params:{repositoryId:'42',baseOid:oid,text,expectedRevision:0}
  }).code,'UNTRUSTED_SENDER');
});
