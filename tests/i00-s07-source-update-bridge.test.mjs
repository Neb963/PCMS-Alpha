import test from 'node:test';
import assert from 'node:assert/strict';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {planRefresherSourceCandidate,resolveRefreshedPrevious}
  from '../src/runtime/refresher-admission.mjs';
import {authorizeSleepingUpdate} from '../src/runtime/existing-update-core.mjs';

const H='a'.repeat(64),nonce='b'.repeat(32),markerId='owned_marker_000001';
const raw=[
 {path:'main.pjs',base64:btoa('root\nsource')},
 {path:'index.html',base64:btoa('<section>untouched</section>')},
 {path:'src/icon.txt',base64:btoa('asset bytes unchanged')}];
async function fixture(){
 const published=await exactSource(raw);
 const p=await planRefresherSourceCandidate({files:raw,
  expectedFingerprint:published.fingerprint,markerId});
 assert.equal(p.ok,true);
 const remote=await exactSource(p.targetFiles);
 const row={releaseVerified:true,releaseFingerprint:published.fingerprint,
  phase:'SLEEPING',sleepRemaining:72*3600000,slot:false,paused:false,
  identityHeld:false,reviewHeld:false,ownerVerified:true,bindingVersion:1,
  remoteId:'public_fixture_01',accountId:'account_01',personaUid:'persona_01',
  refresh:{intent:null,suspended:false,awaitingVisibility:false,
   savedSourceFingerprint:remote.fingerprint,savedMarkerId:markerId,savedNonce:nonce}};
 return {published,remote,row};
}
test('S07/S06 D: independently verified harmless marker becomes accurate encrypted-recovery P, not new F',async()=>{
 const {published,remote,row}=await fixture();
 const result=await resolveRefreshedPrevious({published,remote,row});
 assert.equal(result.ok,true,JSON.stringify(result));
 assert.equal(result.kind,'VERIFIED_PCMS_S07_MARKER_P');
 assert.equal(result.source.fingerprint,remote.fingerprint);
 assert.notEqual(result.source.fingerprint,published.fingerprint);
 assert.deepEqual(result.source.blobs.find(f=>f.path==='main.pjs'),
  published.blobs.find(f=>f.path==='main.pjs'));
 const account={state:'VERIFIED',revision:2,bindingVersion:1,personaUid:'persona_01',
  identity:{source:'GUARDED_SESSION_READBACK',principalFingerprint:H}};
 const inventory={slug:'fixture',remoteId:'public_fixture_01',ownerState:'OBSERVED_OWNER',
  accountId:'account_01',personaUid:'persona_01',bindingVersion:1};
 const adoption={slug:'fixture',accountRevision:2,principalFingerprint:H,
  bindingVersion:1,personaUid:'persona_01',remotePublicId:'public_fixture_01',
  archiveState:'ARCHIVED_GIT_CONFIRMED',archived:false,accountId:'account_01'};
 const eligible=authorizeSleepingUpdate({account,inventory,adoption,shadow:row,
   original:result.source,remote:{ok:true,remotePublicId:'public_fixture_01',
    ownerResult:'IS_OWNER',visibility:'PUBLIC',source:remote}});
 assert.equal(eligible.ok,true,JSON.stringify(eligible));
 assert.equal(eligible.previousFingerprint,remote.fingerprint);
});
test('S07/S06 X: stale publication, unproven placement and source drift are not repairable previous P',async()=>{
 const {published,remote,row}=await fixture();
 const errors=[
  {published:{...published,fingerprint:'f'.repeat(64)}},
  {row:{...row,refresh:{...row.refresh,awaitingVisibility:true}}},
  {row:{...row,refresh:{...row.refresh,intent:{id:'possible'}}}},
  {row:{...row,refresh:{...row.refresh,savedNonce:'wrong'}}},
  {row:{...row,refresh:{...row.refresh,savedSourceFingerprint:'f'.repeat(64)}}},
  {row:{...row,refresh:{...row.refresh,savedMarkerId:'different_marker_0001'}}},
  {remote:await exactSource([
   {path:'main.pjs',base64:btoa('different PJS')},
   ...raw.filter(f=>f.path!=='main.pjs')])}
 ];
 for(const change of errors){
  const got=await resolveRefreshedPrevious({published,remote,row,...change});
  assert.equal(got.ok,false,JSON.stringify(change).slice(0,200));
 }
 // A previously public F without a managed marker must match exactly.
 const noMarker={...row,refresh:{...row.refresh,savedSourceFingerprint:null}};
 assert.equal((await resolveRefreshedPrevious({published,remote:published,row:noMarker})).ok,true);
 const possible={...noMarker,refresh:{...noMarker.refresh,state:'DISPATCH_POSSIBLE',
   intent:{id:'intent_still_possible'}}};
 assert.equal((await resolveRefreshedPrevious({published,remote:published,row:possible})).ok,false);
 const unknown={...noMarker,refresh:{...noMarker.refresh,state:'EFFECT_UNVERIFIED',
   suspended:true}};
 assert.equal((await resolveRefreshedPrevious({published,remote:published,row:unknown})).ok,false);
 assert.equal((await resolveRefreshedPrevious({published,remote,row:noMarker})).ok,false);
});
