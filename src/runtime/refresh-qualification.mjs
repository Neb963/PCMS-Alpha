// Operator-assisted observation of an actual meaningful source update.
// No mutation or standing refresh permission is exposed by this module.
import {exactSource} from './staging-core.mjs';
import {fail} from './journal.mjs';
const key=slug=>'refresh-qualification:'+slug;
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const b64=s=>{let out='';const b=new TextEncoder().encode(s);for(let i=0;i<b.length;i+=8192)out+=String.fromCharCode(...b.subarray(i,i+8192));return btoa(out);};
export function createQualificationStore(db){
  const contextMatches=(a,g,r)=>a?.state==='VERIFIED'&&a.accountId===r.accountId&&
    a.personaUid===r.personaUid&&a.bindingVersion===r.bindingVersion&&
    a.identity?.source==='GUARDED_SESSION_READBACK'&&a.identity.bindingVersion===r.bindingVersion&&
    a.identity.principalFingerprint===r.before.principalFingerprint&&
    g?.accountId===r.accountId&&g.personaUid===r.personaUid&&g.bindingVersion===r.bindingVersion&&
    g.ownerState==='OBSERVED_OWNER'&&g.remoteId===r.before.remoteId;
  function transaction(mode,work){return new Promise((resolve,reject)=>{
    let result=fail('QUALIFICATION_TRANSACTION_INCOMPLETE');
    const tx=db.transaction(mode==='readonly'?['meta']:['meta','events'],mode);
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(Error('QUALIFICATION_DB_ABORTED'));
    work(tx,x=>{result=x;});
  });}
  const read=slug=>transaction('readonly',(tx,done)=>{
    tx.objectStore('meta').get(key(slug)).onsuccess=e=>done({ok:true,record:e.target.result?.record||null});
  });
  const release=slug=>transaction('readonly',(tx,done)=>{
    tx.objectStore('meta').get('release:'+slug).onsuccess=e=>done({ok:true,record:e.target.result?.release||null});
  });
  const put=(slug,expectedRevision,record)=>transaction('readwrite',(tx,done)=>{
    const m=tx.objectStore('meta');
    m.get('account:'+record.accountId).onsuccess=a=>{
    m.get('inventory:'+slug).onsuccess=g=>{
    if(!contextMatches(a.target.result?.account,g.target.result?.generator,record)){
      done(fail('QUALIFICATION_CONTEXT_CHANGED'));return;
    }
    m.get(key(slug)).onsuccess=e=>{
      const old=e.target.result?.record;
      if((old?.revision||0)!==expectedRevision){done(fail('STALE_QUALIFICATION'));return;}
      const next={...record,revision:expectedRevision+1};m.put({key:key(slug),record:next});
      tx.objectStore('events').add({stage:'REFRESH_QUALIFICATION_'+next.state,slug,
        operationId:next.id,sourceFingerprint:next.after?.fingerprint||next.before.fingerprint});
      done({ok:true,record:next});
    };};};
  });
  const verify=(row,account)=>transaction('readonly',(tx,done)=>{
    const m=tx.objectStore('meta');m.get('account:'+row.accountId).onsuccess=a=>{
      m.get('inventory:'+row.slug).onsuccess=g=>done({ok:true,valid:contextMatches(
        a.target.result?.account,g.target.result?.generator,{...row,
          before:{remoteId:row.remoteId,principalFingerprint:account.principalFingerprint}})});
    };
  });
  return {read,release,put,verify};
}
export function qualificationProjection(r){
  if(!r)return {state:'NOT_CONFIGURED',fleetEnabled:false,nextAction:'Capture baseline before a meaningful source update'};
  return {...r,fleetEnabled:false,method:'REVIEWED_SOURCE_UPDATE',
    nextAction:r.state==='READY_FOR_OPERATOR_UPDATE'?
      'Use the existing update workflow, independently test F, then review and publish exact F':
      r.state==='RECENT_PRESENCE_OBSERVED'?
      'Retain evidence for independent H-04 review; no recurring refresh authority is granted':
      'Observe saved source and recent list again; never repeat a possibly dispatched update'};
}
export function evaluateQualification(before,after,release){
  const changed=hex(after?.fingerprint)&&after.fingerprint!==before.fingerprint;
  const confirmed=changed&&after.visibility==='PUBLIC'&&release?.state==='CONFIRMED_PUBLIC'&&
    release.source==='INDEPENDENT_PUBLICATION_READBACK'&&release.dispatchPossible===true&&
    release.sourceFingerprint===after.fingerprint&&release.observedAt>=before.observedAt&&
    release.approval?.previousFingerprint===before.fingerprint&&
    release.approval?.remotePublicId===before.remoteId&&
    release.approval?.principalFingerprint===before.principalFingerprint;
  const fresh=after?.feed?.complete===true&&after.feed.observedAt>=after.observedAt&&
    after.feed.observedAt-after.observedAt<=60000;
  return {state:confirmed?(fresh&&after.feed.present?'RECENT_PRESENCE_OBSERVED':'EFFECT_CONFIRMED'):
    changed?'UNVERIFIED_UPDATE':'READY_FOR_OPERATOR_UPDATE',
    persistedChange:changed,approvedEffectConfirmed:confirmed,
    recentPresenceObserved:confirmed&&fresh&&after.feed.present===true,
    // Correlation is not a provider guarantee, nor evidence of permissibility
    // of repeated saves or ranking manipulation.
    causationProven:false,releaseId:confirmed?release.releaseId:null,
    action:confirmed?{releaseId:release.releaseId,dispatchPossible:true,
      result:release.actionResult||{ack:'UNKNOWN',code:'HISTORICAL_RESULT_UNAVAILABLE'},
      independentlyConfirmedAt:release.observedAt}:null};
}
export function createRefreshQualification({store,guard,verify=async()=>true,clock=Date.now,newId=()=>crypto.randomUUID().replaceAll('-','')}){
  async function observe(row,account){
    const g=guard(),route=await g?.getSafeRouteReadiness(row.personaUid);
    if(!route?.ready)return fail(route?.code||'PROTECTED_ROUTE_REQUIRED');
    const observedAt=clock(),raw=await g.observeReadOnly(row.personaUid,false,row.slug),o=raw?.original;
    if(!raw?.ok||raw.principalFingerprint!==account.principalFingerprint||
      o?.ownerResult!=='IS_OWNER'||o.remotePublicId!==row.remoteId||
      typeof o.pjs!=='string'||typeof o.html!=='string'||!Array.isArray(o.assets)||
      !['PUBLIC','UNLISTED'].includes(o.visibility))return fail('QUALIFICATION_OWNER_OR_TARGET_CHANGED');
    const source=await exactSource([{path:'main.pjs',base64:b64(o.pjs)},
      {path:'index.html',base64:b64(o.html)},...o.assets]);
    if(!source.ok)return source;
    let feed={complete:false,present:null,rank:null,observedAt:clock(),code:'RECENT_UNAVAILABLE'};
    try {
      const recent=await g.observeMonitoring(row.personaUid,{kind:'RECENT'});
      if(recent?.ok&&recent.principalFingerprint===account.principalFingerprint&&
        recent.complete===true&&Array.isArray(recent.items)&&recent.items.length<=5000&&
        new Set(recent.items.map(x=>x.slug)).size===recent.items.length&&
        recent.items.every(x=>typeof x.slug==='string'&&/^[a-z0-9][a-z0-9-]{0,99}$/.test(x.slug))){
        const rank=recent.items.findIndex(x=>x.slug===row.slug)+1;
        feed={complete:true,present:rank>0,rank:rank||null,observedAt:clock(),code:'INDEPENDENT_RECENT_LIST'};
      } else feed.code=recent?.code==='RATE_LIMITED'?'RATE_LIMITED':'RECENT_UNVERIFIED';
    } catch { /* Persisted-source proof is separate from feed availability. */ }
    const after=await g.getSafeRouteReadiness(row.personaUid);
    if(!after?.ready||after.routeId!==route.routeId||after.cookieStoreId!==route.cookieStoreId)
      return fail('QUALIFICATION_ROUTE_CHANGED');
    return {ok:true,evidence:{fingerprint:source.fingerprint,remoteId:row.remoteId,
      principalFingerprint:account.principalFingerprint,visibility:o.visibility,observedAt,feed}};
  }
  async function run(type,{row,account,confirmation,expectedRevision=0}){
    if(!['GET_QUALIFICATION','BEGIN_QUALIFICATION','OBSERVE_QUALIFICATION'].includes(type))return fail('QUALIFICATION_COMMAND_INVALID');
    if(!row?.ownerVerified||row.identityHeld||!account?.verifiedIdentity||
      !hex(account.principalFingerprint)||row.personaUid!==account.personaUid)
      return fail('QUALIFICATION_VERIFIED_ACCOUNT_REQUIRED');
    const old=await store.read(row.slug);if(!old.ok)return old;
    if(type==='GET_QUALIFICATION')return {ok:true,qualification:qualificationProjection(old.record)};
    if((old.record?.revision||0)!==expectedRevision)return fail('STALE_QUALIFICATION');
    if(old.record&&clock()<(old.record.nextObserveAt||0))return fail('QUALIFICATION_BACKOFF');
    if(type==='BEGIN_QUALIFICATION'&&confirmation!=='OBSERVE '+row.slug)
      return fail('QUALIFICATION_EXACT_CONFIRMATION_REQUIRED');
    if(type==='BEGIN_QUALIFICATION'&&old.record)return fail('QUALIFICATION_BASELINE_ALREADY_CAPTURED');
    if(type==='OBSERVE_QUALIFICATION'&&!old.record)return fail('QUALIFICATION_BASELINE_REQUIRED');
    if(old.record&&(old.record.accountId!==row.accountId||old.record.personaUid!==row.personaUid||
      old.record.bindingVersion!==row.bindingVersion||old.record.before.remoteId!==row.remoteId||
      old.record.before.principalFingerprint!==account.principalFingerprint))return fail('QUALIFICATION_CONTEXT_CHANGED');
    if(!(await verify()))return fail('QUALIFICATION_CONTEXT_CHANGED');
    const read=await observe(row,account);if(!read.ok)return read;
    if(type==='BEGIN_QUALIFICATION'&&read.evidence.visibility!=='PUBLIC')return fail('QUALIFICATION_PUBLIC_BASELINE_REQUIRED');
    const release=await store.release(row.slug);if(!release.ok)return release;
    const record=old.record?{...old.record,after:read.evidence,
      ...evaluateQualification(old.record.before,read.evidence,release.record)}:
      {id:newId(),slug:row.slug,accountId:row.accountId,personaUid:row.personaUid,
        bindingVersion:row.bindingVersion,before:read.evidence,state:'READY_FOR_OPERATOR_UPDATE'};
    record.nextObserveAt=clock()+(read.evidence.feed.code==='RATE_LIMITED'?600000:60000);
    if(!(await verify()))return fail('QUALIFICATION_CONTEXT_CHANGED');
    const saved=await store.put(row.slug,expectedRevision,record);
    return saved.ok?{ok:true,qualification:qualificationProjection(saved.record)}:saved;
  }
  return {run};
}
