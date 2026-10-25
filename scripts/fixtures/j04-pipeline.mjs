// Test-only OFFLINE external Git/provider model. Real background controllers,
// IDB, alarms and fixed browser DOM assertions execute; no live resource access.
export async function installDevelopmentPipelineFixture(){
 if(window.__j04flow)return {ok:true,reused:true};
 const base=browser.runtime.getURL('pcms/'),module=path=>import(base+path);
 const {openCanonicalDatabase}=await module('journal.mjs'),{exactSource}=await module('staging-core.mjs');
 const {createReadyOperator}=await module('ready-operator.mjs'),{createReadyDevelopment}=await module('ready-development.mjs');
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
 const names=['j04-flow-repair','j04-flow-clean-a','j04-flow-clean-b','j04-flow-held'];
 if(!saved){
  const files={'pcms/prompts/default-chat1.md':'Inspect the saved generator and test actual rendered behavior. Repair failures. Preserve all source assets.\n'};
  for(const slug of names){const repair=slug==='j04-flow-repair';Object.assign(files,{['generators/'+slug+'/DEPLOYMENT.md']:'Status: READY\nReady-Revision: '+slug+'-001\n',
   ['generators/'+slug+'/main.pjs']:'output\n  '+slug+'\n',['generators/'+slug+'/index.html']:repair?'<p id="perchance-error-indicator">Independent visible runtime failure</p>':'<h1>Working '+slug+'</h1>',
   ['generators/'+slug+'/src/retained.bin']:new Uint8Array([0,255,128,17])});
   provider.resources[slug]={slug,remoteId:'resource-'+slug,personaUid:slug==='j04-flow-held'?'flow-held-persona':'flow-persona',principal:slug==='j04-flow-held'?'2'.repeat(64):'1'.repeat(64),visibility:'UNLISTED',source:[{path:'main.pjs',base64:''},{path:'index.html',base64:''}],session:null,turns:0,nonce:null};
  }
  await model.merge(files,'external reviewed READY inputs');await persist();
 }
 const api={...browser,runtime:{...browser.runtime}},token='offline-j04-pipeline-credential',credential=async()=>({ok:true,credential:token});
 await browser.storage.local.set({pcmsS03Git:{repository:'Neb963/per-gens',repositoryId:'42'}});
 if(!await read('j04-flow-initialized')){
  const rows=[];for(const [accountId,personaUid,principal] of [['flow-account','flow-persona','1'.repeat(64)],['flow-held-account','flow-held-persona','2'.repeat(64)]])rows.push({key:'account:'+accountId,account:{accountId,personaUid,bindingVersion:1,revision:1,state:'VERIFIED',boundPrincipal:principal,identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:principal}}});
  for(const slug of names){const r=provider.resources[slug],accountId=slug==='j04-flow-held'?'flow-held-account':'flow-account',link={slug,folder:'generators/'+slug,remoteId:r.remoteId,accountId,personaUid:r.personaUid,bindingVersion:1,source:'S04_INDEPENDENT_NOT_READY_ASSOCIATION'};
   rows.push({key:'source-link:'+slug,link},{key:'inventory:'+slug,generator:{...link,revision:1,ownerState:'OBSERVED_OWNER',visibility:'UNLISTED',management:'MANAGED_CREATED',source:'SOURCE_PENDING'}});
  }
  rows.push({key:'j04-flow-initialized',value:true});await put(rows);
 }
 const catalog=await scanMainCatalog({repository:'Neb963/per-gens',token},network);
 const approvals=createImportApprovalStore(db);if(!(await approvals.get('42')).ok)await approvals.approve({repository:'Neb963/per-gens',repositoryId:'42',head:catalog.head,scopeDigest:await getImportScopeDigest(catalog),recognizedSlugs:names,approvalAt:Date.now()});
 const get=(uid,slug)=>{const r=provider.resources[slug];return r?.personaUid===uid?r:null};
 const guard={getSafeRouteReadiness:async uid=>uid==='flow-held-persona'?{ready:false,code:'OFFLINE_OTHER_ACCOUNT_UNAVAILABLE'}:{ready:true,personaUid:uid,cookieStoreId:'container-'+uid,routeId:'protected-offline'},
  inspectSourceEditorIdle:async(_uid,slug)=>{const tabs=await browser.tabs.query({});return tabs.some(t=>t.url?.startsWith('https://perchance.org/'+slug+'#edit'))?{ok:false,code:'EDITOR_OPEN'}:{ok:true,clean:true,source:'GUARDED_NO_LOCAL_EDITOR'}},inspectStageEditor:async(uid,slug,nonce)=>{const r=get(uid,slug);return r&&r.nonce===nonce&&!r.humanIntent&&!r.humanDirty?{ok:true,clean:true}:{ok:false,code:'EDITOR_UNKNOWN'}},
  observeReadOnly:async(uid,_identity,slug)=>{const r=get(uid,slug);if(!r)return {ok:false,code:'OFFLINE_WRONG_OWNER'};
   return {ok:true,principalFingerprint:r.principal,original:{remotePublicId:r.remoteId,ownerResult:'IS_OWNER',visibility:r.visibility,pjs:text(r.source.find(f=>f.path==='main.pjs')),html:text(r.source.find(f=>f.path==='index.html')),assets:r.source.filter(f=>f.path.startsWith('src/'))}};},
  inspectHumanReview:async(uid,slug,nonce)=>{const r=get(uid,slug),tabs=await browser.tabs.query({});return r&&r.nonce===nonce&&!r.humanDirty&&!tabs.some(t=>t.url?.startsWith('https://perchance.org/'+slug+'#edit'))?{ok:true,clean:true,noEditors:true}:{ok:false,code:'OFFLINE_HUMAN_UNSAVED'};},
  reclaimHumanReview:async(uid,slug,nonce,fingerprint)=>{const r=get(uid,slug);if(!r||r.nonce!==nonce||r.humanDirty||(await exactSource(r.source)).fingerprint!==fingerprint)return {ok:false};r.humanIntent=false;await persist();return {ok:true};},
  runStageStep:async(uid,req)=>{const r=get(uid,req.slug);if(!r||r.visibility!=='UNLISTED')return {ok:false};r.nonce=req.nonce;r.source=structuredClone(req.candidate);provider.effects.push({kind:'STAGE',slug:req.slug,nonce:req.nonce});await persist();return {ok:true,tab:{tabId:101,cookieStoreId:'container-'+uid,nonce:req.nonce,owned:true}};},
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
 const options={open,guard:()=>guard,effectGate:()=>true,gitCredential:credential,scanCatalog:o=>scanMainCatalog(o,network),inspectReady:o=>inspectReadyCandidate(o,network),clock:()=>Date.now()+180000};
 const ai=createAiBoundary(api,options),stage=createStagingBoundary(api,{...options,native:credential,inspect:o=>inspectGitSource(o,network)}),ready=createReadyOperator(api,{...options,native:credential,scan:o=>scanMainCatalog(o,network),inspect:o=>inspectReadyCandidate(o,network)});
 const release=createReleaseBoundary(api,{...options,inspect:o=>inspectGitSource(o,network)}),bulk=createCleanBulkBoundary(api,{open}),canonical=createCommandBoundary(api,{open}),catalogBoundary=createCatalogBoundary(api,{open,transport:network,scan:o=>scanMainCatalog(o,network),native:credential});
 const writeback=createWritebackBoundary(api,{...options,credential:async()=>({ok:true,token}),inspect:o=>inspectWriteback(o,network),write:o=>writeGitCandidate(o,network),observe:o=>observeGitCandidate(o,network)});
 const development=createReadyDevelopment(api,{open,effectGate:()=>true,makeReady:()=>ready,makeStage:()=>stage,makeAi:()=>ai});
 const changes=createS06ChangeProgress(api,{open,guard:()=>guard}),git=createS06WritebackProgress(api,{open,effectGate:()=>true,native:credential,makeBoundary:()=>writeback}),publication=createS06PublicationProgress(api,{open,effectGate:()=>true,makeRelease:()=>release}),clean=createCleanBulkProgress(api,{open,makeRelease:()=>release});
 const intake=createReadyIntake(api,{open});await intake.run({catalog,repository:'Neb963/per-gens',token,transport:network});
 let completedWakes=0;
 const step=(name,fn)=>async()=>{const result=await fn();events.push({name,result});if(name==='publication')completedWakes++;if(events.length>100)events.shift();return result};
 const watcher=createCatalogWatcher(api,{scan:scanMainCatalog,native:credential,network,incidents:async()=>{},ingestReady:intake.run,
  progressReady:step('development',development.tick),progressChanges:step('changes',changes.tick),progressWriteback:step('writeback',git.tick),progressCleanBulk:step('clean',clean.tick),progressPublication:step('publication',publication.tick)});watcher.register();
 const boundaries=new Map([['pcms-i10-ai',ai.run],['pcms-i13-release',release.run],['pcms-j04-clean-publication',bulk.run],['pcms-s03-catalog',catalogBoundary.run],['pcms-i02-canonical-readonly',canonical.dispatch],['pcms-s05-ready-operator',ready.run]]);
 window.__j04flow={async command(name,msg,sender){return boundaries.get(name)?.(msg,sender)},async inspect(){const rows=await all();return {completedWakes,provider:structuredClone(provider),git:model.serialize(),jobs:rows.filter(r=>r.key?.startsWith('ai-job:')).map(r=>r.job),stages:rows.filter(r=>r.key?.startsWith('stage:')).map(r=>r.record),writebacks:rows.filter(r=>r.key?.startsWith('writeback:')).map(r=>r.record),releases:rows.filter(r=>r.key?.startsWith('release:')).map(r=>r.release),batches:rows.filter(r=>r.key?.startsWith('clean-bulk:')).map(r=>r.record),events:structuredClone(events)}},
  async humanSave(slug,dirty){const r=provider.resources[slug];r.humanIntent=true;r.humanDirty=dirty;if(!dirty)r.source=r.source.map(f=>f.path==='index.html'?{...f,base64:b64('<h1>Saved human revision for '+slug+'</h1><button>Use revised output</button>')}:f);await persist();return {ok:true}},
  async alarm(){await browser.alarms.create(READY_PROGRESS_ALARM,{when:Date.now()+100});return {ok:true}},async scan(){return watcher.tick()}};
 return {ok:true,ready:names.length};
}
