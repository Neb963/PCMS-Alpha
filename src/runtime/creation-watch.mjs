import {checkpointed} from './work-checkpoint.mjs';
import {createScopedCreationGate} from './creation-authority.mjs';
// S04 bounded no-dashboard wake. A due alarm is only a hint: canonical
// revisions, guards and operation receipts remain the source of truth.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {createCoordinatorStore} from './coordinator-store.mjs';
import {createCreationRunner} from './creation-runner.mjs';
import {standingS06} from './s06-standing-authority.mjs';
export const CREATION_ALARM='pcms-s04-creation-due';
export const CREATION_FOLLOWUP_ALARM='pcms-s04-creation-followup';
const PERIOD=10;
const NEXT='pcmsS04WakeReceipt';
const CURSOR='pcmsS04QueueCursor';
const BATCH_CURSOR='pcmsS04BatchCursor';
const ID=/^[A-Za-z0-9_-]{8,100}$/;
export function createCreationWatcher(api,{open=openCanonicalDatabase,
  createRunner=createCreationRunner,clock=Date.now,maxPerWake=8,authority=standingS06}={}){
  if(!Number.isSafeInteger(maxPerWake)||maxPerWake<1||maxPerWake>32)
    throw Error('INVALID_WAKE_BUDGET');
  let pending=null,registered=false,dbPromise;
  const sentinel=createRestoreSentinel(api.storage.local);
  const runner=createRunner(api,{open,
    effectGate:createScopedCreationGate(authority),
    gitGate:()=>standingS06?.gate('gitWrite')===true});
  async function tick(){
    if(pending)return pending;
    pending=(async()=>{
      if((await sentinel.inspect()).held)return {ok:false,code:'RESTORE_HOLD'};
      const db=await (dbPromise||=open().catch(e=>{dbPromise=null;throw e;}));
      const store=createCoordinatorStore(db);
      // Completed batch chunks become canonical per-slug reservations without
      // relying on an open dashboard. The manifest cursor is persisted in IDB.
      // Fairness cursor is only a storage-local hint, never effect authority.
      const batchHint=(await api.storage.local.get(BATCH_CURSOR))?.[BATCH_CURSOR];
      const batchPage=await store.listBatches({
        after:typeof batchHint==='string'?batchHint:null,limit:100});
      if(!batchPage.ok)return batchPage;
      let batches=batchPage.items.filter(row=>row.state==='QUEUED');
      if(!batches.length&&batchHint){
        const wrapped=await store.listBatches({limit:100});
        if(!wrapped.ok)return wrapped;
        batches=wrapped.items.filter(row=>row.state==='QUEUED');
      }
      let batchProgressed=0,batchHeld=0,batchLast=batchHint||null;
      // At most 32 bounded canonical intake writes on each wake. Every
      // successful reservation is its own independently committed checkpoint.
      for(let i=0;i<32&&batches.length;i++){
        if((await sentinel.inspect()).held)break;
        const row=batches[i%batches.length];
        batchLast=row.batchId;
        const outcome=await store.processBatch({batchId:row.batchId});
        if(outcome?.ok){batchProgressed++;
          if(outcome.batch.state!=='QUEUED')batches=batches.filter(b=>b.batchId!==row.batchId);
        }else if(outcome?.code==='BATCH_NOT_QUEUED'){
          batches=batches.filter(b=>b.batchId!==row.batchId);
        }else{
          batchHeld++;batches=batches.filter(b=>b.batchId!==row.batchId);
        }
      }
      if(batchLast)await api.storage.local.set({[BATCH_CURSOR]:batchLast});
      const candidates=[],seen=new Set();
      const saved=(await api.storage.local.get(CURSOR))?.[CURSOR];
      const anchor=typeof saved==='string'&&ID.test(saved)?saved:null;
      let after=anchor,wrapped=anchor===null,pages=0,tail=null;
      // Cursor is a bounded fairness hint only, NOT an effect claim, route
      // grant or source of truth. The authoritative state is always reread
      // from the canonical journal at the selected revision.
      while(pages<16&&candidates.length<maxPerWake){
        const page=await store.listCreate({after,limit:100});
        if(!page?.ok)return {ok:false,code:page?.code||'S04_QUEUE_UNAVAILABLE'};
        pages++;
        for(const item of page.items){
          if(seen.has(item.intentId))continue;
          seen.add(item.intentId);
          if(['WAITING_CAPABILITY','OWNER_READBACK_PENDING',
              'CREATE_DISPATCH_POSSIBLE','CREATE_OBSERVING','CREATE_UNCERTAIN',
              'RENAME_DISPATCH_POSSIBLE','RENAME_OBSERVING','RENAME_UNCERTAIN',
              'CREATE_PREPARED','RENAME_PREPARED','OWNER_MISSING_VERIFIED',
              'PRIVATE_EMPTY_CONFIRMED','ADOPTION_ORIGINAL_PENDING',
              'GIT_INIT_PENDING','GIT_PREPARED','GIT_DISPATCH_POSSIBLE',
              'GIT_OBSERVING','GIT_UNCERTAIN'].includes(item.state)&&
              !item.conflict&&!(item.lastAttempt?.revision===item.revision&&
                item.lastAttempt.ok===false&&clock()-item.lastAttempt.at<5*60*1000))candidates.push(item);
        }
        tail=page.next;
        if(page.truncated){after=page.next;continue;}
        if(wrapped)break;
        // Resume around the wrap at most once. Never restart a whole
        // 1,000+ catalog on every wake, or starve healthy items behind holds.
        after=null;wrapped=true;
      }
      // A held item can no longer monopolize the first eight slots: the next
      // wake continues after the last attempted canonical item ID.
      const selected=candidates.slice(0,maxPerWake);
      let progressed=0,held=0,continuing=0;
      for(const item of selected){
        if((await sentinel.inspect()).held)break;
        const result=await runner.step(item.intentId,item.revision);
        if(result?.ok&&result.record?.revision>item.revision){progressed++;
          if(result.record.state!=='ASSOCIATED_NOT_READY')continuing++;
        }else held++;
      }
      const result={ok:true,code:'S04_WAKE_CHECKPOINT',progressed,held,
        selected:selected.length,batchProgressed,batchHeld,
        more:batchProgressed>0||candidates.length>selected.length||!!tail||pages===16,
        observedAt:clock(),providerActivation:'HELD_UNLESS_SCOPED_GATE'};
      await api.storage.local.set({[NEXT]:result,
        [CURSOR]:selected.at(-1)?.intentId||tail||null});
      // Large batches keep moving: one bounded follow-up wake while queued
      // work remains and this wake made progress (held-only queues wait for
      // the periodic wake instead of spinning).
      if(continuing>0||result.more)
        try{void Promise.resolve(api.alarms.create(CREATION_FOLLOWUP_ALARM,
          {when:clock()+60000})).catch(()=>{});}catch{}
      return result;
    })().catch(()=>({ok:false,code:'S04_WAKE_UNAVAILABLE'}))
      .finally(()=>{pending=null;});
    return pending;
  }
  function register(){
    if(registered)return;registered=true;
    api.alarms.onAlarm.addListener(evt=>{
      if(evt?.name===CREATION_ALARM||evt?.name===CREATION_FOLLOWUP_ALARM)void tick();
    });
    api.runtime.onStartup.addListener(()=>{schedule();void tick();});
    api.runtime.onInstalled.addListener(()=>{schedule();void tick();});
    schedule();void tick();
  }
  function schedule(){
    try{void Promise.resolve(api.alarms.create(CREATION_ALARM,
      {periodInMinutes:PERIOD})).catch(()=>{});}catch{}
  }
    tick=checkpointed(api,tick);
  return Object.freeze({register,tick});
}
if(typeof browser!=='undefined')createCreationWatcher(browser).register();
