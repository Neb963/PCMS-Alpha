import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createRefresherStore} from '../src/runtime/refresher-store.mjs';
import {emptyShadow,reconcileShadow,REFRESHER_KEY,HOUR} from '../src/runtime/refresher-core.mjs';
const T=2_000_000_000;
test('F2 installed oracle: immediate pause can preserve exactly 64h; resume plus new boot advances rest only',async()=>{
 const db=fakeDatabase(),store=createRefresherStore(db),hash='b'.repeat(64);
 const input={slug:'rest-restart-fixture',accountId:'rest_account_01',personaUid:'rest_persona_01',
  bindingVersion:1,remoteId:'rest_remote_01',ownerVerified:true,accountVerified:true,
  principalFingerprint:hash,releaseVerified:true,releaseFingerprint:hash,listing:'PUBLIC'};
 const state=reconcileShadow(emptyShadow(),[input]).state,row=state.rows[0];
 state.bootId='old_browser_boot';row.phase='SLEEPING';row.sleepRemaining=64*HOUR;row.restCheckpointAt=T;
 row.activeRemaining=16*HOUR;row.slot=false;
 await new Promise(resolve=>{const tx=db.transaction(['meta'],'readwrite');tx.oncomplete=resolve;
  tx.objectStore('meta').put({key:REFRESHER_KEY,state});
  tx.objectStore('meta').put({key:'account:'+input.accountId,account:{accountId:input.accountId,
   personaUid:input.personaUid,bindingVersion:1,state:'VERIFIED',
   identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:hash}}});
  tx.objectStore('meta').put({key:'inventory:'+input.slug,generator:{...input,ownerState:'OBSERVED_OWNER',visibility:'PUBLIC'}});
 });
 const paused=await store.pause(state.revision,'GLOBAL',null,true,T);
 assert.equal(paused.ok,true);
 const cold=await store.turn({now:T+5000,bootId:'new_browser_boot'});
 assert.equal(cold.ok,true);assert.equal(cold.state.globalPause,true);
 assert.equal(cold.state.rows[0].sleepRemaining,64*HOUR,
  'a paused restart must not require an unobserved earlier unpaused turn');
 assert.equal(cold.state.rows[0].activeRemaining,16*HOUR);
 assert.equal(cold.state.accounts[input.accountId].health,'UNKNOWN');
 const resumed=await store.pause(cold.revision,'GLOBAL',null,false,T+5000);
 assert.equal(resumed.ok,true);
 const next=await store.turn({now:T+10000,bootId:'next_browser_boot'});
 assert.equal(next.ok,true);assert.equal(next.state.globalPause,false);
 assert.equal(next.state.rows[0].sleepRemaining,64*HOUR-5000);
 assert.equal(next.state.rows[0].activeRemaining,16*HOUR);
 assert.equal(next.state.accounts[input.accountId].health,'UNKNOWN');
 const replay=await store.turn({now:T+10000,bootId:'next_browser_boot'});
 assert.equal(replay.state.rows[0].sleepRemaining,next.state.rows[0].sleepRemaining,
  'same checkpoint cannot count rest twice');
});
