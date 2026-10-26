import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {writeArchive,inspectArchive,archiveLocation} from '../src/runtime/adoption-git.mjs';
import {validateAdoptionMessage,createAdoptionBoundary} from '../src/runtime/adoption-boundary.mjs';
globalThis.crypto ??= webcrypto;
const gitSha=data=>{const b=Buffer.from(data);return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
const sha256=data=>createHash('sha256').update(data).digest('hex');
const f='abc'.repeat(21)+'a',slug='example',token='test-github-write-token';
const sourceFiles=[
  {path:'main.pjs',bytes:Buffer.from('let original=1;')},
  {path:'index.html',bytes:Buffer.from('<main>Original</main>')},
  {path:'src/a.bin',bytes:Buffer.from([0,1,255,9])}];
const original={fingerprint:f,remotePublicId:'public_12345678',visibility:'PUBLIC',
  observedAt:123123,
  files:sourceFiles.map(x=>({path:x.path,size:x.bytes.length,sha256:sha256(x.bytes)})),
  blobs:sourceFiles.map(x=>({path:x.path,base64:x.bytes.toString('base64')}))};
function fake({collision=false,existingFolder=false,lostPatch=false,mutateBlob=false}={}){
  const entries=new Map(),blobs=new Map(),trees=new Map(),commits=new Map();
  let head='a'.repeat(40),post=0,patch=0;
  const initialTree='b'.repeat(40);
  if(collision)entries.set('originals/'+slug+'/'+f+'/main.pjs',
    {path:'originals/'+slug+'/'+f+'/main.pjs',sha:'c'.repeat(40),type:'blob',mode:'100644',size:3});
  if(existingFolder)entries.set('gens/example/index.html',
    {path:'gens/example/index.html',sha:'c'.repeat(40),type:'blob',mode:'100644',size:3});
  trees.set(initialTree,[...entries.values()]);
  commits.set(head,initialTree);
  const methods=[];
  async function transport(url,option){
    const path=new URL(url).pathname.replace('/repos/Neb963/per-gens',''),method=option.method;
    methods.push(method+' '+path);
    assert.equal(option.headers.Authorization,'Bearer '+token);
    assert.equal(option.redirect,'error');
    let status=200,data=null;
    if(path==='')data={full_name:'Neb963/per-gens',private:true};
    else if(path==='/git/ref/heads/main'&&method==='GET')
      data={ref:'refs/heads/main',object:{sha:head,type:'commit'}};
    else if(path.startsWith('/git/commits/')&&method==='GET')
      data={tree:{sha:commits.get(path.split('/').at(-1))}};
    else if(path.startsWith('/git/trees/')&&method==='GET')
      data={truncated:false,tree:trees.get(path.split('/').at(-1))};
    else if(path.startsWith('/git/blobs/')&&method==='GET'){
      const sh=path.split('/').at(-1),v=blobs.get(sh);
      if(!v){status=404;data={message:'missing'};}
      else data={sha:sh,encoding:'base64',content:mutateBlob?
        Buffer.from('tampered').toString('base64'):v.toString('base64')};
    }else if(path==='/git/blobs'&&method==='POST'){
      post++;const input=JSON.parse(option.body);
      const v=Buffer.from(input.content,input.encoding==='base64'?'base64':'utf8');
      const sh=gitSha(v);blobs.set(sh,v);status=201;data={sha:sh};
    }else if(path==='/git/trees'&&method==='POST'){
      post++;const input=JSON.parse(option.body);
      const base=trees.get(input.base_tree);
      assert.ok(base);
      const merged=[...base.filter(x=>!input.tree.some(t=>t.path===x.path)),
        ...input.tree.map(t=>({...t,size:blobs.get(t.sha)?.length}))];
      const tree='d'.repeat(40);trees.set(tree,merged);status=201;data={sha:tree};
    }else if(path==='/git/commits'&&method==='POST'){
      post++;const input=JSON.parse(option.body);
      assert.deepEqual(input.parents,[head]);
      const commit='e'.repeat(40);commits.set(commit,input.tree);
      status=201;data={sha:commit};
    }else if(path==='/git/refs/heads/main'&&method==='PATCH'){
      patch++;const input=JSON.parse(option.body);
      assert.equal(input.force,false);
      head=input.sha;
      if(lostPatch)throw Error('lost ack after write');
      data={ref:'refs/heads/main',object:{sha:head}};
    }else throw Error('unexpected remote '+method+' '+path);
    return {status,json:async()=>data};
  }
  return {transport,methods,counts:()=>({post,patch,head})};
}
const request={slug,folder:'gens/example',original,token};
test('P53-04/05 early Git archive preserves byte-equivalent local originals and non-READY folder',async()=>{
  const f=fake(),result=await writeArchive(request,f.transport);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.source,'INDEPENDENT_GIT_BYTE_READBACK');
  assert.equal(result.createdMarker,true);
  assert.equal(result.ready,false);
  assert.equal(result.prefix,archiveLocation(slug,original.fingerprint));
  assert.equal(f.counts().patch,1);
  const read=await inspectArchive(request,f.transport);
  assert.equal(read.ok,true);
  assert.equal(read.head,result.head);
  assert.equal(f.methods.filter(x=>x.startsWith('PATCH')).length,1);
});
test('S6-I07-ORIGINAL-ARCHIVE existing unrelated development source never overwritten',async()=>{
  const fx=fake({existingFolder:true});
  const result=await writeArchive(request,fx.transport);
  assert.equal(result.ok,true,JSON.stringify(result));
  assert.equal(result.createdMarker,false);
  assert.equal(fx.methods.some(s=>s.includes('gens/example/DEPLOYMENT.md')),false);
});
test('S6-I07-ORIGINAL-ARCHIVE existing archive collision prevents all mutations',async()=>{
  const fx=fake({collision:true});
  const result=await writeArchive(request,fx.transport);
  assert.equal(result.code,'ORIGINAL_ARCHIVE_COLLISION');
  assert.equal(fx.counts().post,0);
  assert.equal(fx.counts().patch,0);
});
test('P53-05 lost ref update means UNCERTAIN; never infer no effect or replay',async()=>{
  const fx=fake({lostPatch:true});
  const result=await writeArchive(request,fx.transport);
  assert.equal(result.code,'GIT_WRITE_UNCERTAIN');
  assert.equal(fx.counts().patch,1);
  const proof=await inspectArchive(request,fx.transport);
  assert.equal(proof.ok,true);
});
test('original corrupt asset fails before first remote attempt',async()=>{
  const fx=fake();
  const bad={...request,original:{...original,blobs:original.blobs.map(x=>
    x.path==='src/a.bin'?{...x,base64:Buffer.from('wrong').toString('base64')}:x)}};
  const result=await writeArchive(bad,fx.transport);
  assert.equal(result.ok,false);
  assert.equal(fx.methods.length,0);
});
test('independent archive readback rejects corrupted provider Git blob',async()=>{
  const fx=fake({mutateBlob:true});
  const result=await writeArchive(request,fx.transport);
  assert.equal(result.code,'GIT_READBACK_UNCERTAIN');
  assert.equal(fx.counts().patch,1);
});
test('I07 trusted port rejects forged caller, arbitrary Git writes and payload',async()=>{
  const api={runtime:{id:'persona-route-manager@local',
    getURL:path=>'moz-extension://fixture/'+path}};
  const sender={id:api.runtime.id,url:'moz-extension://fixture/pcms/index.html#generators'};
  assert.equal(validateAdoptionMessage(api,sender,{type:'ARCHIVE_GIT',
    params:{slug:'example',expectedRevision:1}}).ok,true);
  assert.equal(validateAdoptionMessage(api,sender,{type:'ARCHIVE_GIT',
    params:{slug:'example',expectedRevision:1,token}}).code,'INVALID_PARAMS');
  assert.equal(validateAdoptionMessage(api,{id:'elsewhere',url:sender.url},
    {type:'ARCHIVE_GIT',params:{slug,expectedRevision:1}}).code,'UNTRUSTED_SENDER');
  assert.equal(validateAdoptionMessage(api,sender,{type:'WRITE_PROVIDER'}).code,'CAPABILITY_OFF');
  assert.equal(validateAdoptionMessage(api,sender,{type:'ARCHIVE_GIT',
    params:{slug,expectedRevision:1,token,force:true}}).code,'INVALID_PARAMS');
  const never=()=>{throw Error('forbidden');};
  const boundary=createAdoptionBoundary({...api,storage:{local:{get:async()=>({})}}},
    {open:never,guard:never,gitWrite:never});
  assert.equal((await boundary.run({type:'WRITE_PROVIDER'},sender)).code,'CAPABILITY_OFF');
});

for(const finalPolicyChange of ['REVOKE','REVOKE_REGRANT','RESTORE','UNCHANGED'])
 test('F2 original archive checks '+finalPolicyChange+' after final restore read and preserves immutable originals',async()=>{
  let record={slug,revision:1,archiveState:'ARCHIVE_PENDING',personaUid:'persona_fixture_01',original},
   allowed=true,epoch=1,armed=false,changed=false,held=false,writes=0;
  const gate=()=>allowed;gate.generation=()=>epoch;
  const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},
   storage:{local:{get:async key=>{
    if(key==='pcmsRestoreInProgress'&&armed&&!changed){
     changed=true;if(finalPolicyChange!=='UNCHANGED')epoch++;
     if(finalPolicyChange==='REVOKE')allowed=false;
     if(finalPolicyChange==='RESTORE')held=true;
     await Promise.resolve();
    }
    return key==='pcmsRestoreInProgress'&&held?{[key]:{active:true,status:'PREPARING'}}:{};
   }}}};
  const boundary=createAdoptionBoundary(api,{open:async()=>({}),gitGate:gate,
   storeFactory:()=>({getFull:async()=>({ok:true,record}),
    archiveStage:async(_slug,revision,event)=>{
     assert.equal(revision,record.revision);
     const state={PREPARE:'GIT_PREPARED',MARK_DISPATCH:'DISPATCH_POSSIBLE',HELD_UNCERTAIN:'HELD_UNCERTAIN'}[event];
     assert.ok(state);record={...record,revision:record.revision+1,archiveState:state};
     if(event==='MARK_DISPATCH')armed=true;
     return {ok:true,record};
    }}),
   guard:()=>({getSafeRouteReadiness:async()=>({ready:true,cookieStoreId:'container_01',routeId:'protected_01'})}),
   getGitConnection:async()=>({repository:'Neb963/per-gens',repositoryId:'42'}),
   getGitCredential:async()=>({ok:true,credential:'synthetic-browser-token'}),
   gitWrite:async request=>{assert.deepEqual(request.original,original);writes++;return {ok:false,code:'GIT_WRITE_UNCERTAIN'};}});
  const sender={id:'fixture',url:'moz-extension://fixture/pcms/index.html'};
  const out=await boundary.run({type:'ARCHIVE_GIT',params:{slug,expectedRevision:1}},sender);
  assert.equal(changed,true,JSON.stringify(out));
  assert.equal(writes,finalPolicyChange==='UNCHANGED'?1:0);
  assert.equal(record.archiveState,'HELD_UNCERTAIN');
  assert.equal(out.code,finalPolicyChange==='UNCHANGED'?'GIT_WRITE_UNCERTAIN':'GIT_DISPATCH_HELD_UNCERTAIN');
  assert.deepEqual(record.original,original);
  await boundary.run({type:'ARCHIVE_GIT',params:{slug,expectedRevision:record.revision}},sender);
  assert.equal(writes,finalPolicyChange==='UNCHANGED'?1:0,'uncertainty cannot archive again');
 });
