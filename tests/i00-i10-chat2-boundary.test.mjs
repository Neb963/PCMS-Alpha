import test from 'node:test';
import assert from 'node:assert/strict';
import {createAiBoundary} from '../src/runtime/ai-boundary.mjs';
const slug='two-private',nonce='f'.repeat(32),sid='2'.repeat(64),one='1'.repeat(64);
const H='a'.repeat(64);
const api={runtime:{id:'fixture-extension',getURL:p=>'moz-extension://fixture/'+p},
  storage:{local:{get:async()=>({})}}};
const sender={id:'fixture-extension',url:'moz-extension://fixture/pcms/index.html#work-queue'};
function start({workspace=true,worker=true,history=true,gated=true,stageChanged=false,routeChanged=false,
  staleS1Lock=false}={}){
 const stage={slug,nonce,revision:6,state:'SOURCE_VERIFIED',personaUid:'persona',
   remotePublicId:'remote'};
 const job={slug,revision:12,stageRevision:6,
   state:'TESTS_UNVERIFIED',native:{state:'CHAT2_OBSERVED_IDLE',sessionDigest:sid},
   chat1:{sessionDigest:one,tests:{}},
   chat2:{state:'FRESH_OBSERVED',sessionDigest:sid,tests:{}},
   optionalTesting:{text:'Pinned T1',tests:['default_generator_smoke']},
   sourceFingerprint:H,finalSource:{fingerprint:H}};
 const calls=[],writes=[];
 let stageReads=0,routeReads=0;
 const store={getJobFull:async()=>({ok:true,job}),
   verifySecondChat:async(...args)=>{writes.push(args);return{ok:true,state:'TESTS_UNVERIFIED'};}};
 const guard=()=>({
   getSafeRouteReadiness:async()=>{routeReads++;return routeChanged&&routeReads>1?
     {ready:false,code:'PROTECTED_ROUTE_LOST'}:
     {ready:true,routeId:'wg',cookieStoreId:'container'};},
   runNativeAiStep:async(_id,req)=>{
     calls.push(req.action);
     if(req.action==='OBSERVE')return {ok:true,sessionDigest:sid,busy:false,
       editorClean:true,sourceSaved:true,hasQueue:false,inputOccupied:false,
       attachmentsPending:false};
     if(req.action==='OBSERVE_OPFS')return {ok:true,sessionDigest:sid,
       isolation:'UNVERIFIED',workspaceRootState:workspace?'PRESENT_UNTRUSTED':'ABSENT',
       workerNamespace:staleS1Lock?'STALE_PREVIOUS_SESSION_LOCK':
         worker?'CURRENT_SESSION_WORKER_INIT_LOCK':'UNVERIFIED'};
     if(req.action==='OBSERVE_HISTORY')return history?
       {ok:true,code:'AI_SERVER_HISTORY_FIRST_PROMPT_OBSERVED',
         sessionDigest:sid,serverHistory:'FIRST_USER_IS_T1'}:
       {ok:false,code:'AI_HISTORY_PREVIOUS_CONVERSATION_OR_PROMPT'};
     throw Error('UNEXPECTED_PROVIDER_EFFECT');
   },
   inspectStageEditor:async()=>({ok:true,clean:true})
 });
 const service=createAiBoundary(api,{open:async()=>({}),guard,
   effectGate:({step})=>gated&&step==='READ_ONLY_HISTORY',
   storeFactory:()=>store,stageFactory:()=>({getFull:async()=>{
     stageReads++;return {ok:true,record:stageChanged&&stageReads>1?
       {...stage,revision:7}:stage};
   }})});
 return {calls,writes,invoke:()=>service.run({type:'VERIFY_FRESH_CHAT2',
   params:{slug,expectedRevision:12}},sender)};
}
test('P52-06 F guarded server-first-prompt and OPFS namespace proof reaches canonical CAS, never sends',async()=>{
 const p=start(),r=await p.invoke();
 assert.equal(r.ok,true);
 assert.deepEqual(p.calls,['OBSERVE','OBSERVE_OPFS','OBSERVE_HISTORY','OBSERVE']);
 assert.equal(p.writes.length,1);
 assert.equal(p.writes[0][0],slug);assert.equal(p.writes[0][1],12);
 assert.equal(p.writes[0][2].serverHistory,'FIRST_USER_IS_T1');
 assert.equal(p.writes[0][3].workspaceRootState,'PRESENT_UNTRUSTED');
});
test('P52-06 X missing activation, OPFS, server history, stage or route cannot mint freshness',async()=>{
 for(const cfg of [
   [{gated:false},'AI_SERVER_HISTORY_ACTIVATION_HELD',[]],
   [{workspace:false},'AI_CHAT2_WORKSPACE_UNVERIFIED',['OBSERVE','OBSERVE_OPFS']],
   [{worker:false},'AI_CHAT2_WORKER_UNVERIFIED',['OBSERVE','OBSERVE_OPFS']],
   [{staleS1Lock:true},'AI_CHAT2_PREVIOUS_WORKER_LOCK_RELOAD_REQUIRED',['OBSERVE','OBSERVE_OPFS']],
   [{history:false},'AI_HISTORY_PREVIOUS_CONVERSATION_OR_PROMPT',[
      'OBSERVE','OBSERVE_OPFS','OBSERVE_HISTORY']],
   [{stageChanged:true},'AI_CHAT2_CONTEXT_CHANGED_DURING_HISTORY',[
      'OBSERVE','OBSERVE_OPFS','OBSERVE_HISTORY','OBSERVE']],
   [{routeChanged:true},'AI_CHAT2_CONTEXT_CHANGED_DURING_HISTORY',[
      'OBSERVE','OBSERVE_OPFS','OBSERVE_HISTORY','OBSERVE']]
 ]){
   const [options,code,steps]=cfg,p=start(options),r=await p.invoke();
   assert.equal(r.code,code,JSON.stringify(options));
   assert.deepEqual(p.calls,steps,JSON.stringify(options));
   assert.equal(p.writes.length,0);
 }
});
