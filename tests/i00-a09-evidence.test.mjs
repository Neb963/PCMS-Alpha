import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {evaluateEvidence,buildCatalog} from '../scripts/a09-evidence.mjs';

// RED on A08: the installed-XPI/CI suite has no independent AC/T/X release gate.
// This invokes the release gate itself, not a grep against a heading or DOM ID.
test('A09 release cannot be accepted from baseline/fast/firefox green without external observations',async()=>{
 const matrix=await readFile(new URL('../docs/authority/PCMS-Alpha-ACCEPTANCE-MATRIX-v1.0.0.md',import.meta.url),'utf8');
 const scenarios=JSON.parse(await readFile(new URL('./fixtures/a01-recovery-scenarios.json',import.meta.url),'utf8'));
 const originalX=await readFile(new URL('../docs/audit/PART8-ORIGINAL-X01-X14.md',import.meta.url),'utf8');
 const catalog=buildCatalog(matrix,scenarios,originalX);
 const r=evaluateEvidence({catalog,receipts:[],sourceSha:'a'.repeat(40),xpiSha256:'b'.repeat(64)});
 assert.equal(catalog.length,42);
 assert.equal(r.release,'HELD');
 assert.equal(r.counts.PASS,0);
 assert.ok(r.holds.includes('MISSING_PROVIDER_GIT_HOST_EVIDENCE'));
 assert.ok(!r.holds.includes('ORIGINAL_X_DESCRIPTIONS_UNAVAILABLE'));
 assert.equal(catalog.filter(x=>x.kind==='X'&&x.authority==='RECOVERED_PART8_AUDIT_VERBATIM').length,14);
});
