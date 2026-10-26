import test from 'node:test';
import assert from 'node:assert/strict';
import {checkCreationItem} from '../src/ui/faithful/generator-batches.mjs';
const shown={intentId:'intent_recovery_01',slug:'recovered-source',expectedRevision:2};
test('F2 recovered batch check reads the current intent instead of a stale rendered revision',async()=>{
 let revision=3;const requests=[],effects=[];
 const call=async(type,p)=>{
  requests.push({type,...p});
  if(type==='GET_CREATE_INTENT')return {ok:true,record:{...shown,revision,state:'OWNER_READBACK_PENDING'}};
  if(p.expectedRevision!==revision)return {ok:false,code:'STALE_REVISION'};
  effects.push('INDEPENDENT_OWNER_READBACK');revision++;
  return {ok:true,record:{revision,state:'OWNER_MISSING_VERIFIED'}};
 };
 const out=await checkCreationItem(shown,call);
 assert.equal(out.ok,true);assert.equal(out.record.revision,4);
 assert.deepEqual(requests,[{type:'GET_CREATE_INTENT',intentId:shown.intentId},
  {type:'RUN_CREATE_STEP',intentId:shown.intentId,expectedRevision:3}]);
 assert.deepEqual(effects,['INDEPENDENT_OWNER_READBACK']);
});
test('F2 a race after fresh batch read preserves backend CAS and does not retry',async()=>{
 const effects=[];let calls=0;
 const out=await checkCreationItem(shown,async(type,p)=>{
  calls++;if(type==='GET_CREATE_INTENT')return {ok:true,record:{...shown,revision:3}};
  // Canonical work advanced to 4 after the read; only revision 4 could act.
  if(p.expectedRevision!==4)return {ok:false,code:'STALE_REVISION'};
  effects.push('UNEXPECTED_TRANSITION');return {ok:true};
 });
 assert.equal(out.code,'STALE_REVISION');assert.equal(calls,2);assert.deepEqual(effects,[]);
});
test('F2 a lost creation check reply is never automatically repeated',async()=>{
 let checks=0;
 await assert.rejects(checkCreationItem(shown,async type=>{
  if(type==='GET_CREATE_INTENT')return {ok:true,record:{...shown,revision:3,state:'CREATE_UNCERTAIN'}};
  checks++;throw Error('LOST_RESPONSE');
 }),/LOST_RESPONSE/);
 assert.equal(checks,1);
});
for(const record of [{slug:'another-source',revision:3},{slug:shown.slug,revision:0},null])
 test('F2 mismatched creation readback cannot invoke the selected intent '+JSON.stringify(record),async()=>{
  let calls=0;const out=await checkCreationItem(shown,async type=>{calls++;assert.equal(type,'GET_CREATE_INTENT');return {ok:true,record};});
  assert.equal(out.ok,false);assert.equal(calls,1);
 });
test('F2 a failed creation read and an already associated intent invoke no transition',async()=>{
 for(const response of [{ok:false,code:'CANONICAL_HOLD'},{ok:true,record:{...shown,revision:4,state:'ASSOCIATED_NOT_READY'}}]){
  let calls=0;const out=await checkCreationItem(shown,async type=>{calls++;assert.equal(type,'GET_CREATE_INTENT');return response;});
  assert.equal(calls,1);assert.equal(out.ok,response.ok);
 }
});
