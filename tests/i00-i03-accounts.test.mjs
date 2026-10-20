import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { transitionAccount, publicAccount } from '../src/runtime/accounts.mjs';
import { validateAccountMessage, guardedIdentityRead } from '../src/runtime/account-boundary.mjs';
import { createPersonaGuard } from '../src/runtime/persona-guard.mjs';

const personaA='persona-aaaa-0001', personaB='persona-bbbb-0002';
const accountA='account_alpha_01', accountB='account_beta_02';
const enroll=(accountId,personaUid)=>({type:'ENROLL',accountId,personaUid,expectedRevision:0});
const action=(type,account,...rest)=>({type,accountId:account.accountId,
  expectedRevision:account.revision,...(rest[0]||{})});
const proof=(personaUid, fingerprint='f'.repeat(64))=>({
  source:'GUARDED_SESSION_READBACK',verified:true,personaUid,
  principalFingerprint:fingerprint,observationId:'observed_alpha_01'
});

test('S6-I03-BINDING-EXCLUSIVITY F: two accounts cannot share stable Persona UID',()=>{
  const a=transitionAccount(null,enroll(accountA,personaA),[]);
  assert.equal(a.ok,true);
  assert.equal(a.account.revision,1);
  assert.equal(a.account.identity,null);
  assert.equal(a.account.state,'WAITING_LOGIN');
  assert.equal(transitionAccount(null,enroll(accountB,personaA.toUpperCase()),[a.account]).code,'PERSONA_ALREADY_BOUND');
  assert.equal(transitionAccount(a.account,enroll(accountA,personaA),[a.account]).code,'ACCOUNT_ALREADY_EXISTS');
  assert.equal(transitionAccount(null,enroll(accountB,personaB),[a.account]).ok,true);
});

test('I03 F: manual confirmation never becomes provider identity proof',()=>{
  const enrolled=transitionAccount(null,enroll(accountA,personaA),[]).account;
  const login=transitionAccount(enrolled,action('ACK_LOGIN',enrolled),[]);
  assert.equal(login.account.state,'VERIFICATION_PENDING');
  assert.equal(login.account.identity,null);
  const manual=transitionAccount(login.account,action('MANUAL_OVERRIDE',login.account,{
    reason:'IDENTITY_UNOBSERVABLE',acknowledgeLimitedAuthority:true
  }),[]);
  assert.equal(manual.ok,true);
  assert.equal(manual.account.state,'OVERRIDDEN');
  assert.equal(manual.account.override.grantsProviderMutation,false);
  assert.equal(publicAccount(manual.account).providerWrites,'OFF');
  assert.equal(publicAccount(manual.account).identity,'UNVERIFIED');
  assert.equal(publicAccount(manual.account).override,'IDENTITY_UNOBSERVABLE');
  assert.equal(transitionAccount(login.account,action('MANUAL_OVERRIDE',login.account,{
    reason:'CHALLENGE',acknowledgeLimitedAuthority:false}),[]).code,'OVERRIDE_NOT_AUTHORIZED');
  assert.equal(transitionAccount(login.account,action('MANUAL_OVERRIDE',login.account,{
    reason:'provider text',acknowledgeLimitedAuthority:true}),[]).code,'OVERRIDE_NOT_AUTHORIZED');
});

test('I03 F: independently sourced identity proof must be exact, positive and target-bound',()=>{
  const a=transitionAccount(null,enroll(accountA,personaA),[]).account;
  const noProof=transitionAccount(a,action('VERIFY',a,{proof:{
    ...proof(personaA),source:'UI_DECLARATION'
  }}),[]);
  assert.equal(noProof.code,'INDEPENDENT_IDENTITY_PROOF_REQUIRED');
  assert.equal(transitionAccount(a,action('VERIFY',a,{proof:{
    ...proof(personaA),verified:false
  }}),[]).code,'INDEPENDENT_IDENTITY_PROOF_REQUIRED');
  assert.equal(transitionAccount(a,action('VERIFY',a,{proof:proof(personaB)}),[])
    .code,'INDEPENDENT_IDENTITY_PROOF_REQUIRED');
  const yes=transitionAccount(a,action('VERIFY',a,{proof:proof(personaA)}),[]);
  assert.equal(yes.ok,true);
  assert.equal(yes.account.state,'VERIFIED');
  assert.equal(publicAccount(yes.account).identity,'VERIFIED');
  assert.equal(JSON.stringify(publicAccount(yes.account)).includes('f'.repeat(64)),false,
    'never expose session principal fingerprint to dashboard');
  const b=transitionAccount(null,enroll(accountB,personaB),[yes.account]).account;
  assert.equal(transitionAccount(b,action('VERIFY',b,{proof:proof(personaB)}),[yes.account,b]).code,
    'IDENTITY_ALREADY_BOUND');
});

test('S6-I03-ARCHIVE-REPAIR F: stale revision, archive and reuse are explicit and non-destructive',()=>{
  const a=transitionAccount(null,enroll(accountA,personaA),[]).account;
  assert.equal(transitionAccount(a,{...action('ACK_LOGIN',a),expectedRevision:0},[]).code,'STALE_REVISION');
  assert.equal(transitionAccount(a,action('REBIND',a,{personaUid:personaB}),[]).code,'REBIND_NOT_AUTHORIZED');
  const verified=transitionAccount(a,action('VERIFY',a,{proof:proof(personaA)}),[]).account;
  const bound=transitionAccount(verified,action('REBIND',verified,{
    personaUid:personaB,explicitRepair:true
  }),[]);
  assert.equal(bound.ok,true);
  assert.equal(bound.account.state,'REBIND_PENDING');
  assert.equal(bound.account.identity,null);
  assert.equal(bound.account.bindingVersion,2);
  assert.equal(transitionAccount(bound.account,action('VERIFY',bound.account,{
    proof:proof(personaA)
  }),[]).code,'INDEPENDENT_IDENTITY_PROOF_REQUIRED');
  const archived=transitionAccount(bound.account,action('ARCHIVE',bound.account),[]);
  assert.equal(archived.ok,true);
  assert.equal(archived.account.state,'ARCHIVED');
  assert.equal(archived.account.history.length,2,'rebind and archive receipts persist');
  assert.equal(archived.account.history[1].priorPersonaUid,personaB);
  assert.equal(archived.account.history[1].priorIdentity,null);
  assert.equal(transitionAccount(archived.account,action('ACK_LOGIN',archived.account),[]).code,'ACCOUNT_ARCHIVED');
  assert.equal(transitionAccount(null,enroll(accountB,personaB),[archived.account]).ok,true,
    'archival releases exclusive active binding without deleting Persona');
  assert.equal(transitionAccount(archived.account,action('REACTIVATE',archived.account,{
    explicitReactivation:true
  }),[archived.account]).account.state,'WAITING_LOGIN');
  const other=transitionAccount(null,enroll(accountB,personaB),[archived.account]).account;
  assert.equal(transitionAccount(archived.account,action('REACTIVATE',archived.account,{
    explicitReactivation:true
  }),[archived.account,other]).code,'PERSONA_ALREADY_BOUND');
});

test('I03 F: reject replacement with occupied Persona and duplicate remote principal',()=>{
  const a=transitionAccount(null,enroll(accountA,personaA),[]).account;
  const b=transitionAccount(null,enroll(accountB,personaB),[a]).account;
  assert.equal(transitionAccount(a,action('REBIND',a,{
    personaUid:personaB,explicitRepair:true
  }),[a,b]).code,'PERSONA_ALREADY_BOUND');
  assert.equal(transitionAccount(a,action('REBIND',a,{
    personaUid:personaA,explicitRepair:true
  }),[a,b]).code,'REBIND_NOT_AUTHORIZED');
});

test('P51-03 I03 F: local command boundary denies forged sender, invalid target and proof injection',()=>{
  const api={runtime:{id:'persona-route-manager@local',
    getURL:p=>'moz-extension://synthetic/'+p}};
  const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')+'#accounts'};
  assert.equal(validateAccountMessage(api,sender,{type:'LIST_ACCOUNTS'}).ok,true);
  assert.equal(validateAccountMessage(api,{...sender,url:'https://perchance.org/'},{type:'ENROLL'}).code,'UNTRUSTED_SENDER');
  assert.equal(validateAccountMessage(api,sender,{type:'VERIFY',
    params:{accountId:accountA,proof:proof(personaA)}}).code,'COMMAND_NOT_ALLOWED');
  assert.equal(validateAccountMessage(api,sender,{type:'CHECK_IDENTITY',
    params:{accountId:accountA,expectedRevision:1,proof:proof(personaA)}}).code,'INVALID_PARAMS');
  // S01: manual Persona creation / binding of an arbitrary Persona is no
  // longer a port command; only Add Account can create a pinned binding.
  for(const type of ['CREATE_PERSONA','ENROLL','REBIND'])
    assert.equal(validateAccountMessage(api,sender,{type,params:{}}).code,'COMMAND_NOT_ALLOWED',type);
  assert.equal(validateAccountMessage(api,sender,{type:'ADD_ACCOUNT'}).ok,true);
  assert.equal(validateAccountMessage(api,sender,{type:'ADD_ACCOUNT',params:{personaUid:personaA}}).code,
    'INVALID_PARAMS','Add Account accepts no page-supplied Persona or route');
  assert.equal(validateAccountMessage(api,sender,{type:'CHANGE_ROUTE',
    params:{accountId:accountA,expectedRevision:2,routeId:'mullvad-1'}}).code,'INVALID_PARAMS');
  assert.equal(validateAccountMessage(api,sender,{type:'LIST_ACCOUNTS',
    padding:'x'.repeat(1801)}).code,'COMMAND_NOT_ALLOWED');
});

test('S6-I03-BINDING-EXCLUSIVITY F: guard rejects Direct, revoked lease and unverified route',async()=>{
  let routeId='direct', routeOK=true, leaseOK=true;
  const securityState={ready:true,privacySafe:true,proxyControl:'controllable'};
  const guard=createPersonaGuard({
    initialize:async()=>{},
    securityState,
    shared:{
      resolve:async uid=>({personaUid:uid,cookieStoreId:'firefox-container-1',
        routeId,route:{enabled:true},pcmsBindingId:'binding_fixture_01'}),
      acquire:async()=>({leaseId:'lease-fixture',expiresAt:1000}),
      validate:async()=>{if(!leaseOK)throw Error('revoked');
        return {cookieStoreId:'firefox-container-1'};},
      release:async()=>{}
    },
    getRouteTest:async()=>({ok:routeOK}),
    listPersonas:async()=>[{personaUid:personaA,name:'A',archived:false,routeProtected:true}],
    listProtectedRoutes:async()=>[{routeId:'route-safe',name:'Protected'}],
    createPersona:async()=>({ok:true}),
    openHumanLogin:async()=>({ok:true}),
    pinGate:p=>({allow:p.routeId==='route-safe'&&p.pcmsBindingId==='binding_fixture_01'})
  });
  assert.equal((await guard.openHumanLogin(personaA)).code,'DIRECT_FORBIDDEN');
  routeId='route-safe'; routeOK=false;
  assert.equal((await guard.openHumanLogin(personaA)).code,'PROTECTED_ROUTE_UNVERIFIED');
  routeOK=true;
  assert.equal((await guard.openHumanLogin(personaA)).kind,'HUMAN_LOGIN_ONLY');
  leaseOK=false;
  assert.equal((await guard.acquireConflictGuard(personaA)).code,'DONOR_LEASE_BUSY_OR_REVOKED');
  assert.equal((await guard.createProtectedPersona('Good','direct')).code,'PROTECTED_ROUTE_UNAVAILABLE');
  assert.equal((await guard.createProtectedPersona('Good','route-safe')).created,true);
});


test('S6-I03-BINDING-EXCLUSIVITY F: guarded identity observer is re-fenced after async route/container rotation',async()=>{
  let routeId='route-alpha', cookieStoreId='firefox-container-1', called=0;
  const guard={async getSafeRouteReadiness(uid){
    return {ready:true,code:'GUARD_READY',personaUid:uid,routeId,cookieStoreId};
  }};
  const reader=async before=>{
    called++;
    assert.equal(before.personaUid,personaA);
    routeId='route-beta';
    return proof(personaA);
  };
  const changed=await guardedIdentityRead(guard,personaA,reader);
  assert.equal(changed.code,'SESSION_CONTEXT_CHANGED');
  assert.equal(called,1,'one bounded readback never retries under changed route');
  routeId='route-alpha';
  const matched=await guardedIdentityRead(guard,personaA,async()=>proof(personaA));
  assert.equal(matched.ok,true);
  cookieStoreId='firefox-container-2';
  const rotated=await guardedIdentityRead(guard,personaA,async()=>{
    cookieStoreId='firefox-container-3';
    return proof(personaA);
  });
  assert.equal(rotated.code,'SESSION_CONTEXT_CHANGED');
  assert.equal((await guardedIdentityRead(guard,personaA,async()=>null)).code,
    'SESSION_IDENTITY_UNOBSERVABLE');
  assert.equal((await guardedIdentityRead(guard,personaA,async()=>({
    ...proof(personaA),source:'UI_DECLARATION'
  }))).code,'INDEPENDENT_IDENTITY_PROOF_REQUIRED');
  const down={getSafeRouteReadiness:async()=>({ready:false,code:'DIRECT_FORBIDDEN'})};
  assert.equal((await guardedIdentityRead(down,personaA,async()=>proof(personaA))).code,
    'DIRECT_FORBIDDEN');
});

test('I03 F: packaged entry includes accounted new modules but donor remains immutable',async()=>{
  const [entry,overlay,boundary,html]=await Promise.all([
    '../src/runtime/entry.mjs','../src/runtime/overlay.mjs',
    '../src/runtime/account-boundary.mjs','../src/ui/index.html'
  ].map(p=>readFile(new URL(p,import.meta.url),'utf8')));
  assert.ok(entry.indexOf('wake.mjs')<entry.indexOf('account-boundary.mjs'));
  assert.match(overlay,/accounts.mjs/);assert.match(overlay,/account-boundary.mjs/);
  assert.doesNotMatch(boundary,/sendNativeMessage|fetch\s*\(|XMLHttpRequest/);
  for(const id of ['pcms-add-account','pcms-accounts-list'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(html,/Operator dashboard · protected workflows/);
});

test('S01 F: every guarded PCMS effect requires a committed route pin; untagged Personas are never operable',async()=>{
  let tag='binding_fixture_01',pinned=false;
  const guard=createPersonaGuard({initialize:async()=>{},
    securityState:{ready:true,privacySafe:true,proxyControl:'controllable'},
    shared:{resolve:async uid=>({personaUid:uid,cookieStoreId:'firefox-container-1',
      routeId:'route-safe',route:{enabled:true},pcmsBindingId:tag}),
      acquire:async()=>({leaseId:'lease-fixture'}),validate:async()=>({cookieStoreId:'firefox-container-1'}),
      release:async()=>{}},
    getRouteTest:async()=>({ok:true}),pinGate:()=>({allow:pinned}),
    openHumanLogin:async()=>({ok:true})});
  assert.equal((await guard.getSafeRouteReadiness(personaA)).code,'PROTECTED_ROUTE_NOT_PINNED');
  assert.equal((await guard.openHumanLogin(personaA)).code,'PROTECTED_ROUTE_NOT_PINNED');
  tag=null;pinned=true;
  assert.equal((await guard.getSafeRouteReadiness(personaA)).code,'ROUTE_RESERVATION_REQUIRED');
  tag='binding_fixture_01';
  assert.equal((await guard.getSafeRouteReadiness(personaA)).ready,true);
});
