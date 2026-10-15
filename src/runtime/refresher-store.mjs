// One revision-fenced canonical scheduler snapshot, with a durable sorted due
// index, in the existing PCMS DB. All async IO occurs outside transactions.
import {fail,isSafeId} from './journal.mjs';
import {emptyRefreshEvidence,observeRefreshPresence,reserveRefreshAttempt,
  dispatchPossible,reconcileRefreshAttempt} from './refresher-effect-core.mjs';
import {MARKER_POLICY,REFRESH_METHOD} from './refresh-marker.mjs';
import {REFRESHER_KEY,emptyShadow,validShadow,reconcileShadow,advanceShadow,
  effectiveCapacity,rowBlocks,queueOrder,validatePolicy,claimObservation,
  applyStatistic,observeCapacity,MINUTE} from './refresher-core.mjs';
const slugOK=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);

function transact(db,mode,fn){
  return new Promise((resolve,reject)=>{
    let tx,result=fail('REFRESHER_TRANSACTION_INCOMPLETE');
    try{tx=db.transaction(mode==='readonly'?['meta']:['meta','events','observations'],mode);}
    catch{return reject(Error('REFRESHER_DB_UNAVAILABLE'));}
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(Error('REFRESHER_DB_ABORTED'));
    tx.onerror=()=>{};
    try{fn(tx,v=>{result=v;});}catch{try{tx.abort();}catch{}}
  });
}
// Current I12 cannot make a release. A future release authority must persist
// independently confirmed exact-source publication; historical PUBLIC alone
// never satisfies this seam. B/F fixtures exercise the same canonical seam.
export function canonicalRefresherInputs(records){
  const accounts=new Map(),stages=new Map(),releases=new Map(),links=new Map(),updates=new Map(),refreshSources=new Map(),inventory=[];
  for(const record of records){
    const k=record?.key;
    if(typeof k!=='string')continue;
    if(k.startsWith('account:')&&record.account)accounts.set(record.account.accountId,record.account);
    if(k.startsWith('inventory:')&&record.generator)inventory.push(record.generator);
    if(k.startsWith('stage:')&&record.record)stages.set(record.record.slug,record.record);
    if(k.startsWith('release:')&&record.release)releases.set(record.release.slug,record.release);
    if(k.startsWith('source-link:')&&record.link)links.set(record.link.slug,record.link);
    if(k.startsWith('refresh-source:')&&record.record)refreshSources.set(record.record.slug,record.record);
    if(k.startsWith('existing-update:')&&record.record)updates.set(record.record.slug,record.record);
  }
  return inventory.map(row=>{
    const a=accounts.get(row.accountId),release=releases.get(row.slug),stage=stages.get(row.slug),
      link=links.get(row.slug),update=updates.get(row.slug);
    const accountVerified=a?.state==='VERIFIED'&&a.identity?.source==='GUARDED_SESSION_READBACK'&&
      a.identity.bindingVersion===a.bindingVersion&&hex(a.identity.principalFingerprint);
    const matched=accountVerified&&a.personaUid===row.personaUid&&a.bindingVersion===row.bindingVersion;
    const released=matched&&release?.state==='CONFIRMED_PUBLIC'&&
      release.source==='INDEPENDENT_PUBLICATION_READBACK'&&release.accountId===a.accountId&&
      release.personaUid===a.personaUid&&release.bindingVersion===a.bindingVersion&&
      release.remoteId===row.remoteId&&release.principalFingerprint===a.identity.principalFingerprint&&
      hex(release.sourceFingerprint)&&isSafeId(release.observationId)&&
      Number.isSafeInteger(release.observedAt)&&release.observedAt>0;
    return {sourceRefresh:refreshSources.get(row.slug)||null,slug:row.slug,accountId:row.accountId,remoteId:row.remoteId,
      personaUid:a?.personaUid||row.personaUid,bindingVersion:a?.bindingVersion||row.bindingVersion,
      ownerVerified:matched&&row.ownerState==='OBSERVED_OWNER',accountVerified:!!accountVerified,
      principalFingerprint:a?.identity?.principalFingerprint||null,
      releaseVerified:!!released,releaseFingerprint:released?release.sourceFingerprint:null,
      listing:row.visibility,observedAt:row.lastObservedAt,
      // A confirmed, byte-exact final F closes the staged B->F review
      // without requiring B to equal F after AI edits. An interrupted
      // existing update remains held until final listing is confirmed.
      reviewHeld:(!!update&&!(
        update.state==='RESTORE_CONFIRMED'||(
          update.state==='STAGE_CONFIRMED'&&released&&
          update.stagedFingerprint===release.sourceFingerprint
        )))||!!stage&&stage.state!=='HUMAN_OWNED'&&!released,
      readyUpdate:link?.readyUpdate===true||!!released&&link?.readyAtInspection===true&&
        link.fingerprint!==release.sourceFingerprint};
  });
}
function project(s,now,{query='',accountId='',phase='ALL',offset=0,limit=25}={}){
  const match=s.rows.filter(r=>(!query||r.slug.includes(query.toLowerCase())||
    r.accountId.includes(query.toLowerCase())||r.stableId.includes(query))&&
    (!accountId||r.accountId===accountId)&&(phase==='ALL'||r.phase===phase)).sort(queueOrder);
  const items=match.slice(offset,offset+limit).map(r=>({stableId:r.stableId,slug:r.slug,
    accountId:r.accountId,phase:r.phase,activeRemaining:r.activeRemaining,sleepRemaining:r.sleepRemaining,
    activeMs:r.activeMs,sleepMs:r.sleepMs,ordinal:r.ordinal,slot:r.slot,paused:r.paused,
    blockers:[...rowBlocks(s,r),r.readyUpdate&&'READY_UPDATE_FIRST'].filter(Boolean),
    presence:r.presence?{...r.presence,stale:r.presence.observedAt>now||now-r.presence.observedAt>2*s.policy.recentMs}:null,
    statisticSuspended:r.metrics.suspended===true,
    schedulingEnabled:r.sourceRefresh?.scheduleEnabled===true,
    sourceSaveState:r.sourceRefresh?.state||'METHOD_NOT_CONFIGURED',
    refresh:{state:r.refresh?.state||'UNOBSERVED',misses:r.refresh?.misses||0,
      attempts:r.refresh?.attempts||0,suspended:r.refresh?.suspended===true,
      nextAttemptAt:r.refresh?.nextAttemptAt||0,
      proof:r.refresh?.history?.at(-1)||null},
    metric:r.metrics.latest?{...r.metrics.latest,stale:r.metrics.latest.observedAt>now||now-r.metrics.latest.observedAt>
      s.policy.statsMaxMs}:null,nextStatisticAt:r.metrics.nextDueAt}));
  return {ok:true,revision:s.revision,mode:'SHADOW_ONLY',providerEffects:'OFF',items,
    total:match.length,occupied:s.rows.filter(r=>r.slot).length,
    eligible:s.rows.filter(r=>r.phase==='WAITING'&&!rowBlocks(s,r).length&&!r.readyUpdate).length,
    enabledTargets:s.rows.filter(r=>r.sourceRefresh?.scheduleEnabled).length,
    visibilitySuspended:s.rows.filter(r=>r.refresh?.suspended).length,
    capacity:effectiveCapacity(s,now),provider:s.provider,globalPause:s.globalPause,
    accounts:Object.entries(s.accounts).map(([id,a])=>({accountId:id,paused:a.paused,
      health:a.health,graceUsed:a.graceUsed})),policy:s.policy,
    recent:{observedAt:s.recent.observedAt,total:s.recent.total,complete:s.recent.complete,
      suspended:s.recent.suspended===true,
      stale:!s.recent.observedAt||s.recent.observedAt>now||now-s.recent.observedAt>2*s.policy.recentMs},
    nextWakeAt:s.nextWakeAt,diagnostics:{...s.diagnostics},
    timeline:s.timeline.slice(-8),clock:'EVIDENCED_ONLY',monitoring:'GATED_READ_ONLY'};
}
export function createRefresherStore(db){
  function mutate(expectedRevision,fn,{sync=false}={}){
    return transact(db,'readwrite',(tx,done)=>{
      const meta=tx.objectStore('meta');
      meta.get(REFRESHER_KEY).onsuccess=e=>{
        const state=e.target.result?.state||emptyShadow();
        if(!validShadow(state)){done(fail('REFRESHER_STATE_CORRUPT'));return;}
        if(expectedRevision!==null&&state.revision!==expectedRevision){done(fail('STALE_REVISION'));return;}
        function apply(records=[]){
          try{
            const merged=sync?reconcileShadow(state,canonicalRefresherInputs(records)):{ok:true,state};
            if(!merged.ok){done(merged);return;}
            const out=fn(merged.state,meta,tx);
            if(!out?.ok){done(out||fail('REFRESHER_REDUCER_FAILED'));return;}
            out.state.revision=state.revision+1;
            if(!validShadow(out.state)){done(fail('REFRESHER_STATE_CORRUPT'));return;}
            meta.put({key:REFRESHER_KEY,state:out.state});
            for(const change of out.changes||[])tx.objectStore('events').add({
              stage:'REFRESHER_'+change.code,scopeId:change.scopeId,
              revision:out.state.revision,count:change.count||1});
            done({...out,revision:out.state.revision});
          }catch{tx.abort();}
        }
        if(!sync){apply();return;}
        const records=[];let seen=0;
        meta.openCursor().onsuccess=ev=>{
          const c=ev.target.result;
          if(!c){apply(records);return;}
          if(++seen>50000){done(fail('CANONICAL_SCAN_LIMIT'));return;}
          if(typeof c.key==='string'&&/^(account|inventory|stage|release|source-link|existing-update|refresh-source):/.test(c.key))
            records.push(c.value);
          c.continue();
        };
      };
    });
  }
  function read(){
    return transact(db,'readonly',(tx,done)=>{
      tx.objectStore('meta').get(REFRESHER_KEY).onsuccess=e=>{
        const state=e.target.result?.state||emptyShadow();
        done(validShadow(state)?{ok:true,state}:fail('REFRESHER_STATE_CORRUPT'));
      };
    });
  }
  async function list(now,filter){
    const x=await read();return x.ok?project(x.state,now,filter):x;
  }
  const turn=(args)=>mutate(null,s=>advanceShadow(s,args),{sync:true});
  const changePolicy=(expectedRevision,changes)=>mutate(expectedRevision,s=>{
    const policy={...s.policy,...changes};
    if(!validatePolicy(policy).ok)return fail('INVALID_REFRESHER_POLICY');
    return {ok:true,state:{...s,policy}};
  });
  const pause=(expectedRevision,scope,target,paused)=>mutate(expectedRevision,s=>{
    if(typeof paused!=='boolean')return fail('INVALID_PAUSE');
    const out=structuredClone(s);
    if(scope==='GLOBAL')out.globalPause=paused;
    else if(scope==='ACCOUNT'&&out.accounts[target])out.accounts[target].paused=paused;
    else if(scope==='GENERATOR'&&out.rows.some(r=>r.stableId===target))
      out.rows.find(r=>r.stableId===target).paused=paused;
    else return fail('PAUSE_TARGET_UNKNOWN');
    return {ok:true,state:out,changes:[{code:paused?'PAUSED':'RESUMED',scopeId:target||'global_scope'}]};
  });
  const generatorPolicy=(expectedRevision,stableId,activeMs,sleepMs)=>mutate(expectedRevision,s=>{
    const policy={...s.policy,activeMs,sleepMs};
    if(!validatePolicy(policy).ok)return fail('INVALID_REFRESHER_POLICY');
    const out=structuredClone(s),r=out.rows.find(r=>r.stableId===stableId);
    if(!r)return fail('GENERATOR_UNKNOWN');
    // New policy affects subsequent full periods; unfinished budgets retained.
    r.activeMs=activeMs;r.sleepMs=sleepMs;
    return {ok:true,state:out};
  });
  const demand=(expectedRevision,stableId,now)=>mutate(expectedRevision,s=>{
    const out=structuredClone(s),r=out.rows.find(r=>r.stableId===stableId);
    if(!r)return fail('GENERATOR_UNKNOWN');
    r.metrics.demandUntil=now+60*MINUTE;
    r.metrics.suspended=false;r.metrics.failures=0;
    r.metrics.nextDueAt=Math.min(r.metrics.nextDueAt,now+MINUTE);
    return {ok:true,state:out};
  });
  const claim=args=>mutate(null,s=>claimObservation(s,args));
  const complete=(claimId,packet,now)=>mutate(null,s=>{
    const c=s.inflight.find(c=>c.claimId===claimId);
    if(!c||now>c.deadline||c.bootId!==s.bootId)return fail('OBSERVATION_CLAIM_EXPIRED');
    const a=s.accounts[c.accountId];
    if(!a||a.bindingVersion!==c.bindingVersion||a.personaUid!==c.personaUid||
      a.principalFingerprint!==c.principalFingerprint||
      !a.verifiedIdentity)return fail('OBSERVATION_CONTEXT_CHANGED');
    let out=structuredClone(s),accepted=false,clockChanges=[];
    if(packet?.ok&&packet.principalFingerprint!==c.principalFingerprint)
      packet={ok:false,code:'MONITOR_PRINCIPAL_CHANGED'};
    if(packet?.ok&&c.kind==='RECENT'&&packet.observedAt===c.startedAt&&
      packet.complete===true&&Array.isArray(packet.items)&&packet.items.length<=5000&&
      packet.items.every(x=>slugOK(x.slug))&&new Set(packet.items.map(x=>x.slug)).size===packet.items.length&&
      c.startedAt>out.recent.observedAt){
      out.recent={...out.recent,observedAt:c.startedAt,total:packet.items.length,complete:true,
        nextDueAt:now+out.policy.recentMs,failures:0};
      const ranks=new Map(packet.items.map((item,i)=>[item.slug,{...item,position:i+1}]));
      for(const r of out.rows){
        const item=ranks.get(r.slug);
        r.presence={present:!!item,position:item?.position||null,observedAt:c.startedAt,
          source:'GUARDED_RECENT_LIST',absence:'NOT_A_DELETION'};
        const owner=out.accounts[r.accountId];
        const healthy=r.ownerVerified&&r.releaseVerified&&r.listing==='PUBLIC'&&
          !r.reviewHeld&&!r.identityHeld&&owner?.verifiedIdentity===true&&
          owner.health==='HEALTHY'&&Number.isSafeInteger(owner.healthAt)&&
          c.startedAt-owner.healthAt<=out.policy.recentMs&&
          out.provider.state!=='OUTAGE';
        const evidence=observeRefreshPresence(r.refresh||emptyRefreshEvidence(),{
          at:c.startedAt,present:!!item,rank:item?.position,complete:true,
          healthy,windowMs:out.policy.recentMs});
        if(evidence.ok){
          r.refresh=evidence.evidence;
          if(evidence.releaseSlot&&r.slot){
            r.slot=false;
            if(r.phase==='ACTIVE')r.phase='WAITING';
            clockChanges.push({code:'VISIBILITY_SUSPENDED',scopeId:r.stableId});
          }else if(evidence.resumed){
            clockChanges.push({code:'VISIBILITY_RECOVERED',scopeId:r.stableId});
          }
        }
      }
      for(const r of [...out.rows]){
        const item=ranks.get(r.slug);
        if(item&&Number.isSafeInteger(item.views)){
          const metric=applyStatistic(out,{...c,stableId:r.stableId,
            bindingVersion:r.bindingVersion,personaUid:r.personaUid,remoteId:r.remoteId},
            {observedAt:c.startedAt,views:item.views,unit:'VIEWS',source:'GUARDED_READ_ONLY'},now);
          if(metric.ok)out=metric.state;
        }
      }
      const cap=observeCapacity(out,{at:c.startedAt,usablePositions:packet.items.length,complete:true});
      if(cap.ok)out=cap.state;
      accepted=true;
    }else if(packet?.ok&&c.kind==='STATISTIC'){
      const metric=applyStatistic(out,c,packet,now);
      if(metric.ok){out=metric.state;accepted=true;}
    }
    out.inflight=out.inflight.filter(x=>x.claimId!==claimId);
    const group=packet?.group;
    if(group?.source==='GUARDED_OVERLAP'&&group.bootId===c.bootId&&
      Number.isSafeInteger(group.from)&&Number.isSafeInteger(group.to)&&
      group.from>=c.startedAt&&group.to<=now&&group.to>group.from&&group.to-group.from<=30000&&
      Array.isArray(group.accounts)&&group.accounts.length<=100&&Array.isArray(group.witnesses)){
      const accounts=group.accounts.filter(h=>{
        const current=out.accounts[h.accountId];
        return current?.bindingVersion===h.bindingVersion&&current.personaUid===h.personaUid&&
          (h.health!=='HEALTHY'||current.principalFingerprint===h.principalFingerprint);
      });
      const witnesses=group.witnesses.filter(w=>accounts.some(a=>a.accountId===w.accountId&&
        a.principalFingerprint===w.principalFingerprint));
      const proof={source:'GUARDED_OPERATIONAL_INTERVAL',id:group.id,bootId:c.bootId,
        browserRunning:true,complete:true,from:group.from,to:group.to,accounts,witnesses};
      const turn=advanceShadow(out,{now,bootId:c.bootId,receipt:proof});
      if(turn.ok){out=turn.state;clockChanges.push(...turn.changes);}
    }
    // Account/service availability is credited only over the actually
    // witnessed guarded request interval. No interpolation across ten-minute
    // polling gaps. This same path is used by the real alarm-backed observer.
    if(packet?.interval?.source==='GUARDED_MONITOR_INTERVAL'&&
      packet.interval.bootId===c.bootId&&packet.interval.from===c.startedAt&&
      packet.interval.to<=now&&packet.interval.to>c.startedAt&&packet.interval.to-c.startedAt<=30000&&
      packet.principalFingerprint===c.principalFingerprint){
      const interval={from:c.startedAt,to:packet.interval.to,accountId:c.accountId,
        bindingVersion:c.bindingVersion,personaUid:c.personaUid,
        health:accepted&&packet.ok?'HEALTHY':'UNKNOWN',protected:true,sessionVerified:accepted&&packet.ok===true,
        domain:isSafeId(packet.interval.domain)?packet.interval.domain:null,
        providerResult:accepted&&packet.ok?'HEALTHY':packet.code==='PROVIDER_UNAVAILABLE'?
          'PROVIDER_UNAVAILABLE':'UNKNOWN'};
      out.healthIntervals=[...(out.healthIntervals||[]),interval].slice(-50);
      const covering=out.healthIntervals.filter(h=>h.from<=interval.from&&h.to>=interval.to);
      const receipt={source:'GUARDED_OPERATIONAL_INTERVAL',id:c.claimId,
        bootId:c.bootId,browserRunning:true,complete:true,from:interval.from,to:interval.to,
        accounts:covering.filter((h,i,all)=>all.findIndex(x=>x.accountId===h.accountId)===i),
        witnesses:covering.filter(h=>h.domain).map(h=>({accountId:h.accountId,
          domain:h.domain,result:h.providerResult,routeVerified:true,observedAt:interval.to}))};
      const turn=advanceShadow(out,{now,bootId:c.bootId,receipt});
      if(turn.ok){out=turn.state;clockChanges=turn.changes;}
    }
    if(!accepted){
      out.diagnostics.dropped++;
      const obj=c.kind==='RECENT'?out.recent:out.rows.find(r=>r.stableId===c.stableId)?.metrics;
      if(obj){obj.failures=Math.min(8,obj.failures+1);obj.suspended=obj.failures>=8;
        const floor=c.kind==='RECENT'?out.policy.recentMs:out.policy.statsMinMs;
        obj.nextDueAt=now+Math.max(Math.min(24*60*MINUTE,floor*2**obj.failures),
          Math.min(24*60*MINUTE,Math.max(0,packet?.retryAfterMs||0)));
      }
    }
    return {ok:true,state:out,accepted,changes:clockChanges,code:accepted?'OBSERVED':'OBSERVATION_HELD'};
  },{sync:true});
  // Single canonical transaction for each step. A crash after possible
  // dispatch is never treated as permission to repeat a provider effect.
  const reserveAttempt=({stableId,id,now,candidate,liveAuthorized})=>mutate(null,(s,meta)=>{
    const r=s.rows.find(x=>x.stableId===stableId),marker=candidate?.method===REFRESH_METHOD;
    const test=marker&&candidate.purpose==='SINGLE_TEST',cfg=r?.sourceRefresh,p=candidate?.plan;
    if(!r)return fail('REFRESH_ADMISSION_HELD');
    if(marker){
      if(!cfg||cfg.restoredHistorical||cfg.policy!==MARKER_POLICY||!cfg.consent||
        cfg.consent.revision!==p?.consentRevision||cfg.consent.approvedBaseFingerprint!==r.releaseFingerprint||
        cfg.approvedBaseFingerprint!==r.releaseFingerprint||p.approvedBaseFingerprint!==r.releaseFingerprint||
        cfg.effectiveCurrentFingerprint!==p.expectedPreSaveFingerprint||id!==p.operationId||
        cfg.principalFingerprint!==s.accounts[r.accountId]?.principalFingerprint||
        cfg.accountId!==r.accountId||cfg.remoteId!==r.remoteId||cfg.personaUid!==r.personaUid||
        cfg.bindingVersion!==r.bindingVersion||r.readyUpdate)
        return fail('REFRESH_SOURCE_CONSENT_STALE');
      if(test){
        if(cfg.preview?.expiresAt<now||cfg.preview?.plan?.operationId!==id||cfg.preview?.consented!==true||
          cfg.testAttempted===true)return fail('REFRESH_TEST_NOT_ARMED');
      }else{
        const q=cfg.qualification;
        if(!cfg.scheduleEnabled||!q||q.validUntil<=now||q.reviewDigest!==candidate.reviewDigest||
          q.approvedBaseFingerprint!==r.releaseFingerprint||s.nextRefreshAt>now||
          s.accounts[r.accountId]?.nextRefreshAt>now)return fail('REFRESH_RECURRING_NOT_QUALIFIED');
        const last=r.refresh?.history?.at(-1);
        if(last?.allocationEpoch===r.allocationEpoch&&
          last.budgetAtSave-r.activeRemaining<(q.minimumIntervalMs||600000))
          return fail('REFRESH_OPERATIONAL_INTERVAL_NOT_DUE');
      }
    }
    const blocks=rowBlocks(s,r).filter(x=>!(test&&x==='ACCOUNT_UNAVAILABLE'));
    if((!test&&(r.phase!=='ACTIVE'||!r.slot))||blocks.length||
      (test&&(r.sleepRemaining>0||r.phase==='SLEEPING')))return fail('REFRESH_ADMISSION_HELD');
    const attempt=reserveRefreshAttempt(r.refresh,{id,at:now,slug:r.slug,
      sourceFingerprint:marker?p.expectedPreSaveFingerprint:r.releaseFingerprint,
      candidate,eligible:true,liveAuthorized});
    if(!attempt.ok)return attempt;
    const out=structuredClone(s),target=out.rows.find(x=>x.stableId===stableId);
    target.refresh=attempt.evidence;
    target.refresh.intent.budgetAtSave=r.activeRemaining;
    target.refresh.intent.allocationEpoch=r.allocationEpoch;
    if(marker){
      const next={...cfg,testAttempted:cfg.testAttempted||test,revision:cfg.revision+1};
      meta.put({key:'refresh-source:'+r.slug,record:next});target.sourceRefresh=next;
      out.nextRefreshAt=now+MINUTE;out.accounts[r.accountId].nextRefreshAt=now+MINUTE;
    }
    return {ok:true,state:out,claim:{id,stableId,slug:r.slug,accountId:r.accountId,
      personaUid:r.personaUid,bindingVersion:r.bindingVersion,remoteId:r.remoteId,
      principalFingerprint:s.accounts[r.accountId]?.principalFingerprint,
      releaseFingerprint:r.releaseFingerprint,...(marker?{plan:p,purpose:candidate.purpose}:{})},
      changes:[{code:'REFRESH_RESERVED',scopeId:stableId}]};
  },{sync:true});
  const cancelReserved=(stableId,id,now,reason='REFRESH_PREFLIGHT_HELD')=>mutate(null,(s,meta)=>{
    const row=s.rows.find(r=>r.stableId===stableId);
    if(!row||row.refresh?.intent?.id!==id||
      row.refresh.intent.state!=='RESERVED')return fail('REFRESH_RESERVATION_NOT_CANCELABLE');
    const out=structuredClone(s),r=out.rows.find(x=>x.stableId===stableId);
    if(r.refresh.intent.purpose==='RECURRING'&&r.sourceRefresh){
      r.sourceRefresh={...r.sourceRefresh,state:'PREFLIGHT_HELD',scheduleEnabled:false,
        lastHold:/^[A-Z0-9_]{1,80}$/.test(reason)?reason:'REFRESH_PREFLIGHT_HELD',revision:r.sourceRefresh.revision+1};
      meta.put({key:'refresh-source:'+r.slug,record:r.sourceRefresh});
    }
    if(r.refresh.intent.purpose==='SINGLE_TEST'&&r.sourceRefresh&&!r.sourceRefresh.lastReceipt){
      r.sourceRefresh={...r.sourceRefresh,testAttempted:false,preview:null,revision:r.sourceRefresh.revision+1};
      meta.put({key:'refresh-source:'+r.slug,record:r.sourceRefresh});
    }
    r.refresh.intent=null;r.refresh.state=r.refresh.suspended?
      'VISIBILITY_SUSPENDED':r.refresh.lastSeenAt?'PRESENT':'UNOBSERVED';
    r.refresh.nextAttemptAt=Math.max(r.refresh.nextAttemptAt,now+MINUTE);
    return {ok:true,state:out,changes:[{code:'REFRESH_RESERVATION_ABORTED',scopeId:stableId}]};
  },{sync:true});
  const dispatchContext=(s,claim,now)=>{
    const r=s.rows.find(x=>x.stableId===claim?.stableId);
    if(!r||r.accountId!==claim.accountId||r.personaUid!==claim.personaUid||
      r.bindingVersion!==claim.bindingVersion||r.releaseFingerprint!==claim.releaseFingerprint||
      !r.ownerVerified||!r.releaseVerified||r.identityHeld||r.reviewHeld||
      r.listing!=='PUBLIC'||s.accounts[r.accountId]?.principalFingerprint!==claim.principalFingerprint||
      (!(claim.purpose==='SINGLE_TEST')&&(!r.slot||r.phase!=='ACTIVE'))||
      rowBlocks(s,r).filter(x=>!(claim.purpose==='SINGLE_TEST'&&x==='ACCOUNT_UNAVAILABLE')).length||
      (claim.plan&&(r.sourceRefresh?.consent?.revision!==claim.plan.consentRevision||
        r.sourceRefresh?.restoredHistorical||r.sourceRefresh?.effectiveCurrentFingerprint!==claim.plan.expectedPreSaveFingerprint||
        (claim.purpose==='RECURRING'&&(!r.sourceRefresh?.scheduleEnabled||r.sourceRefresh?.qualification?.validUntil<=now)))))
      return fail('REFRESH_CONTEXT_CHANGED');
    return {ok:true};
  };
  const markDispatch=(claim,now)=>mutate(null,s=>{
    const allowed=dispatchContext(s,claim,now);if(!allowed.ok)return allowed;
    const r=s.rows.find(x=>x.stableId===claim.stableId);
    const packet=dispatchPossible(r.refresh,claim.id,now);
    if(!packet.ok)return packet;
    const out=structuredClone(s);out.rows.find(x=>x.stableId===claim.stableId).refresh=packet.evidence;
    return {ok:true,state:out,changes:[{code:'REFRESH_DISPATCH_POSSIBLE',scopeId:claim.stableId}]};
  },{sync:true});
  const checkDispatch=(claim,now)=>mutate(null,s=>{
    const allowed=dispatchContext(s,claim,now);if(!allowed.ok)return allowed;
    const r=s.rows.find(x=>x.stableId===claim.stableId);
    if(r.refresh?.intent?.id!==claim.id||r.refresh.intent.state!=='DISPATCH_POSSIBLE')return fail('REFRESH_INTENT_STALE');
    return {ok:true,state:structuredClone(s)};
  },{sync:true});
  const settleAttempt=(stableId,id,receipt)=>mutate(null,(s,meta,tx)=>{
    const r=s.rows.find(x=>x.stableId===stableId);
    if(!r)return fail('REFRESH_TARGET_UNAVAILABLE');
    const packet=reconcileRefreshAttempt(r.refresh,id,receipt);
    if(!packet.ok)return packet;
    const out=structuredClone(s),row=out.rows.find(x=>x.stableId===stableId);
    row.refresh=packet.evidence;
    const prior=r.refresh.intent,last=row.refresh.history.at(-1);
    if(prior?.plan){
      last.allocationEpoch=prior.allocationEpoch;last.budgetAtSave=prior.budgetAtSave;
      last.attemptResult=receipt.attemptResult||{ack:'UNKNOWN'};
      const cfg=r.sourceRefresh;
      if(cfg){
        const next={...cfg,revision:cfg.revision+1,lastProof:last,
          ...(packet.effectVerified?{effectiveCurrentFingerprint:prior.plan.expectedPostSaveFingerprint,
            lastReceipt:last.marker}:{}),
          state:packet.effectVerified?(packet.feedState==='PRESENT'?'RECENT_PRESENT':
            packet.feedState==='ABSENT'?'RECENT_ABSENT':'SOURCE_CONFIRMED_RECENT_UNKNOWN'):
            packet.evidence.state==='INEFFECTIVE'?'SOURCE_SAVE_INEFFECTIVE':'HELD_UNCERTAIN'};
        if(!packet.effectVerified||packet.feedState!=='PRESENT')next.scheduleEnabled=false;
        meta.put({key:'refresh-source:'+r.slug,record:next});row.sourceRefresh=next;
        if(packet.effectVerified){
          // Immutable operation-keyed receipt: never rewrite earlier provenance.
          tx.objectStore('observations').add({id:'refresh_marker_'+id,...last.marker});
          tx.objectStore('events').add({stage:'PCMS_REFRESH_MARKER',...last.marker});
        }
      }
    }
    if(packet.evidence.suspended&&row.slot){
      row.slot=false;if(row.phase==='ACTIVE')row.phase='WAITING';
    }
    return {ok:true,state:out,proof:{effectVerified:packet.effectVerified,
      feedState:packet.feedState,effectState:packet.evidence.state},changes:[{code:packet.effectVerified?
      'REFRESH_EFFECT_PROVEN':'REFRESH_EFFECT_HELD',scopeId:stableId}]};
  },{sync:true});
  async function observeSourceRefresh(stableId,now,reader){
    const snapshot=await read();if(!snapshot.ok)return snapshot;
    const row=snapshot.state.rows.find(r=>r.stableId===stableId),cfg=row?.sourceRefresh;
    if(!row||!cfg)return fail('REFRESH_SOURCE_UNKNOWN');
    if(row.refresh.intent){
      const intent=row.refresh.intent;
      if(intent.state!=='DISPATCH_POSSIBLE')return fail('REFRESH_RESERVATION_PENDING');
      if(row.refresh.probes>=3||row.refresh.nextAttemptAt>now)return fail('REFRESH_READBACK_BACKOFF');
      const observed=await reader(intent);
      return settleAttempt(stableId,intent.id,{...observed,at:now});
    }
    if(cfg.lastProof?.effect!=='EFFECT_CONFIRMED'||(row.refresh.feedProbes||0)>=3||
      row.refresh.nextAttemptAt>now)return fail('RECENT_OBSERVATION_BACKOFF_OR_EXHAUSTED');
    const observed=await reader({id:cfg.lastProof.id,plan:cfg.lastReceipt});
    return mutate(null,(s,meta,tx)=>{
      const r=s.rows.find(x=>x.stableId===stableId),current=r?.sourceRefresh;
      if(!current||current.revision!==cfg.revision||r.refresh.intent)return fail('STALE_REFRESH_SOURCE');
      const out=structuredClone(s),target=out.rows.find(x=>x.stableId===stableId),e=target.refresh;
      e.feedProbes=(e.feedProbes||0)+1;e.nextAttemptAt=now+600000*2**e.feedProbes;
      const f=observed?.feed,valid=observed?.kind==='EFFECT_CHANGED'&&observed.targetMatched===true&&
        observed.principalMatched===true&&observed.sourceFingerprint===cfg.effectiveCurrentFingerprint&&
        f?.independent===true&&f.complete===true&&f.observedAt>=cfg.lastProof.dispatchAt&&
        f.observedAt>=cfg.lastProof.feed.at&&f.observedAt<=now+60000&&
        (f.present===false||f.present===true&&Number.isSafeInteger(f.rank)&&f.rank>0&&f.rank<=5000);
      const feed=valid?{state:f.present?'PRESENT':'ABSENT',at:f.observedAt,rank:f.present?f.rank:null}:
        {state:'UNKNOWN',at:0,rank:null};
      const last={...cfg.lastProof,feed};
      e.history=e.history.map(h=>h.id===last.id?last:h);
      e.suspended=feed.state!=='PRESENT';e.methodHold=e.suspended?'SOURCE_CONFIRMED_RECENT_'+feed.state:null;
      const next={...current,lastProof:last,revision:current.revision+1,
        state:feed.state==='PRESENT'?'RECENT_PRESENT':feed.state==='ABSENT'?'RECENT_ABSENT':'SOURCE_CONFIRMED_RECENT_UNKNOWN'};
      meta.put({key:'refresh-source:'+r.slug,record:next});target.sourceRefresh=next;
      tx.objectStore('events').add({stage:'REFRESH_FEED_OBSERVED',operationId:last.id,feed});
      return {ok:true,state:out,code:next.state,proof:{effectVerified:true,feedState:feed.state}};
    },{sync:true});
  }
  const resetRecentBackoff=(expectedRevision,now)=>mutate(expectedRevision,s=>{
    const out=structuredClone(s);out.recent.suspended=false;out.recent.failures=0;
    out.recent.nextDueAt=now+MINUTE;return {ok:true,state:out};
  });
  return Object.freeze({read,list,turn,changePolicy,pause,generatorPolicy,demand,claim,complete,
    reserveAttempt,cancelReserved,markDispatch,checkDispatch,settleAttempt,observeSourceRefresh,resetRecentBackoff});
}
