import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {perchanceSupplyIsolated} from '../src/runtime/perchance-supply.mjs';
globalThis.crypto??=webcrypto;
const user={loggedIn:true,email:'rename-fixture@example.invalid',sessionToken:'offline-fixture-session'};
const fp=Buffer.from(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user.email))).toString('hex');
const old='rename-fixture-before',target='rename-fixture-after',id='remote_original_source_001';
const original={name:old,isPrivate:true,publicId:id,modelText:'human original source',
 outputTemplate:'original html',srcManifest:{'binary.dat':'stable-asset-reference'}};
const req={kind:'RENAME_EXISTING',slug:target,temporarySlug:old,
 remoteId:'public_'+id,principalFingerprint:fp};
async function run({foreign=false,wrongId=false,ownerUnknown=false,ackLost=false}={}){
 const prior={location:globalThis.location,localStorage:globalThis.localStorage,fetch:globalThis.fetch};
 const resources=new Map([[old,structuredClone(original)]]),effects=[];
 const foreignResource={...original,name:target,publicId:'other_private_foreign_001'};
 const reply=(value,status=200)=>({status,headers:{get:()=> 'application/json'},json:async()=>value});
 globalThis.location={origin:'https://perchance.org'};
 globalThis.localStorage={getItem:k=>k==='app-storage'?JSON.stringify({user}):'1'};
 globalThis.fetch=async(url,options)=>{
  const endpoint=url.split('/').at(-1),params=JSON.parse(options.body),name=params.generatorName;
  if(endpoint==='getGeneratorsByUser')return reply({status:'success',
   generators:[...resources.values()].map(g=>({name:g.name,isPrivate:g.isPrivate})),generatorFolderMap:{}});
  if(endpoint==='checkGeneratorOwnership')return reply({status:
   name===target&&ownerUnknown?'unknown':resources.has(name)?'is-owner':'is-not-owner'});
  if(endpoint==='getGeneratorPageData'){
   const g=resources.get(name)||(foreign&&name===target?foreignResource:null);
   return g?reply({status:'success',generator:g}):reply({},404);
  }
  if(endpoint==='changeGeneratorName'){
   assert.equal(params.currentName,old);assert.equal(params.newName,target);
   assert.equal(resources.has(old),true);assert.equal(resources.has(target),false);
   resources.set(target,{...resources.get(old),name:target});resources.delete(old);
   effects.push('RENAME');
   return reply({status:ackLost?'unverified':'success'});
  }
  throw Error('UNEXPECTED_ENDPOINT:'+endpoint);
 };
 try{
  const outcome=await perchanceSupplyIsolated({...req,remoteId:wrongId?'public_wrong_remote_id':req.remoteId});
  const reconciled=effects.length?await perchanceSupplyIsolated({...req,kind:'READ_EXISTING_RENAME'}):null;
  return {outcome,reconciled,effects,resources};
 }finally{for(const [k,v] of Object.entries(prior)){
  if(v===undefined)delete globalThis[k];else globalThis[k]=v;
 }}
}
test('real guarded existing-identity rename verifies old immutable ID, HTTP404 new slug and preserves full original bytes',async()=>{
 const r=await run();assert.equal(r.outcome.ok,true,JSON.stringify(r.outcome));
 assert.equal(r.outcome.ack,'RENAME_EXISTING_ACK_ONLY');
 assert.equal(r.reconciled.ok,true,JSON.stringify(r.reconciled));
 assert.equal(r.reconciled.state,'RENAMED_SAME_REMOTE_ID');
 assert.deepEqual(r.effects,['RENAME']);assert.equal(r.resources.has(old),false);
 assert.equal(r.resources.get(target).publicId,id);
 assert.equal(r.resources.get(target).modelText,original.modelText);
 assert.deepEqual(r.resources.get(target).srcManifest,original.srcManifest);
});
for(const [title,options,code] of [
 ['foreign new slug',{foreign:true},'TARGET_ALREADY_OCCUPIED'],
 ['unknown owner of new slug',{ownerUnknown:true},'TARGET_OWNER_READBACK_UNVERIFIED'],
 ['wrong immutable previous ID',{wrongId:true},'EXISTING_OWNER_OR_REMOTE_ID_UNVERIFIED']
]){
 test('existing-identity rename fails closed: '+title,async()=>{
  const r=await run(options);assert.equal(r.outcome.ok,false);
  assert.equal(r.outcome.code,code);assert.deepEqual(r.effects,[]);
  assert.equal(r.resources.get(old).modelText,original.modelText);
 });
}
test('lost RENAME ACK is not certified success even though remote source moved: reconcile separately by immutable ID',async()=>{
 const r=await run({ackLost:true});
 assert.equal(r.outcome.ok,false);
 assert.equal(r.outcome.code,'RENAME_EXISTING_OUTCOME_UNCERTAIN');
 assert.deepEqual(r.effects,['RENAME']);
 assert.equal(r.reconciled.ok,true);
 assert.equal(r.reconciled.remoteId,req.remoteId);
});
