import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile, readdir, cp, mkdtemp, writeFile, rm, unlink, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { verifyDonor, DONOR_COMMIT, DONOR_TREE } from '../scripts/verify-donor.mjs';
import path from 'node:path';
import { buildI00 } from '../scripts/build-i00.mjs';
const pin='9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf';
const critical=['lib/recovery-bootstrap.js','lib/routing-gate.js','lib/management-integration.js','lib/mullvad-native.js','background.js','content/userscript-trigger.js'];
const sha=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
test('combined XPI preserves guarded donor bytes, manifest permissions and browser action',async()=>{
  const {original,combined,stage}=await buildI00({packageArchive:false});
  for(const key of ['permissions','optional_permissions','host_permissions','background','content_scripts','browser_specific_settings','action'])
    assert.deepEqual(combined[key],original[key],`donor ${key} was modified`);
  assert.equal(combined.browser_specific_settings.gecko.id,'persona-route-manager@local');
  assert.equal(combined.options_ui.page,'pcms/index.html');
  for(const p of critical) assert.equal(await sha(path.join(stage,p)),await sha(path.join('donor/personamonkey/extension',p)),p);
  assert.equal((await readdir(path.join(stage,'pcms'))).includes('shell.mjs'),true);
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
