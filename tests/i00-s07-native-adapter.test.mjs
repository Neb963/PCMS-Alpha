import test from 'node:test';
import assert from 'node:assert/strict';
import {createRefresherNativeAdapter} from '../src/runtime/refresher-native.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
const H='d'.repeat(64),remoteId='public_owner_01';
const approved={source:'INDEPENDENT_LIVE_SOURCE_MARKER_PROOF',
  allowedByProvider:true,meaningfulEffectVerified:true,
  version:'synthetic_01',evidenceId:'witness_01'};
const encoded=text=>btoa(text);
async function fixture({proof=approved,sourceChange=false,wrongOwner=false,
    mutator='expected'}={}){
  let html='<h1>public</h1>',pjs='source',calls=[],counter=0;
  const original=await exactSource([
    {path:'main.pjs',base64:encoded(pjs)},{path:'index.html',base64:encoded(html)}]);
  const row={stableId:'rfgen_000000000001',slug:'owned-generator',accountId:'account_01',
    personaUid:'persona_01',remoteId,bindingVersion:1,releaseFingerprint:original.fingerprint,
    refresh:{savedSourceFingerprint:null}};
  const account={verifiedIdentity:true,principalFingerprint:H};
  const g={getSafeRouteReadiness:async()=>({ready:true}),
    observeReadOnly:async(persona,identityOnly,slug)=>{
      calls.push('read');
      return {ok:true,principalFingerprint:wrongOwner?'e'.repeat(64):H,
        original:{ownerResult:'IS_OWNER',visibility:'PUBLIC',remotePublicId:remoteId,
          pjs,html,assets:[]}};
    },
    runRefresherStep:async(_persona,r)=>{
      calls.push('execute');
      assert.equal(r.action,'REFRESH');
      assert.equal(r.slug,row.slug);
      assert.match(r.nonce,/^[a-f0-9]{32}$/);
      assert.match(r.markerId,/^[A-Za-z0-9_-]{16,64}$/);
      if(mutator==='expected')
        html=atob(r.targetFiles.find(x=>x.path==='index.html').base64);
      if(mutator==='foreign')html='<p>human changed</p>';
      return {ok:true,code:'REFRESH_ACK_ONLY'};
    }};
  const adapter=createRefresherNativeAdapter({guard:()=>g,
    methodProofFor:()=>proof,
    newId:()=>++counter%2?'marker_abcdefghijklmnop':'a'.repeat(32)});
  const claimFor=candidate=>({
    stableId:row.stableId,slug:row.slug,accountId:row.accountId,personaUid:row.personaUid,
    bindingVersion:row.bindingVersion,remoteId,principalFingerprint:H,
    releaseFingerprint:row.releaseFingerprint,
    sourceFingerprint:candidate.sourceFingerprint,
    targetFingerprint:candidate.targetFingerprint,markerId:candidate.markerId,
    nonce:candidate.nonce,
    method:candidate.method});
  if(sourceChange)html='<p>unexpected</p>';
  return {adapter,row,account,g,claimFor,calls,original,
    html:()=>html};
}
test('S07 native D: exact complete source, donor writer ACK and independent saved readback',async()=>{
  const f=await fixture();
  const candidate=await f.adapter.prepare(f.row,f.account);
  assert.equal(candidate.method,'CONTROLLED_SOURCE_MARKER');
  const claim=f.claimFor(candidate);
  assert.equal((await f.adapter.execute(claim)).ok,true);
  assert.equal((await f.adapter.readback(claim)).kind,'EFFECT_CHANGED');
  assert.equal(f.calls.filter(x=>x==='execute').length,1);
  assert.equal((await f.adapter.execute(claim)).ok,false);
  const restarted=createRefresherNativeAdapter({guard:()=>f.g});
  assert.equal((await restarted.readback(claim)).kind,'EFFECT_CHANGED');
});
test('S07 native D/X: unproven method and source drift do not even prepare write',async()=>{
  const missing=await fixture({proof:null});
  assert.equal((await missing.adapter.prepare(missing.row,missing.account)).status,'UNVERIFIED');
  assert.deepEqual(missing.calls,[]);
  const drift=await fixture({sourceChange:true});
  assert.equal((await drift.adapter.prepare(drift.row,drift.account)).status,'UNVERIFIED');
  assert.equal(drift.calls.filter(x=>x==='execute').length,0);
  const wrong=await fixture({wrongOwner:true});
  assert.equal((await wrong.adapter.prepare(wrong.row,wrong.account)).status,'UNVERIFIED');
});
test('S07 native D/X: save ACK does not imply changed source, human edit is unknown',async()=>{
  for(const [mutator,result] of [['none','NO_EFFECT'],['foreign','UNKNOWN']]){
    const f=await fixture({mutator});
    const candidate=await f.adapter.prepare(f.row,f.account),claim=f.claimFor(candidate);
    assert.equal((await f.adapter.execute(claim)).ok,true);
    assert.equal((await f.adapter.readback(claim)).kind,result);
  }
});
test('S07 native D/X: forged source/target/marker identities cannot spend prepared writer',async()=>{
  const f=await fixture();
  const candidate=await f.adapter.prepare(f.row,f.account);
  const claim=f.claimFor(candidate);
  for(const variant of [
    {...claim,principalFingerprint:'a'.repeat(64)},
    {...claim,sourceFingerprint:'a'.repeat(64)},
    {...claim,targetFingerprint:'a'.repeat(64)},
    {...claim,markerId:'wrong_marker_abcdefghijkl'},
    {...claim,accountId:'wrong'},
    {...claim,method:'EXPLICIT_PROVIDER_REFRESH'}])
    assert.equal((await f.adapter.execute(variant)).ok,false);
  assert.equal(f.calls.includes('execute'),false);
  assert.equal((await f.adapter.execute(claim)).ok,true);
});
