import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
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
test('exact donor pin is recorded with unmodified submodule provenance', async()=>{
  assert.match(await readFile('.gitmodules','utf8'),/Neb963\/persona-router\.git/);
  assert.match(await readFile('docs/implementation/DONOR-PROVENANCE.md','utf8'),new RegExp(pin));
});
