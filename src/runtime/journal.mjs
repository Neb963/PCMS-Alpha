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
        if (['PREPARED','DISPATCH_POSSIBLE','OBSERVING','HELD_UNCERTAIN','CONFIRMED','ABORTED','REJECTED'].includes(s))
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
            (subset&&!subset.has(op.status))||
            (query&&!([op.operationId,op.targetId,op.effectType,op.status].join(' ').toLowerCase().includes(query.toLowerCase())))){
          row.continue();return;}
        if(items.length>=limit){more=true;finish(ok({items,more,next:items.at(-1)?.operationId||null}));return;}
        items.push({operationId:op.operationId,targetId:op.targetId,
          effectType:op.effectType,status:op.status,revision:op.revision,
          updatedAt:Number.isSafeInteger(op.updatedAt)?op.updatedAt:null});
        row.continue();
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
    'PROVIDER_OUTAGE','BACKUP_FAILED','GIT_RECONNECT_REQUIRED']);
  const RANK = { INFORMATIONAL:1, ACTION_REQUIRED:2, SERIOUS:3 };
  const RENOTIFY_MS = 30 * 60000;
  const causeOk = c => typeof c === 'string' && /^[A-Za-z0-9_:.-]{3,120}$/.test(c);
  const active = n => n && n.state !== 'RESOLVED';
  const pushHistory = (n, entry) => [...(Array.isArray(n?.history) ? n.history : []), entry].slice(-20);
  function recordNotice({ scopeId, code, severity, revision, cause, at = Date.now() }) {
    if (!isSafeId(scopeId) || !NOTICE_CODES.has(code) ||
        !['SERIOUS','ACTION_REQUIRED','INFORMATIONAL'].includes(severity) ||
        !Number.isSafeInteger(revision) || revision < 1 ||
        (cause !== undefined && !causeOk(cause)) || !Number.isSafeInteger(at))
      return Promise.resolve(fail('INVALID_NOTICE'));
    const key = 'attention:' + scopeId + ':' + code, causeKey = cause || code;
    return transact(db, ['meta'], 'readwrite', (tx, finish) => {
      const meta = tx.objectStore('meta');
      meta.get(key).onsuccess = event => {
        const prior = event.target.result;
        if (prior && revision <= prior.revision) {
          finish(revision === prior.revision
            ? ok({ changed:false, notify:false, reviewed:prior.reviewed === true || prior.ignored === true })
            : fail('STALE_REVISION'));
          return;
        }
        let next, changed, event2;
        if (!prior || !active(prior)) {
          event2 = prior ? 'REOPENED' : 'OPENED';
          next = { key, scopeId, code, cause:causeKey, severity, revision, state:'ACTIVE',
            reviewed:false, ignored:false, count:(prior?.count || 0) + 1,
            firstAt:prior?.firstAt ?? at, lastAt:at, resolvedAt:null,
            history:pushHistory(prior, { event:event2, at, severity, revision }) };
          changed = true;
        } else {
          const escalated = (RANK[severity] || 0) > (RANK[prior.severity] || 0);
          event2 = escalated ? 'ESCALATED' : 'REPEATED';
          next = { ...prior, cause:prior.cause || causeKey, severity:escalated ? severity : prior.severity,
            revision, state:'ACTIVE', count:(prior.count || 1) + 1, lastAt:at,
            reviewed:escalated ? false : (prior.reviewed === true || prior.ignored === true),
            ignored:false, history:escalated ? pushHistory(prior, { event:event2, at, severity, revision }) :
              (Array.isArray(prior.history) ? prior.history : []) };
          changed = escalated;
        }
        meta.put(next);
        if (!changed) { finish(ok({ changed:false, notify:false, reviewed:next.reviewed, event:event2 })); return; }
        // One desktop notification per cause per window: a provider outage
        // across many accounts/generators is one alert, unless it escalates.
        meta.get('attention-cause:' + next.cause).onsuccess = ce => {
          const last = ce.target.result;
          const notify = !last || at - last.notifiedAt >= RENOTIFY_MS ||
            (RANK[next.severity] || 0) > (RANK[last.severity] || 0);
          if (notify) meta.put({ key:'attention-cause:' + next.cause, cause:next.cause,
            notifiedAt:at, severity:next.severity });
          finish(ok({ changed:true, notify, ignored:false, event:event2 }));
        };
      };
    });
  }
  function resolveNotice({ scopeId, code, evidence, at = Date.now() }) {
    // Trusted background callers only; evidence names the independent
    // observation (for example ROUTE_HEALTH_OBSERVED), never elapsed time.
    if (!isSafeId(scopeId) || !NOTICE_CODES.has(code) ||
        typeof evidence !== 'string' || !/^[A-Z0-9_]{6,64}$/.test(evidence) ||
        !Number.isSafeInteger(at))
      return Promise.resolve(fail('INVALID_NOTICE'));
    const key = 'attention:' + scopeId + ':' + code;
    return transact(db, ['meta'], 'readwrite', (tx, finish) => {
      const meta = tx.objectStore('meta');
      meta.get(key).onsuccess = event => {
        const note = event.target.result;
        if (!note || !active(note)) { finish(ok({ changed:false })); return; }
        meta.put({ ...note, state:'RESOLVED', resolvedAt:at, ignored:false,
          history:pushHistory(note, { event:'RESOLVED', at, evidence }) });
        finish(ok({ changed:true, resolved:true }));
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
              severity:n.severity,revision:n.revision,
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
        if(n?.state==='RESOLVED'||(query&&!([n?.scopeId,n?.code,n?.cause].join(' ').toLowerCase().includes(query.toLowerCase())))){
          row.continue();return;}
        if(items.length>=limit){more=true;finish(ok({items,more,next:items.at(-1)?.cursor||null}));return;}
        if(n?.scopeId&&n?.code)items.push({cursor:key,scopeId:n.scopeId,code:n.code,
          cause:n.cause||n.code,severity:n.severity,revision:n.revision,
          reviewed:n.reviewed===true||n.ignored===true,firstAt:n.firstAt??null,
          lastAt:n.lastAt??null});
        row.continue();
      };
    });
  }
  return Object.freeze({ provisionTarget, apply, getOperation, listOperationPage, summary, recover,
    recordNotice, resolveNotice, ignoreNotice, acknowledgeNotice, noticeSummary,
    listNotices, pageNotices, close: () => db.close() });
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
        if (v && v.active === true) return { held: true, code: 'RESTORE_IN_PROGRESS' };
        return { held: true, code: 'RESTORE_MARKER_INVALID' };
      } catch { return { held: true, code: 'RESTORE_MARKER_UNAVAILABLE' }; }
    }
  });
}
