import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {createWritebackBoundary} from '../src/runtime/writeback-boundary.mjs';
globalThis.crypto??=webcrypto;
const sender={id:'fixture',url:'moz-extension://fixture/pcms/index.html#work-queue'};
const api={runtime:{id:'fixture',getURL:x=>'moz-extension://fixture/'+x},
  storage:{local:{get:async()=>({})}}};
const token='synthetic-private-github-token';
test('P53-05 F historical Git intent reconciles saved F after AI/stage source moves',async()=>{
  const source=await exactSource([
    {path:'main.pjs',base64:Buffer.from('old tested bytes').toString('base64')},
    {path:'index.html',base64:Buffer.from('<p>F</p>').toString('base64')}
  ]);
  const record={slug:'recovery-fixture',revision:6,state:'HELD_UNCERTAIN',
    mode:'MANUAL',sealedSource:source,sourceFingerprint:source.fingerprint,
    folder:'gens/recovery-fixture',baseHead:'a'.repeat(40),
    expectedHead:'b'.repeat(40),operationId:'writeback_'+'1'.repeat(32)};
  const calls=[];let finished=false;
  const store={
    getFull:async()=>({ok:true,record}),
    finish:async(name,revision,proof)=>{
      calls.push(['finish',name,revision,proof]);
      if(revision!==6||proof.verified!==true)return {ok:false,code:'STALE_REVISION'};
      finished=true;return {ok:true,state:'CONFIRMED',revision:7};
    }
  };
  const boundary=createWritebackBoundary(api,{
    open:async()=>({}),storeFactory:()=>store,
    aiFactory:()=>({getJobFull:async()=>({ok:false,code:'AI_SOURCE_CHANGED'})}),
    stageFactory:()=>({getFull:async()=>({ok:false,code:'STAGE_MOVED'})}),
    observe:async candidate=>{
      calls.push(['observe',candidate]);
      assert.equal(candidate.source.fingerprint,source.fingerprint);
      assert.equal(candidate.operationId,record.operationId);
      return {ok:true,code:'GIT_COMMITTED_VERIFIED',
        attribution:'COMMIT_PARENT_AND_BYTES_VERIFIED',commitSha:'c'.repeat(40)};
    }
  });
  const result=await boundary.run({type:'RECONCILE',params:{
    slug:record.slug,expectedRevision:6,token}},sender);
  assert.equal(result.state,'CONFIRMED',JSON.stringify(result));
  assert.equal(finished,true);
  assert.equal(calls.length,2);
});
test('P53-05 X missing immutable sealed source holds even when remote claims success',async()=>{
  let remote=0;
  const boundary=createWritebackBoundary(api,{
    open:async()=>({}),storeFactory:()=>({
      getFull:async()=>({ok:true,record:{
        slug:'recovery-fixture',revision:6,state:'HELD_UNCERTAIN',
        folder:'gens/recovery-fixture',sourceFingerprint:'a'.repeat(64)
      }})
    }),
    aiFactory:()=>({getJobFull:async()=>({ok:false,code:'UNAVAILABLE'})}),
    stageFactory:()=>({getFull:async()=>({ok:false,code:'UNAVAILABLE'})}),
    observe:async()=>{remote++;return {ok:true};}
  });
  const r=await boundary.run({type:'RECONCILE',params:{
    slug:'recovery-fixture',expectedRevision:6,token}},sender);
  assert.equal(r.code,'GIT_RECONCILIATION_SOURCE_UNAVAILABLE');
  assert.equal(remote,0);
});
