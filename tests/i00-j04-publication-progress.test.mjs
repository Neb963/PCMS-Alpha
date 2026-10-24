// Scheduler/CAS evidence, with an independent offline publication ledger.
// Full guarded Git/provider eligibility is exercised by the installed journey.
import test from 'node:test';import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';import {exactSource} from '../src/runtime/staging-core.mjs';
import {createReleaseStore} from '../src/runtime/release-store.mjs';import {approvalTuple} from '../src/runtime/release-core.mjs';
import {createS06PublicationProgress} from '../src/runtime/s06-publication-progress.mjs';
import {s06ReviewStatus} from '../src/runtime/s06-review-queue.mjs';
const D='d'.repeat(64),P='c'.repeat(64),put=(db,rows)=>new Promise(resolve=>{const t=db.transaction('meta','readwrite');t.oncomplete=resolve;for(const row of rows)t.objectStore('meta').put(row)});
async function fixture(count){
 const source=await exactSource([{path:'main.pjs',base64:btoa('output = 1')},{path:'index.html',base64:btoa('<p>saved</p>')}]),previous=await exactSource([{path:'main.pjs',base64:''},{path:'index.html',base64:''}]),db=fakeDatabase(),store=createReleaseStore(db),items=[];
 const account={accountId:'acct',personaUid:'persona-1',bindingVersion:1,revision:1,state:'VERIFIED',identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:P}};
 await put(db,[{key:'account:acct',account}]);
 for(let i=0;i<count;i++){
  const slug='publication-'+String(i).padStart(4,'0'),stage={slug,accountId:'acct',personaUid:'persona-1',bindingVersion:1,accountRevision:1,principalFingerprint:P,remotePublicId:'remote-'+i,revision:4,state:'SOURCE_VERIFIED',verifiedAt:1,nonce:'f'.repeat(32),sourceFolder:'generators/'+slug,sourceHead:'b'.repeat(40),testingSha:null,candidate:source,previous,readyIdentifier:'rev-current',readyInputFingerprint:D};
  const job={schema:1,slug,revision:7,stageRevision:4,sourceFingerprint:source.fingerprint,verifiedFinal:source.fingerprint,finalSource:source,state:'TESTS_VERIFIED',executionSlotReleased:true,native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:D},prompt:{revision:1,tests:['smoke']},chat1:{tests:{smoke:{result:'PASS',sourceFingerprint:source.fingerprint}}},chat2:null};
  const inventory={slug,accountId:'acct',personaUid:'persona-1',bindingVersion:1,remoteId:'remote-'+i,ownerState:'OBSERVED_OWNER',visibility:'UNLISTED',revision:1};
  await put(db,[{key:'stage:'+slug,record:stage},{key:'ai-job:'+slug,accountId:'acct',job},{key:'inventory:'+slug,generator:inventory},{key:'s05-ready:'+slug,record:{slug,active:{identifier:'rev-current',inputFingerprint:D},desired:null,hold:null}},
   {key:'writeback:'+slug,record:{state:'CONFIRMED',mode:'S06',readyIdentifier:'rev-current',readyInputFingerprint:D,testingSha:null,sourceFingerprint:source.fingerprint,stageRevision:4,jobRevision:7,commitSha:'e'.repeat(40)}}]);
  const approval=approvalTuple({slug,stage,job,source,previous,git:{ok:true,testingSha:null},kind:'PRIVATE_NEW'});
  const approved=await store.approve({approval,stage,job,account,inventory,source,previous,releaseId:'release_'+i.toString(16).padStart(32,'0'),kind:'PRIVATE_NEW'});assert.equal(approved.ok,true,JSON.stringify(approved));items.push(slug);
 }
 const saved={},effects=new Map(),commands=[];let lost=true;
 const api={storage:{local:{get:async key=>({[key]:saved[key]}),set:async values=>Object.assign(saved,structuredClone(values))}}};
 const makeRelease=()=>({runTrusted:async({type,params})=>{const {slug,expectedRevision}=params;commands.push({type,slug});const current=await store.getFull(slug);
  if(type==='DISPATCH'){const armed=await store.markDispatch(slug,expectedRevision,current.record.approval);if(!armed.ok)return armed;
   effects.set(slug,(effects.get(slug)||0)+1);
   if(slug==='publication-0100'&&lost){lost=false;throw Error('lost page ACK after actual independent effect')}
   return store.settle(slug,armed.revision,{reason:'INDEPENDENT_READBACK_REQUIRED'});
  }
  assert.equal(type,'RECONCILE');return store.settle(slug,expectedRevision,{proof:effects.has(slug)?{ok:true,source:'INDEPENDENT_PUBLICATION_READBACK',sourceFingerprint:source.fingerprint,observationId:'observed_'+'a'.repeat(32),observedAt:Date.now()}:null});
 }});
 return {db,store,items,saved,api,effects,commands,make:()=>createS06PublicationProgress(api,{open:async()=>db,makeRelease})};
}
test('J04 approved publication continues without a dashboard across restarts, lost ACK and more than200 releases; one held generator does not starve others',async()=>{
 const f=await fixture(205),paused=f.db.read('meta','ai-job:'+f.items[0]);await put(f.db,[{...paused,job:{...paused.job,operatorPaused:true}}]);
 let progress=f.make();for(let n=0;n<420;n++){if(n%11===0)progress=f.make();await progress.tick();}
 assert.equal(f.effects.size,204);assert.ok([...f.effects.values()].every(x=>x===1));
 for(const slug of f.items.slice(1))assert.equal((await f.store.get(slug)).state,'CONFIRMED_PUBLIC',slug);
 const held=await f.store.getFull(f.items[0]);assert.equal(held.record.state,'APPROVED');assert.equal(held.record.progressHold,'AI_OPERATOR_PAUSED');
 assert.equal(s06ReviewStatus({release:held,sourceFingerprint:held.record.approval.sourceFingerprint}).state,'APPROVED_HELD');
 assert.equal(f.commands.filter(x=>x.slug==='publication-0100'&&x.type==='DISPATCH').length,1);
 const last=(await f.store.list({after:'publication-0200',limit:2}));assert.deepEqual(last.items.map(x=>x.slug),['publication-0201','publication-0202']);assert.equal(last.more,true);
 const before=f.commands.length;f.saved.pcmsRestoreInProgress={active:true};assert.equal((await f.make().tick()).code,'RESTORE_HOLD');assert.equal(f.commands.length,before);
});
