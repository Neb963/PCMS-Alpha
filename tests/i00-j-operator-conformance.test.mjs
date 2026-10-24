import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
test('practical conformance audit preserves all 34 enumerated operator findings',async()=>{
 const audit=await read('docs/audit/2026-10-24-PRACTICAL-PRODUCT-CONFORMANCE.md');
 const matches=[...audit.matchAll(/^### ([AGDRS])-([0-9]{2}) \[/gm)].map(x=>x[1]+'-'+x[2]);
 assert.equal(matches.length,34);
 assert.equal(new Set(matches).size,34);
 for(const [prefix,n] of [['A',8],['G',7],['D',6],['R',3],['S',10]])
  for(let i=1;i<=n;i++)assert.ok(matches.includes(prefix+'-'+String(i).padStart(2,'0')));
});
test('current coding-agent instructions preserve every journey and accepted UX priority',async()=>{
 const [plan,agent]=await Promise.all([
  read('docs/implementation/OPERATOR-JOURNEYS-2026-10-24.md'),
  read('AGENTS.md')
 ]);
 for(let i=1;i<=7;i++)assert.match(plan,new RegExp('J'+String(i).padStart(2,'0')+' \\u2014'));
 for(const phrase of ['Open Perchance','Change route','Archive','Refresher','passwordless','fully enabled XPI','one reviewable PR per J journey'])
  assert.ok(plan.includes(phrase),'Missing acceptance action: '+phrase);
 assert.match(agent,/J01.*J07/);
 assert.match(agent,/full 34-finding operator UI audit/);
 assert.match(plan,/34 named observations/);
 assert.ok(!plan.includes('Replace persona with dummy'));
});
