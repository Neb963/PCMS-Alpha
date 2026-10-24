import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
import {fakeDatabase} from './fake-idb.mjs';import {createCoordinatorStore} from '../src/runtime/coordinator-store.mjs';
import {createCreationWatcher,CREATION_FOLLOWUP_ALARM} from '../src/runtime/creation-watch.mjs';
import {createCreationRunner} from '../src/runtime/creation-runner.mjs';
globalThis.crypto??=webcrypto;
test('J02 actual runner attempts persist through watcher restart, drain unvisited holds once, and cool down without endless followups',async()=>{
 const db=fakeDatabase(),store=createCoordinatorStore(db),local={},alarms=[];let now=Date.now();
 for(let i=0;i<23;i++)await store.acceptCreate({intentId:'intent_held_'+String(i).padStart(3,'0'),slug:'j02-held-'+i,origin:'OPERATOR'});
 const api={storage:{local:{get:async k=>({[k]:local[k]}),set:async data=>Object.assign(local,data)}},
  alarms:{create:async(name)=>alarms.push(name)}};
 const options={open:async()=>db,clock:()=>now,createRunner:(api,o)=>createCreationRunner(api,{...o,now:()=>now})};
 for(let i=0;i<3;i++)assert.equal((await createCreationWatcher(api,options).tick()).held,Math.min(8,23-i*8));
 const before=alarms.length,out=await createCreationWatcher(api,options).tick();
 assert.equal(out.selected,0);assert.equal(out.more,false);assert.equal(alarms.length,before);
 const page=await store.listCreate({limit:100});assert.equal(page.items.filter(x=>x.lastAttempt?.code==='NO_MANAGED_ACCOUNTS').length,23);
 now+=5*60000+1;assert.equal((await createCreationWatcher(api,options).tick()).selected,8);
 assert.ok(alarms.includes(CREATION_FOLLOWUP_ALARM));
});
