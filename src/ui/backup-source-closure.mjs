// S02: independent source-byte closure audit before backup export.
// Retains the original and staged fingerprint domains, including old revisions.
// Pure read-only code: no provider, route, Git or storage mutation.
const enc = new TextEncoder();
const hex = /^[0-9a-f]{64}$/;
const asset = path => typeof path === 'string' && path.length <= 240 &&
  path === path.normalize('NFC') && path.startsWith('src/') &&
  path.split('/').every(s => /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(s) &&
    s !== '.' && s !== '..' && !s.endsWith('.'));
const pathOK = path => path === 'main.pjs' || path === 'index.html' || asset(path);
const requireSource = (valid, code = 'BACKUP_SOURCE_INCOMPLETE') => {
  if (!valid) throw Error(code);
};
const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
  .map(v => v.toString(16).padStart(2, '0')).join('');
function decode(value) {
  requireSource(typeof value === 'string' &&
    value.length <= Math.ceil(12 * 1024 * 1024 / 3) * 4 + 8 &&
    /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),
    'BACKUP_SOURCE_BINARY_INVALID');
  const plain = atob(value);
  return Uint8Array.from(plain, v => v.charCodeAt(0));
}
function references(row) {
  const key = row?.key;
  if (typeof key !== 'string') return [];
  const data = row?.value;
  if (!data || typeof data !== 'object') return [];
  const cases = [
    [/^adoption:/, 'adoption', ['original']],
    [/^stage(?:-history)?:/, 'record', ['candidate', 'previous']],
    [/^ai-(?:job|history):/, 'job', ['finalSource']],
    [/^release(?:-history)?:/, 'release', ['sealedSource', 'previousSource']],
    [/^existing-update:/, 'record', ['stageSource']]
  ];
  const match = cases.find(([prefix]) => prefix.test(key));
  if (!match) return [];
  const [, owner, fields] = match;
  requireSource(typeof data[owner] === 'object' && data[owner] !== null);
  const record = data[owner];
  // Historical source is not optional after a source-bearing effect.
  // Newly prepared existing updates and unfinished AI jobs legitimately have
  // no staged/final source yet; they remain preserved as unresolved records.
  const required = key.startsWith('adoption:') ||
    key.startsWith('stage:') || key.startsWith('stage-history:') ||
    key.startsWith('release:') || key.startsWith('release-history:');
  for (const field of fields) {
    if (required || (field === 'finalSource' && record.verifiedFinal) ||
        (field === 'stageSource' && record.stagedFingerprint)) {
      requireSource(record[field] !== undefined && record[field] !== null);
    }
  }
  return fields.filter(field => record[field] !== undefined &&
    record[field] !== null).map(field => ({
      kind: key, name: field, source: record[field]
    }));
}
export async function auditSourceClosure(snapshot) {
  requireSource(snapshot?.schema === 1 && Array.isArray(snapshot?.stores?.meta),
    'BACKUP_SOURCE_SNAPSHOT_INVALID');
  const seen = new Map();
  let manifests = 0, referenceCount = 0, uniqueBytes = 0, referencedBytes = 0;
  for (const row of snapshot.stores.meta) {
    for (const {source} of referencesOf(row)) {
      requireSource(source && typeof source === 'object' &&
        hex.test(source.fingerprint || '') && Array.isArray(source.files) &&
        Array.isArray(source.blobs) && source.files.length >= 2 &&
        source.files.length === source.blobs.length);
      const byPath = new Map();
      for (const blob of source.blobs) {
        requireSource(pathOK(blob?.path) && !byPath.has(blob.path.toLowerCase()),
          'BACKUP_SOURCE_PATH_INVALID');
        byPath.set(blob.path.toLowerCase(), blob);
      }
      const manifest = [], manifestPaths = new Set();
      for (const f of source.files) {
        requireSource(pathOK(f?.path) && Number.isSafeInteger(f?.size) &&
          f.size >= 0 && hex.test(f.sha256) && f.size <= 12 * 1024 * 1024,
          'BACKUP_SOURCE_MANIFEST_INVALID');
        requireSource(!manifestPaths.has(f.path.toLowerCase()),
          'BACKUP_SOURCE_MANIFEST_INVALID');
        manifestPaths.add(f.path.toLowerCase());
        const blob = byPath.get(f.path.toLowerCase());
        requireSource(blob && blob.path === f.path, 'BACKUP_SOURCE_INCOMPLETE');
        const raw = decode(blob.base64);
        requireSource(raw.length === f.size && await hash(raw) === f.sha256,
          'BACKUP_SOURCE_BYTE_MISMATCH');
        if (f.path === 'main.pjs' || f.path === 'index.html') {
          try {
            const text = new TextDecoder('utf-8', {fatal: true}).decode(raw);
            requireSource(enc.encode(text).length === raw.length,
              'BACKUP_SOURCE_TEXT_INVALID');
          } catch { throw Error('BACKUP_SOURCE_TEXT_INVALID'); }
        }
        const prior = seen.get(f.sha256);
        if (prior === undefined) {seen.set(f.sha256, raw.length); uniqueBytes += raw.length;}
        else requireSource(prior === raw.length, 'BACKUP_SOURCE_HASH_COLLISION');
        referencedBytes += raw.length;
        referenceCount++;
        manifest.push([f.path, f.size, f.sha256]);
      }
      requireSource(byPath.size === source.files.length &&
        manifest.some(f => f[0] === 'main.pjs') &&
        manifest.some(f => f[0] === 'index.html'),
        'BACKUP_SOURCE_INCOMPLETE');
      // Two previously shipped fingerprint domains; never rewrite legacy hashes.
      const records = manifest.map(f => JSON.stringify(f)).join('\n');
      const domains = ['PCMS_STAGED_SOURCE_V1\n', 'PCMS_ORIGINAL_V1\n'];
      let matches = false;
      for (const domain of domains) {
        if (await hash(enc.encode(domain + records)) === source.fingerprint) {
          matches = true; break;
        }
      }
      requireSource(matches, 'BACKUP_SOURCE_FINGERPRINT_MISMATCH');
      manifests++;
    }
  }
  return Object.freeze({manifests, references:referenceCount, uniqueBlobs: seen.size,
    uniqueBytes, referencedBytes, status: 'SOURCE_BYTES_AUDITED_NOT_DISK_VERIFIED'});
}
function referencesOf(row) {return references(row);}
