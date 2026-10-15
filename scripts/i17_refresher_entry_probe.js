const done=arguments[arguments.length-1];
(async()=>{
  const context=(await browser.storage.local.get('pcmsI17FixtureContext')).pcmsI17FixtureContext;
  const route=await browser.runtime.sendMessage({type:'TEST_PROFILE',profileId:context.cookieStoreId});
  if(!route?.ok||route.dns?.checked!==true)throw Error('Real donor local proxy verification failed: '+JSON.stringify(route));
  const login=await browser.tabs.create({url:'https://perchance.org/fixture-login',cookieStoreId:context.cookieStoreId,active:false});
  const wait=async(test,label)=>{for(let i=0;i<240;i++){const result=await test();if(result)return result;
    await new Promise(r=>setTimeout(r,25));}throw Error('Timed out: '+label);};
  await wait(async()=>{const t=await browser.tabs.get(login.id);return t.url==='https://perchance.org/fixture-login'&&t.status==='complete';},'login fixture');
  const {exactSource}=await import('./staging-core.mjs'),journal=await import('./journal.mjs'),core=await import('./refresher-core.mjs');
  const source=await exactSource([{path:'main.pjs',base64:btoa('output = fixture')},
    {path:'index.html',base64:btoa('<!doctype html>\n<main>[output]</main>')}]);
  const principal=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('fixture@example.invalid')))].map(x=>x.toString(16).padStart(2,'0')).join('');
  const slug='i17-entry-present',accountId='i17_entry_account',remoteId='public_'+slug,db=await journal.openCanonicalDatabase();
  await new Promise((resolve,reject)=>{const t=db.transaction('meta','readwrite'),m=t.objectStore('meta');
    m.put({key:'account:'+accountId,account:{accountId,personaUid:context.personaUid,bindingVersion:1,revision:1,state:'VERIFIED',
      identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:principal}}});
    const owner={slug,accountId,personaUid:context.personaUid,bindingVersion:1,remoteId};
    m.put({key:'inventory:'+slug,generator:{...owner,ownerState:'OBSERVED_OWNER',visibility:'PUBLIC',lastObservedAt:Date.now(),revision:1}});
    m.put({key:'release:'+slug,release:{...owner,principalFingerprint:principal,state:'CONFIRMED_PUBLIC',
      source:'INDEPENDENT_PUBLICATION_READBACK',sourceFingerprint:source.fingerprint,observationId:'observed_entry_01',observedAt:Date.now()}});
    t.oncomplete=resolve;t.onabort=reject;});
  const command=(type,params={})=>new Promise((resolve,reject)=>{
    const port=browser.runtime.connect({name:'pcms-i12-refresher'});let ended=false;
    port.onMessage.addListener(v=>{if(ended)return;ended=true;resolve(v);port.disconnect();});
    port.onDisconnect.addListener(()=>{if(!ended)reject(Error('Production port disconnected'));});port.postMessage({type,params});
  });
  await command('OBSERVE_NOW');
  const view=await command('GET_REFRESHER',{query:slug,limit:5});
  if(!view.ok||!view.sourceSaveAvailable||view.refreshCapability!=='GUARDED_SOURCE_SAVE')throw Error('Production adapter missing');
  const row=view.items.find(r=>r.slug===slug);if(!row)throw Error('Production target did not enter canonical queue');
  location.hash='#refresher';document.getElementById('pcms-refresher-query').value=slug;
  document.getElementById('pcms-refresher-reload').click();
  const target=await wait(()=>[...document.querySelectorAll('#pcms-refresher-rows button')].find(b=>b.textContent===slug),'target row');target.click();
  await wait(()=>document.getElementById('pcms-refresher-source-status').textContent==='METHOD NOT CONFIGURED','initial source receipt');
  document.getElementById('pcms-refresher-source-preview').click();
  await wait(()=>!document.getElementById('pcms-refresher-source-consent').disabled,'marker preview');
  const before=(await command('GET_SOURCE_REFRESH',{stableId:row.stableId})).sourceRefresh;
  if(!before?.preview?.plan)throw Error('No canonical source preview from production');
  const confirm=async(button,text,negative=false)=>{
    document.getElementById(button).click();
    const form=await wait(()=>document.querySelector('.pcms-refresh-source form.pcms-typed-intent'),'inline consent');
    const input=form.querySelector('input');if(document.activeElement!==input)throw Error('Inline intent lost keyboard focus: '+button);
    if(negative){input.value='WRONG';form.requestSubmit();
      if(form.querySelector('[role=status]').textContent.indexOf('does not match')<0)throw Error('Mismatched consent accepted');}
    input.value=text;form.requestSubmit();
  };
  await confirm('pcms-refresher-source-consent','CONSENT '+slug+' '+source.fingerprint,true);
  await wait(()=>!document.getElementById('pcms-refresher-source-test').disabled,'scoped consent');
  await confirm('pcms-refresher-source-test','TEST '+slug+' '+before.preview.plan.expectedPostSaveFingerprint);
  await wait(()=>document.getElementById('pcms-refresher-source-status').textContent==='RECENT PRESENT','source/feed result');
  const saved=await command('GET_SOURCE_REFRESH',{stableId:row.stableId}),receipt=saved.sourceRefresh;
  if(receipt.proof?.effect!=='EFFECT_CONFIRMED'||receipt.proof.feed.state!=='PRESENT'||
    receipt.effectiveCurrentFingerprint!==before.preview.plan.expectedPostSaveFingerprint||
    !document.getElementById('pcms-refresher-source-test').disabled)throw Error('Production UI/source result did not match exact intent');
  const duplicate=await command('TEST_SOURCE_REFRESH',{stableId:row.stableId,expectedRevision:receipt.revision,
    confirmation:'TEST '+slug+' '+receipt.effectiveCurrentFingerprint});
  if(duplicate.ok)throw Error('Production entry replayed a single-target save');
  const recurringDetails=document.getElementById('pcms-refresher-source-measure').closest('details');
  if(!recurringDetails.open)recurringDetails.querySelector('summary').click();
  document.getElementById('pcms-refresher-source-measure').click();
  await wait(()=>document.getElementById('pcms-refresher-source-review-state').textContent.includes('50 accounts / 1250 generators'),
    'same-XPI resource UI');
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const raw=await crypto.subtle.exportKey('jwk',pair.publicKey),publicKey={kty:raw.kty,crv:raw.crv,x:raw.x,y:raw.y};
  const {canonicalJson,digestReview}=await import('./refresh-review.mjs'),fingerprint=await digestReview(publicKey);
  document.getElementById('pcms-refresher-source-key').value=JSON.stringify(publicKey);
  await confirm('pcms-refresher-source-trust','TRUST '+fingerprint);
  await wait(()=>document.getElementById('pcms-refresher-source-review-state').textContent.includes(fingerprint),'pinned reviewer UI');
  // Observe the export's actual Blob and anchor in the installed page. Prevent
  // only the test download navigation; the production handler runs unchanged.
  const exports=[],createUrl=URL.createObjectURL;
  const capture=e=>{if(e.target?.download?.startsWith('pcms-'))e.preventDefault();};
  URL.createObjectURL=blob=>{exports.push(blob.text().then(JSON.parse));return createUrl.call(URL,blob);};
  document.addEventListener('click',capture,true);
  let challenge;
  try{
    document.getElementById('pcms-refresher-source-export').click();
    await wait(()=>exports.length===1,'redacted receipt export');
    const exported=await exports[0];
    if(exported.proof?.id!==receipt.proof.id||JSON.stringify(exported).includes('synthetic-fixture-token-only')||
      JSON.stringify(exported).includes('output = fixture'))throw Error('Export lost canonical proof or leaked source/session');
    document.getElementById('pcms-refresher-source-challenge').click();
    await wait(()=>exports.length===2,'review challenge export');challenge=await exports[1];
  }finally{URL.createObjectURL=createUrl;document.removeEventListener('click',capture,true);}
  if(challenge.challenge?.operationId!==receipt.proof.id||challenge.resource?.generators!==1250)
    throw Error('UI challenge did not bind canonical source/feed/resource evidence');
  const payload={...challenge.challenge,reviewedAt:Date.now(),validUntil:Date.now()+86400000,
    repeatedUsePermitted:true,permissionEvidence:'independent-isolated-provider-ui-review',minimumIntervalMs:600000,maxTurnMs:10000};
  const signature=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},
    pair.privateKey,new TextEncoder().encode(canonicalJson(payload))))));
  document.getElementById('pcms-refresher-source-review').value=JSON.stringify({payload,signature});
  document.getElementById('pcms-refresher-source-import').click();
  await wait(()=>!document.getElementById('pcms-refresher-source-schedule').disabled,'signed qualification UI');
  await confirm('pcms-refresher-source-schedule','SCHEDULE '+slug);
  await wait(()=>document.getElementById('pcms-refresher-source-review-state').textContent.includes('Schedule enabled'),'target schedule opt-in UI');
  const opted=await command('GET_SOURCE_REFRESH',{stableId:row.stableId});
  if(!opted.sourceRefresh?.scheduleEnabled||opted.sourceRefresh.qualification?.reviewerFingerprint!==fingerprint)
    throw Error('UI qualification/schedule did not commit');
  document.getElementById('pcms-refresher-source-schedule').click();
  await wait(()=>document.getElementById('pcms-refresher-source-review-state').textContent.includes('Schedule disabled'),'disable schedule UI');
  document.getElementById('pcms-refresher-source-revoke').click();
  await wait(()=>document.getElementById('pcms-refresher-source-review-state').textContent.includes('No signed target qualification.'),'revoke qualification UI');
  document.getElementById('pcms-refresher-source-load').click();
  await wait(()=>!document.getElementById('pcms-refresher-source-load').disabled,'canonical receipt reload UI');
  const result={ok:true,entry:'REAL_REGISTERED_PRODUCTION_PORT',donor:'REAL_SHARED_LEASE_AND_PROTECTED_PROXY',
    state:receipt.state,proof:receipt.proof,sourceFingerprint:receipt.effectiveCurrentFingerprint,
    duplicate:duplicate.code,inlineKeyboardFocus:true,mismatchDenied:true,redactedExport:true,reviewChallengeExport:true,
    signedQualificationScheduleDisableAndRevoke:true,uiResult:document.getElementById('pcms-refresher-source-result').textContent};
  // Remove fixture-only business rows before inherited population tests.
  // Immutable dispatch/source observations and independent provider ledger
  // remain available; no production state or profile is involved.
  await new Promise((resolve,reject)=>{const t=db.transaction('meta','readwrite'),m=t.objectStore('meta');
    for(const key of ['account:'+accountId,'inventory:'+slug,'release:'+slug,'refresh-source:'+slug])m.delete(key);
    m.delete('refresh-reviewer:v1');m.delete('refresh-resource:v1');
    m.put({key:core.REFRESHER_KEY,state:core.emptyShadow()});t.oncomplete=resolve;t.onabort=reject;});
  await browser.tabs.remove(login.id);db.close();
  document.getElementById('pcms-refresher-query').value='';location.hash='#overview';
  done(result);
})().catch(e=>done({error:'I17_REGISTERED_SOURCE_SAVE_PROBE_FAILED',detail:String(e),stack:e?.stack?.slice(0,900)}));
