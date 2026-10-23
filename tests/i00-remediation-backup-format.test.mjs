import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {mkdtemp,cp} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
// backup-auto-run imports UI-packaged modules; mirror the XPI pcms/ layout
// (runtime + ui flattened, donor lib alongside) in an isolated temp root.
const root=await mkdtemp(path.join(os.tmpdir(),'pcms-backup-format-'));
await cp('donor/personamonkey/extension/lib',path.join(root,'lib'),{recursive:true});
await cp('src/runtime',path.join(root,'pcms'),{recursive:true});
// The build overlays real UI primitives after resolving source-tree runtime aliases.
await cp('src/ui',path.join(root,'pcms'),{recursive:true});
const {createAutoRunner,operatorSelectedV2,BACKUP_FORMAT_KEY,FORMAT_GUARANTEE}=
  await import(pathToFileURL(path.join(root,'pcms','backup-auto-run.mjs')).href);
function apiFixture(){
  const local=new Map();
  return {local,api:{runtime:{id:'fixture'},downloads:{},storage:{local:{
    get:async k=>{const keys=Array.isArray(k)?k:[k];return Object.fromEntries(keys.filter(x=>local.has(x)).map(x=>[x,local.get(x)]));},
    set:async o=>{for(const [k,v] of Object.entries(o))local.set(k,v);},
    remove:async k=>{local.delete(k);}}}}};
}
test('backup format: v2 needs a working native host and vault before it is selected',async()=>{
  const {api,local}=apiFixture(),db=fakeDatabase();
  const runner=createAutoRunner(api,{open:async()=>db,reviewedV2:operatorSelectedV2(api),
    probeV2:async()=>{throw Error('host not installed');},
    native:async()=>({ok:true,passphrase:'x'.repeat(16)})});
  assert.equal((await runner.setFormat('V2')).code,'BACKUP_V2_HOST_UNAVAILABLE');
  assert.equal(local.has(BACKUP_FORMAT_KEY),false);
  const status=await runner.status();
  assert.equal(status.format,'V1');assert.equal(status.guarantee,FORMAT_GUARANTEE.V1);
});
test('backup format: explicit operator v2 setup persists; restore hold revokes it',async()=>{
  const {api,local}=apiFixture(),db=fakeDatabase();
  const runner=createAutoRunner(api,{open:async()=>db,reviewedV2:operatorSelectedV2(api),
    probeV2:async()=>({ok:true,state:'ADVISORY_ONLY'}),
    native:async()=>({ok:true,passphrase:'x'.repeat(16)})});
  const set=await runner.setFormat('V2');
  assert.equal(set.format,'V2');assert.equal(set.guarantee,FORMAT_GUARANTEE.V2);
  assert.equal(await operatorSelectedV2(api)(),true);
  local.set('pcmsRestoreInProgress',{runId:'r'});
  assert.equal(await operatorSelectedV2(api)(),false);
});
test('backup format: a failed source-complete run is held, never replaced by a v1 download',async()=>{
  const {api}=apiFixture(),db=fakeDatabase();let downloads=0;
  api.downloads={download:async()=>{downloads++;return 1;},search:async()=>[]};
  const runner=createAutoRunner(api,{open:async()=>db,reviewedV2:async()=>true,
    native:async()=>({ok:true,passphrase:'x'.repeat(16)}),
    captureV2:async()=>{throw Error('BACKUP_SOURCE_INCOMPLETE');},
    seal:async()=>{throw Error('v1 must not run');}});
  await runner.enable(true);
  const r=await runner.tick();
  assert.equal(r.ok,false);assert.equal(r.code,'BACKUP_SOURCE_INCOMPLETE');
  assert.equal(downloads,0);
});
