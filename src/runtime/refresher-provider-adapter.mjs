// Production bridge. No injected writer, browser controller or UI proof flags.
// The donor owns the tab and holds the one lease across preflight -> durable
// mark -> fixed native save. Saved bytes and recent feed are independent reads.
import {fail} from './journal.mjs';
import {exactSource} from './staging-core.mjs';
import {createRefreshSourceStore} from './refresh-source-store.mjs';
import {MARKER_POLICY,REFRESH_METHOD,prepareMarker,encodeText,validMarkerPlan,hex,opId} from './refresh-marker.mjs';
import {publicReviewKey,digestReview,verifyRefreshReview} from './refresh-review.mjs';
import {measureRefreshResources} from './refresh-resource.mjs';
const sameRoute=(a,b)=>a?.ready&&b?.ready&&a.cookieStoreId===b.cookieStoreId&&
  a.routeId===b.routeId&&a.healthDomain===b.healthDomain;
const key='refresh-reviewer:v1',resourceKey='refresh-resource:v1';
export const SOURCE_REFRESH_COMMANDS=new Set(['GET_SOURCE_REFRESH','PREVIEW_SOURCE_REFRESH',
  'GET_REFRESH_REVIEW_CHALLENGE','CONSENT_SOURCE_REFRESH','TEST_SOURCE_REFRESH','OBSERVE_SOURCE_REFRESH','TRUST_REFRESH_REVIEWER',
  'MEASURE_REFRESH_RESOURCES','IMPORT_REFRESH_REVIEW','SET_REFRESH_SCHEDULE','REVOKE_REFRESH_REVIEW']);
const safeId=s=>typeof s==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(s)?s:null;
const safeTime=n=>Number.isSafeInteger(n)&&n>=0?n:0;
const safeHash=s=>hex(s)?s:null;
const receiptCodes=new Set(['UNKNOWN','METHOD_NOT_CONFIGURED','TEST_READY','RESERVED','HELD_UNCERTAIN',
  'RECENT_PRESENT','RECENT_ABSENT','RECENT_UNKNOWN','RATE_LIMITED','SOURCE_CONFIRMED_RECENT_UNKNOWN',
  'SOURCE_CONFIRMED_RECENT_ABSENT','SOURCE_SAVE_INEFFECTIVE','FLEET_READY','SCHEDULE_PAUSED',
  'QUALIFICATION_REVOKED','RESTORE_REVIEW_REQUIRED','PREFLIGHT_HELD','EFFECT_CONFIRMED','INEFFECTIVE',
  'EFFECT_UNVERIFIED','DISPATCH_POSSIBLE','REFRESH_SAVE_ACK_ONLY','REFRESH_SAVE_ACK_LOST','REFRESH_PROVIDER_REFUSED',
  'REFRESH_NATIVE_RESPONSE_LOST','REFRESH_POST_SAVE_GUARD_CHANGED','REFRESH_INJECTION_UNVERIFIED',
  'REFRESH_EXECUTOR_UNKNOWN','REFRESH_FINAL_ADMISSION_CHANGED','REFRESH_OUTCOME_UNKNOWN','SAVE_ACK_ONLY',
  'HUMAN_OR_AMBIGUOUS_EDITOR','REFRESH_EDITOR_DIRTY_OR_UNVERIFIED','REFRESH_PRE_SAVE_CONTEXT_CHANGED',
  'REFRESH_LEASE_REVOKED','REFRESH_PLAN_OR_SOURCE_CHANGED','REFRESH_ROUTE_CHANGED','REFRESH_QUALIFICATION_REVOKED',
  'REFRESH_SOURCE_CONSENT_REQUIRED','REFRESH_PRE_SAVE_GUARD_CHANGED','REFRESH_CONTEXT_CHANGED','RESTORE_HOLD',
  'REFRESH_STORAGE_PRESSURE','REFRESH_PREFLIGHT_HELD']);
const safeCode=s=>receiptCodes.has(s)?s:'UNKNOWN';
export function projectMarkerPlan(p){
  if(!validMarkerPlan(p))return null;
  const {policy,anchor,operationId,sequence,consentRevision,approvedBaseFingerprint,
    expectedPreSaveFingerprint,expectedPostSaveFingerprint,beforeMarker,afterMarker}=p;
  return {policy,anchor,operationId,sequence,consentRevision:safeTime(consentRevision),approvedBaseFingerprint,
    expectedPreSaveFingerprint,expectedPostSaveFingerprint,beforeMarker,afterMarker};
}
function projectMarker(m){
  if(m?.source!=='PCMS_REFRESH_MARKER'||m.policy!==MARKER_POLICY||!opId(m.operationId)||
    !hex(m.approvedBaseFingerprint)||!hex(m.effectiveCurrentFingerprint))return null;
  return {source:'PCMS_REFRESH_MARKER',policy:MARKER_POLICY,anchor:'HTML_BYTE_ZERO',operationId:m.operationId,
    sequence:safeTime(m.sequence),consentRevision:safeTime(m.consentRevision),
    approvedBaseFingerprint:m.approvedBaseFingerprint,expectedPreSaveFingerprint:safeHash(m.expectedPreSaveFingerprint),
    expectedPostSaveFingerprint:safeHash(m.expectedPostSaveFingerprint),effectiveCurrentFingerprint:m.effectiveCurrentFingerprint,
    observedAt:safeTime(m.observedAt)};
}
export function sourceRefreshProjection(r){
  if(!r)return {revision:0,state:'METHOD_NOT_CONFIGURED',method:REFRESH_METHOD,policy:MARKER_POLICY};
  const proof=r.lastProof,marker=projectMarker(proof?.marker),feed=proof?.feed,q=r.qualification;
  // Strict allowlist even for malformed/corrupt/restored records. Never copy
  // a raw proof/plan/qualification into the shareable diagnostic receipt.
  return {revision:safeTime(r.revision),state:safeCode(r.state||'TEST_READY'),method:REFRESH_METHOD,policy:MARKER_POLICY,
    lastHold:r.lastHold?safeCode(r.lastHold):null,slug:safeId(r.slug),accountId:safeId(r.accountId),
    personaUid:safeId(r.personaUid),bindingVersion:safeTime(r.bindingVersion),
    approvedBaseFingerprint:safeHash(r.approvedBaseFingerprint),effectiveCurrentFingerprint:safeHash(r.effectiveCurrentFingerprint),
    consentRevision:safeTime(r.consent?.revision),testAttempted:r.testAttempted===true,
    scheduleEnabled:r.scheduleEnabled===true,restoredHistorical:r.restoredHistorical===true,
    preview:r.preview?{plan:projectMarkerPlan(r.preview.plan),expiresAt:safeTime(r.preview.expiresAt),
      consented:r.preview.consented===true,beforeFeed:{complete:r.preview.beforeFeed?.complete===true,
        present:typeof r.preview.beforeFeed?.present==='boolean'?r.preview.beforeFeed.present:null,
        rank:safeTime(r.preview.beforeFeed?.rank)||null,observedAt:safeTime(r.preview.beforeFeed?.observedAt),
        code:safeCode(r.preview.beforeFeed?.code)}}:null,
    proof:proof?{id:safeId(proof.id),at:safeTime(proof.at),dispatchAt:safeTime(proof.dispatchAt),
      methodVersion:proof.methodVersion===MARKER_POLICY?MARKER_POLICY:'UNKNOWN',effect:safeCode(proof.effect),marker,
      allocationEpoch:safeTime(proof.allocationEpoch),budgetAtSave:safeTime(proof.budgetAtSave),
      attemptResult:{ack:proof.attemptResult?.ack==='ACK_ONLY'?'ACK_ONLY':'UNKNOWN',code:safeCode(proof.attemptResult?.code)},
      feed:{state:['PRESENT','ABSENT'].includes(feed?.state)?feed.state:'UNKNOWN',at:safeTime(feed?.at),rank:safeTime(feed?.rank)||null}}:null,
    qualification:q&&q.method===REFRESH_METHOD&&q.policy===MARKER_POLICY?{
      method:REFRESH_METHOD,policy:MARKER_POLICY,evidenceId:safeId(q.evidenceId),reviewDigest:safeHash(q.reviewDigest),
      reviewerFingerprint:safeHash(q.reviewerFingerprint),resourceDigest:safeHash(q.resourceDigest),
      minimumIntervalMs:safeTime(q.minimumIntervalMs),validUntil:safeTime(q.validUntil),
      approvedBaseFingerprint:safeHash(q.approvedBaseFingerprint),reviewedAt:safeTime(q.reviewedAt)}:null};
}
export function createRefresherProviderAdapter(api,{database,guard,sentinel,clock=Date.now,
  newId=()=>crypto.randomUUID().replaceAll('-','')}={}){
  const sourceStore=async()=>createRefreshSourceStore(await database());
  async function observeSource(claim){
    const g=guard(),before=await g?.getSafeRouteReadiness(claim.personaUid);
    if(!before?.ready)return fail(before?.code||'PROTECTED_ROUTE_REQUIRED');
    const raw=await g.observeReadOnly(claim.personaUid,false,claim.slug),o=raw?.original;
    if(!raw?.ok)return fail(/^[A-Z0-9_]{1,80}$/.test(raw?.code||'')?raw.code:'REFRESH_OBSERVER_UNVERIFIED');
    if(raw.principalFingerprint!==claim.principalFingerprint||o?.ownerResult!=='IS_OWNER'||
      o.remotePublicId!==claim.remoteId||o.visibility!=='PUBLIC'||typeof o.pjs!=='string'||
      typeof o.html!=='string'||!Array.isArray(o.assets))return fail('REFRESH_OWNER_SOURCE_OR_LISTING_CHANGED');
    const source=await exactSource([{path:'main.pjs',base64:encodeText(o.pjs)},
      {path:'index.html',base64:encodeText(o.html)},...o.assets]);
    if(!source.ok)return source;
    if(!sameRoute(before,await g.getSafeRouteReadiness(claim.personaUid)))return fail('REFRESH_ROUTE_CHANGED');
    return {ok:true,source,observedAt:clock(),route:before};
  }
  async function observeFeed(claim){
    const g=guard(),before=await g?.getSafeRouteReadiness(claim.personaUid),start=clock();
    let packet;try{packet=await g.observeMonitoring(claim.personaUid,{kind:'RECENT'});}catch{}
    const after=await g?.getSafeRouteReadiness(claim.personaUid),at=clock();
    if(!sameRoute(before,after)||!packet?.ok||packet.principalFingerprint!==claim.principalFingerprint||
      packet.complete!==true||!Array.isArray(packet.items)||packet.items.length>5000||at-start>60000||
      (packet.observedAt!==undefined&&(packet.observedAt<start||packet.observedAt>at))||
      new Set(packet.items.map(x=>x.slug)).size!==packet.items.length||
      packet.items.some(x=>typeof x.slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(x.slug)))
      return {independent:false,complete:false,present:null,rank:null,observedAt:at,
        code:packet?.code==='RATE_LIMITED'?'RATE_LIMITED':'RECENT_UNKNOWN',
        retryAfterMs:Math.max(60000,Math.min(86400000,packet?.retryAfterMs||600000))};
    const rank=packet.items.findIndex(x=>x.slug===claim.slug)+1;
    return {independent:true,complete:true,present:rank>0,rank:rank||null,observedAt:at,code:rank?'RECENT_PRESENT':'RECENT_ABSENT'};
  }
  async function qualificationFor(row){
    const cfg=(await (await sourceStore()).read(row.slug)).record,q=cfg?.qualification;
    if(!cfg?.scheduleEnabled||cfg.restoredHistorical||!q||q.validUntil<=clock()||
      q.approvedBaseFingerprint!==row.releaseFingerprint)return null;
    const reviewer=(await (await sourceStore()).readKey(key)).record;
    if(!reviewer||reviewer.revoked||reviewer.fingerprint!==q.reviewerFingerprint)return null;
    const claim={...row,principalFingerprint:cfg.principalFingerprint};
    const observed=await observeSource(claim);if(!observed.ok)return null;
    const prepared=await prepareMarker(observed.source.blobs,{approvedBaseFingerprint:row.releaseFingerprint,
      previous:cfg.lastReceipt,id:newId(),consentRevision:cfg.consent?.revision});
    return prepared.ok?{method:REFRESH_METHOD,version:MARKER_POLICY,status:'SUPPORTED_AND_VERIFIED',
      purpose:'RECURRING',reviewDigest:q.reviewDigest,sourceFingerprint:prepared.pre.fingerprint,
      evidenceId:q.evidenceId,minimumIntervalMs:q.minimumIntervalMs,plan:prepared.plan}:null;
  }
  async function execute(claim,{beforeSave}={}){
    if(!validMarkerPlan(claim.plan)||typeof beforeSave!=='function')return fail('REFRESH_DISPATCH_AUTHORITY_REQUIRED');
    const measure=globalThis.navigator?.storage?.estimate?.bind(globalThis.navigator.storage);
    if(measure){const usage=await measure().catch(()=>null);
      if(usage&&Number.isFinite(usage.quota)&&usage.quota>0&&usage.usage>=usage.quota*0.8)
        return {...fail('REFRESH_STORAGE_PRESSURE'),effectBoundary:'NOT_DISPATCHED'};
    }
    const store=await sourceStore(),cfg=(await store.read(claim.slug)).record;
    if(!cfg?.consent||cfg.restoredHistorical)return fail('REFRESH_SOURCE_CONSENT_REQUIRED');
    const read=await observeSource(claim);if(!read.ok)return {...read,effectBoundary:'NOT_DISPATCHED'};
    const prepared=await prepareMarker(read.source.blobs,{approvedBaseFingerprint:claim.releaseFingerprint,
      previous:cfg.lastReceipt,id:claim.id,consentRevision:cfg.consent.revision});
    if(!prepared.ok||JSON.stringify(prepared.plan)!==JSON.stringify(claim.plan))
      return {...fail('REFRESH_PLAN_OR_SOURCE_CHANGED'),effectBoundary:'NOT_DISPATCHED'};
    if((await sentinel.inspect()).held)return {...fail('RESTORE_HOLD'),effectBoundary:'NOT_DISPATCHED'};
    return guard().runRefreshStep(claim.personaUid,{slug:claim.slug,remoteId:claim.remoteId,nonce:claim.id,principalFingerprint:claim.principalFingerprint,
      plan:claim.plan,previousFiles:prepared.pre.blobs},async phase=>{
        if((await sentinel.inspect()).held||!sameRoute(read.route,await guard().getSafeRouteReadiness(claim.personaUid)))
          return fail('REFRESH_PRE_SAVE_GUARD_CHANGED');
        const current=(await store.read(claim.slug)).record;
        if(claim.purpose==='RECURRING'){
          const reviewer=(await store.readKey(key)).record;
          if(!current?.scheduleEnabled||current.qualification?.validUntil<=clock()||
            !reviewer||reviewer.revoked||reviewer.fingerprint!==current.qualification?.reviewerFingerprint)
            return fail('REFRESH_QUALIFICATION_REVOKED');
        }
        return beforeSave(phase);
      });
  }
  async function readback(claim){
    const read=await observeSource(claim);
    if(!read.ok)return {kind:'UNKNOWN',targetMatched:false,principalMatched:false,code:read.code};
    const fingerprint=read.source.fingerprint,expected=claim.plan;
    const kind=expected&&fingerprint===expected.expectedPostSaveFingerprint?'EFFECT_CHANGED':
      expected&&fingerprint===expected.expectedPreSaveFingerprint?'NO_EFFECT':'UNKNOWN';
    const feed=await observeFeed(claim);
    return {kind,sourceFingerprint:fingerprint,targetMatched:true,principalMatched:true,feed};
  }
  async function command(type,{row,account,p,s,perform}){
    const st=await sourceStore();
    if(type==='TRUST_REFRESH_REVIEWER'){
      const publicKey=publicReviewKey(p.publicKey);if(!publicKey)return fail('H04_PUBLIC_KEY_INVALID');
      const fingerprint=await digestReview(publicKey);
      if(p.confirmation!=='TRUST '+fingerprint)return fail('H04_KEY_CONFIRMATION_REQUIRED');
      const old=await st.readKey(key);
      return st.putKey(key,old.record?.revision||0,{publicKey,fingerprint,at:clock(),revoked:false});
    }
    if(type==='MEASURE_REFRESH_RESOURCES'){
      const report=await measureRefreshResources(api,{clock}),old=await st.readKey(resourceKey);
      const out=await st.putKey(resourceKey,old.record?.revision||0,report);
      return out.ok?{ok:true,resource:report}:out;
    }
    if(!row)return fail('REFRESH_TARGET_UNKNOWN');
    const old=await st.read(row.slug);if(!old.ok)return old;let cfg=old.record;
    const result=record=>{
      const intent=row.refresh?.intent;
      const view=sourceRefreshProjection(record);
      if(intent)view.intent={id:opId(intent.id)?intent.id:null,state:safeCode(intent.state),at:safeTime(intent.at),dispatchAt:safeTime(intent.dispatchAt),
        plan:projectMarkerPlan(intent.plan)};
      if(intent)view.state=intent.state==='DISPATCH_POSSIBLE'?'HELD_UNCERTAIN':'RESERVED';
      return {ok:true,sourceRefresh:view};
    };
    if(type==='GET_SOURCE_REFRESH'){
      const reviewer=(await st.readKey(key)).record,resource=(await st.readKey(resourceKey)).record;
      return {...result(cfg),reviewerFingerprint:safeHash(reviewer?.fingerprint),resource:resource||null};
    }
    if(!row.ownerVerified||!row.releaseVerified||row.identityHeld||row.reviewHeld||row.listing!=='PUBLIC'||
      row.readyUpdate||!account?.verifiedIdentity)return fail('REFRESH_RELEASED_LISTED_OWNER_REQUIRED');
    if(type==='GET_REFRESH_REVIEW_CHALLENGE'){
      const proof=cfg?.lastProof,resource=(await st.readKey(resourceKey)).record;
      if(row.refresh?.intent||proof?.effect!=='EFFECT_CONFIRMED'||proof.feed?.state!=='PRESENT'||!resource)return fail('H04_CANONICAL_TEST_AND_RESOURCE_REQUIRED');
      return {ok:true,challenge:{schema:1,kind:'PCMS_H04_REVIEW',method:REFRESH_METHOD,policy:MARKER_POLICY,
        slug:cfg.slug,accountId:cfg.accountId,personaUid:cfg.personaUid,bindingVersion:cfg.bindingVersion,
        principalFingerprint:cfg.principalFingerprint,approvedBaseFingerprint:cfg.approvedBaseFingerprint,
        operationId:proof.id,expectedPostSaveFingerprint:proof.marker.effectiveCurrentFingerprint,
        feedObservedAt:proof.feed.at,feedRank:proof.feed.rank,reviewedAt:clock(),validUntil:clock()+86400000,
        repeatedUsePermitted:false,permissionEvidence:'REVIEW_REQUIRED',minimumIntervalMs:86400000,
        resourceDigest:resource.digest,maxTurnMs:resource.turnMs},resource};
    }
    if((cfg?.revision||0)!==p.expectedRevision)return fail('STALE_REFRESH_SOURCE');
    const claim={...row,principalFingerprint:account.principalFingerprint};
    if(type==='PREVIEW_SOURCE_REFRESH'){
      if(row.refresh?.intent)return fail('REFRESH_PENDING_RECONCILIATION_REQUIRED');
      if(cfg?.testAttempted&&!cfg?.lastReceipt)return fail('REFRESH_TEST_ALREADY_ATTEMPTED');
      const read=await observeSource(claim);if(!read.ok)return read;
      const prepared=await prepareMarker(read.source.blobs,{approvedBaseFingerprint:row.releaseFingerprint,
        previous:cfg?.lastReceipt,id:newId(),consentRevision:cfg?.consent?.revision||1});
      if(!prepared.ok)return prepared;
      const beforeFeed=await observeFeed(claim);
      cfg={...cfg,schema:1,policy:MARKER_POLICY,slug:row.slug,accountId:row.accountId,
        personaUid:row.personaUid,bindingVersion:row.bindingVersion,remoteId:row.remoteId,
        principalFingerprint:account.principalFingerprint,approvedBaseFingerprint:row.releaseFingerprint,
        effectiveCurrentFingerprint:prepared.pre.fingerprint,state:'TEST_READY',
        preview:{plan:prepared.plan,expiresAt:clock()+300000,consented:false,beforeFeed}};
    }else if(type==='CONSENT_SOURCE_REFRESH'){
      if(!cfg?.preview||cfg.preview.expiresAt<clock()||cfg.restoredHistorical||
        p.confirmation!=='CONSENT '+row.slug+' '+row.releaseFingerprint)return fail('MARKER_EXACT_CONSENT_REQUIRED');
      const revision=cfg.consent?.revision||1;
      cfg={...cfg,consent:{revision,policy:MARKER_POLICY,anchor:'HTML_BYTE_ZERO',
        approvedBaseFingerprint:row.releaseFingerprint,at:clock()},
        preview:{...cfg.preview,consented:true}};
    }else if(type==='TEST_SOURCE_REFRESH'){
      if(cfg?.preview?.beforeFeed?.code==='RATE_LIMITED')return fail('REFRESH_RECENT_RATE_LIMITED_HOLD');
      const plan=cfg?.preview?.plan;
      if(!cfg?.consent||cfg.preview?.consented!==true||cfg.preview.expiresAt<clock()||cfg.testAttempted||
        p.confirmation!=='TEST '+row.slug+' '+plan.expectedPostSaveFingerprint)return fail('REFRESH_EXACT_TEST_ARM_REQUIRED');
      return perform(row,{method:REFRESH_METHOD,version:MARKER_POLICY,status:'ARMED_SINGLE_TEST',
        purpose:'SINGLE_TEST',sourceFingerprint:plan.expectedPreSaveFingerprint,evidenceId:plan.operationId,plan});
    }else if(type==='OBSERVE_SOURCE_REFRESH'){
      return s.observeSourceRefresh(row.stableId,clock(),async intent=>readback({...claim,...intent,plan:intent.plan}));
    }else if(type==='IMPORT_REFRESH_REVIEW'){
      if(row.refresh?.intent||!cfg?.consent||!cfg.lastProof)return fail('H04_CANONICAL_TEST_EVIDENCE_REQUIRED');
      const reviewer=(await st.readKey(key)).record,resource=(await st.readKey(resourceKey)).record;
      const verified=await verifyRefreshReview(p.envelope,{reviewer,record:cfg,proof:cfg.lastProof,resource,now:clock()});
      if(!verified.ok)return verified;
      cfg={...cfg,qualification:verified.qualification,scheduleEnabled:false,state:'FLEET_READY'};
    }else if(type==='SET_REFRESH_SCHEDULE'){
      if(typeof p.enabled!=='boolean'||!cfg)return fail('REFRESH_SCHEDULE_INVALID');
      const reviewer=(await st.readKey(key)).record;
      if(p.enabled&&(!cfg.qualification||cfg.restoredHistorical||cfg.qualification.validUntil<=clock()||
        cfg.qualification.reviewerFingerprint!==reviewer?.fingerprint||reviewer?.revoked||
        row.refresh?.suspended||p.confirmation!=='SCHEDULE '+row.slug))return fail('H04_QUALIFIED_SCOPE_REQUIRED');
      cfg={...cfg,scheduleEnabled:p.enabled,state:p.enabled?'FLEET_READY':'SCHEDULE_PAUSED'};
    }else if(type==='REVOKE_REFRESH_REVIEW'){
      if(!cfg)return fail('REFRESH_SOURCE_UNKNOWN');
      cfg={...cfg,qualification:null,scheduleEnabled:false,state:'QUALIFICATION_REVOKED'};
    }else return fail('REFRESH_COMMAND_INVALID');
    const saved=await st.put(row.slug,p.expectedRevision,cfg);
    return saved.ok?result(saved.record):saved;
  }
  return Object.freeze({execute,readback,qualificationFor,command,requiresPreflight:true});
}
