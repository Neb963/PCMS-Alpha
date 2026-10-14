import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyRefreshEvidence,observeRefreshPresence,qualifyRefreshCandidate,
  reserveRefreshAttempt,dispatchPossible,reconcileRefreshAttempt,RETRY_LIMIT}
  from '../src/runtime/refresher-effect-core.mjs';
import {emptyShadow,reconcileShadow,advanceShadow,rowBlocks,HOUR,MINUTE}
  from '../src/runtime/refresher-core.mjs';

const hash='a'.repeat(64),changed='b'.repeat(64),at=1000000;
const qualified={status:'SUPPORTED_AND_VERIFIED',method:'EXPLICIT_PROVIDER_REFRESH',
  allowedByProvider:true,version:'synthetic_v1',sourceFingerprint:hash,
  evidenceId:'independent_fixture_evidence',meaningfulEffectVerified:true};
const request=(e,id='attempt_01',when=at)=>reserveRefreshAttempt(e,{id,at:when,
  slug:'fixture-generator',sourceFingerprint:hash,candidate:qualified,
  eligible:true,liveAuthorized:true});

test('P54-05 / S6-I14-REFRESH-PROOF F/X: no proven permissible method or activation never dispatches',()=>{
  const e=emptyRefreshEvidence();
  for(const candidate of [null,{...qualified,status:'UNKNOWN'},
    {...qualified,status:'DRIFTED'},{...qualified,method:'TRIVIAL_SAVE'},
    {...qualified,allowedByProvider:false},{...qualified,meaningfulEffectVerified:false},
    {...qualified,sourceFingerprint:'f'.repeat(64)}]){
    const q=qualifyRefreshCandidate(candidate);
    if(candidate?.sourceFingerprint===hash)assert.equal(q.ok,false);
    assert.equal(reserveRefreshAttempt(e,{id:'attempt_01',at,slug:'fixture-generator',
      sourceFingerprint:hash,candidate,eligible:true,liveAuthorized:true}).ok,false);
  }
  assert.equal(reserveRefreshAttempt(e,{id:'attempt_01',at,slug:'fixture-generator',
    sourceFingerprint:hash,candidate:qualified,eligible:true,liveAuthorized:false}).code,
    'REFRESH_ACTIVATION_HELD');
  assert.equal(dispatchPossible(e,'attempt_01',at).ok,false);
});

test('P54-06 F/X: paginated or unhealthy feed cannot prove absence or exhaust active slot',()=>{
  let e=emptyRefreshEvidence();
  for(const p of [{at,complete:false,present:false,healthy:true},
    {at,complete:true,present:false,healthy:false},
    {at,present:false,complete:true,healthy:true,windowMs:0}])
    assert.equal(observeRefreshPresence(e,p).ok,false);
  const first=observeRefreshPresence(e,{at,present:false,complete:true,healthy:true});
  assert.equal(first.ok,true);e=first.evidence;
  assert.equal(e.misses,1);assert.equal(e.suspended,false);
  assert.equal(observeRefreshPresence(e,{at:at+MINUTE,present:false,complete:true,
    healthy:true}).code,'ABSENCE_WINDOW_NOT_INDEPENDENT');
  assert.equal(e.lastRank,null);
});

test('P54-06 / S6-I14-BOUND-RETRY F/X: three comparable absence windows suspend, reappearance restores without deletion',()=>{
  let e=emptyRefreshEvidence();
  for(let i=0;i<3;i++){
    const result=observeRefreshPresence(e,{at:at+i*10*MINUTE,present:false,
      complete:true,healthy:true});
    assert.equal(result.ok,true);e=result.evidence;
    assert.equal(result.releaseSlot,i===2);
  }
  assert.equal(e.suspended,true);
  assert.equal(e.state,'VISIBILITY_SUSPENDED');
  assert.equal(observeRefreshPresence(e,{at:at+11*MINUTE,present:true,rank:43,
    healthy:true,complete:true}).code,'STALE_VISIBILITY');
  const returned=observeRefreshPresence(e,{at:at+30*MINUTE,present:true,rank:43,
    complete:true,healthy:true});
  assert.equal(returned.ok,true);assert.equal(returned.resumed,true);
  assert.equal(returned.evidence.lastRank,43);assert.equal(returned.evidence.misses,0);
  assert.equal(returned.evidence.suspended,false);
});

test('P54-05 F/X: prior source unchanged or HTTP ACK never proves meaningful effect or feed rank',()=>{
  let e=request(emptyRefreshEvidence()).evidence;
  assert.equal(e.state,'ATTEMPT_PENDING');
  assert.equal(request(e).code,'REFRESH_ADMISSION_HELD');
  e=dispatchPossible(e,'attempt_01',at+100).evidence;
  assert.equal(dispatchPossible(e,'attempt_01',at+200).ok,false);
  const effect=reconcileRefreshAttempt(e,'attempt_01',{at:at+200,kind:'EFFECT_CHANGED',
    sourceFingerprint:changed,targetMatched:true,principalMatched:true});
  assert.equal(effect.ok,true);assert.equal(effect.effectVerified,true);
  assert.equal(effect.feedState,'UNKNOWN');assert.equal(effect.evidence.intent,null);
  const ack=reconcileRefreshAttempt(e,'attempt_01',{at:at+200,kind:'NO_EFFECT',
    sourceFingerprint:hash,targetMatched:true,principalMatched:true,
    feed:{independent:false,complete:true,observedAt:at+200,present:true,rank:1}});
  assert.equal(ack.effectVerified,false);assert.equal(ack.feedState,'UNKNOWN');
  assert.equal(ack.evidence.suspended,true);assert.equal(ack.evidence.state,'INEFFECTIVE');
});

test('P54-05 / S6-I14-BOUND-RETRY X: lost ACK, wrong account and stale readback have no retry',()=>{
  let e=dispatchPossible(request(emptyRefreshEvidence()).evidence,'attempt_01',at+1).evidence;
  const uncertain=reconcileRefreshAttempt(e,'attempt_01',{at:at+2,kind:'UNKNOWN',
    sourceFingerprint:changed,targetMatched:false,principalMatched:false});
  assert.equal(uncertain.ok,true);assert.equal(uncertain.effectVerified,false);
  assert.equal(uncertain.evidence.state,'EFFECT_UNVERIFIED');
  assert.equal(uncertain.evidence.suspended,true);
  assert.equal(request(e,'attempt_02',at+600000).ok,false);
  assert.equal(request(uncertain.evidence,'attempt_02',at+600000).ok,false);
  const later=reconcileRefreshAttempt(uncertain.evidence,'attempt_01',{
    at:at+1200001,kind:'EFFECT_CHANGED',sourceFingerprint:changed,
    targetMatched:true,principalMatched:true});
  assert.equal(later.ok,true);
  assert.equal(later.effectVerified,true);
  assert.equal(later.evidence.attempts,1);
  assert.equal(later.evidence.intent,null);
  assert.equal(uncertain.evidence.intent.state,'DISPATCH_POSSIBLE');
  const mereFeed=observeRefreshPresence(uncertain.evidence,{at:at+10*MINUTE,
    present:true,rank:1,complete:true,healthy:true});
  assert.equal(mereFeed.evidence.suspended,true);
  assert.equal(request(mereFeed.evidence,'attempt_03',at+2*HOUR).ok,false);
});

test('P54-05 F/X: exact independent saved effect and observed feed rank remain separate facts',()=>{
  let e=dispatchPossible(request(emptyRefreshEvidence()).evidence,'attempt_01',at+1).evidence;
  const receipt=reconcileRefreshAttempt(e,'attempt_01',{at:at+2,kind:'EFFECT_CHANGED',
    sourceFingerprint:changed,targetMatched:true,principalMatched:true,
    feed:{independent:true,complete:true,observedAt:at+3,present:true,rank:43}});
  assert.equal(receipt.effectVerified,true);assert.equal(receipt.feedState,'PRESENT');
  assert.deepEqual(receipt.evidence.history[0].feed,{state:'PRESENT',at:at+3,rank:43});
  assert.equal(receipt.evidence.history[0].at,at+2);
  assert.equal(qualifyRefreshCandidate({...qualified,version:'drifted version !'}).ok,false);
  assert.equal(reconcileRefreshAttempt(e,'attempt_01',{at:at+2,kind:'EFFECT_CHANGED',
    sourceFingerprint:changed,targetMatched:true,principalMatched:false}).effectVerified,false);
});

test('P54-05 / S6-I14-BOUND-RETRY: bounded attempts and hard stop after ineffective saves',()=>{
  let e=dispatchPossible(request(emptyRefreshEvidence()).evidence,'attempt_01',at).evidence;
  e=reconcileRefreshAttempt(e,'attempt_01',{at:at+1,kind:'NO_EFFECT',
    sourceFingerprint:hash,targetMatched:true,principalMatched:true}).evidence;
  assert.equal(e.attempts,1);assert.equal(e.nextAttemptAt,at+1+1200000);
  assert.equal(request(e,'attempt_02',at+2000000).ok,false);
  e=observeRefreshPresence(e,{at:at+2*HOUR,present:true,rank:10,complete:true,
    healthy:true}).evidence;
  e=dispatchPossible(request(e,'attempt_02',at+2*HOUR+1).evidence,'attempt_02',
    at+2*HOUR+2).evidence;
  e=reconcileRefreshAttempt(e,'attempt_02',{at:at+2*HOUR+3,kind:'NO_EFFECT',
    sourceFingerprint:hash,targetMatched:true,principalMatched:true}).evidence;
  assert.equal(e.attempts,RETRY_LIMIT);
  e=observeRefreshPresence(e,{at:at+3*HOUR,present:true,rank:10,complete:true,
    healthy:true}).evidence;
  assert.equal(request(e,'attempt_03',at+4*HOUR).ok,false);
  assert.equal(e.history.length,2);
});

test('P54-06 F: actual scheduler rowBlocks suspension freezes retained active budget and prevents reassignment',()=>{
  const inputs=[{slug:'fixture-generator',accountId:'fixture_account',personaUid:'fixture_persona',
    bindingVersion:1,remoteId:'fixture_remote',ownerVerified:true,
    accountVerified:true,principalFingerprint:hash,releaseVerified:true,
    releaseFingerprint:hash,listing:'PUBLIC'}];
  let s=reconcileShadow(emptyShadow(),inputs).state;
  s.rows[0].phase='ACTIVE';s.rows[0].slot=false;s.rows[0].activeRemaining=12*HOUR;
  s.rows[0].refresh.suspended=true;s.rows[0].refresh.state='VISIBILITY_SUSPENDED';
  s.accounts.fixture_account.health='HEALTHY';
  assert.ok(rowBlocks(s,s.rows[0]).includes('VISIBILITY_SUSPENDED'));
  s=advanceShadow(s,{now:at,bootId:'synthetic_boot'}).state;
  assert.equal(s.rows[0].activeRemaining,12*HOUR);
  assert.equal(s.rows[0].slot,false);
});

test('I14 PACKAGING F/X: exact refresh evidence import graph is included in packaged XPI',async()=>{
  const {readFile}=await import('node:fs/promises');
  const overlay=await readFile('src/runtime/overlay.mjs','utf8');
  const evidence=await readFile('src/runtime/refresher-effect-core.mjs','utf8');
  const core=await readFile('src/runtime/refresher-core.mjs','utf8');
  const store=await readFile('src/runtime/refresher-store.mjs','utf8');
  assert.ok(overlay.includes("'refresher-effect-core.mjs'"));
  assert.ok(core.includes("from './refresher-effect-core.mjs'"));
  assert.ok(store.includes("from './refresher-effect-core.mjs'"));
  assert.ok(evidence.includes('dispatchPossible'));
});
