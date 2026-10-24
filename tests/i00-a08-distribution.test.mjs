import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

// Red on the A07-merged baseline: the required workflow still builds,
// uploads and recommends a PCMS native-host/operator tarball.
test('A08 required release channel distributes the enabled XPI only',async()=>{
  const workflow=await read('.github/workflows/required.yml');
  assert.match(workflow,/Upload exact combined XPI/);
  assert.match(workflow,/Persistent installed-XPI Firefox B smoke/);
  assert.doesNotMatch(workflow,/build-operator-package|pcms-alpha-operator|OS native host installer|native host package/i);
  assert.doesNotMatch(workflow,/install-s08-local-hosts|s02-ci-native-host|native-clock-witness/i);
});
test('A08 production packaging cannot create a second native service',async()=>{
  const code=await read('scripts/build-operator-package.mjs');
  assert.doesNotMatch(code,/backup_vault_host|backup_v2_host|s08_isolated_browser_host|pcms_witness|build-s01-native|pcms-native-check|install\.sh/);
  assert.match(code,/buildI00/);
});
test('A08 operator instructions contain no superseded host, vault or backup requirement',async()=>{
  const guide=await read('docs/operator/OPERATOR-GUIDE.md');
  assert.doesNotMatch(guide,/--with-runtime-witness|local\.pcms\.|OS keyring|Secret Service|encrypted backup|backup passphrase|geckodriver if/i);
  assert.match(guide,/com\.persona\.mullvad_router/);
  assert.match(guide,/passwordless/i);
});
