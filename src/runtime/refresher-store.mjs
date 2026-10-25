// One revision-fenced canonical scheduler snapshot, with a durable sorted due
// index, in the existing PCMS DB. All async IO occurs outside transactions.
import {fail,isSafeId} from './journal.mjs';
import {qualifyRecentAbsence,countObservedOccupancy} from './refresher-admission.mjs';
import {emptyRefreshEvidence,observeRefreshPresence,reserveRefreshAttempt,
  dispatchPossible,reconcileRefreshAttempt} from './refresher-effect-core.mjs';
import {REFRESHER_KEY,emptyShadow,validShadow,reconcileShadow,advanceShadow,
  effectiveCapacity,rowBlocks,queueOrder,validatePolicy,claimObservation,
  applyStatistic,observeCapacity,MINUTE} from './refresher-core.mjs';
const slugOK=s=>typeof s==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(s);
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);

function transact(db,mode,fn){
  return new Promise((resolve,reject)=>{
    let tx,result=fail('REFRESHER_TRANSACTION_INCOMPLETE');
    try{tx=db.transaction(mode==='readonly'?['meta']:['meta','events'],mode);}
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
  const accounts=new Map(),stages=new Map(),releases=new Map(),links=new Map(),updates=new Map(),adoptions=new Map(),readyRows=new Map(),inventory=[];
  for(const record of records){
    const k=record?.key;
    if(typeof k!=='string')continue;
    if(k.startsWith('s05-ready:')&&record.record)readyRows.set(record.record.slug,record.record);
    if(k.startsWith('account:')&&record.account)accounts.set(record.account.accountId,record.account);
    if(k.startsWith('inventory:')&&record.generator)inventory.push(record.generator);
    if(k.startsWith('stage:')&&record.record)stages.set(record.record.slug,record.record);
    if(k.startsWith('release:')&&record.release)releases.set(record.release.slug,record.release);
    if(k.startsWith('source-link:')&&record.link)links.set(record.link.slug,record.link);
    if(k.startsWith('existing-update:')&&record.record)updates.set(record.record.slug,record.record);
    if(k.startsWith('adoption:')&&record.adoption)adoptions.set(record.adoption.slug,record.adoption);
  }
  return inventory.map(row=>{
    const a=accounts.get(row.accountId),release=releases.get(row.slug),stage=stages.get(row.slug),
      link=links.get(row.slug),update=updates.get(row.slug),adopt=adoptions.get(row.slug),ready=readyRows.get(row.slug);
    const accountVerified=a?.state==='VERIFIED'&&a.identity?.source==='GUARDED_SESSION_READBACK'&&
      a.identity.bindingVersion===a.bindingVersion&&hex(a.identity.principalFingerprint);
    const matched=accountVerified&&a.personaUid===row.personaUid&&a.bindingVersion===row.bindingVersion;
    const released=matched&&release?.state==='CONFIRMED_PUBLIC'&&
      release.source==='INDEPENDENT_PUBLICATION_READBACK'&&release.accountId===a.accountId&&
      release.personaUid===a.personaUid&&release.bindingVersion===a.bindingVersion&&
      release.remoteId===row.remoteId&&release.principalFingerprint===a.identity.principalFingerprint&&
      hex(release.sourceFingerprint)&&isSafeId(release.observationId)&&
      Number.isSafeInteger(release.observedAt)&&release.observedAt>0;
    // I07 original's immutable full bytes are sealed using the shared
    // staging fingerprint (different domain from its original-archive hash).
    // Never turn an unverified inventory/public label alone into source
    // admission. The guarded writer independently rereads owner/source
    // before every actual save and blocks a dirty or changed public source.
    const original=adopt?.original;
    const adopted=matched&&!!adopt&&row.ownerState==='OBSERVED_OWNER'&&
      row.visibility==='PUBLIC'&&!adopt.archived&&
      adopt.accountId===row.accountId&&adopt.personaUid===row.personaUid&&
      adopt.bindingVersion===row.bindingVersion&&
      adopt.remotePublicId===row.remoteId&&
      adopt.principalFingerprint===a.identity.principalFingerprint&&
      original?.ok===true&&original.source==='INDEPENDENT_FULL_BYTE_READBACK'&&
      original.remotePublicId===row.remoteId&&original.visibility==='PUBLIC'&&
      original.sourceStage==='PCMS_STAGED_SOURCE_V1'&&
      hex(original.stagedFingerprint)&&
      Array.isArray(original.blobs)&&original.blobs.length>=2&&
      original.files?.length===original.blobs.length&&
      adopt.archiveState!=='DISPATCH_POSSIBLE'&&
      adopt.archiveState!=='HELD_UNCERTAIN';
    const approvedSource=released||adopted;
    return {slug:row.slug,accountId:row.accountId,remoteId:row.remoteId,
      updateNowCandidate:ready&&(!ready.hold||ready.hold==='WAIT_FOR_SAFE_SOURCE_HANDOFF')?(ready.desired||ready.active||null):null,
      updateNowComplete:!!(update?.state==='STAGE_CONFIRMED'&&released&&update.stagedFingerprint===release.sourceFingerprint&&release.approval?.stageRevision===stage?.revision),
      sourceAuthority:released?'INDEPENDENT_PUBLICATION_READBACK':
        adopted?'ADOPTED_FULL_ORIGINAL_READBACK':'UNVERIFIED',
      personaUid:a?.personaUid||row.personaUid,bindingVersion:a?.bindingVersion||row.bindingVersion,
      ownerVerified:matched&&row.ownerState==='OBSERVED_OWNER',accountVerified:!!accountVerified,
      principalFingerprint:a?.identity?.principalFingerprint||null,
      releaseVerified:!!approvedSource,releaseFingerprint:released?release.sourceFingerprint:
        adopted?original.stagedFingerprint:null,
      listing:row.visibility,observedAt:row.lastObservedAt,
      // A confirmed, byte-exact final F closes the staged B->F review
      // without requiring B to equal F after AI edits. An interrupted
      // existing update remains held until final listing is confirmed.
      reviewHeld:(!!update&&!(
        update.state==='RESTORE_CONFIRMED'||(
          update.state==='STAGE_CONFIRMED'&&released&&
          update.stagedFingerprint===release.sourceFingerprint
        )))||!!stage&&stage.state!=='HUMAN_OWNED'&&!released,
      readyUpdate:link?.readyUpdate===true||!!approvedSource&&link?.readyAtInspection===true&&
        link.fingerprint!==(released?release.sourceFingerprint:original?.stagedFingerprint)};
  });
}
function project(s,now,{query='',accountId='',phase='ALL',offset=0,limit=25}={}){
  const phaseMatch=r=>{
    if(phase==='ALL')return true;
    if(phase==='HELD')return r.paused===true||rowBlocks(s,r).length>0;
    if(phase==='INELIGIBLE')
      return r.phase==='WAITING'&&(rowBlocks(s,r).length>0||r.readyUpdate===true);
    return r.phase===phase;
  };
  const match=s.rows.filter(r=>(!query||r.slug.includes(query.toLowerCase())||
    r.accountId.includes(query.toLowerCase())||r.stableId.includes(query))&&
    (!accountId||r.accountId===accountId)&&phaseMatch(r)).sort(queueOrder);
  const items=match.slice(offset,offset+limit).map(r=>({stableId:r.stableId,slug:r.slug,
    accountId:r.accountId,sourceAuthority:r.sourceAuthority||'UNVERIFIED',
    phase:r.phase,activeRemaining:r.activeRemaining,sleepRemaining:r.sleepRemaining,
    activeMs:r.activeMs,sleepMs:r.sleepMs,ordinal:r.ordinal,slot:r.slot,paused:r.paused,
    blockers:[...rowBlocks(s,r),r.readyUpdate&&'READY_UPDATE_FIRST'].filter(Boolean),
    presence:r.presence?{...r.presence,stale:r.presence.observedAt>now||now-r.presence.observedAt>2*s.policy.recentMs}:null,
    statisticSuspended:r.metrics.suspended===true,
    refresh:{state:r.refresh?.state||'UNOBSERVED',
      awaitingVisibility:r.refresh?.awaitingVisibility===true,
      misses:r.refresh?.misses||0,
      attempts:r.refresh?.attempts||0,suspended:r.refresh?.suspended===true,
      nextAttemptAt:r.refresh?.nextAttemptAt||0,
      proof:r.refresh?.history?.at(-1)||null},
    metric:r.metrics.latest?{...r.metrics.latest,stale:r.metrics.latest.observedAt>now||now-r.metrics.latest.observedAt>
      s.policy.statsMaxMs}:null,nextStatisticAt:r.metrics.nextDueAt}));
  return {ok:true,revision:s.revision,
    mode:s.policy.refreshEnabled===true?'GUARDED_REFRESH_ENABLED':'SHADOW_ONLY',
    providerEffects:s.policy.refreshEnabled===true?'OPERATOR_OPT_IN_GATED':'OFF',items,
    total:match.length,occupied:s.rows.filter(r=>r.slot).length,
    eligible:s.rows.filter(r=>r.phase==='WAITING'&&!rowBlocks(s,r).length&&!r.readyUpdate).length,
    visibilitySuspended:s.rows.filter(r=>r.refresh?.suspended).length,
    capacity:effectiveCapacity(s,now),provider:s.provider,globalPause:s.globalPause,
    accounts:Object.entries(s.accounts).map(([id,a])=>({accountId:id,paused:a.paused,
      health:a.health,graceUsed:a.graceUsed})),policy:s.policy,
    recent:{observedAt:s.recent.observedAt,total:s.recent.total,complete:s.recent.complete,
      latestOccupancy:s.recent.latestOccupancy||null,observedSampleCount:(s.recent.samples||[]).length,
      coverage:s.recent.complete===true?'COMPLETE':'UNKNOWN',
      lastUnknownAt:s.recent.lastUnknownAt||0,
      suspended:s.recent.suspended===true,
      endpointBackoffUntil:s.recent.endpointBackoffUntil||0,
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
            const out=fn(merged.state);
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
          if(typeof c.key==='string'&&/^(account|inventory|stage|release|adoption|source-link|existing-update):/.test(c.key))
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
      const occupancy=countObservedOccupancy(out.rows,packet.items,c.startedAt);
      if(!occupancy.ok)return fail(occupancy.code);
      out.recent.samples=[...(out.recent.samples||[]),occupancy.sample].slice(-144);
      out.recent.latestOccupancy=occupancy.sample;
      const ranks=new Map(packet.items.map((item,i)=>[item.slug,{...item,position:i+1}]));
      for(const r of out.rows){
        const item=ranks.get(r.slug);
        r.presence={present:!!item,position:item?.position||null,observedAt:c.startedAt,
          source:'GUARDED_RECENT_LIST',absence:'NOT_A_DELETION'};
        const owner=out.accounts[r.accountId];
        const healthy=r.ownerVerified&&r.releaseVerified&&r.listing==='PUBLIC'&&
          !r.reviewHeld&&!r.identityHeld&&owner?.verifiedIdentity===true&&
          // A validated full public-feed read is itself positive provider
          // evidence. Do not require an unrelated two-exit outage quorum or
          // an already-qualified clock before recording the observed rank.
          // Effects still require the target's own protected route later.
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
        principalFingerprint:c.principalFingerprint,
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
      // A later failed, partial, malformed, or rate-limited recent-list
      // observation supersedes the *authority* of the last full feed. Keep
      // its historical occupancy sample for diagnostics, but never dispatch
      // a marker from the previous absence while the current feed is UNKNOWN.
      // An older delayed failure cannot supersede a newer complete snapshot.
      if(c.kind==='RECENT'&&c.startedAt>out.recent.observedAt){
        out.recent.complete=false;
        out.recent.lastUnknownAt=now;
        clockChanges.push({code:'RECENT_COVERAGE_UNKNOWN',scopeId:c.accountId});
      }
      // The public RECENT endpoint is shared. Unknown-scope 429 is an
      // endpoint-wide cooldown: never switch identity/route to evade it.
      // Other request classes continue under their existing budgets.
      const endpointRateLimit=c.kind==='RECENT'&&packet?.code==='RATE_LIMITED';
      if(endpointRateLimit){
        const requested=Number.isSafeInteger(packet.retryAfterMs)&&packet.retryAfterMs>0?
          packet.retryAfterMs:out.policy.recentMs;
        const until=now+Math.min(24*60*MINUTE,Math.max(MINUTE,requested));
        out.recent.endpointBackoffUntil=Math.max(
          out.recent.endpointBackoffUntil||0,until);
        out.recent.nextDueAt=Math.max(out.recent.nextDueAt,until);
      }else{
        const obj=c.kind==='RECENT'?out.recent:out.rows.find(r=>r.stableId===c.stableId)?.metrics;
        if(obj){obj.failures=Math.min(8,obj.failures+1);obj.suspended=obj.failures>=8;
          const floor=c.kind==='RECENT'?out.policy.recentMs:out.policy.statsMinMs;
          obj.nextDueAt=now+Math.max(Math.min(24*60*MINUTE,floor*2**obj.failures),
            Math.min(24*60*MINUTE,Math.max(0,packet?.retryAfterMs||0)));
        }
      }
    }
    return {ok:true,state:out,accepted,changes:clockChanges,code:accepted?'OBSERVED':'OBSERVATION_HELD'};
  },{sync:true});
  // Single canonical transaction for each step. A crash after possible
  // dispatch is never treated as permission to repeat a provider effect.
  const reserveAttempt=({stableId,id,now,candidate,liveAuthorized})=>mutate(null,s=>{
    const r=s.rows.find(x=>x.stableId===stableId);
    if(!r||r.phase!=='ACTIVE'||!r.slot||rowBlocks(s,r).length)
      return fail('REFRESH_ADMISSION_HELD');
    const absence=qualifyRecentAbsence({row:r,recent:s.recent,policy:s.policy,now});
    if(!absence.ok)return fail(absence.code);
    const currentSource=r.refresh?.savedSourceFingerprint||r.releaseFingerprint;
    const attempt=reserveRefreshAttempt(r.refresh,{id,at:now,slug:r.slug,
      sourceFingerprint:currentSource,candidate,eligible:true,liveAuthorized});
    if(!attempt.ok)return attempt;
    const out=structuredClone(s);
    out.rows.find(x=>x.stableId===stableId).refresh=attempt.evidence;
    return {ok:true,state:out,claim:{id,stableId,slug:r.slug,accountId:r.accountId,
      personaUid:r.personaUid,bindingVersion:r.bindingVersion,
      principalFingerprint:s.accounts[r.accountId]?.principalFingerprint,
      remoteId:r.remoteId,markerId:attempt.evidence.intent?.markerId||null,
      nonce:attempt.evidence.intent?.nonce||null,
      releaseFingerprint:r.releaseFingerprint,sourceFingerprint:currentSource,
      targetFingerprint:attempt.evidence.intent?.targetFingerprint||null},
      changes:[{code:'REFRESH_RESERVED',scopeId:stableId}]};
  },{sync:true});
  const cancelReserved=(stableId,id,now)=>mutate(null,s=>{
    const row=s.rows.find(r=>r.stableId===stableId);
    if(!row||row.refresh?.intent?.id!==id||
      row.refresh.intent.state!=='RESERVED')return fail('REFRESH_RESERVATION_NOT_CANCELABLE');
    const out=structuredClone(s),r=out.rows.find(x=>x.stableId===stableId);
    r.refresh.intent=null;r.refresh.state=r.refresh.suspended?
      'VISIBILITY_SUSPENDED':r.refresh.lastSeenAt?'PRESENT':'UNOBSERVED';
    r.refresh.nextAttemptAt=Math.max(r.refresh.nextAttemptAt,now+MINUTE);
    return {ok:true,state:out,changes:[{code:'REFRESH_RESERVATION_ABORTED',scopeId:stableId}]};
  },{sync:true});
  const markDispatch=(claim,now)=>mutate(null,s=>{
    const r=s.rows.find(x=>x.stableId===claim?.stableId);
    if(!r||r.remoteId!==claim.remoteId||r.accountId!==claim.accountId||
      r.personaUid!==claim.personaUid||
      r.bindingVersion!==claim.bindingVersion||r.releaseFingerprint!==claim.releaseFingerprint||
      (r.refresh?.savedSourceFingerprint||r.releaseFingerprint)!==claim.sourceFingerprint||
      r.refresh?.intent?.targetFingerprint!==(
        claim.targetFingerprint||undefined)||
      (r.refresh?.intent?.markerId||null)!==(claim.markerId||null)||
      (r.refresh?.intent?.nonce||null)!==(claim.nonce||null)||
      !r.ownerVerified||!r.releaseVerified||r.identityHeld||r.reviewHeld||
      r.listing!=='PUBLIC'||s.accounts[r.accountId]?.principalFingerprint!==claim.principalFingerprint||
      !r.slot||r.phase!=='ACTIVE'||rowBlocks(s,r).length||
      // The durable operator setting is authoritative *at the final effect
      // boundary*. An earlier optimistic read cannot survive a concurrent OFF.
      s.policy.refreshEnabled!==true)
      return fail('REFRESH_CONTEXT_CHANGED');
    const absence=qualifyRecentAbsence({row:r,recent:s.recent,policy:s.policy,now,
      reservedId:claim.id});
    if(!absence.ok)return fail(absence.code);
    const packet=dispatchPossible(r.refresh,claim.id,now);
    if(!packet.ok)return packet;
    const out=structuredClone(s);out.rows.find(x=>x.stableId===claim.stableId).refresh=packet.evidence;
    return {ok:true,state:out,changes:[{code:'REFRESH_DISPATCH_POSSIBLE',scopeId:claim.stableId}]};
  },{sync:true});
  const settleAttempt=(stableId,id,receipt)=>mutate(null,s=>{
    const r=s.rows.find(x=>x.stableId===stableId);
    if(!r)return fail('REFRESH_TARGET_UNAVAILABLE');
    const packet=reconcileRefreshAttempt(r.refresh,id,receipt);
    if(!packet.ok)return packet;
    const out=structuredClone(s),row=out.rows.find(x=>x.stableId===stableId);
    row.refresh=packet.evidence;
    if(packet.evidence.suspended&&row.slot){
      row.slot=false;if(row.phase==='ACTIVE')row.phase='WAITING';
    }
    return {ok:true,state:out,proof:{effectVerified:packet.effectVerified,
      feedState:packet.feedState},changes:[{code:packet.effectVerified?
      'REFRESH_EFFECT_PROVEN':'REFRESH_EFFECT_HELD',scopeId:stableId}]};
  },{sync:true});
  const resetRecentBackoff=(expectedRevision,now)=>mutate(expectedRevision,s=>{
    const out=structuredClone(s);out.recent.suspended=false;out.recent.failures=0;
    out.recent.nextDueAt=now+MINUTE;return {ok:true,state:out};
  });
  return Object.freeze({read,list,turn,changePolicy,pause,generatorPolicy,demand,claim,complete,
    reserveAttempt,cancelReserved,markDispatch,settleAttempt,resetRecentBackoff});
}
