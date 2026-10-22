/**
 * Deliberately RED on the R4 baseline. Run separately from required tests:
 *   node --test tests/a01-red-baseline.test.mjs
 * These assertions specify accepted product behavior, NOT legacy R4 behavior.
 * A02–A08 should make them green as corresponding behavior migrates.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGitCredentialResolver} from '../src/runtime/git-credential.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');

test('A01_RED_P0_GIT_NO_NATIVE_VAULT: stored credential resolves without OS host',async()=>{
  let nativeCalls=0;
  const api={storage:{local:{get:async()=>({pcmsS03Git:{repositoryId:'123456',repository:'Neb963/per-gens'}})}},
    runtime:{sendNativeMessage:async()=>{nativeCalls++;throw Error('UNREGISTERED');}}};
  const result=await createGitCredentialResolver(api)();
  assert.equal(nativeCalls,0,'normal Git authorization must not call a PCMS native host');
  assert.equal(result.ok,true,'browser-local credential must work without vault');
});

test('A01_RED_P0_BACKUP_PASSWORDLESS: donor backup cannot require password',async()=>{
  const source=await read('donor/personamonkey/extension/options/data-management.js');
  assert.doesNotMatch(source,/\b(?:backupPassword|password|passphrase|encryptBackup|decryptBackup)\b/i,
    'combined XPI still bundles a password/encryption backup flow');
});

test('A01_RED_P0_NO_EXTRA_HOSTS: operator package has no PCMS native helpers',async()=>{
  const source=await read('scripts/build-operator-package.mjs');
  assert.doesNotMatch(source,/backup_vault_host|backup_v2_host|s08_isolated_browser_host|pcms_witness/,
    'operator package still distributes forbidden PCMS helpers/witness');
});

test('A01_RED_P0_PRIMARY_UI_DIRECT: routine controls do not depend on hidden old UI',async()=>{
  const source=await read('src/ui/faithful/bridge.mjs');
  assert.doesNotMatch(source,/function nativeAction\(|pcms-native-open|nativeControl\(/,
    'main UI still delegates workflow controls to legacy hidden DOM');
});

test('A01_RED_P0_PUBLISH_DISPATCH: approve exact candidate actually dispatches publication',async()=>{
  const source=await read('src/ui/faithful/bridge.mjs');
  assert.doesNotMatch(source,/does not itself publish/,
    'primary publication flow explicitly admits the ACK does not publish');
});

test('A01_RED_P0_CLOCK_NATIVE_FREE: Refresher does not depend on native clock witness',async()=>{
  const source=await read('src/runtime/refresher-qualified-clock.mjs');
  assert.doesNotMatch(source,/nativeClock|witness|bootId|monotonic/i,
    'old qualified-clock module still references native clock evidence');
});
