import test from 'node:test';import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';import {exactSource} from '../src/runtime/staging-core.mjs';
import {createCleanBulkStore,inspectCleanCandidate} from '../src/runtime/clean-bulk-release.mjs';
import {createCleanBulkProgress,validateCleanBulkMessage} from '../src/runtime/clean-bulk-boundary.mjs';
import {createReleaseStore} from '../src/runtime/release-store.mjs';import {approvalTuple} from '../src/runtime/release-core.mjs';
const principal='a'.repeat(64),sid='b'.repeat(64),slug=n=>'clean-'+String(n).padStart(4,'0');
const put=(db,rows)=>new Promise(resolve=>{const t=db.transaction('meta','readwrite');t.oncomplete=resolve;for(const r of rows)t.objectStore('meta').put(r)});
const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
async function fixture(count=3){
 const A=await exactSource([{path:'main.pjs',base64:btoa('original declared source')},{path:'index.html',base64:btoa('<p>source</p>')},{path:'src/retained.bin',base64:btoa(String.fromCharCode(0,255,29))}]),
  B=await exactSource([{path:'main.pjs',base64:btoa('AI modified source')},{path:'index.html',base64:btoa('<p>source</p>')},{path:'src/retained.bin',base64:btoa(String.fromCharCode(0,255,29))}]),
  P=await exactSource([{path:'main.pjs',base64:''},{path:'index.html',base64:''}]);
 const input=await hash('PCMS_SOURCE_V1\n'+[...A.files].sort((a,b)=>a.path.localeCompare(b.path,'en')).map(f=>JSON.stringify([f.path,f.size,f.sha256])).join('\n'));
 const db=fakeDatabase(),bulk=createCleanBulkStore(db),releases=createReleaseStore(db),saved={},api={storage:{local:{get:async k=>({[k]:saved[k]}),set:async v=>Object.assign(saved,structuredClone(v))}}};
 const account={accountId:'account',personaUid:'persona-1',bindingVersion:1,revision:1,state:'VERIFIED',identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:principal}};
 const all=[{key:'account:account',account}];for(let n=0;n<count;n++){
  const name=slug(n),stage={slug:name,revision:4,state:'SOURCE_VERIFIED',verifiedAt:1,nonce:'f'.repeat(32),accountId:'account',accountRevision:1,personaUid:'persona-1',bindingVersion:1,principalFingerprint:principal,remotePublicId:'remote-'+n,sourceFolder:'generators/'+name,sourceHead:'c'.repeat(40),testingSha:null,readyIdentifier:'rev-current',readyInputFingerprint:input,gitFingerprint:input,candidate:A,previous:P},
   job={schema:1,slug:name,revision:7,stageRevision:4,state:'TESTS_VERIFIED',executionSlotReleased:true,sourceFingerprint:A.fingerprint,verifiedFinal:A.fingerprint,finalSource:A,readyIdentifier:'rev-current',readyInputFingerprint:input,prompt:{revision:1,text:'Pinned prompt',tests:['smoke']},native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:sid},chat1:{sessionDigest:sid,tests:{smoke:{result:'PASS',sourceFingerprint:A.fingerprint}}},chat2:null};
  all.push({key:'stage:'+name,record:stage},{key:'ai-job:'+name,accountId:'account',job},{key:'inventory:'+name,generator:{slug:name,accountId:'account',personaUid:'persona-1',bindingVersion:1,remoteId:'remote-'+n,ownerState:'OBSERVED_OWNER',visibility:'UNLISTED',revision:1}},
   {key:'s05-ready:'+name,record:{slug:name,revision:1,active:{identifier:'rev-current',inputFingerprint:input},desired:null,hold:null}},
   {key:'writeback:'+name,record:{slug:name,revision:3,state:'CONFIRMED',mode:'S06',stageRevision:4,jobRevision:7,sourceFingerprint:A.fingerprint,sealedSource:A,readyIdentifier:'rev-current',readyInputFingerprint:input,testingSha:null,folder:'generators/'+name,commitSha:'d'.repeat(40)}});
 }
 await put(db,all);
 async function approveOne(msg){const name=msg.params.slug,s=db.read('meta','stage:'+name).record,j=db.read('meta','ai-job:'+name).job,inventory=db.read('meta','inventory:'+name).generator,source=await exactSource(j.finalSource.blobs);
  return releases.approve({approval:approvalTuple({slug:name,stage:s,job:j,source,previous:P,git:{ok:true,testingSha:null},kind:'PRIVATE_NEW'}),stage:s,job:j,source,previous:P,account,inventory,releaseId:'release_'+crypto.randomUUID().replaceAll('-',''),kind:'PRIVATE_NEW',bulkAuthorization:msg.bulkAuthorization});
 }
 return {A,B,P,input,db,bulk,releases,api,approveOne,progress:makeRelease=>createCleanBulkProgress(api,{open:async()=>db,makeRelease:makeRelease||(()=>({runTrusted:approveOne}))})};
}
test('J04 clean approval derives unchanged bytes from immutable declared input, excluding modified children and exceptional/incomplete tests',async()=>{
 const f=await fixture();let j=f.db.read('meta','ai-job:'+slug(1));j.job={...j.job,sourceFingerprint:f.B.fingerprint,verifiedFinal:f.B.fingerprint,finalSource:f.B,chat1:{tests:{smoke:{result:'PASS',sourceFingerprint:f.B.fingerprint}}}};
 const s=f.db.read('meta','stage:'+slug(1));s.record={...s.record,candidate:f.B,childSource:'ADOPTED_HUMAN_SOURCE'};
 const w=f.db.read('meta','writeback:'+slug(1));w.record={...w.record,sourceFingerprint:f.B.fingerprint,sealedSource:f.B};
 const ex=f.db.read('meta','ai-job:'+slug(2));ex.job={...ex.job,state:'TESTS_UNVERIFIED',verifiedFinal:null,exceptionFrozen:true};await put(f.db,[j,s,w,ex]);
 assert.equal((await inspectCleanCandidate(f.db,slug(1))).code,'MODIFIED_SOURCE_REQUIRES_INDIVIDUAL_REVIEW');
 const plan=await f.bulk.prepare([slug(2),slug(1),slug(0)]);assert.equal(plan.eligible,1);assert.equal(plan.excluded,2);assert.equal(plan.state,'DRAFT');
 assert.equal(f.db.keys('operations').length,0);assert.equal((await f.bulk.approve(plan.id,plan.revision,'f'.repeat(64))).ok,false);
 const approved=await f.bulk.approve(plan.id,plan.revision,plan.digest);assert.equal(approved.state,'APPROVED');assert.equal((await f.bulk.approve(plan.id,plan.revision,plan.digest)).ok,false);
 await f.progress().tick();assert.equal((await f.releases.get(slug(0))).state,'APPROVED');assert.equal((await f.releases.get(slug(1))).ok,false);assert.equal((await f.releases.get(slug(2))).ok,false);
 assert.equal(f.db.keys('operations').length,0,'selected-set approval itself has no provider effect');
});
test('J04 frozen clean set covers1001 selected sources with complete pagination and cannot overlap another active set',async()=>{
 const f=await fixture(1001),names=Array.from({length:1001},(_,i)=>slug(i)),plan=await f.bulk.prepare(names);assert.equal(plan.eligible,1001);assert.equal(plan.excluded,0);
 const last=await f.bulk.get(plan.id,{offset:1000,limit:25});assert.deepEqual(last.items.map(x=>x.slug),[slug(1000)]);assert.equal(last.more,false);
 assert.equal((await f.bulk.approve(plan.id,1,plan.digest)).ok,true);const duplicate=await f.bulk.prepare([slug(1000)]);assert.equal((await f.bulk.approve(duplicate.id,1,duplicate.digest)).code,'CLEAN_BULK_ALREADY_ACTIVE');
 assert.equal(f.db.keys('operations').length,0);assert.equal(f.db.keys('meta').filter(k=>k.startsWith('release:')).length,0);
});
test('J04 lost approval ACK is recovered from the exact release and cannot mint a second approval',async()=>{
 const f=await fixture(1),plan=await f.bulk.prepare([slug(0)]);await f.bulk.approve(plan.id,1,plan.digest);let attempts=0;
 const first=f.progress(()=>({runTrusted:async msg=>{attempts++;await f.approveOne(msg);throw Error('lost local approval ACK')}}));assert.equal((await first.tick()).code,'CLEAN_BULK_PROGRESS_UNAVAILABLE');
 await f.progress().tick();assert.equal(attempts,1);const record=await f.releases.getFull(slug(0));assert.equal(record.record.cleanBulkSetId,plan.id);
 assert.equal(f.db.keys('events').map(k=>f.db.read('events',k)).filter(x=>x.stage==='RELEASE_APPROVED').length,1);
 const armed=await f.releases.markDispatch(slug(0),record.record.revision,record.record.approval);assert.equal(armed.ok,true);
 await f.releases.settle(slug(0),armed.revision,{proof:{ok:true,source:'INDEPENDENT_PUBLICATION_READBACK',sourceFingerprint:f.A.fingerprint,observationId:'observed_'+'e'.repeat(32),observedAt:Date.now()}});
 await f.progress().tick();const done=await f.bulk.get(plan.id);assert.equal(done.state,'FINISHED');assert.equal(done.counts.CONFIRMED,1);
});
test('J04 cancellation atomically revokes late batch approval and cancels only unsent batch-owned releases',async()=>{
 const f=await fixture(1),plan=await f.bulk.prepare([slug(0)]);await f.bulk.approve(plan.id,1,plan.digest);let entered,release;
 const waiting=new Promise(r=>entered=r),gate=new Promise(r=>release=r),runner=f.progress(()=>({runTrusted:async msg=>{entered();await gate;return f.approveOne(msg)}})),flight=runner.tick();await waiting;
 const current=await f.bulk.get(plan.id);assert.equal((await f.bulk.cancel(plan.id,current.revision)).state,'FINISHED');release();await flight;
 assert.equal((await f.releases.get(slug(0))).ok,false);assert.equal(f.db.keys('operations').length,0);
 const next=await f.bulk.prepare([slug(0)]);await f.bulk.approve(next.id,1,next.digest);await f.progress().tick();const approved=await f.releases.getFull(slug(0));assert.equal(approved.record.cleanBulkSetId,next.id);
 const batch=await f.bulk.get(next.id);await f.bulk.cancel(next.id,batch.revision);assert.equal((await f.releases.get(slug(0))).state,'CANCELED');assert.equal((await f.releases.markDispatch(slug(0),approved.record.revision,approved.record.approval)).ok,false);
});
test('J04 typed clean-set requests cannot submit test/source evidence or bypass exact explicit approval',()=>{
 const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p}},sender={id:'fixture',url:'moz-extension://fixture/pcms/index.html'},id='clean_mh1v32cd_'+'a'.repeat(32);
 assert.equal(validateCleanBulkMessage(api,sender,{type:'PREPARE',params:{slugs:[slug(0)]}}).ok,true);
 for(const params of [{slugs:[slug(0)],aiVerified:true},{slugs:['../target']},{slugs:[slug(0),slug(0)]}])assert.equal(validateCleanBulkMessage(api,sender,{type:'PREPARE',params}).ok,false);
 assert.equal(validateCleanBulkMessage(api,sender,{type:'APPROVE',params:{id,expectedRevision:1,digest:'a'.repeat(64),explicitApproval:true}}).ok,true);
 for(const params of [{id,expectedRevision:1,digest:'a'.repeat(64),explicitApproval:false},{id,expectedRevision:1,digest:'a'.repeat(64),explicitApproval:true,bulkAuthorization:{}}])assert.equal(validateCleanBulkMessage(api,sender,{type:'APPROVE',params}).ok,false);
 assert.equal(validateCleanBulkMessage(api,{id:'other',url:'https://perchance.org'},{type:'PREPARE',params:{slugs:[slug(0)]}}).ok,false);
});
