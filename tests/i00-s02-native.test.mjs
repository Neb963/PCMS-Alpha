// S02: execute the native candidate's actual Python tests from the ordinary
// required fast lane, not a mock or test-only substitute.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
test('S02 native AES-GCM candidate independently tests actual checked-in module', () => {
  const result = spawnSync('python3', [
    '-m', 'unittest', 'discover', '-s', 'native/tests',
    '-p', 'test_backup_stream_v2.py', '-v'
  ], {cwd: root, encoding: 'utf8', timeout: 60_000, maxBuffer: 2 * 1024 * 1024});
  assert.equal(result.error, undefined, 'native test interpreter must run');
  assert.equal(result.status, 0, [
    'S02 native tests are mandatory; missing maintained cryptography dependency',
    'or failed independent disk/inventory checks is NOT a PASS.',
    result.stderr?.slice(-1500), result.stdout?.slice(-500)
  ].join('\n'));
  assert.match(result.stderr, /Ran 11 tests in /);
  assert.match(result.stderr, /\nOK\n/);
});
