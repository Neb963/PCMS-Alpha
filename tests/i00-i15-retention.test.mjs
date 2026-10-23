import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyAuto,archiveFromDownload,selectRetention} from '../src/runtime/backup-auto-core.mjs';
import {makeRetention} from '../src/runtime/backup-auto-retention.mjs';
const run=n=>'auto_'+n.toString(16).padStart(32,'0');
const file=n=>({id:n,filename:'/fixture/Downloads/pcms-backups/pcms-alpha-'+run(n)+'.encrypted',
  state:'complete',exists:true,fileSize:88});
const archive=n=>archiveFromDownload(run(n),n,'a'.repeat(64),88,file(n));
function fixture(rows){
  let state={...emptyAuto(),enabled:true,archives:rows};
  const store={
    async read(){return {ok:true,state:structuredClone(state)};},
    async edit(reduce){
      const copy=structuredClone(state),output=reduce(copy);
      if(output.state)state=output.state;
      return output.response;
    },
    state(){return structuredClone(state);}
  };
  const actual=new Map(Array.from({length:20},(_,i)=>[i+1,file(i+1)]));
  const removed=[],erased=[];
  const downloads={
    async search({id}){return actual.has(id)?[structuredClone(actual.get(id))]:[];},
    async removeFile(id){removed.push(id);const entry=actual.get(id);
      if(entry)entry.exists=false;},
    async erase(id){erased.push(id);}
  };
  return {store,actual,removed,erased,downloads};
}
test('P55-06: 16 proven automatic vs manual/untracked, keep newest 14, delete 2 by exact ID only',async()=>{
  const env=fixture(Array.from({length:16},(_,i)=>archive(i+1)));
  const history={manual:file(17),untracked:file(18),changed:file(19),interrupted:file(20)};
  // Manual and unrelated files exist in Downloads but not the automatic ledger.
  for(const row of Object.values(history))env.actual.set(row.id,row);
  const done=await makeRetention(env.store,env.downloads).prune();
  assert.equal(done.ok,true);
  assert.deepEqual(env.removed,[1,2]);
  assert.equal(env.erased.length,0);
  assert.ok([17,18,19,20].every(i=>env.actual.get(i).exists===true));
  assert.equal(env.store.state().archives.filter(r=>r.state==='COMPLETE').length,14);
  assert.equal(selectRetention(env.store.state().archives).length,0);
});
test('P55-06: moved file, incomplete browser history and size change all hold without removeFile',async()=>{
  for(const mutation of [row=>{row.filename='/tmp/moved.encrypted';},
    row=>{row.fileSize=89;},
    row=>{row.exists=false;},
    row=>{row.state='interrupted';}]){
    const env=fixture(Array.from({length:16},(_,i)=>archive(i+1)));
    mutation(env.actual.get(1));
    const result=await makeRetention(env.store,env.downloads).prune();
    assert.equal(result.code,'RETENTION_INCOMPLETE');
    assert.deepEqual(env.removed,[]);
    assert.equal(env.store.state().archives[0].state,
      env.actual.get(1).exists===false?'REMOVED':'DELETE_HELD');
    assert.equal(env.actual.get(2).exists,true);
  }
  const missing=fixture(Array.from({length:16},(_,i)=>archive(i+1)));
  missing.actual.delete(1);
  assert.equal((await makeRetention(missing.store,missing.downloads).prune()).code,
    'RETENTION_INCOMPLETE');
  assert.deepEqual(missing.removed,[]);
});
test('P55-06: crash after possible remove or lost ACK never repeats delete on recovery',async()=>{
  const env=fixture(Array.from({length:16},(_,i)=>archive(i+1)));
  env.downloads.removeFile=async id=>{
    env.removed.push(id);env.actual.get(id).exists=false;
    throw Error('LOST_ACK_AFTER_EFFECT');
  };
  const retention=makeRetention(env.store,env.downloads);
  const first=await retention.prune();
  assert.equal(first.code,'RETENTION_INCOMPLETE');
  assert.deepEqual(env.removed,[1]);
  assert.equal(env.store.state().archives[0].state,'REMOVED');
  await retention.recover();
  assert.deepEqual(env.removed,[1]);
  // Replayed claim after crash with an unknown file must hold not delete.
  const possible=fixture(Array.from({length:16},(_,i)=>archive(i+1)));
  possible.store.state().archives[0].state='COMPLETE';
  await possible.store.edit(s=>{s.archives[0].state='DELETION_POSSIBLE';
    return {state:s,response:{ok:true}};});
  await makeRetention(possible.store,possible.downloads).recover();
  assert.equal(possible.store.state().archives[0].state,'DELETE_HELD');
  assert.deepEqual(possible.removed,[]);
});

test('A02: new plaintext daily archives rotate at 14 without deleting manual/untracked',async()=>{
  const portable=n=>({id:n,filename:'/fixture/Downloads/pcms-backups/pcms-alpha-'+run(n)+'.pcms.jsonl',
    state:'complete',exists:true,fileSize:88});
  const owned=Array.from({length:16},(_,i)=>archiveFromDownload(
    run(i+1),i+1,'a'.repeat(64),88,portable(i+1)));
  assert.ok(owned.every(Boolean),'all portable filenames must satisfy exact ownership');
  const env=fixture(owned);
  for(let n=1;n<=16;n++)env.actual.set(n,portable(n));
  env.actual.set(17,{...portable(17),filename:'/tmp/other/pcms-alpha-'+run(17)+'.pcms.jsonl'});
  env.actual.set(18,{...portable(18),filename:'/fixture/Downloads/pcms-backups/pcms-alpha-manual_'+
    '1'.repeat(32)+'.pcms.jsonl'});
  const result=await makeRetention(env.store,env.downloads).prune();
  assert.equal(result.ok,true);
  assert.deepEqual(env.removed,[1,2]);
  assert.equal(env.store.state().archives.filter(r=>r.state==='COMPLETE').length,14);
  assert.equal(env.actual.get(17).exists,true);
  assert.equal(env.actual.get(18).exists,true);
  assert.equal(env.erased.length,0);
});
