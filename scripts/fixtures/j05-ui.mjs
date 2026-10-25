// OFFLINE installed UI fixture: real IDB + production typed boundaries.
// Only provider inventory/feed facts are modeled. Never packaged.
export async function installRefresherFixture(){
 const {openCanonicalDatabase}=await import('./journal.mjs'),{createRefresherStore}=await import('./refresher-store.mjs');
 const {emptyShadow,reconcileShadow,REFRESHER_KEY}=await import('./refresher-core.mjs'),{exactSource}=await import('./staging-core.mjs');
 const {createRefresherBoundary}=await import('./refresher-boundary.mjs'),{createAccountBoundary}=await import('./account-boundary.mjs');
 const db=await openCanonicalDatabase({open:(_n,v)=>indexedDB.open('pcms-j05-ui-fixture',v)}),store=createRefresherStore(db);
 const read=key=>new Promise((resolve,reject)=>{const q=db.transaction('meta','readonly').objectStore('meta').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=reject});
 const put=rows=>new Promise((resolve,reject)=>{const t=db.transaction('meta','readwrite');for(const r of rows)t.objectStore('meta').put(r);t.oncomplete=resolve;t.onabort=reject});
 if(!await read('j05-initialized')){
  const now=Date.now(),all=[],inputs=[],source=await exactSource([{path:'main.pjs',base64:btoa('output\n  J05 original\n')},{path:'index.html',base64:btoa('<p>Original source</p>')}]);
  for(let i=0;i<55;i++){const accountId='account-j05-'+String(i).padStart(2,'0'),personaUid='persona-j05-'+i;
   all.push({key:'account:'+accountId,account:{accountId,personaUid,bindingVersion:1,revision:1,state:'VERIFIED',alias:i===54?'Empty account':'Account '+i,
    identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:'a'.repeat(64)}}});
  }
  for(let i=0;i<1200;i++){
   const slug='j05-generator-'+String(i).padStart(4,'0'),n=i%54,accountId='account-j05-'+String(n).padStart(2,'0'),personaUid='persona-j05-'+n,remoteId='remote-'+slug;
   inputs.push({slug,accountId,personaUid,bindingVersion:1,remoteId,ownerVerified:true,releaseVerified:true,releaseFingerprint:source.fingerprint,listing:'PUBLIC',accountVerified:true,principalFingerprint:'a'.repeat(64)});
   const generator={slug,accountId,personaUid,bindingVersion:1,remoteId,revision:1,ownerState:'OBSERVED_OWNER',visibility:'PUBLIC'};
   all.push({key:'inventory:'+slug,generator},{key:'source-link:'+slug,link:{...generator,folder:'generators/'+slug}},
    {key:'adoption:'+slug,adoption:{...generator,principalFingerprint:'a'.repeat(64),remotePublicId:remoteId,archiveState:'ARCHIVED_GIT_CONFIRMED',
     original:{...source,source:'INDEPENDENT_FULL_BYTE_READBACK',sourceStage:'PCMS_STAGED_SOURCE_V1',stagedFingerprint:source.fingerprint,remotePublicId:remoteId,visibility:'PUBLIC'}}});
  }
  const state=reconcileShadow(emptyShadow(),inputs).state;state.bootId='boot_j05_fixture';state.lastTurnAt=now;state.provider={state:'HEALTHY',observedAt:now};
  for(const [id,a] of Object.entries(state.accounts)){a.health=id.endsWith('53')?'UNAVAILABLE':'HEALTHY';a.healthAt=now;if(id.endsWith('53'))a.graceUsed=120000;}
  state.rows[0].phase='ACTIVE';state.rows[0].slot=true;state.rows[0].activeRemaining=1234567;state.rows[0].admittedAt=now;
  state.rows[1].phase='SLEEPING';state.rows[1].sleepRemaining=6543210;state.rows[1].restCheckpointAt=now;
  state.rows[0].presence={source:'GUARDED_RECENT_LIST',present:true,position:3,observedAt:now};
  state.rows[1].presence={source:'GUARDED_RECENT_LIST',present:false,position:null,observedAt:now};
  Object.assign(state.rows[0].refresh,{state:'EFFECT_CONFIRMED',savedSourceFingerprint:source.fingerprint,awaitingVisibility:true,history:[{at:now-1000,effect:'EFFECT_CONFIRMED'}]});
  state.recent={...state.recent,complete:true,observedAt:now,total:100,nextDueAt:now+600000,
   latestOccupancy:{at:now,feedSize:100,ownedPublic:1200,ownedVisible:25,activeVisible:1},samples:[{at:now,feedSize:100,ownedPublic:1200,ownedVisible:25,activeVisible:1}]};
  state.capacity={defensible:100,observedAt:now,samples:[{at:now,value:100},{at:now-600000,value:100},{at:now-1200000,value:100}]};
  all.push({key:REFRESHER_KEY,state},{key:'j05-initialized',value:true});await put(all);
 }
 const guard={getSafeRouteReadiness:async uid=>uid==='persona-j05-53'?{ready:false,code:'PROTECTED_ROUTE_UNAVAILABLE'}:{ready:true,personaUid:uid,cookieStoreId:'container-'+uid,routeId:'protected-'+uid,healthDomain:'health-'+uid}};
 const controller=createRefresherBoundary(browser,{open:async()=>db,guard:()=>guard,observationGate:()=>true,refreshGate:()=>false});
 const accountController=createAccountBoundary(browser,{open:async()=>db,guard:()=>guard});
 const sender={id:browser.runtime.id,url:browser.runtime.getURL('pcms/index.html')},commands=[];let lose=false;
 const original=browser.runtime.connect.bind(browser.runtime);
 browser.runtime.connect=function(...args){
  const port=args.at(-1)?.name;if(!['pcms-i12-refresher','pcms-i03-accounts'].includes(port))return original(...args);
  const messages=new Set(),disconnected=new Set();let closed=false;
  return {onMessage:{addListener:f=>messages.add(f)},onDisconnect:{addListener:f=>disconnected.add(f)},disconnect(){closed=true},
   postMessage(msg){Promise.resolve((port==='pcms-i12-refresher'?controller.run:accountController.run)(msg,sender)).then(out=>{
    commands.push({type:msg.type,ok:out?.ok,code:out?.code});if(lose&&msg.type==='SET_GENERATOR_POLICY'){lose=false;for(const f of disconnected)f();return}
    if(!closed)for(const f of messages)f(out);
   }).catch(e=>{commands.push({error:String(e)});if(!closed)for(const f of disconnected)f()})}};
 };
 window.__j05={async inspect(){return {...await store.read(),commands:structuredClone(commands)}},
  loseAck(){lose=true;return true},
  async touch(){const s=(await store.read()).state;return store.changePolicy(s.revision,{activeMs:77*60000})},
  async staleFeed(){const s=(await store.read()).state;s.recent.complete=false;s.recent.observedAt=Date.now()-1800000;s.recent.latestOccupancy.at=s.recent.observedAt;await put([{key:REFRESHER_KEY,state:s}]);return true},
  async fresh(){return controller.run({type:'GET_REFRESHER',params:{}},sender)}};
 return {ok:true,accounts:55,generators:1200};
}
