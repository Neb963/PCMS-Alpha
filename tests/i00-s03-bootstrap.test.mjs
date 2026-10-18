import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {initializeEmptyPrivateGit,validEmptyRepoIntent} from '../src/runtime/catalog-bootstrap.mjs';
globalThis.crypto??=webcrypto;
const token='test-private-token',repository='Neb963/per-gens';
const starter='Authorized first prompt\n';
const sha=createHash('sha256').update(starter).digest('hex');
const intent={phase:'DISPATCH_POSSIBLE',operationId:'s03_'+'1'.repeat(32),
 repositoryId:'42',approvedStarterSha256:sha,starterApproved:true};
const response=(status,body)=>({status,json:async()=>body});
function transport({existing=false,lost=false}={}){
 let posts=0;
 const route=async(url,init)=>{
  const p=new URL(url).pathname.replace('/repos/'+repository,'');
  if(init.method==='GET'){
   if(p==='')return response(200,{id:42,full_name:repository,private:true});
   if(p==='/git/ref/heads/main')return response(existing?200:404,
     existing?{ref:'refs/heads/main',object:{sha:'a'.repeat(40)}}:{});
   if(p==='/git/refs'||p==='/commits')return response(409,{});
   if(p==='/git/commits/'+'c'.repeat(40))return response(200,{tree:{sha:'b'.repeat(40)}});
   if(p==='/git/trees/'+'b'.repeat(40))return response(200,
     {tree:[{path:'pcms/prompts/default-chat1.md',sha:'a'.repeat(40)}]});
  }
  posts++;
  if(init.method==='POST'&&p==='/git/blobs')return response(201,{sha:'a'.repeat(40)});
  if(init.method==='POST'&&p==='/git/trees')return response(201,{sha:'b'.repeat(40)});
  if(init.method==='POST'&&p==='/git/commits')return response(201,{sha:'c'.repeat(40)});
  if(init.method==='POST'&&p==='/git/refs'){
   if(lost)throw Error('lost ref acknowledgment');
   return response(201,{object:{sha:'c'.repeat(40)}});
  }
  throw Error('unexpected '+init.method+' '+p);
 };
 return {route,metrics:()=>posts};
}
test('S03 initial private root cannot be created without exact approved starter and durable intent',async()=>{
 assert.equal(validEmptyRepoIntent(intent),true);
 const f=transport();
 for(const i of [{...intent,phase:'PREPARED'}, {...intent,starterApproved:false}]){
   assert.equal((await initializeEmptyPrivateGit({token,repository,intent:i,starterPrompt:starter},f.route)).ok,false);
 }
 assert.equal((await initializeEmptyPrivateGit({token,repository,intent,starterPrompt:'different'},f.route)).code,
   'GIT_STARTER_NOT_APPROVED');
 assert.equal(f.metrics(),0);
});
test('S03 existing main never overwritten and ref ACK loss never blindly retried',async()=>{
 const present=transport({existing:true});
 assert.equal((await initializeEmptyPrivateGit({token,repository,intent,starterPrompt:starter},present.route)).code,
   'GIT_MAIN_ALREADY_EXISTS');
 assert.equal(present.metrics(),0);
 const lost=transport({lost:true});
 const receipt=await initializeEmptyPrivateGit({token,repository,intent,starterPrompt:starter},lost.route);
 assert.equal(receipt.code,'GIT_INITIAL_REF_UNCERTAIN');
 assert.equal(lost.metrics(),4);
});
