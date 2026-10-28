import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {perchanceSupplyIsolated} from '../src/runtime/perchance-supply.mjs';
globalThis.crypto??=webcrypto;
const user={loggedIn:true,email:'j02-fixture@example.invalid',sessionToken:'test-token-at-least-8'};
const raw=JSON.stringify({user});
const key='brand-new-disposable';
const owned='owned-fixture-control';
const control={name:owned,isPrivate:true,publicId:'fixture_control_42',modelText:'',outputTemplate:'',srcManifest:{}};
const existing={name:key,isPrivate:true,publicId:'fixture_target_001',modelText:'',outputTemplate:'',srcManifest:{}};
const fp=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.email))).toString('hex');
const request={kind:'READ_TARGET',slug:key,principalFingerprint:fp};
const missing={status:'generator-does-not-exist'};
const body=(obj,status=200,type='application/json')=>({status,headers:{get:()=>type},json:async()=>obj});
async function run({inventory=[{name:owned,isPrivate:true}],owner='is-not-owner',
 page=missing,controlPage={status:'success',generator:control},
 controlOwner='is-owner',changeSession=false,firstFailure=null,rateLimitedEndpoint=null,
 wrongPrincipal=false}={}){
 const prior={location:globalThis.location,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
 let sessionRaw=raw,calls=[],failed=false;
 globalThis.location={origin:'https://perchance.org'};
 globalThis.localStorage={getItem:k=>k==='app-storage'?sessionRaw:'constant-version'};
 globalThis.fetch=async(url,params)=>{
  const endpoint=url.split('/').at(-1),args=JSON.parse(params.body);
  calls.push({endpoint,name:args.generatorName||null,method:params.method});
  if(['save','changeGeneratorName'].includes(endpoint))throw Error('MUTATION_FORBIDDEN');
  if(firstFailure&&!failed&&endpoint===firstFailure){failed=true;return body({status:'unknown'},503);}
  if(rateLimitedEndpoint===endpoint)return body({},429);
  if(changeSession&&endpoint==='getGeneratorPageData'&&args.generatorName===key)sessionRaw=JSON.stringify({...JSON.parse(raw),changed:true});
  if(endpoint==='getGeneratorsByUser')return body({status:'success',generators:inventory,generatorFolderMap:{}});
  if(endpoint==='checkGeneratorOwnership')return body({status:args.generatorName===key?owner:controlOwner});
  if(endpoint==='getGeneratorPageData'){
   const response=args.generatorName===key?page:controlPage;
   return response?.status===404?body({status:'no-body'},404):body(response,200);
  }
  throw Error('UNEXPECTED_ENDPOINT');
 };
 try{
  const out=await perchanceSupplyIsolated({...request,
   principalFingerprint:wrongPrincipal?'f'.repeat(64):fp});
  return {out,calls};
 }finally{
  for(const [k,v] of Object.entries(prior))if(v===undefined)delete globalThis[k];else globalThis[k]=v;
 }
}
test('new names become claim candidates without an ownership API reply',async()=>{
 for(const page of [{status:'generator-does-not-exist'},{status:'not-found'},{status:404}]){
  const {out,calls}=await run({page,owner:'unknown'});
  assert.equal(out.ok,true,JSON.stringify(out));
  assert.equal(out.state,'CLAIM_CANDIDATE');
  assert.equal(out.source,'INDEPENDENT_TARGET_READBACK');
  assert.equal(calls.filter(x=>x.endpoint==='checkGeneratorOwnership').length,0);
  assert.equal(calls.some(x=>['save','changeGeneratorName'].includes(x.endpoint)),false);
 }
});
test('HTTP 404 does not demand a control request or nonownership answer',async()=>{
 const {out,calls}=await run({page:{status:404},controlPage:{status:'unverified'},owner:'unverified'});
 assert.equal(out.state,'CLAIM_CANDIDATE');
 assert.equal(calls.some(x=>x.name===owned),false);
});
test('a failed optional page read does not block an otherwise qualified claim candidate',async()=>{
 const {out,calls}=await run({firstFailure:'getGeneratorPageData',owner:'unknown'});
 assert.equal(out.state,'CLAIM_CANDIDATE');
 assert.equal(calls.filter(x=>x.endpoint==='getGeneratorPageData'&&x.name===key).length,1);
 assert.equal(calls.some(x=>x.endpoint==='checkGeneratorOwnership'),false);
});
test('an observed foreign generator cannot be mistaken for a free name',async()=>{
 for(const owner of ['is-not-owner','unknown']){
  const {out,calls}=await run({page:{status:'success',generator:existing},owner});
  assert.equal(out.ok,true);assert.equal(out.state,'COLLISION');
  assert.equal(calls.filter(x=>x.endpoint==='checkGeneratorOwnership').length,1);
  assert.equal(calls.some(x=>['save','changeGeneratorName'].includes(x.endpoint)),false);
 }
});
for(const [title,options,code] of [
 ['existing page with wrong slug',{page:{status:'success',generator:{...existing,name:'wrong'}}},'TARGET_PAGE_IDENTITY_UNVERIFIED'],
 ['existing page without remote ID',{page:{status:'success',generator:{name:key,isPrivate:true}}},'TARGET_PAGE_IDENTITY_UNVERIFIED'],
 ['account owns target but owner API denies',{inventory:[{name:key,isPrivate:true}],page:{status:'success',generator:existing}},'TARGET_CENSUS_OWNER_CONFLICT'],
 ['account owns target but owner API is unknown',{inventory:[{name:key,isPrivate:true}],owner:'unknown',page:{status:'success',generator:existing}},'TARGET_CENSUS_OWNER_CONFLICT'],
 ['owner API claims target but owned census excludes it',{owner:'is-owner',page:{status:'success',generator:existing}},'TARGET_CENSUS_OWNER_CONFLICT'],
 ['account-owned target without usable page',{inventory:[{name:key,isPrivate:true}],owner:'is-owner',page:{status:'error'}},'TARGET_OWNED_PAGE_UNVERIFIED'],
 ['account-owned target with malformed ID',{inventory:[{name:key,isPrivate:true}],owner:'is-owner',page:{status:'success',generator:{name:key,isPrivate:true}}},'TARGET_OWNED_PAGE_UNVERIFIED'],
 ['owner session is rejected for an owned target',{inventory:[{name:key,isPrivate:true}],owner:'session-token-error',page:{status:'success',generator:existing}},'SESSION_REJECTED'],
 ['owner API rate-limited for an owned target',{inventory:[{name:key,isPrivate:true}],owner:'too-many-requests',page:{status:'success',generator:existing}},'PROVIDER_RATE_LIMITED'],
 ['session changes while reading',{changeSession:true},'SESSION_CHANGED'],
 ['principal mismatch',{wrongPrincipal:true},'PRINCIPAL_CHANGED'],
 ['provider reports a page error',{page:{status:'server-error'}},'PROVIDER_UNAVAILABLE'],
 ['authenticated census rate limit',{rateLimitedEndpoint:'getGeneratorsByUser'},'PROVIDER_RATE_LIMITED'],
 ['public page rate limit',{rateLimitedEndpoint:'getGeneratorPageData'},'PROVIDER_RATE_LIMITED'],
 ['bad census schema',{inventory:[{name:owned,isPrivate:'yes'}]},'INVENTORY_SCHEMA_UNVERIFIED']
]){
 test('qualified claim read fails closed: '+title,async()=>{
  const {out,calls}=await run(options);
  assert.equal(out.ok,false,title+' '+JSON.stringify(out));
  assert.equal(out.code,code,title);
  assert.equal(calls.some(x=>['save','changeGeneratorName'].includes(x.endpoint)),false);
 });
}
test('a confirmed existing owned target is adopted, never newly created',async()=>{
 const {out,calls}=await run({inventory:[{name:key,isPrivate:true}],owner:'is-owner',
  page:{status:'success',generator:existing}});
 assert.equal(out.ok,true);assert.equal(out.state,'OWNED_VERIFIED');
 assert.equal(out.remoteId,'public_fixture_target_001');
 assert.equal(out.visibility,'UNLISTED');
 assert.equal(calls.some(x=>x.endpoint==='save'),false);
});
test('a forged HTTP200 internal 404 marker is not treated as an actual HTTP404',async()=>{
 const {out}=await run({page:{status:'pcms-observed-http-404'}});
 // An optional failure creates no claim proof. The server rename decides it.
 assert.equal(out.state,'CLAIM_CANDIDATE');
});
