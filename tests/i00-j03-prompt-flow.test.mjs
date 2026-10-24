import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createGitModel} from '../scripts/fixtures/j03-git-model.mjs';
import {scanMainCatalog} from '../src/runtime/git-catalog.mjs';
import {createCatalogBoundary} from '../src/runtime/catalog-boundary.mjs';
import {inspectCurrentImportItem} from '../src/runtime/creation-import-authority.mjs';
globalThis.crypto??=webcrypto;
const repository='Neb963/per-gens',token='offline-j03-credential-only',cfg={repository,repositoryId:'42'};
async function fixture(files={}){
 const model=await createGitModel();if(Object.keys(files).length)await model.merge(files);
 const db=fakeDatabase(),values={pcmsS03Git:cfg},runtime={id:'fixture',getURL:p=>'moz-extension://j03/'+p};let enabled=true,generation=0,revokeOnConfig=false;
 const local={get:async key=>{if(key==='pcmsS03Git'&&revokeOnConfig){enabled=false;generation++;revokeOnConfig=false}return {[key]:values[key]}},set:async value=>Object.assign(values,value),remove:async key=>delete values[key]};
 const api={runtime,storage:{local},alarms:{create:async()=>{}}};
 const boundary=createCatalogBoundary(api,{open:async()=>db,transport:model.transport,scan:o=>scanMainCatalog(o,model.transport),native:async()=>({ok:true,credential:token}),
  promptWriteGate:()=>enabled,authorityGeneration:()=>generation});
 const sender={id:'fixture',url:runtime.getURL('pcms/index.html')+'#settings'};
 const call=(type,params={})=>boundary.run({type,params},sender);
 return {model,db,values,api,call,revokeDuringFinalRead(){revokeOnConfig=true},transportRevokeOnCommit(){
  const base=model.transport;model.transport=async(url,options)=>{const result=await base(url,options);if(options.method==='POST'&&url.endsWith('/git/commits'))revokeOnConfig=true;return result};
 }};
}
async function draft(f,text,expectedRevision=0){const current=await f.call('SCAN_CONNECTED');assert.equal(current.ok,true,current.code);
 const saved=await f.call('SAVE_PROMPT_DRAFT',{repositoryId:'42',expectedRevision,baseOid:current.prompt.oid,text});assert.equal(saved.ok,true,saved.code);
 return {repositoryId:'42',expectedRevision:saved.revision,expectedHead:current.head};}
test('J03 empty and missing-prompt setup creates only reviewed exact prompt and preserves unrelated source',async()=>{
 for(const files of [{},{'README.md':'Unrelated repository documentation'}]){
  const f=await fixture(files),scan=await f.call('SCAN_CONNECTED');assert.equal(scan.prompt.state,'ABSENT');assert.ok(scan.starterPrompt);assert.equal(f.model.state.effects.length,0);
  const text='Operator-reviewed starter instructions\n',params=await draft(f,text),out=await f.call('COMMIT_PROMPT',params);assert.equal(out.ok,true,JSON.stringify(out));
  const verified=await f.call('SCAN_CONNECTED');assert.equal(verified.prompt.text,text);assert.equal(verified.importStatus,'IMPORT_SETUP_COMPLETE');
  assert.equal(f.model.state.effects.length,1);assert.equal(f.model.state.effects[0].force,false);
  if(files['README.md'])assert.ok(f.model.paths()['README.md']);
  const progress=f.values.pcmsS04CatalogIntakeProgress;assert.equal(progress.initialImportCompleted,true);assert.equal(progress.initialApprovalRevision,1);
 }
});
test('J03 existing prompt wins and lost ref ACK remains uncertain until independent read-only history reconciliation',async()=>{
 const f=await fixture({'pcms/prompts/default-chat1.md':'Existing authoritative instructions\n'});
 assert.equal((await f.call('SCAN_CONNECTED')).prompt.text,'Existing authoritative instructions\n');assert.equal(f.model.state.effects.length,0);
 const params=await draft(f,'Reviewed changed instructions\n');f.model.state.loseNextRef=true;
 const out=await f.call('COMMIT_PROMPT',params);assert.equal(out.ok,false);assert.equal(out.code,'PROMPT_GIT_UNCERTAIN_RECONCILE_REQUIRED');
 const repeated=await f.call('COMMIT_PROMPT',params);assert.equal(repeated.ok,false);assert.equal(f.model.state.effects.length,1);
 const observed=await f.call('RECONCILE_PROMPT',{repositoryId:'42'});assert.equal(observed.ok,true,JSON.stringify(observed));assert.equal(f.model.state.effects.length,1);
 assert.equal((await f.call('GET_PROMPT_DRAFT')).record.effect.state,'VERIFIED');
});
test('J03 concurrent Git prompt edit preserves both remote edit and local draft without a ref attempt',async()=>{
 const f=await fixture({'pcms/prompts/default-chat1.md':'Original\n'}),params=await draft(f,'My preserved draft\n');
 await f.model.merge({'pcms/prompts/default-chat1.md':'Concurrent human edit\n'});
 const out=await f.call('COMMIT_PROMPT',params);assert.equal(out.ok,false);assert.equal(out.code,'PROMPT_CONFLICT_KEEP_DRAFT');
 assert.equal((await f.call('GET_PROMPT_DRAFT')).record.text,'My preserved draft\n');assert.equal((await f.call('SCAN_CONNECTED')).prompt.text,'Concurrent human edit\n');assert.equal(f.model.state.effects.length,0);
});
test('J03 final Git-authority revoke during the last config read prevents every ref mutation',async()=>{
 // The actual conditional writer executes, creating detached objects. A
 // storage read at its final authority callback revokes the process grant.
 const model=await createGitModel();await model.merge({'pcms/prompts/default-chat1.md':'Original\n'});
 let enabled=true,generation=0,revokeOnRead=false;const db=fakeDatabase(),values={pcmsS03Git:cfg};
 const local={get:async key=>{if(key==='pcmsS03Git'&&revokeOnRead){enabled=false;generation++;revokeOnRead=false}return {[key]:values[key]}},set:async v=>Object.assign(values,v)};
 const transport=async(url,options)=>{const r=await model.transport(url,options);if(options.method==='POST'&&url.endsWith('/git/commits'))revokeOnRead=true;return r};
 const runtime={id:'fixture',getURL:p=>'moz-extension://j03/'+p},api={runtime,storage:{local}},sender={id:'fixture',url:runtime.getURL('pcms/index.html')};
 const boundary=createCatalogBoundary(api,{open:async()=>db,transport,scan:o=>scanMainCatalog(o,transport),native:async()=>({ok:true,credential:token}),promptWriteGate:()=>enabled,authorityGeneration:()=>generation});
 const call=(type,params={})=>boundary.run({type,params},sender),f={call};const params=await draft(f,'New draft\n'),head=model.state.head;
 const out=await call('COMMIT_PROMPT',params);assert.equal(out.ok,false);assert.equal(out.code,'PROMPT_CONFLICT_KEEP_DRAFT');assert.equal(model.state.head,head);assert.equal(model.state.effects.length,0);
 assert.equal((await call('GET_PROMPT_DRAFT')).record.effect.state,'CONFLICT');
});
test('J03 exact-item import validation is bounded independently of fleet size and rejects changed tree',async()=>{
 const model=await createGitModel(),files={};for(let i=0;i<1001;i++)files['generators/gen-'+i+'/DEPLOYMENT.md']='Status: NOT_READY\n';await model.merge(files);
 let requests=0;const transport=async(...args)=>{requests++;return model.transport(...args)};
 const out=await inspectCurrentImportItem({...cfg,token,slug:'gen-1000'},transport);assert.equal(out.ok,true,out.code);assert.equal(requests,6);
 const old=out.folderTreeOid;await model.merge({'generators/gen-1000/src/new.txt':'New source'});
 const changed=await inspectCurrentImportItem({...cfg,token,slug:'gen-1000'},transport);assert.notEqual(changed.folderTreeOid,old);assert.equal(requests,12);
});
