const done=arguments[arguments.length-1],trace=[];
(async()=>{
  const journal=await import('./journal.mjs'),core=await import('./refresher-core.mjs');
  const {createRefresherStore}=await import('./refresher-store.mjs');
  const {createRefresherBoundary}=await import('./refresher-boundary.mjs');
  const {createRefresherProviderAdapter}=await import('./refresher-provider-adapter.mjs');
  const {createPersonaGuard}=await import('./persona-guard.mjs');
  const {runRefreshOwnedTab}=await import('./refresh-owned-tab.mjs');
  const {perchanceReadIsolated}=await import('./perchance-observer.mjs');
  const {perchanceMonitorIsolated}=await import('./perchance-monitor.mjs');
  const {exactSource}=await import('./staging-core.mjs');
  const {canonicalJson,digestReview}=await import('./refresh-review.mjs');
  const db=await journal.openCanonicalDatabase({open:(_name,version)=>indexedDB.open('pcms-i17-source-save-b-fixture',version)});
  let now=Date.now(),sequence=1,closed=false,leaseCount=0,markedBeforeSave=0,saves=0;
  const {pcmsI17FixtureContext:context}=await browser.storage.local.get('pcmsI17FixtureContext');
  if(!context)throw Error('No protected local fixture route');
  const {personaUid,cookieStoreId,routeId}=context,accountId='i17_native_account';
  const snapshot=await browser.runtime.sendMessage({type:'GET_SNAPSHOT'});
  trace.push({actualProfile:snapshot.state.profiles[cookieStoreId],actualRoute:snapshot.state.routes[routeId],security:snapshot.security});
  browser.webRequest.onErrorOccurred.addListener(d=>trace.push({networkError:d.error,url:d.url}),{urls:['https://perchance.org/*']});
  browser.webRequest.onCompleted.addListener(d=>trace.push({networkComplete:d.statusCode,url:d.url}),{urls:['https://perchance.org/*']});
  const principal=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('fixture@example.invalid')))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const baseFiles=[{path:'main.pjs',base64:btoa('output = fixture')},
    {path:'index.html',base64:btoa('<!doctype html>\n<main>[output]</main>')}];
  const base=await exactSource(baseFiles);
  let abortDispatch=false;
  const dbWithAbort=new Proxy(db,{get(target,k){
    if(k!=='transaction'){const v=Reflect.get(target,k,target);return typeof v==='function'?v.bind(target):v;}
    return (...args)=>{
      const tx=target.transaction(...args);
      if(!abortDispatch||args[1]!=='readwrite')return tx;
      return new Proxy(tx,{get(t,k){
        if(k==='objectStore')return name=>{
          const object=t.objectStore(name);
          if(name!=='meta')return object;
          return new Proxy(object,{get(o,k){
            if(k==='put')return value=>{
              const req=o.put(value);
              if(value?.key===core.REFRESHER_KEY&&value.state.rows.some(r=>r.refresh?.intent?.state==='DISPATCH_POSSIBLE'))t.abort();
              return req;
            };
            const v=Reflect.get(o,k,o);return typeof v==='function'?v.bind(o):v;
          }});
        };
        const v=Reflect.get(t,k,t);return typeof v==='function'?v.bind(t):v;
      },set(t,k,v){return Reflect.set(t,k,v,t);}});
    };
  }});

  const state={profiles:{[cookieStoreId]:{personaUid,routeId}},routes:{[routeId]:{id:routeId,enabled:true}}};
  const shared={resolve:async uid=>{if(uid!==personaUid)throw Error('wrong persona');return {
    personaUid,cookieStoreId,routeId,route:{enabled:true}};},
    acquire:async()=>{leaseCount++;return {leaseId:'lease_'+leaseCount,expiresAt:Date.now()+15000};},
    validate:async()=>({cookieStoreId}),release:async()=>{}};
  const login=await browser.tabs.create({url:'https://perchance.org/fixture-login',cookieStoreId,active:false});
  let loginReady=false;
  for(let i=0;i<160;i++){
    const t=await browser.tabs.get(login.id);if(t.status==='complete'&&t.url==='https://perchance.org/fixture-login')break;
    await new Promise(r=>setTimeout(r,50));
  }
  {const t=await browser.tabs.get(login.id);loginReady=t.status==='complete'&&t.url==='https://perchance.org/fixture-login';}
  if(!loginReady)throw Error('Protected login fixture did not load; refusing injection');
  const inject=async(tabId,func,args,world='ISOLATED')=>{
    let out;try{out=await browser.scripting.executeScript({target:{tabId,frameIds:[0]},world,func,args});}
    catch(e){trace.push({func:func.name,world,error:String(e).slice(0,200),tab:await browser.tabs.get(tabId)});throw e;}
    trace.push({func:func.name,world,code:out?.[0]?.result?.code||null,error:out?.[0]?.error?.message||null});
    if(out?.length!==1||out[0].frameId!==0||out[0].error)throw Error('injection failed');return out[0].result;
  };
  const isolated=async(_lease,options)=>{
    const identity=await inject(login.id,perchanceReadIsolated,[options.monitoringRequest?{identityOnly:true}:options]);
    if(!identity.ok)return identity;
    if(!options.monitoringRequest)return identity;
    const packet=await inject(login.id,perchanceMonitorIsolated,[options.monitoringRequest]);
    return {...packet,principalFingerprint:identity.principalFingerprint};
  };
  // Only low-level provider/native-route dependencies are fixtures. Real
  // packaged guard, donor fixed executor, native MAIN/ISOLATED injection,
  // source adapter, command boundary and committed IDB are all exercised.
  const fixtureBrowser={...browser,tabs:{...browser.tabs,
    query:q=>browser.tabs.query(q),create:async p=>{const t=await browser.tabs.create(p);trace.push({tabCreated:t});return t;},
    get:async id=>{const t=await browser.tabs.get(id);trace.push({tabRead:t});return t;},remove:id=>browser.tabs.remove(id)},
    sessions:{...browser.sessions,setTabValue:(...p)=>browser.sessions.setTabValue(...p),
      getTabValue:async(...p)=>{const tag=await browser.sessions.getTabValue(...p);trace.push({tag});return tag;}},scripting:{...browser.scripting,executeScript:async request=>{
    if(request.func?.name==='perchanceRefreshMain'&&request.args?.[0]?.action==='SAVE'){
      const read=await createRefresherStore(db).read(),slug=request.args[0].slug;
      const row=read.state.rows.find(r=>r.slug===slug);
      if(row?.refresh?.intent?.state!=='DISPATCH_POSSIBLE')throw Error('native effect without committed journal');
      markedBeforeSave++;saves++;
    }
    return browser.scripting.executeScript(request);
  }}};
  const guard=createPersonaGuard({initialize:async()=>{},securityState:{ready:true,privacySafe:true},shared,
    getRouteTest:async()=>({ok:true,data:{ip:'203.0.113.10'}}),readIsolatedTab:isolated,
    refreshIsolatedTab:(lease,req,commit)=>runRefreshOwnedTab(fixtureBrowser,{getState:async()=>state,
      validate:shared.validate,routeTest:()=>({ok:true})},lease,req,commit)});
  const adapter=createRefresherProviderAdapter(browser,{database:async()=>dbWithAbort,guard:()=>guard,
    sentinel:{inspect:async()=>({held:false})},clock:()=>now,newId:()=>String(sequence++).padStart(32,'0')});
  const boot='i17_native_fixture_boot';
  const api={runtime:browser.runtime,storage:browser.storage,alarms:{get:async name=>({name,scheduledTime:now+60000}),create:async()=>{}}};
  const boundary=createRefresherBoundary(api,{open:async()=>dbWithAbort,guard:()=>guard,clock:()=>now,newId:()=>boot,
    observationGate:()=>true,refreshAdapter:adapter,refreshGate:r=>r?r.sourceRefresh?.scheduleEnabled===true:true,
    qualificationFor:r=>adapter.qualificationFor(r)});
  const sender={id:browser.runtime.id,url:browser.runtime.getURL('pcms/index.html')+'#refresher'};
  const command=(type,p={})=>boundary.run({type,params:p},sender);
  const must=(x,label)=>{if(!x?.ok)throw Error(label+': '+x?.code);return x;};
  await new Promise((resolve,reject)=>{const t=db.transaction('meta','readwrite'),m=t.objectStore('meta');
    m.put({key:'account:'+accountId,account:{accountId,personaUid,bindingVersion:1,revision:1,state:'VERIFIED',
      identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:principal}}});
    for(const scenario of ['present','absent','no-persist','lost-ack','dirty','idb-abort']){
      const slug='i17-native-'+scenario,remoteId='public_'+slug;
      m.put({key:'inventory:'+slug,generator:{slug,accountId,personaUid,bindingVersion:1,remoteId,
        ownerState:'OBSERVED_OWNER',visibility:'PUBLIC',lastObservedAt:now,revision:1}});
      m.put({key:'release:'+slug,release:{slug,accountId,personaUid,bindingVersion:1,remoteId,
        principalFingerprint:principal,state:'CONFIRMED_PUBLIC',source:'INDEPENDENT_PUBLICATION_READBACK',
        sourceFingerprint:base.fingerprint,observationId:'observed_'+scenario,observedAt:now}});
    }
    m.put({key:core.REFRESHER_KEY,state:core.emptyShadow()});t.oncomplete=resolve;t.onabort=()=>reject(Error('seed abort'));});
  const results={};
  for(const scenario of ['present','absent','no-persist','lost-ack','dirty','idb-abort']){
    const slug='i17-native-'+scenario,store=createRefresherStore(db);
    await store.turn({now,bootId:boot});const snapshot=await store.read(),row=snapshot.state.rows.find(r=>r.slug===slug);
    const params={stableId:row.stableId};
    const preview=must(await command('PREVIEW_SOURCE_REFRESH',{...params,expectedRevision:0}),'preview '+scenario).sourceRefresh;
    const consent=must(await command('CONSENT_SOURCE_REFRESH',{...params,expectedRevision:preview.revision,
      confirmation:'CONSENT '+slug+' '+base.fingerprint}),'consent '+scenario).sourceRefresh;
    abortDispatch=scenario==='idb-abort';
    const attempt=await command('TEST_SOURCE_REFRESH',{...params,expectedRevision:consent.revision,
      confirmation:'TEST '+slug+' '+consent.preview.plan.expectedPostSaveFingerprint});
    abortDispatch=false;
    if(['dirty','idb-abort'].includes(scenario)){if(attempt.ok)throw Error('Unsafe test admitted '+scenario);}
    else must(attempt,'test '+scenario);
    const receipt=must(await command('GET_SOURCE_REFRESH',params),'receipt').sourceRefresh;
    const duplicate=await command('TEST_SOURCE_REFRESH',{...params,expectedRevision:receipt.revision,
      confirmation:'TEST '+slug+' '+consent.preview.plan.expectedPostSaveFingerprint});
    if(duplicate.ok)throw Error('replayed one-shot test');
    results[scenario]={state:receipt.state,effect:receipt.proof?.effect||'NOT_DISPATCHED',feed:receipt.proof?.feed?.state||'UNKNOWN',
      fingerprint:receipt.effectiveCurrentFingerprint,duplicate:duplicate.code,source:receipt.proof?.marker?.source||null};
    // The same installed package promotes a reviewed target and schedules a
    // replacement marker, with real committed source provenance preserved.
    if(scenario==='present'){
      const resource=must(await command('MEASURE_REFRESH_RESOURCES'),'resource').resource;
      const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
      const raw=await crypto.subtle.exportKey('jwk',pair.publicKey),publicKey={kty:raw.kty,crv:raw.crv,x:raw.x,y:raw.y};
      const fingerprint=await digestReview(publicKey);
      must(await command('TRUST_REFRESH_REVIEWER',{publicKey,confirmation:'TRUST '+fingerprint}),'trust');
      const challenge=must(await command('GET_REFRESH_REVIEW_CHALLENGE',params),'challenge').challenge;
      const payload={...challenge,repeatedUsePermitted:true,permissionEvidence:'independent-isolated-provider-review',minimumIntervalMs:600000,maxTurnMs:10000};
      const sig=await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,new TextEncoder().encode(canonicalJson(payload)));
      const signature=btoa(String.fromCharCode(...new Uint8Array(sig)));
      const qualified=must(await command('IMPORT_REFRESH_REVIEW',{...params,expectedRevision:receipt.revision,
        envelope:{payload,signature}}),'qualified').sourceRefresh;
      const opted=must(await command('SET_REFRESH_SCHEDULE',{...params,expectedRevision:qualified.revision,
        enabled:true,confirmation:'SCHEDULE '+slug}),'opted').sourceRefresh;
      const st=await store.read();const current=st.state.rows.find(r=>r.slug===slug);
      current.slot=true;current.phase='ACTIVE';current.allocationEpoch=1;
      st.state.accounts[accountId].health='HEALTHY';st.state.accounts[accountId].healthAt=now+600001;
      now+=600001;
      await new Promise((resolve,reject)=>{const t=db.transaction('meta','readwrite');
        t.objectStore('meta').put({key:core.REFRESHER_KEY,state:st.state});t.oncomplete=resolve;t.onabort=reject;});
      const tick=await boundary.tick();
      const scheduled=must(await command('GET_SOURCE_REFRESH',params),'scheduled').sourceRefresh;
      results.recurring={tick:tick.refresh,sequence:scheduled.proof.marker?.sequence,source:scheduled.proof.marker?.source,
        enabled:opted.scheduleEnabled,resource:{accounts:resource.accounts,generators:resource.generators,turnMs:resource.turnMs,
          serializedBytes:resource.serializedBytes,storageUsage:resource.storageUsage,storageQuota:resource.storageQuota}};
      const after=await store.read();must(await store.pause(after.state.revision,'GENERATOR',row.stableId,true),'pause');
      await boundary.tick();
      const revoked=await command('REVOKE_REFRESH_REVIEW',{...params,expectedRevision:scheduled.revision});
      must(revoked,'revoke');
    }
    // Preserve ambiguous editor tabs during the operation, then close only
    // as explicit test-profile cleanup after independent receipt inspection.
    const tabs=await browser.tabs.query({});for(const t of tabs)if(t.url==='https://perchance.org/'+slug+'#edit')await browser.tabs.remove(t.id);
    now+=600001;
  }
  await browser.tabs.remove(login.id);db.close();
  done({ok:true,results,markedBeforeSave,saves,leaseCount});
})().catch(e=>done({error:'I17_SOURCE_SAVE_PACKAGED_PROBE_FAILED',detail:String(e),stack:e?.stack?.slice(0,900),trace:[trace[0],...trace.slice(-14)]}));
