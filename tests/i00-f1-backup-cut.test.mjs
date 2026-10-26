import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {capturePortableCut} from '../src/runtime/portable-cut.mjs';
import {readPortableArchive} from '../src/runtime/portable-archive.mjs';
import {DB_STORES} from '../src/ui/backup-core.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
function fixture({drift=0,restoreAfterDrift=false,verifyError=null,donorDrift=false}={}){
 let epoch=1,collects=0,verifications=0,donorReads=0,held=false;
 const api={runtime:{getManifest:()=>({version:'1.2.16'})},
  storage:{local:{get:async()=>({})}},
  downloads:{download:()=>{throw Error('CAPTURE_MUST_NOT_DISPATCH')}}};
 const sentinel={inspect:async()=>({held})};
 const options={
  readDonor:async()=>({snapshot:async()=>({state:{fixtureEpoch:donorDrift?++donorReads:0},containers:[]}),
    cookies:async()=>[]}),
  collect:async()=>{
   collects++;const image={schema:1,stores:Object.fromEntries(DB_STORES.map(name=>[name,[]]))};
   image.stores.meta.push({key:'setting:fixture-epoch',
    value:{key:'setting:fixture-epoch',epoch}});
   if(collects<=drift)epoch++;
   return image;
  },
  verify:async(_db,image)=>{
   verifications++;if(verifyError)throw Error(verifyError);
   const ok=image.stores.meta[0].value.epoch===epoch;
   if(!ok&&restoreAfterDrift)held=true;
   return {ok};
  }
 };
 return {run:()=>capturePortableCut(api,{},sentinel,options),
  stats:()=>({epoch,collects,verifications,donorReads})};
}
test('F1 backup: one concurrent canonical update discards the whole cut and archives the fresh exact image',async()=>{
 const f=fixture({drift:1}),built=await f.run(),opened=await readPortableArchive(built.blob);
 assert.equal(opened.integrity,'FRAME_AND_SOURCE_VERIFIED');
 const row=opened.canonical.stores.meta.find(r=>r.key==='setting:fixture-epoch');
 assert.equal(row.value.epoch,2);
 assert.deepEqual(f.stats(),{epoch:2,collects:2,verifications:2,donorReads:0});
 assert.equal(built.diskReadback,false);
});
test('F1 backup: unchanged canonical and donor cut succeeds without an extra capture',async()=>{
 const f=fixture(),built=await f.run();
 assert.equal((await readPortableArchive(built.blob)).integrity,'FRAME_AND_SOURCE_VERIFIED');
 assert.equal(f.stats().collects,1);assert.equal(f.stats().verifications,1);
});
test('F1 backup: continuous canonical changes still fail after exactly three fresh cuts',async()=>{
 const f=fixture({drift:99});
 await assert.rejects(f.run(),error=>error.message==='BACKUP_SOURCE_CUT_CHANGED');
 assert.equal(f.stats().collects,3);assert.equal(f.stats().verifications,3);
});
test('F1 backup: restore beginning after a discarded cut stops before another donor/source read',async()=>{
 const f=fixture({drift:1,restoreAfterDrift:true});
 await assert.rejects(f.run(),error=>error.message==='BACKUP_RESTORE_HOLD');
 assert.equal(f.stats().collects,1);assert.equal(f.stats().verifications,1);
});
test('F1 backup: byte-verification failure is never retried or hidden by cut recovery',async()=>{
 const f=fixture({verifyError:'BACKUP_SOURCE_BYTE_MISMATCH'});
 await assert.rejects(f.run(),error=>error.message==='BACKUP_SOURCE_BYTE_MISMATCH');
 assert.equal(f.stats().collects,1);assert.equal(f.stats().verifications,1);
});
test('F1 backup: donor change remains an explicit hold rather than canonical-cut retry',async()=>{
 const f=fixture({donorDrift:true});
 await assert.rejects(f.run(),error=>error.message==='BACKUP_LOCAL_DRIFT');
 assert.equal(f.stats().collects,1);assert.equal(f.stats().donorReads,2);
});
