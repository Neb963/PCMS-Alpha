import test from 'node:test';
import assert from 'node:assert/strict';
import {sealedS06OutputProof} from '../src/runtime/s06-output-proof.mjs';
const F='a'.repeat(64),INPUT='b'.repeat(64),HEAD='c'.repeat(40),
  BASE='d'.repeat(40),OP='writeback_'+'1'.repeat(32),ID='rev-original-20261019';
const data=()=>({
 ready:{slug:'proof-gen',active:{identifier:ID,inputFingerprint:INPUT},
   desired:null,hold:null},
 stage:{slug:'proof-gen',readyIdentifier:ID,readyInputFingerprint:INPUT,
   testingSha:null},
 writeback:{mode:'S06',state:'CONFIRMED',folder:'generators/proof-gen',
   readyIdentifier:ID,readyInputFingerprint:INPUT,testingSha:null,
   sealedSource:{fingerprint:F},sourceFingerprint:F,operationId:OP,
   baseHead:BASE,expectedHead:BASE,commitSha:HEAD}
});
test('S06 declared-input provenance retains distinct immutable input and attributed output identities',()=>{
 const p=sealedS06OutputProof(data());
 assert.equal(p.ok,true,JSON.stringify(p));
 assert.equal(p.outputProof.readyInputFingerprint,INPUT);
 assert.equal(p.outputProof.sealedSource.fingerprint,F);
 assert.notEqual(p.outputProof.readyInputFingerprint,p.outputProof.sealedSource.fingerprint);
 assert.equal(p.outputProof.commitSha,HEAD);
});
test('S06 output attestation is denied for current READY supersession, manual pause, or changed Git receipt',()=>{
 const variants=[
   x=>{x.ready.desired={identifier:'rev-next',inputFingerprint:INPUT}},
   x=>{x.ready.hold='READY_REVOKED_NOT_READY'},
   x=>{x.stage.readyInputFingerprint=F},
   x=>{x.writeback.readyIdentifier='rev-forged'},
   x=>{x.writeback.mode='MANUAL'},
   x=>{x.writeback.state='HELD_UNCERTAIN'},
   x=>{x.writeback.operationId='not_operation'},
   x=>{x.writeback.commitSha='0'.repeat(40)+'e'},
   x=>{x.writeback.testingSha=F},
   x=>{x.writeback.sealedSource.fingerprint=INPUT}
 ];
 for(const makeBad of variants){const x=data();makeBad(x);
   const out=sealedS06OutputProof(x);
   assert.equal(out.ok,false,JSON.stringify(x));
 }
});
