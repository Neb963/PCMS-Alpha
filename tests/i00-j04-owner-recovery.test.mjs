import test from 'node:test';import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';import {createAccountStore} from '../src/runtime/accounts.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';import {releaseContext} from '../src/runtime/release-core.mjs';
const put=(db,...rows)=>new Promise(resolve=>{const t=db.transaction('meta','readwrite');t.oncomplete=resolve;for(const r of rows)t.objectStore('meta').put(r)});
const aid='account-recovery',uid='persona-recovery',principal='a'.repeat(64),slug='saved-development';
test('J04 same independently verified identity refreshes current context headers, retaining bytes/test lineage and immutable approvals',async()=>{
 const db=fakeDatabase(),accounts=createAccountStore(db),source=await exactSource([{path:'main.pjs',base64:btoa('saved F')},{path:'index.html',base64:btoa('<p>saved</p>')}]);
 const account={accountId:aid,revision:1,state:'VERIFIED',personaUid:uid,bindingVersion:1,boundPrincipal:principal,identity:{source:'GUARDED_SESSION_READBACK',principalFingerprint:principal,bindingVersion:1}};
 const stage={slug,revision:4,state:'SOURCE_VERIFIED',accountId:aid,accountRevision:1,personaUid:uid,bindingVersion:1,principalFingerprint:principal,remotePublicId:'remote-saved',candidate:source,previous:source};
 const approval={stageRevision:4,jobRevision:7,accountRevision:1,sourceFingerprint:source.fingerprint};
 const inventory={slug,accountId:aid,personaUid:uid,bindingVersion:1,remoteId:stage.remotePublicId,ownerState:'OBSERVED_OWNER'};
 await put(db,{key:'account:'+aid,account},{key:'stage:'+slug,record:stage},{key:'existing-update:'+slug,record:{...stage,recovery:{immutable:'P'}}},
  {key:'adoption:'+slug,adoption:{...stage,original:source}},{key:'source-link:'+slug,link:{...stage}},
  {key:'stage:changed-binding',record:{...stage,slug:'changed-binding',bindingVersion:2}},
  {key:'stage:wrong-principal',record:{...stage,slug:'wrong-principal',principalFingerprint:'b'.repeat(64)}},
  {key:'stage-history:'+slug+':4',record:stage},{key:'ai-job:'+slug,accountId:aid,job:{slug,revision:7,finalSource:source}},
  {key:'release:'+slug,release:{state:'APPROVED',approval}});
 assert.equal((await accounts.apply({type:'REVERIFY',accountId:aid,expectedRevision:1})).ok,true);
 assert.equal(db.read('meta','stage:'+slug).record.accountRevision,1,'pending/unverified account never renews authority');
 const verified=await accounts.apply({type:'VERIFY',accountId:aid,expectedRevision:2,proof:{source:'GUARDED_SESSION_READBACK',verified:true,personaUid:uid,principalFingerprint:principal,observationId:'observation-recovered-identity'}});assert.equal(verified.ok,true,JSON.stringify(verified));
 for(const [key,property] of [['stage:'+slug,'record'],['existing-update:'+slug,'record'],['adoption:'+slug,'adoption'],['source-link:'+slug,'link']])assert.equal(db.read('meta',key)[property].accountRevision,3);
 const recovered=db.read('meta','stage:'+slug).record;assert.deepEqual(recovered.candidate,source);assert.equal(recovered.revision,4);assert.equal(releaseContext(recovered,verified.account,inventory).ok,true);
 assert.equal(db.read('meta','stage:changed-binding').record.accountRevision,1);assert.equal(db.read('meta','stage:wrong-principal').record.accountRevision,1);
 assert.equal(db.read('meta','stage-history:'+slug+':4').record.accountRevision,1);assert.deepEqual(db.read('meta','release:'+slug).release.approval,approval);assert.equal(db.read('meta','ai-job:'+slug).job.revision,7);
 const bad=await accounts.apply({type:'VERIFY',accountId:aid,expectedRevision:3,proof:{source:'GUARDED_SESSION_READBACK',verified:true,personaUid:uid,principalFingerprint:'c'.repeat(64),observationId:'observation-wrong-identity'}});assert.equal(bad.code,'IDENTITY_CHANGED');assert.equal(db.read('meta','stage:'+slug).record.accountRevision,3);
});
