// Real registered production path, persistent canonical IDB and actual native
// effect. The provider fixture withholds source readback after one save until
// Firefox is closed. Recovery must only read the same operation, never replay.
const phase=arguments[0],done=arguments[arguments.length-1];
(async()=>{
  const slug='i17-entry-wake',accountId='i17_entry_wake_account';
  const context=(await browser.storage.local.get('pcmsI17FixtureContext')).pcmsI17FixtureContext;
  const command=(type,params={})=>new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:'pcms-i12-refresher'});let ended=false;
    port.onMessage.addListener(v=>{if(ended)return;ended=true;resolve(v);port.disconnect();});
    port.onDisconnect.addListener(()=>{if(!ended)reject(Error('Production port disconnected'));});port.postMessage({type,params});
  });
  const must=(v,label)=>{if(!v?.ok)throw Error(label+': '+v?.code);return v;};
  const {openCanonicalDatabase}=await import('./journal.mjs'),core=await import('./refresher-core.mjs');
  const {createRefresherStore}=await import('./refresher-store.mjs'),db=await openCanonicalDatabase();
  const route=await browser.runtime.sendMessage({type:'TEST_PROFILE',profileId:context.cookieStoreId});
  if(!route?.ok)throw Error('Real donor protected fixture route not verified');
  const login=await browser.tabs.create({url:'https://perchance.org/fixture-login',cookieStoreId:context.cookieStoreId,active:false});
  let loaded=false;
  for(let i=0;i<160;i++){
    const t=await browser.tabs.get(login.id);if(t.url==='https://perchance.org/fixture-login'&&t.status==='complete'){loaded=true;break;}
    await new Promise(r=>setTimeout(r,50));
  }
  if(!loaded)throw Error('Protected fixture login timed out');
  const transact=fn=>new Promise((resolve,reject)=>{
    const t=db.transaction('meta','readwrite');fn(t.objectStore('meta'));t.oncomplete=resolve;t.onabort=()=>reject(Error('Fixture state transaction failed'));
  });
  if(phase==='PREPARE'){
    const {exactSource}=await import('./staging-core.mjs');
    const base=await exactSource([{path:'main.pjs',base64:btoa('output = fixture')},
      {path:'index.html',base64:btoa('<!doctype html>\n<main>[output]</main>')}]);
    const principal=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('fixture@example.invalid')))].map(x=>x.toString(16).padStart(2,'0')).join('');
    const owner={slug,accountId,personaUid:context.personaUid,bindingVersion:1,remoteId:'public_'+slug};
    await transact(m=>{
      m.put({key:'account:'+accountId,account:{accountId,personaUid:context.personaUid,bindingVersion:1,revision:1,state:'VERIFIED',
        identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:principal}}});
      m.put({key:'inventory:'+slug,generator:{...owner,ownerState:'OBSERVED_OWNER',visibility:'PUBLIC',lastObservedAt:Date.now(),revision:1}});
      m.put({key:'release:'+slug,release:{...owner,principalFingerprint:principal,state:'CONFIRMED_PUBLIC',source:'INDEPENDENT_PUBLICATION_READBACK',
        sourceFingerprint:base.fingerprint,observationId:'observed_entry_wake',observedAt:Date.now()}});
    });
    must(await command('OBSERVE_NOW'),'initial turn');
    const row=must(await command('GET_REFRESHER',{query:slug,limit:5}),'queue').items.find(r=>r.slug===slug);
    if(!row)throw Error('Missing canonical source wake row');
    const target={stableId:row.stableId};
    const preview=must(await command('PREVIEW_SOURCE_REFRESH',{...target,expectedRevision:0}),'preview').sourceRefresh;
    const consent=must(await command('CONSENT_SOURCE_REFRESH',{...target,expectedRevision:preview.revision,
      confirmation:'CONSENT '+slug+' '+base.fingerprint}),'consent').sourceRefresh;
    const intent='TEST '+slug+' '+preview.preview.plan.expectedPostSaveFingerprint;
    const attempts=await Promise.all([
      command('TEST_SOURCE_REFRESH',{...target,expectedRevision:consent.revision,confirmation:intent}),
      command('TEST_SOURCE_REFRESH',{...target,expectedRevision:consent.revision,confirmation:intent})]);
    if(attempts.filter(r=>r.ok).length!==1)throw Error('Concurrent production claims were not fenced: '+JSON.stringify(attempts));
    const duplicate=attempts.find(r=>!r.ok);
    const receipt=must(await command('GET_SOURCE_REFRESH',target),'uncertain receipt').sourceRefresh;
    if(receipt.state!=='HELD_UNCERTAIN'||receipt.intent?.state!=='DISPATCH_POSSIBLE'||receipt.proof?.effect!=='EFFECT_UNVERIFIED')
      throw Error('Source-unavailable native save lost its uncertain intent');
    const read=await createRefresherStore(db).read(),r=read.state.rows.find(r=>r.slug===slug);
    // Test clock fixture only: make the existing READBACK due at process wake.
    // No dispatch/consent/source authority is changed or manufactured.
    r.refresh.nextAttemptAt=0;
    await transact(m=>m.put({key:core.REFRESHER_KEY,state:read.state}));
    await browser.tabs.remove(login.id);db.close();
    done({ok:true,phase,stableId:row.stableId,id:receipt.intent.id,state:receipt.state,duplicate:duplicate.code,
      expectedPostSaveFingerprint:preview.preview.plan.expectedPostSaveFingerprint});return;
  }
  if(phase!=='VERIFY')throw Error('Unknown source-wake phase');
  const before=await createRefresherStore(db).read(),original=before.state.rows.find(r=>r.slug===slug),id=original?.refresh?.intent?.id||
    original?.sourceRefresh?.lastProof?.id;
  if(!id)throw Error('Persistent source intent missing after process restart');
  // Real startup/alarm may already have reconciled; repeated normal ticks
  // must remain read-only with no qualified recurring scope.
  must(await command('OBSERVE_NOW'),'recovery turn');must(await command('OBSERVE_NOW'),'duplicate wake');
  const view=must(await command('GET_REFRESHER',{query:slug,limit:5}),'recovered queue'),row=view.items.find(r=>r.slug===slug);
  const receipt=must(await command('GET_SOURCE_REFRESH',{stableId:row.stableId}),'recovered receipt').sourceRefresh;
  if(receipt.intent||receipt.proof?.id!==id||receipt.proof.effect!=='EFFECT_CONFIRMED'||receipt.proof.feed.state!=='PRESENT'||
    receipt.effectiveCurrentFingerprint!==receipt.proof.marker?.expectedPostSaveFingerprint||receipt.scheduleEnabled)
    throw Error('Source cold wake did not independently reconcile the exact original intent');
  const observations=await new Promise((resolve,reject)=>{
    const t=db.transaction('observations','readonly'),r=t.objectStore('observations').getAll();let rows;
    r.onsuccess=()=>rows=r.result;t.oncomplete=()=>resolve(rows);t.onabort=reject;
  });
  for(const prefix of ['refresh_intent_','refresh_dispatch_','refresh_marker_'])
    if(observations.filter(r=>r.id===prefix+id).length!==1)throw Error('Missing/duplicate immutable '+prefix+'tombstone');
  const replay=await command('TEST_SOURCE_REFRESH',{stableId:row.stableId,expectedRevision:receipt.revision,
    confirmation:'TEST '+slug+' '+receipt.effectiveCurrentFingerprint});
  if(replay.ok)throw Error('Process-cold single-test replay admitted');
  await transact(m=>{
    for(const key of ['account:'+accountId,'inventory:'+slug,'release:'+slug,'refresh-source:'+slug])m.delete(key);
    m.put({key:core.REFRESHER_KEY,state:core.emptyShadow()});
  });
  for(const t of await browser.tabs.query({}))if(t.cookieStoreId===context.cookieStoreId&&t.url==='https://perchance.org/fixture-login')
    await browser.tabs.remove(t.id);
  db.close();done({ok:true,phase,id,state:receipt.state,effect:receipt.proof.effect,feed:receipt.proof.feed.state,
    replay:replay.code,immutableIntentDispatchAndMarker:true});
})().catch(e=>done({error:'I17_SOURCE_SAVE_PROCESS_COLD_RECOVERY_FAILED',detail:String(e),stack:e?.stack?.slice(0,900)}));
