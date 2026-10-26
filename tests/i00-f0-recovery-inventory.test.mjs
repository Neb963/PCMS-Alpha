import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {domains,inventory,noticePolicies,extractStates,main} from '../scripts/recovery-inventory.mjs';
test('F0 inventory covers production state literals and every required recovery dimension',async()=>{
 const result=await inventory();assert.deepEqual(result.drift,[]);
 for(const row of result.states){
  for(const key of ['domain','state','rootCause','automaticHandler','operatorAction','prerequisites','destination','settlement','retry','timeout','cancellation','uncertainty'])
   assert.ok(row[key],`${row.domain}/${row.state} missing ${key}`);
  for(const owner of row.owner)await access(owner);
  for(const handler of row.automaticHandler.split(';'))await access(handler.split('#')[0]);
 }
 assert.equal(new Set(result.states.map(s=>s.domain+':'+s.state)).size,result.states.length);
 await main(true);
});
test('F0 new production state/notice vocabulary fails coverage rather than falling back silently',async()=>{
 assert.deepEqual(extractStates("next.state='NEW_UNMAPPED_STATE'"),['NEW_UNMAPPED_STATE']);
 assert.ok(!domains.some(d=>d.states.includes('NEW_UNMAPPED_STATE')));
 const source=await readFile('src/runtime/journal.mjs','utf8');
 const block=source.match(/const NOTICE_CODES = new Set\(\[([\s\S]*?)\]\)/)[1];
 const actual=[...block.matchAll(/'([A-Z_]+)'/g)].map(m=>m[1]).sort();
 assert.deepEqual(Object.keys(noticePolicies).sort(),actual);
 const result=await inventory();assert.equal(result.notices.length,11*3*3);
 for(const row of result.notices)assert.ok(row.destination&&row.action&&row.settlement);
});
test('F0 uncertain and historical effects retain no-replay ownership fences',async()=>{
 const r=await inventory();
 for(const s of r.states.filter(s=>/UNCERTAIN|DISPATCH_POSSIBLE|COMMIT_POSSIBLE|RECONCILE/.test(s.state)))
  assert.match(s.safetyHold,/observation only/);
 assert.equal(r.historicalQuarantine.replay,false);
 assert.equal(r.historicalQuarantine.automaticCreate,false);
 assert.equal(r.historicalQuarantine.automaticRename,false);
});
