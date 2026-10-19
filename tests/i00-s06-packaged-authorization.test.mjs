import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {validateReleaseMessage} from '../src/runtime/release-boundary.mjs';
const paths=['s06-output-proof.mjs','s06-review-queue.mjs',
  's06-writeback-progress.mjs','s06-request-changes.mjs'];
test('S06 combined-XPI production copy includes each new runtime module and one shared alarm',async()=>{
 const overlay=await readFile('src/runtime/overlay.mjs','utf8');
 const watcher=await readFile('src/runtime/catalog-watch.mjs','utf8');
 const release=await readFile('src/runtime/release-boundary.mjs','utf8');
 const html=await readFile('src/ui/index.html','utf8');
 for(const name of paths){
  assert.ok(overlay.includes("'"+name+"'"),'S06 module is packaged '+name);
  const r=spawnSync(process.execPath,['--check','src/runtime/'+name],{encoding:'utf8'});
  assert.equal(r.status,0,name+' '+r.stderr);
 }
 assert.match(watcher,/READY_PROGRESS_ALARM/);
 assert.match(watcher,/progressChanges:createS06ChangeProgress/);
 assert.match(watcher,/progressWriteback:createS06WritebackProgress/);
 assert.match(release,/createS06ChangeStore/);
 assert.match(html,/pcms-s06-change-instructions/);
 assert.match(html,/pcms-s06-review-queue/);
 assert.match(html,/pcms-s06-request-changes/);
 assert.equal(html.includes(String.raw`</script>\n  <script`),false,
   'HTML module imports must not leak escaped newline text into UI');
});
test('S06 Request Changes command denies forged authorization, source data and untrusted pages',()=>{
 const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p}},
  sender={id:'fixture',url:'moz-extension://fixture/pcms/index.html'},
  p={slug:'demo',expectedStageRevision:4,expectedJobRevision:7,
    sourceFingerprint:'a'.repeat(64),instructions:'Fix greeting and retest.'};
 const check=(params,from=sender)=>validateReleaseMessage(api,from,
   {type:'REQUEST_CHANGES',params});
 assert.equal(check(p).ok,true);
 assert.equal(check(p,{id:'outside',url:'https://perchance.org'}).ok,false);
 for(const extra of [
   {...p,source:{main:'forged'}},
   {...p,explicitApproval:true},
   {...p,expectedStageRevision:0},
   {...p,sourceFingerprint:'x'.repeat(64)},
   {...p,instructions:' '},
   {...p,instructions:'x'.repeat(4001)},
   {...p,token:'short'},
   {...p,releaseRevision:-1}
 ])assert.equal(check(extra).ok,false,JSON.stringify(extra).slice(0,150));
});
