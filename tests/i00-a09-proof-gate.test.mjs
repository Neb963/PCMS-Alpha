import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildCatalog,evaluateEvidence,markdownReport} from '../scripts/a09-evidence.mjs';

const SHA='a'.repeat(40), XPI='b'.repeat(64);
const acceptance=await readFile(new URL('../docs/authority/PCMS-Alpha-ACCEPTANCE-MATRIX-v1.0.0.md',import.meta.url),'utf8');
const scenarios=JSON.parse(await readFile(new URL('./fixtures/a01-recovery-scenarios.json',import.meta.url),'utf8'));
const catalog=buildCatalog(acceptance,scenarios);
function run(receipts=[]){return evaluateEvidence({catalog,receipts,sourceSha:SHA,xpiSha256:XPI});}
function sample({id='AC-11',tier='D',caseName='positive',status='PASS',extra={}}={}){
 return {id,tier,case:caseName,status,sourceSha:SHA,xpiSha256:XPI,
   environment:'disposable-Firefox-CI',method:{D:'deterministic-production',B:'installed-xpi',H:'host-process-disk',GIT:'remote-git-readback',L:'provider-readback'}[tier],
   artifact:'https://github.com/Neb963/PCMS-Alpha/actions/runs/40088006348',
   observed:'Exact candidate operation and independent readback matched',
   observedAt:'2026-10-24T10:58:33Z',independentReadback:true,observer:'independent CI/browser observer',...extra};
}

test('A09 catalog is 18 AC + 10 T + 14 X from accepted authority and source-derived X mapping',()=>{
 assert.equal(catalog.length,42);
 assert.deepEqual(catalog.filter(x=>x.kind==='AC').map(x=>x.id),Array.from({length:18},(_,i)=>'AC-'+String(i+1).padStart(2,'0')));
 assert.deepEqual(catalog.filter(x=>x.kind==='T').map(x=>x.id),Array.from({length:10},(_,i)=>'T-'+String(i+1).padStart(2,'0')));
 assert.deepEqual(catalog.filter(x=>x.kind==='X').map(x=>x.id),Array.from({length:14},(_,i)=>'X-'+String(i+1).padStart(2,'0')));
 assert.ok(catalog.every(x=>x.tiers.includes('D')&&x.tiers.includes('B')));
 assert.ok(catalog.filter(x=>x.kind==='X').every(x=>x.authority==='DERIVED_MAPPING_ONLY_ORIGINAL_X_UNAVAILABLE'));
 assert.deepEqual(catalog.find(x=>x.id==='AC-17').tiers,['D','B','H','L']);
 assert.deepEqual(catalog.find(x=>x.id==='AC-11').tiers,['D','B','GIT']);
});

test('A09 release cannot be accepted from green baseline/fast/firefox alone without real and adverse observations',()=>{
 const result=run();
 assert.equal(result.release,'HELD');
 assert.deepEqual(result.counts,{PASS:0,HELD:42,FAIL:0});
 assert.ok(result.holds.includes('MISSING_PROVIDER_GIT_HOST_EVIDENCE'));
 assert.ok(result.holds.includes('ORIGINAL_X_DESCRIPTIONS_UNAVAILABLE'));
 assert.equal(result.rows.find(x=>x.id==='AC-11').evidence.length,9);
 assert.equal(result.rows.find(x=>x.id==='AC-11').unverified,9);
 assert.equal(result.rows.find(x=>x.id==='T-02').status,'HELD');
});

test('A09 receipt slots cannot reuse another build, XPI or unknown ID and cannot duplicate PASS',()=>{
 assert.throws(()=>run([sample({extra:{sourceSha:'c'.repeat(40)}})]),/A09_FOREIGN_REVISION_OR_XPI/);
 assert.throws(()=>run([sample({extra:{xpiSha256:'c'.repeat(64)}})]),/A09_FOREIGN_REVISION_OR_XPI/);
 assert.throws(()=>run([sample({id:'AC-99'})]),/A09_UNKNOWN_ACCEPTANCE_ID/);
 assert.throws(()=>run([sample(),sample()]),/A09_DUPLICATE_OR_CONFLICTING_RECEIPT/);
 assert.throws(()=>run([sample({tier:'L'})]),/A09_OUTSIDE_ACCEPTANCE_SCOPE/);
 assert.throws(()=>run([sample({caseName:'fake'})]),/A09_OUTSIDE_ACCEPTANCE_SCOPE/);
});

test('A09 fake fixture, prose assertion, missing readback or wrong method cannot turn L/GIT/H into PASS',()=>{
 assert.throws(()=>run([sample({tier:'GIT',extra:{method:'deterministic-production'}})]),/A09_TIER_METHOD_MISMATCH/);
 assert.throws(()=>run([sample({tier:'GIT',extra:{fixtureOnly:true}})]),/A09_FIXTURE_CANNOT_CLAIM_PASS/);
 assert.throws(()=>run([sample({tier:'GIT',extra:{independentReadback:false}})]),/A09_EXTERNAL_READBACK_REQUIRED/);
 assert.throws(()=>run([sample({tier:'GIT',extra:{observer:''}})]),/A09_EXTERNAL_OBSERVER_REQUIRED/);
 assert.throws(()=>run([sample({tier:'B',extra:{artifact:'no external artifact'}})]),/A09_INDEPENDENT_ARTIFACT_REQUIRED/);
 assert.throws(()=>run([sample({tier:'B',extra:{observed:'PASS'}})]),/A09_OBSERVATION_REQUIRED/);
 assert.throws(()=>run([sample({tier:'B',extra:{simulated:true}})]),/A09_FIXTURE_CANNOT_CLAIM_PASS/);
});

test('A09 positive receipt does not substitute missing adverse/recovery/tier proofs',()=>{
 const report=run([sample()]);
 assert.equal(report.rows.find(x=>x.id==='AC-11').pass,1);
 assert.equal(report.rows.find(x=>x.id==='AC-11').status,'HELD');
 assert.equal(report.release,'HELD');
 assert.match(markdownReport(report),/Source commit: `a+/);
 assert.match(markdownReport(report),/MISSING_PROVIDER_GIT_HOST_EVIDENCE/);
});

test('A09 known adverse evidence failure is FAIL rather than held, disabled, skipped or success',()=>{
 const report=run([sample({status:'FAIL',extra:{observed:'Actual negative assertion failed'}})]);
 assert.equal(report.release,'FAIL');
 assert.equal(report.rows.find(x=>x.id==='AC-11').status,'FAIL');
 assert.ok(report.holds.includes('FAILING_ACCEPTANCE_EVIDENCE'));
 assert.throws(()=>run([sample({status:'NOT_APPLICABLE'})]),/A09_REQUIRED_CASE_CANNOT_BE_NOT_APPLICABLE/);
});

test('A09 passing all scoped slots for one real claim does not generalize to entire acceptance matrix',()=>{
 const ac=catalog.find(x=>x.id==='AC-11');
 const receipts=ac.tiers.flatMap(tier=>ac.cases.map(caseName=>sample({tier,caseName})));
 const report=run(receipts);
 assert.equal(report.rows.find(x=>x.id==='AC-11').status,'PASS');
 assert.equal(report.counts.PASS,1);
 assert.equal(report.release,'HELD');
});

test('A09 refuses malformed acceptance catalog/unknown source identity rather than emitting green ledger',()=>{
 assert.throws(()=>buildCatalog('fake',scenarios),/A09_MATRIX_REQUIRED/);
 const forged=structuredClone(scenarios);forged.scenarios[0].originalPart8Description='fabricated source';
 assert.throws(()=>buildCatalog(acceptance,forged),/A09_UNVERIFIED_X_SOURCE_REPLACEMENT/);
 const mutilated=acceptance.replace(/^\| \*\*AC-17\*\* \|.*\n/m,'');
 assert.throws(()=>buildCatalog(mutilated,scenarios),/A09_AC_COUNT_INVALID/);
 assert.throws(()=>evaluateEvidence({catalog,receipts:[],sourceSha:'HEAD',xpiSha256:XPI}),/A09_SOURCE_SHA_REQUIRED/);
 assert.throws(()=>evaluateEvidence({catalog,receipts:[],sourceSha:SHA,xpiSha256:'artifact.zip'}),/A09_EXACT_XPI_SHA256_REQUIRED/);
});

test('A09 CLI denies a caller supplied arbitrary source SHA before inspecting any XPI',async()=>{
 const {spawnSync}=await import('node:child_process');
 const result=spawnSync(process.execPath,['scripts/a09-evidence.mjs','--xpi','does-not-exist.xpi','--source-sha','a'.repeat(40)],
   {cwd:new URL('../',import.meta.url),encoding:'utf8'});
 assert.notEqual(result.status,0);
 assert.match(result.stderr,/A09_SOURCE_CHECKOUT_SHA_MISMATCH/);
});

test('A09 uses latest accepted amendment rather than superseded encrypted backup or native clock',()=>{
 const backup=catalog.find(x=>x.id==='AC-17');
 assert.match(backup.description,/strictly passwordless, unencrypted, browser-native/);
 assert.doesNotMatch(backup.description,/encrypted integrated backup/);
 assert.match(backup.negative,/last known-good/);
 const refresh=catalog.find(x=>x.id==='AC-14');
 assert.match(refresh.negative,/rest advances with wall time/);
 const resumed=catalog.find(x=>x.id==='AC-15');
 assert.match(resumed.description,/browser alarms/);
});
