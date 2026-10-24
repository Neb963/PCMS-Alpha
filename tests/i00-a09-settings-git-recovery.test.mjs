// A09 operator defect: an interrupted Git connection must have an executable
// recovery path on the same Settings page. No real token, network or OS access.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createCatalogBoundary} from '../src/runtime/catalog-boundary.mjs';
const TOKEN='github_pat_'+ 'x'.repeat(48);
const REPO='Neb963/per-gens';
function setup({savedCredential=false,corruptPending=false}={}){
 const values=new Map();
 values.set('pcmsS03GitPending',corruptPending?{repository:REPO,repositoryId:'garbled'}:
  {repository:REPO,repositoryId:'42',startedAt:100});
 const api={runtime:{id:'fixture',getURL:path=>'moz-extension://fixture/'+path},
 storage:{local:{get:async k=>values.has(k)?{[k]:structuredClone(values.get(k))}:{},
  set:async rows=>{assert.equal(JSON.stringify(rows).includes(TOKEN),false);for(const [k,v] of Object.entries(rows))values.set(k,structuredClone(v));},
  remove:async k=>{values.delete(k);}}}};
 const sender={id:'fixture',url:api.runtime.getURL('pcms/index.html')};
 const writes=[],native=async req=>{
  if(req.action==='git.get')return savedCredential?{ok:true,credential:TOKEN}:{ok:false,code:'MISSING_OR_INVALID'};
  if(req.action==='git.store'){assert.equal(req.repositoryId,'42');assert.equal(req.credential,TOKEN);savedCredential=true;writes.push(req.action);return {ok:true};}
  if(req.action==='git.status')return savedCredential?{ok:true,present:true}:{ok:false,code:'MISSING_OR_INVALID'};
  return {ok:false,code:'DENIED'};
 };
 const transport=async(url,options)=>{
  assert.equal(options.method,'GET');assert.equal(new URL(url).host,'api.github.com');
  return {status:200,json:async()=>({full_name:REPO,private:true,id:42})};
 };
 return {boundary:createCatalogBoundary(api,{native,transport}),sender,values,writes};
}
test('A09 interrupted Git setup is discoverable without a token or an OS host',async()=>{
 const {boundary,sender,values,writes}=setup();
 const r=await boundary.run({type:'GET_CONNECTION_STATE'},sender);
 assert.deepEqual(r,{ok:true,configured:false,interrupted:true,repository:REPO,
  canRecover:true,credentialPresence:'NOT_CHECKED',remoteIdentityVerified:false});
 assert.equal(JSON.stringify(r).includes(TOKEN),false);
 const blocked=await boundary.run({type:'CONNECT_GIT',params:{repository:REPO,token:TOKEN}},sender);
 assert.equal(blocked.code,'GIT_PENDING_CONNECTION_RECONCILIATION_REQUIRED');
 assert.equal(writes.length,0);
 assert.equal(values.has('pcmsS03GitPending'),true);
 assert.equal((await boundary.run({type:'GET_CONNECTION_STATE',params:{secret:true}},sender)).code,'INVALID_PARAMS');
 const outsider={...sender,id:'other-extension'};
 assert.equal((await boundary.run({type:'GET_CONNECTION_STATE'},outsider)).code,'UNTRUSTED_SENDER');
});
test('A09 read-only reconciliation uses already-saved token and never replaces it',async()=>{
 const {boundary,sender,values,writes}=setup({savedCredential:true});
 const result=await boundary.run({type:'RECONCILE_GIT'},sender);
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(writes.length,0);
 assert.equal(values.has('pcmsS03GitPending'),false);
 const status=await boundary.run({type:'GET_CONNECTION_STATE'},sender);
 assert.equal(status.configured,true);assert.equal(status.interrupted,false);
 assert.equal(status.repository,REPO);
});
test('A09 missing credential remains held until explicit same-repository recovery',async()=>{
 const {boundary,sender,values,writes}=setup();
 const check=await boundary.run({type:'RECONCILE_GIT'},sender);
 assert.equal(check.code,'GIT_RECONCILIATION_CREDENTIAL_UNAVAILABLE');
 assert.equal(writes.length,0);
 const unauthorized=await boundary.run({type:'RECOVER_GIT_CONNECTION',params:{repository:REPO,token:TOKEN}},sender);
 assert.equal(unauthorized.code,'INVALID_PARAMS');
 assert.equal(writes.length,0);
 const finish=await boundary.run({type:'RECOVER_GIT_CONNECTION',params:{
  repository:REPO,token:TOKEN,acknowledgeCredentialReplacement:true}},sender);
 assert.equal(finish.ok,true,JSON.stringify(finish));assert.equal(writes.length,1);
 assert.equal(values.has('pcmsS03GitPending'),false);
 assert.equal((await boundary.run({type:'GET_CONNECTION_STATE'},sender)).configured,true);
});
test('A09 corrupt pending state stays visible but cannot be overwritten silently',async()=>{
 const {boundary,sender,writes}=setup({corruptPending:true});
 const status=await boundary.run({type:'GET_CONNECTION_STATE'},sender);
 assert.equal(status.interrupted,true);assert.equal(status.canRecover,false);
 const refused=await boundary.run({type:'RECOVER_GIT_CONNECTION',params:{
  repository:REPO,token:TOKEN,acknowledgeCredentialReplacement:true}},sender);
 assert.equal(refused.code,'GIT_RECOVERY_REQUIRES_PENDING');
 assert.equal(writes.length,0);
});
test('A09 primary Settings renders one visible Git form and its own recovery',async()=>{
 const ui=await readFile(new URL('../src/ui/faithful/bridge.mjs',import.meta.url),'utf8');
 const css=await readFile(new URL('../src/ui/faithful/prototype.css',import.meta.url),'utf8');
 const start=ui.indexOf("function primaryConnections(container){");
 const end=ui.indexOf("function primaryAutomation(container){",start);
 const connection=ui.slice(start,end);
 const settings=ui.slice(ui.indexOf('function renderSettingsSection(){'),ui.indexOf('function displayRouteScaffold(){'));
 assert.match(connection,/GET_CONNECTION_STATE/);
 assert.match(connection,/RECONCILE_GIT/);
 assert.match(connection,/RECOVER_GIT_CONNECTION/);
 assert.match(connection,/recovery\.hidden=!pending/);
 assert.match(connection,/connect\.hidden=pending/);
 assert.match(settings,/container\.replaceChildren\(\);\s*primaryConnections\(container\)/);
 assert.doesNotMatch(settings,/settingsStatic\.cloneNode|Check native hosts/);
 assert.match(settings,/if\(select==='diagnostics'\)renderReadinessPanel\(container\)/);
 assert.doesNotMatch(ui,/else if\(state\.route==='settings'\)renderSettingsSection\(\);/);
 assert.match(css,/\.pcms-git-recovery/);
});
