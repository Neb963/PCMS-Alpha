import test from 'node:test';
import assert from 'node:assert/strict';
import {canonicalRefresherInputs} from '../src/runtime/refresher-store.mjs';
const FP='a'.repeat(64),SOURCE='b'.repeat(64),slug='adopted-public';
const base=()=>[
  {key:'account:account_01',account:{accountId:'account_01',personaUid:'persona_01',
    state:'VERIFIED',bindingVersion:1,identity:{source:'GUARDED_SESSION_READBACK',
      bindingVersion:1,principalFingerprint:FP}}},
  {key:'inventory:'+slug,generator:{slug,accountId:'account_01',
    personaUid:'persona_01',bindingVersion:1,remoteId:'public_01',
    ownerState:'OBSERVED_OWNER',visibility:'PUBLIC'}},
  {key:'adoption:'+slug,adoption:{slug,accountId:'account_01',
    personaUid:'persona_01',bindingVersion:1,remotePublicId:'public_01',
    principalFingerprint:FP,archived:false,archiveState:'ARCHIVE_PENDING',
    original:{ok:true,source:'INDEPENDENT_FULL_BYTE_READBACK',
      sourceStage:'PCMS_STAGED_SOURCE_V1',fingerprint:'c'.repeat(64),
      stagedFingerprint:SOURCE,remotePublicId:'public_01',
      visibility:'PUBLIC',files:[{path:'main.pjs'},{path:'index.html'}],
      blobs:[{path:'main.pjs',base64:'bQ=='},{path:'index.html',base64:'aA=='}]}}}
];
const mapped=records=>canonicalRefresherInputs(records)[0];

test('A06 adopted source: independently read full original can enter guarded Refresher source admission',()=>{
  const r=mapped(base());
  assert.equal(r.ownerVerified,true);
  assert.equal(r.releaseVerified,true);
  assert.equal(r.releaseFingerprint,SOURCE);
  assert.equal(r.sourceAuthority,'ADOPTED_FULL_ORIGINAL_READBACK');
  // This map is an admission *candidate*, never remote source-save proof.
  assert.equal(r.listing,'PUBLIC');
});
test('A06 adoption: mismatched owner, principal, remote ID, incomplete bytes, archive in flight are denied',()=>{
  const variants=[
    x=>x[1].generator.ownerState='UNKNOWN',
    x=>x[1].generator.remoteId='different_public_01',
    x=>x[2].adoption.principalFingerprint='d'.repeat(64),
    x=>x[2].adoption.original.stagedFingerprint=null,
    x=>x[2].adoption.original.blobs.pop(),
    x=>x[2].adoption.archiveState='DISPATCH_POSSIBLE',
    x=>x[2].adoption.archived=true
  ];
  for(const mutate of variants){
    const records=base();mutate(records);
    const r=mapped(records);
    assert.equal(r.releaseVerified,false,JSON.stringify(records[2].adoption));
    assert.equal(r.releaseFingerprint,null);
  }
  const noAdoption=base().slice(0,2);
  assert.equal(mapped(noAdoption).releaseVerified,false);
});
