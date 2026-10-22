import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateReadyOperator} from '../src/runtime/ready-operator.mjs';
import {validateCatalogMessage} from '../src/runtime/catalog-boundary.mjs';
const api={runtime:{id:'pcms-full',getURL:path=>'moz-extension://isolated/'+path}};
const sender={id:'pcms-full',url:'moz-extension://isolated/pcms/index.html#work-queue'};
test('R4 READY primary operations keep exact expected revision and no provider-effect fields',()=>{
 assert.equal(validateCatalogMessage(api,sender,{type:'LIST_READY',params:{after:'',limit:20}}).ok,true);
 for(const type of ['ASSESS_READY','PREPARE_LOCAL','PAUSE_READY','RESUME_READY']){
  assert.equal(validateReadyOperator(api,sender,{type,params:{
   slug:'test-generator',expectedRevision:5}}).ok,true);
  assert.equal(validateReadyOperator(api,sender,{type,params:{
   slug:'test-generator',expectedRevision:0}}).ok,false);
  assert.equal(validateReadyOperator(api,sender,{type,params:{
   slug:'test-generator',expectedRevision:5,force:true}}).ok,false);
 }
 assert.equal(validateReadyOperator(api,{...sender,id:'foreign'},{
  type:'PREPARE_LOCAL',params:{slug:'test-generator',expectedRevision:5}}).ok,false);
 assert.equal(validateCatalogMessage(api,sender,{type:'LIST_READY',
  params:{limit:201}}).ok,false);
});
test('R4 primary READY queue is paginated and assessed by the original protected controller',async()=>{
 const ui=await readFile(new URL('../src/ui/faithful/bridge.mjs',import.meta.url),'utf8');
 assert.match(ui,/readPort\('pcms-s03-catalog','LIST_READY'/);
 assert.match(ui,/q\.readyCursor/);
 assert.match(ui,/state\.queue\.readyCursor=state\.queue\.nextReady/);
 assert.match(ui,/function openReadyCandidate\(candidate\)/);
 assert.match(ui,/readPort\('pcms-s05-ready-operator',type,/);
 assert.match(ui,/expectedRevision:candidate\.revision/);
 assert.doesNotMatch(ui,/nativeRoute\('work-queue','ready'\)/);
});
