import test from 'node:test';
import assert from 'node:assert/strict';
import {createS06StandingAuthority} from '../src/runtime/s06-standing-authority.mjs';
const ACK='I AUTHORIZE PROTECTED PCMS OPERATIONS';
const repo={repository:'Neb963/per-gens',repositoryId:'1411034835'};
const sender={id:'fixture-xpi',url:'moz-extension://fixture-xpi/pcms/index.html#settings'};
function setup(config=repo){
 const data={...(config?{pcmsS03Git:config}:{})};
 const changed=[],listeners=[];
 const local={
  async get(key){return {[key]:structuredClone(data[key])};},
  async set(values){for(const [key,v] of Object.entries(values)){
   const prior=data[key];data[key]=structuredClone(v);
   changed.push({key,prior});
   for(const fn of listeners)fn({[key]:{oldValue:prior,newValue:v}},'local');
  }}
 };
 const api={runtime:{id:'fixture-xpi',getURL:p=>'moz-extension://fixture-xpi/'+p,
   onConnect:{addListener(){}}},storage:{local,onChanged:{addListener:fn=>listeners.push(fn)}}};
 return {api,data,changed,gate:createS06StandingAuthority(api)};
}
const request=(grants,expectedRevision=1,repositoryId=repo.repositoryId)=>({
 type:'SET',params:{expectedRevision,repositoryId,grants,consent:ACK}});
const all={development:true,gitWrite:true,publication:true};
const off={development:false,gitWrite:false,publication:false};
test('S06 defaults OFF and activates only exact trusted scope, consent and CAS',async()=>{
 const x=setup(),gate=x.gate;
 assert.equal(gate.gate('gitWrite'),false);
 const opened=await gate.handle({type:'GET'},sender);
 assert.equal(opened.record.grants.gitWrite,false);
 assert.equal(opened.record.revision,1);
 assert.equal(gate.gate('publication'),false);
 for(const msg of [
  {type:'SET',params:{...request(all).params,consent:'yes'}},
  request(all,1,'999'),
  {type:'SET',params:{...request(all).params,grants:{development:true,publication:true}}},
  {type:'SET',params:{...request(all).params,grants:{...all,allOtherAccounts:true}}},
  {type:'SET',params:{...request(all).params,expectedRevision:0}}
 ]){
  assert.equal((await gate.handle(msg,sender)).ok,false);
  assert.equal(gate.gate('development'),false);
 }
 const partial=await gate.handle(request({...off,development:true}),sender);
 assert.equal(partial.ok,true,JSON.stringify(partial));
 assert.equal(partial.record.revision,2);
 assert.equal(gate.gate('development'),true);
 assert.equal(gate.gate('gitWrite'),false);
 assert.equal(gate.gate('publication'),false);
 assert.equal((await gate.handle(request(all,1),sender)).code,
   'STANDING_AUTHORITY_STALE_REVISION');
 const enabled=await gate.handle(request(all,2),sender);
 assert.equal(enabled.ok,true);
 assert.equal(gate.gate('gitWrite'),true);
 assert.equal(gate.gate('publication'),true);
 const held=await gate.handle({type:'REVOKE'},sender);
 assert.equal(held.ok,true);
 assert.deepEqual(x.data.pcmsS06StandingAuthority.grants,off);
 assert.equal(gate.gate('gitWrite'),false);
});
test('S06 untrusted origins cannot grant or revoke standing authorization',async()=>{
 const x=setup();await x.gate.state();
 for(const imposter of [
  {id:'outside',url:sender.url},
  {id:'fixture-xpi',url:'https://perchance.org'},
  {id:'fixture-xpi',url:'moz-extension://fixture-xpi/pcms/other.html'},
  {id:'fixture-xpi',url:sender.url+'?forge'}
 ]){
  assert.equal((await x.gate.handle(request(all),imposter)).code,'UNTRUSTED_SENDER');
  assert.equal((await x.gate.handle({type:'REVOKE'},imposter)).code,'UNTRUSTED_SENDER');
 }
 assert.equal(x.gate.gate('development'),false);
 assert.equal(x.data.pcmsS06StandingAuthority,undefined);
});
test('S06 restart with restore held permanently revokes a previously persisted grant',async()=>{
 const x=setup();
 await x.gate.state();
 assert.equal((await x.gate.handle(request(all),sender)).ok,true);
 assert.equal(x.gate.gate('publication'),true);
 x.data.pcmsRestoreInProgress={active:true,status:'COMPLETE_INACTIVE'};
 const newWorker=createS06StandingAuthority(x.api);
 const restored=await newWorker.state();
 assert.equal(restored.reason,'RESTORE_HOLD');
 assert.equal(newWorker.gate('publication'),false);
 assert.deepEqual(x.data.pcmsS06StandingAuthority.grants,off);
 delete x.data.pcmsRestoreInProgress;
 const after=await createS06StandingAuthority(x.api).state();
 assert.equal(after.record.grants.development,false);
});
test('S06 private repo rebinding revokes all three grants even if numeric identifier changed',async()=>{
 const x=setup();x.gate.register();
 await x.gate.state();
 const enabled=await x.gate.handle(request(all),sender);
 assert.equal(enabled.ok,true);
 assert.equal(x.gate.gate('gitWrite'),true);
 await x.api.storage.local.set({pcmsS03Git:{
  repository:'Neb963/per-gens',repositoryId:'999999'}});
 assert.equal(x.gate.gate('gitWrite'),false);
 await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.equal(x.gate.gate('publication'),false);
});
test('S06 new worker never assumes a prior repo grant authorizes another private repository',async()=>{
 const x=setup();
 await x.gate.state();
 assert.equal((await x.gate.handle(request(all),sender)).ok,true);
 x.data.pcmsS03Git={repository:'Neb963/per-gens',repositoryId:'988877'};
 const restarted=createS06StandingAuthority(x.api);
 const result=await restarted.state();
 assert.equal(result.reason,'UNSCOPED_OR_UNCONFIGURED');
 assert.equal(restarted.gate('development'),false);
});

test('J06 cold preparation denies effective grants without destroying durable choices; seal revokes',async()=>{
 const x=setup();await x.gate.state();await x.gate.handle(request(all),sender);
 const before=structuredClone(x.data.pcmsS06StandingAuthority);
 x.data.pcmsRestoreInProgress={active:true,status:'PREPARING'};
 const cold=createS06StandingAuthority(x.api);assert.equal((await cold.state()).reason,'RESTORE_HOLD');
 assert.equal(cold.gate('development'),false);assert.deepEqual(x.data.pcmsS06StandingAuthority,before);
 delete x.data.pcmsRestoreInProgress;await cold.state();
 assert.equal(cold.gate('development'),true);
 x.data.pcmsRestoreInProgress={active:true,status:'GUARD_INSTALLED'};await cold.state();
 assert.deepEqual(x.data.pcmsS06StandingAuthority.grants,off);
});
