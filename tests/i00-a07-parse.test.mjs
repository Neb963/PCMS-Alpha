import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// A07: source-level tests can PASS while one static ES module cannot even
// parse, causing real Firefox to keep the hidden legacy fallback visible.
test('A07 all direct primary UI production modules parse as ESM',()=>{
 for(const rel of ['../src/ui/faithful/bridge.mjs',
   '../src/ui/restore-view.mjs',
   '../src/ui/s08-diagnostics.mjs',
   '../src/ui/faithful/portable-restore-template.mjs',
   '../src/ui/faithful/diagnostic-template.mjs']){
   const filename=fileURLToPath(new URL(rel,import.meta.url));
   assert.doesNotThrow(()=>execFileSync(process.execPath,['--check',filename],
     {encoding:'utf8',stdio:'pipe'}),'invalid production module '+rel);
 }
});
