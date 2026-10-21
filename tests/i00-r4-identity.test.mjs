import test from 'node:test';
import assert from 'node:assert/strict';
import {planMainFolderChanges,chooseFolderIdentity,REVIEW_KEY} from '../src/runtime/catalog-identity-review.mjs';
import {createFolderIdentityBoundary,validateIdentityMessage} from '../src/runtime/folder-identity-boundary.mjs';
const H=c=>c.repeat(40);
const repo='Neb963/per-gens',repositoryId='1411034835';
const g=(slug,folder=H('a'),marker=H('b'))=>({slug,folderTreeOid:folder,markerOid:marker,readyDeclared:false});
const snapshot=(head,gens)=>({complete:true,repository:repo,repositoryId,head,generators:gens});
const a=snapshot(H('1'),[g('old-generator',H('a')),g('unrelated',H('d'))]);
const b=snapshot(H('2'),[g('new-generator',H('a')),g('unrelated',H('d'))]);
test('R4 AC-09: complete main missing+new requires operator decision before intake',()=>{
 const p=planMainFolderChanges(a,b);
 assert.equal(p.ok,true);
 assert.deepEqual(p.missing,['old-generator']);
 assert.deepEqual(p.added,['new-generator']);
 assert.deepEqual(p.held,['new-generator']);
 assert.equal(p.created[0].oldSlug,'old-generator');
 assert.equal(p.created[0].revision,1);
 const chosen=chooseFolderIdentity(p,{newSlug:'new-generator',choice:'CREATE_SEPARATE',
   expectedTreeOid:H('a')});
 assert.equal(chosen.ok,true);
 assert.equal(chosen.providerEffects,'OFF');
 const c=planMainFolderChanges(b,b,[{...chosen.record,revision:2}]);
 assert.equal(c.ok,true);
 assert.deepEqual(c.held,[]);
});
test('R4 AC-09: rename is a held request, not a provider effect or new create',()=>{
 const p=planMainFolderChanges(a,b);
 const r=chooseFolderIdentity(p,{newSlug:'new-generator',choice:'RENAME_EXISTING',
   expectedTreeOid:H('a')});
 assert.equal(r.ok,true);assert.equal(r.record.state,'RENAME_EXISTING_REQUESTED');
 assert.equal(r.providerEffects,'OFF');
 assert.deepEqual(planMainFolderChanges(b,b,[r.record]).held,['new-generator']);
 assert.equal(chooseFolderIdentity(p,{newSlug:'new-generator',choice:'CREATE_SEPARATE',
   expectedTreeOid:H('f')}).code,'IDENTITY_SOURCE_CHANGED');
});
test('R4 AC-09: truncated, wrong repo, changed source and many-folder gaps cannot release identity hold',()=>{
 assert.equal(planMainFolderChanges(a,{...b,complete:false}).ok,false);
 assert.equal(planMainFolderChanges(a,{...b,repositoryId:'99'}).ok,false);
 const p=planMainFolderChanges(a,b);
 const updated=snapshot(H('3'),[g('new-generator',H('e')),g('unrelated',H('d'))]);
 const stale=planMainFolderChanges(b,updated,p.review);
 assert.deepEqual(stale.held,['new-generator']);
 assert.deepEqual(stale.stale,['new-generator']);
 const old=snapshot(H('1'),Array.from({length:1024},(_,i)=>g('old-'+i,H('a'))));
 const fresh=snapshot(H('2'),Array.from({length:1024},(_,i)=>g('new-'+i,H('b'))));
 const large=planMainFolderChanges(old,fresh);
 assert.equal(large.held.length,1024);
});
test('R4 identity port is trusted, revision-fenced, and has zero provider/Git effects',async()=>{
 const records=planMainFolderChanges(a,b).review;
 const state={[REVIEW_KEY]:records,pcmsS03CatalogLastComplete:b,
   pcmsS03Git:{repository:repo,repositoryId}};
 const updates=[];
 const api={runtime:{id:'combined-id',getURL:x=>'moz-extension://test/'+x},
   storage:{local:{
    get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).filter(k=>k in state).map(k=>[k,state[k]])),
    set:async update=>{updates.push(update);Object.assign(state,update)}
   }},
   alarms:{create:async()=>{}}};
 const sender={id:'combined-id',url:'moz-extension://test/pcms/index.html#work-queue'};
 const boundary=createFolderIdentityBoundary(api,{clock:()=>300});
 assert.equal(validateIdentityMessage(api,{...sender,id:'foreign'},{type:'LIST'}).code,'UNTRUSTED_SENDER');
 const before=await boundary.dispatch({type:'LIST'},sender);
 assert.equal(before.items[0].state,'REVIEW_REQUIRED');
 assert.equal((await boundary.dispatch({type:'CHOOSE',params:{
   newSlug:'new-generator',choice:'RENAME_EXISTING',expectedTreeOid:H('a'),expectedRevision:999}},sender)).code,'REVIEW_REVISION_CHANGED');
 assert.equal(updates.length,0);
 const approved=await boundary.dispatch({type:'CHOOSE',params:{
   newSlug:'new-generator',choice:'CREATE_SEPARATE',expectedTreeOid:H('a'),expectedRevision:1}},sender);
 assert.equal(approved.ok,true,JSON.stringify(approved));
 assert.equal(approved.providerEffects,'OFF');
 assert.equal(updates.length,1);
 assert.equal(state[REVIEW_KEY][0].state,'CREATE_SEPARATE_APPROVED');
 assert.equal((await boundary.dispatch({type:'CHOOSE',params:{
   newSlug:'new-generator',choice:'RENAME_EXISTING',expectedTreeOid:H('a'),expectedRevision:1}},sender)).code,'REVIEW_REVISION_CHANGED');
});
