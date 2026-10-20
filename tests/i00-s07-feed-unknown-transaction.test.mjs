import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createRefresherStore} from '../src/runtime/refresher-store.mjs';
import {emptyShadow,reconcileShadow,REFRESHER_KEY,MINUTE} from '../src/runtime/refresher-core.mjs';
import {emptyRefreshEvidence} from '../src/runtime/refresher-effect-core.mjs';

const H='a'.repeat(64),now=2000000,bootId='browser_boot_001';
const candidate={status:'SUPPORTED_AND_VERIFIED',method:'EXPLICIT_PROVIDER_REFRESH',
  allowedByProvider:true,version:'fixture_v1',sourceFingerprint:H,
  evidenceId:'evidence_001',meaningfulEffectVerified:true};
async function put(db,records){
  await new Promise((resolve,reject)=>{
    const tx=db.transaction(['meta'],'readwrite');
    tx.oncomplete=resolve;tx.onabort=()=>reject(Error('aborted'));
    const m=tx.objectStore('meta');
    for(const record of records)m.put(record);
  });
}
async function fixture({otherAccount=false}={}){
  const db=fakeDatabase();
  const built=reconcileShadow(emptyShadow(),[{
    slug:'owned-generator',accountId:'account_01',personaUid:'persona_01',
    bindingVersion:1,remoteId:'remote_owned_01',ownerVerified:true,
    accountVerified:true,principalFingerprint:H,releaseVerified:true,
    releaseFingerprint:H,listing:'PUBLIC'},
    ...(otherAccount?[{slug:'other-generator',accountId:'account_02',
      personaUid:'persona_02',bindingVersion:1,remoteId:'remote_other_01',
      ownerVerified:true,accountVerified:true,principalFingerprint:'b'.repeat(64),
      releaseVerified:false,releaseFingerprint:null,listing:'PUBLIC'}]:[])]);
  assert.equal(built.ok,true);
  const state=built.state,r=state.rows[0];
  state.bootId=bootId;
  r.phase='ACTIVE';r.slot=true;
  r.presence={present:false,position:null,observedAt:now-100,
    source:'GUARDED_RECENT_LIST',absence:'NOT_A_DELETION'};
  r.refresh={...emptyRefreshEvidence(),state:'ABSENT_ONCE',misses:1};
  state.recent={...state.recent,complete:true,observedAt:now-100,
    total:10,suspended:false,nextDueAt:0,
    latestOccupancy:{at:now-100,feedSize:10,ownedPublic:1,
      ownedVisible:0,activeVisible:0}};
  state.accounts.account_01.health='HEALTHY';
  await put(db,[{key:REFRESHER_KEY,state},
    ...(otherAccount?[{key:'account:account_02',account:{
      accountId:'account_02',personaUid:'persona_02',bindingVersion:1,
      state:'VERIFIED',identity:{source:'GUARDED_SESSION_READBACK',
        bindingVersion:1,principalFingerprint:'b'.repeat(64)}}},
      {key:'inventory:other-generator',generator:{
        slug:'other-generator',accountId:'account_02',personaUid:'persona_02',
        bindingVersion:1,remoteId:'remote_other_01',
        ownerState:'OBSERVED_OWNER',visibility:'PUBLIC'}}]:[]),
    {key:'account:account_01',account:{accountId:'account_01',
      personaUid:'persona_01',bindingVersion:1,state:'VERIFIED',
      identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,
        principalFingerprint:H}}},
    {key:'inventory:owned-generator',generator:{
      slug:'owned-generator',accountId:'account_01',personaUid:'persona_01',
      bindingVersion:1,remoteId:'remote_owned_01',ownerState:'OBSERVED_OWNER',
      visibility:'PUBLIC'}},
    {key:'release:owned-generator',release:{
      slug:'owned-generator',accountId:'account_01',personaUid:'persona_01',
      bindingVersion:1,remoteId:'remote_owned_01',state:'CONFIRMED_PUBLIC',
      source:'INDEPENDENT_PUBLICATION_READBACK',principalFingerprint:H,
      sourceFingerprint:H,observedAt:now-200,observationId:'observation_001'}}]);
  return {db,state,store:createRefresherStore(db),stableId:r.stableId};
}
async function recentClaim(f,when,id='recent_claim_001'){
  const result=await f.store.claim({kind:'RECENT',
    preferredAccountId:'account_01',now:when,bootId,claimId:id});
  assert.equal(result.ok,true,JSON.stringify(result));
  return result.claim;
}
async function tryReserve(f,at){
  return f.store.reserveAttempt({stableId:f.stableId,
    id:'refresh_intent_01',now:at,candidate,liveAuthorized:true});
}
test('S07 T-08: later incomplete feed invalidates previous confirmed absence in canonical IDB',async()=>{
  const f=await fixture();
  assert.equal((await tryReserve(f,now)).ok,true);
  // Separate fresh instance so previous RESERVED intent cannot explain denial.
  const g=await fixture(),claim=await recentClaim(g,now+10);
  const partial=await g.store.complete(claim.claimId,{
    ok:true,complete:false,observedAt:claim.startedAt,
    principalFingerprint:H,items:[{slug:'unrelated-public'}]},now+30);
  assert.equal(partial.ok,true);
  assert.equal(partial.accepted,false);
  const persisted=g.db.read('meta',REFRESHER_KEY).state;
  assert.equal(persisted.recent.complete,false);
  assert.equal(persisted.recent.lastUnknownAt,now+30);
  assert.deepEqual(persisted.recent.latestOccupancy,
    g.state.recent.latestOccupancy);
  assert.equal(persisted.rows[0].presence.observedAt,now-100);
  const projection=await g.store.list(now+31);
  assert.equal(projection.recent.coverage,'UNKNOWN');
  assert.equal(projection.recent.lastUnknownAt,now+30);
  assert.equal((await tryReserve(g,now+31)).ok,false);
});
test('S07 T-08: rate limit makes newer recent feed UNKNOWN, preserves history and blocks dispatch of old RESERVED',async()=>{
  const f=await fixture(),candidateClaim=await tryReserve(f,now);
  assert.equal(candidateClaim.ok,true);
  const recent=await recentClaim(f,now+10);
  const failed=await f.store.complete(recent.claimId,{
    ok:false,code:'RATE_LIMITED',principalFingerprint:H,
    retryAfterMs:120000},now+20);
  assert.equal(failed.ok,true);
  assert.equal(failed.accepted,false);
  const persisted=f.db.read('meta',REFRESHER_KEY).state;
  assert.equal(persisted.recent.complete,false);
  assert.equal(persisted.recent.failures,0);
  assert.equal(persisted.recent.nextDueAt,now+20+120000);
  assert.equal(persisted.recent.endpointBackoffUntil,now+20+120000);
  const denied=await f.store.markDispatch(candidateClaim.claim,now+21);
  assert.equal(denied.ok,false);
  assert.equal(f.db.read('meta',REFRESHER_KEY).state.rows[0].refresh.intent.state,'RESERVED');
});
test('S07 T-08: delayed failure cannot erase a newer independently confirmed feed',async()=>{
  const f=await fixture(),c=await recentClaim(f,now+10);
  const stored=f.db.read('meta',REFRESHER_KEY).state;
  stored.recent.observedAt=now+20;
  stored.recent.complete=true;
  stored.rows[0].presence.observedAt=now+20;
  await put(f.db,[{key:REFRESHER_KEY,state:stored}]);
  const late=await f.store.complete(c.claimId,{ok:false,code:'NETWORK_ERROR',
    principalFingerprint:H},now+25);
  assert.equal(late.ok,true);
  assert.equal(late.accepted,false);
  const final=f.db.read('meta',REFRESHER_KEY).state;
  assert.equal(final.recent.complete,true);
  assert.equal(final.recent.observedAt,now+20);
});
test('S07 T-08: later full feed restores completeness without fabricating placement from old packet',async()=>{
  const f=await fixture(),first=await recentClaim(f,now+10);
  await f.store.complete(first.claimId,{ok:true,complete:false,
    observedAt:first.startedAt,items:[],principalFingerprint:H},now+20);
  const failed=f.db.read('meta',REFRESHER_KEY).state;
  assert.equal(failed.recent.complete,false);
  const reset=await f.store.resetRecentBackoff(failed.revision,now+21);
  assert.equal(reset.ok,true);
  const second=await recentClaim(f,now+21+60000,'recent_claim_002');
  const full=await f.store.complete(second.claimId,{ok:true,complete:true,
    observedAt:second.startedAt,items:[{slug:'owned-generator'}],
    principalFingerprint:H},second.startedAt+10);
  assert.equal(full.ok,true);
  assert.equal(full.accepted,true);
  const latest=f.db.read('meta',REFRESHER_KEY).state;
  assert.equal(latest.recent.complete,true);
  assert.equal(latest.recent.observedAt,second.startedAt);
  assert.equal(latest.rows[0].presence.present,true);
  assert.equal((await tryReserve(f,second.startedAt+11)).ok,false);
});

test('S07 T-08: unknown-scope 429 pauses the shared recent endpoint without switching Personas',async()=>{
  const f=await fixture({otherAccount:true});
  const first=await recentClaim(f,now+10);
  const rate=await f.store.complete(first.claimId,{ok:false,code:'RATE_LIMITED',
    principalFingerprint:H,retryAfterMs:300000},now+20);
  assert.equal(rate.ok,true);
  const frozen=f.db.read('meta',REFRESHER_KEY).state;
  assert.equal(frozen.recent.complete,false);
  assert.equal(frozen.recent.endpointBackoffUntil,now+20+300000);
  for(const accountId of ['account_01','account_02']){
    const blocked=await f.store.claim({kind:'RECENT',preferredAccountId:accountId,
      now:now+20+MINUTE,bootId,claimId:'recent_'+accountId});
    assert.equal(blocked.ok,false);
    assert.equal(blocked.code,'RECENT_ENDPOINT_RATE_LIMITED');
  }
  const eligible=await f.store.claim({kind:'RECENT',preferredAccountId:'account_02',
    now:now+20+300000,bootId,claimId:'recent_after_cooldown'});
  assert.equal(eligible.ok,true,JSON.stringify(eligible));
  assert.equal(eligible.claim.accountId,'account_02');
});
