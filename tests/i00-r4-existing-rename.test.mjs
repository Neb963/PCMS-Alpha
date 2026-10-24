import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createExistingRenameService} from '../src/runtime/folder-existing-rename.mjs';
import {validateIdentityMessage} from '../src/runtime/folder-identity-boundary.mjs';
globalThis.crypto??=webcrypto;
const SHA=s=>s.repeat(40),FP=s=>s.repeat(64);
const accountId='acct_12345',personaUid='persona_12345',bindingVersion='bind_12345';
const remoteId='public_remote123',repositoryId='42';
function setup({grant=true,collision=false,ack=false}={}){
 const review={repositoryId,oldSlug:'old-generator',newSlug:'new-generator',
   oldTreeOid:SHA('a'),newTreeOid:SHA('b'),markerOid:SHA('c'),
   evidenceHead:SHA('1'),revision:2,state:'RENAME_EXISTING_REQUESTED',
   reason:'EXACT_FOLDER_TREE_MATCH'};
 const snapshot={repository:'Neb963/per-gens',repositoryId,complete:true,head:SHA('1'),
   generators:[{slug:'new-generator',folderTreeOid:SHA('b'),markerOid:SHA('c')}]};
 const saved={pcmsS03Git:{repository:'Neb963/per-gens',repositoryId},
   pcmsS03CatalogLastComplete:snapshot,pcmsR4FolderIdentityReviews:[review]};
 const account={accountId,state:'VERIFIED',revision:5,personaUid,bindingVersion,
   identity:{source:'GUARDED_SESSION_READBACK',bindingVersion,principalFingerprint:FP('d')}};
 const row={slug:'old-generator',accountId,accountRevision:5,personaUid,bindingVersion,
   remoteId,revision:3,ownerState:'OBSERVED_OWNER'};
 const records={['account:'+accountId]:{account},'inventory:old-generator':{generator:row},
  'source-link:old-generator':{link:{slug:'old-generator',
   folder:'generators/old-generator',remoteId,accountId,personaUid,
   bindingVersion,fingerprint:FP('f')}}};
 function db(){
  return {transaction:(stores,mode)=>{
   assert.equal(mode,'readonly');
   const tx={oncomplete:null,onabort:null,objectStore(name){
    assert.equal(name,'meta');
    return {get(key){
     const req={onsuccess:null};
     queueMicrotask(()=>req.onsuccess?.({target:{result:records[key]}}));
     return req;
    }};
   }};
   setTimeout(()=>tx.oncomplete?.(),12);return tx;
  }};
 }
 let remoteRenamed=false,changedSource=false,renames=0,reads=0;
 const g={
  getSafeRouteReadiness:async()=>({ready:true,routeId:'mullvad-route',
    cookieStoreId:'firefox-container'}),
  observeReadOnly:async(uid,edit,slug)=>{
   reads++;
   return {ok:true,source:'DONOR_GUARDED_ORIGINAL_READBACK',
    slug,accountId,personaUid,principalFingerprint:FP('d'),
    ownerResult:'IS_OWNER',visibility:'PUBLIC',remotePublicId:remoteId,
    observedAt:100,pjs:changedSource?'changed':'const a = 1',
    html:'<h1>Original</h1>',assets:[]};
  },
  runSupplyStep:async(uid,request)=>{
   assert.equal(uid,personaUid);
   if(request.kind==='READ_TARGET')
    return collision?{ok:true,state:'COLLISION'}:{ok:true,state:'MISSING_VERIFIED'};
   if(request.kind==='RENAME_EXISTING'){
    renames++;remoteRenamed=true;
    return ack?{ok:true,ack:'RENAME_EXISTING_ACK_ONLY'}:{ok:false,code:'ACK_LOST'};
   }
   if(request.kind==='READ_EXISTING_RENAME')
    return remoteRenamed?{ok:true,state:'RENAMED_SAME_REMOTE_ID'}:{ok:false,code:'OLD_STILL_PRESENT'};
   throw Error('unexpected supplier action '+request.kind);
  }
 };
 const api={storage:{local:{
  get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys])
   .filter(k=>k in saved).map(k=>[k,structuredClone(saved[k])])),
  set:async patch=>{for(const [k,v] of Object.entries(patch))saved[k]=structuredClone(v);}
 }}};
 let grantActive=grant;
 const service=createExistingRenameService(api,{open:async()=>db(),guard:()=>g,
   clock:()=>200,developmentGate:()=>grantActive,linkRenamed:async()=>({ok:false,code:'RENAMED_SOURCE_LINK_NOT_VERIFIED'}),preserveOriginal:async()=>({ok:true})});
 return {service,saved,records,review,reads:()=>reads,renames:()=>renames,
   changeSource:()=>changedSource=true,removeOldInventory:()=>delete records['inventory:old-generator'],
   removeOldLink:()=>delete records['source-link:old-generator'],
   installVerifiedNewLink:()=>{
    records['inventory:new-generator']={generator:{...row,slug:'new-generator',revision:4}};
    records['source-link:new-generator']={link:{
      slug:'new-generator',folder:'generators/new-generator',
      remoteId,accountId,personaUid,bindingVersion,fingerprint:FP('e')}};
   },
   setGrant:v=>grantActive=v};
}
test('R4 AC-09 verified existing rename is separately gated, staged, and never blind-retried',async()=>{
 const x=setup({ack:false});
 const prepare=await x.service.run({type:'PREPARE',newSlug:'new-generator',expectedRevision:2});
 assert.equal(prepare.code,'EXACT_EXISTING_RENAME_PREPARED',JSON.stringify(prepare));
 assert.equal(x.renames(),0);
 const execute=await x.service.run({type:'EXECUTE',consent:'I APPROVE THE EXACT EXISTING GENERATOR RENAME',newSlug:'new-generator',expectedRevision:1});
 assert.equal(execute.code,'RENAME_OUTCOME_REQUIRES_READBACK',JSON.stringify(execute));
 assert.equal(x.renames(),1);
 assert.equal(x.saved['pcmsR4ExistingRenameAttempt:new-generator'].state,'OUTCOME_UNCERTAIN');
 assert.equal((await x.service.run({type:'EXECUTE',consent:'I APPROVE THE EXACT EXISTING GENERATOR RENAME',newSlug:'new-generator',expectedRevision:3})).code,
   'RENAME_STAGE_NOT_ADMISSIBLE');
 assert.equal(x.renames(),1,'possible provider effect never retried');
 x.removeOldInventory();
 const readback=await x.service.run({type:'RECONCILE',newSlug:'new-generator',expectedRevision:3});
 assert.equal(readback.code,'REMOTE_RENAME_VERIFIED_SOURCE_RELINK_PENDING',JSON.stringify(readback));
 assert.equal(readback.providerEffects,'NO_NEW_EFFECT');
 assert.equal(x.renames(),1);
 const unlinked=await x.service.run({type:'FINALIZE',newSlug:'new-generator',expectedRevision:4});
 assert.equal(unlinked.code,'RENAMED_SOURCE_LINK_NOT_VERIFIED');
 assert.equal(x.renames(),1);
 x.installVerifiedNewLink();
 const final=await x.service.run({type:'FINALIZE',newSlug:'new-generator',expectedRevision:4});
 assert.equal(final.code,'VERIFIED_EXISTING_RENAME_COMPLETED',JSON.stringify(final));
 assert.equal(x.saved.pcmsR4FolderIdentityReviews[0].state,'RENAME_EXISTING_COMPLETED');
 assert.equal(x.renames(),1,'finalize never runs provider rename again');
});
test('R4 AC-09 no grant, bad original source or target collision rejects before any rename',async()=>{
 const without=setup({grant:false});
 assert.equal((await without.service.run({type:'PREPARE',newSlug:'new-generator',expectedRevision:2})).code,
  'DEVELOPMENT_AUTHORITY_REQUIRED');
 assert.equal(without.renames(),0);
 const unrelated=setup();
 unrelated.removeOldLink();
 assert.equal((await unrelated.service.run({type:'PREPARE',
   newSlug:'new-generator',expectedRevision:2})).code,
   'RENAMED_OWNER_CONTEXT_UNVERIFIED');
 assert.equal(unrelated.renames(),0,'unassociated original can never be renamed');
 const collision=setup({collision:true});
 assert.equal((await collision.service.run({type:'PREPARE',newSlug:'new-generator',expectedRevision:2})).code,
   'RENAME_TARGET_NOT_CLEAR');
 assert.equal(collision.renames(),0);
 const drift=setup();
 assert.equal((await drift.service.run({type:'PREPARE',newSlug:'new-generator',expectedRevision:2})).ok,true);
 drift.changeSource();
 assert.equal((await drift.service.run({type:'EXECUTE',consent:'I APPROVE THE EXACT EXISTING GENERATOR RENAME',newSlug:'new-generator',expectedRevision:1})).code,
   'ORIGINAL_SOURCE_CHANGED');
 assert.equal(drift.renames(),0);
});
test('R4 AC-09 already-possible rename is readback-only after standing grant revocation',async()=>{
 const x=setup();
 assert.equal((await x.service.run({type:'PREPARE',newSlug:'new-generator',expectedRevision:2})).ok,true);
 assert.equal((await x.service.run({type:'EXECUTE',consent:'I APPROVE THE EXACT EXISTING GENERATOR RENAME',newSlug:'new-generator',expectedRevision:1})).ok,true);
 x.setGrant(false);
 const r=await x.service.run({type:'RECONCILE',newSlug:'new-generator',expectedRevision:3});
 assert.equal(r.ok,true);
 x.removeOldInventory();
 x.installVerifiedNewLink();
 const complete=await x.service.run({type:'FINALIZE',newSlug:'new-generator',expectedRevision:4});
 assert.equal(complete.code,'VERIFIED_EXISTING_RENAME_COMPLETED');
 assert.equal(x.renames(),1,'grant revocation permits read-only finalization but not a second rename');
});
test('R4 identity port rejects foreign pages, unversioned or malformed existing-rename effect requests',()=>{
 const api={runtime:{id:'pcms-id',getURL:x=>'moz-extension://test/'+x}};
 const sender={id:'pcms-id',url:'moz-extension://test/pcms/index.html#work-queue'};
 assert.equal(validateIdentityMessage(api,{...sender,id:'attacker'},{
   type:'EXECUTE_RENAME',params:{newSlug:'new-generator',expectedRevision:1}}).code,'UNTRUSTED_SENDER');
 assert.equal(validateIdentityMessage(api,sender,{
   type:'EXECUTE_RENAME',params:{newSlug:'new-generator'}}).code,'INVALID_PARAMS');
 assert.equal(validateIdentityMessage(api,sender,{
   type:'EXECUTE_RENAME',params:{newSlug:'new-generator',expectedRevision:1,remoteId:'chosen'}}).code,'INVALID_PARAMS');
 assert.equal(validateIdentityMessage(api,sender,{
   type:'EXECUTE_RENAME',params:{newSlug:'new-generator',expectedRevision:1}}).code,'INVALID_PARAMS');
 assert.equal(validateIdentityMessage(api,sender,{
   type:'EXECUTE_RENAME',params:{newSlug:'new-generator',expectedRevision:1,
    consent:'I APPROVE THE EXACT EXISTING GENERATOR RENAME'}}).ok,true);
 assert.equal(validateIdentityMessage(api,sender,{
   type:'PREPARE_RENAME',params:{newSlug:'new-generator',expectedRevision:2}}).ok,true);
});
