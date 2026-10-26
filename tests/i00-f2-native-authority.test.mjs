import test from 'node:test';
import assert from 'node:assert/strict';
import {createS06StandingAuthority,createS06ScopeGate} from '../src/runtime/s06-standing-authority.mjs';
import {createAiBoundary} from '../src/runtime/ai-boundary.mjs';
const grants={development:true,gitWrite:false,publication:false},consent='I AUTHORIZE PROTECTED PCMS OPERATIONS';
function barrier(){let enter,release;return {entered:new Promise(r=>enter=r),
 wait:()=>{enter();return new Promise(r=>release=r);},release:()=>release()};}
async function fixture(){
 const data=new Map([['pcmsS03Git',{repository:'Neb963/per-gens',repositoryId:'123'}]]);
 const api={storage:{local:{get:async key=>({[key]:data.get(key)}),set:async rows=>{
  for(const [key,value] of Object.entries(rows))data.set(key,structuredClone(value));
 }}},runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p}};
 const authority=createS06StandingAuthority(api);
 await authority.state();assert.equal((await authority.update({
  expectedRevision:1,repositoryId:'123',consent,grants})).ok,true);
 const gate=createS06ScopeGate(authority,'development'),cut=barrier(),effects=[];
 const stage={slug:'fixture-owned',nonce:'a'.repeat(32),revision:1,state:'SOURCE_VERIFIED',personaUid:'fixture_persona'};
 let job={slug:stage.slug,revision:1,stageRevision:1,prompt:{text:'fixture prompt'},chat1:{}},routeCalls=0;
 const ai=createAiBoundary(api,{open:async()=>({}),effectGate:gate,
  storeFactory:()=>({getJobFull:async()=>({ok:true,job}),
   armNative:async(_slug,revision)=>{
    if(job.revision!==revision||job.native)return{ok:false,code:'AI_NATIVE_RECONCILIATION_REQUIRED'};
    job={...job,revision:job.revision+1,native:{state:'DISPATCH_POSSIBLE',step:'CHAT1_SEND'}};
    effects.push('MARKER');return{ok:true,state:'DISPATCH_POSSIBLE',revision:job.revision};
   }}),
  stageFactory:()=>({getFull:async()=>({ok:true,record:stage})}),
  guard:()=>({inspectStageEditor:async()=>({ok:true,clean:true}),
   getSafeRouteReadiness:async()=>{
    if(++routeCalls===2)await cut.wait();
    return{ready:true,cookieStoreId:'fixture_container',routeId:'fixture_route'};
   },
   runNativeAiStep:async(_uid,request)=>{
    effects.push(request.action);
    return{ok:true,busy:false,editorClean:true,sourceSaved:true,hasQueue:false,
     inputOccupied:false,attachmentsPending:false};
   }})});
 return {api,authority,gate,cut,effects,job:()=>job,
  run:()=>ai.runTrusted({type:'BEGIN_NATIVE',params:{slug:stage.slug,expectedRevision:1,step:'CHAT1_SEND'}})};
}
for(const change of ['REVOKE','REVOKE_REGRANT','RESTORE'])
 test('F2 native dispatch rechecks '+change+' after its final awaited route observation',async()=>{
  const f=await fixture(),pending=f.run();await f.cut.entered;
  try{
   if(change==='RESTORE')await f.api.storage.local.set({pcmsRestoreInProgress:{active:true,status:'PREPARING'}});
   else {
    await f.authority.revoke();
    if(change==='REVOKE_REGRANT'){
     const current=await f.authority.state();
     assert.equal((await f.authority.update({expectedRevision:current.record.revision,
      repositoryId:'123',consent,grants})).ok,true);assert.equal(f.gate(),true);
    }
   }
  }finally{f.cut.release();}
  const result=await pending;
  assert.equal(result.code,'AI_ACTIVATION_REVOKED_AFTER_MARKER');
  assert.deepEqual(f.effects,['OBSERVE','MARKER']);
  assert.equal(f.job().native.state,'DISPATCH_POSSIBLE');
 });
test('F2 healthy unchanged authority dispatches exactly once and retains the unconfirmed marker',async()=>{
 const f=await fixture(),pending=f.run();await f.cut.entered;f.cut.release();
 const result=await pending;
 assert.equal(result.code,'AI_DISPATCH_POSSIBLE_RECONCILE');
 assert.deepEqual(f.effects,['OBSERVE','MARKER','SEND']);
 assert.equal(f.job().native.state,'DISPATCH_POSSIBLE');
 assert.equal((await f.run()).ok,false);
 assert.equal(f.effects.filter(value=>value==='SEND').length,1);
});
