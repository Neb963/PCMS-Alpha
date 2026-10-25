import test from 'node:test';
import assert from 'node:assert/strict';
import {needsActiveClock,REFRESHER_CLOCK_PULSE_MS} from '../src/runtime/refresher-boundary.mjs';
import {emptyShadow,reconcileShadow} from '../src/runtime/refresher-core.mjs';
const now=1000000,accountId='account-clock',personaUid='persona-clock',principal='a'.repeat(64);
function fixture(){
 const s=reconcileShadow(emptyShadow(),[{slug:'clock-generator',accountId,personaUid,bindingVersion:1,remoteId:'remote-clock',ownerVerified:true,releaseVerified:true,releaseFingerprint:'b'.repeat(64),listing:'PUBLIC',accountVerified:true,principalFingerprint:principal}]).state;
 s.recent={...s.recent,complete:true,observedAt:now-1000};s.rows[0].phase='ACTIVE';s.rows[0].slot=true;
 const routes=[{ready:true,accountId,personaUid,bindingVersion:1,principalFingerprint:principal,cookieStoreId:'container-clock',routeId:'protected-clock',healthDomain:'health-clock'}];
 return {s,routes};
}
test('J05 prospective clock work samples eligible active time before event-page idle, including verified-route bootstrap',()=>{
 const {s,routes}=fixture();assert.equal(REFRESHER_CLOCK_PULSE_MS,20000);
 assert.equal(s.accounts[accountId].health,'UNKNOWN');assert.equal(needsActiveClock(s,routes,now),true);
 s.rows[0].phase='WAITING';s.rows[0].slot=false;assert.equal(needsActiveClock(s,routes,now),true);
 s.rows[0].phase='SLEEPING';s.rows[0].sleepRemaining=10000;assert.equal(needsActiveClock(s,routes,now),false);
});
test('J05 short clock observations stop on pause, stale/unknown feed, source/update holds, missing identity and changed protected route',()=>{
 for(const mutate of [
  f=>{f.s.globalPause=true},f=>{f.s.accounts[accountId].paused=true},f=>{f.s.rows[0].paused=true},
  f=>{f.s.recent.complete=false},f=>{f.s.recent.observedAt=now-600001},f=>{f.s.recent.observedAt=now+1},f=>{f.s.recent.suspended=true},
  f=>{f.s.rows[0].ownerVerified=false},f=>{f.s.rows[0].releaseVerified=false},f=>{f.s.rows[0].listing='UNLISTED'},
  f=>{f.s.rows[0].reviewHeld=true},f=>{f.s.rows[0].readyUpdate=true},f=>{f.s.rows[0].updateNow={}},
  f=>{f.s.accounts[accountId].verifiedIdentity=false},f=>{f.routes[0].routeId='direct'},f=>{f.routes[0].routeId='block'},
  f=>{f.routes[0].principalFingerprint='c'.repeat(64)},f=>{f.routes[0].bindingVersion=2},f=>{f.routes[0].ready=false},
  f=>{f.s.provider.state='OUTAGE'}
 ]){const f=fixture();mutate(f);assert.equal(needsActiveClock(f.s,f.routes,now),false,mutate.toString());}
});
