import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateAiMessage} from '../src/runtime/ai-boundary.mjs';
const api={runtime:{id:'pcms-full',getURL:path=>'moz-extension://isolated/'+path}};
const sender={id:'pcms-full',url:'moz-extension://isolated/pcms/index.html#work-queue'};
const message=(type,params)=>({type,params});
test('R4 AI primary queue: only exact typed, revision-bound native steps are eligible',()=>{
 assert.equal(validateAiMessage(api,sender,message('LIST_JOBS',{after:'',limit:20})).ok,true);
 assert.equal(validateAiMessage(api,sender,message('GET_JOB',{slug:'test-generator'})).ok,true);
 assert.equal(validateAiMessage(api,sender,message('PREPARE_JOB',{
  slug:'test-generator',expectedStageRevision:5})).ok,true);
 assert.equal(validateAiMessage(api,sender,message('BEGIN_NATIVE',{
  slug:'test-generator',expectedRevision:2,step:'CHAT1_SEND'})).ok,true);
 assert.equal(validateAiMessage(api,sender,message('BEGIN_NATIVE',{
  slug:'test-generator',expectedRevision:2,step:'STOP'})).ok,true);
 assert.equal(validateAiMessage(api,sender,message('RUN_TESTS',{
  slug:'test-generator',expectedRevision:2})).ok,true);
 assert.equal(validateAiMessage(api,sender,message('PROBE_NATIVE',{
  slug:'test-generator',expectedRevision:2})).ok,true);
 assert.equal(validateAiMessage(api,sender,message('ADVANCE_JOB',{
  slug:'test-generator',expectedRevision:2})).ok,true);
 assert.equal(validateAiMessage(api,sender,message('BEGIN_NATIVE',{
  slug:'test-generator',expectedRevision:2,step:'CHAT1_SEND',force:true})).ok,false);
 assert.equal(validateAiMessage(api,sender,message('BEGIN_NATIVE',{
  slug:'test-generator',expectedRevision:2,step:'EVAL_PAGE'})).ok,false);
 assert.equal(validateAiMessage(api,sender,message('BEGIN_NATIVE',{
  slug:'test-generator',expectedRevision:0,step:'CHAT1_SEND'})).ok,false);
 assert.equal(validateAiMessage(api,{...sender,id:'external'},message('PROBE_NATIVE',{
  slug:'test-generator',expectedRevision:2})).ok,false);
});
test('R4 AI main controls use live canonical stage/job revisions and safe recovery',async()=>{
 const ui=await readFile(new URL('../src/ui/faithful/bridge.mjs',import.meta.url),'utf8');
 const page=await readFile(new URL('../src/ui/faithful/work-queue.html',import.meta.url),'utf8');
 assert.doesNotMatch(page,/data-action="prepare-ai"/);
 assert.match(ui,/Pause development/);assert.match(ui,/Resume development/);assert.match(ui,/Give new instructions/);
 assert.doesNotMatch(ui,/Start Chat 1|Reset Chat 2|Advance guarded step|Verify stage and prepare/);
 assert.doesNotMatch(ui,/nativeRoute\('work-queue','ai'\)/);
});
