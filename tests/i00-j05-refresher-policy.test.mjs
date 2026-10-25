import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createRefresherStore} from '../src/runtime/refresher-store.mjs';
import {emptyShadow,reconcileShadow,advanceShadow,rowBlocks,REFRESHER_KEY,MINUTE} from '../src/runtime/refresher-core.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {validateRefresherMessage} from '../src/runtime/refresher-boundary.mjs';
const put=(db,...rows)=>new Promise(resolve=>{const t=db.transaction('meta','readwrite');t.oncomplete=resolve;for(const r of rows)t.objectStore('meta').put(r)});
const inputs=['inherited-policy','custom-policy'].map((slug,i)=>({slug,accountId:'account-policy',personaUid:'persona-policy',bindingVersion:1,remoteId:'remote-'+i,ownerVerified:true,releaseVerified:true,releaseFingerprint:'a'.repeat(64),listing:'PUBLIC',accountVerified:true,principalFingerprint:'b'.repeat(64)}));
test('J05 global defaults apply to subsequent inherited periods, preserve custom settings and exact unfinished budgets, and reset can resume inheritance',async()=>{
 const db=fakeDatabase(),store=createRefresherStore(db),s=reconcileShadow(emptyShadow(),inputs).state;
 s.rows[0].phase='ACTIVE';s.rows[0].slot=true;s.rows[0].activeRemaining=123456;s.rows[0].sleepRemaining=0;
 s.rows[1].phase='SLEEPING';s.rows[1].sleepRemaining=654321;s.rows[1].activeRemaining=234567;
 await put(db,{key:REFRESHER_KEY,state:s});const before=s.rows.map(r=>[r.activeRemaining,r.sleepRemaining,r.phase,r.slot,r.refresh]);
 const custom=await store.generatorPolicy(1,s.rows[1].stableId,90*MINUTE,180*MINUTE);assert.equal(custom.ok,true);
 const changed=await store.changePolicy(custom.revision,{activeMs:30*MINUTE,sleepMs:60*MINUTE});assert.equal(changed.ok,true);
 let x=(await store.read()).state;assert.deepEqual([x.rows[0].activeMs,x.rows[0].sleepMs,x.rows[0].timingOverride],[30*MINUTE,60*MINUTE,false]);assert.deepEqual([x.rows[1].activeMs,x.rows[1].sleepMs,x.rows[1].timingOverride],[90*MINUTE,180*MINUTE,true]);
 assert.deepEqual(x.rows.map(r=>[r.activeRemaining,r.sleepRemaining,r.phase,r.slot,r.refresh]),before);
 const reset=await store.generatorPolicy(x.revision,x.rows[1].stableId,undefined,undefined,{useDefaults:true});assert.equal(reset.ok,true);
 const later=await store.changePolicy(reset.revision,{activeMs:40*MINUTE,sleepMs:80*MINUTE});assert.equal(later.ok,true);
 x=(await store.read()).state;assert.equal(x.rows.every(r=>r.activeMs===40*MINUTE&&r.sleepMs===80*MINUTE&&r.timingOverride===false),true);assert.deepEqual(x.rows.map(r=>[r.activeRemaining,r.sleepRemaining,r.phase,r.slot,r.refresh]),before);
 assert.equal(db.keys('operations').length,0);
});
test('J05 legacy distinct durations remain custom; equal defaults inherit without resetting current periods',async()=>{
 const db=fakeDatabase(),store=createRefresherStore(db),s=reconcileShadow(emptyShadow(),inputs).state;
 for(const r of s.rows)delete r.timingOverride;s.rows[1].activeMs=17*MINUTE;s.rows[1].sleepMs=31*MINUTE;
 await put(db,{key:REFRESHER_KEY,state:s});const out=await store.changePolicy(1,{activeMs:60*MINUTE,sleepMs:120*MINUTE});assert.equal(out.ok,true);
 const x=(await store.read()).state;assert.equal(x.rows[0].activeMs,60*MINUTE);assert.equal(x.rows[0].timingOverride,false);assert.equal(x.rows[1].activeMs,17*MINUTE);assert.equal(x.rows[1].timingOverride,true);
 assert.equal(x.rows[0].activeRemaining,s.rows[0].activeRemaining);assert.equal(x.rows[1].sleepRemaining,s.rows[1].sleepRemaining);
});
test('J05 a known account can pause future work before inventory; first observed inventory retains it, unknown/prototype targets cannot create preferences',async()=>{
 const db=fakeDatabase(),store=createRefresherStore(db),account={accountId:'account-empty',personaUid:'persona-empty',bindingVersion:1,revision:1,state:'VERIFIED',identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:'b'.repeat(64)}};
 await put(db,{key:REFRESHER_KEY,state:emptyShadow()},{key:'account:'+account.accountId,account});
 const pause=await store.pause(1,'ACCOUNT',account.accountId,true);assert.equal(pause.ok,true);
 let x=(await store.read()).state;assert.equal(x.accounts[account.accountId].paused,true);assert.equal(x.accounts[account.accountId].verifiedIdentity,false);assert.equal(x.accounts[account.accountId].health,'UNKNOWN');
 for(const target of ['account-unknown','__proto__','constructor'])assert.equal((await store.pause(x.revision,'ACCOUNT',target,true)).code,'PAUSE_TARGET_UNKNOWN');
 assert.equal(Object.prototype.paused,undefined);
 const source=await exactSource([{path:'main.pjs',base64:''},{path:'index.html',base64:''}]),slug='first-empty-account-generator',inventory={slug,accountId:account.accountId,personaUid:account.personaUid,bindingVersion:1,remoteId:'remote-empty',ownerState:'OBSERVED_OWNER',visibility:'PUBLIC'};
 await put(db,{key:'inventory:'+slug,generator:inventory},{key:'source-link:'+slug,link:{...inventory,folder:'generators/'+slug}},{key:'adoption:'+slug,adoption:{...inventory,principalFingerprint:account.identity.principalFingerprint,remotePublicId:inventory.remoteId,archiveState:'ARCHIVED_GIT_CONFIRMED',original:{...source,source:'INDEPENDENT_FULL_BYTE_READBACK',sourceStage:'PCMS_STAGED_SOURCE_V1',stagedFingerprint:source.fingerprint,remotePublicId:inventory.remoteId,visibility:'PUBLIC'}}});
 const turned=await store.turn({now:Date.now(),bootId:'boot_j05_empty_001'});assert.equal(turned.ok,true,JSON.stringify(turned));x=(await store.read()).state;assert.equal(x.rows.length,1);assert.equal(x.rows[0].ownerVerified,true);assert.equal(x.rows[0].releaseVerified,true);assert.ok(rowBlocks(x,x.rows[0]).includes('ACCOUNT_PAUSE'));assert.equal(x.rows[0].slot,false);
 const resumed=await store.pause(x.revision,'ACCOUNT',account.accountId,false);assert.equal(resumed.ok,true);assert.equal((await store.read()).state.accounts[account.accountId].paused,false);assert.equal(db.keys('operations').length,0);
});
test('J05 typed default reset rejects ambiguous durations and caller fields',()=>{
 const api={runtime:{id:'j05',getURL:p=>'moz-extension://j05/'+p}},sender={id:'j05',url:'moz-extension://j05/pcms/index.html'},params={expectedRevision:1,stableId:'rfgen_000000000001',useDefaults:true};
 assert.equal(validateRefresherMessage(api,sender,{type:'SET_GENERATOR_POLICY',params}).ok,true);
 for(const extra of [{activeMs:60000},{sleepMs:60000},{useDefaults:'yes'},{source:{forged:true}}])assert.equal(validateRefresherMessage(api,sender,{type:'SET_GENERATOR_POLICY',params:{...params,...extra}}).code,'INVALID_PARAMS');
});

test('J05 a manual recent-page request remains bounded by existing backoff and read quota',async()=>{
 const db=fakeDatabase(),store=createRefresherStore(db),s=reconcileShadow(emptyShadow(),inputs).state,now=Date.now();
 s.bootId='boot_j05_recent_001';s.accounts['account-policy'].health='HEALTHY';s.recent.nextDueAt=now+600000;s.recent.endpointBackoffUntil=now+120000;s.recent.accountBackoff={'account-policy':now+180000};s.readWindow={start:now,used:s.policy.readBudget};
 await put(db,{key:REFRESHER_KEY,state:s});const out=await store.demandRecent(now);assert.equal(out.ok,true);
 const x=(await store.read()).state;assert.equal(x.recent.nextDueAt,now);assert.equal(x.recent.operatorRequestedAt,now);
 assert.equal(x.recent.endpointBackoffUntil,s.recent.endpointBackoffUntil);assert.deepEqual(x.recent.accountBackoff,s.recent.accountBackoff);assert.deepEqual(x.readWindow,s.readWindow);
 const claim=await store.claim({kind:'RECENT',preferredAccountId:'account-policy',now,bootId:s.bootId,claimId:'claim_j05_recent_001'});assert.equal(claim.ok,false);assert.equal((await store.read()).state.inflight.length,0);assert.equal(db.keys('operations').length,0);
});
test('J05 scheduler canonical reads are independent of more than fifty thousand unrelated history records',async()=>{
 const db=fakeDatabase(),store=createRefresherStore(db);await put(db,{key:REFRESHER_KEY,state:emptyShadow()},...Array.from({length:50010},(_,i)=>({key:'ai-history:other-workflow:'+String(i).padStart(8,'0'),job:{slug:'other-workflow',revision:i+1}})));
 const result=await store.turn({now:Date.now(),bootId:'boot_j05_history_001'});assert.equal(result.ok,true,JSON.stringify(result));assert.equal(result.state.rows.length,0);assert.equal(db.keys('operations').length,0);
});

test('J05 quick scoped Pause/Resume cannot charge active or rest time hidden between clock samples; unrelated generators continue',async()=>{
 for(const scope of ['GLOBAL','ACCOUNT','GENERATOR']){
  const db=fakeDatabase(),store=createRefresherStore(db),start=1000000,bootId='boot_j05_pause_001';
  const s=reconcileShadow(emptyShadow(),[...inputs,{...inputs[0],slug:'independent-policy',accountId:'account-other',personaUid:'persona-other'}]).state;
  s.bootId=bootId;s.lastTurnAt=start;s.provider={state:'HEALTHY',observedAt:start};
  for(const a of Object.values(s.accounts))a.health='HEALTHY';
  for(const r of s.rows){r.phase='ACTIVE';r.slot=true;r.admittedAt=start;r.checkpoint=start;r.activeRemaining=100000;}
  s.rows[1].phase='SLEEPING';s.rows[1].slot=false;s.rows[1].restCheckpointAt=start;s.rows[1].sleepRemaining=100000;
  const routes=Object.entries(s.accounts).map(([accountId,a])=>({ready:true,accountId,personaUid:a.personaUid,bindingVersion:1,principalFingerprint:a.principalFingerprint,cookieStoreId:'container-'+accountId,routeId:'protected-'+accountId,healthDomain:'health-'+accountId}));
  s.recent={...s.recent,complete:true,observedAt:start-1};
  const sample=at=>({observedAtMs:at,monotonicMs:at-start,runtimeEpoch:bootId,routes});
  s.browserClock={bootId,witness:sample(start)};
  await put(db,{key:REFRESHER_KEY,state:s});
  const target=scope==='GLOBAL'?null:scope==='ACCOUNT'?'account-policy':s.rows[0].stableId;
  const paused=await store.pause(s.revision,scope,target,true,start+5000);assert.equal(paused.ok,true);
  const resumed=await store.pause(paused.revision,scope,target,false,start+10000);assert.equal(resumed.ok,true);
  const next=advanceShadow((await store.read()).state,{now:start+20000,bootId,browserClock:sample(start+20000)});assert.equal(next.ok,true);
  assert.equal(next.state.rows[0].activeRemaining,90000,scope);
  assert.equal(next.state.rows[2].activeRemaining,scope==='GLOBAL'?90000:80000,scope+' independent');
  assert.equal(next.state.rows[1].sleepRemaining,scope==='GENERATOR'?80000:90000,scope+' rest');
 }
});
test('J05 persisted global/account/generator Pause freezes rest through turns and restart until explicit Resume',async()=>{
 for(const scope of ['GLOBAL','ACCOUNT','GENERATOR']){
  const db=fakeDatabase(),store=createRefresherStore(db),start=1000000;
  const s=reconcileShadow(emptyShadow(),inputs).state;s.rows[0].phase='SLEEPING';s.rows[0].sleepRemaining=100000;s.rows[0].restCheckpointAt=start;
  await put(db,{key:REFRESHER_KEY,state:s});
  const target=scope==='GLOBAL'?null:scope==='ACCOUNT'?'account-policy':s.rows[0].stableId;
  const paused=await store.pause(1,scope,target,true,start+5000);assert.equal(paused.ok,true);
  const frozen=advanceShadow((await store.read()).state,{now:start+70000,bootId:'boot_j05_pause_new'});assert.equal(frozen.state.rows[0].sleepRemaining,100000);
  await put(db,{key:REFRESHER_KEY,state:frozen.state});
  const resumed=await store.pause(frozen.state.revision,scope,target,false,start+80000);assert.equal(resumed.ok,true);
  const next=advanceShadow((await store.read()).state,{now:start+90000,bootId:'boot_j05_pause_new'});
  assert.equal(next.state.rows[0].sleepRemaining,90000);
 }
});
