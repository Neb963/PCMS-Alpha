import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitCredentialResolver,GIT_RECONNECT_REQUIRED} from '../src/runtime/git-credential.mjs';
import {validateWritebackMessage} from '../src/runtime/writeback-boundary.mjs';
const sender={id:'fixture',url:'moz-extension://fixture/pcms/index.html'};
const apiWith=(config)=>({runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},
  storage:{local:{get:async()=>config?{pcmsS03Git:config}:{}}}});
const token='github_pat_'+'x'.repeat(30);
test('one-time Git: vault credential serves routine jobs without a typed token',async()=>{
  const calls=[];
  const resolve=createGitCredentialResolver(apiWith({repository:'Neb963/per-gens',repositoryId:'42'}),
    {native:async p=>{calls.push(p);return {ok:true,credential:token};}});
  const r=await resolve();
  assert.equal(r.ok,true);assert.equal(r.token,token);assert.equal(r.source,'OS_VAULT');
  assert.deepEqual(calls,[{action:'git.get',repositoryId:'42'}]);
  // Explicit override never touches the vault.
  const o=await resolve('ghp_'+'y'.repeat(20));
  assert.equal(o.source,'OPERATOR_SUPPLIED');assert.equal(calls.length,1);
  assert.equal((await resolve('short')).code,'INVALID_PARAMS');
});
test('one-time Git: missing connection or vault loss asks for one reconnection',async()=>{
  const none=createGitCredentialResolver(apiWith(null),{native:async()=>{throw Error('no');}});
  assert.equal((await none()).code,GIT_RECONNECT_REQUIRED);
  const missing=createGitCredentialResolver(apiWith({repository:'Neb963/per-gens',repositoryId:'42'}),
    {native:async()=>({ok:false,code:'MISSING_OR_INVALID'})});
  assert.equal((await missing()).code,GIT_RECONNECT_REQUIRED);
  const locked=createGitCredentialResolver(apiWith({repository:'Neb963/per-gens',repositoryId:'42'}),
    {native:async()=>({ok:false,code:'UNAVAILABLE'})});
  assert.equal((await locked()).code,'GIT_VAULT_UNAVAILABLE');
  const thrown=createGitCredentialResolver(apiWith({repository:'Neb963/per-gens',repositoryId:'42'}),
    {native:async()=>{throw Error('host missing');}});
  assert.equal((await thrown()).code,'GIT_VAULT_UNAVAILABLE');
});
test('one-time Git: writeback commands no longer require a per-operation token',()=>{
  const api=apiWith(null);
  assert.equal(validateWritebackMessage(api,sender,{type:'COMMIT',params:{slug:'a-b',expectedRevision:2}}).ok,true);
  assert.equal(validateWritebackMessage(api,sender,{type:'ARM_AUTO',params:{slug:'a-b'}}).ok,true);
  assert.equal(validateWritebackMessage(api,sender,{type:'COMMIT',params:{slug:'a-b',expectedRevision:2,token:'short'}}).ok,false);
});
test('cross-feature: vault loss holds queued work with one incident; reconnect resumes the same queue',async()=>{
  const {createCatalogWatcher}=await import('../src/runtime/catalog-watch.mjs');
  const saved=new Map([['pcmsS03Git',{repository:'Neb963/per-gens',repositoryId:'42'}]]);
  const api={storage:{local:{get:async k=>saved.has(k)?{[k]:saved.get(k)}:{},
    set:async o=>{for(const [k,v] of Object.entries(o))saved.set(k,v);}}},
    alarms:{create:()=>{},onAlarm:{addListener(){}}},
    runtime:{onStartup:{addListener(){}},onInstalled:{addListener(){}}}};
  let vault=false;const incidents=[],ingested=[],progressed=[];
  const watcher=createCatalogWatcher(api,{
    native:async()=>vault?{ok:true,credential:token}:{ok:false,code:'UNAVAILABLE'},
    scan:async()=>({ok:true,complete:true,repository:'Neb963/per-gens',repositoryId:'42',
      head:'a'.repeat(40),rootTreeOid:'b'.repeat(40),prompt:null,recognizedCount:0,generators:[]}),
    ingestComplete:async r=>{ingested.push(r.head);return {ok:true};},
    progressReady:async()=>{progressed.push(1);},
    incidents:async kind=>{incidents.push(kind);},clock:()=>1000});
  const lost=await watcher.tick();
  assert.equal(lost.code,'GIT_VAULT_UNAVAILABLE');
  assert.deepEqual(incidents,['OPEN']);assert.equal(ingested.length,0);assert.equal(progressed.length,0);
  vault=true; // operator reconnects once (Settings → Connect GitHub)
  const resumed=await watcher.tick();
  assert.equal(resumed.ok,true);
  assert.deepEqual(incidents,['OPEN','RESOLVE']);
  assert.deepEqual(ingested,['a'.repeat(40)]);assert.equal(progressed.length,1);
});
