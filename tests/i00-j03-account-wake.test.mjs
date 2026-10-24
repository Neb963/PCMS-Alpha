import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createAccountStore} from '../src/runtime/accounts.mjs';
import {createAccountBoundary,ROUTE_UPKEEP_ALARM} from '../src/runtime/account-boundary.mjs';

test('account upkeep retains its scheduled wake across event-page controllers and startup',async()=>{
 const listeners=[],created=[];let saved=null;
 const api={storage:{local:{get:async()=>({})}},runtime:{onConnect:{addListener(){}},onStartup:{addListener:fn=>listeners.push(fn)}},
  alarms:{get:async name=>{assert.equal(name,ROUTE_UPKEEP_ALARM);return saved;},create:async(name,options)=>{created.push({name,options});saved={name,scheduledTime:9000};},onAlarm:{addListener(){}}}};
 createAccountBoundary(api).register();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(created.length,1);assert.equal(created[0].options.delayInMinutes,1);assert.equal(created[0].options.periodInMinutes,10);
 const original=saved;
 createAccountBoundary(api).register();await new Promise(resolve=>setImmediate(resolve));
 listeners.at(-1)();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(created.length,1,'a background wake must not postpone the existing renewal deadline');assert.equal(saved,original);
});

test('account list and inspector stay read-only during restore and defer cold recovery until it clears',async()=>{
 const db=fakeDatabase(),accounts=createAccountStore(db),id='restore_held_setup';
 await accounts.applyCurrent({type:'BEGIN_SETUP',accountId:id,bindingId:'restore_held_binding'});
 let restore={active:true};const api={runtime:{id:'same-extension',getURL:path=>'moz-extension://fixture/'+path},storage:{local:{get:async()=>restore===undefined?{}:{pcmsRestoreInProgress:restore}}}};
 const guard={enrollmentDonor:{createBoundPersona:async()=>{throw Error('No provider effect allowed');}}};
 const boundary=createAccountBoundary(api,{open:async()=>db,guard:()=>guard,pins:{hold(){},release(){},reload(){}}});
 const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')};
 const before=(await accounts.get(id)).account,events=db.keys('events').length;
 for(const command of [{type:'LIST_ACCOUNTS'},{type:'INSPECT_ACCOUNT',params:{accountId:id}}]){
  assert.equal((await boundary.run(command,sender)).ok,true);assert.deepEqual((await accounts.get(id)).account,before);assert.equal(db.keys('events').length,events);
 }
 restore=undefined;assert.equal((await boundary.run({type:'LIST_ACCOUNTS'},sender)).ok,true);
 const recovered=(await accounts.get(id)).account;assert.equal(recovered.setup.code,'ENROLLMENT_INTERRUPTED');assert.equal(recovered.bindingId,before.bindingId);
});
