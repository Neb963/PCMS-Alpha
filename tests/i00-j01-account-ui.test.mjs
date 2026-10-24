import test from 'node:test';
import assert from 'node:assert/strict';
import {accountGrowthAdvice} from '../src/ui/faithful/accounts-workspace.mjs';
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
