import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
test('R4 installer remains historical source, but A08 operator distribution is XPI-only',async()=>{
  const historical=await read('packaging/install.sh');
  assert.match(historical,/persona-route-manager@local/);
  const live=await read('scripts/build-operator-package.mjs');
  assert.doesNotMatch(live,/install\.sh|pcms-native-check|backup_vault_host|backup_v2_host|pcms_witness/);
  const workflow=await read('.github/workflows/required.yml');
  assert.doesNotMatch(workflow,/Upload matching OS native host installer/);
  assert.match(workflow,/Upload exact combined XPI/);
});
