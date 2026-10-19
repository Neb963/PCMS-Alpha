import test from 'node:test';
import assert from 'node:assert/strict';
import {pinGitChatPrompt} from '../src/runtime/ready-git-prompt.mjs';
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
