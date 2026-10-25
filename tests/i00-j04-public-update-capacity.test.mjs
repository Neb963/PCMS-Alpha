import test from 'node:test';import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';import {exactSource} from '../src/runtime/staging-core.mjs';
import {createExistingStore} from '../src/runtime/existing-update-store.mjs';
import {sealPrevious,authorizeSleepingUpdate} from '../src/runtime/existing-update-core.mjs';
import {createAiStore,countAiCapacity} from '../src/runtime/ai-store.mjs';
import {emptyShadow,reconcileShadow,REFRESHER_KEY} from '../src/runtime/refresher-core.mjs';
import {releaseCandidateKind} from '../src/runtime/release-core.mjs';
const put=(db,...rows)=>new Promise(resolve=>{const t=db.transaction('meta','readwrite');t.oncomplete=resolve;for(const r of rows)t.objectStore('meta').put(r)});
async function fixture(){
 const db=fakeDatabase(),store=createExistingStore(db),original=await exactSource([{path:'main.pjs',base64:''},{path:'index.html',base64:''}]),seal=await sealPrevious(original);
 const account={accountId:'account-public',personaUid:'persona-public',bindingVersion:1,revision:1,state:'VERIFIED',identity:{source:'GUARDED_SESSION_READBACK',principalFingerprint:'a'.repeat(64)}};
 const items=Array.from({length:3},(_,i)=>({slug:'public-update-'+i,accountId:account.accountId,personaUid:account.personaUid,bindingVersion:1,remoteId:'remote-'+i,ownerState:'OBSERVED_OWNER',visibility:'PUBLIC',revision:1}));
 const sh=reconcileShadow(emptyShadow(),items.map(i=>({...i,ownerVerified:true,releaseVerified:true,releaseFingerprint:original.fingerprint}))).state;
 for(const row of sh.rows){row.phase='SLEEPING';row.sleepRemaining=7200000;row.slot=false;}
 const args=items.map((inventory,n)=>{const adoption={...inventory,revision:1,accountRevision:1,principalFingerprint:account.identity.principalFingerprint,remotePublicId:inventory.remoteId,archiveState:'ARCHIVED_GIT_CONFIRMED',original:{...original,source:'INDEPENDENT_FULL_BYTE_READBACK'}};
  const remote={ok:true,remotePublicId:inventory.remoteId,ownerResult:'IS_OWNER',visibility:'PUBLIC',source:original},row=sh.rows[n];return {account,inventory,adoption,shadow:row,original,seal,remote,context:{...authorizeSleepingUpdate({account,inventory,adoption,shadow:row,original,remote}),originalArchiveFingerprint:original.fingerprint}};});
 await put(db,{key:'account:'+account.accountId,account},{key:REFRESHER_KEY,state:sh},...args.flatMap(x=>[{key:'inventory:'+x.inventory.slug,generator:x.inventory},{key:'adoption:'+x.inventory.slug,adoption:x.adoption}]));
 return {db,store,args,original};
}
test('J04 existing public admission shares real execution reservations and retains a visibility budget through review',async()=>{
 const f=await fixture();await put(f.db,{key:'ai-job:private-busy',accountId:'account-public',job:{slug:'private-busy',executionSlotReleased:false}});
 assert.equal((await f.store.prepare(f.args[0])).code,'PUBLIC_UPDATE_EXECUTION_CAPACITY_RESERVED');assert.equal(f.db.keys('operations').length,0);
 await put(f.db,{key:'ai-job:private-busy',accountId:'account-public',job:{slug:'private-busy',executionSlotReleased:true}});
 const results=await Promise.all([f.store.prepare(f.args[0]),f.store.prepare(f.args[1])]);assert.equal(results.filter(x=>x.ok).length,1);assert.equal(results.filter(x=>x.code==='PUBLIC_UPDATE_EXECUTION_CAPACITY_RESERVED').length,1);
 const name=f.args[0].inventory.slug,held=f.db.read('meta','existing-update:'+name).record;
 const source=await exactSource([{path:'main.pjs',base64:btoa('output = 1')},{path:'index.html',base64:btoa('<p>source</p>')}]);
 const stage={slug:'private-waiting',revision:1,state:'SOURCE_VERIFIED',verifiedAt:1,accountId:'account-public',candidate:source,previous:source};
 assert.equal((await createAiStore(f.db).start(stage)).code,'AI_ACCOUNT_CONCURRENCY_HELD','private work cannot steal a pre-unlist reservation');
 await put(f.db,{key:'existing-update:'+name,record:{...held,state:'STAGE_CONFIRMED',stagedFingerprint:source.fingerprint}},
  {key:'stage:'+name,record:{...stage,slug:name,nonce:held.nonce}},
  {key:'ai-job:'+name,accountId:'account-public',job:{slug:name,stageRevision:1,state:'TESTS_VERIFIED',executionSlotReleased:true}});
 assert.equal((await createAiStore(f.db).start(stage)).ok,true,'verified review frees execution capacity');
 assert.equal((await f.store.prepare(f.args[1])).code,'PUBLIC_UPDATE_EXECUTION_CAPACITY_RESERVED');
 await put(f.db,{key:'ai-job:private-waiting',accountId:'account-public',job:{slug:'private-waiting',executionSlotReleased:true}});
 assert.equal((await f.store.prepare(f.args[1])).code,'PUBLIC_UPDATE_ACCOUNT_CAPACITY_RESERVED','review still holds the visibility reservation');
 assert.equal(releaseCandidateKind({previous:f.original},f.args[0].inventory,held),'EXISTING_UPDATE','empty published P never bypasses update protections');
});
test('J04 capacity counts an update AI job once and other Persona accounts independently',()=>{
 const rows=[{key:'existing-update:update',record:{slug:'update',accountId:'a',nonce:'n'}},{key:'stage:update',record:{revision:4,nonce:'n'}},{key:'ai-job:update',accountId:'a',job:{slug:'update',stageRevision:4,executionSlotReleased:false}}];
 assert.equal(countAiCapacity(rows,'a'),1);assert.equal(countAiCapacity(rows,'b'),0);assert.equal(countAiCapacity(rows,'a','update'),0);
});
