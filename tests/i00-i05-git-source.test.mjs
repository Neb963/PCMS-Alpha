import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {inspectGitSource,compareGitSource,safeFolder} from '../src/runtime/git-source.mjs';
import {validateSourceMessage,createSourceBoundary} from '../src/runtime/source-boundary.mjs';

const HEAD='a'.repeat(40), TREE='b'.repeat(40);
const bin=(value)=>typeof value==='string'?Buffer.from(value,'utf8'):Buffer.from(value);
function blobSha(bytes){
  const v=bin(bytes);
  return createHash('sha1').update(Buffer.from('blob '+v.length+'\0')).update(v).digest('hex');
}
function fixture(changes={}, flags={}) {
  const base={
    'gens/a/DEPLOYMENT.md':'# Example\nStatus: READY\n',
    'gens/a/main.pjs':'let x = 1',
    'gens/a/index.html':'<main>safe</main>',
    'gens/a/TESTING.md':'assert x',
    'gens/a/src/logo.png':Buffer.from([0,255,21,42]),
    'gens/b/DEPLOYMENT.md':'Status: NOT_READY\n',
    'gens/b/main.pjs':'unrelated',
    'gens/b/index.html':'<p>unrelated</p>'
  };
  const entries={...base,...changes};
  for(const [p,v] of Object.entries(entries))if(v===null)delete entries[p];
  const nodes=[
    {path:'gens',type:'tree',mode:'040000',sha:'d'.repeat(40)},
    {path:'gens/a',type:'tree',mode:'040000',sha:'e'.repeat(40)},
    {path:'gens/b',type:'tree',mode:'040000',sha:'f'.repeat(40)}
  ];
  const blobs=new Map();
  for(const [path,contents] of Object.entries(entries)){
    const bytes=bin(contents),sha=blobSha(bytes);
    nodes.push({path,type:'blob',mode:'100644',sha,size:bytes.length});
    blobs.set(sha,{sha,encoding:'base64',content:bytes.toString('base64'),size:bytes.length});
  }
  if(flags.extra)nodes.push(...flags.extra);
  const hits=[];
  async function transport(url, options) {
    hits.push({url,options});
    assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
    assert.equal(options.credentials,'omit');assert.equal(options.headers.Authorization,'Bearer read-only-test-token');
    const u=new URL(url),route=u.pathname+u.search;
    assert.equal(u.origin,'https://api.github.com');
    assert.ok(route.startsWith('/repos/Neb963/per-gens/'),route);
    let status=200,json;
    if(route.endsWith('/git/ref/heads/main')){
      if(flags.empty)status=409;else json={ref:'refs/heads/main',
        object:{type:'commit',sha:flags.head||HEAD}};
    }else if(route.includes('/git/commits/'))json={tree:{sha:TREE}};
    else if(route.includes('/git/trees/'))json={truncated:Boolean(flags.truncated),tree:nodes};
    else if(route.includes('/git/blobs/'))json=blobs.get(route.split('/').at(-1));
    else throw Error('unexpected URL '+route);
    if(status===200&&!json)throw Error('missing blob in test fixture '+route);
    return {status,json:async()=>json};
  }
  return {transport,hits,nodes,blobs};
}
const read=(fx,folder='gens/a')=>inspectGitSource({token:'read-only-test-token',folder},fx.transport);

test('P53-01 and S6-I05-EMPTY-GIT: missing main stays uninitialized, zero remote effects',async()=>{
  const f=fixture({}, {empty:true});
  const r=await read(f);
  assert.equal(r.code,'GITHUB_UNINITIALIZED');
  assert.equal(r.ready,false);
  assert.equal(f.hits.length,1);
  assert.equal(f.hits.every(h=>h.options.method==='GET'),true);
  assert.equal(safeFolder('gens/good-folder'),true);
  for(const p of ['../gens/a','/gens/a','gens/../a','gens/a%2fb','gens/a//b','gens/a\\b',
    'gens/a/./x','gens/é','gens/A.'])assert.equal(safeFolder(p),false,p);
  const bad=fixture();
  assert.equal((await read(bad,'gens/a/../b')).code,'UNSAFE_SOURCE_PATH');
  assert.equal(bad.hits.length,0);
});
test('P53-03 READY requires exact marker and all nonempty deployable root blobs',async()=>{
  const fx=fixture(),r=await read(fx);
  assert.equal(r.ok,true);
  assert.equal(r.ready,true);
  assert.equal(r.source,'READY');
  assert.equal(r.files,5);
  assert.match(r.fingerprint,/^[a-f0-9]{64}$/);
  assert.equal(r.testingSha,r.paths.find(x=>x.path==='TESTING.md').sha256);
  assert.equal(r.paths.find(x=>x.path==='src/logo.png').size,4);
  assert.equal(r.paths.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)),true);
  assert.equal(r.paths.some(x=>'content' in x),false);
  assert.equal(fx.hits.every(h=>h.options.method==='GET'),true);
  for(const changes of [
    {'gens/a/DEPLOYMENT.md':'Status: READY\nStatus: READY\n'},
    {'gens/a/DEPLOYMENT.md':'Status: READY \n'},
    {'gens/a/DEPLOYMENT.md':'Status: READY\nStatus: DISABLED\n'}
  ]) {
    const result=await read(fixture(changes));
    if(changes['gens/a/DEPLOYMENT.md']==='Status: READY \n')
      assert.equal(result.code,'NOT_READY');
    else assert.equal(result.code,'SOURCE_MANIFEST_UNSUPPORTED');
  }
  assert.equal((await read(fixture({'gens/a/DEPLOYMENT.md':'Status: NOT_READY\n'}))).ready,false);
  assert.equal((await read(fixture({'gens/a/main.pjs':null}))).ready,false);
  assert.equal((await read(fixture({'gens/a/index.html':''}))).ready,false);
});
test('P53-02 hostile paths, duplicate normalized names and unsupported objects never qualify',async()=>{
  const fx=fixture({}, {extra:[
    {path:'gens/a/src/evil%2f.png',type:'blob',mode:'100644',sha:'1'.repeat(40),size:1}
  ]});
  assert.equal((await read(fx)).code,'SOURCE_MANIFEST_UNSUPPORTED');
  const collision=fixture({}, {extra:[
    {path:'gens/a/SRC/logo.png',type:'blob',mode:'100644',sha:'1'.repeat(40),size:1}
  ]});
  // Requires a present parent directory in a real tree; modeled malicious
  // entries are rejected before any blob is retrieved.
  assert.equal((await read(collision)).code,'SOURCE_ASSOCIATION_CONFLICT');
  for(const type of ['commit','tree']) {
    const hostile=fixture({}, {extra:[{
      path:'gens/a/src/submodule',type,mode:type==='commit'?'160000':'100644',
      sha:'1'.repeat(40),size:1
    }]});
    assert.equal((await read(hostile)).code,'SOURCE_MANIFEST_UNSUPPORTED');
  }
  assert.equal((await read(fixture({}, {truncated:true}))).code,'SOURCE_MANIFEST_UNSUPPORTED');
});
test('P53-03 irrelevant HEAD changes preserve relevant source; READY/assets drift revoke',async()=>{
  const pinned=await read(fixture());
  const unrelated=await read(fixture({'gens/b/main.pjs':'changed'},{head:'c'.repeat(40)}));
  assert.equal(unrelated.head,'c'.repeat(40));
  assert.equal(compareGitSource(pinned,unrelated).code,'SOURCE_EQUIVALENT');
  const same=await read(fixture({}, {head:'d'.repeat(40)}));
  assert.equal(compareGitSource(pinned,same).code,'SOURCE_EQUIVALENT');
  const readyOff=await read(fixture({'gens/a/DEPLOYMENT.md':'Status: NOT_READY\n'}));
  assert.equal(compareGitSource(pinned,readyOff).code,'READY_REVOKED');
  const asset=await read(fixture({'gens/a/src/logo.png':Buffer.from([7,9,0])}));
  assert.equal(compareGitSource(pinned,asset).code,'SOURCE_DRIFT');
  const tests=await read(fixture({'gens/a/TESTING.md':'new test'}));
  assert.equal(compareGitSource(pinned,tests).code,'PINNED_TESTING_UNCHANGED');
  assert.equal(compareGitSource(pinned,tests,{pinnedTesting:false}).code,'TESTING_UPDATED');
  assert.equal(compareGitSource(pinned,{ok:false}).code,'SOURCE_UNVERIFIED');
});
test('S6-I05-ASSOCIATION command boundary rejects forged sender, proof and write methods',async()=>{
  const api={runtime:{id:'persona-route-manager@local',
    getURL:path=>'moz-extension://fixture/'+path}};
  const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')+'#generators'};
  assert.equal(validateSourceMessage(api,sender,{type:'INSPECT_SOURCE',
    params:{token:'read-only-test-token',folder:'gens/a'}}).ok,true);
  assert.equal(validateSourceMessage(api,sender,{type:'ASSOCIATE_SOURCE',
    params:{token:'read-only-test-token',slug:'alpha',folder:'gens/a',
      expectedRevision:3,pinnedHead:HEAD,pinnedFingerprint:'a'.repeat(64),
      pinnedTestingSha:null}}).ok,true);
  assert.equal(validateSourceMessage(api,sender,{type:'GIT_WRITE'}).code,'CAPABILITY_OFF');
  assert.equal(validateSourceMessage(api,{id:'web',url:sender.url},
    {type:'INSPECT_SOURCE',params:{folder:'gens/a'}}).code,'UNTRUSTED_SENDER');
  assert.equal(validateSourceMessage(api,sender,{type:'INSPECT_SOURCE',
    params:{folder:'gens/a',token:'test',ownerVerified:true}}).code,'INVALID_PARAMS');
  assert.equal(validateSourceMessage(api,sender,{type:'ASSOCIATE_SOURCE',
    params:{token:'read-only-test-token',slug:'alpha',folder:'gens/a',
      expectedRevision:3,pinnedHead:HEAD,pinnedFingerprint:'bad',pinnedTestingSha:null}
  }).code,'INVALID_PARAMS');
  const never=()=>{throw Error('No Git read or DB write permitted');};
  const run=createSourceBoundary({storage:{local:{get:async()=>({})}},
    ...api},{open:never,inspect:never}).run;
  assert.equal((await run({type:'GIT_WRITE'},sender)).code,'CAPABILITY_OFF');
});
test('I05 F: combined XPI entry and operator UI wire the read-only port, no stored token',async()=>{
  const paths=['../src/runtime/entry.mjs','../src/runtime/overlay.mjs',
    '../src/ui/index.html','../src/ui/source-view.mjs'];
  const [entry,overlay,html,ui]=await Promise.all(paths.map(x=>readFile(new URL(x,import.meta.url),'utf8')));
  assert.match(entry,/import '\.\/source-boundary\.mjs'/);
  assert.match(overlay,/'git-source.mjs', 'source-boundary.mjs'/);
  for(const id of ['pcms-source-target','pcms-source-folder','pcms-source-token',
    'pcms-source-inspect','pcms-source-associate','pcms-source-recheck'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/src="source-view\.mjs"/);
  assert.doesNotMatch(ui,/storage\.local\.set|storage\.sync\.set/);
});
