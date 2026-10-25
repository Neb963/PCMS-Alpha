import test from 'node:test';import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';import {exactSource} from '../src/runtime/staging-core.mjs';
import {createExistingStore} from '../src/runtime/existing-update-store.mjs';
import {sealPrevious,authorizeSleepingUpdate} from '../src/runtime/existing-update-core.mjs';
import {createAiStore,countAiCapacity} from '../src/runtime/ai-store.mjs';
import {emptyShadow,reconcileShadow,REFRESHER_KEY} from '../src/runtime/refresher-core.mjs';
import {releaseCandidateKind} from '../src/runtime/release-core.mjs';
const put=(db,...rows)=>new Promise(resolve=>{const t=db.transaction('meta','readwrite');t.oncomplete=resolve;for(const r of rows)t.objectStore('meta').put(r)});
async function fixture(){
 const db=fakeDatabase(),store=createExistingStore(db),original=await exactSource([{path:'main.pjs',base64:''},{path:'index.html',base64:''}]),seal=await sealPrevious(original);
 const account={accountId:'account-public',personaUid:'persona-public',bindingVersion:1,revision:1,state:'VERIFIED',identity:{source:'GUARDED_SESSION_READBACK',principalFingerprint:'a'.repeat(64)}};
 const items=Array.from({length:3},(_,i)=>({slug:'public-update-'+i,accountId:account.accountId,personaUid:account.personaUid,bindingVersion:1,remoteId:'remote-'+i,ownerState:'OBSERVED_OWNER',visibility:'PUBLIC',revision:1}));
 const sh=reconcileShadow(emptyShadow(),items.map(i=>({...i,ownerVerified:true,releaseVerified:true,releaseFingerprint:original.fingerprint}))).state;
 for(const row of sh.rows){row.phase='SLEEPING';row.sleepRemaining=7200000;row.slot=false;}
 const args=items.map((inventory,n)=>{const adoption={...inventory,revision:1,accountRevision:1,principalFingerprint:account.identity.principalFingerprint,remotePublicId:inventory.remoteId,archiveState:'ARCHIVED_GIT_CONFIRMED',original:{...original,source:'INDEPENDENT_FULL_BYTE_READBACK'}};
  const remote={ok:true,remotePublicId:inventory.remoteId,ownerResult:'IS_OWNER',visibility:'PUBLIC',source:original},row=sh.rows[n];return {account,inventory,adoption,shadow:row,original,seal,remote,context:{...authorizeSleepingUpdate({account,inventory,adoption,shadow:row,original,remote}),originalArchiveFingerprint:original.fingerprint}};});
 await put(db,{key:'account:'+account.accountId,account},{key:REFRESHER_KEY,state:sh},...args.flatMap(x=>[{key:'inventory:'+x.inventory.slug,generator:x.inventory},{key:'adoption:'+x.inventory.slug,adoption:x.adoption}]));
 return {db,store,args,original};
}
test('J04 existing public admission shares real execution reservations and retains a visibility budget through review',async()=>{
 const f=await fixture();await put(f.db,{key:'ai-job:private-busy',accountId:'account-public',job:{slug:'private-busy',executionSlotReleased:false}});
 assert.equal((await f.store.prepare(f.args[0])).code,'PUBLIC_UPDATE_EXECUTION_CAPACITY_RESERVED');assert.equal(f.db.keys('operations').length,0);
 await put(f.db,{key:'ai-job:private-busy',accountId:'account-public',job:{slug:'private-busy',executionSlotReleased:true}});
 const results=await Promise.all([f.store.prepare(f.args[0]),f.store.prepare(f.args[1])]);assert.equal(results.filter(x=>x.ok).length,1);assert.equal(results.filter(x=>x.code==='PUBLIC_UPDATE_EXECUTION_CAPACITY_RESERVED').length,1);
 const name=f.args[0].inventory.slug,held=f.db.read('meta','existing-update:'+name).record;
 const source=await exactSource([{path:'main.pjs',base64:btoa('output = 1')},{path:'index.html',base64:btoa('<p>source</p>')}]);
 const stage={slug:'private-waiting',revision:1,state:'SOURCE_VERIFIED',verifiedAt:1,accountId:'account-public',candidate:source,previous:source};
 assert.equal((await createAiStore(f.db).start(stage)).code,'AI_ACCOUNT_CONCURRENCY_HELD','private work cannot steal a pre-unlist reservation');
 await put(f.db,{key:'existing-update:'+name,record:{...held,state:'STAGE_CONFIRMED',stagedFingerprint:source.fingerprint}},
  {key:'stage:'+name,record:{...stage,slug:name,nonce:held.nonce}},
  {key:'ai-job:'+name,accountId:'account-public',job:{slug:name,stageRevision:1,state:'TESTS_VERIFIED',executionSlotReleased:true}});
 assert.equal((await createAiStore(f.db).start(stage)).ok,true,'verified review frees execution capacity');
 assert.equal((await f.store.prepare(f.args[1])).code,'PUBLIC_UPDATE_EXECUTION_CAPACITY_RESERVED');
 await put(f.db,{key:'ai-job:private-waiting',accountId:'account-public',job:{slug:'private-waiting',executionSlotReleased:true}});
 assert.equal((await f.store.prepare(f.args[1])).code,'PUBLIC_UPDATE_MACHINE_VISIBILITY_RESERVED','review still holds the visibility reservation');
 assert.equal(releaseCandidateKind({previous:f.original},f.args[0].inventory,held),'EXISTING_UPDATE','empty published P never bypasses update protections');
});
test('J04 capacity counts an update AI job once and other Persona accounts independently',()=>{
 const rows=[{key:'existing-update:update',record:{slug:'update',accountId:'a',nonce:'n'}},{key:'stage:update',record:{revision:4,nonce:'n'}},{key:'ai-job:update',accountId:'a',job:{slug:'update',stageRevision:4,executionSlotReleased:false}}];
 assert.equal(countAiCapacity(rows,'a'),1);assert.equal(countAiCapacity(rows,'b'),0);assert.equal(countAiCapacity(rows,'a','update'),0);
});

test('J04 fifty accounts cannot unlist forty-nine public generators into review; machine hold follows configured execution width',async()=>{
 const f=await fixture(),base=f.args[0],items=Array.from({length:50},(_,n)=>({...base.inventory,slug:'fleet-public-'+n,accountId:'fleet-account-'+n,personaUid:'fleet-persona-'+n,remoteId:'fleet-remote-'+n}));
 const state=reconcileShadow(emptyShadow(),items.map(i=>({...i,ownerVerified:true,releaseVerified:true,releaseFingerprint:f.original.fingerprint}))).state;
 state.rows.forEach(r=>{r.phase='SLEEPING';r.sleepRemaining=7200000;r.slot=false});
 const args=items.map((inventory,n)=>{const principal=(n+1).toString(16).padStart(64,'0'),account={...base.account,accountId:inventory.accountId,personaUid:inventory.personaUid,identity:{...base.account.identity,principalFingerprint:principal}},adoption={...base.adoption,...inventory,accountRevision:1,principalFingerprint:principal,remotePublicId:inventory.remoteId},remote={...base.remote,remotePublicId:inventory.remoteId};return {...base,account,inventory,adoption,remote,shadow:state.rows[n]}});
 await put(f.db,{key:REFRESHER_KEY,state},...args.flatMap(x=>[{key:'account:'+x.account.accountId,account:x.account},{key:'inventory:'+x.inventory.slug,generator:x.inventory},{key:'adoption:'+x.inventory.slug,adoption:x.adoption}]));
 assert.equal((await f.store.prepare(args[0])).ok,true);
 for(const a of args.slice(1))assert.equal((await f.store.prepare(a)).code,'PUBLIC_UPDATE_MACHINE_VISIBILITY_RESERVED');
 assert.equal(f.db.keys('meta').filter(k=>k.startsWith('existing-update:')).length,1);assert.equal(f.db.keys('operations').length,0);
});

test('J04 explicit active-window update follows normal reservation and journaled unlist while preserving budgets and updating observed inventory',async()=>{
 const {requestOperatorUpdate}=await import('../src/runtime/update-window.mjs');
 const f=await fixture(),name=f.args[0].inventory.slug,ready={slug:name,revision:1,active:{identifier:'ready-explicit',inputFingerprint:'f'.repeat(64)},desired:null,hold:null};
 const state=f.db.read('meta',REFRESHER_KEY).state,row=state.rows[0];row.phase='ACTIVE';row.slot=true;row.activeRemaining=123456;row.sleepRemaining=0;f.args[0].shadow=row;
 await put(f.db,{key:REFRESHER_KEY,state},{key:'s05-ready:'+name,record:ready});
 assert.equal((await f.store.prepare(f.args[0])).ok,false,'normal updates still wait for sleep');
 const requested=await requestOperatorUpdate(f.db,{name,ready,account:f.args[0].account,inventory:f.args[0].inventory,sourceFingerprint:f.original.fingerprint});assert.equal(requested.code,'UPDATE_NOW_QUEUED');
 const prepared=await f.store.prepare(f.args[0]);assert.equal(prepared.ok,true,JSON.stringify(prepared));
 const blocked={...ready,desired:{identifier:'newer',inputFingerprint:'e'.repeat(64)}};await put(f.db,{key:'s05-ready:'+name,record:blocked});
 assert.equal((await f.store.move(name,prepared.revision,'UNLIST_DISPATCH')).code,'EXISTING_SLEEP_CHANGED');assert.equal(f.db.keys('operations').length,0);
 await put(f.db,{key:'s05-ready:'+name,record:ready});
 const armed=await f.store.move(name,prepared.revision,'UNLIST_DISPATCH');assert.equal(armed.ok,true,JSON.stringify(armed));
 const confirmed=await f.store.move(name,armed.revision,'UNLIST_CONFIRMED',{proof:{source:'INDEPENDENT_FULL_BYTE_READBACK',fingerprint:f.original.fingerprint,visibility:'UNLISTED',ownerResult:'IS_OWNER',remotePublicId:f.args[0].inventory.remoteId}});assert.equal(confirmed.ok,true);
 assert.equal(f.db.read('meta','inventory:'+name).generator.visibility,'UNLISTED');
 const saved=f.db.read('meta',REFRESHER_KEY).state.rows[0];assert.deepEqual([saved.phase,saved.slot,saved.activeRemaining,saved.sleepRemaining],['ACTIVE',true,123456,0]);
 assert.equal(f.db.read('meta','existing-update:'+name).record.previousFingerprint,f.original.fingerprint);
});

test('J04 decreasing configured capacity drains existing reservations fairly instead of deadlocking two unlisted sources',async()=>{
 const f=await fixture(),ai=createAiStore(f.db);assert.equal((await ai.changeConcurrency(1,2)).ok,true);
 assert.equal((await f.store.prepare(f.args[0])).ok,true);assert.equal((await f.store.prepare(f.args[1])).ok,true);
 const source=await exactSource([{path:'main.pjs',base64:btoa('source')},{path:'index.html',base64:btoa('<h1>source</h1>')}]),stages=[];
 for(const a of f.args.slice(0,2)){const name=a.inventory.slug,old=f.db.read('meta','existing-update:'+name).record,stage={slug:name,revision:1,state:'SOURCE_VERIFIED',verifiedAt:1,accountId:a.account.accountId,nonce:old.nonce,candidate:source,previous:f.original};stages.push(stage);await put(f.db,{key:'stage:'+name,record:stage},{key:'existing-update:'+name,record:{...old,state:'STAGE_CONFIRMED',stagedFingerprint:source.fingerprint}});}
 assert.equal((await ai.changeConcurrency(2,1)).ok,true);
 assert.equal((await ai.start(stages[0])).ok,true,'oldest reserved source can make progress');assert.equal((await ai.start(stages[1])).code,'AI_ACCOUNT_CONCURRENCY_HELD');
 const row=f.db.read('meta','ai-job:'+stages[0].slug);await put(f.db,{...row,job:{...row.job,executionSlotReleased:true}});
 assert.equal((await ai.start(stages[1])).ok,true,'next reservation progresses after the actual slot is released');
});

test('J04 pausing an unsent public update frees its reservation for independent work; Resume reacquires before unlisting',async()=>{
 const f=await fixture(),first=f.args[0],name=first.inventory.slug,ready={slug:name,revision:1,active:{identifier:'ready-paused',inputFingerprint:'f'.repeat(64)},desired:null,hold:null};await put(f.db,{key:'s05-ready:'+name,record:ready});
 const prepared=await f.store.prepare(first);assert.equal(prepared.ok,true);await put(f.db,{key:'s05-ready:'+name,record:{...ready,revision:2,hold:'OPERATOR_PAUSED'}});
 const source=await exactSource([{path:'main.pjs',base64:btoa('private')},{path:'index.html',base64:btoa('<p>private</p>')}]),ai=createAiStore(f.db),stage={slug:'independent-private',revision:1,state:'SOURCE_VERIFIED',accountId:first.account.accountId,candidate:source,previous:source};
 assert.equal((await ai.start(stage)).ok,true,'paused unsent reservation cannot block independent private work');const j=f.db.read('meta','ai-job:'+stage.slug);await put(f.db,{...j,job:{...j.job,executionSlotReleased:true}});
 const second=await f.store.prepare(f.args[1]);assert.equal(second.ok,true,'another public update may take the unused window');
 assert.equal((await f.store.move(f.args[1].inventory.slug,second.revision,'UNLIST_DISPATCH')).ok,true);
 await put(f.db,{key:'s05-ready:'+name,record:{...ready,revision:3}});
 const resumed=await f.store.move(name,prepared.revision,'UNLIST_DISPATCH');assert.equal(resumed.ok,false);assert.match(resumed.code,/PUBLIC_UPDATE_.*RESERVED/);assert.equal(f.db.read('meta','existing-update:'+name).record.state,'PREPARED');assert.equal(f.db.keys('operations').length,1);
});

test('J04 shrink before UNLIST admits exactly the oldest PREPARED reservation and the next resumes after matching publication',async()=>{
 const f=await fixture(),ai=createAiStore(f.db);await ai.changeConcurrency(1,2);
 const a=await f.store.prepare(f.args[0]),b=await f.store.prepare(f.args[1]);assert.equal(a.ok&&b.ok,true);await ai.changeConcurrency(2,1);
 assert.equal((await f.store.move(f.args[0].inventory.slug,a.revision,'UNLIST_DISPATCH')).ok,true);
 const waiting=await f.store.move(f.args[1].inventory.slug,b.revision,'UNLIST_DISPATCH');assert.equal(waiting.ok,false);assert.match(waiting.code,/PUBLIC_UPDATE_.*RESERVED/);assert.equal(f.db.keys('operations').length,1);
 const name=f.args[0].inventory.slug,old=f.db.read('meta','existing-update:'+name).record;
 await put(f.db,{key:'existing-update:'+name,record:{...old,state:'STAGE_CONFIRMED',stagedFingerprint:f.original.fingerprint}},
  {key:'release:'+name,release:{state:'CONFIRMED_PUBLIC',source:'INDEPENDENT_PUBLICATION_READBACK',accountId:old.accountId,remoteId:old.remotePublicId,bindingVersion:old.bindingVersion,approval:{sourceFingerprint:f.original.fingerprint}}});
 assert.equal((await f.store.move(f.args[1].inventory.slug,b.revision,'UNLIST_DISPATCH')).ok,true);assert.equal(f.db.keys('operations').length,2);
});
test('J04 an admitted Update now hold survives READY supersession without a second unlist or changed active/sleep budgets',async()=>{
 const {requestOperatorUpdate,updateWindowAvailable}=await import('../src/runtime/update-window.mjs');
 const f=await fixture(),a=f.args[0],name=a.inventory.slug,ready={slug:name,revision:1,active:{identifier:'ready-before',inputFingerprint:'f'.repeat(64)},desired:null,hold:null};
 const state=f.db.read('meta',REFRESHER_KEY).state,row=state.rows[0];row.phase='ACTIVE';row.slot=true;row.activeRemaining=123456;row.sleepRemaining=0;a.shadow=row;await put(f.db,{key:REFRESHER_KEY,state},{key:'s05-ready:'+name,record:ready});
 await requestOperatorUpdate(f.db,{name,ready,account:a.account,inventory:a.inventory,sourceFingerprint:f.original.fingerprint});const p=await f.store.prepare(a),armed=await f.store.move(name,p.revision,'UNLIST_DISPATCH');assert.equal(armed.ok,true);
 const unlisted=await f.store.move(name,armed.revision,'UNLIST_CONFIRMED',{proof:{source:'INDEPENDENT_FULL_BYTE_READBACK',fingerprint:f.original.fingerprint,visibility:'UNLISTED',ownerResult:'IS_OWNER',remotePublicId:a.inventory.remoteId}});assert.equal(unlisted.ok,true);
 const nextReady={...ready,revision:2,desired:{identifier:'ready-newer',inputFingerprint:'e'.repeat(64)},hold:'WAIT_FOR_SAFE_SOURCE_HANDOFF'},current=f.db.read('meta',REFRESHER_KEY).state;
 const reconciled=reconcileShadow(current,f.args.map(x=>({...x.inventory,ownerVerified:true,releaseVerified:true,releaseFingerprint:f.original.fingerprint,reviewHeld:true,updateNowCandidate:x.inventory.slug===name?nextReady.desired:null}))).state;
 assert.equal(reconciled.rows[0].updateNow,undefined);await put(f.db,{key:REFRESHER_KEY,state:reconciled},{key:'s05-ready:'+name,record:nextReady});
 const record=f.db.read('meta','existing-update:'+name).record;assert.equal(updateWindowAvailable(reconciled,reconciled.rows[0],nextReady,record,record.previousFingerprint,record),true);
 const candidate=await exactSource([{path:'main.pjs',base64:btoa('latest source')},{path:'index.html',base64:btoa('<h1>Latest</h1>')}]);
 const pin=await f.store.pinStage(name,record.revision,{candidate,source:{ok:true,ready:true,sourceBytes:candidate.blobs,head:'c'.repeat(40),folder:'generators/'+name,testingSha:null}});assert.equal(pin.ok,true);
 assert.equal((await f.store.move(name,pin.revision,'STAGE_DISPATCH')).ok,true,'already-unlisted successor retains its admitted window');assert.equal(f.db.keys('operations').length,2,'one unlist and one stage, never a second unlist');
 assert.deepEqual([reconciled.rows[0].phase,reconciled.rows[0].slot,reconciled.rows[0].activeRemaining,reconciled.rows[0].sleepRemaining],['ACTIVE',true,123456,0]);
 assert.equal(updateWindowAvailable(reconciled,reconciled.rows[0],nextReady,{...record,bindingVersion:2},record.previousFingerprint,record),false);
});
