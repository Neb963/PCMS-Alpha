import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {requireS04FreshOwner} from '../src/runtime/creation-git-owner.mjs';
const account={accountId:'account_s04_guard',personaUid:'persona_s04_guard',
  bindingVersion:3,revision:5,state:'VERIFIED',
  identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:3,
    principalFingerprint:'a'.repeat(64)}};
const item={accountId:account.accountId,personaUid:account.personaUid,
  accountRevision:account.revision,bindingVersion:3,
  slug:'s04-guarded',remoteId:'public_s04_guard'};
async function database(accountValue=account){
  const db=fakeDatabase(),tx=db.transaction(['meta'],'readwrite');
  tx.objectStore('meta').put({key:'account:'+account.accountId,account:accountValue});
  await new Promise((r,j)=>{tx.oncomplete=r;tx.onabort=j;});
  return db;
}
const route={ready:true,personaUid:account.personaUid,
  cookieStoreId:'protected-container',routeId:'protected-route'};
const proof={ok:true,source:'INDEPENDENT_TARGET_READBACK',
  state:'OWNED_VERIFIED',ownerMatches:true,slug:item.slug,
  remoteId:item.remoteId,visibility:'UNLISTED'};
function guard({answer=proof,after=route}={}){
  let reads=0;
  return {getSafeRouteReadiness:async()=>reads++===0?route:after,
    runSupplyStep:async(persona,request)=>{
      assert.equal(persona,account.personaUid);
      assert.equal(request.kind,'READ_TARGET');
      assert.equal(request.slug,item.slug);
      assert.equal(request.principalFingerprint,account.identity.principalFingerprint);
      return answer;
    }};
}
test('S04 Git owner D: only fresh exact protected target owner may link source',async()=>{
  const db=await database();
  assert.equal((await requireS04FreshOwner({db,item,guard:guard()})).ok,true);
  const publicAdoption=await requireS04FreshOwner({db,
    item:{...item,visibility:'PUBLIC'},
    guard:guard({answer:{...proof,visibility:'PUBLIC'}})});
  assert.equal(publicAdoption.ok,true);
});
test('S04 Git owner D: replaced ID, changed visibility, route or account cannot mutate link',async()=>{
  const db=await database();
  for(const answer of [
    {...proof,remoteId:'public_replaced'},
    {...proof,visibility:'PUBLIC'},
    {...proof,ownerMatches:false},
    {...proof,state:'MISSING_VERIFIED'},
    {...proof,source:'API_ACK'}
  ])assert.equal((await requireS04FreshOwner({db,item,
    guard:guard({answer})})).code,'GIT_CURRENT_OWNER_OR_VISIBILITY_UNVERIFIED');
  assert.equal((await requireS04FreshOwner({db,item,
    guard:guard({after:{...route,routeId:'rotated'}})})).code,'GIT_PROTECTED_ROUTE_CHANGED');
  assert.equal((await requireS04FreshOwner({db,item,guard:guard(),
    restoreHeld:async()=>true})).code,'RESTORE_HOLD');
  const changed=await database({...account,revision:6});
  assert.equal((await requireS04FreshOwner({db:changed,item,guard:guard()})).code,
    'GIT_ACCOUNT_CONTEXT_CHANGED');
});
