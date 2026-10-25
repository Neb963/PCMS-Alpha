import test from 'node:test';import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';import {exactSource} from '../src/runtime/staging-core.mjs';
import {createGitModel} from '../scripts/fixtures/j03-git-model.mjs';import {scanMainCatalog} from '../src/runtime/git-catalog.mjs';import {inspectReadyCandidate} from '../src/runtime/catalog-declaration.mjs';
import {createReadyStore} from '../src/runtime/ready-store.mjs';import {createReadyOperator} from '../src/runtime/ready-operator.mjs';
import {createStagingBoundary} from '../src/runtime/staging-boundary.mjs';import {createStagingStore,findEligibleManagedSource} from '../src/runtime/staging-store.mjs';import {releaseCandidateKind} from '../src/runtime/release-core.mjs';import {planReadyDevelopment} from '../src/runtime/ready-development.mjs';
const slug='adopted-private-initial',aid='account-private',uid='persona-private',rid='resource-private',principal='a'.repeat(64),repository='Neb963/per-gens',token='offline-private-adoption-token';
const put=(db,...rows)=>new Promise(resolve=>{const t=db.transaction('meta','readwrite');t.oncomplete=resolve;for(const r of rows)t.objectStore('meta').put(r)}),text=b=>Buffer.from(b.base64,'base64').toString();
async function fixture(mode=''){
 const db=fakeDatabase(),model=await createGitModel(),P=await exactSource([{path:'main.pjs',base64:btoa('original private source')},{path:'index.html',base64:btoa('<p>previous</p>')},{path:'src/original.bin',base64:'CQD/'}]);
 await model.merge({'pcms/prompts/default-chat1.md':'Test actual saved source.',['generators/'+slug+'/DEPLOYMENT.md']:'Status: READY\nReady-Revision: private-adopt-001\n',['generators/'+slug+'/main.pjs']:'output\n  New candidate\n',['generators/'+slug+'/index.html']:'<h1>New</h1>',['generators/'+slug+'/src/new.bin']:new Uint8Array([0,255,128,17])});
 const catalog=await scanMainCatalog({repository,token},model.transport),coherent=await inspectReadyCandidate({repository,token,slug,pinnedHead:catalog.head,includeSourceBytes:true},model.transport),queue=createReadyStore(db);
 const account={accountId:aid,personaUid:uid,revision:1,bindingVersion:1,state:'VERIFIED',identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:principal}},inventory={slug,accountId:aid,personaUid:uid,bindingVersion:1,remoteId:rid,revision:1,ownerState:'OBSERVED_OWNER',visibility:'UNLISTED',management:'ADOPTED_PRIVATE',source:'SOURCE_VERIFIED'},link={...inventory,folder:'generators/'+slug,source:'INDEPENDENT_EXISTING_ASSOCIATION'};
 const original={...P,source:'INDEPENDENT_FULL_BYTE_READBACK',sourceStage:'PCMS_STAGED_SOURCE_V1',stagedFingerprint:P.fingerprint,remotePublicId:rid,visibility:'UNLISTED'};if(mode==='corrupt-original')original.blobs[0]={...original.blobs[0],base64:btoa('corrupt archive')};
 await put(db,{key:'account:'+aid,account},{key:'inventory:'+slug,generator:inventory},{key:'source-link:'+slug,link},{key:'adoption:'+slug,adoption:{slug,accountId:aid,personaUid:uid,bindingVersion:1,accountRevision:1,revision:1,principalFingerprint:principal,remotePublicId:rid,archiveState:'ARCHIVED_GIT_CONFIRMED',originalCheckpoint:{qualified:true},original}});
 await queue.observe({slug,repositoryId:'42',identifier:'rev-'+coherent.token,declarationCommit:coherent.declarationCommit,markerOid:coherent.markerOid,inputFingerprint:coherent.inputFingerprint,testingOid:null});
 let saved=mode==='changed-source'?await exactSource([{path:'main.pjs',base64:btoa('unadopted human save')},{path:'index.html',base64:btoa('<p>changed</p>')} ]):P;const effects=[];
 const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},storage:{local:{get:async key=>({[key]:key==='pcmsS03Git'?{repository,repositoryId:'42'}:undefined})}}};
 const guard={getSafeRouteReadiness:async()=>({ready:true,personaUid:uid,cookieStoreId:'container-private',routeId:'protected'}),inspectSourceEditorIdle:async()=>mode==='dirty'?{ok:false,code:'DIRTY_EDITOR'}:{ok:true,clean:true,source:'GUARDED_NO_LOCAL_EDITOR'},inspectStageEditor:async()=>({ok:true,clean:true,source:'GUARDED_EDITOR_CLEAN'}),
  observeReadOnly:async()=>({ok:true,principalFingerprint:mode==='wrong-owner'?'b'.repeat(64):principal,original:{remotePublicId:mode==='wrong-id'?'resource-other':rid,ownerResult:'IS_OWNER',visibility:mode==='public'?'PUBLIC':'UNLISTED',pjs:text(saved.blobs.find(f=>f.path==='main.pjs')),html:text(saved.blobs.find(f=>f.path==='index.html')),assets:saved.blobs.filter(f=>f.path.startsWith('src/'))}}),
  runStageStep:async(_,req)=>{effects.push({kind:'STAGE',candidate:structuredClone(req.candidate)});saved=await exactSource(req.candidate);if(mode==='lost-ack')throw Error('lost ACK after source write');return {ok:true,tab:{tabId:12,cookieStoreId:'container-private',ownershipNonce:req.nonce,owned:true}};}};
 const common={open:async()=>db,guard:()=>guard,effectGate:()=>true,native:async()=>({ok:true,credential:token}),scanCatalog:o=>scanMainCatalog(o,model.transport),inspectReady:o=>inspectReadyCandidate(o,model.transport)};
 return {db,P,queue,inventory,effects,operator:createReadyOperator(api,{...common,scan:o=>scanMainCatalog(o,model.transport),inspect:o=>inspectReadyCandidate(o,model.transport)}),stage:()=>createStagingBoundary(api,common)};
}
test('J04 first nonempty adopted private READY stages without unlisting or public reservation and preserves every original byte across recovery',async()=>{
 for(const mode of ['', 'lost-ack']){const f=await fixture(mode),r=(await f.queue.get(slug)).record;
  assert.equal((await findEligibleManagedSource(f.db,slug)).origin,'ADOPTED_PRIVATE');
  const pin=await f.operator.runTrusted({type:'PREPARE_LOCAL',params:{slug,expectedRevision:r.revision}});assert.equal(pin.ok,true,JSON.stringify(pin));
  let stage=(await createStagingStore(f.db).getFull(slug)).record;assert.equal(stage.sourceOrigin,'ADOPTED_PRIVATE');assert.deepEqual(stage.previous.blobs,f.P.blobs);assert.equal(releaseCandidateKind(stage,f.inventory),'PRIVATE_EXISTING');
  const attempted=await f.stage().runTrusted({type:'STAGE_PRIVATE',params:{slug,expectedRevision:stage.revision}});assert.equal(attempted.ok,mode!=='lost-ack',JSON.stringify(attempted));
  stage=(await createStagingStore(f.db).getFull(slug)).record;
  const observed=await f.stage().runTrusted({type:'RECONCILE_STAGE',params:{slug,expectedRevision:stage.revision}});assert.equal(observed.ok,true,JSON.stringify(observed));
  const final=(await createStagingStore(f.db).getFull(slug)).record;assert.equal(final.state,'SOURCE_VERIFIED');assert.deepEqual(final.previous.blobs,f.P.blobs);assert.equal(f.effects.length,1);assert.equal(f.db.read('meta','existing-update:'+slug),undefined);
 }
});
test('J04 dirty editor, changed source/owner/ID or corrupt private original cannot enter development; newly PUBLIC source switches to public admission',async()=>{
 for(const mode of ['dirty','changed-source','wrong-owner','wrong-id','corrupt-original','public']){const f=await fixture(mode),r=(await f.queue.get(slug)).record;
  const result=await f.operator.runTrusted({type:'PREPARE_LOCAL',params:{slug,expectedRevision:r.revision}});assert.equal(result.ok,false,mode+JSON.stringify(result));assert.equal(f.effects.length,0);assert.equal(f.db.read('meta','stage:'+slug),undefined);
  if(mode==='public'){assert.equal(result.code,'S05_LISTING_OBSERVATION_REFRESHED');const inv=f.db.read('meta','inventory:'+slug).generator;assert.equal(inv.visibility,'PUBLIC');assert.equal(planReadyDevelopment({ready:{ok:true,record:r},visibility:inv.visibility,effects:true}).type,'PREPARE_UPDATE');}
 }
});
