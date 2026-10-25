import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

// A07 pre-repair oracle: the primary dashboard must be capable of completing
// routine workflows without clicking a hidden pre-v0.1.6 DOM controller.
const primary=await readFile(new URL('../src/ui/faithful/bridge.mjs',import.meta.url),'utf8');
const section=(start,end)=>primary.slice(primary.indexOf(start),primary.indexOf(end,primary.indexOf(start)));
test('A07 primary backups call the live browser-native backup coordinator',async()=>{
  const s=await readFile(new URL('../src/ui/faithful/backup-workspace.mjs',import.meta.url),'utf8');
  assert.doesNotMatch(s,/Encrypted source-complete|RUN_V2_MANUAL|SAVE_KEY|STORE_KEY|OS vault|recovery passphrase/i);
  assert.match(s,/MANUAL/);
  assert.match(s,/RUN_NOW/);
  assert.match(s,/STATUS/);
});
test('A07 primary portable restore never delegates to hidden legacy DOM',()=>{
  const s=section('function primaryRestore(container){','function primaryBackups(container){');
  assert.doesNotMatch(s,/nativeControl\(|\.click\(\)|passphrase|encrypted archive/i);
  assert.match(s,/mountPortableRestore|preparePortableStage/);
});
test('A07 primary diagnostics and advanced settings are direct, not legacy buttons',()=>{
  const s=section('function primaryDiagnostics(container){','function renderSettingsSection(){');
  assert.doesNotMatch(s,/nativeControl\(|copyToNative|local\.pcms\./);
  assert.doesNotMatch(primary,/Open protected recovery controls/);
});
