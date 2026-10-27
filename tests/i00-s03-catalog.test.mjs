import {fakeDatabase} from './fake-idb.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash,webcrypto} from 'node:crypto';
import {scanMainCatalog,makeInitialImportPreview,compareCatalogScopes,
  catalogScopeFingerprint} from '../src/runtime/git-catalog.mjs';
import {createCatalogBoundary,validateCatalogMessage} from '../src/runtime/catalog-boundary.mjs';
globalThis.crypto??=webcrypto;
const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),D='d'.repeat(40),E='e'.repeat(40),F='f'.repeat(40);
const repo='Neb963/per-gens', TOKEN='test-token-not-a-real-secret';
function blob(value){
  const raw=Buffer.from(value);
  return {sha:createHash('sha1').update('blob '+raw.length+'\0').update(raw).digest('hex'),
    size:raw.length,mode:'100644',type:'blob',raw};
}
function fake({count=1,truncated=false,omitPrompt=false,corrupt=false,
  foreign=false,duplicate=false,nonrecursiveTruncated=false}={}){
  const db=new Map(),items=[];
  function add(path,value){
    const entry=blob(value);
    db.set(entry.sha,entry);items.push({path,sha:entry.sha,size:entry.size,mode:entry.mode,type:'blob'});
  }
  items.push({path:'generators',sha:F,type:'tree',mode:'040000'});
  items.push({path:'pcms',sha:C,type:'tree',mode:'040000'});
  items.push({path:'pcms/prompts',sha:D,type:'tree',mode:'040000'});
  if(!omitPrompt)add('pcms/prompts/default-chat1.md','Git-authoritative existing prompt\n');
  for(let i=0;i<count;i++){
    const slug='gen-'+i,folder='generators/'+slug;
    items.push({path:folder,sha: E,type:'tree',mode:'040000'});
    add(folder+'/DEPLOYMENT.md','Status: READY\n');
    add(folder+'/main.pjs','hello');
    add(folder+'/index.html','<p>present</p>');
    if(i===0)add(folder+'/TESTING.md','optional fresh chat2');
  }
  if(duplicate)items.push({...items.find(x=>x.path==='generators/gen-0/main.pjs')});
  let writes=0,reads=0;
  const requests=[];
  function resp(status,data){return {status,json:async()=>data};}
  async function transport(url,options){
    const u=new URL(url),path=u.pathname.replace('/repos/'+repo,'');
    assert.equal(u.origin,'https://api.github.com');
    assert.equal(options.redirect,'error');assert.equal(options.credentials,'omit');
    assert.equal(options.headers.Authorization,'Bearer '+TOKEN);
    requests.push({path:path+u.search,method:options.method});
    if(options.method!=='GET'){writes++;return resp(405,{})}
    reads++;
    if(path==='')return resp(200,{full_name:foreign?'other/repo':repo,private:true,id:42});
    if(path==='/git/ref/heads/main')return resp(200,{ref:'refs/heads/main',object:{type:'commit',sha:A}});
    if(path==='/git/commits/'+A)return resp(200,{tree:{sha:B}});
    if(path==='/git/trees/'+B&&u.searchParams.get('recursive')==='1')
      return resp(200,{truncated,tree:truncated?items.slice(0,5):items});
    if(path==='/git/trees/'+B)return resp(200,{truncated:nonrecursiveTruncated,
      tree:[{path:'generators',type:'tree',mode:'040000',sha:F},
        {path:'pcms',type:'tree',mode:'040000',sha:C}]});
    if(path==='/git/trees/'+F)return resp(200,{truncated:false,tree:
      items.filter(x=>x.path.startsWith('generators/')&&x.path.split('/').length===2)
      .map(x=>({...x,path:x.path.split('/').at(-1)}))});
    if(path==='/git/trees/'+C)return resp(200,{truncated:false,
      tree:[{path:'prompts',type:'tree',mode:'040000',sha:D}]});
    if(path==='/git/trees/'+D)return resp(200,{truncated:false,tree:
      items.filter(x=>x.path.startsWith('pcms/prompts/')).map(x=>({...x,path:x.path.split('/').at(-1)}))});
    // The same SHA may appear for all fixture generator trees; the pathless
    // fixture still returns one structurally complete generator for fallback.
    if(path==='/git/trees/'+E)return resp(200,{truncated:false,tree:
      items.filter(x=>x.path.startsWith('generators/gen-0/')).map(x=>({...x,path:x.path.split('/').at(-1)}))});
    if(path.startsWith('/git/blobs/')){
      const data=db.get(path.slice('/git/blobs/'.length));
      return data?resp(200,{sha:data.sha,size:data.size,encoding:'base64',
        content:(corrupt?'tampered':data.raw).toString('base64')}):resp(404,{});
    }
    throw Error('Unexpected endpoint '+path);
  }
  return {transport,metrics:()=>({writes,reads,requests})};
}
const run=(f,extra={})=>scanMainCatalog({token:TOKEN,repository:repo,...extra},f.transport);

test('S03: 1,025 complete main generator folders and inherited prompt, no writes or 1,000 cap',async()=>{
  const f=fake({count:1025}),r=await run(f);
  assert.equal(r.code,'CATALOG_COMPLETE',JSON.stringify(r).slice(0,240));
  assert.equal(r.generators.length,1025);
  assert.equal(r.generators[0].sourceState,'READY_UNVERIFIED_COHERENCE');
  assert.equal(r.prompt.text,'Git-authoritative existing prompt\n');
  assert.equal(r.generators[0].testingOid?.length,40);
  assert.equal(f.metrics().writes,0);
  assert.equal(f.metrics().requests.every(x=>x.method==='GET'),true);
  const preview=makeInitialImportPreview(r);
  assert.equal(preview.items.length,1025);
  assert.equal(preview.unresolved,1025);
  assert.equal(preview.approved,false);
});

test('S03: truncated recursive tree walks all managed subtrees, not the partial prefix',async()=>{
  const f=fake({truncated:true}),r=await run(f);
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.recognizedCount,1);
  assert.equal(r.prompt.state,'PRESENT');
  assert.ok(f.metrics().requests.some(x=>x.path==='/git/trees/'+E));
});

test('S03: incomplete fallback, budget, collision, modified blob, wrong repo each hold',async()=>{
  for(const [cfg,code,limits] of [
    [{truncated:true,nonrecursiveTruncated:true},'CATALOG_INCOMPLETE',{}],
    [{count:12},'CATALOG_INCOMPLETE',{maxRequests:5}],
    [{duplicate:true},'CATALOG_CONFLICT',{}],
    [{corrupt:true},'CATALOG_INCOMPLETE',{}],
    [{foreign:true},'REPOSITORY_IDENTITY_UNVERIFIED',{}]
  ]){
    const f=fake(cfg),r=await run(f,limits);
    assert.equal(r.ok,false,JSON.stringify({cfg,r}));
    assert.equal(r.code,code,JSON.stringify({cfg,r}));
    assert.equal(r.complete,false);
    assert.equal(f.metrics().writes,0);
  }
});

test('S03: legitimate absent prompt is absent, never replaced with invented starter',async()=>{
  const r=await run(fake({omitPrompt:true}));
  assert.equal(r.ok,true);
  assert.deepEqual(r.prompt,{state:'ABSENT',path:'pcms/prompts/default-chat1.md',oid:null,text:null});
});

test('S03: scope preview may retain unrelated head movement, not changed declarations or repo',async()=>{
  const a=await run(fake());
  const b={...a,head:C};
  assert.equal(compareCatalogScopes(a,b).code,'IMPORT_SCOPE_UNCHANGED');
  assert.equal(compareCatalogScopes(a,{...a,repositoryId:'999'}).code,'IMPORT_SCOPE_UNVERIFIED');
  const c={...a,generators:a.generators.map(g=>({...g,markerOid:B}))};
  assert.equal(compareCatalogScopes(a,c).code,'IMPORT_SCOPE_CHANGED');
  assert.notEqual(catalogScopeFingerprint(a.generators),catalogScopeFingerprint(c.generators));
  const n=makeInitialImportPreview(a,[{slug:'gen-0',state:'MISSING_VERIFIED',absenceVerified:true,
    proposedAccountId:'account-1'}]);
  assert.equal(n.unresolved,0);
  assert.equal(n.approved,false);
  assert.equal(n.items[0].proposedAccountId,'account-1');
});

test('S03: extension sender and operation allowlist, no token storage or mutation port',async()=>{
  const api={runtime:{id:'combined-id',getURL:x=>'moz-extension://test/'+x},
    storage:{local:{get:async()=>({}),set:()=>{throw Error('secret persisted')}}}};
  const sender={id:'combined-id',url:'moz-extension://test/pcms/index.html'};
  const message={type:'SCAN_CATALOG',params:{repository:repo,token:TOKEN}};
  assert.equal(validateCatalogMessage(api,sender,message).ok,true);
  for(const bad of [{...message,type:'GIT_WRITE'}, {...message,params:{...message.params,force:true}},
    {...message,params:{repository:'../unsafe',token:TOKEN}}]){
    assert.equal(validateCatalogMessage(api,sender,bad).ok,false);
  }
  assert.equal(validateCatalogMessage(api,{id:'hostile'},message).code,'UNTRUSTED_SENDER');
  const f=fake();
  const runPort=createCatalogBoundary(api,{scan:o=>run(f,o)}).run;
  const r=await runPort(message,sender);
  assert.equal(r.ok,true);
  assert.equal(r.preview.approved,false);
  const files=await Promise.all([
    'src/runtime/entry.mjs','src/runtime/overlay.mjs','src/ui/index.html','src/ui/catalog-view.mjs'
  ].map(p=>readFile(new URL('../'+p,import.meta.url),'utf8')));
  assert.match(files[0],/import '.\/catalog-boundary\.mjs'/);
  for(const name of ['git-catalog.mjs','git-prompt.mjs','catalog-import.mjs',
    'catalog-prompt-store.mjs','catalog-resume.mjs','catalog-declaration.mjs',
    'catalog-ready-store.mjs','catalog-boundary.mjs','catalog-watch.mjs'])
    assert.ok(files[1].includes("'"+name+"'"),name);
  assert.match(files[2],/<script type="module" src="faithful\/bridge\.mjs"><\/script>/);
  assert.doesNotMatch(files[2],/src="catalog-view\.mjs"/);
  const primary=await readFile(new URL('../src/ui/faithful/bridge.mjs',import.meta.url),'utf8');
  assert.match(primary,/pcms-s03-catalog/);
  assert.match(primary,/primaryConnections/);
  for(const id of ['pcms-catalog-scan','pcms-catalog-repo','pcms-catalog-token',
    'pcms-catalog-list','pcms-catalog-prompt'])assert.match(files[2],new RegExp('id="'+id+'"'));
  assert.doesNotMatch(files[3],/storage\.local\.set|storage\.sync\.set/);
});

test('S03: one-time native-vault connect, read-only reconnection scan and explicit disconnect',async()=>{
  const state=new Map(),secrets=new Map(),observations=[];
  const api={runtime:{id:'combined-id',getURL:x=>'moz-extension://test/'+x},storage:{local:{
    get:async key=>Object.fromEntries([...state].filter(([k])=>k===key)),
    set:async values=>{for(const [k,v] of Object.entries(values)){
      assert.ok(!JSON.stringify(v).includes(TOKEN),'token must never enter local storage');
      state.set(k,v);
    }},
    remove:async key=>state.delete(key)
  }}};
  const sender={id:'combined-id',url:'moz-extension://test/pcms/index.html'};
  async function native(message){
    observations.push({...message});
    const id=message.repositoryId;
    if(message.action==='git.store'){
      secrets.set(id,message.credential);return {ok:true};
    }
    if(message.action==='git.get')return {ok:secrets.has(id),credential:secrets.get(id)};
    if(message.action==='git.status')return {ok:secrets.has(id),present:secrets.has(id)};
    if(message.action==='git.remove'){secrets.delete(id);return {ok:true};}
    throw Error('unexpected native action');
  }
  const fx=fake();
  const boundary=createCatalogBoundary(api,{native,open:async()=>fakeDatabase(),
    transport:fx.transport,
    scan:async({repository,token})=>{
      assert.equal(repository,repo);assert.equal(token,TOKEN);
      return await run(fx);
    }});
  const connect=await boundary.run({type:'CONNECT_GIT',params:{repository:repo,token:TOKEN}},sender);
  assert.equal(connect.code,'GIT_CONNECTED_LOCALLY_VERIFIED',JSON.stringify(connect));
  assert.equal(connect.repositoryId,'42');
  assert.equal(state.get('pcmsS03Git').repository,repo);
  assert.equal(state.get('pcmsS03Git').repositoryId,'42');
  assert.equal((await boundary.run({type:'GIT_STATUS'},sender)).code,'GIT_CREDENTIAL_PRESENT_UNAUTHENTICATED');
  const scan=await boundary.run({type:'SCAN_CONNECTED'},sender);
  assert.equal(scan.code,'CATALOG_COMPLETE');
  assert.equal(scan.preview.approved,false);
  assert.equal(JSON.stringify(scan).includes(TOKEN),false);
  const disconnect=await boundary.run({type:'DISCONNECT_GIT'},sender);
  assert.equal(disconnect.code,'GIT_DISCONNECTED');
  assert.equal((await boundary.run({type:'SCAN_CONNECTED'},sender)).code,'GIT_RECONNECT_REQUIRED');
  assert.ok(observations.some(x=>x.action==='git.get'));
  assert.ok(observations.some(x=>x.action==='git.remove'));
  assert.equal(fx.metrics().writes,0);
});
test('S03: vault unavailable does not persist configuration or claim Git success',async()=>{
  const state={};
  const api={runtime:{id:'combined-id',getURL:x=>'moz-extension://test/'+x},storage:{local:{
    get:async key=>key in state?{[key]:state[key]}:{},
    set:async values=>Object.assign(state,values),
    remove:async key=>delete state[key]
  }}};
  const sender={id:'combined-id',url:'moz-extension://test/pcms/index.html'},fx=fake();
  const boundary=createCatalogBoundary(api,{native:async()=>({ok:false,code:'LOCKED'}),
    transport:fx.transport,scan:async()=>{throw Error('should not scan')}});
  assert.equal((await boundary.run({type:'CONNECT_GIT',
    params:{repository:repo,token:TOKEN}},sender)).code,'GIT_VAULT_STORE_OUTCOME_UNCERTAIN');
  assert.equal(state.pcmsS03Git,undefined);
  assert.equal((await boundary.run({type:'SCAN_CONNECTED'},sender)).code,'GIT_RECONNECT_REQUIRED');
});

test('R3: pending vault outcome recovers only with explicit same-repository replacement consent',async()=>{
  const state={},fx=fake(),sender={id:'combined-id',url:'moz-extension://test/pcms/index.html'};
  const api={runtime:{id:'combined-id',getURL:x=>'moz-extension://test/'+x},storage:{local:{
    get:async key=>key in state?{[key]:state[key]}:{},
    set:async values=>{assert.ok(!JSON.stringify(values).includes(TOKEN));Object.assign(state,values);},
    remove:async key=>{delete state[key];}
  }}};
  let stores=0;
  const native=async message=>{
    if(message.action==='git.store'){
      stores++;
      if(stores===1)throw Error('lost vault acknowledgement');
      assert.equal(message.repositoryId,'42');assert.equal(message.credential,TOKEN);
      return {ok:true};
    }
    if(message.action==='git.status')return {ok:stores>=2,present:stores>=2};
    return {ok:false,code:'UNAVAILABLE'};
  };
  const boundary=createCatalogBoundary(api,{native,open:async()=>fakeDatabase(),transport:fx.transport});
  assert.equal((await boundary.run({type:'CONNECT_GIT',params:{repository:repo,token:TOKEN}},sender)).code,
    'GIT_VAULT_STORE_OUTCOME_UNCERTAIN');
  assert.equal(stores,1);
  assert.equal(state.pcmsS03Git,undefined);
  assert.equal(state.pcmsS03GitPending.repositoryId,'42');
  assert.equal((await boundary.run({type:'CONNECT_GIT',params:{repository:repo,token:TOKEN}},sender)).code,
    'GIT_PENDING_CONNECTION_RECONCILIATION_REQUIRED');
  assert.equal((await boundary.run({type:'RECOVER_GIT_CONNECTION',params:{
    repository:repo,token:TOKEN}},sender)).code,'INVALID_PARAMS');
  assert.equal(stores,1,'a rejected retry never writes to the vault');
  state.pcmsS03GitPending.repositoryId='99';
  assert.equal((await boundary.run({type:'RECOVER_GIT_CONNECTION',params:{
    repository:repo,token:TOKEN,acknowledgeCredentialReplacement:true}},sender)).code,
    'GIT_RECOVERY_SCOPE_MISMATCH');
  assert.equal(stores,1,'wrong scope never dispatches a write');
  state.pcmsS03GitPending.repositoryId='42';
  const recovered=await boundary.run({type:'RECOVER_GIT_CONNECTION',params:{
    repository:repo,token:TOKEN,acknowledgeCredentialReplacement:true}},sender);
  assert.equal(recovered.code,'GIT_CONNECTED_LOCALLY_VERIFIED',JSON.stringify(recovered));
  assert.equal(stores,2);
  assert.equal(state.pcmsS03GitPending,undefined);
  assert.equal(state.pcmsS03Git.repositoryId,'42');
  assert.equal(fx.metrics().writes,0,'no private Git writes occur');
});
