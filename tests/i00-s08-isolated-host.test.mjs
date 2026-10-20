import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
function call(packet){
 const body=Buffer.from(JSON.stringify(packet)),frame=Buffer.alloc(4+body.length);
 frame.writeUInt32LE(body.length);body.copy(frame,4);
 const run=spawnSync('python3',['native/s08_isolated_browser_host.py'],{
   input:frame,timeout:7000});
 assert.equal(run.status,0);
 assert.ok(run.stdout.length>=4);
 return JSON.parse(run.stdout.subarray(4,4+run.stdout.readUInt32LE(0)).toString());
}
test('S08 native isolation host refuses arbitrary commands and paths without process effects',()=>{
 for(const payload of [{action:'RUN_ISOLATED_BROWSER',expectedSha256:'0'.repeat(64),path:'/tmp'},
   {action:'EXEC',command:'firefox'},
   {action:'RUN_ISOLATED_BROWSER',expectedSha256:'not-a-digest'}])
   assert.equal(call(payload).code,'DIAGNOSTIC_REQUEST_DENIED');
});
test('S08 absent/mismatched full candidate cannot launch a browser',()=>{
 const out=call({action:'RUN_ISOLATED_BROWSER',expectedSha256:'0'.repeat(64)});
 assert.equal(out.ok,false);
 assert.ok(['ISOLATED_XPI_BUILD_REQUIRED','XPI_DIGEST_MISMATCH'].includes(out.code),out.code);
});
