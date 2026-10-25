import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile, readdir, cp, mkdtemp, writeFile, rm, unlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { verifyDonor, DONOR_COMMIT, DONOR_TREE } from '../scripts/verify-donor.mjs';
import path from 'node:path';
import { buildI00 } from '../scripts/build-i00.mjs';
const pin='9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf';
const critical=['lib/recovery-bootstrap.js','lib/routing-gate.js','lib/mullvad-native.js','content/userscript-trigger.js'];
const sha=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
test('combined XPI preserves guarded donor bytes and opens the full dashboard rather than donor popup',async t=>{
  const buildDirectory=await mkdtemp(path.join(tmpdir(),'pcms-build-test-'));
  t.after(()=>rm(buildDirectory,{recursive:true,force:true}));
  const {original,combined,stage}=await buildI00({packageArchive:false,buildDirectory});
  for(const key of ['permissions','optional_permissions','host_permissions','content_scripts','browser_specific_settings'])
    assert.deepEqual(combined[key],original[key],`donor ${key} was modified`);
  assert.deepEqual(combined.action.default_icon,original.action.default_icon);
  assert.equal(combined.action.default_title,'Open PCMS dashboard');
  assert.equal(Object.hasOwn(combined.action,'default_popup'),false);
  assert.equal(combined.browser_specific_settings.gecko.id,'persona-route-manager@local');
  assert.equal(original.version,'1.2.0','never rewrite donor manifest version');
  assert.equal(combined.version,'1.2.12','installed PCMS UI must advance the existing v1.2.1 extension');
  assert.deepEqual(combined.background,{scripts:['pcms/entry.mjs'],type:'module'});
  const entry=await readFile(path.join(stage,'pcms/entry.mjs'),'utf8');
  assert.match(entry,/import '\.\.\/lib\/recovery-bootstrap\.js'/);
  assert.match(entry,/import '\.\/wake\.mjs'/);
  assert.match(entry,/import '\.\/dashboard-action\.mjs'/);
  assert.match(await readFile(path.join(stage,'background.js'),'utf8'),/attachPcmsGuard/);
  assert.match(await readFile(path.join(stage,'lib/management-integration.js'),'utf8'),/pcmsGuard: Object\.freeze/);
  assert.equal(combined.options_ui.page,'pcms/index.html');
  for(const p of critical) assert.equal(await sha(path.join(stage,p)),await sha(path.join('donor/personamonkey/extension',p)),p);
  assert.equal((await readdir(path.join(stage,'pcms'))).includes('shell.mjs'),true);
  // I10 module graph MUST be present in the packaged XPI, not only in Node's
  // repository import graph (a missing file kills the Firefox event page).
  for(const name of ['ai-boundary.mjs','ai-supervisor.mjs','ai-store.mjs',
    'perchance-ai-native.mjs','perchance-ai-oracle.mjs','ai-testing.mjs','perchance-ai-opfs.mjs','perchance-ai-history.mjs',
    'qualified-clock.mjs','pcms-donor-fence.mjs','route-pin.mjs','enrollment.mjs','network-ledger.mjs'])
    assert.equal((await readdir(path.join(stage,'pcms'))).includes(name),true,
      'Missing runtime module: '+name);
  await assert.rejects(()=>stat(path.join(stage,'tests')), {code:'ENOENT'});
  assert.equal((await readdir(path.join(stage,'lib'))).includes('routing-gate.js'),true);
});
test('donor pin is validated against all original blobs, modes and canonical tree',async()=>{
  const actual=await verifyDonor();
  assert.deepEqual(actual,{commit:pin,tree:'9d59d800c3a687b2e7360c64d9dd859d701d6ba5',files:223});
  assert.equal(DONOR_COMMIT,pin);
  assert.equal(DONOR_TREE,actual.tree);
  assert.match(await readFile('docs/implementation/DONOR-PROVENANCE.md','utf8'),new RegExp(pin));
});
test('donor verification detects tampered routing, missing and unexpected paths',async()=>{
  const temp=await mkdtemp(path.join(tmpdir(),'pcms-i00-negative-'));
  const dir=path.join(temp,'donor');
  try{
    await cp('donor/personamonkey',dir,{recursive:true});
    const target=path.join(dir,'extension/lib/routing-gate.js');
    const original=await readFile(target);
    await writeFile(target,Buffer.concat([original,Buffer.from('\\n// BAD_SOURCE\\n')]));
    await assert.rejects(()=>verifyDonor(dir),error=>error.message.includes('Donor blob mismatch: extension/lib/routing-gate.js'));
    await writeFile(target,original);
    const unexpected=path.join(dir,'additional-source.js');
    await writeFile(unexpected,'// unexpected');
    await assert.rejects(()=>verifyDonor(dir),/Donor inventory mismatch/);
    await unlink(unexpected);
    await unlink(target);
    await assert.rejects(()=>verifyDonor(dir),/Donor inventory mismatch/);
  }finally{await rm(temp,{recursive:true,force:true});}
});
