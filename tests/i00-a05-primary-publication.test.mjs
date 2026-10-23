import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {validateReleaseMessage} from '../src/runtime/release-boundary.mjs';

// RED reproduction: on merged A04, the PRIMARY review drawer only records
// APPROVE. It offers no dispatch/reconciliation action; the old hidden
// controller cannot complete the accepted operator journey.
test('A05 primary exact-candidate review has an actual dispatch and read-only reconciliation path',async()=>{
  const code=await readFile('src/ui/faithful/bridge.mjs','utf8');
  const start=code.indexOf('async function openReleaseReview(');
  const end=code.indexOf('// An operation inspector',start);
  assert.ok(start>=0&&end>start,'production primary review must exist');
  const drawer=code.slice(start,end);
  assert.match(drawer,/readPort\('pcms-i13-release','APPROVE'/);
  assert.match(drawer,/readPort\('pcms-i13-release','DISPATCH'/,
    'approval alone is not publication; the primary UI must dispatch after separate operator consent');
  assert.match(drawer,/readPort\('pcms-i13-release','RECONCILE'/,
    'lost ACK and possible effects must be read back, not replayed');
  assert.match(drawer,/readPort\('pcms-i13-release','GET'/,
    'cold review/re-entry must use canonical persisted release state');
});

// Another reproduced incompatibility: the release boundary uses a PCMS
// native vault even though A03 established background-owned Git credentials.
test('A05 approval and publication have no PCMS native credential or password prerequisite',async()=>{
  const boundary=await readFile('src/runtime/release-boundary.mjs','utf8');
  assert.doesNotMatch(boundary,/sendNativeMessage\('local\.pcms\.backup_vault'/);
  assert.doesNotMatch(boundary,/reviewPassphrase\(/);
  assert.doesNotMatch(boundary,/passphrase:await reviewPassphrase/);
  const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p}};
  const sender={id:'fixture',url:'moz-extension://fixture/pcms/index.html'};
  const valid={type:'PREVIEW',params:{slug:'test-generator'}};
  assert.equal(validateReleaseMessage(api,sender,valid).ok,true);
  assert.equal(validateReleaseMessage(api,sender,{
    type:'PREVIEW',params:{slug:'test-generator',passphrase:'unexpected-password'}
  }).ok,false,'a password must not be a live release-port input');
});

test('A05 autonomous public READY continuation requires no PCMS vault or recovery password',async()=>{
  const code=await readFile('src/runtime/ready-development.mjs','utf8');
  assert.doesNotMatch(code,/sendNativeMessage\('local\.pcms\.backup_vault'/);
  assert.doesNotMatch(code,/vault\.passphrase/);
  assert.doesNotMatch(code,/S05_RECOVERY_SECRET_SERVICE_UNAVAILABLE/);
  assert.match(code,/b\.existing\.runTrusted/);
});
