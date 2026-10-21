import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createReadinessBoundary} from '../src/runtime/readiness-boundary.mjs';
import {createCatalogBoundary} from '../src/runtime/catalog-boundary.mjs';
const RID='1411034835',REPO='Neb963/per-gens',TOKEN='fixture-token-do-not-store-1234567890';
const url='moz-extension://r3-fixture/pcms/index.html#settings';
const sender={id:'r3-fixture',url};
const config={repository:REPO,repositoryId:RID};
function mock(opts={}){
 const state={...(opts.state||{})},events=[];let credential=opts.vaultPresent||false;
 const local={async get(key){events.push('storage.get');if(opts.failRead)throw Error('storage');
   if(Array.isArray(key))return Object.fromEntries(key.map(k=>[k,state[k]]));
   return {[key]:state[key]};},
  async set(obj){events.push('storage.set');if(opts.failSetAt===events.filter(x=>x==='storage.set').length)throw Error('write');Object.assign(state,obj);},
  async remove(k){events.push('storage.remove');delete state[k];}};
 const api={runtime:{id:'r3-fixture',getURL:p=>'moz-extension://r3-fixture/'+p,
   getManifest:()=>({browser_specific_settings:{gecko:{id:'persona-route-manager@local'}},version:'1.2.2'}),
   onConnect:{addListener:()=>{}},sendNativeMessage:async()=>{throw Error('unexpected native')}} ,storage:{local}};
 const native=async(host,p)=>{events.push(host+':'+p.action);
  if(opts.nativeUnavailable)throw Error('host');
  if(host!=='local.pcms.backup_vault')return {ok:true};
  if(p.action==='git.status')return opts.vaultCode?{ok:false,code:opts.vaultCode}:
    credential?{ok:true,present:true}:{ok:false,code:'MISSING_OR_INVALID'};
  if(p.action==='git.get')return credential?{ok:true,credential:TOKEN}:{ok:false,code:'MISSING_OR_INVALID'};
  if(p.action==='git.store'){
   if(opts.storeThrows)throw Error('unknown acknowledgement');
   if(opts.storeNegative)return {ok:false,code:opts.storeNegative};
   credential=true;return {ok:true};}
  if(p.action==='git.remove'){credential=false;return {ok:true};}
  throw Error('unexpected');};
 const fetcher=async(_,init)=>{
  events.push('fetch');assert.equal(init.method,'GET');
  if(opts.networkDown)throw Error('transport');
  const status=opts.httpStatus||200;
  return {status,async json(){if(opts.invalidJSON)throw Error('invalid json');
   return {id:Number(RID),full_name:opts.wrongIdentity?'wrong/repo':REPO,private:true};}};
 };
 const scan=async()=>opts.scanResult||{ok:true,complete:true,repositoryId:RID,
  generators:[{slug:'secret-private-generator-name'}],head:'a'.repeat(40)};
 return {state,events,api,native,fetcher,scan,
  readiness:createReadinessBoundary(api,{native,transport:fetcher,scan,clock:()=>123456789}),
  catalog:createCatalogBoundary(api,{native:p=>native('local.pcms.backup_vault',p),transport:fetcher,open:async()=>{throw Error('no DB')}}),
  get credential(){return credential}};
}
const r=(m,p={})=>m.readiness.run({type:'CHECK',params:p},sender);
const c=(m,p)=>m.catalog.run({type:'CONNECT_GIT',params:{repository:REPO,token:TOKEN}},sender);
const row=(v,name)=>{const x=v.rows.find(z=>z.component===name);assert.ok(x,'missing '+name);return x};
test('default passive check never accesses git.get or network and returns schema-only evidence',async()=>{
 const m=mock();const out=await r(m);assert.equal(out.ok,true);
 assert.equal(row(out,'GIT_CONFIG').state,'NOT_CONFIGURED');
 assert.equal(row(out,'GITHUB_AUTH').state,'NOT_TESTED');
 assert.equal(m.events.includes('fetch'),false);
 assert.equal(m.events.some(e=>e.endsWith(':git.get')),false);
 assert.doesNotMatch(JSON.stringify(out),/fixture-token|private-generator/);
 for(const x of out.rows)assert.deepEqual(Object.keys(x).sort(),
  ['component','scope','state','stage','code','dependency','observedAt','evidenceKind','evidenceSource','safeRecovery','retrySafety'].sort());
});
test('reject unknown sender before any read',async()=>{
 const m=mock();const out=await m.readiness.run({type:'CHECK',params:{}},{id:'evil',url});
 assert.equal(out.code,'UNTRUSTED_SENDER');assert.equal(m.events.length,0);
});
test('reject invalid remote types and extra keys',async()=>{
 const m=mock();for(const params of [{remote:'true'},{foo:1}]){
  const out=await m.readiness.run({type:'CHECK',params},sender);assert.equal(out.code,'INVALID_PARAMS');}
 assert.equal(m.events.length,0);
});
test('missing native host is distinct from missing configuration',async()=>{
 const m=mock({nativeUnavailable:true});const out=await r(m);
 assert.equal(row(out,'NATIVE_VAULT_HOST').state,'UNREACHABLE');
 assert.equal(row(out,'GIT_CONFIG').state,'NOT_CONFIGURED');
});
test('vault-only partial connection must be uncertain, not absent',async()=>{
 const m=mock({vaultPresent:true});const out=await r(m);
 assert.equal(row(out,'GIT_PARTIAL_CONNECTION').state,'OUTCOME_UNCERTAIN');
 assert.equal(row(out,'SECRET_SERVICE').state,'OUTCOME_UNCERTAIN');
});
test('missing D-Bus or locked keyring cannot prove missing credential',async()=>{
 const m=mock({state:{pcmsS03Git:config},vaultCode:'UNAVAILABLE'});const out=await r(m);
 assert.equal(row(out,'SECRET_SERVICE').state,'UNREACHABLE');
 assert.equal(row(out,'GITHUB_AUTH').state,'NOT_TESTED');
});
test('pending intent remains uncertain without configuration',async()=>{
 const m=mock({state:{pcmsS03GitPending:{...config,startedAt:10}}});const out=await r(m);
 assert.equal(row(out,'GIT_CONFIG').state,'OUTCOME_UNCERTAIN');
});
test('stale grant is not active and valid grants are individually reported',async()=>{
 const s={pcmsS03Git:config,pcmsS06StandingAuthority:{schema:1,repository:REPO,repositoryId:'999',grants:{development:true,gitWrite:true,publication:true}}};
 let m=mock({state:s});let out=await r(m);assert.equal(row(out,'GRANT_DEVELOPMENT').state,'STALE');
 s.pcmsS06StandingAuthority.repositoryId=RID;m=mock({state:s});out=await r(m);
 assert.equal(row(out,'GRANT_DEVELOPMENT').state,'VERIFIED');
});
test('remote with no verified local configuration does not retrieve secrets',async()=>{
 const m=mock({vaultPresent:true});const out=await r(m,{remote:true});
 assert.equal(row(out,'GITHUB_AUTH').state,'SECURITY_HELD');
 assert.equal(m.events.some(e=>e.endsWith(':git.get')),false);
});
test('remote identity and complete main scan are independently proved without returning source',async()=>{
 const m=mock({vaultPresent:true,state:{pcmsS03Git:config}});const out=await r(m,{remote:true});
 assert.equal(row(out,'GITHUB_AUTH').state,'VERIFIED');
 assert.equal(row(out,'GITHUB_MAIN_TREE').state,'VERIFIED');
 assert.doesNotMatch(JSON.stringify(out),/fixture-token|secret-private-generator/);
});
for(const [status,state,code] of [[401,'SECURITY_HELD','GITHUB_AUTH_REJECTED'],[403,'SECURITY_HELD','GITHUB_ACCESS_FORBIDDEN'],[503,'UNREACHABLE','GITHUB_SERVICE_UNAVAILABLE']]){
 test('remote HTTP '+status+' distinct state',async()=>{
  const m=mock({vaultPresent:true,httpStatus:status,state:{pcmsS03Git:config}});
  const out=await r(m,{remote:true});assert.equal(row(out,'GITHUB_AUTH').state,state);assert.equal(row(out,'GITHUB_AUTH').code,code);
  assert.notEqual(row(out,'GITHUB_MAIN_TREE').state,'VERIFIED');
 });
}
test('remote partial tree cannot be VERIFIED',async()=>{
 const m=mock({vaultPresent:true,state:{pcmsS03Git:config},scanResult:{ok:false,complete:false,code:'TREE_TRUNCATED'}});
 const out=await r(m,{remote:true});assert.equal(row(out,'GITHUB_MAIN_TREE').state,'STALE');
});
test('CONNECT_GIT success verifies config and vault before reporting connection',async()=>{
 const m=mock();const out=await c(m);assert.equal(out.code,'GIT_CONNECTED_LOCALLY_VERIFIED');
 assert.equal(m.state.pcmsS03Git.repositoryId,RID);assert.equal(m.state.pcmsS03GitPending,undefined);
 assert.equal(out.mainTreeVerified,false);
});
test('failed configuration write after store preserves durable pending intent and explicit uncertainty',async()=>{
 const m=mock({failSetAt:2});const out=await c(m);
 assert.equal(out.code,'GIT_CONFIG_COMMIT_OUTCOME_UNCERTAIN');assert.equal(m.credential,true);
 assert.equal(m.state.pcmsS03Git,undefined);assert.equal(m.state.pcmsS03GitPending.repositoryId,RID);
 const pre=await r(m);assert.equal(row(pre,'GIT_PARTIAL_CONNECTION').state,'OUTCOME_UNCERTAIN');
});
test('failed pending intent does not attempt vault write',async()=>{
 const m=mock({failSetAt:1});const out=await c(m);assert.equal(out.code,'GIT_PENDING_INTENT_FAILED');
 assert.equal(m.events.some(e=>e.endsWith(':git.store')),false);
});
test('unknown vault store ACK is uncertain, never rolled back blindly',async()=>{
 const m=mock({storeThrows:true});const out=await c(m);
 assert.equal(out.code,'GIT_VAULT_STORE_OUTCOME_UNCERTAIN');
 assert.equal(m.state.pcmsS03GitPending.repositoryId,RID);
});
for(const [status,code] of [[401,'GITHUB_AUTH_REJECTED'],[503,'GITHUB_SERVICE_UNAVAILABLE']]){
 test('CONNECT_GIT response '+status+' cannot touch vault',async()=>{
  const m=mock({httpStatus:status});const out=await c(m);
  assert.equal(out.code,code);assert.equal(m.events.some(e=>e.endsWith(':git.store')),false);
 });
}
test('DISCONNECT_GIT uncertainty is classified and never calls provider mutation',async()=>{
 const m=mock({state:{pcmsS03Git:config},nativeUnavailable:true});
 const out=await m.catalog.run({type:'DISCONNECT_GIT',params:{}},sender);
 assert.equal(out.code,'GIT_VAULT_REMOVE_OUTCOME_UNCERTAIN');
 assert.deepEqual(m.state.pcmsS03Git,config);
});
test('explicit reconciliation heals vault-before-config split without new credential store',async()=>{
 const m=mock({vaultPresent:true,state:{pcmsS03GitPending:{...config,startedAt:55}}});
 const out=await m.catalog.run({type:'RECONCILE_GIT',params:{}},sender);
 assert.equal(out.code,'GIT_RECONCILED_LOCALLY_VERIFIED');
 assert.deepEqual(m.state.pcmsS03Git,config);
 assert.equal(m.state.pcmsS03GitPending,undefined);
 assert.equal(m.events.some(e=>e.endsWith(':git.store')),false);
 assert.equal(m.events.includes('fetch'),true);
});
test('reconciliation denies wrong repository or token without changing local config',async()=>{
 const m=mock({vaultPresent:true,wrongIdentity:true,state:{pcmsS03GitPending:{...config,startedAt:55}}});
 const out=await m.catalog.run({type:'RECONCILE_GIT',params:{}},sender);
 assert.equal(out.code,'GIT_RECONCILIATION_IDENTITY_CONFLICT');
 assert.equal(m.state.pcmsS03Git,undefined);
 assert.equal(m.events.some(e=>e==='storage.set'),false);
});
test('reconciliation must not overwrite existing other configured repository',async()=>{
 const m=mock({vaultPresent:true,state:{pcmsS03Git:{repository:'Other/repo',repositoryId:'99'},pcmsS03GitPending:{...config,startedAt:5}}});
 const out=await m.catalog.run({type:'RECONCILE_GIT',params:{}},sender);
 assert.equal(out.code,'GIT_RECONCILIATION_IDENTITY_CONFLICT');
 assert.equal(m.events.some(e=>e==='storage.set'),false);
});
test('CONNECT_GIT refuses replay after uncertain previous vault acknowledgement',async()=>{
 const m=mock({vaultPresent:true,state:{pcmsS03GitPending:{...config,startedAt:5}}});
 const out=await c(m);
 assert.equal(out.code,'GIT_PENDING_CONNECTION_RECONCILIATION_REQUIRED');
 assert.equal(m.events.some(e=>e.endsWith(':git.store')),false);
});
test('malformed stored Git configuration is a security hold, not a clean absence',async()=>{
 const m=mock({state:{pcmsS03Git:{repository:'unexpected/repository',repositoryId:'oops'}}});
 const out=await r(m);
 assert.equal(row(out,'GIT_CONFIG').state,'SECURITY_HELD');
 assert.equal(row(out,'GIT_CONFIG').code,'GIT_CONFIG_INVALID');
});
test('unreadable restore sentinel is a security hold, not an absence',async()=>{
 const m=mock({failRead:true});const out=await r(m);
 assert.equal(row(out,'RESTORE_HOLD').state,'SECURITY_HELD');
 assert.equal(row(out,'LOCAL_CONFIGURATION').state,'UNREACHABLE');
});
test('native host rejecting inspection is not claimed as a supported capability',async()=>{
 const m=mock();m.readiness=createReadinessBoundary(m.api,{native:async(host,p)=>{
  if(host==='local.pcms.backup_vault')return {ok:false,code:'MISSING_OR_INVALID'};
  return {ok:false,code:'DENIED'};}});
 const out=await r(m);assert.equal(row(out,'BACKUP_HOST').state,'MISSING_CAPABILITY');
 assert.equal(row(out,'DIAGNOSTIC_HOST').state,'MISSING_CAPABILITY');
});
