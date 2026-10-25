import test from 'node:test';
import assert from 'node:assert/strict';
import {checkpointed,trackPcmsWork,settlePcmsWork} from '../src/runtime/work-checkpoint.mjs';
test('J06 drain includes detached children registered before parent completion',async()=>{
 let release,childRelease,entered;
 const ready=new Promise(r=>entered=r),parent=new Promise(r=>release=r);
 trackPcmsWork(parent.then(()=>{trackPcmsWork(new Promise(r=>childRelease=r));entered()}));
 let done=false;const drained=settlePcmsWork().then(()=>{done=true});
 release();await ready;await Promise.resolve();assert.equal(done,false);
 childRelease();await drained;assert.equal(done,true);
});
test('J06 bounded unresolved local work remains held instead of claiming quiescence',async()=>{
 let release;trackPcmsWork(new Promise(r=>release=r));
 await assert.rejects(()=>settlePcmsWork({timeoutMs:5}),/RESTORE_LOCAL_WORK_BUSY/);
 release();await settlePcmsWork();
});
test('J06 preparation blocks new writers while explicitly classified pure queries work',async()=>{
 let effects=0;const data={pcmsRestoreInProgress:{active:true,status:'PREPARING'}};
 const api={storage:{local:{get:async k=>({[k]:data[k]})}}};
 const run=checkpointed(api,async m=>{effects++;return {ok:true,value:m.type}},
 {allowDuringRestore:m=>m.type==='GET'});
 assert.equal((await run({type:'WRITE'})).code,'RESTORE_HOLD');assert.equal(effects,0);
 assert.equal((await run({type:'GET'})).value,'GET');assert.equal(effects,1);
 delete data.pcmsRestoreInProgress;assert.equal((await run({type:'WRITE'})).ok,true);
 await settlePcmsWork();
});
