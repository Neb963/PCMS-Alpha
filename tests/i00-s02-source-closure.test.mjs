// S02 source closure: production audit over actual backup-shaped canonical rows.
// No provider or fake readback can substitute for SHA256 of retained raw bytes.
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {auditSourceClosure} from '../src/ui/backup-source-closure.mjs';
import {encodeIntegrated} from '../src/ui/backup-core.mjs';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const text = new TextEncoder();
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(x => x.toString(16).padStart(2, '0')).join('');
function snapshot(rows = []) {
  return {schema: 1, stores: {entities: [], operations: [], events: [], meta: rows,
    observations: []}};
}
async function source(domain = 'PCMS_STAGED_SOURCE_V1\n') {
  const entries = [
    ['main.pjs', text.encode('output = "exact original"')],
    ['index.html', text.encode('<div>exact</div>')],
    ['src/deep/asset.png', Uint8Array.from([0, 255, 33, 9])]
  ];
  const files = [];
  for (const [path, bytes] of entries)
    files.push({path, size: bytes.length, sha256: await hash(bytes)});
  // The production source builders use lexical ordering.
  files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  const map = new Map(entries);
  const blobs = files.map(f => ({
    path: f.path, base64: Buffer.from(map.get(f.path)).toString('base64')
  }));
  const fingerprint = await hash(text.encode(domain +
    files.map(f => JSON.stringify([f.path, f.size, f.sha256])).join('\n')));
  return {ok: true, fingerprint, files, blobs};
}
function meta(key, owner, field, value) {
  return {key, value: {[owner]: {[field]: value}}};
}
test('S02 detects deduplicated original/stage/AI/release/history sources with exact bytes', async () => {
  const staged = await source();
  const original = await source('PCMS_ORIGINAL_V1\n');
  const rows = [
    meta('adoption:a', 'adoption', 'original', original),
    {key: 'stage:a', value: {record: {candidate: staged, previous: original}}},
    {key: 'stage-history:a:1', value: {record: {candidate: staged, previous: original}}},
    meta('ai-job:a', 'job', 'finalSource', {...staged, ok: undefined}),
    meta('ai-history:a:3', 'job', 'finalSource', staged),
    {key: 'release:a', value: {release: {sealedSource: staged, previousSource: original}}},
    meta('release-history:a:x', 'release', 'previousSource', original),
    meta('existing-update:a', 'record', 'stageSource', staged),
    {key: 'network-ledger', value: {state: 'KEEP'}}
  ];
  const result = await auditSourceClosure(snapshot(rows));
  assert.equal(result.manifests, 11);
  assert.equal(result.references, 33);
  assert.equal(result.uniqueBlobs, 3);
  assert.ok(result.uniqueBytes < result.referencedBytes);
  assert.equal(result.status, 'SOURCE_BYTES_AUDITED_NOT_DISK_VERIFIED');
});
test('S02 refuses a missing, changed, misnamed or hidden source byte', async () => {
  const base = await source();
  const checks = [
    [s => {s.blobs.pop();}, 'BACKUP_SOURCE_INCOMPLETE'],
    [s => {s.blobs[0].base64 = 'AAAA';}, 'BACKUP_SOURCE_BYTE_MISMATCH'],
    [s => {s.blobs[1].path = 'src/../escape';}, 'BACKUP_SOURCE_PATH_INVALID'],
    [s => {s.files[1].sha256 = '0'.repeat(64);}, 'BACKUP_SOURCE_BYTE_MISMATCH'],
    [s => {s.fingerprint = '1'.repeat(64);}, 'BACKUP_SOURCE_FINGERPRINT_MISMATCH'],
    [s => {s.files = s.files.filter(f => f.path !== 'main.pjs'); s.blobs = s.blobs.filter(f => f.path !== 'main.pjs');}, 'BACKUP_SOURCE_INCOMPLETE'],
    [s => {s.blobs[0].base64 = 'not base64';}, 'BACKUP_SOURCE_BINARY_INVALID']
  ];
  for (const [mutate, code] of checks) {
    const changed = structuredClone(base);
    mutate(changed);
    await assert.rejects(auditSourceClosure(snapshot([
      meta('ai-history:a:corrupt', 'job', 'finalSource', changed)
    ])), new RegExp(code));
  }
});
test('S02 blocks v1 encryption before any cipher work for incomplete source', async () => {
  const sourceSnapshot = await source();
  sourceSnapshot.blobs = [];
  let gotRandom = 0;
  const before = crypto.getRandomValues;
  try {
    crypto.getRandomValues = (...args) => {gotRandom++; return before(...args);};
    await assert.rejects(encodeIntegrated({
      pcms: snapshot([meta('adoption:a', 'adoption', 'original', sourceSnapshot)]),
      donorEnvelope: '{}', passphrase: 'correct portable password'
    }), /BACKUP_SOURCE_INCOMPLETE/);
    assert.equal(gotRandom, 0, 'must reject before generating an archive key or download');
  } finally {crypto.getRandomValues = before;}
});
test('S02 rejects missing mandatory old revisions and duplicated path references', async () => {
  const good = await source();
  await assert.rejects(auditSourceClosure(snapshot([
    {key: 'stage:a', value: {record: {candidate: good}}}
  ])), /BACKUP_SOURCE_INCOMPLETE/);
  await assert.rejects(auditSourceClosure(snapshot([
    {key: 'adoption:a', value: {adoption: {archived: true}}}
  ])), /BACKUP_SOURCE_INCOMPLETE/);
  const dup = structuredClone(good);
  dup.files[2] = structuredClone(dup.files[1]);
  await assert.rejects(auditSourceClosure(snapshot([
    meta('ai-history:a:1', 'job', 'finalSource', dup)
  ])), /BACKUP_SOURCE_MANIFEST_INVALID/);
});
test('S02 unrelated historical rows do not invent source or admission authority', async () => {
  const status = await auditSourceClosure(snapshot([
    {key: 'source-link:a', value: {link: {fingerprint: '0'.repeat(64)}}},
    {key: 'coordinator:legacy', value: {unknown: true}}
  ]));
  assert.equal(status.manifests, 0);
  assert.equal(status.uniqueBlobs, 0);
});
