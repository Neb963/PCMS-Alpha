import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyRecentAbsence,planOwnedSourceMarker,countObservedOccupancy,planRefresherSourceCandidate} from '../src/runtime/refresher-admission.mjs';
const now=1800000000000;
const recent={complete:true,observedAt:now-1000,suspended:false};
const policy={recentMs:600000};
const row={stableId:'rfgen_0001',phase:'ACTIVE',slot:true,paused:false,reviewHeld:false,
  identityHeld:false,readyUpdate:false,ownerVerified:true,releaseVerified:true,listing:'PUBLIC',
  presence:{source:'GUARDED_RECENT_LIST',observedAt:recent.observedAt,present:false,absence:'NOT_A_DELETION'},
  refresh:{state:'ABSENT_ONCE',misses:1,suspended:false,intent:null,nextAttemptAt:0}};
test('S07 AC-14: confirmed current full-feed disappearance alone admits candidate',()=>{
  assert.equal(qualifyRecentAbsence({row,recent,policy,now}).ok,true);
});
test('S07 AC-14/T-08: visible, truncated, stale or unrelated feed cannot authorize saves',()=>{
  for(const override of [
    {recent:{...recent,complete:false}},
    {recent:{...recent,observedAt:now-1200001}},
    {recent:{...recent,observedAt:now+1}},
    {row:{...row,presence:{...row.presence,present:true}}},
    {row:{...row,presence:{...row.presence,observedAt:recent.observedAt-1}}},
    {row:{...row,presence:{...row.presence,source:'PAGE_CLAIM'}}},
    {row:{...row,refresh:{...row.refresh,state:'PRESENT'}}},
    {row:{...row,refresh:{...row.refresh,state:'VISIBILITY_SUSPENDED',suspended:true}}},
    {row:{...row,refresh:{...row.refresh,intent:{id:'already_dispatched'}}}},
    {row:{...row,reviewHeld:true}},
    {row:{...row,readyUpdate:true}},
    {row:{...row,listing:'UNLISTED'}},
    {row:{...row,ownerVerified:false}}
  ]){
    const verdict=qualifyRecentAbsence({row,recent,policy,now,...override});
    assert.equal(verdict.ok,false,JSON.stringify(override));
  }
});
test('S07 C-54: PCMS-owned trailing comment preserves all preexisting HTML bytes',()=>{
  const src='<div>hello</div>\r\n<!-- user comment -->  ';
  const a=planOwnedSourceMarker(src,'A1234567890abcdef');
  assert.equal(a.ok,true);
  assert.equal(a.html.slice(0,src.length),src);
  const b=planOwnedSourceMarker(a.html,'B1234567890abcdef');
  assert.equal(b.ok,true);
  assert.equal(b.html,src+'\n<!-- pcms-alpha-refresher:B1234567890abcdef -->');
  assert.equal(planOwnedSourceMarker(b.html,'B1234567890abcdef').ok,false);
  assert.equal(planOwnedSourceMarker(src+'\n<!-- pcms-alpha-refresher:malformed -->','C1234567890abcdef').ok,false);
  assert.equal(planOwnedSourceMarker('<!-- pcms-alpha-refresher:A1234567890abcdef -->\n<!-- pcms-alpha-refresher:B1234567890abcdef -->','C1234567890abcdef').ok,false);
  assert.equal(planOwnedSourceMarker(src,'not-valid').ok,false);
});

test('S07 AC-14: occupancy represents full-feed observations, not scheduled slots',()=>{
  const rows=[
    {slug:'a',ownerVerified:true,releaseVerified:true,listing:'PUBLIC',phase:'ACTIVE',slot:true},
    {slug:'b',ownerVerified:true,releaseVerified:true,listing:'PUBLIC',phase:'SLEEPING',slot:false},
    {slug:'c',ownerVerified:true,releaseVerified:true,listing:'PUBLIC',phase:'ACTIVE',slot:true},
    {slug:'unlisted',ownerVerified:true,releaseVerified:true,listing:'UNLISTED'},
    {slug:'other',ownerVerified:false,releaseVerified:false,listing:'PUBLIC'}];
  const observed=countObservedOccupancy(rows,[{slug:'a'},{slug:'b'},{slug:'other'}],now);
  assert.deepEqual(observed,{ok:true,sample:{at:now,feedSize:3,ownedPublic:3,ownedVisible:2,activeVisible:1}});
  assert.equal(countObservedOccupancy(rows,[{slug:'a'},{slug:'a'}],now).ok,false);
  assert.equal(countObservedOccupancy(rows,[{slug:'a'}],0).ok,false);
});

test('S07 T-07: same-id RESERVED intent may dispatch only while feed absence is still current',()=>{
  const reserved={...row,refresh:{...row.refresh,state:'ATTEMPT_PENDING',
    intent:{id:'reserved_01',state:'RESERVED',at:now-200}}};
  assert.equal(qualifyRecentAbsence({row:reserved,recent,policy,now}).ok,false);
  assert.equal(qualifyRecentAbsence({row:reserved,recent,policy,now,reservedId:'reserved_01'}).ok,true);
  assert.equal(qualifyRecentAbsence({row:reserved,recent,policy,now,reservedId:'wrong'}).ok,false);
  assert.equal(qualifyRecentAbsence({row:{...reserved,presence:{...row.presence,present:true}},
    recent,policy,now,reservedId:'reserved_01'}).ok,false);
});

test('S07 C-54: sealed original source produces exactly one HTML-only full-manifest candidate',async()=>{
  const {exactSource,diffSource}=await import('../src/runtime/staging-core.mjs');
  const files=[
    {path:'main.pjs',base64:btoa('generator\nsource')},
    {path:'index.html',base64:btoa('<main>Hi</main>')},
    {path:'src/style.css',base64:btoa('h1 { color: black; }')}
  ];
  const original=await exactSource(files);
  assert.equal(original.ok,true);
  const markerId='ABCDEFGH123456789';
  const planned=await planRefresherSourceCandidate({files,expectedFingerprint:original.fingerprint,markerId});
  assert.equal(planned.ok,true,JSON.stringify(planned));
  assert.equal(planned.fromFingerprint,original.fingerprint);
  assert.notEqual(planned.toFingerprint,original.fingerprint);
  assert.deepEqual(planned.changedPaths,['index.html']);
  const next=await exactSource(planned.targetFiles);
  assert.equal(next.fingerprint,planned.toFingerprint);
  assert.deepEqual(diffSource(original,next).changes,[{path:'index.html',kind:'CHANGED'}]);
  assert.deepEqual(planned.previousFiles.find(f=>f.path==='main.pjs'),planned.targetFiles.find(f=>f.path==='main.pjs'));
  assert.deepEqual(planned.previousFiles.find(f=>f.path==='src/style.css'),planned.targetFiles.find(f=>f.path==='src/style.css'));
  const savedHtml=atob(next.blobs.find(f=>f.path==='index.html').base64);
  assert.equal(savedHtml,'<main>Hi</main>\n<!-- pcms-alpha-refresher:'+markerId+' -->');
  assert.equal((await planRefresherSourceCandidate({files,expectedFingerprint:'f'.repeat(64),markerId})).ok,false);
  assert.equal((await planRefresherSourceCandidate({files:planned.targetFiles,
    expectedFingerprint:next.fingerprint,markerId})).code,'REFRESH_MARKER_REPLAY');
});

test('S07 T-07: a different human/source edit cannot be accepted as the exact planned marker',async()=>{
  const {emptyRefreshEvidence,reserveRefreshAttempt,dispatchPossible,reconcileRefreshAttempt}=
    await import('../src/runtime/refresher-effect-core.mjs');
  const start='a'.repeat(64),target='b'.repeat(64),other='c'.repeat(64);
  const candidate={status:'SUPPORTED_AND_VERIFIED',method:'CONTROLLED_SOURCE_MARKER',
    allowedByProvider:true,version:'marker_v1',sourceFingerprint:start,
    targetFingerprint:target,markerId:'marker_1234567890',nonce:'a'.repeat(32),
    evidenceId:'evidence_1234',meaningfulEffectVerified:true};
  const reserve=reserveRefreshAttempt(emptyRefreshEvidence(),{
    id:'mutation_1234567',at:now,slug:'owned-generator',
    sourceFingerprint:start,candidate,eligible:true,liveAuthorized:true});
  assert.equal(reserve.ok,true,JSON.stringify(reserve));
  const dispatch=dispatchPossible(reserve.evidence,'mutation_1234567',now+1);
  assert.equal(dispatch.ok,true);
  const wrong=reconcileRefreshAttempt(dispatch.evidence,'mutation_1234567',
    {at:now+2,kind:'EFFECT_CHANGED',sourceFingerprint:other,
      targetMatched:true,principalMatched:true});
  assert.equal(wrong.effectVerified,false);
  assert.equal(wrong.evidence.state,'EFFECT_UNVERIFIED');
  assert.equal(wrong.evidence.intent.state,'DISPATCH_POSSIBLE');
  const correct=reconcileRefreshAttempt(dispatch.evidence,'mutation_1234567',
    {at:now+2,kind:'EFFECT_CHANGED',sourceFingerprint:target,
      targetMatched:true,principalMatched:true});
  assert.equal(correct.effectVerified,true);
  assert.equal(correct.evidence.intent,null);
  assert.equal(reserveRefreshAttempt(emptyRefreshEvidence(),{
    id:'mutation_1234567',at:now,slug:'owned-generator',
    sourceFingerprint:start,candidate:{...candidate,targetFingerprint:start},
    eligible:true,liveAuthorized:true}).ok,false);
});

test('S07 C-54: verified first marker and actual return to feed admit the next marker, not after ineffective write',async()=>{
  const {emptyRefreshEvidence,reserveRefreshAttempt,dispatchPossible,
    reconcileRefreshAttempt,observeRefreshPresence}=await import('../src/runtime/refresher-effect-core.mjs');
  const initial='a'.repeat(64),first='b'.repeat(64),second='c'.repeat(64);
  const q=(sourceFingerprint,targetFingerprint,markerId)=>({
    status:'SUPPORTED_AND_VERIFIED',method:'CONTROLLED_SOURCE_MARKER',allowedByProvider:true,
    version:'marker_v1',sourceFingerprint,targetFingerprint,markerId,nonce:'b'.repeat(32),
    evidenceId:'evidence_12345',meaningfulEffectVerified:true});
  const begin={...emptyRefreshEvidence(),state:'ABSENT_ONCE',misses:1,lastMissAt:now-600000};
  const one=reserveRefreshAttempt(begin,{id:'first_intent',at:now,slug:'owned-generator',
    sourceFingerprint:initial,candidate:q(initial,first,'marker_0000000001'),
    eligible:true,liveAuthorized:true});
  assert.equal(one.ok,true);
  const sent=dispatchPossible(one.evidence,'first_intent',now+1);
  assert.equal(sent.ok,true);
  const saved=reconcileRefreshAttempt(sent.evidence,'first_intent',{
    at:now+2,kind:'EFFECT_CHANGED',sourceFingerprint:first,
    targetMatched:true,principalMatched:true});
  assert.equal(saved.effectVerified,true);
  assert.equal(saved.evidence.savedSourceFingerprint,first);
  assert.equal(saved.evidence.savedMarkerId,'marker_0000000001');
  assert.equal(saved.evidence.awaitingVisibility,true);
  const tooEarly=observeRefreshPresence(saved.evidence,{at:now+1,
    present:true,rank:3,complete:true,healthy:true});
  assert.equal(tooEarly.ok,false);
  assert.equal(tooEarly.code,'REFRESH_FEED_PREDATES_SAVED_SOURCE');
  const preSaveFeed=reconcileRefreshAttempt(sent.evidence,'first_intent',{
    at:now+2,kind:'EFFECT_CHANGED',sourceFingerprint:first,
    targetMatched:true,principalMatched:true,
    feed:{independent:true,complete:true,observedAt:now+1,present:true,rank:3}});
  assert.equal(preSaveFeed.effectVerified,true);
  assert.equal(preSaveFeed.evidence.awaitingVisibility,true);
  const absentAgain=observeRefreshPresence(saved.evidence,{at:now+600000,
    present:false,complete:true,healthy:true});
  assert.equal(absentAgain.ok,true);
  assert.equal(absentAgain.evidence.awaitingVisibility,true);
  assert.equal(qualifyRecentAbsence({row:{...row,refresh:absentAgain.evidence,
    presence:{...row.presence,observedAt:now+600000}},
    recent:{...recent,observedAt:now+600000},policy,now:now+600001}).ok,false);
  const visible=observeRefreshPresence(saved.evidence,{at:now+600000,
    present:true,rank:7,complete:true,healthy:true});
  assert.equal(visible.ok,true);
  assert.equal(visible.evidence.attempts,0);
  assert.equal(visible.evidence.awaitingVisibility,false);
  const missing=observeRefreshPresence(visible.evidence,{at:now+1200000,
    present:false,complete:true,healthy:true});
  assert.equal(missing.ok,true);
  const two=reserveRefreshAttempt(missing.evidence,{id:'second_intent',at:now+1200001,
    slug:'owned-generator',sourceFingerprint:first,
    candidate:q(first,second,'marker_0000000002'),eligible:true,liveAuthorized:true});
  assert.equal(two.ok,true,JSON.stringify(two));
  const mistaken=reserveRefreshAttempt(missing.evidence,{id:'wrong_intent',at:now+1200001,
    slug:'owned-generator',sourceFingerprint:initial,
    candidate:q(initial,second,'marker_0000000002'),eligible:true,liveAuthorized:true});
  assert.equal(mistaken.ok,false);
});

// A lower-level admission cannot bypass canonical coverage after a saved
// source change, even if an external caller fabricates "eligible".
test('S07 AC-14 X: effect layer refuses a second mutation while visibility is unproven',async()=>{
  const {emptyRefreshEvidence,reserveRefreshAttempt,observeRefreshPresence}=
    await import('../src/runtime/refresher-effect-core.mjs');
  const source='a'.repeat(64),target='b'.repeat(64);
  const candidate={status:'SUPPORTED_AND_VERIFIED',method:'CONTROLLED_SOURCE_MARKER',
    allowedByProvider:true,meaningfulEffectVerified:true,
    version:'marker_v1',evidenceId:'independent_01',
    sourceFingerprint:source,targetFingerprint:target,
    markerId:'marker_123456789000',nonce:'c'.repeat(32)};
  const holding={...emptyRefreshEvidence(),state:'ABSENT_ONCE',misses:1,
    awaitingVisibility:true,savedSourceFingerprint:source};
  const denied=reserveRefreshAttempt(holding,{id:'attempt_123456',at:now,
    slug:'generator-abc',sourceFingerprint:source,candidate,
    eligible:true,liveAuthorized:true});
  assert.equal(denied.ok,false);
  assert.equal(denied.code,'REFRESH_ADMISSION_HELD');
  const uncertain={...holding,state:'EFFECT_UNVERIFIED',suspended:true,
    intent:{id:'attempt_123456',state:'DISPATCH_POSSIBLE'}};
  const observed=observeRefreshPresence(uncertain,{at:now,present:true,
    rank:1,complete:true,healthy:true});
  assert.equal(observed.ok,true);
  assert.equal(observed.evidence.awaitingVisibility,true);
  assert.equal(observed.evidence.suspended,true);
});
