import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {createStagingStore} from '../src/runtime/staging-store.mjs';
import {evaluateStageSuccessor} from '../src/runtime/ready-source-safety.mjs';
globalThis.crypto??=webcrypto;
const H='a'.repeat(64);
const b64=s=>Buffer.from(s).toString('base64');
const files=txt=>[
 {path:'main.pjs',base64:b64(txt)},
 {path:'index.html',base64:b64('<main>'+txt+'</main>')}];
const account={accountId:'account-fixture',state:'VERIFIED',revision:7,
 personaUid:'persona-fixture',bindingVersion:2,
 identity:{source:'GUARDED_SESSION_READBACK',principalFingerprint:H}};
const link={slug:'safe-s05',accountId:account.accountId,
 personaUid:account.personaUid,remoteId:'remote-fixture',
 bindingVersion:account.bindingVersion,folder:'generators/safe-s05'};
async function seed(db,rows){
 await new Promise((resolve,reject)=>{
  const t=db.transaction(['meta'],'readwrite');
  t.oncomplete=resolve;t.onabort=()=>reject(Error('ABORT'));
  for(const row of rows)t.objectStore('meta').put(row);
 });
}
function source(candidate){
 return {ok:true,ready:true,sourceBytes:files('candidate B'),
  folder:link.folder,head:'b'.repeat(40),fingerprint:candidate.fingerprint,
  testingSha:null,gitReadyIdentifier:'rev-candidateB',
  gitReadyInputFingerprint:H};
}
test('S05 native-idle handoff accepts unreleased predecessor only against saved source',async()=>{
 const previous=await exactSource(files('candidate A'));
 const candidate=await exactSource(files('candidate B'));
 const db=fakeDatabase(),stage=createStagingStore(db);
 const prior={slug:link.slug,state:'SOURCE_VERIFIED',revision:8,
  accountId:account.accountId,personaUid:account.personaUid,
  remotePublicId:link.remoteId,bindingVersion:account.bindingVersion,
  candidate:previous,previous};
 const job={state:'TESTS_UNVERIFIED',stageRevision:8,
  native:{state:'CHAT1_OBSERVED_IDLE'},
  finalSource:{fingerprint:previous.fingerprint}};
 const ready={active:{identifier:'rev-candidateB',inputFingerprint:H},
  desired:null};
 await seed(db,[
  {key:'account:'+account.accountId,account},
  {key:'source-link:'+link.slug,link},
  {key:'stage:'+link.slug,record:prior},
  {key:'ai-job:'+link.slug,job},
  {key:'s05-ready:'+link.slug,record:ready}
 ]);
 const result=await stage.pin({slug:link.slug,candidate,previous,
  source:source(candidate),nonce:'0123456789abcdef0123456789abcdef',
  eligibility:{ok:true,account,item:{remoteId:link.remoteId}}});
 assert.equal(result.ok,true,JSON.stringify(result));
 const saved=await stage.getFull(link.slug);
 assert.equal(saved.record.readyIdentifier,'rev-candidateB');
 assert.equal(saved.record.revision,9);
 assert.equal(db.keys('meta').filter(k=>k.startsWith('stage-history:')).length,1);
 assert.equal(db.keys('events').length,1);
});
test('S05 competing native, uncertain existing effect and mismatched F cannot repin',async()=>{
 const previous=await exactSource(files('candidate A'));
 const candidate=await exactSource(files('candidate B'));
 const prior={state:'SOURCE_VERIFIED',revision:8,
  accountId:account.accountId,personaUid:account.personaUid,
  remotePublicId:link.remoteId,bindingVersion:account.bindingVersion,
  candidate:previous,previous};
 const context={prior,previous,source:{...source(candidate),
  accountId:account.accountId,personaUid:account.personaUid,
  remotePublicId:link.remoteId,bindingVersion:account.bindingVersion},
  ready:{active:{identifier:'rev-candidateB',inputFingerprint:H}}};
 const job={state:'KNOWN_FAILURE',stageRevision:8,
  native:{state:'RUNNING_OBSERVED'},finalSource:{fingerprint:previous.fingerprint}};
 assert.equal(evaluateStageSuccessor({...context,job}).code,'NATIVE_HELPER_NOT_PROVEN_IDLE');
 assert.equal(evaluateStageSuccessor({...context,job:{...job,
  native:{state:'CHAT1_OBSERVED_IDLE'}},existing:{state:'STAGE_UNCERTAIN'}}).code,
  'POSSIBLE_REMOTE_EFFECT_RECONCILIATION_REQUIRED');
 assert.equal(evaluateStageSuccessor({...context,job:{...job,
  native:{state:'CHAT1_OBSERVED_IDLE'},finalSource:{fingerprint:'c'.repeat(64)}}}).code,
  'NATIVE_SAVED_SOURCE_UNVERIFIED');
 assert.equal(evaluateStageSuccessor({...context,job:{...job,
  native:{state:'CHAT1_OBSERVED_IDLE'}},ready:{...context.ready,
    desired:{identifier:'rev-newer'}}}).code,'READY_CANDIDATE_NOT_ADMITTED');
});
