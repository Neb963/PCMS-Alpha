import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReadyWitness,planReadyObservation,planReadyHandoff} from '../src/runtime/ready-planner.mjs';
import {createReadyStore} from '../src/runtime/ready-store.mjs';
import {fakeDatabase} from './fake-idb.mjs';
const admissible={source:'TRUSTED_S05_ADMISSION_BOUNDARY',
 accountOwnerVerified:true,protectedRouteReady:true,
 completeRecoverableBaseline:true,humanEditorClean:true,noUncertainWriter:true,
 writerIdle:true,nativeIdle:true,providerEffectResolved:true,
 approvalEffectResolved:true};
const w=(id,slug='safe-slug',fingerprint='a'.repeat(64))=>({
 repositoryId:'1411034835',slug,identifier:'rev-'+id,
 declarationCommit:'1'.repeat(40),markerOid:'2'.repeat(40),
 inputFingerprint:fingerprint,testingOid:null
});
test('S05 pure READY planner refuses recycled tokens and retains active writer',()=>{
 const first=planReadyObservation(null,w('rev00001'));
 assert.equal(first.code,'READY_QUEUED');
 assert.equal(planReadyObservation(first.next,w('rev00001')).changed,false);
 assert.equal(planReadyObservation(first.next,w('rev00001','safe-slug','b'.repeat(64))).code,
   'READY_REVISION_REUSED_WITH_DIFFERENT_SOURCE');
 assert.equal(planReadyHandoff(first.next,1,null).code,'READY_ADMISSION_UNVERIFIED');
 const active=planReadyHandoff(first.next,1,admissible);
 assert.equal(active.ok,true);
 const second=planReadyObservation(active.next,w('rev00002'));
 assert.equal(second.code,'READY_SUCCESSOR_PENDING');
 assert.equal(planReadyHandoff(second.next,second.next.revision,{...admissible,nativeIdle:false}).code,
   'SOURCE_HANDOFF_UNVERIFIED');
 const proof={...admissible};
 const admitted=planReadyHandoff(second.next,second.next.revision,proof);
 assert.equal(admitted.next.active.identifier,'rev-rev00002');
 assert.equal(admitted.retired.identifier,'rev-rev00001');
 assert.equal(planReadyHandoff(second.next,1,proof).code,'STALE_REVISION');
 assert.equal(normalizeReadyWitness({...w('rev00001'),markerOid:'invalid'}).ok,false);
});
test('S05 canonical persistence deduplicates and cannot bypass conflicting READY',async()=>{
 const db=fakeDatabase(),s=createReadyStore(db);
 assert.equal((await s.observe(w('rev00001'))).code,'READY_QUEUED');
 assert.equal((await s.observe(w('rev00001'))).changed,false);
 assert.equal((await s.observe(w('rev00001','safe-slug','b'.repeat(64)))).code,
   'READY_REVISION_REUSED_WITH_DIFFERENT_SOURCE');
 assert.equal(db.keys('events').length,1);
 assert.equal((await s.handoff('safe-slug',1,null)).code,'READY_ADMISSION_UNVERIFIED');
 const a=await s.handoff('safe-slug',1,admissible);
 assert.equal(a.code,'READY_ADMITTED_LOCAL_ONLY');
 const b=await s.observe(w('rev00002'));
 assert.equal(b.code,'READY_SUCCESSOR_PENDING');
 assert.equal((await createReadyStore(db).handoff('safe-slug',b.record.revision,{...admissible,nativeIdle:false})).code,
   'SOURCE_HANDOFF_UNVERIFIED');
 assert.equal((await s.get('safe-slug')).record.active.identifier,'rev-rev00001');
});
test('S05 aborted IDB write makes no READY intent or event',async()=>{
 const db=fakeDatabase(),s=createReadyStore(db);
 db.failNextCommit();
 await assert.rejects(s.observe(w('rev00001')),/READY_DB_ABORTED/);
 assert.equal(db.keys('meta').length,0);assert.equal(db.keys('events').length,0);
});
test('S05 queue enumerates >200 independently committed generators in pages',async()=>{
 const db=fakeDatabase(),s=createReadyStore(db);
 for(let i=0;i<225;i++)await s.observe(w('rev00001','safe-'+String(i).padStart(4,'0')));
 const a=await s.list({limit:100});
 const b=await s.list({after:a.nextCursor,limit:100});
 const c=await s.list({after:b.nextCursor,limit:100});
 assert.equal(a.items.length,100);assert.equal(b.items.length,100);
 assert.equal(c.items.length,25);assert.equal(c.more,false);
 assert.equal(new Set([...a.items,...b.items,...c.items].map(x=>x.slug)).size,225);
});
test('S05 previously consumed READY cannot be resurrected by Git main rollback',async()=>{
 const db=fakeDatabase(),s=createReadyStore(db),a=w('rev00001'),b=w('rev00002');
 assert.equal((await s.observe(a)).code,'READY_QUEUED');
 assert.equal((await s.observe(b)).code,'READY_QUEUED');
 const before=db.keys('events').length;
 const rollback=await s.observe(a);
 assert.equal(rollback.code,'READY_PREVIOUSLY_CONSUMED');
 assert.equal(rollback.changed,false);
 assert.equal((await s.get('safe-slug')).record.desired.identifier,'rev-rev00002');
 assert.equal(db.keys('events').length,before);
 const abuse=await s.observe({...a,inputFingerprint:'b'.repeat(64)});
 assert.equal(abuse.code,'READY_REVISION_REUSED_WITH_DIFFERENT_SOURCE');
 assert.equal(db.keys('events').length,before);
});

test('S05 explicit NOT_READY makes prior local handoff inadmissible and preserves history',async()=>{
 const db=fakeDatabase(),s=createReadyStore(db),a=w('rev00001');
 assert.equal((await s.observe(a)).ok,true);
 const revoked=await s.holdNotReady({slug:a.slug,repositoryId:a.repositoryId,
   head:'c'.repeat(40)});
 assert.equal(revoked.code,'READY_REVOKED_NOT_READY');
 assert.equal(revoked.record.revision,2);
 assert.equal((await s.handoff(a.slug,2,admissible)).code,'READY_REVOKED_NOT_READY');
 assert.equal((await s.observe(a)).changed,false);
 assert.equal((await s.get(a.slug)).record.hold,'READY_REVOKED_NOT_READY');
 assert.equal((await s.observe(w('rev00002'))).changed,true);
 assert.equal((await s.get(a.slug)).record.hold,null);
});

test('S05 operator pause persists, fences stage admission, and resumes exact newer Git witness',async()=>{
 const db=fakeDatabase(),queue=createReadyStore(db);
 const first=w('rev00001'),second=w('rev00002','safe-slug','c'.repeat(64));
 assert.equal((await queue.observe(first)).revision,undefined);
 const pause=await queue.pause(first.slug,1);
 assert.equal(pause.code,'READY_OPERATOR_PAUSED',JSON.stringify(pause));
 assert.equal(pause.record.revision,2);
 assert.equal((await queue.handoff(first.slug,2,admissible)).code,
   'READY_OPERATOR_PAUSED');
 const observed=await queue.observe(second);
 assert.equal(observed.ok,true);
 assert.equal(observed.record.hold,'OPERATOR_PAUSED',
   'new main declaration cannot silently lift manual pause');
 assert.equal((await queue.resume(first.slug,2,{
   identifier:second.identifier,inputFingerprint:second.inputFingerprint})).code,
   'STALE_REVISION');
 assert.equal((await queue.resume(first.slug,3,{
   identifier:first.identifier,inputFingerprint:first.inputFingerprint})).code,
   'READY_RESUME_CANDIDATE_CHANGED');
 const resumed=await queue.resume(first.slug,3,{
   identifier:second.identifier,inputFingerprint:second.inputFingerprint});
 assert.equal(resumed.code,'READY_OPERATOR_RESUMED',JSON.stringify(resumed));
 assert.equal(resumed.record.hold,null);
 assert.equal((await queue.handoff(first.slug,4,admissible)).ok,true);
 assert.equal((await queue.get(first.slug)).record.active.identifier,
   second.identifier);
 assert.equal(db.keys('events').length,5);
});
test('S05 an already running READY may be locally paused without declaring native Stop',async()=>{
 const db=fakeDatabase(),q=createReadyStore(db),first=w('rev00001');
 await q.observe(first);await q.handoff(first.slug,1,admissible);
 const paused=await q.pause(first.slug,2);
 assert.equal(paused.record.active.identifier,first.identifier);
 assert.equal(paused.record.hold,'OPERATOR_PAUSED');
 assert.equal((await q.handoff(first.slug,3,admissible)).code,'READY_NOT_QUEUED');
 assert.equal((await q.pause(first.slug,3)).changed,false);
});
