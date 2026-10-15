import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('P54-09 / P56-03 F/X: real procfs measurement parser is exercised with independent positive and adverse fixture',()=>{
  const result=spawnSync('python3',['-m','unittest','discover',
    '-s','tests','-p','test_i17_firefox_resource.py'],{
    encoding:'utf8',timeout:10000,maxBuffer:120000});
  assert.equal(result.error,undefined,result.error?.message);
  assert.equal(result.status,0,
    'Python process accounting oracle failed: '+String(result.stderr||'').slice(0,3000));
  assert.match(result.stderr,/Ran 2 tests/);
  assert.match(result.stderr,/OK/);
});
