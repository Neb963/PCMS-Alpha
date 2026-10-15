import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {exactInitialSource,writeInitialReadySource,inspectInitialReadySource} from '../src/runtime/ready-source-git.mjs';
import {validateReadyMessage} from '../src/runtime/ready-source-boundary.mjs';
import {NON_READY_MARKER} from '../src/runtime/supply-git.mjs';
globalThis.crypto??=webcrypto;
const slug='ordinary-reviewed-source-001',token='temporary-private-github-token';
const pjs='output\n  Reviewed private content';
const html='<main>Reviewed output</main>';
const head='a'.repeat(40),oldTree='b'.repeat(40),markerSha='c'.repeat(40);
const newTree='d'.repeat(40),newCommit='e'.repeat(40);
const enc=s=>Buffer.from(s,'utf8').toString('base64');
const api={runtime:{id:'persona-route-manager@local',
  getURL:p=>'moz-extension://fixture/'+p}};
const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')};
function fakeGit({drift=false,collision=false,wrongMarker=false,uncertain=false}={}){
  let current=head,posts=0,patches=0,index=0;
  const uploaded=new Map([[markerSha,wrongMarker?enc('Status: READY\n'):enc(NON_READY_MARKER)]]);
  const requests=[];
  const shaList=['1','2','3'].map(x=>x.repeat(40));
  let savedCommit=null;
  const transport=async(url,options)=>{
    const u=new URL(url),path=u.pathname.replace('/repos/Neb963/per-gens','')+u.search,method=options.method;
    requests.push(method+' '+path);
    const good=data=>({status:method==='POST'?201:200,json:async()=>data});
    if(method==='GET'&&path==='')return good({private:true,full_name:'Neb963/per-gens'});
    if(method==='GET'&&path==='/git/ref/heads/main')
      return good({ref:'refs/heads/main',object:{sha:drift?'f'.repeat(40):current}});
    if(method==='GET'&&path==='/git/commits/'+head)
      return good({tree:{sha:oldTree}});
    if(method==='GET'&&path==='/git/trees/'+oldTree+'?recursive=1')
      return good({truncated:false,tree:collision?
        [{path:'gens/'+slug+'/main.pjs',type:'blob',sha:markerSha}]:
        [{path:'gens/'+slug+'/DEPLOYMENT.md',type:'blob',sha:markerSha}]});
    if(method==='GET'&&path.startsWith('/git/blobs/'))
      return good({sha:path.slice('/git/blobs/'.length),encoding:'base64',
        content:uploaded.get(path.slice('/git/blobs/'.length))});
    if(method==='POST'&&path==='/git/blobs'){
      posts++;const id=shaList[index++];uploaded.set(id,JSON.parse(options.body).content);
      return good({sha:id});
    }
    if(method==='POST'&&path==='/git/trees'){posts++;return good({sha:newTree});}
    if(method==='POST'&&path==='/git/commits'){
      posts++;savedCommit=JSON.parse(options.body);return good({sha:newCommit});
    }
    if(method==='PATCH'&&path==='/git/refs/heads/main'){
      patches++;if(uncertain)throw Error('LOST_ACK');
      current=JSON.parse(options.body).sha;return good({object:{sha:current}});
    }
    if(method==='GET'&&path==='/git/commits/'+newCommit)
      return good({tree:{sha:newTree},parents:[{sha:head}],message:savedCommit.message});
    throw Error('Unexpected fake endpoint '+method+' '+path);
  };
  return {transport,reads:()=>requests,posts:()=>posts,patches:()=>patches};
}
test('I17 F: initial READY source canonical fingerprint is content and slug bound',async()=>{
  const a=await exactInitialSource({slug,pjs,html});
  assert.equal(a.ok,true);assert.match(a.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(a.files.length,2);
  assert.notEqual(a.fingerprint,(await exactInitialSource({slug,pjs:pjs+'!',html})).fingerprint);
  assert.notEqual(a.fingerprint,(await exactInitialSource({slug:'different-source',pjs,html})).fingerprint);
  assert.equal((await exactInitialSource({slug:'../evil',pjs,html})).code,'INITIAL_SOURCE_INVALID');
  assert.equal((await exactInitialSource({slug,pjs:'',html})).code,'INITIAL_SOURCE_INVALID');
  assert.equal((await exactInitialSource({slug,pjs:pjs+'\0',html})).code,'INITIAL_SOURCE_INVALID');
});
test('I17 F: initial READY Git uses expected-head nonforced commit plus independent current blob proof',async()=>{
  const exact=await exactInitialSource({slug,pjs,html}),git=fakeGit();
  const out=await writeInitialReadySource({slug,pjs,html,token,
    expectedHead:head,fingerprint:exact.fingerprint},git.transport);
  assert.equal(out.ok,true,(out.code||'UNKNOWN')+' TRACE '+JSON.stringify(git.reads()));
  assert.equal(out.ready,true);assert.equal(out.head,newCommit);
  assert.equal(out.baseHead,head);assert.equal(git.patches(),1);
  assert.deepEqual(git.reads().filter(x=>x.startsWith('POST ')).length,5);
  assert.ok(git.reads().some(x=>x==='GET /git/blobs/'+markerSha));
  assert.ok(git.reads().some(x=>x==='GET /git/blobs/'+'3'.repeat(40)));
  assert.equal(git.reads().filter(x=>x==='PATCH /git/refs/heads/main').length,1);
});
test('I17 X: branch drift, folder collision, modified marker cause zero Git effects',async()=>{
  const exact=await exactInitialSource({slug,pjs,html});
  for(const options of [{drift:true},{collision:true},{wrongMarker:true}]){
    const git=fakeGit(options);
    const out=await writeInitialReadySource({slug,pjs,html,token,
      expectedHead:head,fingerprint:exact.fingerprint},git.transport);
    assert.equal(out.ok,false,JSON.stringify(options));
    assert.equal(git.posts(),0);
    assert.equal(git.patches(),0);
  }
  const git=fakeGit();
  const bad=await writeInitialReadySource({slug,pjs,html,token,
    expectedHead:head,fingerprint:'f'.repeat(64)},git.transport);
  assert.equal(bad.code,'READY_SOURCE_FINGERPRINT_MISMATCH');
  assert.equal(git.reads().length,0);
});
test('I17 X: lost Git update ACK is held and MUST NOT issue another PATCH',async()=>{
  const exact=await exactInitialSource({slug,pjs,html}),git=fakeGit({uncertain:true});
  const out=await writeInitialReadySource({slug,pjs,html,token,
    expectedHead:head,fingerprint:exact.fingerprint},git.transport);
  assert.equal(out.code,'READY_GIT_OUTCOME_UNKNOWN');
  assert.equal(git.patches(),1,JSON.stringify(git.reads()));
});
test('I17 X: forged sources and untrusted callers cannot enter a READY command',async()=>{
  const msg={type:'ARM',params:{slug,pjs,html,token,batchId:'batch_alpha_01',
    itemId:'item_alpha_01',expectedRevision:4,confirmation:'READY '+slug+' bogus'}};
  assert.equal(validateReadyMessage(api,{id:'untrusted',url:sender.url},msg).code,'UNTRUSTED_SENDER');
  assert.equal(validateReadyMessage(api,sender,{...msg,params:{...msg.params,
    overwrite:true}}).code,'INVALID_PARAMS');
  assert.equal(validateReadyMessage(api,sender,msg).ok,true);
  assert.equal(validateReadyMessage(api,sender,{type:'COMMIT',params:{slug,
    batchId:'batch_alpha_01',itemId:'item_alpha_01',
    expectedRevision:4,fingerprint:'a'.repeat(64),token}}).code,'INVALID_PARAMS');
});
test('I17 X: read-only reconciliation requires original parent and actual source byte digests',async()=>{
  const exact=await exactInitialSource({slug,pjs,html});
  const bytes=new TextEncoder();
  const sha=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes.encode(s))),
    v=>v.toString(16).padStart(2,'0')).join('');
  const paths=[{path:'DEPLOYMENT.md',sha256:await sha('Status: READY\nSource SHA-256: '+exact.fingerprint+'\n')},
    {path:'main.pjs',sha256:exact.files[0].sha256,size:exact.files[0].bytes},
    {path:'index.html',sha256:exact.files[1].sha256,size:exact.files[1].bytes}];
  const inspect=async()=>({ok:true,ready:true,repo:'Neb963/per-gens',folder:'gens/'+slug,
    head:newCommit,paths});
  const transport=async()=>({status:200,json:async()=>({parents:[{sha:head}],
    message:'pcms: approve initial exact source '+slug+' '+exact.fingerprint})});
  const v=await inspectInitialReadySource({slug,token,expectedHead:head,
    fingerprint:exact.fingerprint,files:exact.files},inspect,transport);
  assert.equal(v.ok,true,v.code+' '+JSON.stringify({paths,files:exact.files}));
  const changed=async()=>({...await inspect(),paths:[...paths.slice(0,1),
    {...paths[1],sha256:'f'.repeat(64)},paths[2]]});
  assert.equal((await inspectInitialReadySource({slug,token,expectedHead:head,
    fingerprint:exact.fingerprint,files:exact.files},changed,transport)).code,
    'READY_SOURCE_BYTES_CHANGED');
});
