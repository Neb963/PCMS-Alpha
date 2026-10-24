// OFFLINE B fixture only. Installed production UI/boundaries/IDB/runners,
// with independent durable provider ledger. Never packaged in the XPI.
export async function installGeneratorFixture(){
 const {openCanonicalDatabase}=await import('./journal.mjs');
 const {createAccountBoundary}=await import('./account-boundary.mjs');
 const {createInventoryBoundary}=await import('./inventory-boundary.mjs');
 const {createInventoryStore}=await import('./inventory.mjs');
 const {createCoordinatorBoundary}=await import('./coordinator-boundary.mjs');
 const {createCoordinatorStore}=await import('./coordinator-store.mjs');
 const {createCreationRunner}=await import('./creation-runner.mjs');
 const {createCreationWatcher}=await import('./creation-watch.mjs');
 const {createAdoptionBoundary}=await import('./adoption-boundary.mjs');
 const db=await openCanonicalDatabase({open:(_name,version)=>indexedDB.open('pcms-j02-ui-fixture',version)});
 let abortNextTransaction=false;
 const proxy=new Proxy(db,{get(target,key){if(key==='transaction')return (...args)=>{const tx=target.transaction(...args);
   if(abortNextTransaction&&args[1]==='readwrite'){abortNextTransaction=false;tx.abort()}return tx};
   const value=target[key];return typeof value==='function'?value.bind(target):value}});
 const open=async()=>proxy,inv=createInventoryStore(proxy),store=createCoordinatorStore(proxy);
 const oracleKey='j02UiProviderOracle',saved=(await browser.storage.local.get(oracleKey))[oracleKey];
 const ledger=saved||{effects:[],resources:[],opened:[],failures:{},initialized:false};
 const persist=()=>browser.storage.local.set({[oracleKey]:ledger});
 const rows=async()=>new Promise((resolve,reject)=>{const t=db.transaction(['meta'],'readonly'),data=[];
  t.oncomplete=()=>resolve(data);t.onabort=reject;t.objectStore('meta').openCursor().onsuccess=e=>{const c=e.target.result;if(c){data.push(c.value);c.continue()}}});
 const put=async data=>{const t=db.transaction(['meta'],'readwrite');for(const r of data)t.objectStore('meta').put(r);await new Promise((r,j)=>{t.oncomplete=r;t.onabort=j})};
 const accountForUid=async uid=>(await rows()).find(x=>x.account?.personaUid===uid)?.account;
 const readiness=async uid=>{const a=await accountForUid(uid);return a?.state==='VERIFIED'&&!ledger.failures[a.accountId]?
  {ready:true,personaUid:uid,cookieStoreId:'fixture-'+a.accountId,routeId:'fixture-protected-'+a.accountId}:
  {ready:false,code:'FIXTURE_ACCOUNT_ROUTE_UNAVAILABLE'}};
 const guard={getSafeRouteReadiness:readiness,
  observeReadOnly:async(uid,_identity,slug)=>{const a=await accountForUid(uid);
   const bytes=new Uint8Array([0,255,128,1]),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
   return {ok:true,principalFingerprint:a.identity.principalFingerprint,original:{ownerResult:'IS_OWNER',visibility:'PUBLIC',
    remotePublicId:'public_0_2',pjs:'output\n  Original source é\n',html:'<p>Original page</p>\n',
    assets:[{path:'src/binary.dat',base64:btoa(String.fromCharCode(...bytes)),size:4,sha256}]}};
  },
  openHumanGenerator:async(uid,slug)=>{const route=await readiness(uid);if(!route.ready)return route;
   ledger.opened.push({uid,slug});await persist();return {ok:true,opened:true}},
  async runSupplyStep(uid,r){
   const a=await accountForUid(uid);if(!(await readiness(uid)).ready)return {ok:false,code:'FIXTURE_ACCOUNT_ROUTE_UNAVAILABLE'};
   const resource=ledger.resources.find(x=>x.slug===r.slug);
   if(r.kind==='READ_TARGET')return resource?{ok:true,source:'INDEPENDENT_TARGET_READBACK',state:'OWNED_VERIFIED',
    ownerMatches:true,slug:r.slug,remoteId:resource.id,visibility:'UNLISTED'}:
    {ok:true,source:'INDEPENDENT_TARGET_READBACK',state:'MISSING_VERIFIED',slug:r.slug};
   if(r.kind==='CREATE'){
    const temporarySlug='j02-temp-'+ledger.resources.length,id='public_j02_'+ledger.resources.length;
    ledger.effects.push({kind:'CREATE',accountId:a.accountId,requested:r.slug});
    ledger.resources.push({slug:temporarySlug,temporarySlug,id,accountId:a.accountId});await persist();
    return {ok:true,ack:'CREATED',temporarySlug};
   }
   if(r.kind==='READ_CREATE'){
    const x=ledger.resources.find(x=>x.temporarySlug===r.temporarySlug);
    return x?{ok:true,source:'INDEPENDENT_READBACK',ownerMatches:true,privateEmpty:true,
     remoteId:x.id,temporarySlug:x.temporarySlug}: {ok:false,code:'FIXTURE_UNKNOWN'};
   }
   if(r.kind==='RENAME'){
    const x=ledger.resources.find(x=>x.id===r.remoteId);if(!x)return {ok:false,code:'FIXTURE_UNKNOWN'};
    ledger.effects.push({kind:'RENAME',accountId:a.accountId,slug:r.slug});x.slug=r.slug;await persist();return {ok:true,ack:'RENAMED'};
   }
   if(r.kind==='READ_RENAME'){
    const x=ledger.resources.find(x=>x.id===r.remoteId&&x.slug===r.slug);
    return x?{ok:true,source:'INDEPENDENT_READBACK',ownerMatches:true,privateEmpty:true,
     remoteId:x.id,previousSlug:x.temporarySlug,slug:x.slug}: {ok:false,code:'FIXTURE_UNKNOWN'};
   }
   throw Error('Unexpected fixture effect '+r.kind);
  }};
 const api={...browser,storage:{local:browser.storage.local},runtime:{...browser.runtime},alarms:browser.alarms};
 const inventory=createInventoryBoundary(api,{open,guard:()=>guard,inventoryReader:async(ctx)=>{
  if(ledger.failures[ctx.accountId])return {ok:false,code:'FIXTURE_INVENTORY_UNAVAILABLE'};
  const owned=(await rows()).filter(x=>x.generator?.accountId===ctx.accountId&&!ledger.resources.some(r=>r.slug===x.generator.slug)).map(x=>x.generator);
  return {source:'GUARDED_PERCHANCE_READBACK',complete:true,...ctx,observedAt:Date.now(),
   observationId:'j02_census_'+crypto.randomUUID(),generators:[...owned.map(g=>({slug:g.slug,remoteId:g.remoteId,
    ownerResult:'IS_OWNER',ownerPrincipalFingerprint:ctx.principalFingerprint,ownerObservationId:'j02_owner_'+crypto.randomUUID(),visibility:g.visibility})),
    ...ledger.resources.filter(x=>x.accountId===ctx.accountId).map(x=>({slug:x.slug,remoteId:'slug-'+x.slug,
     ownerResult:'IS_OWNER',ownerPrincipalFingerprint:ctx.principalFingerprint,ownerObservationId:'j02_owner_'+crypto.randomUUID(),visibility:'UNLISTED'}))]};
 }});
 const runner=createCreationRunner(api,{open,guard:()=>guard,effectGate:()=>true,
  syncInventory:inventory.syncAccount,createGit:()=>({step:async()=>({ok:false,code:'GIT_RECONNECT_REQUIRED'})})});
 const coordinator=createCoordinatorBoundary(api,{open,makeRunner:()=>runner});
 const accounts=createAccountBoundary(api,{open,guard:()=>guard,syncInventory:inventory.syncAccount});
 const adoption=createAdoptionBoundary(api,{open,guard:()=>guard,managementGate:()=>true,gitGate:()=>false});
 const watcher=createCreationWatcher(api,{open,createRunner:()=>runner,maxPerWake:8});
 if(!ledger.initialized){
  const all=[];for(let n=0;n<50;n++){
   const accountId='account_j02_'+String(n).padStart(3,'0'),personaUid='persona-j02-'+String(n).padStart(3,'0');
   const account={accountId,personaUid,revision:3,bindingVersion:1,state:'VERIFIED',alias:'Account '+(n+1),boundPrincipal:'a'.repeat(64),
    identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:'a'.repeat(64)}};
   all.push({key:'account:'+accountId,account});
   for(let i=0;i<24;i++){
    const slug='j02-owned-'+String(n).padStart(3,'0')+'-'+String(i).padStart(3,'0');
    all.push({key:'inventory:'+slug,generator:{slug,accountId,personaUid,revision:1,accountRevision:3,bindingVersion:1,
     remoteId:'public_'+n+'_'+i,ownerState:'OBSERVED_OWNER',visibility:i%2?'UNLISTED':'PUBLIC',
     management:n===0&&i===2?'OBSERVED_ONLY':'MANAGED_CREATED',source:'SOURCE_PENDING',lastObservedAt:Date.now()}});
    if(i%3===0)all.push({key:'source-link:'+slug,link:{slug,accountId,folder:'generators/'+slug,remoteId:'public_'+n+'_'+i,bindingVersion:1}});
   }
   all.push({key:'inventory-batch:'+accountId,source:'GUARDED_PERCHANCE_READBACK',complete:true,conflicts:0,
    countsTrusted:true,lastConfirmedCount:24,countObservedAt:Date.now(),ownedSlugs:all.filter(x=>x.generator?.accountId===accountId).map(x=>x.generator.slug),
    observedAt:Date.now(),observationId:'j02_initial_'+n,accountRevision:3,bindingVersion:1});
  }
  await put(all);const heldAccount=all.find(x=>x.account?.accountId==='account_j02_049').account;
  await put([{key:'account:'+heldAccount.accountId,account:{...heldAccount,state:'VERIFICATION_PENDING'}}]);
  await store.acceptCreate({intentId:'intent_j02_waiting',slug:'j02-held',accountId:heldAccount.accountId,origin:'OPERATOR'});
  ledger.initialized=true;await persist();
 }
 const original=browser.runtime.connect.bind(browser.runtime),boundaries=new Map([
  ['pcms-i03-accounts',accounts],['pcms-i04-inventory',inventory],['pcms-s00-coordinator',coordinator],['pcms-i07-adoption',adoption]]);
 const sender={id:browser.runtime.id,url:browser.runtime.getURL('pcms/index.html')+'#generators'};
 browser.runtime.connect=function(...args){const name=args.at(-1)?.name;if(!boundaries.has(name))return original(...args);
  const handlers=new Set(),disconnected=new Set();let closed=false;
  return {onMessage:{addListener:fn=>handlers.add(fn)},onDisconnect:{addListener:fn=>disconnected.add(fn)},disconnect(){closed=true},
   postMessage(msg){if(msg.type==='APPEND_CREATE_BATCH'&&msg.params.offset>=32&&ledger.failures.intake){
    ledger.failures.intake=false;abortNextTransaction=true;void persist();}
    Promise.resolve(boundaries.get(name).run(msg,sender)).then(out=>{if(!closed)for(const fn of handlers)fn(out)})
    .catch(()=>{if(!closed)for(const fn of disconnected)fn()})}};
 };
 window.__j02={async inspect(){const data=await rows();return {accounts:data.filter(x=>x.account).map(x=>x.account),
  records:data.filter(x=>x.record?.intentId).map(x=>x.record),batches:data.filter(x=>x.batch).map(x=>x.batch),
  inventory:data.filter(x=>x.generator).map(x=>x.generator),ledger:structuredClone(ledger)}},
  async adopt(){return adoption.autoTick()},
  async tick(n=1){for(let i=0;i<n;i++)await watcher.tick();return this.inspect()},
  async interruptInput(){ledger.failures.intake=true;await persist()},
  async hold(accountId,value){ledger.failures[accountId]=value;await persist()},
  async recover(){const data=await rows(),a=data.find(x=>x.account?.accountId==='account_j02_049').account;
   await put([{key:'account:'+a.accountId,account:{...a,state:'VERIFIED'}}]);return true},
  async census(accountId){const data=await rows(),a=data.find(x=>x.account?.accountId===accountId).account;return inventory.syncAccount(accountId,a.revision)},
  async recheck(){await inventory.recoverIdentities();return this.inspect()}
 };
 return {ok:true,inventory:(await inv.list()).total};
}
