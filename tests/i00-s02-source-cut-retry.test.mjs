import test from 'node:test';
import assert from 'node:assert/strict';
import {retryS02ConsistentCut} from '../src/runtime/source-cut-retry.mjs';
test('S02/S04 D: transient concurrent journal write discards entire first cut and recaptures',async()=>{
  let calls=0;
  const result=await retryS02ConsistentCut(async()=>{
    calls++;
    if(calls===1)throw Error('BACKUP_SOURCE_CUT_CHANGED');
    return Object.freeze({cut:'CONSISTENT_SOURCE_CUT',checksum:'new-source'});
  });
  assert.equal(calls,2);
  assert.equal(result.checksum,'new-source');
});
test('S02/S04 D: persistent changing source never becomes a successful archive',async()=>{
  let calls=0;
  await assert.rejects(retryS02ConsistentCut(async()=>{
    calls++;throw Error('BACKUP_SOURCE_CUT_CHANGED');
  }),/BACKUP_SOURCE_CUT_CHANGED/);
  assert.equal(calls,3);
});
test('S02/S04 D: authentication, storage and donor failures never get retried or masked',async()=>{
  for(const error of ['BACKUP_SOURCE_BYTE_MISMATCH',
    'BACKUP_V2_DONOR_AUTH_FAILED','BACKUP_RESTORE_HOLD']){
    let calls=0;
    await assert.rejects(retryS02ConsistentCut(async()=>{
      calls++;throw Error(error);
    }),e=>e.message===error);
    assert.equal(calls,1,error);
  }
});
test('S02/S04 D: invalid retry budget cannot silently expand under resource pressure',async()=>{
  await assert.rejects(retryS02ConsistentCut(async()=>1,{maxAttempts:4}),/BACKUP_V2_RETRY_INVALID/);
});
