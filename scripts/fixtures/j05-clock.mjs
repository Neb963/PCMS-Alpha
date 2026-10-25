// Real default-clock controller in the packaged background, disposable IDB.
// Guarded route/feed endpoints are explicitly offline facts. No clock injection.
export async function installRefresherClockFixture(pulseEnabled=true){
 const module=path=>import(browser.runtime.getURL('pcms/'+path));
 const {openCanonicalDatabase}=await module('journal.mjs'),{createRefresherStore}=await module('refresher-store.mjs');
 const {emptyShadow,reconcileShadow,REFRESHER_KEY}=await module('refresher-core.mjs');
 const {createRefresherBoundary,needsActiveClock}=await module('refresher-boundary.mjs'),{exactSource}=await module('staging-core.mjs');
 const dbName='pcms-j05-clock-'+(pulseEnabled?'on':'off'),db=await openCanonicalDatabase({open:(_n,v)=>indexedDB.open(dbName,v)}),store=createRefresherStore(db);
 const read=key=>new Promise((resolve,reject)=>{const q=db.transaction('meta','readonly').objectStore('meta').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=reject});
 const put=rows=>new Promise((resolve,reject)=>{const t=db.transaction('meta','readwrite');for(const r of rows)t.objectStore('meta').put(r);t.oncomplete=resolve;t.onabort=reject});
 if(!await read('clock-seeded')){
  const source=await exactSource([{path:'main.pjs',base64:btoa('output\n  Clock original\n')},{path:'index.html',base64:btoa('<p>Clock</p>')}]),accountId='account-j05-clock',personaUid='persona-j05-clock',principal='a'.repeat(64),now=Date.now(),all=[];
  all.push({key:'account:'+accountId,account:{accountId,personaUid,bindingVersion:1,revision:1,state:'VERIFIED',identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:principal}}});
  const inputs=[];
  for(const slug of ['j05-clock-active','j05-clock-resting','j05-clock-paused']){
   const remoteId='remote-'+slug,generator={slug,accountId,personaUid,bindingVersion:1,remoteId,revision:1,ownerState:'OBSERVED_OWNER',visibility:'PUBLIC'};
   inputs.push({slug,accountId,personaUid,bindingVersion:1,remoteId,ownerVerified:true,releaseVerified:true,releaseFingerprint:source.fingerprint,listing:'PUBLIC',accountVerified:true,principalFingerprint:principal});
   all.push({key:'inventory:'+slug,generator},{key:'source-link:'+slug,link:{...generator,folder:'generators/'+slug}},
    {key:'adoption:'+slug,adoption:{...generator,principalFingerprint:principal,remotePublicId:remoteId,archiveState:'ARCHIVED_GIT_CONFIRMED',original:{...source,source:'INDEPENDENT_FULL_BYTE_READBACK',sourceStage:'PCMS_STAGED_SOURCE_V1',stagedFingerprint:source.fingerprint,remotePublicId:remoteId,visibility:'PUBLIC'}}});
  }
  const s=reconcileShadow(emptyShadow(),inputs).state;s.rows[0].phase='ACTIVE';s.rows[0].slot=true;s.rows[0].activeRemaining=3600000;s.rows[0].admittedAt=now;
  s.rows[1].phase='SLEEPING';s.rows[1].sleepRemaining=3600000;s.rows[1].restCheckpointAt=now;
  s.rows[2].phase='SLEEPING';s.rows[2].sleepRemaining=3600000;s.rows[2].restCheckpointAt=now;s.rows[2].paused=true;
  s.recent={...s.recent,complete:true,observedAt:now-1,total:100,nextDueAt:now+600000};
  s.policy.manualCap=1;all.push({key:REFRESHER_KEY,state:s},{key:'clock-seeded',at:now});await put(all);
 }
 const guard={getSafeRouteReadiness:async uid=>({ready:true,personaUid:uid,cookieStoreId:'container-j05-clock',routeId:'protected-j05-clock',healthDomain:'domain-j05-clock'})};
 const controller=createRefresherBoundary(browser,{open:async()=>db,guard:()=>guard,browserClockGate:()=>true,observationGate:()=>false,refreshGate:()=>false,...(pulseEnabled?{}:{clockPulseMs:0})});
 controller.register();const initial=await controller.tick();
 window.__j05clock={controller,store,dbName,boot:(await store.read()).state.bootId};
 const state=(await store.read()).state;
 let timers;try{const id=setTimeout(()=>{},1);clearTimeout(id);timers={ok:true}}catch(error){timers={ok:false,error:String(error)}}
 let boundTimers;try{const id=window.setTimeout(()=>{},1);window.clearTimeout(id);boundTimers={ok:true}}catch(error){boundTimers={ok:false,error:String(error)}}
 return {ok:initial?.ok===true,initial,timers,boundTimers,eligible:needsActiveClock(state,state.browserClock?.witness?.routes||[],Date.now()),dbName,state,status:(await browser.storage.local.get('pcmsI12Status')).pcmsI12Status};
}
