import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {validatePromptWriteIntent,writeExistingGitPrompt} from '../src/runtime/git-prompt.mjs';
globalThis.crypto??=webcrypto;
const token='fixture-token-123456',repository='Neb963/per-gens';
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),D='d'.repeat(40);
const old='Git-authored default\n';
const oid=s=>{const b=Buffer.from(s);return createHash('sha1')
  .update('blob '+b.length+'\0').update(b).digest('hex');};
const operationId='s03_'+'1'.repeat(32);
const intent={phase:'DISPATCH_POSSIBLE',operationId,expectedOid:oid(old),
  expectedHead:A,repositoryId:'42',source:'PINNED_MAIN_PROMPT_EDITOR'};
function fake({changed=false,lostAck=false,deny=false,incomplete=false}={}){
  let head=A,display=changed?'external prompt':old,patches=0,posts=0;
  const scan=async()=>incomplete?{ok:false,complete:false}:
    {ok:true,complete:true,repositoryId:'42',head,rootTreeOid:B,
      prompt:{state:'PRESENT',oid:oid(display),text:display}};
  async function transport(url,config){
    assert.equal(new URL(url).origin,'https://api.github.com');
    assert.equal(config.headers.Authorization,'Bearer '+token);
    assert.equal(config.redirect,'error');assert.equal(config.credentials,'omit');
    const path=new URL(url).pathname.replace('/repos/'+repository,'');
    const value=JSON.parse(config.body);
    if(config.method==='POST'){
      posts++;
      if(path==='/git/blobs'){
        return {status:201,json:async()=>({sha:oid(Buffer.from(value.content,'base64'))})};
      }
      if(path==='/git/trees'){
        assert.equal(value.base_tree,B);
        assert.deepEqual(value.tree.map(x=>x.path),['pcms/prompts/default-chat1.md']);
        return {status:201,json:async()=>({sha:D})};
      }
      if(path==='/git/commits'){
        assert.deepEqual(value.parents,[A]);
        assert.match(value.message,/PCMS-OP: s03_/);
        return {status:201,json:async()=>({sha:C})};
      }
    }
    if(config.method==='PATCH'){
      assert.equal(path,'/git/refs/heads/main');
      patches++;
      assert.equal(value.force,false);
      if(deny)return {status:422,json:async()=>({})};
      head=C; display='new default\n';
      if(lostAck)throw Error('lost acknowledgment after ref moved');
      return {status:200,json:async()=>({object:{sha:C}})};
    }
    throw Error(config.method+' '+path);
  }
  return {scan,transport,metrics:()=>({head,display,posts,patches})};
}
const write=(f,overrides={})=>writeExistingGitPrompt({
  token,repository,intent,draft:'new default\n',...overrides},f.transport,f.scan);
test('S03: no prompt write unless durable dispatch intent matches fixed operation shape',async()=>{
  const f=fake();
  for(const invalid of [{...intent,phase:'PREPARED'}, {...intent,source:'UI'},
    {...intent,operationId:'bad'}, {...intent,repositoryId:''}]){
    assert.equal(validatePromptWriteIntent(invalid),false);
    assert.equal((await write(f,{intent:invalid})).code,'GIT_INTENT_REQUIRED');
  }
  assert.equal(f.metrics().posts,0);
});
test('S03: fixed-path nonforce prompt write with independent exact byte readback',async()=>{
  const f=fake(),r=await write(f);
  assert.equal(r.code,'PROMPT_COMMITTED_VERIFIED',JSON.stringify(r));
  assert.equal(r.promptOid,oid('new default\n'));
  assert.deepEqual(f.metrics(),{head:C,display:'new default\n',posts:3,patches:1});
});
test('S03: prompt drift and incomplete initial catalog never attempt a write',async()=>{
  for(const flags of [{changed:true},{incomplete:true}]){
    const f=fake(flags),r=await write(f);
    assert.equal(r.ok,false);
    assert.equal(f.metrics().posts,0);
    assert.equal(f.metrics().patches,0);
  }
});
test('S03: lost or refused PATCH produces uncertain receipt, no blind retry',async()=>{
  for(const flags of [{lostAck:true},{deny:true}]){
    const f=fake(flags),r=await write(f);
    assert.equal(r.code,'GIT_WRITE_UNCERTAIN');
    assert.equal(r.possibleCommit,C);
    assert.equal(f.metrics().patches,1);
  }
});
