import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createS06ReviewQueue,s06ReviewStatus} from '../src/runtime/s06-review-queue.mjs';
import {validateReleaseMessage} from '../src/runtime/release-boundary.mjs';
const F='a'.repeat(64),H='b'.repeat(64);
const name='s06-review-example';
test('S06 independently projected publication labels never turn unverified Git into READY',()=>{
 const denied=s06ReviewStatus({decision:{ok:false,code:'SOURCE_DRIFT'}});
 assert.deepEqual(denied,{state:'BLOCKED',code:'SOURCE_DRIFT'});
 assert.equal(s06ReviewStatus({decision:{ok:true,type:'PREPARE'}}).state,'WAITING_FOR_GIT');
 assert.equal(s06ReviewStatus({decision:{ok:true,type:'PREPARE',
   mode:'S06_EXCEPTION'},exception:{state:'RECORDED',stageRevision:4,
     sourceFingerprint:F},sourceFingerprint:F,stageRevision:4}).state,
   'EXCEPTION_HELD');
 assert.equal(s06ReviewStatus({decision:{ok:true,type:'REVIEW',
   mode:'S06_EXCEPTION',sourceFingerprint:F},
   exception:{state:'RECORDED',stageRevision:4,sourceFingerprint:F},
   sourceFingerprint:F,stageRevision:4}).state,
   'EXCEPTION_READY_FOR_REVIEW');
 assert.equal(s06ReviewStatus({decision:{ok:true,type:'REVIEW',
   mode:'S06_EXCEPTION',sourceFingerprint:F},
   exception:{state:'RECORDED',stageRevision:4,sourceFingerprint:F},
   release:{state:'APPROVED',approval:{sourceFingerprint:F}},
   sourceFingerprint:F,stageRevision:4}).state,'APPROVED');
 assert.equal(s06ReviewStatus({decision:{ok:true,type:'REVIEW',
   mode:'S06_EXCEPTION',sourceFingerprint:F},
   exception:{state:'RECORDED',stageRevision:4,sourceFingerprint:F},
   release:{state:'CONFIRMED_PUBLIC',approval:{sourceFingerprint:F}},
   sourceFingerprint:F,stageRevision:4}).state,'CONFIRMED_PUBLIC');
 assert.equal(s06ReviewStatus({decision:{ok:true,type:'REVIEW'},
  human:{state:'DEFERRED',parentStageRevision:4},stageRevision:4}).state,'HUMAN_DEFERRED');
 assert.equal(s06ReviewStatus({decision:{ok:false,code:'S06_CANDIDATE_OR_TEST_EVIDENCE_UNVERIFIED'},
  human:{state:'ADOPTED_UNTESTED',childStageRevision:5},stageRevision:5}).state,'IN_DEVELOPMENT');
 assert.equal(s06ReviewStatus({decision:{ok:true,type:'RECONCILE'}}).state,'BLOCKED');
 assert.equal(s06ReviewStatus({decision:{ok:true,type:'REVIEW'},
   change:{state:'REQUESTED'},stageRevision:4}).state,'CHANGES_REQUESTED');
 assert.equal(s06ReviewStatus({decision:{
   ok:false,code:'S06_CANDIDATE_OR_TEST_EVIDENCE_UNVERIFIED'},
   change:{state:'ADMITTED',childStageRevision:5},stageRevision:5}).state,'IN_DEVELOPMENT');
 assert.equal(s06ReviewStatus({decision:{ok:true,type:'PREPARE'},
   change:{state:'ADMITTED',childStageRevision:5},stageRevision:5}).state,'WAITING_FOR_GIT');
 assert.equal(s06ReviewStatus({decision:{ok:true,type:'REVIEW'},
   change:{state:'ADMITTED',childStageRevision:5},stageRevision:5}).state,'READY_FOR_REVIEW');
 assert.equal(s06ReviewStatus({decision:{ok:false,code:'S06_CURRENT_READY_UNAVAILABLE'},
   change:{state:'ADMITTED',childStageRevision:5},stageRevision:5}).state,'BLOCKED');
 assert.equal(s06ReviewStatus({decision:{ok:true,type:'REVIEW'},release:{
   state:'APPROVED',approval:{sourceFingerprint:H}},sourceFingerprint:F}).state,'BLOCKED');
 assert.equal(s06ReviewStatus({decision:{ok:true,type:'REVIEW'},release:{
   state:'PUBLICATION_UNCERTAIN'},sourceFingerprint:F}).state,'PUBLICATION_UNCERTAIN');
 assert.equal(s06ReviewStatus({decision:{ok:true,type:'REVIEW'},release:{
   state:'CONFIRMED_PUBLIC',approval:{sourceFingerprint:F}},sourceFingerprint:F}).state,'CONFIRMED_PUBLIC');
});
test('S06 queue accepts read-only paged request but rejects UI effect or oversized page',()=>{
 const api={runtime:{id:'donor-id',getURL:x=>'moz-extension://test/'+x}};
 const sender={id:'donor-id',url:'moz-extension://test/pcms/index.html'};
 const check=msg=>validateReleaseMessage(api,sender,msg);
 assert.equal(check({type:'LIST_REVIEW',params:{after:'',limit:50}}).ok,true);
 for(const params of [
  {limit:101},{limit:0},{after:'../owner'},
  {source:F},{limit:2,token:'stolen-token-value'}
 ])assert.equal(check({type:'LIST_REVIEW',params}).ok,false);
 assert.equal(check({type:'APPROVE',params:{slug:name}}).ok,false);
 assert.equal(check({type:'HUMAN_CONTEXT',params:{slug:name}}).ok,true);
 assert.equal(check({type:'GET_HUMAN',params:{slug:name}}).ok,true);
 assert.equal(check({type:'ADOPT_HUMAN',params:{slug:name,expectedRevision:0}}).ok,false);
 assert.equal(check({type:'DEFER_HUMAN',params:{slug:name,expectedStageRevision:1,
  expectedJobRevision:1,expectedFingerprint:F,source:{forged:true}}}).ok,false);
});
test('S06 canonical queue retains blocked candidates and paginates without effects',async()=>{
 const db=fakeDatabase();
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('meta','readwrite');tx.oncomplete=resolve;tx.onabort=reject;
  const m=tx.objectStore('meta');
  for(let i=0;i<205;i++){
   const slug='review-'+String(i).padStart(3,'0');
   m.put({key:'s05-ready:'+slug,record:{slug,repositoryId:'123',
     revision:1,active:{identifier:'rev-'+i,inputFingerprint:H},desired:null,hold:'OPERATOR_PAUSED'}});
  }
 });
 const queue=createS06ReviewQueue(db);let after='',all=[];
 for(let n=0;n<6;n++){
  const page=await queue.list({after,limit:40});
  assert.equal(page.ok,true,JSON.stringify(page));
  assert.ok(page.items.length<=40);
  all.push(...page.items);
  assert.ok(page.items.every(x=>x.state==='BLOCKED'));
  if(!page.more)break;
  assert.ok(page.nextCursor>after);after=page.nextCursor;
 }
 assert.equal(all.length,205);
 assert.equal(new Set(all.map(x=>x.slug)).size,205);
 assert.equal(db.keys('events').length,0);
});
