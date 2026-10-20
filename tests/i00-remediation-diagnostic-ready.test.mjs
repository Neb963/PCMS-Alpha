import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto,createHash} from 'node:crypto';
import {writeDiagnosticReady,observeDiagnosticReady,diagnosticReadyFiles} from '../src/runtime/diagnostic-ready-git.mjs';
import {createS08CleanupBoundary} from '../src/runtime/s08-cleanup-boundary.mjs';
import {S04_NOT_READY} from '../src/runtime/creation-git.mjs';
globalThis.crypto??=webcrypto;
// Minimal in-memory GitHub REST git-data API (blobs/trees/commits/refs).
function fakeGitHub({repo='Neb963/per-gens',id='77',slug}){
  const objects=new Map(),log=[];
  const blob=text=>{const raw=Buffer.from(text);const sha=createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex');
    objects.set(sha,{type:'blob',content:raw});return sha;};
  let n=0;const mk=(type,v)=>{const sha=createHash('sha1').update(type+(++n)+JSON.stringify(v)).digest('hex');objects.set(sha,{type,...v});return sha;};
  const folder=mk('tree',{entries:[{path:'DEPLOYMENT.md',type:'blob',mode:'100644',sha:blob(S04_NOT_READY)}]});
  const gens=mk('tree',{entries:[{path:slug,type:'tree',mode:'040000',sha:folder}]});
  const root=mk('tree',{entries:[{path:'generators',type:'tree',mode:'040000',sha:gens}]});
  let head=mk('commit',{tree:root,parents:[]});
  const setPath=(treeSha,parts,leaf)=>{const t=objects.get(treeSha);const entries=t?[...t.entries]:[];
    const [first,...rest]=parts;const i=entries.findIndex(e=>e.path===first);
    const entry=rest.length?{path:first,type:'tree',mode:'040000',sha:setPath(i>=0?entries[i].sha:null,rest,leaf)}:{path:first,...leaf};
    if(i>=0)entries[i]=entry;else entries.push(entry);return mk('tree',{entries});};
  const json=(status,data)=>({status,json:async()=>data});
  const transport=async(url,o)=>{
    const route=url.replace('https://api.github.com/repos/'+repo,''),method=o.method,body=o.body&&JSON.parse(o.body);
    log.push(method+' '+route.split('/').slice(0,3).join('/'));
    if(route==='')return json(200,{full_name:repo,private:true,id:Number(id)});
    if(route==='/git/ref/heads/main')return json(200,{ref:'refs/heads/main',object:{type:'commit',sha:head}});
    if(method==='PATCH'&&route==='/git/refs/heads/main'){if(!objects.has(body.sha))return json(422,{});head=body.sha;return json(200,{});}
    let m;
    if((m=/^\/git\/commits\/([a-f0-9]{40})$/.exec(route)))return json(200,{tree:{sha:objects.get(m[1]).tree}});
    if((m=/^\/git\/trees\/([a-f0-9]{40})$/.exec(route)))return json(200,{truncated:false,tree:objects.get(m[1]).entries});
    if(method==='POST'&&route==='/git/blobs')return json(201,{sha:blob(body.content)});
    if(method==='POST'&&route==='/git/trees'){let t=body.base_tree;
      for(const e of body.tree)t=setPath(t,e.path.split('/'),{type:e.type,mode:e.mode,sha:e.sha});return json(201,{sha:t});}
    if(method==='POST'&&route==='/git/commits')return json(201,{sha:mk('commit',{tree:body.tree,parents:body.parents})});
    return json(404,{});
  };
  return {transport,log,head:()=>head};
}
const slug='pcms-test-alpha-1234';
const req=gh=>({repository:'Neb963/per-gens',repositoryId:'77',slug,readyRevision:'diag-0123456789ab',token:'ghp_'+'x'.repeat(20)});
test('diagnostic READY: conditional write of the PCMS-created test folder with independent readback',async()=>{
  const gh=fakeGitHub({slug});
  const before=await observeDiagnosticReady({...req(),expectedHead:'0'.repeat(40)},gh.transport);
  assert.equal(before.present,false);
  const out=await writeDiagnosticReady({...req(),expectedHead:before.head},gh.transport);
  assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.head,gh.head());
  const after=await observeDiagnosticReady({...req(),expectedHead:out.head},gh.transport);
  assert.equal(after.present,true);
  assert.match(diagnosticReadyFiles(slug,'diag-0123456789ab')[0].text,/^Status: READY\nReady-Revision: diag-/);
  // A second write is refused: the folder is no longer the bare NOT_READY marker.
  const again=await writeDiagnosticReady({...req(),expectedHead:out.head},gh.transport);
  assert.equal(again.code,'TEST_FOLDER_NOT_PCMS_NOT_READY');
  // Moved head is a pre-dispatch refusal, not an effect.
  assert.equal((await writeDiagnosticReady({...req(),expectedHead:before.head},gh.transport)).code,'GIT_HEAD_CHANGED');
});
function boundaryFixture({grant=true,write,observe,state='ASSOCIATED_NOT_READY',namespace='pcms-test-alpha'}={}){
  const local=new Map(Object.entries({
    pcmsS03Git:{repository:'Neb963/per-gens',repositoryId:'77'},
    pcmsS08DisposableScope:{accountId:'acct_test_01',personaUid:'persona-test-01',namespace,repositoryId:'77'},
    pcmsS08DiagnosticRun:{runId:'s08_0123456789ab',intentId:'intent_s08_0123456789ab',slug,
      config:{accountId:'acct_test_01',personaUid:'persona-test-01',namespace:'pcms-test-alpha',repositoryId:'77'}}}));
  const alarms=[];
  const api={runtime:{id:'x',getURL:p=>'moz-extension://x/'+p,onConnect:{addListener(){}}},
    alarms:{create:async(n,p)=>{alarms.push(n);}},
    storage:{local:{get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>local.has(k)).map(k=>[k,local.get(k)])),
      set:async o=>{for(const [k,v] of Object.entries(o))local.set(k,v);},remove:async k=>{local.delete(k);}}}};
  const b=createS08CleanupBoundary(api,{open:async()=>({}),gitGate:()=>grant,
    storeFactory:()=>({getCreate:async()=>({ok:true,record:{slug,accountId:'acct_test_01',state}})}),
    credential:async()=>({ok:true,token:'ghp_'+'x'.repeat(20)}),write,observe});
  return {b,local,alarms};
}
const sender={id:'x',url:'moz-extension://x/pcms/index.html'};
const msg={type:'DECLARE_TEST_READY',params:{intentId:'intent_s08_0123456789ab',runId:'s08_0123456789ab'}};
test('diagnostic READY boundary: grant and exact scope required; success journaled and ingested',async()=>{
  const writes=[];
  const observe=async()=>({ok:true,present:false,head:'a'.repeat(40)});
  const write=async r=>{writes.push(r);return {ok:true,head:'b'.repeat(40)};};
  assert.equal((await boundaryFixture({grant:false,observe,write}).b.run(msg,sender)).code,'GIT_WRITE_GRANT_REQUIRED');
  assert.equal((await boundaryFixture({namespace:'pcms-test-other',observe,write}).b.run(msg,sender)).code,'TEST_READY_SCOPE_UNVERIFIED');
  assert.equal((await boundaryFixture({state:'GIT_INIT_PENDING',observe,write}).b.run(msg,sender)).code,'TEST_FOLDER_NOT_YET_ASSOCIATED');
  assert.equal(writes.length,0);
  const f=boundaryFixture({observe,write});
  const out=await f.b.run(msg,sender);
  assert.equal(out.ok,true);assert.equal(writes.length,1);
  assert.equal(writes[0].expectedHead,'a'.repeat(40));assert.equal(writes[0].readyRevision,'diag-0123456789ab');
  assert.equal(f.local.get('pcmsS08ReadyDeclaration').state,'CONFIRMED');
  assert.deepEqual(f.alarms,['pcms-s03-main-resume']);
  // Idempotent resume after success.
  assert.equal((await f.b.run(msg,sender)).ok,true);assert.equal(writes.length,1);
});
test('diagnostic READY boundary: an uncertain write is reconciled by readback, never replayed',async()=>{
  const writes=[];let present=false;
  const observe=async()=>({ok:true,present,head:'c'.repeat(40)});
  const write=async r=>{writes.push(r);return {ok:false,code:'GIT_EFFECT_UNCERTAIN'};};
  const f=boundaryFixture({observe,write});
  assert.equal((await f.b.run(msg,sender)).code,'TEST_READY_WRITE_UNCERTAIN_RECONCILE');
  assert.equal(f.local.get('pcmsS08ReadyDeclaration').state,'UNCERTAIN');
  assert.equal((await f.b.run(msg,sender)).code,'TEST_READY_WRITE_UNCERTAIN_RECONCILE');
  assert.equal(writes.length,1,'no second write while uncertain');
  present=true;
  assert.equal((await f.b.run(msg,sender)).ok,true);
  assert.equal(f.local.get('pcmsS08ReadyDeclaration').state,'CONFIRMED');assert.equal(writes.length,1);
  // A verified pre-dispatch refusal leaves no journal and may be retried.
  const g=boundaryFixture({observe:async()=>({ok:true,present:false,head:'d'.repeat(40)}),
    write:async()=>({ok:false,code:'GIT_HEAD_CHANGED'})});
  assert.equal((await g.b.run(msg,sender)).code,'GIT_HEAD_CHANGED');
  assert.equal(g.local.has('pcmsS08ReadyDeclaration'),false);
});
