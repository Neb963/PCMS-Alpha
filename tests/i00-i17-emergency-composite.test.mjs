import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {createSafeReport,normalizeSafeReport,safeMarkdownReport} from '../src/ui/safe-report.mjs';
import {makeSafeArchive} from '../src/ui/diagnostic-archive.mjs';
function extract(zip){
  const code='import io,sys,zipfile,json\n'
    +'z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read()))\n'
    +'assert z.namelist()==["report.json","README.md"]\n'
    +'print(json.dumps([json.loads(z.read("report.json")),z.read("README.md").decode()]))\n';
  const p=spawnSync('python3',['-c',code],{input:Buffer.from(zip),encoding:'utf8',timeout:9000});
  assert.equal(p.status,0,String(p.stderr||''));
  return JSON.parse(p.stdout);
}
test('P56-08 F/X: emergency ZIP retains safe Refresher evidence and omits arbitrary data',()=>{
  const src=createSafeReport({wakeCount:4,alarmCount:2,lastWake:'alarm',restoreActive:true,
    refresher:{mode:'SHADOW_ONLY',turns:42,reads:5,queuePeak:1234,readPeak:2,
      unknownIntervals:6,alarmHeld:true,code:'CANONICAL_UNAVAILABLE',mutations:4}});
  const forged={...src,untrusted:'TEST_INJECTED_VALUE',
    sections:{...src.sections,canonical:'TEST_INJECTED_VALUE'},
    refresher:{...src.refresher,untrusted:'TEST_INJECTED_VALUE',readPeak:10000001}};
  const [report,markdown]=extract(makeSafeArchive(forged));
  assert.equal(report.sections.canonical,'section_unavailable');
  assert.equal(report.sections.restore,'RESTORE_IN_PROGRESS');
  assert.deepEqual(report.refresher,{mode:'SHADOW_ONLY',mutations:0,
    turns:42,reads:5,queuePeak:1234,readPeak:null,unknownIntervals:6,
    alarmHeld:true,code:'CANONICAL_UNAVAILABLE'});
  assert.match(markdown,/Read peak: unavailable/);
  assert.match(markdown,/Provider mutations: OFF/);
  assert.equal(markdown,safeMarkdownReport(forged));
  assert.equal(JSON.stringify({report,markdown}).includes('TEST_INJECTED_VALUE'),false);
});
test('P56-08 X: unavailable Core leaves minimal redacted report and no fabricated authorization',()=>{
  const [report,markdown]=extract(makeSafeArchive(createSafeReport(null)));
  assert.equal(report.effects,'OFF');
  assert.equal(report.sections.canonical,'section_unavailable');
  assert.equal(report.sections.refresher,undefined);
  assert.match(markdown,/Refresher section: section_unavailable/);
  assert.throws(()=>makeSafeArchive({schema:'FOREIGN'}),/Unvalidated diagnostic report/);
  assert.equal(normalizeSafeReport(createSafeReport(null)).effects,'OFF');
});
test('P56-08 X: emergency page does not import normal controller or provider mutators',async()=>{
  const source=await readFile('src/ui/emergency.mjs','utf8');
  const page=await readFile('src/ui/emergency.html','utf8');
  for(const forbidden of ['entry.mjs','persona-guard','runSupplyStep','runReleaseStep'])
    assert.equal(source.includes(forbidden),false);
  assert.match(source,/browser\.storage\.local\.get/);
  assert.match(source,/catch/);
  assert.match(page,/id="markdown" readonly/);
  assert.match(page,/download-status/);
});