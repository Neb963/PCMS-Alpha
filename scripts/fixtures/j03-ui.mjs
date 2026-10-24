// Installed primary UI and production Git/creation/READY boundaries, with
// OFFLINE external HTTP/provider oracles. No live repository is accessed.
export async function installGitFixture({empty=false}={}){
 const {openCanonicalDatabase}=await import('./journal.mjs');
 const {createCatalogBoundary}=await import('./catalog-boundary.mjs');
 const {scanMainCatalog}=await import('./git-catalog.mjs');
 const {createSourceBoundary}=await import('./source-boundary.mjs');
 const {inspectGitSource,readVerifiedGitFile}=await import('./git-source.mjs');
 const {createS04GitContinuation}=await import('./creation-git-runner.mjs');
 const {createInitialImportGuard,inspectCurrentImportItem}=await import('./creation-import-authority.mjs');
 const {createCreationCatalogIntake}=await import('./creation-catalog.mjs');
 const {createReadyIntake}=await import('./ready-intake.mjs');
 const {createCatalogWatcher}=await import('./catalog-watch.mjs');
 const {browserGitCredentialPacket}=await import('./git-local-secret.mjs');
 const {standingS06}=await import('./s06-standing-authority.mjs');
 const {createCommandBoundary}=await import('./command-boundary.mjs');
 const {createExistingRenameService}=await import('./folder-existing-rename.mjs');
 const {createRenamedIdentityLinker,createRenameGitVerifier}=await import('./folder-rename-link.mjs');
 const {createFolderIdentityBoundary}=await import('./folder-identity-boundary.mjs');
 const key='j03OfflineGitOracle',prior=(await browser.storage.local.get(key))[key],model=await createGitModel(prior||null);
 const persist=()=>browser.storage.local.set({[key]:model.serialize()});
 if(!prior&&!empty){await model.merge({
  'pcms/prompts/default-chat1.md':'Existing authoritative Git instructions. Preserve exact source and test actual behavior.\n',
  'README.md':'Outside PCMS management\n',
  'generators/j02-owned-000-002/DEPLOYMENT.md':'Status: NOT_READY\n',
  'generators/j02-owned-000-002/main.pjs':'output\n  Original source é\n',
  'generators/j02-owned-000-002/index.html':'<p>Original page</p>\n',
  'generators/j03-created-alpha/DEPLOYMENT.md':'Status: READY\nReady-Revision: j03-initial-ready-001\n',
  'generators/j03-created-alpha/main.pjs':'output\n  Git candidate\n',
  'generators/j03-created-alpha/index.html':'<p>Git candidate</p>\n',
  'generators/j03-created-alpha/src/binary.dat':new Uint8Array([0,255,128,1]),
  ...Object.fromEntries(Array.from({length:108},(_,i)=>['generators/j03-created-alpha/src/file-'+String(i).padStart(3,'0')+'.txt','File '+i+'\n']))
 });await persist()}
 const network=async(...args)=>{try{return await model.transport(...args)}finally{if(args[1]?.method!=='GET')await persist()}};
 let providerGuard=null;
 await installGeneratorFixture({
  createGit:(api,options)=>{providerGuard=options.guard();return createS04GitContinuation(api,{...options,scan:o=>scanMainCatalog(o,network),transport:network})},
  createImportGuard:api=>createInitialImportGuard(api,{inspect:o=>inspectCurrentImportItem(o,network)})
 });
 const db=await openCanonicalDatabase({open:(_name,version)=>indexedDB.open('pcms-j02-ui-fixture',version)}),open=async()=>db;
 const api={...browser,storage:{local:browser.storage.local},runtime:{...browser.runtime}};
 const catalog=createCatalogBoundary(api,{open,transport:network,scan:o=>scanMainCatalog(o,network),native:browserGitCredentialPacket,
  promptWriteGate:()=>standingS06.gate('gitWrite'),authorityGeneration:()=>standingS06.policyGeneration()});
 const source=createSourceBoundary(api,{open,inspect:o=>inspectGitSource(o,network),readFile:o=>readVerifiedGitFile(o,network)});
 const canonical=createCommandBoundary(api,{open});
 const renameGuard={...providerGuard,inspectSourceEditorIdle:async()=>({ok:true,clean:true}),
  observeReadOnly:async(uid,_edit,slug)=>{
   const resource=model.state.renameResource||{oldSlug:'j02-owned-000-002',newSlug:null,remoteId:'public_0_2'};
   if(slug!==(resource.newSlug||resource.oldSlug))return {ok:false,code:'OFFLINE_RENAMED_SOURCE_MISSING'};
   const raw=await providerGuard.observeReadOnly(uid,false,slug);
   return {...raw.original,ok:true,source:'DONOR_GUARDED_ORIGINAL_READBACK',slug,accountId:'account_j02_000',personaUid:uid,principalFingerprint:'a'.repeat(64),observedAt:Date.now()};
  },
  runSupplyStep:async(uid,request)=>{
   if(request.kind==='RENAME_EXISTING'){
    model.state.renameEffects||=[];model.state.renameEffects.push({oldSlug:request.temporarySlug,newSlug:request.slug,remoteId:request.remoteId});
    model.state.renameResource={oldSlug:request.temporarySlug,newSlug:request.slug,remoteId:request.remoteId};await persist();return {ok:false,code:'OFFLINE_LOST_RENAME_ACK'};
   }
   if(request.kind==='READ_EXISTING_RENAME')return model.state.renameResource?.newSlug===request.slug&&model.state.renameResource.remoteId===request.remoteId?{ok:true,state:'RENAMED_SAME_REMOTE_ID'}:{ok:false};
   return providerGuard.runSupplyStep(uid,request);
  }};
 const rename=createExistingRenameService(api,{open,guard:()=>renameGuard,developmentGate:()=>standingS06.gate('development'),
  verifyGitIdentity:createRenameGitVerifier(api,{inspectItem:o=>inspectCurrentImportItem(o,network)}),
  linkRenamed:createRenamedIdentityLinker(api,{open,guard:()=>renameGuard,inspect:o=>inspectGitSource(o,network),inspectItem:o=>inspectCurrentImportItem(o,network)})});
 const identity=createFolderIdentityBoundary(api,{renameService:rename});
 const watcher=createCatalogWatcher(api,{scan:scanMainCatalog,network,native:browserGitCredentialPacket,incidents:async()=>{},
  ingestComplete:createCreationCatalogIntake(api,{open}).run,ingestReady:createReadyIntake(api,{open}).run});
 const commands=[],original=browser.runtime.connect.bind(browser.runtime),boundaries=new Map([
  ['pcms-s03-catalog',catalog.run],['pcms-i05-source',source.run],['pcms-i02-canonical-readonly',canonical.dispatch],['pcms-r4-folder-identity',identity.dispatch]]);
 const sender={id:browser.runtime.id,url:browser.runtime.getURL('pcms/index.html')+'#settings'};
 browser.runtime.connect=function(...args){const name=args.at(-1)?.name;if(!boundaries.has(name))return original(...args);
  const handlers=new Set(),disconnected=new Set();let closed=false;
  return {onMessage:{addListener:fn=>handlers.add(fn)},onDisconnect:{addListener:fn=>disconnected.add(fn)},disconnect(){closed=true},
   postMessage(msg){Promise.resolve(boundaries.get(name)(msg,sender)).then(out=>{commands.push({type:msg.type,ok:out?.ok,code:out?.code});if(!closed)for(const fn of handlers)fn(out)}).catch(()=>{if(!closed)for(const fn of disconnected)fn()})}};
 };
 window.__j03={async inspect(){return {git:structuredClone(model.state),provider:await window.__j02.inspect(),commands:structuredClone(commands),policy:await standingS06.state()}},
  async tick(n=1){for(let i=0;i<n;i++){await watcher.tick();await identity.tick();await window.__j02.tick(4)}await persist();return this.inspect()},
  async moveFolder(oldSlug,newSlug){const changes={};for(const [path,oid] of Object.entries(model.paths()))if(path.startsWith('generators/'+oldSlug+'/')){changes[path]=null;changes[path.replace('generators/'+oldSlug+'/','generators/'+newSlug+'/')]=Uint8Array.from(atob(model.state.blobs[oid].content),c=>c.charCodeAt(0));}await model.merge(changes,'external reviewed folder rename');await persist();return true},
  async merge(files,message){await model.merge(files,message);await persist();return model.state.head},
  async loseNextRef(){model.state.loseNextRef=true;await persist();return true},
  async clearRepository(){model.state.head=null;await persist();return true},
  async main(){const credential=await browserGitCredentialPacket({action:'git.get',repositoryId:'42'});return scanMainCatalog({repository:'Neb963/per-gens',token:credential.credential},network)},
  async ready(){return catalog.run({type:'LIST_READY',params:{limit:200}},sender)}
 };
 return {ok:true,head:model.state.head};
}
