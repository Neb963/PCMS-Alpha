import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {emptyShadow,reconcileShadow,REFRESHER_KEY} from '../src/runtime/refresher-core.mjs';
import {createRefresherStore} from '../src/runtime/refresher-store.mjs';
import {emptyRefreshEvidence} from '../src/runtime/refresher-effect-core.mjs';
const H='a'.repeat(64),now=2000000;
const candidate={status:'SUPPORTED_AND_VERIFIED',method:'EXPLICIT_PROVIDER_REFRESH',
  allowedByProvider:true,version:'fixture_v1',sourceFingerprint:H,
  evidenceId:'fixture',meaningfulEffectVerified:true};
function initial(){
  const x=reconcileShadow(emptyShadow(),[{slug:'owned-generator',accountId:'account_01',
    personaUid:'persona_01',bindingVersion:1,remoteId:'slug-owned-generator',
    ownerVerified:true,accountVerified:true,principalFingerprint:H,
    releaseVerified:true,releaseFingerprint:H,listing:'PUBLIC'}]);
  assert.equal(x.ok,true);
  const s=x.state,r=s.rows[0];
  r.phase='ACTIVE';r.slot=true;r.presence={source:'GUARDED_RECENT_LIST',
    absence:'NOT_A_DELETION',present:false,observedAt:now-100};
  r.refresh={...emptyRefreshEvidence(),state:'ABSENT_ONCE',misses:1};
  s.recent={...s.recent,complete:true,observedAt:now-100,suspended:false};
  s.accounts.account_01.health='HEALTHY';
  return s;
}
async function storeState(db,s){
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(['meta'],'readwrite');
    tx.oncomplete=resolve;tx.onabort=()=>reject(Error('transaction aborted'));
    tx.objectStore('meta').put({key:REFRESHER_KEY,state:s});
  });
}
test('S07 AC-14: actual IDB reserve rejects stale/partial/present and preserves receipt-free state',async()=>{
  for(const changed of [
    s=>s.recent.complete=false,
    s=>s.recent.observedAt=1,
    s=>s.rows[0].presence.present=true,
    s=>s.rows[0].presence.observedAt=now-200,
    s=>s.rows[0].reviewHeld=true,
    s=>s.rows[0].readyUpdate=true
  ]){
    const db=fakeDatabase(),s=initial();changed(s);await storeState(db,s);
    const store=createRefresherStore(db),before=db.read('meta',REFRESHER_KEY);
    const reply=await store.reserveAttempt({stableId:s.rows[0].stableId,id:'intent_0001',
      now,candidate,liveAuthorized:true});
    assert.equal(reply.ok,false,JSON.stringify(changed.toString()));
    assert.deepEqual(db.read('meta',REFRESHER_KEY),before);
  }
});
test('S07 T-08: current absence can reserve, but a later visible feed bars dispatch in IDB',async()=>{
  const db=fakeDatabase(),s=initial();await storeState(db,s);
  const store=createRefresherStore(db);
  const admitted=await store.reserveAttempt({stableId:s.rows[0].stableId,id:'intent_0001',
    now,candidate,liveAuthorized:true});
  assert.equal(admitted.ok,true,JSON.stringify(admitted));
  let saved=db.read('meta',REFRESHER_KEY).state;
  assert.equal(saved.rows[0].refresh.intent.state,'RESERVED');
  saved.rows[0].presence={...saved.rows[0].presence,present:true};
  saved.recent={...saved.recent,observedAt:now};
  saved.rows[0].presence.observedAt=now;
  await storeState(db,saved);
  const rejected=await store.markDispatch(admitted.claim,now+1);
  assert.equal(rejected.ok,false);
  assert.equal(db.read('meta',REFRESHER_KEY).state.rows[0].refresh.intent.state,'RESERVED');
});
