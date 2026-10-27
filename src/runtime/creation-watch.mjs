import {createScopeObservation} from './scope-observation.mjs';
import {checkpointed} from './work-checkpoint.mjs';
import {createScopedCreationGate} from './creation-authority.mjs';
// S04 bounded no-dashboard wake. A due alarm is only a hint: canonical
// revisions, guards and operation receipts remain the source of truth.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {createCoordinatorStore} from './coordinator-store.mjs';
import {createCreationRunner} from './creation-runner.mjs';
import {standingS06,createS06ScopeGate} from './s06-standing-authority.mjs';
import {subscribeProtectedReadiness} from './protected-readiness.mjs';
export const CREATION_ALARM='pcms-s04-creation-due';
export const CREATION_FOLLOWUP_ALARM='pcms-s04-creation-followup';
const PERIOD=10;
const NEXT='pcmsS04WakeReceipt';
const CURSOR='pcmsS04QueueCursor';
const BATCH_CURSOR='pcmsS04BatchCursor';
const ID=/^[A-Za-z0-9_-]{8,100}$/;
export function createCreationWatcher(api,{open=openCanonicalDatabase,
  createRunner=createCreationRunner,clock=Date.now,maxPerWake=8,authority=standingS06,observationMs=10000}={}){
  if(!Number.isSafeInteger(maxPerWake)||maxPerWake<1||maxPerWake>32)
    throw Error('INVALID_WAKE_BUDGET');
  let pending=null,registered=false,dbPromise;
  const sentinel=createRestoreSentinel(api.storage.local);
  const scopes=createScopeObservation(api,'creation',{clock,observationMs});
  const intakes=createScopeObservation(api,'creationIntake',{clock,observationMs});
  const runner=createRunner(api,{open,
    effectGate:createScopedCreationGate(authority),
    gitGate:createS06ScopeGate(authority,'gitWrite')});
  async function tick(){
    if(pending)return pending;
    pending=(async()=>{
      if((await sentinel.inspect()).held)return {ok:false,code:'RESTORE_HOLD'};
      const db=await (dbPromise||=open().catch(e=>{dbPromise=null;throw e;}));
      const store=createCoordinatorStore(db);
      // Completed batch chunks become canonical per-slug reservations without
      // relying on an open dashboard. The manifest cursor is persisted in IDB.
      // Fairness cursor is only a storage-local hint, never effect authority.
      const batchWork=intakes.run(['domain:creationIntake'],async()=>{
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
        if(intakes.busy(['batch:'+row.batchId])){batches=batches.filter(b=>b.batchId!==row.batchId);continue;}
        await api.storage.local.set({[BATCH_CURSOR]:batchLast});
        const outcome=await intakes.run(['batch:'+row.batchId],()=>store.processBatch({batchId:row.batchId}),{
          progressed:r=>r?.ok===true&&r?.batch?.revision>row.revision});
        if(outcome?.ok){batchProgressed++;
          if(outcome.batch.state!=='QUEUED')batches=batches.filter(b=>b.batchId!==row.batchId);
        }else if(outcome?.code==='BATCH_NOT_QUEUED'){
          batches=batches.filter(b=>b.batchId!==row.batchId);
        }else{
          batchHeld++;batches=batches.filter(b=>b.batchId!==row.batchId);
        }
      }
      return {batchProgressed,batchHeld};
      },{timeoutMs:Math.min(30000,observationMs*2)}).catch(()=>({batchProgressed:0,batchHeld:1}));
      const buckets=new Map(),seen=new Set();
      const scopeOf=item=>item.state==='WAITING_CAPABILITY'?'intent:'+item.intentId:
        item.state.startsWith('GIT_')?'generator:'+item.slug:
        item.accountId?'account:'+item.accountId:'intent:'+item.intentId;
      const saved=(await api.storage.local.get(CURSOR))?.[CURSOR];
      const anchor=typeof saved==='string'&&ID.test(saved)?saved:null;
      let after=anchor,wrapped=anchor===null,pages=0,tail=null,overflow=false;
      // Cursor is a bounded fairness hint only, NOT an effect claim, route
      // grant or source of truth. The authoritative state is always reread
      // from the canonical journal at the selected revision.
      while(pages<16){
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
                item.lastAttempt.ok===false&&item.lastAttempt.code!=='INITIAL_INVENTORY_REFRESHED'&&
                clock()-item.lastAttempt.at<5*60*1000)){
            const key=scopeOf(item);
            if(!buckets.has(key)&&buckets.size<maxPerWake)buckets.set(key,[]);
            const bucket=buckets.get(key);
            if(bucket&&bucket.length<maxPerWake)bucket.push(item);else overflow=true;
          }
        }
        tail=page.next;
        if(page.truncated){after=page.next;continue;}
        if(wrapped)break;
        // Resume around the wrap at most once. Never restart a whole
        // 1,000+ catalog on every wake, or starve healthy items behind holds.
        after=null;wrapped=true;
      }
      // Scan beyond a full account bucket to find independent accounts in
      // 1,000+ queues. Two bounded workers share one total transition budget.
      // Per-account ownership survives observation expiry and prevents replay.
      const groups=[...buckets.values()];let groupIndex=0;
      let progressed=0,held=0,continuing=0,selected=0;
      async function worker(){
       while(groupIndex<groups.length&&selected<maxPerWake){
        const group=groups[groupIndex++];
        for(const item of group){
         if(selected>=maxPerWake)break;
         const keys=[scopeOf(item),'generator:'+item.slug];
         if(scopes.busy(keys))break;
         if((await sentinel.inspect()).held)return;
         if(selected>=maxPerWake)break;selected++;
         // Advance the fairness hint BEFORE any external await. A late old
         // completion may not move the cursor behind a newer selection.
         await api.storage.local.set({[CURSOR]:item.intentId});
         const result=await scopes.run(keys,()=>runner.step(item.intentId,item.revision),{
          progressed:r=>r?.ok===true&&r?.record?.revision>item.revision});
         if(result?.ok&&result.record?.revision>item.revision){progressed++;
          if(result.record.state!=='ASSOCIATED_NOT_READY')continuing++;
         }else{
          held++;
          // One independently committed inventory census is forward motion,
          // not a reason to freeze the other missing-account scans for ten
          // minutes. The 60s follow-up still obeys the shared wake budget.
          if(result?.code==='INITIAL_INVENTORY_REFRESHED')continuing++;
         }
         if(['SCOPE_OBSERVATION_PENDING','SCOPE_ACTUAL_WORK_PENDING',
             'SCOPE_CAPACITY_HELD'].includes(result?.code))break;
        }
       }
      }
      await Promise.all([worker(),worker()]);
      const batchResult=await batchWork;
      const batchProgressed=batchResult?.batchProgressed||0,
        batchHeld=batchResult?.batchHeld||(batchResult?.ok===false?1:0);
      const result={ok:true,code:'S04_WAKE_CHECKPOINT',progressed,held,
        selected,batchProgressed,batchHeld,
        more:overflow||batchProgressed>0||[...buckets.values()].reduce((n,b)=>n+b.length,0)>selected||!!tail||pages===16,
        observedAt:clock(),providerActivation:'HELD_UNLESS_SCOPED_GATE'};
      await api.storage.local.set({[NEXT]:result});
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
    subscribeProtectedReadiness(event=>{if(event.kind==='ACCOUNT_READY')void tick();});
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
