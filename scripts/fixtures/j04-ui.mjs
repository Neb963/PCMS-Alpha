// OFFLINE installed primary UI fixture. Production typed boundaries and real
// Firefox IDB execute. Only external provider facts are modeled; no live URLs
// or personal profiles are mutated. This file is never packaged.
export async function installDevelopmentFixture(){
 const {openCanonicalDatabase}=await import('./journal.mjs'),{exactSource}=await import('./staging-core.mjs');
 const {createReleaseBoundary}=await import('./release-boundary.mjs'),{createAiBoundary}=await import('./ai-boundary.mjs');
 const {createCleanBulkBoundary}=await import('./clean-bulk-boundary.mjs'),{createCatalogBoundary}=await import('./catalog-boundary.mjs');
 const {createCommandBoundary}=await import('./command-boundary.mjs'),{createReadyOperator}=await import('./ready-operator.mjs'),{createAiStore}=await import('./ai-store.mjs');
 const db=await openCanonicalDatabase({open:(_name,version)=>indexedDB.open('pcms-j04-ui-fixture',version)}),open=async()=>db;
 const read=key=>new Promise((resolve,reject)=>{const q=db.transaction('meta','readonly').objectStore('meta').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=reject});
 const put=rows=>new Promise((resolve,reject)=>{const t=db.transaction('meta','readwrite');for(const row of rows)t.objectStore('meta').put(row);t.oncomplete=resolve;t.onabort=reject});
 const rows=()=>new Promise((resolve,reject)=>{const t=db.transaction('meta','readonly'),all=[];t.oncomplete=()=>resolve(all);t.onabort=reject;t.objectStore('meta').openCursor().onsuccess=e=>{const c=e.target.result;if(c){all.push(c.value);c.continue()}}});
 const b64=s=>{const bytes=new TextEncoder().encode(s);let raw='';for(const x of bytes)raw+=String.fromCharCode(x);return btoa(raw)},sha=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 const A=await exactSource([{path:'main.pjs',base64:b64('output\n  Clean candidate é\n'+'unchanged source line\n'.repeat(700))},{path:'index.html',base64:b64('<h1>Clean saved source</h1>')},
  {path:'src/binary.dat',base64:btoa(String.fromCharCode(0,255,128,29))},...Array.from({length:58},(_,i)=>({path:'src/file-'+String(i).padStart(3,'0')+'.txt',base64:b64('Full asset '+i+'\n')}))]);
 const P=await exactSource([{path:'main.pjs',base64:b64('output\n  Previous saved source\n')},{path:'index.html',base64:b64('<h1>Previous saved source</h1>')},{path:'src/deleted.txt',base64:b64('Preserved deleted file é\n')}]);
 const B=await exactSource(A.blobs.map(x=>x.path==='main.pjs'?{...x,base64:b64('output\n  Modified final source é\n'+'modified source line\n'.repeat(800))}:x));
 const empty=await exactSource([{path:'main.pjs',base64:''},{path:'index.html',base64:''}]),input=await sha('PCMS_SOURCE_V1\n'+[...A.files].sort((a,b)=>a.path.localeCompare(b.path,'en')).map(f=>JSON.stringify([f.path,f.size,f.sha256])).join('\n'));
 if(!await read('j04-initialized')){
  const all=[];for(let n=1;n<=2;n++){const principal=String(n).repeat(64),accountId='account_j04_'+n,personaUid='persona-j04-'+n;all.push({key:'account:'+accountId,account:{accountId,personaUid,revision:1,bindingVersion:1,state:'VERIFIED',alias:'Offline account '+n,identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:principal}}});}
  for(const slug of ['j04-review-clean','j04-review-modified','j04-repair','j04-manual']){
   const n=slug==='j04-manual'?2:1,accountId='account_j04_'+n,personaUid='persona-j04-'+n,principal=String(n).repeat(64),modified=slug==='j04-review-modified',repair=slug==='j04-repair',manual=slug==='j04-manual',source=modified?B:A;
   const stage={slug,revision:4,state:'SOURCE_VERIFIED',verifiedAt:1,nonce:(n===1?'f':'e').repeat(32),accountId,accountRevision:1,personaUid,bindingVersion:1,principalFingerprint:principal,remotePublicId:'remote_'+slug,
    sourceFolder:'generators/'+slug,sourceHead:'a'.repeat(40),testingSha:null,readyIdentifier:'rev-j04-current',readyInputFingerprint:input,gitFingerprint:input,candidate:A,previous:modified?P:empty};
   const job={schema:1,slug,revision:7,stageRevision:4,state:manual?'PENDING_NATIVE_SESSION':repair?'KNOWN_FAILURE':'TESTS_VERIFIED',executionSlotReleased:!repair&&!manual,sourceFingerprint:source.fingerprint,verifiedFinal:repair||manual?null:source.fingerprint,finalSource:manual?null:source,
    readyIdentifier:'rev-j04-current',readyInputFingerprint:input,prompt:{revision:1,source:'GIT_MAIN_CHAT1_PINNED',text:'Pinned Git testing instructions.',tests:['default_generator_smoke']},optionalTesting:null,
    native:manual?null:{step:'CHAT1_SEND',state:'CHAT1_OBSERVED_IDLE',sessionDigest:'c'.repeat(64)},chat1:{state:manual?'PENDING':'RUNNING',sessionDigest:manual?null:'c'.repeat(64),tests:manual?{}:{default_generator_smoke:{result:repair?'FAIL':'PASS',sourceFingerprint:source.fingerprint}}},chat2:null,changes:[],hold:manual?'NATIVE_AI_NOT_WIRED':repair?'KNOWN_FAILURE_RETEST_REQUIRED':null};
   all.push({key:'stage:'+slug,record:stage},{key:'ai-job:'+slug,accountId,job},{key:'inventory:'+slug,generator:{slug,accountId,personaUid,bindingVersion:1,remoteId:'remote_'+slug,ownerState:'OBSERVED_OWNER',visibility:'UNLISTED',revision:1}},
    {key:'s05-ready:'+slug,record:{slug,revision:1,repositoryId:'42',active:{identifier:'rev-j04-current',inputFingerprint:input},desired:null,hold:null}},
    {key:'writeback:'+slug,record:{slug,revision:1,state:'CONFIRMED',mode:'S06',stageRevision:4,jobRevision:7,sourceFingerprint:source.fingerprint,sealedSource:source,readyIdentifier:'rev-j04-current',readyInputFingerprint:input,testingSha:null,folder:'generators/'+slug,commitSha:'b'.repeat(40)}});
   if(modified)all.push({key:'ai-history:'+slug+':5',accountId,job:{...job,revision:5,finalSource:A,sourceFingerprint:A.fingerprint,verifiedFinal:A.fingerprint,chat1:{...job.chat1,tests:{default_generator_smoke:{result:'PASS',sourceFingerprint:A.fingerprint}}}}});
  }
  for(let n=0;n<1001;n++){const slug='j04-paged-'+String(n).padStart(4,'0');all.push({key:'s05-ready:'+slug,record:{slug,revision:1,repositoryId:'42',active:{identifier:'rev-paged',inputFingerprint:input},desired:null,hold:'OPERATOR_PAUSED'}})}
  all.push({key:'j04-initialized',value:true});await put(all);
 }
 const api={...browser,runtime:{...browser.runtime}},commands=[],effects=[];let loseControl=false;
 const guard={getSafeRouteReadiness:async uid=>({ready:true,personaUid:uid,cookieStoreId:'offline-'+uid,routeId:'offline-protected'}),
  inspectManualEditor:async(_uid,slug)=>{const tabs=await browser.tabs.query({});return tabs.some(t=>t.url?.startsWith('https://perchance.org/'+slug+'#edit'))?{ok:false,code:'EDITOR_OPEN'}:{ok:true,clean:true,noEditors:true,noNativeSession:true}},
  observeReadOnly:async(uid,_identity,slug)=>{const row=await read('stage:'+slug),s=row?.record;if(!s||s.personaUid!==uid)return {ok:false,code:'OFFLINE_OWNER_MISMATCH'};const source=A;
   return {ok:true,principalFingerprint:s.principalFingerprint,original:{remotePublicId:s.remotePublicId,ownerResult:'IS_OWNER',visibility:'UNLISTED',pjs:new TextDecoder().decode(Uint8Array.from(atob(source.blobs.find(x=>x.path==='main.pjs').base64),c=>c.charCodeAt(0))),html:new TextDecoder().decode(Uint8Array.from(atob(source.blobs.find(x=>x.path==='index.html').base64),c=>c.charCodeAt(0))),assets:source.blobs.filter(x=>x.path.startsWith('src/'))}};
  }};
 const ai=createAiBoundary(api,{open,guard:()=>guard,effectGate:()=>false}),release=createReleaseBoundary(api,{open,guard:()=>guard}),bulk=createCleanBulkBoundary(api,{open}),catalog=createCatalogBoundary(api,{open}),canonical=createCommandBoundary(api,{open}),ready=createReadyOperator(api,{open,guard:()=>guard});
 const map=new Map([['pcms-i10-ai',ai.run],['pcms-i13-release',release.run],['pcms-j04-clean-publication',bulk.run],['pcms-s03-catalog',catalog.run],['pcms-i02-canonical-readonly',canonical.dispatch],['pcms-s05-ready-operator',ready.run]]),sender={id:browser.runtime.id,url:browser.runtime.getURL('pcms/index.html')};
 const original=browser.runtime.connect.bind(browser.runtime);browser.runtime.connect=function(...args){const name=args.at(-1)?.name;if(!map.has(name))return original(...args);const messages=new Set(),disconnected=new Set();let closed=false;
  return {onMessage:{addListener:f=>messages.add(f)},onDisconnect:{addListener:f=>disconnected.add(f)},disconnect(){closed=true},postMessage(msg){Promise.resolve(map.get(name)(msg,sender)).then(out=>{commands.push({port:name,type:msg.type,ok:out?.ok,code:out?.code});if(loseControl&&msg.type==='GIVE_INSTRUCTIONS'){loseControl=false;for(const f of disconnected)f();return}if(!closed)for(const f of messages)f(out)}).catch(e=>{commands.push({type:msg.type,error:String(e)});if(!closed)for(const f of disconnected)f()})}};
 };
 window.__j04={async inspect(){const all=await rows();return {jobs:all.filter(x=>x.key?.startsWith('ai-job:')).map(x=>x.job),batches:all.filter(x=>x.key?.startsWith('clean-bulk:')).map(x=>x.record),exceptions:all.filter(x=>x.key?.startsWith('s06-exception:')).map(x=>x.record),commands:structuredClone(commands),effects:structuredClone(effects)}},
  async touchRepair(){const store=createAiStore(db),full=await store.getJobFull('j04-repair');return store.checkpointSource('j04-repair',full.job.revision,A)},loseControl(){loseControl=true;return true}};
 return {ok:true,ready:1005};
}
