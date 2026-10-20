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
  const NOTICE_CODES = new Set(['ROUTE_UNAVAILABLE','ACCOUNT_UNVERIFIED',
    'SOURCE_HELD','RESTORE_IN_PROGRESS','CANONICAL_UNAVAILABLE','OPERATION_UNCERTAIN']);
  function recordNotice({ scopeId, code, severity, revision }) {
    if (!isSafeId(scopeId) || !NOTICE_CODES.has(code) ||
        !['SERIOUS','ACTION_REQUIRED','INFORMATIONAL'].includes(severity) ||
        !Number.isSafeInteger(revision) || revision < 1)
      return Promise.resolve(fail('INVALID_NOTICE'));
    const key = 'attention:' + scopeId + ':' + code;
    return transact(db, ['meta'], 'readwrite', (tx, finish) => {
      const meta = tx.objectStore('meta');
      meta.get(key).onsuccess = event => {
        const prior = event.target.result;
        if (prior && revision <= prior.revision) {
          finish(revision === prior.revision
            ? ok({ changed:false, ignored:prior.ignored === true })
            : fail('STALE_REVISION'));
          return;
        }
        meta.put({ key, scopeId, code, severity, revision, ignored:false, reviewed:false });
        finish(ok({ changed:true, ignored:false }));
      };
    });
  }
  function ignoreNotice({ scopeId, code, expectedRevision }) {
    if (!isSafeId(scopeId) || !NOTICE_CODES.has(code) || !Number.isSafeInteger(expectedRevision))
      return Promise.resolve(fail('INVALID_NOTICE'));
    const key='attention:' + scopeId + ':' + code;
    return transact(db,['meta'],'readwrite',(tx,finish)=>{
      const meta=tx.objectStore('meta');
      meta.get(key).onsuccess = event => {
        const note=event.target.result;
        if (!note) {finish(fail('NOTICE_NOT_FOUND'));return;}
        if (note.revision !== expectedRevision) {finish(fail('STALE_REVISION'));return;}
        if (!note.ignored) meta.put({ ...note, ignored:true });
        finish(ok({ changed:!note.ignored, holdReleased:false }));
      };
    });
  }
  function acknowledgeNotice({ scopeId, code, expectedRevision }) {
    if (!isSafeId(scopeId) || !NOTICE_CODES.has(code) ||
        !Number.isSafeInteger(expectedRevision))
      return Promise.resolve(fail('INVALID_NOTICE'));
    const key='attention:' + scopeId + ':' + code;
    return transact(db,['meta'],'readwrite',(tx,finish)=>{
      const meta=tx.objectStore('meta');
      meta.get(key).onsuccess=event=>{
        const note=event.target.result;
        if(!note || note.ignored===true){finish(fail('NOTICE_NOT_FOUND'));return;}
        if(note.revision!==expectedRevision){finish(fail('STALE_REVISION'));return;}
        if(note.reviewed!==true)meta.put({...note,reviewed:true});
        finish(ok({changed:note.reviewed!==true,holdReleased:false,
          stillActionable:true,reviewed:true}));
      };
    });
  }
  function noticeSummary() {
    return transact(db,['meta'],'readonly',(tx,finish)=>{
      const counts={ serious:0, actionRequired:0, informational:0, ignored:0 };
      const cursor=tx.objectStore('meta').openCursor();
      cursor.onsuccess = event => {
        const row=event.target.result;
        if (!row) {finish(ok({counts}));return;}
        const n=row.value;
        if (typeof n?.key==='string' && n.key.startsWith('attention:')) {
          if (n.ignored === true) counts.ignored++;
          else if (n.severity==='SERIOUS') counts.serious++;
          else if (n.severity==='ACTION_REQUIRED') counts.actionRequired++;
          else if (n.severity==='INFORMATIONAL') counts.informational++;
        }
        row.continue();
      };
    });
  }

  function listNotices(limit=50) {
    return transact(db,['meta'],'readonly',(tx,finish)=>{
      const notices=[];
      let truncated=false;
      const cursor=tx.objectStore('meta').openCursor();
      cursor.onsuccess = event => {
        const row=event.target.result;
        if (!row) {finish(ok({notices,truncated}));return;}
        const n=row.value;
        if (typeof n?.key==='string' && n.key.startsWith('attention:') &&
            n.ignored!==true) {
          if (notices.length>=limit) truncated=true;
          else notices.push({scopeId:n.scopeId,code:n.code,
            severity:n.severity,revision:n.revision,reviewed:n.reviewed===true});
        }
        row.continue();
      };
    });
  }
  return Object.freeze({ provisionTarget, apply, getOperation, summary, recover,
    recordNotice, ignoreNotice, acknowledgeNotice, noticeSummary,
    listNotices, close: () => db.close() });
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
