import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';
import {createAccountStore,transitionAccount,publicAccount} from '../src/runtime/accounts.mjs';
import {createEnrollment} from '../src/runtime/enrollment.mjs';
import {createAccountBoundary} from '../src/runtime/account-boundary.mjs';
import {prepareRestoredCanonical} from '../src/ui/restore-sanitize.mjs';
import {serializeClone} from '../src/ui/backup-core.mjs';
globalThis.crypto??=webcrypto;
const fp='a'.repeat(64);
async function archivedAccount(accounts,{released=true}={}){
  await accounts.apply({type:'ENROLL',accountId:'acct_remove_01',personaUid:'persona-remove-01',expectedRevision:0});
  let a=(await accounts.get('acct_remove_01')).account;
  await accounts.apply({type:'ACK_LOGIN',accountId:a.accountId,expectedRevision:a.revision});
  a=(await accounts.get(a.accountId)).account;
  await accounts.apply({type:'VERIFY',accountId:a.accountId,expectedRevision:a.revision,
    proof:{source:'GUARDED_SESSION_READBACK',verified:true,personaUid:'persona-remove-01',
      principalFingerprint:fp,observationId:'identity_obs_01'}});
  a=(await accounts.get(a.accountId)).account;
  await accounts.apply({type:'ARCHIVE',accountId:a.accountId,expectedRevision:a.revision});
  if(released)await accounts.applyCurrent({type:'ROUTE_STATUS',accountId:a.accountId,status:'RELEASED'});
  return (await accounts.get(a.accountId)).account;
}
function flowFor(accounts,donorExtra={}){
  const removed=[];
  const donor={createBoundPersona:async()=>({ok:false}),
    removeAccountPersona:async({personaUid})=>{removed.push(personaUid);return {ok:true,removed:true};},...donorExtra};
  return {removed,flow:createEnrollment({accounts,ledger:{reserve:async()=>({ok:true})},donor,
    pins:{hold(){},release(){},reload(){}},openLogin:async()=>({ok:true}),identify:async()=>({ok:false}),
    now:()=>1234})};
}
test('C-60: removal is separate from Archive and needs explicit confirmation',()=>{
  const active={accountId:'acct_xremove_01',state:'VERIFIED',revision:3,personaUid:'persona-xxxx-01',bindingVersion:1};
  assert.equal(transitionAccount(active,{type:'REMOVE',accountId:'acct_xremove_01',expectedRevision:3,explicitRemoval:true}).code,'ARCHIVE_BEFORE_REMOVAL');
  const archived={...active,state:'ARCHIVED',route:{status:'RELEASED'}};
  assert.equal(transitionAccount(archived,{type:'REMOVE',accountId:'acct_xremove_01',expectedRevision:3}).code,'REMOVAL_NOT_CONFIRMED');
  const pending={...archived,route:{status:'RELEASE_DEFERRED'}};
  assert.equal(transitionAccount(pending,{type:'REMOVE',accountId:'acct_xremove_01',expectedRevision:3,explicitRemoval:true}).code,'ROUTE_RELEASE_PENDING');
  const done=transitionAccount(archived,{type:'REMOVE',accountId:'acct_xremove_01',expectedRevision:3,explicitRemoval:true,at:9});
  assert.equal(done.ok,true);
  assert.equal(transitionAccount(done.account,{type:'REACTIVATE',accountId:'acct_xremove_01',expectedRevision:4,explicitReactivation:true}).code,'ACCOUNT_REMOVED');
});
test('C-60/C-74: removal deletes identity and Persona, keeps binding and writes removal history',async()=>{
  const db=fakeDatabase(),accounts=createAccountStore(db);
  const before=await archivedAccount(accounts);
  const {flow,removed}=flowFor(accounts);
  const out=await flow.remove(before.accountId,before.revision,{deletePersona:true});
  assert.equal(out.ok,true);
  assert.deepEqual(removed,['persona-remove-01']);
  const after=(await accounts.get(before.accountId)).account;
  assert.equal(after.state,'ARCHIVED');assert.equal(after.personaUid,null);
  assert.equal(after.identity,null);assert.equal(after.boundPrincipal,null);
  assert.equal(after.removed.personaDeleted,true);
  assert.equal(JSON.stringify(after).includes(fp),false,'principal fingerprint deleted');
  const record=db.read('meta','removal:'+before.accountId);
  assert.equal(record.state,'REMOVED_ONLY_LOCALLY');assert.equal(record.revision,after.revision);
  assert.equal(publicAccount(after).removed.personaDeleted,true);
  // The same Perchance login can later be enrolled again as a new account.
  assert.equal(transitionAccount(null,{type:'ENROLL',accountId:'acct_new_01',personaUid:'persona-new-0001',expectedRevision:0},[after]).ok,true);
});
test('C-60: a Persona deletion failure removes nothing',async()=>{
  const db=fakeDatabase(),accounts=createAccountStore(db);
  const before=await archivedAccount(accounts);
  const {flow}=flowFor(accounts,{removeAccountPersona:async()=>({ok:false,code:'PERSONA_IN_USE'})});
  assert.equal((await flow.remove(before.accountId,before.revision,{deletePersona:true})).code,'PERSONA_IN_USE');
  const after=(await accounts.get(before.accountId)).account;
  assert.equal(after.removed,undefined);assert.equal(after.personaUid,'persona-remove-01');
});
test('C-75: completed removal requests a fresh backup and stays in force if backup is off',async()=>{
  const db=fakeDatabase(),accounts=createAccountStore(db);
  const before=await archivedAccount(accounts);
  const requests=[];
  const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p,onConnect:{addListener(){}}},
    storage:{local:{get:async()=>({}),set:async()=>{}}},alarms:{create(){},onAlarm:{addListener(){}}}};
  const {flow}=flowFor(accounts);
  const guard=()=>({enrollmentDonor:{createBoundPersona:async()=>({ok:false}),
    removeAccountPersona:async()=>({ok:true,removed:true})},openHumanLogin:async()=>({ok:true})});
  const boundary=createAccountBoundary(api,{open:async()=>db,guard,
    backupRequester:{requestFreshAfterRemoval:async()=>{requests.push(1);return {ok:false,code:'AUTO_BACKUP_NOT_ENABLED'};}}});
  void flow;
  const sender={id:'fixture',url:'moz-extension://fixture/pcms/index.html'};
  const out=await boundary.run({type:'REMOVE_ACCOUNT',params:{accountId:before.accountId,
    expectedRevision:before.revision,explicitRemoval:true,deletePersona:true}},sender);
  assert.equal(out.ok,true,JSON.stringify(out));assert.equal(out.state,'REMOVED');
  assert.equal(out.backup,'AUTO_BACKUP_NOT_ENABLED');assert.equal(requests.length,1);
  assert.ok((await accounts.get(before.accountId)).account.removed,'removal not undone');
});
test('C-74: inspected restore of an older archive excludes the removed account by default',async()=>{
  const db=fakeDatabase(),accounts=createAccountStore(db);
  const before=await archivedAccount(accounts);
  const row=(key,value)=>({key,value:serializeClone(value)});
  const empty=()=>({schema:1,stores:{entities:[],operations:[],events:[],meta:[],observations:[]}});
  const archive=empty();archive.stores.meta.push(row('account:'+before.accountId,{key:'account:'+before.accountId,account:before}));
  const {flow}=flowFor(accounts);
  await flow.remove(before.accountId,before.revision,{deletePersona:true});
  const current=empty();
  for(const key of db.keys('meta'))current.stores.meta.push(row(key,db.read('meta',key)));
  for(const mode of ['merge','replace']){
    const prepared=prepareRestoredCanonical({incoming:archive,current,mode});
    const restored=prepared.stores.meta.filter(r=>r.key==='account:'+before.accountId);
    assert.ok(restored.every(r=>!JSON.stringify(r.value).includes('persona-remove-01')),mode);
    assert.ok(prepared.stores.meta.some(r=>r.key==='removal:'+before.accountId),mode);
  }
});
