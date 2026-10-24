import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateCatalogMessage} from '../src/runtime/catalog-boundary.mjs';
const api={runtime:{id:'pcms-full',getURL:p=>'moz-extension://test/'+p}};
const sender={id:'pcms-full',url:'moz-extension://test/pcms/index.html#settings'};
const call=(type,params)=>({type,params});
const sha='a'.repeat(40),digest='b'.repeat(64);
test('R4 Connections first import and canonical Git prompt changes are protected by exact scope and revisions',()=>{
 assert.equal(validateCatalogMessage(api,sender,call('SCAN_CONNECTED',{})).ok,true);
 assert.equal(validateCatalogMessage(api,sender,call('APPROVE_IMPORT',{
  repositoryId:'42',scopeDigest:digest,planDigest:digest,expectedRevision:0})).ok,true);
 assert.equal(validateCatalogMessage(api,sender,call('SAVE_PROMPT_DRAFT',{
  repositoryId:'42',expectedRevision:0,baseOid:sha,text:'Test instructions'})).ok,true);
 assert.equal(validateCatalogMessage(api,sender,call('COMMIT_PROMPT',{
  repositoryId:'42',expectedRevision:2,expectedHead:sha})).ok,true);
 assert.equal(validateCatalogMessage(api,sender,call('RECONCILE_PROMPT',{
  repositoryId:'42'})).ok,true);
 assert.equal(validateCatalogMessage(api,sender,call('COMMIT_PROMPT',{
  repositoryId:'42',expectedRevision:2,expectedHead:sha,force:true})).ok,false);
 assert.equal(validateCatalogMessage(api,sender,call('APPROVE_IMPORT',{
  repositoryId:'42',scopeDigest:'unverified'})).ok,false);
 assert.equal(validateCatalogMessage(api,{...sender,id:'foreign'},call('COMMIT_PROMPT',{
  repositoryId:'42',expectedRevision:2,expectedHead:sha})).ok,false);
});
test('R4 primary Connections uses the complete main scope and never clears an uncertain Git effect on draft save',async()=>{
 const ui=await readFile(new URL('../src/ui/faithful/bridge.mjs',import.meta.url),'utf8');
 const start=ui.indexOf('function renderConnectedMain(section,snapshot){');
 const end=ui.indexOf('function primaryConnections(container)',start);
 const section=ui.slice(start,end);
 assert.ok(section.includes("snapshot.preview||{}"));
 assert.ok(section.includes("'APPROVE_IMPORT'"));
 assert.ok(section.includes("'GET_PROMPT_DRAFT'"));
 assert.ok(section.includes("'SAVE_PROMPT_DRAFT'"));
 assert.ok(section.includes("'COMMIT_PROMPT'"));
 assert.ok(section.includes("'RECONCILE_PROMPT'"));
 assert.ok(section.includes("expectedRevision:revision"));
 assert.ok(section.includes("expectedHead:base.head"));
 assert.ok(section.includes("uncertain||committed"));
 assert.ok(!section.includes('dirty=false;uncertain=false;'),'saving a draft must not clear an uncertain remote write');
 assert.ok(section.includes("No remote")||section.includes("no remote")||section.includes("no write"));
});
