import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {perchanceSupplyIsolated} from '../src/runtime/perchance-supply.mjs';
globalThis.crypto??=webcrypto;

const user={loggedIn:true,email:'j02-write@example.invalid',sessionToken:'fixture-session-0123456789'};
const raw=JSON.stringify({user});
const fingerprint=Buffer.from(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(user.email))).toString('hex');
const slug='j02-claim-new-name';
const temp='j02-private-temp-001';
const publicId='fixture_temp_001';
const minimal={name:'minimal',isPrivate:false,publicId:'minimal_public_001',
  modelText:'template text',outputTemplate:'template html',srcManifest:{}};
const privateTemp={name:temp,isPrivate:true,publicId,
  modelText:'',outputTemplate:'',srcManifest:{}};
const reply=(value,status=200)=>({status,headers:{get:()=> 'application/json'},
  json:async()=>value});

async function fixture({kind,inventory=[],template=minimal,saveReply={status:'created',name:temp},
 renameReply={status:'success'},sessionChange=false}){
 const prior={location:globalThis.location,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
 const calls=[];let sessionRaw=raw;
 globalThis.location={origin:'https://perchance.org'};
 globalThis.localStorage={getItem:key=>key==='app-storage'?sessionRaw:'stable-session'};
 globalThis.fetch=async(url,options)=>{
  const endpoint=url.split('/').at(-1),body=JSON.parse(options.body);
  calls.push({endpoint,body});
  if(endpoint==='getGeneratorsByUser')return reply({status:'success',generators:inventory});
  if(endpoint==='getGeneratorPageData'){
   if(body.generatorName==='minimal')return reply(template?{status:'success',generator:template}:{status:'not-found'});
   if(body.generatorName===temp)return reply({status:'success',generator:privateTemp});
   return reply({status:'not-found'});
  }
  if(endpoint==='checkGeneratorOwnership')
   return reply({status:body.generatorName===temp?'is-owner':'is-not-owner'});
  if(endpoint==='save'){
   if(sessionChange)sessionRaw=JSON.stringify({...user,changed:true});
   return reply(saveReply);
  }
  if(endpoint==='changeGeneratorName')return reply(renameReply);
  throw Error('UNEXPECTED_ENDPOINT_'+endpoint);
 };
 try{
  const input={kind,slug,principalFingerprint:fingerprint};
  if(kind==='RENAME')Object.assign(input,{temporarySlug:temp,remoteId:'public_'+publicId});
  const result=await perchanceSupplyIsolated(input);
  return {result,calls};
 }finally{
  for(const [k,v] of Object.entries(prior))if(v===undefined)delete globalThis[k];else globalThis[k]=v;
 }
}

test('API CREATE saves one private empty copy without unclaimed-name ownership precheck',async()=>{
 const {result,calls}=await fixture({kind:'CREATE'});
 assert.equal(result.ok,true);assert.equal(result.ack,'CREATED');
 assert.equal(result.temporarySlug,temp);
 assert.deepEqual(calls.map(x=>x.endpoint),['getGeneratorsByUser','getGeneratorPageData','save']);
 const save=calls.find(x=>x.endpoint==='save').body;
 assert.equal(save.generator.name,'minimal');
 assert.equal(save.generator.isPrivate,true);
 assert.equal(save.generator.modelText,'');
 assert.equal(save.generator.outputTemplate,'');
 assert.deepEqual(save.srcManifest,[]);
 assert.ok(!calls.some(x=>x.endpoint==='checkGeneratorOwnership'));
});
test('API CREATE refuses an already-owned requested slug without saving',async()=>{
 const {result,calls}=await fixture({kind:'CREATE',inventory:[{name:slug,isPrivate:true}]});
 assert.equal(result.code,'SLUG_ALREADY_OWNED');
 assert.ok(!calls.some(x=>x.endpoint==='save'));
});
test('API CREATE never copies a minimal generator that is owned by the account',async()=>{
 const {result,calls}=await fixture({kind:'CREATE',inventory:[{name:'minimal',isPrivate:false}]});
 assert.equal(result.code,'TEMPLATE_OWNED_BY_TARGET');
 assert.ok(!calls.some(x=>x.endpoint==='save'));
});
test('API CREATE does not save without a valid minimal template',async()=>{
 const {result,calls}=await fixture({kind:'CREATE',template:null});
 assert.equal(result.code,'TEMPLATE_UNVERIFIED');
 assert.ok(!calls.some(x=>x.endpoint==='save'));
});
test('an unconfirmed CREATE response is uncertain after exactly one save',async()=>{
 const {result,calls}=await fixture({kind:'CREATE',saveReply:{status:'unknown'}});
 assert.equal(result.code,'CREATE_ACK_UNCERTAIN');
 assert.equal(calls.filter(x=>x.endpoint==='save').length,1);
});
test('a session change after SAVE does not report success or attempt a second write',async()=>{
 const {result,calls}=await fixture({kind:'CREATE',sessionChange:true});
 assert.equal(result.code,'SESSION_CHANGED_AFTER_EFFECT');
 assert.equal(calls.filter(x=>x.endpoint==='save').length,1);
});

test('API RENAME makes exactly one provider-arbitrated name claim after private source proof',async()=>{
 const {result,calls}=await fixture({kind:'RENAME',inventory:[{name:temp,isPrivate:true}]});
 assert.equal(result.ok,true);assert.equal(result.ack,'RENAMED');
 assert.equal(calls.filter(x=>x.endpoint==='changeGeneratorName').length,1);
 assert.equal(calls.filter(x=>x.endpoint==='getGeneratorPageData'&&x.body.generatorName===slug).length,0);
 assert.equal(calls.filter(x=>x.endpoint==='checkGeneratorOwnership'&&x.body.generatorName===slug).length,0);
 const nameChange=calls.find(x=>x.endpoint==='changeGeneratorName').body;
 assert.equal(nameChange.currentName,temp);
 assert.equal(nameChange.newName,slug);
});
test('a rejected rename is never claimed successful or automatically replayed',async()=>{
 const {result,calls}=await fixture({kind:'RENAME',inventory:[{name:temp,isPrivate:true}],
   renameReply:{status:'already-exists'}});
 assert.equal(result.ok,false);assert.equal(result.code,'RENAME_ACK_UNCERTAIN');
 assert.equal(calls.filter(x=>x.endpoint==='changeGeneratorName').length,1);
});
test('RENAME refuses a temporary generator missing from the account census',async()=>{
 const {result,calls}=await fixture({kind:'RENAME',inventory:[]});
 assert.equal(result.code,'TEMP_CENSUS_OWNER_CONFLICT');
 assert.equal(calls.filter(x=>x.endpoint==='changeGeneratorName').length,0);
});
