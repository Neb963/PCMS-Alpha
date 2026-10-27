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
 controlOwner='is-owner',changeSession=false,firstFailure=null,
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
test('known explicit JSON missing response + independent nonowner + absent complete census establishes absence without mutations',async()=>{
 for(const status of ['generator-does-not-exist','not-found']){
  const {out,calls}=await run({page:{status}});
  assert.equal(out.ok,true,status);assert.equal(out.state,'MISSING_VERIFIED');
  assert.equal(out.source,'INDEPENDENT_TARGET_READBACK');
  assert.equal(calls.some(x=>['save','changeGeneratorName'].includes(x.endpoint)),false);
 }
});
test('HTTP 404 needs corroborating owner + complete census + healthy same-endpoint owned control',async()=>{
 const {out,calls}=await run({page:{status:404}});
 assert.equal(out.state,'MISSING_VERIFIED',JSON.stringify(out));
 assert.ok(calls.some(x=>x.endpoint==='getGeneratorPageData'&&x.name===owned));
 assert.ok(calls.some(x=>x.endpoint==='checkGeneratorOwnership'&&x.name===owned));
});
test('verified empty-account HTTP 404 uses known minimal read-only endpoint control, never fakes a count',async()=>{
 const {out,calls}=await run({inventory:[],page:{status:404},
  controlPage:{status:'success',generator:{name:'minimal',publicId:'minimal_control_01'}}});
 assert.equal(out.state,'MISSING_VERIFIED',JSON.stringify(out));
 assert.ok(calls.some(x=>x.name==='minimal'));
 assert.equal(calls.some(x=>x.endpoint==='checkGeneratorOwnership'&&x.name==='minimal'),false);
});
for(const [title,options,code] of [
 ['HTTP 404 with no positive control',{page:{status:404},controlPage:{status:'unverified'}},'TARGET_HTTP404_CONTROL_UNVERIFIED'],
 ['HTTP 404 control points to wrong generator',{page:{status:404},controlPage:{status:'success',generator:{...control,name:'wrong'}}},'TARGET_HTTP404_CONTROL_UNVERIFIED'],
 ['HTTP 404 control ownership unverified',{page:{status:404},controlOwner:'unknown'},'TARGET_HTTP404_CONTROL_UNVERIFIED'],
 ['wrong-page success is not a collision',{page:{status:'success',generator:{...existing,name:'wrong'}}},'TARGET_PAGE_IDENTITY_UNVERIFIED'],
 ['missing immutable publicId is not a collision',{page:{status:'success',generator:{name:key,isPrivate:true}}},'TARGET_PAGE_IDENTITY_UNVERIFIED'],
 ['unknown missing status is not absence',{page:{status:'error'}},'TARGET_PAGE_ABSENCE_UNVERIFIED'],
 ['ownership API unknown cannot establish absence',{owner:'unknown'},'TARGET_OWNER_READBACK_UNVERIFIED'],
 ['owner says yes but census excludes slug',{owner:'is-owner',page:{status:'success',generator:existing}},'TARGET_CENSUS_OWNER_CONFLICT'],
 ['owner says no but census includes slug',{inventory:[{name:key,isPrivate:true}]},'TARGET_CENSUS_OWNER_CONFLICT'],
 ['owner says yes but page unavailable',{inventory:[{name:key,isPrivate:true}],owner:'is-owner',page:{status:'error'}},'TARGET_OWNED_PAGE_UNVERIFIED'],
 ['session changed during read',{changeSession:true},'SESSION_CHANGED'],
 ['principal mismatch',{wrongPrincipal:true},'PRINCIPAL_CHANGED'],
 ['HTTP 200 fake internal HTTP404 status cannot spoof absence',{page:{status:'pcms-observed-http-404'}},'TARGET_PAGE_TRANSPORT_UNAVAILABLE'],
 ['rejected owner session cannot be mistaken for available slug',{owner:'session-token-error'},'SESSION_REJECTED'],
 ['owner rate limit cannot be mistaken for available slug',{owner:'too-many-requests'},'PROVIDER_RATE_LIMITED'],
 ['page rate limit cannot be mistaken for available slug',{page:{status:'too-many-requests'}},'PROVIDER_RATE_LIMITED'],
 ['page backend error cannot be mistaken for available slug',{page:{status:'server-error'}},'PROVIDER_UNAVAILABLE'],
 ['page transport failure twice cannot prove absence',{page:{status:'unverified'}},'TARGET_PAGE_TRANSPORT_UNAVAILABLE']
]){
 test('fails closed: '+title,async()=>{
  const {out,calls}=await run(options);
  assert.equal(out.ok,false,title);assert.equal(out.code,code,title);
  assert.equal(calls.some(x=>['save','changeGeneratorName'].includes(x.endpoint)),false);
 });
}
test('verified owned existing target is adopted, never CREATEd',async()=>{
 const {out,calls}=await run({inventory:[{name:key,isPrivate:true}],owner:'is-owner',
  page:{status:'success',generator:existing}});
 assert.equal(out.ok,true);assert.equal(out.state,'OWNED_VERIFIED');
 assert.equal(out.remoteId,'public_fixture_target_001');
 assert.equal(out.visibility,'UNLISTED');
 assert.equal(calls.some(x=>x.endpoint==='save'),false);
});
test('verified foreign existing target is a collision only on exact identity',async()=>{
 const {out,calls}=await run({page:{status:'success',generator:existing}});
 assert.equal(out.ok,true);assert.equal(out.state,'COLLISION');
 assert.equal(calls.some(x=>x.endpoint==='save'),false);
});
test('one transient read-only failed lookup can recover; it never repeats effects',async()=>{
 const {out,calls}=await run({firstFailure:'getGeneratorPageData'});
 assert.equal(out.state,'MISSING_VERIFIED',JSON.stringify(out));
 assert.equal(calls.filter(x=>x.endpoint==='checkGeneratorOwnership'&&x.name===key).length,2);
 assert.equal(calls.filter(x=>x.endpoint==='save').length,0);
});
test('bad inventory shape is not absence or an excuse to mutate',async()=>{
 const {out,calls}=await run({inventory:[{name:owned,isPrivate:'yes'}]});
 assert.equal(out.code,'INVENTORY_SCHEMA_UNVERIFIED');
 assert.equal(calls.some(x=>['save','changeGeneratorName'].includes(x.endpoint)),false);
});
