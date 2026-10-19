// S04 bounded no-dashboard wake. A due alarm is only a hint: canonical
// revisions, guards and operation receipts remain the source of truth.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {createCoordinatorStore} from './coordinator-store.mjs';
import {createCreationRunner} from './creation-runner.mjs';
export const CREATION_ALARM='pcms-s04-creation-due';
const PERIOD=10;
const NEXT='pcmsS04WakeReceipt';
export function createCreationWatcher(api,{open=openCanonicalDatabase,
  createRunner=createCreationRunner,clock=Date.now,maxPerWake=8}={}){
  if(!Number.isSafeInteger(maxPerWake)||maxPerWake<1||maxPerWake>32)
    throw Error('INVALID_WAKE_BUDGET');
  let pending=null,registered=false,dbPromise;
  const sentinel=createRestoreSentinel(api.storage.local);
  const runner=createRunner(api,{open});
  async function tick(){
    if(pending)return pending;
    pending=(async()=>{
      if((await sentinel.inspect()).held)return {ok:false,code:'RESTORE_HOLD'};
      const db=await (dbPromise||=open().catch(e=>{dbPromise=null;throw e;}));
      const store=createCoordinatorStore(db);
      const candidates=[],seen=new Set();
      let after=null,pages=0;
      // Page against the real canonical index rather than the first N jobs.
      do{
        const page=await store.listCreate({after,limit:100});
        if(!page?.ok)return {ok:false,code:page?.code||'S04_QUEUE_UNAVAILABLE'};
        for(const item of page.items){
          if(seen.has(item.intentId))continue;
          seen.add(item.intentId);
          if(['WAITING_CAPABILITY','OWNER_READBACK_PENDING',
              'CREATE_DISPATCH_POSSIBLE','CREATE_OBSERVING','CREATE_UNCERTAIN',
              'RENAME_DISPATCH_POSSIBLE','RENAME_OBSERVING','RENAME_UNCERTAIN',
              'CREATE_PREPARED','RENAME_PREPARED','OWNER_MISSING_VERIFIED',
              'PRIVATE_EMPTY_CONFIRMED','GIT_INIT_PENDING'].includes(item.state) &&
              !item.conflict)candidates.push(item);
        }
        after=page.truncated?page.next:null;
        pages++;
      }while(after&&pages<16);
      // One step/item/wake. Never force a second action on the same item
      // following a possible dispatch.
      const selected=candidates.slice(0,maxPerWake);
      let progressed=0,held=0;
      for(const item of selected){
        if((await sentinel.inspect()).held)break;
        const result=await runner.step(item.intentId,item.revision);
        if(result?.ok)progressed++;else held++;
      }
      const result={ok:true,code:'S04_WAKE_CHECKPOINT',progressed,held,
        selected:selected.length,more:candidates.length>selected.length||!!after,
        observedAt:clock(),providerActivation:'HELD_UNLESS_SCOPED_GATE'};
      await api.storage.local.set({[NEXT]:result});
      return result;
    })().catch(()=>({ok:false,code:'S04_WAKE_UNAVAILABLE'}))
      .finally(()=>{pending=null;});
    return pending;
  }
  function register(){
    if(registered)return;registered=true;
    api.alarms.onAlarm.addListener(evt=>{
      if(evt?.name===CREATION_ALARM)void tick();
    });
    api.runtime.onStartup.addListener(()=>{schedule();void tick();});
    api.runtime.onInstalled.addListener(()=>{schedule();void tick();});
    schedule();void tick();
  }
  function schedule(){
    try{void Promise.resolve(api.alarms.create(CREATION_ALARM,
      {periodInMinutes:PERIOD})).catch(()=>{});}catch{}
  }
  return Object.freeze({register,tick});
}
if(typeof browser!=='undefined')createCreationWatcher(browser).register();
