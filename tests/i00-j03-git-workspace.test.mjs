import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createInitialImportGuard} from '../src/runtime/creation-import-authority.mjs';
import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';
import {buildImportPreview} from '../src/runtime/catalog-import-preview.mjs';
import {getImportScopeDigest,createImportApprovalStore} from '../src/runtime/catalog-import.mjs';
import {createCreationCatalogIntake} from '../src/runtime/creation-catalog.mjs';
import {createCatalogBoundary,validateCatalogMessage} from '../src/runtime/catalog-boundary.mjs';
import {createSourceBoundary,validateSourceMessage} from '../src/runtime/source-boundary.mjs';
import {readVerifiedGitFile} from '../src/runtime/git-source.mjs';
globalThis.crypto??=webcrypto;
const sha=b=>createHash('sha256').update(b).digest('hex'),oid=b=>createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');
const runtime={id:'j03_test',getURL:p=>'moz-extension://fixture/'+p},sender={id:runtime.id,url:runtime.getURL('pcms/index.html')+'#settings'};
async function put(db,items){const t=db.transaction(['meta'],'readwrite');for(const v of items)t.objectStore('meta').put(v);await new Promise((r,j)=>{t.oncomplete=r;t.onabort=j})}
function storage(initial={}){const map=new Map(Object.entries(initial));return {get:async key=>Array.isArray(key)?Object.fromEntries(key.filter(k=>map.has(k)).map(k=>[k,map.get(k)])):map.has(key)?{[key]:map.get(key)}:{},set:async v=>{for(const [k,x] of Object.entries(v))map.set(k,x)},remove:async key=>map.delete(key)}}
const cfg={repository:'Neb963/per-gens',repositoryId:'42'};
const catalog=(slugs=['known-owned','new-private'])=>({ok:true,complete:true,source:'PINNED_MAIN_READ_ONLY',...cfg,head:'a'.repeat(40),recognizedCount:slugs.length,
 generators:slugs.map(slug=>({slug,folder:'generators/'+slug,markerOid:'b'.repeat(40),sourceState:'NOT_READY',ready:false})),prompt:{state:'PRESENT',oid:'c'.repeat(40),text:'Use the actual Git prompt'}});
async function seed(){const db=fakeDatabase();const accounts=['account_j03_a','account_j03_b'].map((accountId,i)=>({accountId,alias:'Account '+(i+1),state:'VERIFIED',revision:3,bindingVersion:1,personaUid:'persona_'+i,
 identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:String(i+1).repeat(64)}}));
 await put(db,[...accounts.map(account=>({key:'account:'+account.accountId,account})),...accounts.map((a,i)=>({key:'inventory-batch:'+a.accountId,lastConfirmedCount:i?0:20})),
 {key:'inventory:known-owned',generator:{slug:'known-owned',accountId:accounts[0].accountId,remoteId:'public_existing',personaUid:accounts[0].personaUid,bindingVersion:1,ownerState:'OBSERVED_OWNER',revision:1}}]);return {db,accounts};}
test('J03 import shows existing owners and the actual balanced planned account at 1001+ scale without effects',async()=>{
 const {db,accounts}=await seed(),c=catalog(['known-owned',...Array.from({length:1001},(_,i)=>'new-'+i)]);
 const p=await buildImportPreview(db,c);assert.equal(p.items.length,1002);assert.equal(p.items[0].action,'ADOPT');assert.equal(p.items[0].accountId,accounts[0].accountId);
 assert.equal(p.items[1].action,'CREATE');assert.equal(p.items[1].proposedAccountId,accounts[1].accountId);assert.equal(p.items[1].observed,'NOT_IN_MANAGED_INVENTORY');assert.match(p.planDigest,/^[a-f0-9]{64}$/);
 assert.equal(db.keys('operations').length,0);assert.equal(db.keys('events').length,0);
});
test('J03 initial approval binds source and ownership, allows reviewed changed scope, wakes normal background intake',async()=>{
 const {db}=await seed(),local=storage({pcmsS03Git:cfg}),alarms=[];let current=catalog();
 const api={runtime,storage:{local},alarms:{create:async(...a)=>alarms.push(a)}};
 const b=createCatalogBoundary(api,{open:async()=>db,scan:async()=>current,native:async()=>({ok:true,credential:'test-credential-only'})});
 const scan=()=>b.run({type:'SCAN_CONNECTED'},sender),approve=p=>b.run({type:'APPROVE_IMPORT',params:{repositoryId:'42',scopeDigest:p.preview.scopeDigest,planDigest:p.preview.planDigest,expectedRevision:p.approvalRevision}},sender);
 const original=await scan();assert.equal(original.preview.items[1].action,'CREATE');
 await put(db,[{key:'inventory:new-private',generator:{slug:'new-private',ownerState:'OWNER_CONFLICT',accountId:'account_j03_b',remoteId:'different-id',bindingVersion:1}}]);
 assert.equal((await approve(original)).code,'IMPORT_SCOPE_CHANGED_REVIEW_REQUIRED');assert.equal(db.keys('events').length,0);
 const changed=await scan();assert.equal(changed.preview.items[1].action,'HELD');assert.equal((await approve(changed)).ok,true);assert.equal(alarms.at(-1)[0],'pcms-s03-main-resume');
 current=catalog(['known-owned','new-private','new-folder']);
 const moved=await scan();assert.equal(moved.importStatus,'IMPORT_SCOPE_CHANGED_REVIEW_REQUIRED');assert.equal((await approve(moved)).ok,true);
 assert.equal((await createImportApprovalStore(db).get('42')).approval.revision,2);
 assert.equal(validateCatalogMessage(api,sender,{type:'APPROVE_IMPORT',params:{repositoryId:'42',scopeDigest:original.preview.scopeDigest}}).ok,false);
 const intake=createCreationCatalogIntake(api,{open:async()=>db});
 await put(db,[{key:'inventory:new-folder',generator:{slug:'new-folder',accountId:'account_j03_b',remoteId:'unexpected',ownerState:'OBSERVED_OWNER',bindingVersion:1}}]);
 assert.equal((await intake.run(current)).code,'INITIAL_IMPORT_OWNERSHIP_CHANGED_REVIEW_REQUIRED');assert.equal(db.keys('meta').some(k=>k.startsWith('s00-create-intent:')),false);
});
test('J03 completed initial setup does not demand another approval for newly merged folders',async()=>{
 const {db}=await seed(),c=catalog(),scopeDigest=await getImportScopeDigest(c),plan=await buildImportPreview(db,c);
 await createImportApprovalStore(db).approve({...cfg,head:c.head,scopeDigest,recognizedSlugs:c.generators.map(g=>g.slug),approvalAt:10,planDigest:plan.planDigest,targets:plan.targets,reviewedSources:c.generators.map(g=>({slug:g.slug,markerOid:g.markerOid,folderTreeOid:g.folderTreeOid||null}))});
 const local=storage({pcmsS03Git:cfg,pcmsS04CatalogIntakeProgress:{repositoryId:'42',initialScopeDigest:scopeDigest,initialImportCompleted:true,initialApprovalRevision:1}}),api={runtime,storage:{local}};
 const next=catalog(['known-owned','new-private','later-folder']),boundary=createCatalogBoundary(api,{open:async()=>db,scan:async()=>next,native:async()=>({ok:true,credential:'test-credential-only'})});
 assert.equal((await boundary.run({type:'SCAN_CONNECTED'},sender)).importStatus,'IMPORT_SETUP_COMPLETE');
 const result=await createCreationCatalogIntake(api,{open:async()=>db}).run(next);assert.equal(result.ok,true,result.code);assert.equal(result.added,3);
 const rows=db.keys('meta').filter(k=>k.startsWith('s00-create-intent:')).map(k=>db.read('meta',k).record).filter(Boolean);
 assert.equal(rows.length,3);assert.ok(rows.every(r=>r.origin==='GITHUB_MAIN'&&r.sources.every(s=>s.type==='GITHUB_MAIN')));
});
test('J03 source-file UI boundary returns only a verified selected file from its inspected main manifest',async()=>{
 const raw=Buffer.from([0,255,128,1]),file={path:'src/a/b/c/d/e/f/binary.dat',oid:oid(raw),size:raw.length,sha256:sha(raw)},local=storage(),api={runtime,storage:{local}};
 let reads=0;const boundary=createSourceBoundary(api,{credential:async()=>({ok:true,token:'test-credential-only'}),inspect:async()=>({ok:true,folder:'generators/known-owned',head:'a'.repeat(40),paths:[file]}),
 readFile:async({file:f})=>{reads++;assert.equal(f,file);return {ok:true,base64:raw.toString('base64'),sha256:f.sha256,size:f.size}}});
 const params={folder:'generators/known-owned',path:file.path,pinnedHead:'a'.repeat(40),pinnedSha256:file.sha256};
 assert.equal(validateSourceMessage(api,sender,{type:'READ_SOURCE_FILE',params}).ok,true);
 assert.equal((await boundary.run({type:'READ_SOURCE_FILE',params},sender)).code,'SOURCE_SNAPSHOT_EXPIRED');
 await boundary.run({type:'INSPECT_SOURCE',params:{folder:params.folder}},sender);
 const out=await boundary.run({type:'READ_SOURCE_FILE',params},sender);assert.equal(out.ok,true);assert.deepEqual(Buffer.from(out.base64,'base64'),raw);assert.equal(out.head,params.pinnedHead);
 assert.equal((await boundary.run({type:'READ_SOURCE_FILE',params:{...params,pinnedSha256:'f'.repeat(64)}},sender)).code,'SOURCE_SNAPSHOT_EXPIRED');
 assert.equal((await boundary.run({type:'READ_SOURCE_FILE',params},{id:'hostile'})).code,'UNTRUSTED_SENDER');assert.equal(reads,1);
 assert.equal(validateSourceMessage(api,sender,{type:'READ_SOURCE_FILE',params:{...params,folder:'other/root'}}).ok,false);
 for(const corrupt of [false,true]){const r=await readVerifiedGitFile({token:'test-credential-only',file},async()=>({status:200,json:async()=>({sha:file.oid,size:file.size,encoding:'base64',content:(corrupt?Buffer.from([1,1,1,1]):raw).toString('base64')})}));assert.equal(r.ok,!corrupt);}
});

test('J03 initial import remains bound through first creation, not only intake completion',async()=>{
 const {db}=await seed(),c=catalog(),plan=await buildImportPreview(db,c),scopeDigest=await getImportScopeDigest(c),approvals=createImportApprovalStore(db);
 const approval=await approvals.approve({...cfg,head:c.head,scopeDigest,recognizedSlugs:c.generators.map(g=>g.slug),approvalAt:100,planDigest:plan.planDigest,targets:plan.targets,reviewedSources:c.generators.map(g=>({slug:g.slug,markerOid:g.markerOid,folderTreeOid:g.folderTreeOid||null}))});
 const local=storage({pcmsS03Git:cfg}),api={runtime,storage:{local}},intake=createCreationCatalogIntake(api,{open:async()=>db});
 assert.equal((await intake.run(c)).ok,true);const store=createCoordinatorStore(db),rows=await store.listCreate({limit:10});
 const item=(await store.getCreate(rows.items.find(r=>r.slug==='new-private').intentId)).record;assert.equal(item.sources[0].initialImport.revision,1);
 const guard=createInitialImportGuard(api,{inspect:async()=>({ok:true,repositoryId:'42',...c.generators.find(g=>g.slug==='new-private')}),credential:async()=>({ok:true,credential:'test-credential-only'})});
 assert.equal((await guard(db,item)).ok,true);
 await put(db,[{key:'inventory:new-private',generator:{slug:'new-private',accountId:'account_j03_b',remoteId:'new-owner',ownerState:'OBSERVED_OWNER',bindingVersion:1}}]);
 assert.equal((await guard(db,item)).code,'INITIAL_IMPORT_SCOPE_REVIEW_REQUIRED');assert.equal((await buildImportPreview(db,c)).initialReviewRequired,true);
 const next=await buildImportPreview(db,c);await approvals.approve({...cfg,head:c.head,scopeDigest,recognizedSlugs:c.generators.map(g=>g.slug),approvalAt:101,planDigest:next.planDigest,targets:next.targets,reviewedSources:c.generators.map(g=>({slug:g.slug,markerOid:g.markerOid,folderTreeOid:g.folderTreeOid||null})),expectedRevision:1});
 assert.equal((await intake.run(c)).ok,true);const renewed=(await store.getCreate(item.intentId)).record;assert.equal(renewed.sources[0].initialImport.revision,2);
 assert.equal((await guard(db,renewed)).ok,true);
 assert.equal((await guard(db,{...renewed,sources:[...renewed.sources,{type:'OPERATOR',intentId:'genuine_explicit_request'}]})).ok,true);
 const stale=await approvals.approve({...cfg,head:c.head,scopeDigest,recognizedSlugs:c.generators.map(g=>g.slug),approvalAt:102,planDigest:'f'.repeat(64),targets:next.targets,reviewedSources:c.generators.map(g=>({slug:g.slug,markerOid:g.markerOid,folderTreeOid:g.folderTreeOid||null})),expectedRevision:1});
 assert.equal(stale.ok,false);assert.equal(stale.code,'IMPORT_SCOPE_CHANGED_REVIEW_REQUIRED');
 const changedSource={...c,generators:c.generators.map(g=>g.slug===renewed.slug?{...g,markerOid:'e'.repeat(40)}:g)};
 const sourceGuard=createInitialImportGuard(api,{inspect:async()=>({ok:true,repositoryId:'42',...changedSource.generators.find(g=>g.slug==='new-private')}),credential:async()=>({ok:true,credential:'test-credential-only'})});
 assert.equal((await sourceGuard(db,renewed)).code,'INITIAL_IMPORT_SOURCE_CHANGED_REVIEW_REQUIRED');
});
