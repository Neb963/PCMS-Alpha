// S02 actual native fixed-purpose host exercised in disposable filesystem CI.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('S02 host effects and lost ACK are observable independent of its in-memory context',()=>{
  const run=spawnSync('python3',['-m','unittest','discover','-s','native/tests',
    '-p','test_backup_v2_host.py','-v'],{cwd:root,encoding:'utf8',
    timeout:240000,maxBuffer:2*1024*1024});
  assert.equal(run.error,undefined);
  assert.equal(run.status,0,run.stderr?.slice(-3000));
  assert.match(run.stderr,/Ran 27 tests in /);
  assert.match(run.stderr,/test_durable_entropy_pair_fence_after_success_and_host_restart .* \.\.\. ok/);
  assert.match(run.stderr,/test_abandoned_context_and_retained_reservation_deny_reuse .* \.\.\. ok/);
  assert.match(run.stderr,/\nOK\n/);
});
