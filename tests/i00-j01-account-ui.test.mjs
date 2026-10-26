import test from 'node:test';
import assert from 'node:assert/strict';
import {accountGrowthAdvice,accountNeedsAttention,accountLabel} from '../src/ui/faithful/accounts-workspace.mjs';
const a=(state,owned,known=true)=>({state,inventory:{known,verifiedOwned:owned}});
test('J01 C79/C88 growth advice requires every managed account last-confirmed owned count, including unavailable accounts',()=>{
 assert.equal(accountGrowthAdvice([]),false);
 assert.equal(accountGrowthAdvice([a('VERIFIED',60),a('VERIFICATION_PENDING',60)]),true);
 assert.equal(accountGrowthAdvice([a('VERIFIED',60),a('VERIFICATION_PENDING',59)]),false);
 assert.equal(accountGrowthAdvice([a('VERIFIED',60),a('PREPARING',60,false)]),false);
 assert.equal(accountGrowthAdvice([a('VERIFIED',60),{state:'WAITING_LOGIN',pending:60}]),false);
 assert.equal(accountGrowthAdvice([a('VERIFIED',59)]),false);
 assert.equal(accountGrowthAdvice([a('VERIFIED',60),a('ARCHIVED',0)]),true);
 assert.equal(accountGrowthAdvice([{...a('ARCHIVED',60),removed:{at:123}}]),false);
});

test('J01 Attention includes identity-verified accounts with held, checking, missing or legacy routes',()=>{
 const ready={state:'VERIFIED',protectedRoute:'PCMS_PINNED',route:{status:'PINNED'}};
 assert.equal(accountNeedsAttention(ready),false);assert.equal(accountLabel(ready),'Ready');
 assert.equal(accountNeedsAttention({...ready,readiness:{ready:false}}),true,'recorded PINNED history is not current donor health after restart');
 assert.notEqual(accountLabel({...ready,readiness:{ready:false}}),'Ready');
 for(const status of ['HELD','CHECKING',null]){
  const item={...ready,route:{status}};
  assert.equal(accountNeedsAttention(item),true);
  assert.notEqual(accountLabel(item),'Ready');
 }
 for(const protectedRoute of ['LEGACY_UNPINNED','UPGRADING']){
  const item={...ready,protectedRoute};assert.equal(accountNeedsAttention(item),true);
  assert.notEqual(accountLabel(item),'Ready');
 }
 assert.equal(accountNeedsAttention({...ready,state:'ARCHIVED',route:{status:'HELD'}}),false);
 assert.equal(accountNeedsAttention({...ready,state:'WAITING_LOGIN'}),true);
 assert.equal(accountLabel({...ready,working:true,activity:{timedOut:true},route:{status:'HELD'}}),'Connection outcome pending');
 const idle={...ready,route:{status:'HELD',code:'ROUTE_IDLE'},readiness:{ready:false}};
 assert.equal(accountNeedsAttention(idle),false,'intentional idle stop is informational; real admission remains guarded');
 assert.equal(accountLabel(idle),'Resting');assert.equal(accountNeedsAttention({...idle,route:{status:'HELD',code:'EXIT_DRIFT_CONFLICT'}}),true);
});
