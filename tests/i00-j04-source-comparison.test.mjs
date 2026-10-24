import test from 'node:test';import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {createLocalSourceReview} from '../src/runtime/source-review.mjs';
import {createReleaseBoundary,validateReleaseMessage} from '../src/runtime/release-boundary.mjs';
import {readComparisonFile,sourceLineDiff} from '../src/ui/faithful/source-comparison.mjs';
import {fakeDatabase} from './fake-idb.mjs';
globalThis.crypto??=webcrypto;
const file=(path,text)=>({path,base64:Buffer.from(text).toString('base64')});
async function fixture(){
 const previous=await exactSource([file('main.pjs','old\r\nsecond\n'),file('index.html','<p>old</p>'),file('src/deleted.bin',[0,255])]);
 const source=await exactSource([file('main.pjs','new\r\nsecond\n'),file('index.html','<p>new</p>'),file('src/big.bin',Buffer.alloc(20001,247))]);
 let record={slug:'generator-one',revision:3,state:'HUMAN_OWNED',candidate:source,previous},job=null;
 const stageFactory=()=>({getFull:async()=>({ok:true,record})}),aiFactory=()=>({getJobFull:async()=>job?{ok:true,job}:{ok:false}});
 const db=fakeDatabase(),review=createLocalSourceReview(db,{stageFactory,aiFactory});
 return {db,source,previous,review,stageFactory,aiFactory,setRecord:r=>record=r,setJob:j=>job=j,record};
}
test('J04 read-only source inspection includes deleted/binary files, exact multi-chunk bytes and never invokes eligibility or effects',async()=>{
 const f=await fixture(),v=await f.review.view('generator-one');assert.equal(v.ok,true);assert.equal(v.tests.state,'UNVERIFIED');
 assert.ok(v.diff.some(x=>x.path==='src/deleted.bin'&&x.kind==='DELETED'));
 for(const [origin,files] of [['P',v.priorFiles],['F',v.files]])for(const meta of files){
  const bytes=await readComparisonFile({view:v,origin,file:meta,request:(_,p)=>f.review.chunk(p)});
  assert.deepEqual(bytes,Uint8Array.from(Buffer.from((origin==='P'?f.previous:f.source).blobs.find(x=>x.path===meta.path).base64,'base64')));
 }
 let effects=0;const api={runtime:{id:'same',getURL:p=>'moz-extension://fixture/'+p},storage:{local:{get:async()=>{effects++;throw Error('no credentials or effects')}}}};
 const boundary=createReleaseBoundary(api,{open:async()=>f.db,stageFactory:f.stageFactory,aiFactory:f.aiFactory,guard:()=>{effects++;throw Error('no native effects')}});
 const out=await boundary.run({type:'GET_LOCAL_REVIEW',params:{slug:'generator-one'}},{id:'same',url:'moz-extension://fixture/pcms/index.html'});
 assert.equal(out.ok,true);assert.equal(effects,0);assert.equal(f.db.keys('events').length,0);assert.equal(f.db.keys('operations').length,0);
});
test('J04 source bytes reject changed checkpoint, origin metadata, offsets, hashes, truncation and injected authority',async()=>{
 const f=await fixture(),view=await f.review.view('generator-one'),meta=view.files[0],params={slug:view.slug,stageRevision:view.stageRevision,jobRevision:0,fingerprint:view.sourceFingerprint,origin:'F',path:meta.path,offset:0};
 for(const mutation of [r=>({...r,origin:'P'}),r=>({...r,offset:1}),r=>({...r,total:r.total+1}),r=>({...r,fileSha256:'f'.repeat(64)}),r=>({...r,base64:''}),r=>({...r,base64:Buffer.from('garbage').toString('base64')})]){
  await assert.rejects(readComparisonFile({view,origin:'F',file:meta,request:async(_,p)=>mutation(await f.review.chunk(p))}));
 }
 f.setRecord({...f.record,revision:4});assert.equal((await f.review.chunk(params)).code,'REVIEW_SNAPSHOT_CHANGED');
 const api={runtime:{id:'same',getURL:p=>'moz-extension://fixture/'+p}},sender={id:'same',url:'moz-extension://fixture/pcms/index.html'};
 assert.equal(validateReleaseMessage(api,sender,{type:'GET_LOCAL_CHUNK',params}).ok,true);
 for(const p of [{...params,origin:'X'},{...params,jobRevision:-1},{...params,path:'../secret'},{...params,offset:-1},{...params,explicitApproval:true}])assert.equal(validateReleaseMessage(api,sender,{type:'GET_LOCAL_CHUNK',params:p}).ok,false);
});
test('J04 patience diff reconstructs both complete sources, including repeated lines, EOL differences and large unanchored changes',()=>{
 for(const [a,b] of [['',''],['abc','abc\n'],['a\r\nb\n','a\nb\n'],['same\nold\nanchor\n','same\nnew\nanchor\n'],['x\n'.repeat(20000),'y\n'.repeat(20000)],['one\ntwo\none\nthree','one\none\ntwo\nthree']]){
  const diff=sourceLineDiff(a,b);assert.equal(diff.filter(x=>x.kind!=='added').map(x=>x.text).join(''),a);assert.equal(diff.filter(x=>x.kind!=='removed').map(x=>x.text).join(''),b);
 }
});
