import {trackPcmsWork} from './work-checkpoint.mjs';
// Canonical command admission is independent of UI disabled state.
import { createCanonicalStore, createRestoreSentinel, openCanonicalDatabase, fail } from './journal.mjs';

export const COMMAND_PORT = 'pcms-i02-canonical-readonly';
const SAFE_NAMES = new Set(['HEALTH','SUMMARY','GET_OPERATION','GET_OPERATION_CONTEXT','GET_NOTICES','NOTICE_SUMMARY','LIST_OPERATION_PAGE','LIST_NOTICE_PAGE','IGNORE_NOTICE','ACK_NOTICE','PREVIEW']);
export function trustedExtensionPage(api, sender) {
  if (sender?.id !== api.runtime.id || typeof sender.url !== 'string') return false;
  const base = api.runtime.getURL('pcms/');
  const index = base + 'index.html';
  if (sender.url === index || sender.url === base + 'emergency.html') return true;
  // Firefox sender.url includes the same-origin dashboard fragment. Validate
  // only the known six navigable hash routes, never a string-prefix query,
  // unknown view or another extension URL.
  if (!sender.url.startsWith(index + '#')) return false;
  const hash = sender.url.slice(index.length + 1);
  return new Set(['overview','generators','work-queue','accounts',
    'refresher','settings']).has(hash);
}
export function validateCommand(api, sender, message) {
  if (!trustedExtensionPage(api, sender)) return fail('UNTRUSTED_SENDER');
  if (!message || typeof message !== 'object' || Array.isArray(message))
    return fail('INVALID_MESSAGE');
  let bytes;
  try { bytes = JSON.stringify(message); } catch { return fail('INVALID_MESSAGE'); }
  if (!bytes || bytes.length > 2048 || Object.keys(message).length > 3)
    return fail('MESSAGE_TOO_LARGE');
  if (!SAFE_NAMES.has(message.type)) return fail('CAPABILITY_OFF');
  if (['IGNORE_NOTICE','ACK_NOTICE'].includes(message.type) &&
    (typeof message.notice !== 'object' || !message.notice ||
      !/^[a-zA-Z0-9_-]{8,100}$/.test(message.notice.scopeId || '') ||
      typeof message.notice.code !== 'string' ||
      !Number.isSafeInteger(message.notice.expectedRevision)))
    return fail('INVALID_NOTICE');
  if(['LIST_OPERATION_PAGE','LIST_NOTICE_PAGE'].includes(message.type)){
    if(Object.keys(message).some(k=>!['type','params'].includes(k))||
       !message.params||typeof message.params!=='object'||Array.isArray(message.params)||
       Object.keys(message.params).some(k=>
         !['after','limit','query',...(message.type==='LIST_OPERATION_PAGE'?['status']:[])].includes(k))||
       (message.params.after!==undefined&&(typeof message.params.after!=='string'||message.params.after.length>240))||
       (message.params.query!==undefined&&(typeof message.params.query!=='string'||message.params.query.length>80))||
       (message.params.limit!==undefined&&(!Number.isInteger(message.params.limit)||
           message.params.limit<1||message.params.limit>100)))
      return fail('INVALID_QUEUE_PAGE');
  }
  if (message.type === 'GET_OPERATION' &&
      (typeof message.operationId !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(message.operationId)))
    return fail('INVALID_TARGET');
  if(message.type==='GET_OPERATION_CONTEXT'&&
    (Object.keys(message).some(k=>!['type','params'].includes(k))||
     !message.params||typeof message.params!=='object'||Array.isArray(message.params)||Object.keys(message.params).length!==1||
     !/^[a-zA-Z0-9_-]{8,100}$/.test(message.params.operationId||'')))return fail('INVALID_TARGET');
  return { ok: true };
}
export function createCommandBoundary(api, { open = openCanonicalDatabase } = {}) {
  let dbPromise;
  const sentinel = createRestoreSentinel(api.storage.local);
  function canonical() {
    if (!dbPromise) dbPromise = open().then(db => createCanonicalStore(db));
    return dbPromise;
  }
  async function status() {
    const restore = await sentinel.inspect();
    try {
      const store = await canonical();
      const states = await store.summary();
      const notices = await store.noticeSummary();
      if (!states.ok || !notices.ok) throw Error('missing state');
      return { ok: true, phase: 'I02', storage: 'READY', restore: restore.code,
        held: restore.held, providerEffects: 'OFF', states: states.states,
        attention: notices.counts };
    } catch {
      return { ok: true, phase: 'I02', storage: 'UNAVAILABLE', restore: restore.code,
        held: true, providerEffects: 'OFF', states: null, attention: null };
    }
  }
  async function dispatch(message, sender) {
    const auth = validateCommand(api, sender, message);
    if (!auth.ok) return auth;
    const state = await status();
    if (message.type === 'HEALTH' || message.type === 'SUMMARY') return state;
    if (state.storage !== 'READY' || state.held) return fail('CANONICAL_HOLD');
    if (message.type === 'ACK_NOTICE') {
      try { return await (await canonical()).acknowledgeNotice(message.notice); }
      catch { return fail('CANONICAL_HOLD'); }
    }
    if (message.type === 'IGNORE_NOTICE') {
      try { return await (await canonical()).ignoreNotice(message.notice); }
      catch { return fail('CANONICAL_HOLD'); }
    }
    if(message.type==='NOTICE_SUMMARY'){
      try{return await (await canonical()).noticeSummary();}
      catch{return fail('CANONICAL_HOLD');}
    }
    if(message.type==='LIST_OPERATION_PAGE'||message.type==='LIST_NOTICE_PAGE'){
      try{
        const store=await canonical();
        return message.type==='LIST_OPERATION_PAGE'?
          await store.listOperationPage(message.params):
          await store.pageNotices(message.params);
      }catch{return fail('CANONICAL_HOLD');}
    }
    if (message.type === 'GET_NOTICES') {
      try { return await (await canonical()).listNotices(); }
      catch { return fail('CANONICAL_HOLD'); }
    }
    if (message.type === 'GET_OPERATION') {
      try {
        const op = await (await canonical()).getOperation(message.operationId);
        if (!op.ok) return op;
        // Deliberately do not disclose target/account/slug/manifest/operation identity.
        return { ok: true, state: op.operation.status, revision: op.operation.revision };
      } catch { return fail('CANONICAL_HOLD'); }
    }
    if(message.type==='GET_OPERATION_CONTEXT'){
      try{return await (await canonical()).inspectOperationContext(message.params.operationId);}
      catch{return fail('CANONICAL_HOLD');}
    }
    return { ok: true, admissible: false, reason: 'CAPABILITY_OFF' };
  }
  function register() {
    api.runtime.onConnect.addListener(port => {
      if (port?.name !== COMMAND_PORT) return;
      let busy = false;
      port.onMessage.addListener(message => {
        if (busy) { try { port.postMessage(fail('BUSY')); } catch {} return; }
        busy = true;
        trackPcmsWork(dispatch(message, port.sender))
          .then(v => { try { port.postMessage(v); } catch {} })
          .catch(() => { try { port.postMessage(fail('CANONICAL_HOLD')); } catch {} })
          .finally(() => { busy = false; });
      });
    });
    // No provider operation on startup or alarm. Recovery observes only IDB.
    trackPcmsWork(Promise.resolve().then(async () => {
      const restore = await sentinel.inspect();
      if (!restore.held) await (await canonical()).recover();
    })).catch(() => { /* read-only health reports CANONICAL_HOLD */ });
  }
  const trackedDispatch=(...args)=>trackPcmsWork(dispatch(...args));
  return Object.freeze({ register, dispatch:trackedDispatch, status });
}
if (typeof browser !== 'undefined') createCommandBoundary(browser).register();
