import {readFile} from 'node:fs/promises';
import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';import {verifyOriginal} from '../src/runtime/adoption.mjs';
import {createAdoptionStore} from '../src/runtime/adoption-store.mjs';
import {preserveRenameBaseline,verifyRenameBaseline,createRenameGitVerifier} from '../src/runtime/folder-rename-link.mjs';
import {inspectCanonicalRenameSafety} from '../src/runtime/folder-rename-safety.mjs';
import {auditSourceClosureRows} from '../src/runtime/backup-source-closure.mjs';
import {createPersonaGuard,isGuardedRenamePreInvocationHold} from '../src/runtime/persona-guard.mjs';
globalThis.crypto??=webcrypto;
const account={accountId:'account_rename',personaUid:'persona_rename',bindingVersion:1,state:'VERIFIED',revision:4,
 identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:'a'.repeat(64)}};
const row={slug:'rename-original',remoteId:'public_rename',accountId:account.accountId,personaUid:account.personaUid,bindingVersion:1,accountRevision:4,ownerState:'OBSERVED_OWNER',visibility:'PUBLIC',revision:1};
const packet=pjs=>({ok:true,source:'DONOR_GUARDED_ORIGINAL_READBACK',slug:row.slug,remotePublicId:row.remoteId,accountId:account.accountId,personaUid:account.personaUid,
 principalFingerprint:account.identity.principalFingerprint,ownerResult:'IS_OWNER',visibility:'PUBLIC',observedAt:1,pjs,html:'<p>Preserved</p>',assets:[]});
async function put(db,items){const t=db.transaction(['meta'],'readwrite');for(const v of items)t.objectStore('meta').put(v);await new Promise((r,j)=>{t.oncomplete=r;t.onabort=j})}
test('J03 rename saves current B independently of first-adoption A and source-complete backup audits both',async()=>{
 const db=fakeDatabase();await put(db,[{key:'account:'+account.accountId,account},{key:'inventory:'+row.slug,generator:row}]);
 const a=await verifyOriginal(packet('Original A'),row,account),b=await verifyOriginal(packet('Current B'),row,account),adoption=createAdoptionStore(db);
 assert.equal((await adoption.adopt({slug:row.slug,expectedRevision:1,standingManagement:true},a)).ok,true);
 assert.equal((await adoption.adopt({slug:row.slug,expectedRevision:1,standingManagement:true},b)).duplicate,true);
 const baseline=await preserveRenameBaseline(db,{row,account},b);assert.equal(baseline.ok,true);
 const first=db.read('meta','adoption:'+row.slug).adoption.original,second=db.read('meta',baseline.baselineKey).record.original;
 assert.equal(first.fingerprint,a.fingerprint);assert.equal(second.fingerprint,b.fingerprint);assert.notEqual(first.fingerprint,second.fingerprint);
 const attempt={baselineKey:baseline.baselineKey,accountId:row.accountId,personaUid:row.personaUid,bindingVersion:1,principalFingerprint:account.identity.principalFingerprint,remoteId:row.remoteId,sourceFingerprint:b.fingerprint};
 assert.equal((await verifyRenameBaseline(db,attempt)).ok,true);
 const audited=await auditSourceClosureRows([{key:'adoption:'+row.slug,value:db.read('meta','adoption:'+row.slug)},{key:baseline.baselineKey,value:db.read('meta',baseline.baselineKey)}]);assert.equal(audited.manifests,2);
 const broken=structuredClone(db.read('meta',baseline.baselineKey));broken.record.original.blobs[0].base64='AAAA';await put(db,[broken]);assert.equal((await verifyRenameBaseline(db,attempt)).ok,false);
});
test('J03 rename fresh-main verifier rejects changed tree and a returned old folder',async()=>{
 const review={repositoryId:'42',oldSlug:'old',newSlug:'new',newTreeOid:'b'.repeat(40),markerOid:'c'.repeat(40)};
 for(const patch of [{},{oldAbsent:false},{folderTreeOid:'f'.repeat(40)},{markerOid:'e'.repeat(40)}]){
  const verify=createRenameGitVerifier({}, {credential:async()=>({ok:true,repository:'Neb963/per-gens',repositoryId:'42',token:'isolated'}),inspectItem:async()=>({ok:true,oldAbsent:true,folderTreeOid:review.newTreeOid,markerOid:review.markerOid,...patch})});
  assert.equal((await verify(review)).ok,Object.keys(patch).length===0);
 }
});
test('J03 rename source admission holds native AI, source uncertainty and Refresher intent but leaves unrelated work independent',async()=>{
 for(const record of [
  {key:'ai-job:'+row.slug,job:{slug:row.slug,state:'RUNNING',native:{state:'RUNNING_OBSERVED'}}},
  {key:'stage:'+row.slug,record:{slug:row.slug,state:'DISPATCH_POSSIBLE'}},
  {key:'existing-update:'+row.slug,record:{slug:row.slug,state:'STAGE_UNCERTAIN'}},
  {key:'release:'+row.slug,release:{slug:row.slug,state:'PUBLICATION_UNCERTAIN'}},
  {key:'refresher',state:{rows:[{slug:row.slug,stableId:'refresher_target',refresh:{intent:{state:'DISPATCH_POSSIBLE'}}}]}}
 ]){const db=fakeDatabase();await put(db,[record]);assert.equal((await inspectCanonicalRenameSafety(db,row.slug)).ok,false);assert.equal((await inspectCanonicalRenameSafety(db,'unrelated')).ok,true);}
});
test('J03 final rename source/editor checks execute under the same donor lease and return unforgeable no-invocation holds',async()=>{
 for(const kind of ['busy','dirty','throw','revoke','clear']){let active=false,effects=0,enabled=true,generation=0;
  const uid='persona-rename',context={personaUid:uid,cookieStoreId:'firefox-rename',routeId:'protected',route:{enabled:true},pcmsBindingId:'binding_rename'};
  const guard=createPersonaGuard({initialize:async()=>{},securityState:{ready:true,privacySafe:true,proxyControl:'controlled_by_this_extension'},
   shared:{resolve:async()=>context,acquire:async()=>{active=true;return {leaseId:'rename_lease',cookieStoreId:context.cookieStoreId}},validate:async()=>{assert.equal(active,true);return {cookieStoreId:context.cookieStoreId}},release:async()=>{active=false}},
   renameAuthority:()=>enabled,renameAuthorityGeneration:()=>generation,getRouteTest:async()=>({ok:true}),pinGate:()=>({allow:true}),renameSafety:async()=>{assert.equal(active,true);if(kind==='throw')throw Error('storage');return {ok:kind!=='busy'}},
   inspectNoEditorTabs:async()=>{assert.equal(active,true);if(kind==='revoke'){enabled=false;generation++;}return {ok:true,noEditors:kind!=='dirty'}},supplyIsolatedTab:async()=>{assert.equal(active,true);effects++;return {ok:true,ack:'RENAME_EXISTING_ACK_ONLY'}}});
  const result=await guard.runSupplyStep(uid,{kind:'RENAME_EXISTING',temporarySlug:'old',slug:'new'});
  assert.equal(active,false);assert.equal(effects,kind==='clear'?1:0);assert.equal(isGuardedRenamePreInvocationHold(result),kind!=='clear');assert.equal(isGuardedRenamePreInvocationHold({...result}),false);
 }
});

test('J03 policy listener has one background bootstrap and no automatic dashboard-side registration',async()=>{
 const authority=await readFile(new URL('../src/runtime/s06-standing-authority.mjs',import.meta.url),'utf8');
 const bootstrap=await readFile(new URL('../src/runtime/s06-authority-bootstrap.mjs',import.meta.url),'utf8');
 const entry=await readFile(new URL('../src/runtime/entry.mjs',import.meta.url),'utf8');
 assert.doesNotMatch(authority,/if\(standingS06\)standingS06\.register\(\)/);
 assert.match(bootstrap,/if\(standingS06\)standingS06\.register\(\)/);
 assert.ok(entry.indexOf("import '../lib/recovery-bootstrap.js'")<entry.indexOf("import './s06-authority-bootstrap.mjs'"));
 assert.ok(entry.indexOf("import './s06-authority-bootstrap.mjs'")<entry.indexOf("import './coordinator-boundary.mjs'"));
});
