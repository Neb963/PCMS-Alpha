import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createDeclarationStore} from '../src/runtime/catalog-ready-store.mjs';
const candidate={ok:true,code:'READY_COHERENT_INPUT_PINNED',legacy:false,
 token:'unique-revision-001',declarationCommit:'a'.repeat(40),
 markerOid:'b'.repeat(40),inputFingerprint:'c'.repeat(64),
 optionalTesting:{state:'ABSENT',oid:null}};
test('S03 canonical READY observation idempotent, rejects reused token + source and never deploys',async()=>{
 const db=fakeDatabase(),s=createDeclarationStore(db);
 const req={repositoryId:'42',slug:'example',coherent:candidate};
 assert.equal((await s.witness(req)).code,'DECLARATION_OBSERVED_NO_EFFECT');
 assert.equal((await s.witness(req)).code,'DECLARATION_ALREADY_OBSERVED');
 assert.equal((await s.witness({...req,coherent:{...candidate,inputFingerprint:'d'.repeat(64)}})).code,
   'READY_REVISION_REUSED_WITH_DIFFERENT_SOURCE');
 assert.equal(db.keys('events').length,1);
 const k=db.keys('meta').find(x=>x.startsWith('s03-ready:'));
 assert.equal(db.read('meta',k).record.authorizedEffects,'NONE');
});
test('S03 aborted READY journal leaves no false source authority',async()=>{
 const db=fakeDatabase(),s=createDeclarationStore(db);
 db.failNextCommit();
 await assert.rejects(s.witness({repositoryId:'42',slug:'example',coherent:candidate}));
 assert.equal(db.keys('events').length,0);
 assert.equal(db.keys('meta').length,0);
});
