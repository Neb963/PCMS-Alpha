import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyAuto,admission,dayAt,vaultResponse,archiveFromDownload,
  selectRetention,deletionProof,ownedFile,validAuto} from '../src/runtime/backup-auto-core.mjs';
const D=86400000;
const runId=n=>'auto_'+n.toString(16).padStart(32,'0');
const row=n=>({id:n,state:'complete',exists:true,fileSize:120,
  filename:'/home/fixture/Downloads/pcms-backups/pcms-alpha-auto_'+
    n.toString(16).padStart(32,'0')+'.encrypted'});
const archive=n=>archiveFromDownload(runId(n),n,'a'.repeat(64),120,row(n));
test('P55-04: daily durable admission, five-day catchup once, clock backwards, Pause independent',()=>{
  const s=emptyAuto();s.enabled=true;
  assert.equal(admission(s,16*D).ok,true);
  s.lastAttemptDay=11;s.lastSuccessDay=11;
  assert.equal(admission(s,16*D).catchUp,true);
  s.active={runId:runId(1),status:'PREPARING',day:16,startedAt:16*D};
  assert.equal(admission(s,16*D).code,'BACKUP_INFLIGHT_OR_UNCERTAIN');
  s.active=null;s.lastSuccessDay=16;
  assert.equal(admission(s,16*D).code,'BACKUP_ALREADY_DONE');
  assert.equal(admission(s,15*D).code,'BACKUP_ALREADY_DONE');
  s.lastSuccessDay=11;s.nextAttemptAt=17*D;
  assert.equal(admission(s,16*D).code,'BACKUP_COOLDOWN');
  s.nextAttemptAt=0;s.globalPause=true;
  assert.equal(admission(s,16*D).ok,true);
  assert.equal(dayAt(16*D+32),16);
});
test('P55-03: locked/missing/wrong-host/native extra fields cannot authorize secret',()=>{
  for(const native of [null,{}, {ok:false,code:'LOCKED'},{ok:false,code:'MISSING'},
    {ok:true,passphrase:'short'}, {ok:true,passphrase:'valid-long-secret',route:'direct'},
    {ok:true,passphrase:'a'.repeat(4097)}]){
    const v=vaultResponse(native);assert.equal(v.ok,false);
    assert.equal(Object.hasOwn(v,'passphrase'),false);
  }
  assert.equal(vaultResponse({ok:true,passphrase:'portable-recovery-known-by-operator'}).ok,true);
});
test('P55-06: retain 14 tracked verified automatic, never manual/untracked/moved',()=>{
  const list=Array.from({length:16},(_,i)=>archive(i+1));
  const manual={...archive(18),runId:runId(18),kind:'MANUAL'};
  assert.equal(ownedFile(row(3)),true);
  assert.equal(ownedFile({...row(3),filename:'/tmp/fake.encrypted'}),false);
  assert.equal(archiveFromDownload(runId(1),1,'a'.repeat(64),120,{...row(1),state:'in_progress'}),null);
  assert.deepEqual(selectRetention(list).map(x=>x.runId),[runId(1),runId(2)]);
  assert.equal(selectRetention(list.slice(0,14)).length,0);
  const candidates=selectRetention([...list,{...manual,state:'REMOVED'}]);
  assert.equal(candidates.length,2);
  assert.equal(validAuto({...emptyAuto(),archives:list}),true);
  const candidate={...candidates[0],state:'DELETION_POSSIBLE'};
  assert.equal(deletionProof(candidate,row(candidate.downloadId)).ok,true);
  for(const change of [{exists:false},{fileSize:10},{id:900},
    {filename:'/tmp/changed.encrypted'}, {state:'interrupted'}]){
    assert.equal(deletionProof(candidate,{...row(candidate.downloadId),...change}).ok,false);
  }
  assert.equal(deletionProof({...candidate,state:'DELETE_HELD'},row(candidate.downloadId)).ok,false);
  assert.equal(selectRetention([...list,{...list[0],runId:runId(99)}]).some(a=>a.downloadId===1),false);
});
