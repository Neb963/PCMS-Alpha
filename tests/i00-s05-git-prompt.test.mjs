import test from 'node:test';
import assert from 'node:assert/strict';
import {pinGitChatPrompt} from '../src/runtime/ready-git-prompt.mjs';
import {createAiStore} from '../src/runtime/ai-store.mjs';
import {fakeDatabase} from './fake-idb.mjs';
const repository='Neb963/per-gens',repositoryId='1411034835';
const catalog={ok:true,complete:true,source:'PINNED_MAIN_READ_ONLY',
 repository,repositoryId,head:'a'.repeat(40),
 prompt:{state:'PRESENT',oid:'b'.repeat(40),
  text:'Follow these Git Chat 1 instructions; never publish.'}};
const settings={revision:4,tests:['default_generator_smoke']};
test('S05 Chat1 pins Git main content and canonical test names, not legacy Settings text',()=>{
 const r=pinGitChatPrompt(catalog,{...settings,text:'untrusted local old prompt'},
  {repository,repositoryId});
 assert.equal(r.ok,true);
 assert.equal(r.prompt.text,catalog.prompt.text);
 assert.equal(r.prompt.oid,catalog.prompt.oid);
 assert.equal(r.prompt.revision,4);
 assert.equal(r.prompt.source,'GIT_MAIN_CHAT1_PINNED');
 assert.deepEqual(r.prompt.tests,settings.tests);
});
test('S05 Git prompt identity/absence/incomplete revision fail closed',()=>{
 for(const invalid of [
  {...catalog,complete:false},
  {...catalog,repositoryId:'other'},
  {...catalog,prompt:{state:'ABSENT',oid:null,text:null}},
  {...catalog,prompt:{state:'PRESENT',oid:'z',text:'attacker'}},
  {...catalog,prompt:{state:'PRESENT',oid:'b'.repeat(40),text:''}}
 ])assert.equal(pinGitChatPrompt(invalid,settings,{repository,repositoryId}).ok,false);
});

test('S05 public AI queue exposes pinned Git Chat 1 provenance, not a legacy Settings claim',async()=>{
 const db=fakeDatabase(),fingerprint='f'.repeat(64);
 const job=(source)=>({
  schema:1,slug:'s05-prompt-source',revision:1,state:'PENDING_NATIVE_SESSION',
  sourceFingerprint:fingerprint,prompt:{
    revision:4,text:'Pinned tested Chat 1',tests:['default_generator_smoke'],
    ...(source?{source}:{})},
  optionalTesting:null,
  chat1:{state:'PENDING',sessionDigest:null,tests:{}},chat2:null,changes:[],
  executionSlotReleased:false
 });
 const write=async value=>new Promise((resolve,reject)=>{
  const tx=db.transaction(['meta'],'readwrite');
  tx.oncomplete=resolve;tx.onabort=()=>reject(Error('DB_ABORT'));
  tx.objectStore('meta').put({
    key:'ai-job:s05-prompt-source',accountId:'account1',job:value});
 });
 await write(job('GIT_MAIN_CHAT1_PINNED'));
 const first=await createAiStore(db).getJob('s05-prompt-source');
 assert.equal(first.ok,true);
 assert.equal(first.promptSource,'GIT_MAIN_CHAT1_PINNED');
 assert.equal(first.promptRevision,4);
 assert.equal(JSON.stringify(first).includes('Pinned tested Chat 1'),false,
   'public receipt must not disclose system prompt');
 await write(job(null));
 const legacy=await createAiStore(db).getJob('s05-prompt-source');
 assert.equal(legacy.promptSource,'LOCAL_SETTINGS');
});
