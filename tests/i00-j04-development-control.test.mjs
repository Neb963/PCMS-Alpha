import test from 'node:test';import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createAiStore} from '../src/runtime/ai-store.mjs';
import {createAiBoundary,validateAiMessage} from '../src/runtime/ai-boundary.mjs';
import {planAiStep} from '../src/runtime/ai-supervisor.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
const name='operator-control',sid='d'.repeat(64),owner='a'.repeat(64),nonce='f'.repeat(32);
const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},storage:{local:{get:async()=>({})}}},sender={id:'fixture',url:'moz-extension://fixture/pcms/index.html'};
const put=(db,...rows)=>new Promise(resolve=>{const t=db.transaction('meta','readwrite');t.oncomplete=resolve;for(const r of rows)t.objectStore('meta').put(r)});
async function fixture(){
 const source=await exactSource([{path:'main.pjs',base64:btoa('output = 1')},{path:'index.html',base64:btoa('<p>source</p>')}]);
 const db=fakeDatabase(),store=createAiStore(db),stage={slug:name,revision:3,state:'SOURCE_VERIFIED',nonce,personaUid:'persona',accountId:'account',principalFingerprint:owner,remotePublicId:'remote',candidate:source,previous:source};
 const job={schema:1,slug:name,revision:1,stageRevision:3,state:'KNOWN_FAILURE',sourceFingerprint:source.fingerprint,finalSource:source,verifiedFinal:null,
  prompt:{revision:1,text:'Pinned tests',tests:['default_generator_smoke']},chat1:{sessionDigest:sid,state:'RUNNING',tests:{default_generator_smoke:{result:'FAIL',sourceFingerprint:source.fingerprint}}},chat2:null,
  native:{state:'CHAT1_OBSERVED_IDLE',step:'CHAT1_SEND',sessionDigest:sid},changes:[],executionSlotReleased:false};
 await put(db,{key:'stage:'+name,record:stage},{key:'ai-job:'+name,accountId:'account',job});
 const effects=[];let busy=false;
 const guard=()=>({getSafeRouteReadiness:async()=>({ready:true,routeId:'route',cookieStoreId:'container'}),inspectStageEditor:async()=>({ok:true,clean:true}),
  observeReadOnly:async()=>({ok:true,principalFingerprint:owner,original:{remotePublicId:'remote',ownerResult:'IS_OWNER',visibility:'UNLISTED',pjs:'output = 1',html:'<p>source</p>',assets:[]}}),
  runNativeAiStep:async(_,req)=>{if(req.action!=='OBSERVE'){effects.push(structuredClone(req));throw Error('lost ACK')}
   return {ok:true,slug:name,busy,sessionDigest:sid,chatEntries:4,sourceSaved:true,editorClean:true,inputOccupied:false,attachmentsPending:false,hasQueue:false};}});
 const boundary=()=>createAiBoundary(api,{open:async()=>db,guard,effectGate:()=>true});
 return {db,store,source,stage,job,effects,boundary,busy:v=>busy=v,current:async()=> (await store.getJobFull(name)).job};
}
test('J04 pause retains tested revision, prevents effects, preserves pending work and atomically readmits account capacity on resume',async()=>{
 const f=await fixture();const pause=await f.store.operatorControl(name,1,1,{paused:true});assert.equal(pause.ok,true);assert.equal(pause.revision,1);assert.equal(pause.slotReleased,true);
 assert.equal(planAiStep(await f.current()).code,'AI_OPERATOR_PAUSED');
 assert.equal((await f.boundary().run({type:'BEGIN_NATIVE',params:{slug:name,expectedRevision:1,step:'CHAT1_REPAIR'}},sender)).code,'AI_OPERATOR_PAUSED');assert.equal(f.effects.length,0);
 assert.equal((await f.store.operatorControl(name,1,1,{paused:false})).code,'STALE_REVISION');
 await put(f.db,{key:'ai-job:other',accountId:'account',job:{slug:'other',executionSlotReleased:false}});
 const waiting=await f.store.operatorControl(name,1,2,{paused:false});assert.equal(waiting.ok,true);assert.equal((await f.current()).operatorPaused,false);assert.equal(planAiStep(await f.current()).type,'ADMIT_JOB');
 assert.equal((await f.store.admitExecutionSlot(name,1)).code,'AI_ACCOUNT_CONCURRENCY_HELD');
 await put(f.db,{key:'ai-job:other',accountId:'account',job:{slug:'other',executionSlotReleased:true}});
 const resumed=await f.store.admitExecutionSlot(name,1);assert.equal(resumed.ok,true);assert.equal(resumed.slotReleased,false);assert.equal(resumed.revision,1);assert.equal(resumed.evidence.state,'KNOWN_FAILURE');
});
test('J04 pause stops only an observed active session; restart reconciles without replay and checkpoints before freeing its slot',async()=>{
 const f=await fixture();f.busy(true);await put(f.db,{key:'ai-job:'+name,accountId:'account',job:{...f.job,native:{...f.job.native,state:'RUNNING_OBSERVED'}}});
 const pause=await f.store.operatorControl(name,1,1,{paused:true});assert.equal(pause.slotReleased,false);assert.equal(planAiStep(await f.current()).step,'STOP');
 const out=await f.boundary().run({type:'ADVANCE_JOB',params:{slug:name,expectedRevision:1}},sender);assert.equal(out.code,'AI_DISPATCH_POSSIBLE_RECONCILE');assert.deepEqual(f.effects.map(x=>x.action),['STOP']);
 const marked=await f.current();assert.equal(planAiStep(marked).type,'PROBE_NATIVE');f.busy(false);
 const reconciled=await f.boundary().run({type:'ADVANCE_JOB',params:{slug:name,expectedRevision:marked.revision}},sender);
 assert.equal(reconciled.ok,true,JSON.stringify(reconciled));assert.equal(reconciled.slotReleased,true);assert.equal(reconciled.evidence.state,'KNOWN_FAILURE');
 assert.deepEqual(f.effects.map(x=>x.action),['STOP']);assert.equal(planAiStep(await f.current()).code,'AI_OPERATOR_PAUSED');
});
test('J04 scoped operator instructions persist before one same-session send; lost ACK never replays or becomes a test PASS',async()=>{
 const f=await fixture(),text='Keep the accepted layout and fix the observed keyboard behavior.';
 const queued=await f.store.operatorControl(name,1,1,{instructions:text});assert.equal(queued.ok,true);assert.equal(queued.pendingInstruction.text,text);
 assert.equal((await f.store.operatorControl(name,1,2,{instructions:'another'})).code,'AI_INSTRUCTION_ALREADY_QUEUED');
 assert.equal(planAiStep(await f.current()).step,'CHAT1_INSTRUCT');
 const sent=await f.boundary().run({type:'ADVANCE_JOB',params:{slug:name,expectedRevision:1}},sender);assert.equal(sent.code,'AI_DISPATCH_POSSIBLE_RECONCILE');
 assert.equal(f.effects.length,1);assert.equal(f.effects[0].text,text);assert.equal(f.effects[0].repair,true);assert.equal(f.effects[0].expectedSessionDigest,sid);
 const marked=await f.current();assert.equal(marked.operatorInstruction,null);assert.equal(planAiStep(marked).type,'PROBE_NATIVE');
 const probe=await f.boundary().run({type:'ADVANCE_JOB',params:{slug:name,expectedRevision:marked.revision}},sender);assert.equal(probe.ok,true,JSON.stringify(probe));
 assert.equal(probe.evidence.state,'KNOWN_FAILURE');assert.equal(f.effects.length,1);
 const event=f.db.keys('events').map(k=>f.db.read('events',k)).find(e=>e.stage==='AI_OPERATOR_INSTRUCTION_DISPATCH_POSSIBLE');assert.equal(event.instructions,text);
 assert.equal((await f.current()).prompt.text,'Pinned tests');
});
test('J04 operator control rejects untrusted, stale and effect-bearing input',()=>{
 const valid={type:'GIVE_INSTRUCTIONS',params:{slug:name,expectedRevision:1,expectedControlRevision:1,instructions:'fix keyboard'}};
 assert.equal(validateAiMessage(api,sender,valid).ok,true);assert.equal(validateAiMessage(api,{id:'other',url:'https://perchance.org'},valid).ok,false);
 for(const params of [{...valid.params,sourceFingerprint:'a'.repeat(64)},{...valid.params,expectedControlRevision:0},{...valid.params,instructions:'\0bad'}])assert.equal(validateAiMessage(api,sender,{...valid,params}).ok,false);
});
