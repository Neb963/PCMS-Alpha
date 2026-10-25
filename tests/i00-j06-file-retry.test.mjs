import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyBackupFile} from '../src/ui/faithful/backup-workspace.mjs';
test('J06 file success and corruption finish owned stage cleanup before reporting retry readiness',async()=>{
 for(const corrupt of [false,true]){
  let release,entered,finished=false;const cleanup=new Promise(r=>release=r),cleaning=new Promise(r=>entered=r),calls=[];
  const task=verifyBackupFile(new Blob(['selected physical file']),{scope:'portable_'+'a'.repeat(32),
   prepare:async()=>{calls.push('prepare');if(corrupt)throw Error('PORTABLE_ARCHIVE_CORRUPT')},
   read:async()=>{calls.push('read');return {receipt:{rows:3}}},
   discard:async scope=>{calls.push(scope);entered();await cleanup}}).then(value=>({value}),error=>({error})).finally(()=>{finished=true});
  await cleaning;assert.equal(finished,false,'UI cannot advertise a completed outcome before owned cleanup settles');release();
  const result=await task;assert.equal(finished,true);assert.equal(calls.at(-1),'portable_'+'a'.repeat(32));
  if(corrupt){assert.equal(result.error.message,'PORTABLE_ARCHIVE_CORRUPT');assert.equal(calls.includes('read'),false)}
  else assert.equal(result.value.receipt.rows,3);
 }
});
test('J06 collision cannot delete another inspection stage',async()=>{
 let deleted=0;
 await assert.rejects(verifyBackupFile(new Blob(),{prepare:async()=>{throw Error('PORTABLE_STAGE_REUSED')},discard:async()=>deleted++}),/PORTABLE_STAGE_REUSED/);
 assert.equal(deleted,0);
});
