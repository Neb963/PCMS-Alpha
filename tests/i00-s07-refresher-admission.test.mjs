import test from 'node:test';
import assert from 'node:assert/strict';
import {qualifyRecentAbsence,planOwnedSourceMarker,countObservedOccupancy} from '../src/runtime/refresher-admission.mjs';
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
