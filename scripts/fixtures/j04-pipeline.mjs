// Test-only OFFLINE external Git/provider model. Real background controllers,
// IDB, alarms and fixed browser DOM assertions execute; no live resource access.
export async function installDevelopmentPipelineFixture(){
 if(window.__j04flow)return {ok:true,reused:true};
 const base=browser.runtime.getURL('pcms/'),module=path=>import(base+path);
 const {openCanonicalDatabase}=await module('journal.mjs'),{exactSource}=await module('staging-core.mjs');
 const {createReadyOperator}=await module('ready-operator.mjs'),{createReadyDevelopment}=await module('ready-development.mjs');
 const {createRefresherStore}=await module('refresher-store.mjs');
 const {emptyShadow,reconcileShadow,REFRESHER_KEY}=await module('refresher-core.mjs'),{createExistingBoundary}=await module('existing-update-boundary.mjs');
 const {createStagingBoundary}=await module('staging-boundary.mjs'),{createAiBoundary}=await module('ai-boundary.mjs');
 const {createReleaseBoundary}=await module('release-boundary.mjs'),{createCatalogBoundary}=await module('catalog-boundary.mjs'),{createCommandBoundary}=await module('command-boundary.mjs');
 const {createS06WritebackProgress}=await module('s06-writeback-progress.mjs'),{createWritebackBoundary}=await module('writeback-boundary.mjs');
 const {inspectWriteback,writeGitCandidate,observeGitCandidate}=await module('git-writeback.mjs');
 const {createS06ChangeProgress}=await module('s06-request-changes.mjs'),{createS06PublicationProgress}=await module('s06-publication-progress.mjs');
 const {createCleanBulkBoundary,createCleanBulkProgress}=await module('clean-bulk-boundary.mjs');
 const {createCatalogWatcher,READY_PROGRESS_ALARM}=await module('catalog-watch.mjs');
 const {scanMainCatalog}=await module('git-catalog.mjs'),{inspectReadyCandidate}=await module('catalog-declaration.mjs'),{inspectGitSource}=await module('git-source.mjs');
 const {createReadyIntake}=await module('ready-intake.mjs'),{createImportApprovalStore,getImportScopeDigest}=await module('catalog-import.mjs');
 const db=await openCanonicalDatabase({open:(_name,version)=>indexedDB.open('pcms-j04-pipeline-fixture',version)}),open=async()=>db;
 const read=key=>new Promise((resolve,reject)=>{const q=db.transaction('meta','readonly').objectStore('meta').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=reject});
 const put=rows=>new Promise((resolve,reject)=>{const t=db.transaction('meta','readwrite');for(const row of rows)t.objectStore('meta').put(row);t.oncomplete=resolve;t.onabort=reject});
 const all=()=>new Promise((resolve,reject)=>{const t=db.transaction('meta','readonly'),rows=[];t.oncomplete=()=>resolve(rows);t.onabort=reject;t.objectStore('meta').openCursor().onsuccess=e=>{const c=e.target.result;if(c){rows.push(c.value);c.continue()}}});
 const saved=(await browser.storage.local.get('j04FlowExternal')).j04FlowExternal,model=await createGitModel(saved?.git||null);
 const b64=s=>{let raw='';for(const x of new TextEncoder().encode(s))raw+=String.fromCharCode(x);return btoa(raw)},text=blob=>new TextDecoder().decode(Uint8Array.from(atob(blob.base64),c=>c.charCodeAt(0)));
 const provider=saved?.provider||{resources:{},effects:[],assertions:[],losePublish:true},events=[];
 const persist=()=>browser.storage.local.set({j04FlowExternal:{git:model.serialize(),provider:structuredClone(provider)}});
 const network=async(...args)=>{try{return await model.transport(...args)}finally{if(args[1]?.method!=='GET')await persist()}};
 const names=['j04-flow-repair','j04-flow-clean-a','j04-flow-clean-b','j04-flow-held','j04-flow-public','j04-flow-adopted'];
 if(!saved){
  const files={'pcms/prompts/default-chat1.md':'Inspect the saved generator and test actual rendered behavior. Repair failures. Preserve all source assets.\n'};
  for(const slug of names){const repair=slug==='j04-flow-repair';Object.assign(files,{['generators/'+slug+'/DEPLOYMENT.md']:'Status: READY\nReady-Revision: '+slug+'-001\n',
   ['generators/'+slug+'/main.pjs']:'output\n  '+slug+'\n',['generators/'+slug+'/index.html']:repair?'<p id="perchance-error-indicator">Independent visible runtime failure</p>':'<h1>Working '+slug+'</h1>',
   ['generators/'+slug+'/src/retained.bin']:new Uint8Array([0,255,128,17])});
   provider.resources[slug]={slug,remoteId:'resource-'+slug,personaUid:slug==='j04-flow-held'?'flow-held-persona':'flow-persona',principal:slug==='j04-flow-held'?'2'.repeat(64):'1'.repeat(64),visibility:slug==='j04-flow-public'?'PUBLIC':'UNLISTED',source:[{path:'main.pjs',base64:''},{path:'index.html',base64:''}],session:null,turns:0,nonce:null};
   if(slug==='j04-flow-adopted')provider.resources[slug].source=[{path:'main.pjs',base64:b64('output\n  Original private source\n')},{path:'index.html',base64:b64('<p>Original private output</p>')},{path:'src/original-only.bin',base64:'CQD/'}];
  }
  await model.merge(files,'external reviewed READY inputs');await persist();
 }
 // The fixture has its own canonical DB and external ledgers. Give its
 // controllers one shared API facade so ephemeral scope ownership does not
 // collide with the simultaneously installed controller on the empty product
 // DB. Every storage operation still delegates to actual persistent Firefox
 // storage, and all fixture actors share this same facade/ownership pool.
 const local={get:(...args)=>browser.storage.local.get(...args),
  set:(...args)=>browser.storage.local.set(...args)};
 const api={...browser,runtime:{...browser.runtime},storage:{...browser.storage,local}},token='offline-j04-pipeline-credential',credential=async()=>({ok:true,credential:token});
 await browser.storage.local.set({pcmsS03Git:{repository:'Neb963/per-gens',repositoryId:'42'}});
 if(!await read('j04-flow-initialized')){
  const rows=[];for(const [accountId,personaUid,principal] of [['flow-account','flow-persona','1'.repeat(64)],['flow-held-account','flow-held-persona','2'.repeat(64)]])rows.push({key:'account:'+accountId,account:{accountId,personaUid,bindingVersion:1,revision:1,state:'VERIFIED',boundPrincipal:principal,identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:principal}}});
  for(const slug of names){const r=provider.resources[slug],accountId=slug==='j04-flow-held'?'flow-held-account':'flow-account',link={slug,folder:'generators/'+slug,remoteId:r.remoteId,accountId,personaUid:r.personaUid,bindingVersion:1,source:'S04_INDEPENDENT_NOT_READY_ASSOCIATION'};
   const publicSource=slug==='j04-flow-public',adoptedPrivate=slug==='j04-flow-adopted',inventory={...link,revision:1,ownerState:'OBSERVED_OWNER',visibility:publicSource?'PUBLIC':'UNLISTED',management:publicSource?'ADOPTED_PUBLIC':adoptedPrivate?'ADOPTED_PRIVATE':'MANAGED_CREATED',source:publicSource||adoptedPrivate?'SOURCE_VERIFIED':'SOURCE_PENDING'};
   rows.push({key:'source-link:'+slug,link},{key:'inventory:'+slug,generator:inventory});
   if(publicSource||adoptedPrivate){const original=await exactSource(r.source);rows.push({key:'adoption:'+slug,adoption:{slug,accountId,accountRevision:1,personaUid:r.personaUid,bindingVersion:1,revision:1,principalFingerprint:r.principal,remotePublicId:r.remoteId,archiveState:'ARCHIVED_GIT_CONFIRMED',originalCheckpoint:{qualified:true},original:{...original,source:'INDEPENDENT_FULL_BYTE_READBACK',sourceStage:'PCMS_STAGED_SOURCE_V1',stagedFingerprint:original.fingerprint,remotePublicId:r.remoteId,visibility:publicSource?'PUBLIC':'UNLISTED'}}});
    if(publicSource){const shadow=reconcileShadow(emptyShadow(),[{...inventory,ownerVerified:true,releaseVerified:true,releaseFingerprint:original.fingerprint}]).state,row=shadow.rows[0];row.phase='ACTIVE';row.slot=true;row.activeRemaining=123456;row.sleepRemaining=0;shadow.accounts[accountId].health='HEALTHY';rows.push({key:REFRESHER_KEY,state:shadow});}
   }
  }
  rows.push({key:'j04-flow-initialized',value:true});await put(rows);
 }
 const catalog=await scanMainCatalog({repository:'Neb963/per-gens',token},network);
 const approvals=createImportApprovalStore(db);if(!(await approvals.get('42')).ok)await approvals.approve({repository:'Neb963/per-gens',repositoryId:'42',head:catalog.head,scopeDigest:await getImportScopeDigest(catalog),recognizedSlugs:names,approvalAt:Date.now()});
 // Existing imported fixture scope is already fully associated; J03 B proves its UI onboarding.
 await browser.storage.local.set({pcmsS04CatalogIntakeProgress:{repositoryId:'42',initialScopeDigest:(await approvals.get('42')).approval.scopeDigest,initialImportCompleted:true}});
 const get=(uid,slug)=>{const r=provider.resources[slug];return r?.personaUid===uid?r:null};
 const guard={getSafeRouteReadiness:async uid=>uid==='flow-held-persona'?{ready:false,code:'OFFLINE_OTHER_ACCOUNT_UNAVAILABLE'}:{ready:true,personaUid:uid,cookieStoreId:'container-'+uid,routeId:'protected-offline'},
  inspectSourceEditorIdle:async(_uid,slug)=>{const tabs=await browser.tabs.query({});return provider.resources[slug]?.nonce||tabs.some(t=>t.url?.startsWith('https://perchance.org/'+slug+'#edit'))?{ok:false,code:'EDITOR_OPEN'}:{ok:true,clean:true,source:'GUARDED_NO_LOCAL_EDITOR'}},inspectStageEditor:async(uid,slug,nonce)=>{const r=get(uid,slug);return r&&r.nonce===nonce&&!r.humanIntent&&!r.humanDirty?{ok:true,clean:true,source:'GUARDED_EDITOR_CLEAN'}:{ok:false,code:'EDITOR_UNKNOWN'}},
  observeReadOnly:async(uid,_identity,slug)=>{const r=get(uid,slug);if(!r)return {ok:false,code:'OFFLINE_WRONG_OWNER'};
   return {ok:true,principalFingerprint:r.principal,original:{remotePublicId:r.remoteId,ownerResult:'IS_OWNER',visibility:r.visibility,pjs:text(r.source.find(f=>f.path==='main.pjs')),html:text(r.source.find(f=>f.path==='index.html')),assets:r.source.filter(f=>f.path.startsWith('src/'))}};},
  inspectHumanReview:async(uid,slug,nonce)=>{const r=get(uid,slug),tabs=await browser.tabs.query({});return r&&r.nonce===nonce&&!r.humanDirty&&!tabs.some(t=>t.url?.startsWith('https://perchance.org/'+slug+'#edit'))?{ok:true,clean:true,noEditors:true}:{ok:false,code:'OFFLINE_HUMAN_UNSAVED'};},
  reclaimHumanReview:async(uid,slug,nonce,fingerprint)=>{const r=get(uid,slug);if(!r||r.nonce!==nonce||r.humanDirty||(await exactSource(r.source)).fingerprint!==fingerprint)return {ok:false};r.humanIntent=false;await persist();return {ok:true};},
  runExistingStep:async(uid,req)=>{const r=get(uid,req.slug);if(!r||JSON.stringify((await exactSource(r.source)).files)!==JSON.stringify((await exactSource(req.previousFiles)).files))return {ok:false,code:'OFFLINE_EXISTING_SOURCE_CHANGED'};
   if(req.action==='UNLIST'){r.visibility='UNLISTED';r.nonce=req.nonce}else if(req.action==='STAGE'&&r.visibility==='UNLISTED')r.source=structuredClone(req.targetFiles);else return {ok:false,code:'OFFLINE_EXISTING_NOT_UNLISTED'};
   provider.effects.push({kind:req.action==='UNLIST'?'UNLIST':'STAGE',slug:req.slug,nonce:req.nonce});await persist();return {ok:true};},
  runStageStep:async(uid,req)=>{const r=get(uid,req.slug);if(!r||r.visibility!=='UNLISTED')return {ok:false};r.nonce=req.nonce;r.source=structuredClone(req.candidate);provider.effects.push({kind:'STAGE',slug:req.slug,nonce:req.nonce});await persist();return {ok:true,tab:{tabId:101,cookieStoreId:'container-'+uid,ownershipNonce:req.nonce,owned:true}};},
  runNativeAiStep:async(uid,req)=>{const r=get(uid,req.slug);if(!r||r.nonce!==req.nonce)return {ok:false,code:'OFFLINE_NATIVE_OWNER_MISMATCH'};
   if(req.action==='ORACLE_SMOKE'){const html=text(r.source.find(f=>f.path==='index.html')),result=await j04ActualPreview(req.slug,req.name,html);provider.assertions.push({...result,slug:req.slug});await persist();return result;}
   if(req.action==='SEND'){if(req.repair){r.source=r.source.map(f=>f.path==='index.html'?{...f,base64:b64('<h1>'+(req.text.startsWith('Use the revised greeting')?'Operator revised greeting for ':'Independently repaired ')+req.slug+'</h1><button>Try result</button>')}:f)}
    if(!req.repair&&!r.session)r.session=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(req.slug+'-session-'+r.turns))),x=>x.toString(16).padStart(2,'0')).join('');
    r.turns++;provider.effects.push({kind:'NATIVE_SEND',slug:req.slug,text:req.text,repair:req.repair===true,session:r.session});await persist();
   }else if(req.action!=='OBSERVE')return {ok:false,code:'OFFLINE_UNSUPPORTED_NATIVE_ACTION'};
   return {ok:true,slug:req.slug,busy:false,sessionDigest:r.session,chatEntries:r.turns*2,sourceSaved:true,editorClean:true,inputOccupied:false,attachmentsPending:false,hasQueue:false};
  },
  runReleaseStep:async(uid,req)=>{const r=get(uid,req.slug);if(!r||req.action!=='PUBLISH'||r.nonce!==req.nonce)return {ok:false};r.visibility='PUBLIC';provider.effects.push({kind:'PUBLISH',slug:req.slug,remoteId:r.remoteId});await persist();if(provider.losePublish){provider.losePublish=false;await persist();throw Error('OFFLINE_PUBLISH_ACK_LOST')}return {ok:true};}
 };
 const options={open,guard:()=>guard,effectGate:()=>true,gitCredential:credential,scanCatalog:o=>scanMainCatalog(o,network),inspectReady:o=>inspectReadyCandidate(o,network)};
 const ai=createAiBoundary(api,options),stage=createStagingBoundary(api,{...options,native:credential,inspect:o=>inspectGitSource(o,network)}),ready=createReadyOperator(api,{...options,native:credential,scan:o=>scanMainCatalog(o,network),inspect:o=>inspectReadyCandidate(o,network)});
 const release=createReleaseBoundary(api,{...options,inspect:o=>inspectGitSource(o,network)}),bulk=createCleanBulkBoundary(api,{open}),canonical=createCommandBoundary(api,{open}),catalogBoundary=createCatalogBoundary(api,{open,transport:network,scan:o=>scanMainCatalog(o,network),native:credential});
 const writeback=createWritebackBoundary(api,{...options,credential:async()=>({ok:true,token}),inspect:o=>inspectWriteback(o,network),write:o=>writeGitCandidate(o,network),observe:o=>observeGitCandidate(o,network)});
 const existing=createExistingBoundary(api,{...options,native:credential,inspect:o=>inspectGitSource(o,network)});
 const development=createReadyDevelopment(api,{open,effectGate:()=>true,makeReady:()=>ready,makeStage:()=>stage,makeAi:()=>ai,makeExisting:()=>existing});
 const changes=createS06ChangeProgress(api,{open,guard:()=>guard}),git=createS06WritebackProgress(api,{open,effectGate:()=>true,native:credential,makeBoundary:()=>writeback}),publication=createS06PublicationProgress(api,{open,effectGate:()=>true,makeRelease:()=>release}),clean=createCleanBulkProgress(api,{open,makeRelease:()=>release});
 const intake=createReadyIntake(api,{open});await intake.run({catalog,repository:'Neb963/per-gens',token,transport:network});
 let completedWakes=0;
 const step=(name,fn)=>async()=>{const result=await fn();events.push({name,result});if(name==='publication')completedWakes++;if(events.length>100)events.shift();return result};
 const watcher=createCatalogWatcher(api,{scan:scanMainCatalog,native:credential,network,incidents:async()=>{},ingestReady:intake.run,
  progressReady:step('development',development.tick),progressChanges:step('changes',changes.tick),progressWriteback:step('writeback',git.tick),progressCleanBulk:step('clean',clean.tick),progressPublication:step('publication',publication.tick)});watcher.register();
 const boundaries=new Map([['pcms-i10-ai',ai.run],['pcms-i13-release',release.run],['pcms-j04-clean-publication',bulk.run],['pcms-s03-catalog',catalogBoundary.run],['pcms-i02-canonical-readonly',canonical.dispatch],['pcms-s05-ready-operator',ready.run]]);
 window.__j04flow={async command(name,msg,sender){return boundaries.get(name)?.(msg,sender)},async inspect(){const rows=await all();return {completedWakes,provider:structuredClone(provider),git:model.serialize(),jobs:rows.filter(r=>r.key?.startsWith('ai-job:')).map(r=>r.job),ready:rows.filter(r=>r.key?.startsWith('s05-ready:')).map(r=>r.record),stages:rows.filter(r=>r.key?.startsWith('stage:')).map(r=>r.record),stageHistory:rows.filter(r=>r.key?.startsWith('stage-history:')).map(r=>r.record),adoptions:rows.filter(r=>r.key?.startsWith('adoption:')).map(r=>r.adoption),writebacks:rows.filter(r=>r.key?.startsWith('writeback:')).map(r=>r.record),releases:rows.filter(r=>r.key?.startsWith('release:')).map(r=>r.release),existing:rows.filter(r=>r.key?.startsWith('existing-update:')).map(r=>r.record),shadow:rows.find(r=>r.key===REFRESHER_KEY)?.state,batches:rows.filter(r=>r.key?.startsWith('clean-bulk:')).map(r=>r.record),events:structuredClone(events)}},
  async mergeReady(slug){await model.merge({['generators/'+slug+'/DEPLOYMENT.md']:'Status: READY\nReady-Revision: '+slug+'-002\n',['generators/'+slug+'/main.pjs']:'output\n  Successor '+slug+'\n'},'external reviewed successor before publication');await persist();const scanned=await watcher.tick();const updated=await createRefresherStore(db).turn({now:Date.now(),bootId:'fixture_flow_refresher_001'});if(!updated.ok)return updated;return scanned;},
  async loseNextPublish(){provider.losePublish=true;await persist();return {ok:true}},
  async humanSave(slug,dirty){const r=provider.resources[slug];r.humanIntent=true;r.humanDirty=dirty;if(!dirty)r.source=r.source.map(f=>f.path==='index.html'?{...f,base64:b64('<h1>Saved human revision for '+slug+'</h1><button>Use revised output</button>')}:f);await persist();return {ok:true}},
  async alarm(){await browser.alarms.create(READY_PROGRESS_ALARM,{when:Date.now()+100});return {ok:true}},async scan(){return watcher.tick()}};
 return {ok:true,ready:names.length};
}
