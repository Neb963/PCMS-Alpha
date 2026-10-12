// F independent fake-provider ledger for the exact isolated observer body.
// This exercises real request serialization, session continuity and minimal
// return projection, not a mock 'verified' account or actual live provider.
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {webcrypto} from 'node:crypto';
import {perchanceReadIsolated} from '../src/runtime/perchance-observer.mjs';
import {createPersonaGuard} from '../src/runtime/persona-guard.mjs';

function fixture({names=['owned-one','shared-two'],onRequest,login=true}={}) {
  let revision='1', fetchCount=0;
  let page=JSON.stringify({user:{loggedIn:login,email:'Owner@Example.test',sessionToken:'private-token-0001'}});
  const ledger=[];
  const localStorage={
    getItem:key=>key==='app-storage'?page:key==='sessionTokenLastChangeTime'?revision:null
  };
  const fetch=async (url,req)=>{
    assert.equal(url.startsWith('https://perchance.org/api/'),true);
    assert.equal(req.method,'POST');
    assert.equal(req.redirect,'error');
    assert.equal(req.cache,'no-store');
    const path=url.split('/').at(-1),body=JSON.parse(req.body);
    assert.deepEqual(Object.keys(body).sort(),path==='getGeneratorsByUser'
      ?['email','sessionToken']:['email','generatorName','sessionToken']);
    assert.equal(body.sessionToken,'private-token-0001');
    ledger.push({path,slug:body.generatorName||''});
    fetchCount++;
    const raw=onRequest?.({path,body,count:fetchCount,changeSession:()=>{
      revision='2';
    }})||null;
    const status=raw?.httpStatus||200;
    const json=raw?.body ||(path==='getGeneratorsByUser'
      ?{status:'success',generatorFolderMap:{},
        generators:names.map(name=>({name,isPrivate:true}))}
      :{status:body.generatorName==='shared-two'?'is-not-owner':'is-owner'});
    return {status,headers:{get:()=>raw?.contentType||'application/json'},
      json:async()=>json};
  };
  const context=vm.createContext({localStorage,fetch,location:{origin:'https://perchance.org'},
    crypto:webcrypto,TextEncoder,AbortController,setTimeout,clearTimeout});
  return {ledger,run:async(identityOnly=false)=>vm.runInContext(
    '('+perchanceReadIsolated.toString()+')('+JSON.stringify({identityOnly})+')',context),
    unsetSession:()=>{page=JSON.stringify({user:{loggedIn:false}});}};
}
test('P52-01 F: isolated reader obtains real modeled session then per-target owner statuses',async()=>{
  const {run,ledger}=fixture();
  const out=await run();
  assert.equal(out.ok,true);
  assert.equal(out.ownerReplies.length,2);
  assert.deepEqual(out.ownerReplies.map(x=>x[1].body.status),['is-owner','is-not-owner']);
  assert.deepEqual(ledger.map(x=>x.path),[
    'getGeneratorsByUser','checkGeneratorOwnership','checkGeneratorOwnership']);
  assert.equal(out.principalFingerprint.length,64);
  assert.doesNotMatch(JSON.stringify(out),/private-token-0001|Owner@Example|editKey/);
  const identity=await run(true);
  assert.equal(identity.ok,true);
  assert.equal(identity.ownerReplies.length,0);
});
test('P52-01 F: revoked token, login switch, challenge, unknown ownership fail closed',async()=>{
  const cases=[
    ()=>fixture({onRequest:()=>({body:{status:'session-token-error'}})}),
    ()=>fixture({onRequest:({changeSession})=>{changeSession();return null;}}),
    ()=>fixture({onRequest:()=>({httpStatus:403,body:{status:'unknown'}})}),
    ()=>fixture({onRequest:({path})=>path==='checkGeneratorOwnership'?
      {body:{status:'unexpected'}}:null}),
    ()=>fixture({onRequest:({path})=>path==='getGeneratorsByUser'?
      {body:{status:'success',generatorFolderMap:{},generators:[{name:'bad?',isPrivate:true}]}}:null}),
    ()=>fixture({names:['duplicate','duplicate']})
  ];
  for(const item of cases) {
    const r=await item().run();
    assert.equal(r.ok,false,JSON.stringify(r));
  }
});
test('P52-01 F: missing page token and malformed account context yield no requests',async()=>{
  const c=fixture({login:false});
  assert.equal((await c.run()).code,'NO_PAGE_SESSION');
  assert.equal(c.ledger.length,0);
});
test('I04 F: guard lease, route change, and observer rejection are scoped',async()=>{
  let routeId='protected-1', revoked=false, call=0,release=0;
  const shared={
    resolve:async()=>({personaUid:'persona-1234',cookieStoreId:'firefox-container-1',
      routeId,route:{enabled:true}}),
    acquire:async()=>({leaseId:'lease-1',expiresAt:'soon'}),
    validate:async()=>{if(revoked)throw Error('revoked');return {cookieStoreId:'firefox-container-1'};},
    release:async()=>{release++;}
  };
  const g=createPersonaGuard({initialize:async()=>{},securityState:{
    ready:true,privacySafe:true,proxyControl:'ok'
  },shared,getRouteTest:async()=>({ok:true}),
  readIsolatedTab:async()=>{call++;return {ok:true,principalFingerprint:'a'.repeat(64)};}});
  const ok=await g.observeReadOnly('persona-1234',true);
  assert.equal(ok.ok,true);assert.equal(call,1);
  routeId='direct';
  assert.equal((await g.observeReadOnly('persona-1234')).ok,false);
  assert.equal(call,1);
  routeId='protected-1';revoked=true;
  assert.equal((await g.observeReadOnly('persona-1234')).ok,false);
  assert.equal(call,1);
  assert.ok(release>=1);
});
