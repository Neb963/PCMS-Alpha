import {incidentGroupKey,sharedIncidentCause} from './attention-model.mjs';
import {validIncidentTarget} from './incident-target.mjs';
import {operationGroup,projectOperationContext} from './operation-context.mjs';
// PCMS canonical journal. Only short IndexedDB transactions own state.
// This module neither imports nor invokes the donor, a provider, or a browser mutator.
export const DB_NAME = 'pcms-alpha-canonical';
export const SCHEMA = 1;
const terminal = new Set(['CONFIRMED', 'ABORTED', 'REJECTED']);
const active = new Set(['PREPARED', 'DISPATCH_POSSIBLE', 'OBSERVING', 'HELD_UNCERTAIN']);
const idPattern = /^[a-zA-Z0-9_-]{8,100}$/;
const digestPattern = /^[a-f0-9]{64}$/;

export function isSafeId(id) { return typeof id === 'string' && idPattern.test(id); }
export function fail(code) { return { ok: false, code }; }
function ok(value) { return { ok: true, ...value }; }

export function transition(entity, existing, action) {
  if (!action || !isSafeId(action.operationId) || !isSafeId(action.targetId))
    return fail('INVALID_TARGET');
  if (!entity || entity.id !== action.targetId ||
      !Number.isSafeInteger(entity.revision) || entity.revision < 0)
    return fail('TARGET_UNVERIFIED');
  if (existing && (existing.operationId !== action.operationId ||
      existing.targetId !== action.targetId)) return fail('OPERATION_COLLISION');
  const nextEntity = { ...entity };
  if (action.type === 'RESERVE') {
    if (!digestPattern.test(action.fingerprint || '') ||
        !isSafeId(action.effectType)) return fail('INVALID_FINGERPRINT');
    if (existing) return existing.fingerprint === action.fingerprint &&
      existing.targetId === action.targetId && existing.effectType === action.effectType
      ? ok({ operation: existing, entity, duplicate: true, changed: false })
      : fail('OPERATION_ID_REUSED');
    if (!Number.isSafeInteger(action.expectedRevision) ||
        entity.revision !== action.expectedRevision) return fail('STALE_REVISION');
    if (entity.activeOperationId) return fail('TARGET_BUSY');
    const operation = {
      operationId: action.operationId, targetId: action.targetId,
      effectType: action.effectType, fingerprint: action.fingerprint,
      status: 'PREPARED', revision: 1
    };
    nextEntity.revision++;
    nextEntity.activeOperationId = action.operationId;
    return ok({ operation, entity: nextEntity, changed: true, event: 'PREPARED' });
  }
  if (!existing) return fail('OPERATION_NOT_FOUND');
  if (!Number.isSafeInteger(action.expectedRevision) ||
      existing.revision !== action.expectedRevision) return fail('STALE_REVISION');
  let status;
  switch (action.type) {
    case 'MARK_DISPATCH':
      if (existing.status !== 'PREPARED') return fail('DISPATCH_NOT_ADMISSIBLE');
      status = 'DISPATCH_POSSIBLE'; break;
    case 'CANCEL':
      if (existing.status !== 'PREPARED') return fail('CANNOT_CANCEL_POSSIBLE_EFFECT');
      status = 'ABORTED'; break;
    case 'RECOVER':
      if (!['DISPATCH_POSSIBLE', 'OBSERVING'].includes(existing.status))
        return fail('RECOVERY_NOT_REQUIRED');
      status = 'HELD_UNCERTAIN'; break;
    case 'BEGIN_OBSERVATION':
      if (!['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(existing.status))
        return fail('OBSERVATION_NOT_ADMISSIBLE');
      status = 'OBSERVING'; break;
    case 'OBSERVED_EQUIVALENT':
      if (existing.status !== 'OBSERVING') return fail('OBSERVATION_NOT_ADMISSIBLE');
      // A caller's success assertion is not remote evidence. The operation
      // remains fenced until an independent readback is explicitly matched.
      if (action.proof?.source !== 'INDEPENDENT_READBACK' ||
          action.proof?.disposition !== 'EQUIVALENT' ||
          !isSafeId(action.proof?.observationId) ||
          action.proof?.observedFingerprint !== existing.fingerprint)
        return fail('INDEPENDENT_PROOF_REQUIRED');
      status = 'CONFIRMED'; break;
    case 'OBSERVED_CONFLICT':
      if (existing.status !== 'OBSERVING') return fail('OBSERVATION_NOT_ADMISSIBLE');
      status = 'HELD_UNCERTAIN'; break;
    default: return fail('COMMAND_NOT_ALLOWED');
  }
  if (!active.has(existing.status)) return fail('OPERATION_FINAL');
  const operation = { ...existing, status, revision: existing.revision + 1 };
  if (terminal.has(status) && entity.activeOperationId === action.operationId) {
    nextEntity.activeOperationId = null;
    nextEntity.revision++;
  }
  return ok({ operation, entity: nextEntity, changed: true, event: status });
}

// No promisified request is awaited inside an active transaction: all IndexedDB
// requests are scheduled in callbacks and completion is the only durable ack.
export function openCanonicalDatabase(factory = globalThis.indexedDB) {
  return new Promise((resolve, reject) => {
    if (!factory) { reject(new Error('PCMS_IDB_UNAVAILABLE')); return; }
    let request;
    try { request = factory.open(DB_NAME, SCHEMA); }
    catch { reject(new Error('PCMS_IDB_OPEN_FAILED')); return; }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('entities')) db.createObjectStore('entities', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('operations')) db.createObjectStore('operations', { keyPath: 'operationId' });
      if (!db.objectStoreNames.contains('events')) db.createObjectStore('events', { autoIncrement: true });
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('observations')) db.createObjectStore('observations', { keyPath: 'id' });
    };
    request.onblocked = () => reject(new Error('PCMS_IDB_UPGRADE_BLOCKED'));
    request.onerror = () => reject(new Error('PCMS_IDB_OPEN_FAILED'));
    request.onsuccess = () => resolve(request.result);
  });
}

function transact(db, names, mode, schedule) {
  return new Promise((resolve, reject) => {
    let tx, result = fail('TRANSACTION_INCOMPLETE');
    try { tx = db.transaction(names, mode); }
    catch { reject(new Error('PCMS_IDB_TRANSACTION_FAILED')); return; }
    tx.oncomplete = () => resolve(result);
    tx.onabort = () => reject(new Error('PCMS_IDB_TRANSACTION_ABORTED'));
    tx.onerror = () => { /* abort handler owns the failure */ };
    try { schedule(tx, value => { result = value; }); }
    catch { try { tx.abort(); } catch {} }
  });
}

export function createCanonicalStore(db) {
  function provisionTarget(targetId, expectedRevision = 0) {
    if (!isSafeId(targetId)) return Promise.resolve(fail('INVALID_TARGET'));
    return transact(db, ['entities','events'], 'readwrite', (tx, finish) => {
      const entities = tx.objectStore('entities');
      entities.get(targetId).onsuccess = ev => {
        const prior = ev.target.result;
        if (prior) { finish(fail('TARGET_EXISTS')); return; }
        if (expectedRevision !== 0) { finish(fail('STALE_REVISION')); return; }
        const entity = { id: targetId, revision: 1, activeOperationId: null };
        entities.add(entity);
        tx.objectStore('events').add({ stage: 'TARGET_CREATED', revision: 1 });
        finish(ok({ entity }));
      };
    });
  }
  function apply(action) {
    if (!action || !isSafeId(action.targetId) || !isSafeId(action.operationId))
      return Promise.resolve(fail('INVALID_TARGET'));
    return transact(db, ['entities','operations','events'], 'readwrite', (tx, finish) => {
      const entities = tx.objectStore('entities'), ops = tx.objectStore('operations');
      entities.get(action.targetId).onsuccess = targetRequest => {
        const entity = targetRequest.target.result;
        ops.get(action.operationId).onsuccess = opRequest => {
          const outcome = transition(entity, opRequest.target.result, action);
          if (outcome.ok && outcome.changed) {
            entities.put(outcome.entity);
            ops.put(outcome.operation);
            tx.objectStore('events').add({
              stage: outcome.event, operationId: action.operationId,
              revision: outcome.operation.revision
            });
          }
          finish(outcome);
        };
      };
    });
  }
  function getOperation(operationId) {
    if (!isSafeId(operationId)) return Promise.resolve(fail('INVALID_TARGET'));
    return transact(db, ['operations'], 'readonly', (tx, finish) => {
      tx.objectStore('operations').get(operationId).onsuccess = event => {
        const op = event.target.result;
        finish(op ? ok({ operation: op }) : fail('OPERATION_NOT_FOUND'));
      };
    });
  }
  function summary() {
    return transact(db, ['operations','entities'], 'readonly', (tx, finish) => {
      const counts = Object.create(null);
      const cursor = tx.objectStore('operations').openCursor();
      cursor.onsuccess = event => {
        const item = event.target.result;
        if (!item) { finish(ok({ states: counts })); return; }
        const s = item.value?.status;
        if (typeof s==='string')
          counts[s] = Math.min(100000, (counts[s] || 0) + 1);
        item.continue();
      };
    });
  }
  // R4: bounded, stable, read-only queue. Revisions and identities come
  // directly from the canonical transaction; no DOM text or inferred effects.
  // Legacy operation records have no timestamp. Do not invent one.
  function listOperationPage({after='',limit=30,status='ALL',query=''}={}){
    if(typeof after!=='string'||after.length>100||
       typeof query!=='string'||query.length>80||
       (after!==''&&!isSafeId(after))||
       !Number.isInteger(limit)||limit<1||limit>100||
       !['ALL','NEEDS_ACTION','RUNNING','WAITING','COMPLETED'].includes(status))
      return Promise.resolve(fail('INVALID_QUEUE_FILTER'));
    const groups={
      ALL:null,NEEDS_ACTION:new Set(['HELD_UNCERTAIN','REJECTED','DISPATCH_POSSIBLE']),
      RUNNING:new Set(['OBSERVING']),
      WAITING:new Set(['PREPARED']),
      COMPLETED:new Set(['CONFIRMED','ABORTED'])};
    return transact(db,['operations'],'readonly',(tx,finish)=>{
      const items=[];let more=false;const subset=groups[status];
      const range=after?IDBKeyRange.lowerBound(after,true):null;
      const request=tx.objectStore('operations').openCursor(range);
      request.onsuccess=event=>{
        const row=event.target.result;
        if(!row){finish(ok({items,more,next:more?items.at(-1)?.operationId||'':null}));return;}
        const op=row.value;
        if(!op||!isSafeId(op.operationId)||!isSafeId(op.targetId)||
            (status!=='ALL'&&operationGroup(op.status)!==status)||
            (query&&!([op.operationId,op.targetId,op.effectType,op.status].join(' ').toLowerCase().includes(query.toLowerCase())))){
          row.continue();return;}
        if(items.length>=limit){more=true;finish(ok({items,more,next:items.at(-1)?.operationId||null}));return;}
        items.push({operationId:op.operationId,targetId:op.targetId,
          effectType:op.effectType,status:op.status,revision:op.revision,
          updatedAt:Number.isSafeInteger(op.updatedAt)?op.updatedAt:null,archivedNoDispatch:op.archivedNoDispatch===true});
        row.continue();
      };
    });
  }
  function inspectOperationContext(operationId){
    if(!isSafeId(operationId))return Promise.resolve(fail('INVALID_TARGET'));
    return transact(db,['operations','meta','events'],'readonly',(tx,finish)=>{
      tx.objectStore('operations').get(operationId).onsuccess=e=>{
        const op=e.target.result;if(!op){finish(fail('OPERATION_NOT_FOUND'));return;}
        const links=[],events=[],inventory=[],eventStages=new Set();
        tx.objectStore('meta').openCursor().onsuccess=e=>{
          const row=e.target.result;
          if(row){
            if(typeof row.key==='string'&&row.key.startsWith('supply-batch:')&&row.value?.batch){
              const batch=row.value.batch;
              for(const item of batch.items||[])if(item.itemId===op.targetId)links.push({batch,item});
            }
            const creation=row.value?.record;
            if(row.key==='s00-create-intent:'+op.targetId&&creation?.intentId===op.targetId&&
               ((op.effectType==='s04_create'&&creation.createOperationId===operationId)||
                (op.effectType==='s04_rename'&&creation.renameOperationId===operationId))){
              links.push({kind:'S04',batch:{accountId:creation.accountId},item:{itemId:creation.intentId,
                createOperationId:creation.createOperationId,renameOperationId:creation.renameOperationId,
                requestedSlug:creation.slug,temporarySlug:creation.temporarySlug,state:creation.state,
                reason:creation.lastAttempt?.code,reasonAt:creation.lastAttempt?.at}});
            }
            if(row.value?.generator?.ownerState==='OBSERVED_OWNER')inventory.push({slug:row.value.generator.slug,accountId:row.value.generator.accountId,ownerState:'OBSERVED_OWNER'});
            row.continue();return;
          }
          tx.objectStore('events').openCursor().onsuccess=e=>{
            const cursor=e.target.result;
            if(cursor){if(cursor.value?.operationId===operationId&&!eventStages.has(cursor.value.stage)){eventStages.add(cursor.value.stage);events.push({stage:cursor.value.stage});}cursor.continue();return;}
            finish(ok({context:projectOperationContext(op,links,events,inventory),providerEffects:'NONE'}));
          };
        };
      };
    });
  }
  // Operator-authorized archiving of a POSITIVELY proven pre-dispatch
  // historical failure. This NEVER authorizes or replays provider effects.
  // Original batch, firstFailure and preparation events remain intact.
  function archiveHistoricalNoDispatch({operationId,expectedRevision}={}){
    if(!isSafeId(operationId)||!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
      return Promise.resolve(fail('INVALID_TARGET'));
    return transact(db,['operations','meta','events'],'readwrite',(tx,finish)=>{
      const ops=tx.objectStore('operations'),eventsStore=tx.objectStore('events');
      ops.get(operationId).onsuccess=e=>{
        const op=e.target.result;
        if(!op){finish(fail('OPERATION_NOT_FOUND'));return;}
        if(op.revision!==expectedRevision){finish(fail('STALE_REVISION'));return;}
        if(op.status!=='PREFLIGHT_FAILED'||op.archivedNoDispatch===true){
          finish(fail('ARCHIVE_NOT_ADMISSIBLE'));return;
        }
        const links=[],events=[],eventStages=new Set();
        tx.objectStore('meta').openCursor().onsuccess=e=>{
          const cursor=e.target.result;
          if(cursor){
            if(typeof cursor.value.key==='string'&&cursor.value.key.startsWith('supply-batch:')){
              const batch=cursor.value.value?.batch;
              if(batch&&Array.isArray(batch.items))
                for(const item of batch.items)if(item.itemId===op.targetId)links.push({batch,item});
            }
            cursor.continue();return;
          }
          eventsStore.openCursor().onsuccess=e=>{
            const row=e.target.result;
            if(row){
              if(row.value?.operationId===operationId&&!eventStages.has(row.value.stage)){
                eventStages.add(row.value.stage);events.push({stage:row.value.stage});
              }
              row.continue();return;
            }
            const context=projectOperationContext(op,links,events);
            if(context.evidence!=='RECORDED_NO_DISPATCH'||
               context.ambiguous||context.provenance!=='HISTORICAL_SUPPLY_V1'||
               !/^supply_(create|rename)_v1$/.test(op.effectType||'')){
              finish(fail('INDEPENDENT_NO_DISPATCH_PROOF_REQUIRED'));return;
            }
            const updated={...op,status:'ABORTED',originalStatus:'PREFLIGHT_FAILED',
              archivedNoDispatch:true,revision:op.revision+1};
            ops.put(updated);
            eventsStore.add({stage:'HISTORICAL_PREFLIGHT_ARCHIVED',operationId,
              revision:updated.revision});
            finish(ok({archived:true,revision:updated.revision,providerEffects:'NONE',
              replayAllowed:false}));
          };
        };
      };
    });
  }
  // Atomically mark every dispatch-maybe record uncertain on waking from crash.
  // This does not release a target fence or dispatch anything.
  function recover() {
    return transact(db, ['operations','events'], 'readwrite', (tx, finish) => {
      let held = 0;
      const operations = tx.objectStore('operations');
      operations.openCursor().onsuccess = event => {
        const row = event.target.result;
        if (!row) { finish(ok({ held })); return; }
        const op = row.value;
        if (op.status === 'DISPATCH_POSSIBLE' || op.status === 'OBSERVING') {
          row.update({ ...op, status: 'HELD_UNCERTAIN', revision: op.revision + 1 });
          tx.objectStore('events').add({ stage: 'HELD_UNCERTAIN', operationId: op.operationId, revision: op.revision + 1 });
          held++;
        }
        row.continue();
      };
    });
  }

  // Incidents are canonical, revision-fenced metadata; they never contain
  // arbitrary provider text or override an operation/route hold.
  // C-68: grouped by causal key (cause); a repeat of the same severity only
  //   counts, never renotifies; escalation, reopening or a new cause does.
  // C-69: only a trusted verified-recovery observation resolves; history is
  //   retained and a recurrence reopens the same incident as actionable.
  // C-70: review acknowledges without hiding. Legacy `ignored` records are
  //   projected as reviewed-and-still-active, never hidden.
  const NOTICE_CODES = new Set(['ROUTE_UNAVAILABLE','ACCOUNT_UNVERIFIED',
    'SOURCE_HELD','RESTORE_IN_PROGRESS','CANONICAL_UNAVAILABLE','OPERATION_UNCERTAIN',
    'PROVIDER_OUTAGE','BACKUP_FAILED','GIT_RECONNECT_REQUIRED',
    'GIT_FOLDER_MISSING','GIT_FOLDER_RENAME_REVIEW']);
  const RANK = { INFORMATIONAL:1, ACTION_REQUIRED:2, SERIOUS:3 };
  const RENOTIFY_MS = 30 * 60000;
  const causeOk = c => typeof c === 'string' && /^[A-Za-z0-9_:.-]{3,120}$/.test(c);
  const active = n => n && n.state !== 'RESOLVED';
  const pushHistory = (n, entry) => [...(Array.isArray(n?.history) ? n.history : []), entry].slice(-20);
  function recordNotice({ scopeId, code, severity, revision, cause, target, reason, at = Date.now(), isCurrent=()=>true }) {
    if (!isSafeId(scopeId) || !NOTICE_CODES.has(code) ||
        !['SERIOUS','ACTION_REQUIRED','INFORMATIONAL'].includes(severity) ||
        !Number.isSafeInteger(revision) || revision < 1 ||
        (cause !== undefined && !causeOk(cause)) || (target!==undefined&&!validIncidentTarget(target)) ||
        (reason!==undefined&&(typeof reason!=='string'||!/^[A-Z][A-Z0-9_]{2,79}$/.test(reason))) ||
        typeof isCurrent!=='function' || !Number.isSafeInteger(at))
      return Promise.resolve(fail('INVALID_NOTICE'));
    const key = 'attention:' + scopeId + ':' + code;
    return transact(db, ['meta'], 'readwrite', (tx, finish) => {
      const meta = tx.objectStore('meta');
      meta.get(key).onsuccess = event => {
        const prior = event.target.result;
        if(!isCurrent()){finish(fail('NOTICE_SUPERSEDED'));return;}
        if (prior && revision <= prior.revision) {
          finish(revision === prior.revision
            ? ok({ changed:false, notify:false, reviewed:prior.reviewed === true || prior.ignored === true })
            : fail('STALE_REVISION'));
          return;
        }
        let next, changed, event2;
        const incomingCause=cause||prior?.cause||code;
        const changedCause=!!prior&&incomingCause!==(prior.cause||code);
        const changedTarget=!!prior&&target!==undefined&&JSON.stringify(target)!==JSON.stringify(prior.target);
        const changedReason=!!prior&&reason!==undefined&&reason!==prior.reason;
        const material=changedCause||changedTarget||changedReason;
        if (!prior || !active(prior)) {
          event2 = prior ? 'REOPENED' : 'OPENED';
          next = { key, scopeId, code, cause:incomingCause, firstCause:prior?.firstCause||prior?.cause||incomingCause,
            ...(reason?{reason,firstReason:prior?.firstReason||prior?.reason||reason}:{}), severity, revision, state:'ACTIVE',
            reviewed:false, ignored:false, count:(prior?.count || 0) + 1,
            firstAt:prior?.firstAt ?? at, lastAt:at, resolvedAt:null,
            history:pushHistory(prior, { event:event2, at, severity, revision }) };
          changed = true;
        } else {
          const escalated = (RANK[severity] || 0) > (RANK[prior.severity] || 0);
          event2 = escalated ? 'ESCALATED' : material?'CONTEXT_CHANGED':'REPEATED';
          next = { ...prior, cause:incomingCause,firstCause:prior.firstCause||prior.cause||incomingCause,
            ...(reason?{reason,firstReason:prior.firstReason||prior.reason||reason}:{}), severity:escalated ? severity : prior.severity,
            revision, state:'ACTIVE', count:(prior.count || 1) + 1, lastAt:at,
            reviewed:escalated||material ? false : (prior.reviewed === true || prior.ignored === true),
            ignored:false, history:escalated||material ? pushHistory(prior, { event:event2, at, severity, revision,
              cause:incomingCause,...(reason?{reason}:{}),...(changedCause?{previousCause:prior.cause||code}:{}) }) :
              (Array.isArray(prior.history) ? prior.history : []) };
          changed = escalated||material;
        }
        if(target)next.target={kind:target.kind,id:target.id};
        if (!changed) { meta.put(next);finish(ok({ changed:false, notify:false, reviewed:next.reviewed, event:event2 })); return; }
        // The canonical causal scope owns notification deduplication. A
        // shared outage alerts once; independent account failures stay distinct.
        const groupKey=incidentGroupKey(next),notificationKey='attention-cause:'+groupKey;
        meta.get(notificationKey).onsuccess = ce => {
          if(!isCurrent()){finish(fail('NOTICE_SUPERSEDED'));return;}
          meta.put(next);
          const last=ce.target.result,signature=JSON.stringify([code,next.reason||null,
            sharedIncidentCause(next.cause)?null:next.target||null]);
          const notify=!last||!Number.isSafeInteger(last.notifiedAt)||at-last.notifiedAt>=RENOTIFY_MS||
            (RANK[next.severity]||0)>(RANK[last.severity]||0)||
            (last.recoveryGeneration||0)!==(last.notifiedRecoveryGeneration||0)||
            material&&signature!==last.signature;
          if(notify)meta.put({...last,key:notificationKey,cause:next.cause,notifiedAt:at,
            severity:next.severity,signature,
            notifiedRecoveryGeneration:last?.recoveryGeneration||0});
          finish(ok({changed:true,notify,ignored:false,event:event2}));
        };
      };
    });
  }
  function resolveNotice({ scopeId, code, evidence, at = Date.now(), isCurrent=()=>true }) {
    // Trusted background callers only; evidence names the independent
    // observation (for example ROUTE_HEALTH_OBSERVED), never elapsed time.
    if (!isSafeId(scopeId) || !NOTICE_CODES.has(code) ||
        typeof evidence !== 'string' || !/^[A-Z0-9_]{6,64}$/.test(evidence) ||
        (!Number.isSafeInteger(at)||typeof isCurrent!=='function'))
      return Promise.resolve(fail('INVALID_NOTICE'));
    const key = 'attention:' + scopeId + ':' + code;
    return transact(db, ['meta'], 'readwrite', (tx, finish) => {
      const meta = tx.objectStore('meta');
      meta.get(key).onsuccess = event => {
        const note = event.target.result;
        if (!note || !active(note)) { finish(ok({ changed:false })); return; }
        if(!isCurrent()){finish(fail('NOTICE_SUPERSEDED'));return;}
        meta.put({ ...note, state:'RESOLVED', resolvedAt:at, ignored:false,
          history:pushHistory(note, { event:'RESOLVED', at, evidence }) });
        const groupKey=incidentGroupKey(note),notificationKey='attention-cause:'+groupKey;
        // Reopening after verified recovery alerts once, including a recurrence
        // inside the old notification window. Existing dedup metadata is only
        // presentation state; it never changes a route/effect safety fence.
        const range=typeof IDBKeyRange==='undefined'?undefined:IDBKeyRange.bound('attention:','attention:\uffff');
        const cursor=meta.openCursor(range);
        cursor.onsuccess=e=>{
          const row=e.target.result;
          if(row){
            if(row.key!==key&&String(row.key).startsWith('attention:')&&
              active(row.value)&&incidentGroupKey(row.value)===groupKey){
              finish(ok({changed:true,resolved:true}));return;
            }
            row.continue();return;
          }
          meta.get(notificationKey).onsuccess=e=>{
            const prior=e.target.result;
            meta.put({...prior,key:notificationKey,
              recoveryGeneration:(prior?.recoveryGeneration||0)+1});
            finish(ok({changed:true,resolved:true}));
          };
        };
      };
    });
  }
  function acknowledge({ scopeId, code, expectedRevision }) {
    if (!isSafeId(scopeId) || !NOTICE_CODES.has(code) ||
        !Number.isSafeInteger(expectedRevision))
      return Promise.resolve(fail('INVALID_NOTICE'));
    const key='attention:' + scopeId + ':' + code;
    return transact(db,['meta'],'readwrite',(tx,finish)=>{
      const meta=tx.objectStore('meta');
      meta.get(key).onsuccess=event=>{
        const note=event.target.result;
        if(!note || !active(note)){finish(fail('NOTICE_NOT_FOUND'));return;}
        if(note.revision!==expectedRevision){finish(fail('STALE_REVISION'));return;}
        const changed=note.reviewed!==true||note.ignored===true;
        if(changed)meta.put({...note,reviewed:true,ignored:false});
        finish(ok({changed,holdReleased:false,stillActionable:true,reviewed:true}));
      };
    });
  }
  // Legacy "Ignore" is an acknowledgement: it never hides an active incident.
  const ignoreNotice = acknowledge, acknowledgeNotice = acknowledge;
  function noticeSummary() {
    return transact(db,['meta'],'readonly',(tx,finish)=>{
      const counts={ serious:0, actionRequired:0, informational:0, reviewed:0, resolved:0, ignored:0 };
      const cursor=tx.objectStore('meta').openCursor();
      cursor.onsuccess = event => {
        const row=event.target.result;
        if (!row) {finish(ok({counts}));return;}
        const n=row.value;
        if (typeof n?.key==='string' && n.key.startsWith('attention:')) {
          if (!active(n)) counts.resolved++;
          else {
            if (n.severity==='SERIOUS') counts.serious++;
            else if (n.severity==='ACTION_REQUIRED') counts.actionRequired++;
            else if (n.severity==='INFORMATIONAL') counts.informational++;
            if (n.reviewed===true||n.ignored===true) counts.reviewed++;
          }
        }
        row.continue();
      };
    });
  }

  function listNotices(limit=50,{ includeResolved=false }={}) {
    return transact(db,['meta'],'readonly',(tx,finish)=>{
      const notices=[];
      let truncated=false,resolved=0;
      const cursor=tx.objectStore('meta').openCursor();
      cursor.onsuccess = event => {
        const row=event.target.result;
        if (!row) {finish(ok({notices,truncated,resolved}));return;}
        const n=row.value;
        if (typeof n?.key==='string' && n.key.startsWith('attention:')) {
          if (!active(n)) resolved++;
          if (active(n) || includeResolved) {
            if (notices.length>=limit) truncated=true;
            else notices.push({scopeId:n.scopeId,code:n.code,cause:n.cause||n.code,
              severity:n.severity,revision:n.revision,...(validIncidentTarget(n.target)?{target:n.target}:{}),
              reviewed:n.reviewed===true||n.ignored===true,state:active(n)?'ACTIVE':'RESOLVED',
              count:Number.isSafeInteger(n.count)?n.count:1,
              firstAt:n.firstAt??null,lastAt:n.lastAt??null,resolvedAt:n.resolvedAt??null});
          }
        }
        row.continue();
      };
    });
  }
  function pageNotices({after='',limit=30,query=''}={}){
    if(typeof after!=='string'||after.length>240||
       typeof query!=='string'||query.length>80||
       (after!==''&&!/^attention:[a-zA-Z0-9_-]{8,100}:[A-Z_]{3,80}$/.test(after))||
       !Number.isInteger(limit)||limit<1||limit>100)
      return Promise.resolve(fail('INVALID_NOTICE_PAGE'));
    return transact(db,['meta'],'readonly',(tx,finish)=>{
      const items=[];let more=false;
      const range=IDBKeyRange.lowerBound(after||'attention:',Boolean(after));
      const cursor=tx.objectStore('meta').openCursor(range);
      cursor.onsuccess=event=>{
        const row=event.target.result;
        if(!row){finish(ok({items,more,next:more?items.at(-1)?.cursor||null:null}));return;}
        const key=String(row.key);
        if(!key.startsWith('attention:')){finish(ok({items,more:false,next:null}));return;}
        const n=row.value;
        if(n?.state==='RESOLVED'||(query&&!([key,n?.scopeId,n?.code,n?.cause,n?.target?.id].join(' ').toLowerCase().includes(query.toLowerCase())))){
          row.continue();return;}
        if(items.length>=limit){more=true;finish(ok({items,more,next:items.at(-1)?.cursor||null}));return;}
        if(n?.scopeId&&n?.code)items.push({cursor:key,scopeId:n.scopeId,code:n.code,
          cause:n.cause||n.code,severity:n.severity,revision:n.revision,...(validIncidentTarget(n.target)?{target:n.target}:{}),
          reviewed:n.reviewed===true||n.ignored===true,firstAt:n.firstAt??null,
          lastAt:n.lastAt??null});
        row.continue();
      };
    });
  }

  function projectNotice(n){
    const time=v=>Number.isSafeInteger(v)&&v>=0?v:null;
    const token=v=>typeof v==='string'&&/^[A-Z][A-Z0-9_]{2,79}$/.test(v)?v:null;
    return {cursor:n.key,scopeId:n.scopeId,code:n.code,cause:causeOk(n.cause)?n.cause:n.code,
      firstCause:causeOk(n.firstCause)?n.firstCause:causeOk(n.cause)?n.cause:n.code,
      reason:token(n.reason),firstReason:token(n.firstReason)||token(n.reason),
      severity:n.severity,revision:n.revision,
      ...(validIncidentTarget(n.target)?{target:{...n.target}}:{}),
      state:active(n)?'ACTIVE':'RESOLVED',reviewed:n.reviewed===true||n.ignored===true,
      count:Number.isSafeInteger(n.count)&&n.count>0?n.count:1,
      firstAt:time(n.firstAt),lastAt:time(n.lastAt),resolvedAt:time(n.resolvedAt),
      history:(Array.isArray(n.history)?n.history:[]).slice(-20).map(h=>({
        event:token(h.event),at:time(h.at),evidence:token(h.evidence),
        cause:causeOk(h.cause)?h.cause:null,reason:token(h.reason),
        previousCause:causeOk(h.previousCause)?h.previousCause:null
      }))};
  }
  function inspectNotice({scopeId,code}={}){
    if(!isSafeId(scopeId)||!NOTICE_CODES.has(code))return Promise.resolve(fail('INVALID_NOTICE'));
    return transact(db,['meta'],'readonly',(tx,finish)=>{
      tx.objectStore('meta').get('attention:'+scopeId+':'+code).onsuccess=e=>{
        const n=e.target.result;
        finish(n?ok({notice:projectNotice(n),providerEffects:'NONE'}):fail('NOTICE_NOT_FOUND'));
      };
    });
  }
  const groupKeyOk=v=>typeof v==='string'&&v.length<=240&&(
    /^scope:[a-zA-Z0-9_-]{8,100}:[A-Z_]{3,80}$/.test(v)||
    v.startsWith('shared:')&&sharedIncidentCause(v.slice(7)));
  const noticeMatch=(n,query)=>!query||[n.scopeId,n.code,n.cause,n.reason,n.firstReason,n.target?.id].
    join(' ').toLowerCase().includes(query.toLowerCase());
  const stateMatch=(n,state)=>state==='ALL'||(active(n)?'ACTIVE':'RESOLVED')===state;
  function pageNoticeGroups({after='',limit=20,query='',state='ACTIVE'}={}){
    if(typeof after!=='string'||after!==''&&!groupKeyOk(after)||
       typeof query!=='string'||query.length>80||!['ACTIVE','RESOLVED','ALL'].includes(state)||
       !Number.isInteger(limit)||limit<1||limit>100)return Promise.resolve(fail('INVALID_NOTICE_PAGE'));
    return transact(db,['meta'],'readonly',(tx,finish)=>{
      const groups=new Map();let seen=0,totalNotices=0,matchingNotices=0;
      const range=typeof IDBKeyRange==='undefined'?undefined:IDBKeyRange.bound('attention:','attention:\uffff');
      const cursor=tx.objectStore('meta').openCursor(range);
      cursor.onsuccess=e=>{
        const row=e.target.result;
        if(row){
          const n=row.value;
          if(String(row.key).startsWith('attention:')&&isSafeId(n?.scopeId)&&NOTICE_CODES.has(n?.code)&&stateMatch(n,state)){
            if(++seen>100000){finish(fail('NOTICE_SCAN_LIMIT'));return;}
            const key=incidentGroupKey(n);let g=groups.get(key);
            if(!g){g={key,cause:n.cause||n.code,severity:n.severity,memberCount:0,eventCount:0,
              reviewedCount:0,scopes:new Set(),firstAt:null,lastAt:null,matched:false,notice:null};groups.set(key,g);}
            totalNotices++;g.memberCount++;g.eventCount+=Number.isSafeInteger(n.count)&&n.count>0?n.count:1;
            g.scopes.add(n.scopeId);if(n.reviewed===true||n.ignored===true)g.reviewedCount++;
            if((RANK[n.severity]||0)>(RANK[g.severity]||0))g.severity=n.severity;
            if(Number.isSafeInteger(n.firstAt))g.firstAt=g.firstAt===null?n.firstAt:Math.min(g.firstAt,n.firstAt);
            if(Number.isSafeInteger(n.lastAt))g.lastAt=g.lastAt===null?n.lastAt:Math.max(g.lastAt,n.lastAt);
            if(noticeMatch(n,query)){matchingNotices++;g.matched=true;g.notice??=projectNotice(n);}
          }
          row.continue();return;
        }
        const matching=[...groups.values()].filter(g=>g.matched).sort((a,b)=>a.key.localeCompare(b.key));
        const remaining=matching.filter(g=>!after||g.key.localeCompare(after)>0),more=remaining.length>limit;
        const items=remaining.slice(0,limit).map(({scopes,matched,...g})=>({...g,
          affectedCount:scopes.size,reviewed:g.reviewedCount===g.memberCount}));
        finish(ok({items,more,next:more?items.at(-1)?.key||null:null,total:matching.length,
          totalNotices,matchingNotices,unfilteredTotal:groups.size,providerEffects:'NONE'}));
      };
    });
  }
  function pageNoticeMembers({groupKey,after='',limit=20,query='',state='ACTIVE'}={}){
    if(!groupKeyOk(groupKey)||typeof after!=='string'||after.length>240||
       after!==''&&!/^attention:[a-zA-Z0-9_-]{8,100}:[A-Z_]{3,80}$/.test(after)||
       typeof query!=='string'||query.length>80||!['ACTIVE','RESOLVED','ALL'].includes(state)||
       !Number.isInteger(limit)||limit<1||limit>100)return Promise.resolve(fail('INVALID_NOTICE_PAGE'));
    return transact(db,['meta'],'readonly',(tx,finish)=>{
      const items=[];let seen=0,total=0,unfilteredTotal=0,remaining=0;
      const range=typeof IDBKeyRange==='undefined'?undefined:IDBKeyRange.bound('attention:','attention:\uffff');
      const cursor=tx.objectStore('meta').openCursor(range);
      cursor.onsuccess=e=>{
        const row=e.target.result;
        if(row){
          const n=row.value,key=String(row.key);
          if(key.startsWith('attention:')&&isSafeId(n?.scopeId)&&NOTICE_CODES.has(n?.code)&&
             stateMatch(n,state)&&incidentGroupKey(n)===groupKey){
            if(++seen>100000){finish(fail('NOTICE_SCAN_LIMIT'));return;}
            unfilteredTotal++;
            if(noticeMatch(n,query)){
              total++;
              if(!after||key>after){remaining++;items.push(projectNotice(n));
                items.sort((a,b)=>a.cursor<b.cursor?-1:a.cursor>b.cursor?1:0);if(items.length>limit)items.pop();}
            }
          }
          row.continue();return;
        }
        const more=remaining>limit;finish(ok({items,total,unfilteredTotal,more,
          next:more?items.at(-1)?.cursor||null:null,providerEffects:'NONE'}));
      };
    });
  }
  return Object.freeze({ provisionTarget, apply, getOperation, inspectOperationContext, archiveHistoricalNoDispatch, listOperationPage, summary, recover,
    recordNotice, resolveNotice, ignoreNotice, acknowledgeNotice, noticeSummary,
    listNotices, pageNotices, inspectNotice, pageNoticeGroups, pageNoticeMembers, close: () => db.close() });
}

// Restore sentinel lives OUTSIDE replaceable IDB. It must not be cleared by
// ordinary journal/API/UI code. A failed read is a global fail-closed hold.
export function createRestoreSentinel(storage) {
  const key = 'pcmsRestoreInProgress';
  return Object.freeze({
    async inspect() {
      try {
        const v = (await storage.get(key))?.[key];
        if (v === undefined) return { held: false, code: 'NO_RESTORE_MARKER' };
        if (v && v.active === true) return { held: true, code: 'RESTORE_IN_PROGRESS',
          status:typeof v.status==='string'?v.status:'UNKNOWN' };
        return { held: true, code: 'RESTORE_MARKER_INVALID' };
      } catch { return { held: true, code: 'RESTORE_MARKER_UNAVAILABLE' }; }
    }
  });
}
