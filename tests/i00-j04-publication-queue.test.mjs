import test from 'node:test';import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createS06ReviewQueue} from '../src/runtime/s06-review-queue.mjs';
import {matchesReviewGroup,reviewQueueGroup} from '../src/ui/review-queue-state.mjs';
import {validateReleaseMessage} from '../src/runtime/release-boundary.mjs';
const F='f'.repeat(64);
test('J04 release queue includes every state in All and separates action, waiting, running and completed',()=>{
 for(const state of ['READY_FOR_REVIEW','EXCEPTION_READY_FOR_REVIEW','PUBLICATION_UNCERTAIN','HUMAN_DEFERRED','BLOCKED','WAITING_FOR_GIT','APPROVED','CHANGES_REQUESTED','IN_DEVELOPMENT','CONFIRMED_PUBLIC'])assert.equal(matchesReviewGroup(state,'ALL'),true);
 assert.equal(reviewQueueGroup('CONFIRMED_PUBLIC'),'COMPLETED');assert.equal(matchesReviewGroup('CONFIRMED_PUBLIC','WAITING'),false);
 assert.equal(reviewQueueGroup('WAITING_FOR_GIT'),'WAITING');assert.equal(matchesReviewGroup('READY_FOR_REVIEW','WAITING'),false);assert.equal(reviewQueueGroup('PUBLISHING'),'RUNNING');
});
test('J04 full cursor walk searches and filters beyond the first1000 without changing canonical state',async()=>{
 const db=fakeDatabase();await new Promise((resolve,reject)=>{const tx=db.transaction('meta','readwrite');tx.oncomplete=resolve;tx.onabort=reject;const m=tx.objectStore('meta');
  for(let i=0;i<1001;i++){const slug='release-'+String(i).padStart(4,'0');m.put({key:'s05-ready:'+slug,record:{slug,repositoryId:'42',revision:1,active:{identifier:'revision-'+i,inputFingerprint:F},desired:null,hold:'OPERATOR_PAUSED'}});}
  m.put({key:'ai-job:release-1000',job:{slug:'release-1000',sourceFingerprint:F}});m.put({key:'release:release-1000',release:{state:'CONFIRMED_PUBLIC',approval:{sourceFingerprint:F}}});
 });
 const before=db.keys('meta'),queue=createS06ReviewQueue(db),completed=await queue.list({status:'COMPLETED',limit:20});
 assert.equal(completed.ok,true);assert.deepEqual(completed.items.map(x=>x.slug),['release-1000']);assert.equal(completed.more,false);
 const found=await queue.list({query:'0999',status:'NEEDS_ACTION',limit:20});assert.deepEqual(found.items.map(x=>x.slug),['release-0999']);
 let after='',all=[];for(let n=0;n<20;n++){const page=await queue.list({after,limit:100});assert.equal(page.ok,true);all.push(...page.items.map(x=>x.slug));if(!page.more)break;assert.ok(page.nextCursor>after);after=page.nextCursor;}
 assert.equal(all.length,1001);assert.equal(new Set(all).size,1001);assert.deepEqual(db.keys('meta'),before);assert.equal(db.keys('events').length,0);assert.equal(db.keys('operations').length,0);
});
test('J04 paged release request accepts bounded filters but cannot carry source or effect claims',()=>{
 const api={runtime:{id:'same',getURL:p=>'moz-extension://fixture/'+p}},sender={id:'same',url:'moz-extension://fixture/pcms/index.html'};
 assert.equal(validateReleaseMessage(api,sender,{type:'LIST_REVIEW',params:{after:'',limit:20,query:'release-1000',status:'COMPLETED'}}).ok,true);
 for(const params of [{query:'X'.repeat(101)},{status:'PUBLISHED'},{query:'x',source:F},{status:'ALL',explicitApproval:true}])assert.equal(validateReleaseMessage(api,sender,{type:'LIST_REVIEW',params}).ok,false);
});
