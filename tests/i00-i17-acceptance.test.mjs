import test from 'node:test';
import assert from 'node:assert/strict';
import {CASES,emptyChecklist,normalizeChecklist,recordObservation,checklistMarkdown} from '../src/ui/acceptance-core.mjs';
import {createSafeReport} from '../src/ui/safe-report.mjs';
const fresh=()=>emptyChecklist();
const passed={state:'PASS',tier:'OPERATOR_FIREFOX_H',reference:'local-fixture-001',
  note:'Observed keyboard focus at narrow viewport'};
test('P56-10 / H-07 / REQ-U06 F: no synthetic or absent H PASS and immutable contract IDs',()=>{
  const initial=fresh();
  assert.equal(CASES.length,17);
  assert.equal(CASES.filter(c=>c.id.startsWith('P56-')).length,10);
  assert(CASES.every(c=>initial.entries[c.id].state==='NOT_TESTED'));
  assert.equal(recordObservation(initial,'H-07',{...passed,note:''},1).ok,false);
  assert.equal(recordObservation(initial,'H-01',{...passed,tier:'DETERMINISTIC_F_X'},1).ok,false);
  assert.equal(recordObservation(initial,'H-01',{...passed,reference:'https://private.invalid'},1).ok,false);
  assert.equal(recordObservation(initial,'H-01',{...passed,note:'token=secret/credential:abc'},1).ok,false);
  assert.equal(recordObservation(initial,'H-07',{...passed,state:'NOT_TESTED'},1).ok,false);
  assert.equal(recordObservation(initial,'P56-09',{...passed,tier:'OPERATOR_LIVE_H'},1).ok,false);
});
test('P56-10 / H-07 F/X: evidence-bearing FAIL export is faithful; statuses cannot disappear',()=>{
  let d=fresh();
  const failure={state:'FAIL',tier:'PACKAGED_FIREFOX_B',reference:'diag-2026-01',
    note:'Focused control was obscured at 320 pixels'};
  const updated=recordObservation(d,'P56-09',failure,d.revision);
  assert.equal(updated.ok,true);d=updated.value;
  const blocked={state:'BLOCKED',tier:'NOT_EXECUTED',reference:'route-hold-001',
    note:'Protected route evidence not available'};
  d=recordObservation(d,'H-03',blocked,d.revision).value;
  assert.equal(recordObservation(d,'H-07',passed,1).code,'STALE_CHECKLIST');
  const text=checklistMarkdown(d,{},createSafeReport(null));
  assert.match(text,/P56-09.*FAIL.*PACKAGED_FIREFOX_B.*diag-2026-01/);
  assert.match(text,/H-03.*BLOCKED.*route-hold-001/);
  assert.match(text,/H-01.*NOT_TESTED/);
  assert.match(text,/Safe independent diagnostics/);
  assert.equal(d.entries['H-07'].state,'NOT_TESTED');
});
test('H-01/H-07 F/X: corrupt local state cannot smuggle PASS or arbitrary secrets',()=>{
  const d=fresh();d.entries['H-07']={...passed,note:''};
  assert.equal(normalizeChecklist(d).entries['H-07'].state,'NOT_TESTED');
  const q=fresh();q.entries['P56-01']={...passed,tier:'PACKAGED_FIREFOX_B',note:'Readable authorized fake fixture event'};
  q.entries['extra-case']={...passed};
  assert.equal(normalizeChecklist(q).entries['P56-01'].state,'NOT_TESTED');
  assert.throws(()=>checklistMarkdown(fresh(),{buildSha:'invalid'}),/INVALID_BUILD_SHA/);
  assert.throws(()=>checklistMarkdown(fresh(),{}, {schema:'FAKE',secrets:'x'}),/UNVERIFIED_DIAGNOSTIC/);
});
test('P56-08 / H-07 X: only safe diagnostics appear in export, no Core/URI/source leak',()=>{
  const diag=createSafeReport({wakeCount:3,lastWake:'alarm',refresher:{mode:'SHADOW_ONLY',url:'https://never.example'}});
  const md=checklistMarkdown(fresh(),{}, {...diag,secret:'do-not-leak',wake:{...diag.wake,token:'do-not-leak'}});
  assert(!md.includes('do-not-leak'));
  assert(!md.includes('never.example'));
  assert(md.includes('Wake count: 3'));
});
