import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {perchanceSupplyIsolated} from '../src/runtime/perchance-supply.mjs';
test('Issue60: real reader accepts empty foreign-compartment JSON, while owner/private-empty source guards remain mandatory',async()=>{
 const email='fixture0@pcms.invalid',user={loggedIn:true,email,sessionToken:'offline-session-not-live'};
 const original=Object.fromEntries(['location','localStorage','fetch'].map(k=>[k,globalThis[k]]));
 const raw=JSON.stringify({user});let manifest=vm.runInNewContext('({})'),owner='is-owner',source='';const calls=[];
 globalThis.location={origin:'https://perchance.org'};globalThis.localStorage={getItem:k=>k==='app-storage'?raw:'unchanged'};
 globalThis.fetch=async url=>{calls.push(url);return {status:200,headers:new Map([['content-type','application/json']]),json:async()=>
  url.endsWith('getGeneratorsByUser')?{status:'success',generators:[{name:'temporary-fixture',isPrivate:true}]}:
  url.endsWith('checkGeneratorOwnership')?{status:owner}:{status:'success',generator:{name:'temporary-fixture',isPrivate:true,publicId:'fixture_0001',modelText:source,outputTemplate:'',srcManifest:manifest}}};};
 const principalFingerprint=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(email))).toString('hex');
 const request={kind:'READ_CREATE',slug:'requested-fixture',temporarySlug:'temporary-fixture',principalFingerprint};
 try{
  assert.equal((await perchanceSupplyIsolated(request)).ok,true);
  for(const invalid of [vm.runInNewContext('({asset:1})'),new (class Manifest{})(),new Date(),null]){
   manifest=invalid;assert.equal((await perchanceSupplyIsolated(request)).code,'PRIVATE_EMPTY_OWNER_UNVERIFIED');
  }
  manifest={};owner='is-not-owner';assert.equal((await perchanceSupplyIsolated(request)).ok,false);
  owner='is-owner';source='preserved original';assert.equal((await perchanceSupplyIsolated(request)).ok,false);
  assert.equal(calls.some(x=>/\/save$|changeGeneratorName/.test(x)),false);
 }finally{for(const [k,v] of Object.entries(original)){if(v===undefined)delete globalThis[k];else globalThis[k]=v;}}
});
