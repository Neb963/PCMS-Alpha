import test from 'node:test';
import assert from 'node:assert/strict';
import {freezeSupply,moveSupply,validateOwnerContext,publicSupply}
  from '../src/runtime/supply-plan.mjs';

const principal='a'.repeat(64);
const owner=(accountId,personaUid)=>({
  accountId,personaUid,state:'VERIFIED',revision:2,bindingVersion:1,
  identity:{source:'GUARDED_SESSION_READBACK',principalFingerprint:principal,bindingVersion:1}
});
const A=owner('account_matrix_001','persona-matrix-0001');
const B=owner('account_matrix_002','persona-matrix-0002');
function freezeFor(a,id,slugs){
  const planned=freezeSupply({batchId:id,accountId:a.accountId,personaUid:a.personaUid,
    accountRevision:2,bindingVersion:1,slugs});
  assert.equal(planned.ok,true);
  assert.equal(validateOwnerContext(planned.batch,a).ok,true);
  return planned.batch;
}
function next(row,stage,proof={}){
  if(['CREATE_DISPATCH_POSSIBLE','RENAME_DISPATCH_POSSIBLE'].includes(stage))row=next(row,stage.split('_')[0]+'_READY_TO_DISPATCH',{preflight:{version:2}});
  const outcome=moveSupply(row,stage,proof);
  assert.equal(outcome.ok,true,stage+':'+outcome.code);
  return outcome.item;
}
function runPositive(row,remote,git,{githubAvailable=true,loseCreate=false,loseRename=false}={}){
  const request=row.requestedSlug,temp='temp-'+row.index+'-'+row.accountId.slice(-3);
  row=next(row,'CREATE_PREPARED',{operationId:'create_'+row.itemId});
  row=next(row,'CREATE_DISPATCH_POSSIBLE');
  remote.push({itemId:row.itemId,kind:'CREATE',requestedSlug:request});
  if(loseCreate)return next(row,'CREATE_UNCERTAIN');
  row=next(row,'CREATE_OBSERVING');
  row=next(row,'CREATE_CONFIRMED',{source:'INDEPENDENT_READBACK',
    privateEmpty:true,ownerMatches:true,temporarySlug:temp,
    remoteId:'remote_'+row.itemId});
  row=next(row,'RENAME_PREPARED',{operationId:'rename_'+row.itemId});
  row=next(row,'RENAME_DISPATCH_POSSIBLE');
  remote.push({itemId:row.itemId,kind:'RENAME',requestedSlug:request});
  if(loseRename)return next(row,'RENAME_UNCERTAIN');
  row=next(row,'RENAME_OBSERVING');
  row=next(row,'PROVIDER_CONFIRMED',{source:'INDEPENDENT_READBACK',
    privateEmpty:true,ownerMatches:true,remoteId:'remote_'+row.itemId,
    previousSlug:temp,slug:request});
  if(!githubAvailable)return next(row,'SOURCE_PENDING');
  row=next(row,'GIT_PREPARED',{operationId:'gitmark_'+row.itemId});
  row=next(row,'GIT_DISPATCH_POSSIBLE');
  git.push({itemId:row.itemId,marker:'Status: SOURCE_PENDING',forced:false});
  row=next(row,'GIT_OBSERVING');
  return next(row,'SOURCE_CONFIRMED',{source:'GIT_READBACK',ready:false,
    emptyFolder:true,folder:'gens/'+request});
}
test('P56-06 F: 40 frozen per-item outcomes across two dedicated protected Personas',()=>{
  const safe=Array.from({length:10},(_,i)=>'matrix-safe-'+String(i).padStart(2,'0'));
  const conflict=[...safe.slice(0,5),...safe.slice(5).map(x=>x.toUpperCase())];
  const gitPending=Array.from({length:10},(_,i)=>'matrix-pending-'+String(i).padStart(2,'0'));
  const lost=Array.from({length:10},(_,i)=>'matrix-lost-'+String(i).padStart(2,'0'));
  const a=freezeFor(A,'matrix_alpha_0001',[...safe,...conflict]);
  const b=freezeFor(B,'matrix_beta_0002',[...gitPending,...lost]);
  assert.equal(a.items.length+b.items.length,40);
  assert.equal(a.items.slice(10).filter(x=>x.state==='REJECTED').length,10);
  assert.equal(validateOwnerContext(b,A).code,'ACCOUNT_STALE');
  assert.equal(validateOwnerContext(a,B).code,'ACCOUNT_STALE');
  const remote=[],git=[],rows=[];
  for(const row of a.items.slice(0,10))rows.push(runPositive(row,remote,git));
  rows.push(...a.items.slice(10));
  for(const row of b.items.slice(0,10))
    rows.push(runPositive(row,remote,git,{githubAvailable:false}));
  for(const [i,row] of b.items.slice(10).entries())
    rows.push(runPositive(row,remote,git,{loseCreate:i<5,loseRename:i>=5}));
  assert.deepEqual(rows.reduce((out,row)=>{
    out[row.state]=(out[row.state]||0)+1;return out;
  },{}),{
    CONFIRMED:10,REJECTED:10,SOURCE_PENDING:10,
    CREATE_UNCERTAIN:5,RENAME_UNCERTAIN:5
  });
  const actualCreate=remote.filter(x=>x.kind==='CREATE'),
    actualRename=remote.filter(x=>x.kind==='RENAME');
  assert.equal(actualCreate.length,30);assert.equal(actualRename.length,25);
  assert.equal(new Set(actualCreate.map(x=>x.itemId)).size,30);
  assert.equal(new Set(actualRename.map(x=>x.itemId)).size,25);
  assert.equal(git.length,10);
  assert.equal(git.every(x=>!x.forced&&x.marker==='Status: SOURCE_PENDING'),true);
  assert.equal(rows.filter(x=>x.state==='SOURCE_PENDING').every(x=>x.accountId===B.accountId),true);
  assert.equal(rows.filter(x=>x.state.endsWith('UNCERTAIN')).every(
    x=>moveSupply(x,'CREATE_DISPATCH_POSSIBLE').ok===false&&
      moveSupply(x,'RENAME_DISPATCH_POSSIBLE').ok===false),true);
  assert.equal(rows.slice(0,20).every(x=>x.accountId===A.accountId),true);
  assert.equal(rows.slice(20).every(x=>x.accountId===B.accountId),true);
  const publicReceipts=[
    ...publicSupply({...a,items:rows.slice(0,20)}).items,
    ...publicSupply({...b,items:rows.slice(20)}).items
  ];
  assert.equal(publicReceipts.length,40);
  assert.equal(publicReceipts.filter(x=>x.state==='CONFIRMED').length,10);
  assert.equal(publicReceipts.filter(x=>x.state!=='CONFIRMED').length,30,
    'Partial batch MUST NOT be represented as all-succeeded');
  assert.equal(publicReceipts.every(x=>!('remoteId' in x)&&!('personaUid' in x)),true);
});
