import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';import {DB_STORES} from '../src/ui/backup-core.mjs';
import {verifyOriginal} from '../src/runtime/adoption.mjs';
import {encodePortableArchive} from '../src/runtime/portable-archive.mjs';
import {preparePortableOriginals,completePortableOriginals} from '../src/runtime/portable-originals.mjs';
import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';
globalThis.crypto??=webcrypto;
const hash=async b=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
const slug='j02-preserved-original',runId='manual_'+'4'.repeat(32);
const account={accountId:'account_j02_original',personaUid:'persona_j02_original',state:'VERIFIED',revision:4,bindingVersion:1,
 identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:'a'.repeat(64)}};
async function fixture(){
 const asset=new Uint8Array([0,255,128,1]),row={slug,accountId:account.accountId,visibility:'PUBLIC'};
 const original=await verifyOriginal({ok:true,source:'DONOR_GUARDED_ORIGINAL_READBACK',slug,
 accountId:account.accountId,personaUid:account.personaUid,principalFingerprint:account.identity.principalFingerprint,
 ownerResult:'IS_OWNER',visibility:'PUBLIC',remotePublicId:'public_original_j02',observedAt:Date.now(),
 pjs:'output\n  original é\n',html:'<p>exact original</p>\n',assets:[{path:'src/binary.dat',base64:btoa(String.fromCharCode(...asset)),size:4,sha256:await hash(asset)}]},row,account);
 assert.equal(original.ok,true,JSON.stringify(original));
 const a={slug,accountId:account.accountId,personaUid:account.personaUid,accountRevision:4,bindingVersion:1,
 revision:5,remotePublicId:original.remotePublicId,principalFingerprint:account.identity.principalFingerprint,
 visibility:'PUBLIC',original,archiveState:'ARCHIVED_GIT_CONFIRMED',archiveCommit:'c'.repeat(40),
 archiveRef:'refs/tags/pcms-originals/'+original.remotePublicId+'/'+original.fingerprint};
 const db=fakeDatabase(),t=db.transaction(['meta'],'readwrite');
 t.objectStore('meta').put({key:'account:'+account.accountId,account});t.objectStore('meta').put({key:'adoption:'+slug,adoption:a});
 await new Promise((r,j)=>{t.oncomplete=r;t.onabort=j});
 const pcms={schema:1,stores:Object.fromEntries(DB_STORES.map(s=>[s,[]]))};
 pcms.stores.meta.push({key:'adoption:'+slug,value:{key:'adoption:'+slug,adoption:a}});
 const archive=await encodePortableArchive({pcms,donor:{version:1,settings:null,routes:[],personas:[],scripts:[],workflows:[],cookies:{},gmValues:{},automationHistory:[]}});
 const sha256=await hash(await archive.blob.arrayBuffer());return {db,a,archive,sha256};
}
test('J02 actual plain archive with binary original independently decodes before durable witness, then matching browser completion qualifies exact source',async()=>{
 const f=await fixture();await preparePortableOriginals(f.db,f.archive,runId,f.sha256);
 const saved=f.db.read('meta','backup:portable-originals:'+runId);
 assert.equal(saved.integrity,'FRAME_AND_SOURCE_VERIFIED');assert.equal(saved.witnesses.length,1);
 assert.equal(f.db.read('meta','adoption:'+slug).adoption.originalCheckpoint,undefined);
 assert.equal((await completePortableOriginals(f.db,{runId,sha256:f.sha256,bytes:f.archive.bytes,browserCompleted:false})).ok,false);
 // A new coordinator after a restart uses persisted decoded witnesses, never
 // Downloads metadata alone, and keeps its evidence distinct from disk proof.
 const complete=await completePortableOriginals(f.db,{runId,sha256:f.sha256,bytes:f.archive.bytes,browserCompleted:true});
 assert.equal(complete.qualified,1);assert.equal(complete.diskReadback,false);
 const a=f.db.read('meta','adoption:'+slug).adoption;assert.equal(a.originalCheckpoint.source,'INDEPENDENT_PORTABLE_SOURCE_RECOVERY');
 assert.deepEqual(a.original,f.a.original);assert.equal(f.db.keys('operations').length,0);
 const t=f.db.transaction(['meta'],'readwrite');t.objectStore('meta').put({key:'s00-create-intent:intent_portable_j02',record:{intentId:'intent_portable_j02',slug,
 accountId:account.accountId,accountRevision:4,personaUid:account.personaUid,bindingVersion:1,remoteId:a.remotePublicId,
 visibility:'PUBLIC',state:'ADOPTION_ORIGINAL_PENDING',revision:1}});await new Promise(r=>{t.oncomplete=r});
 assert.equal((await createCoordinatorStore(f.db).confirmAdoption('intent_portable_j02',1,a)).ok,true);
 assert.equal((await completePortableOriginals(f.db,{runId,sha256:f.sha256,bytes:f.archive.bytes,browserCompleted:true})).already,1);
});
test('J02 corrupted source/archive, foreign completion and changed current adoption cannot qualify',async()=>{
 const f=await fixture();
 await assert.rejects(preparePortableOriginals(f.db,{...f.archive,blob:new Blob(['broken'])},runId,f.sha256));
 await assert.rejects(preparePortableOriginals(f.db,f.archive,runId,'f'.repeat(64)),/DIGEST_CHANGED/);
 assert.equal((await completePortableOriginals(f.db,{runId,sha256:f.sha256,bytes:f.archive.bytes,browserCompleted:true})).ok,false);
 await preparePortableOriginals(f.db,f.archive,runId,f.sha256);
 assert.equal((await completePortableOriginals(f.db,{runId,sha256:'f'.repeat(64),bytes:f.archive.bytes,browserCompleted:true})).ok,false);
 const t=f.db.transaction(['meta'],'readwrite');t.objectStore('meta').put({key:'adoption:'+slug,adoption:{...f.a,revision:6}});await new Promise(r=>{t.oncomplete=r});
 const out=await completePortableOriginals(f.db,{runId,sha256:f.sha256,bytes:f.archive.bytes,browserCompleted:true});assert.equal(out.qualified,0);assert.equal(out.held,1);
 assert.equal(f.db.read('meta','adoption:'+slug).adoption.originalCheckpoint,undefined);
});
