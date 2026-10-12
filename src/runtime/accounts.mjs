// I03 canonical account authority. No provider tokens or raw browser/container IDs
// are stored. The donor remains the sole Persona, route and tab authority.
import { fail, isSafeId } from './journal.mjs';

const uid = v => typeof v === 'string' && /^[a-z0-9-]{8,128}$/i.test(v);
const digest = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const active = a => a && a.state !== 'ARCHIVED';
const key = id => 'account:' + id;
const reasons = new Set(['IDENTITY_UNOBSERVABLE','CHALLENGE','SESSION_UNAVAILABLE']);
const allowed = new Set(['ENROLL','ACK_LOGIN','VERIFY','MANUAL_OVERRIDE','ARCHIVE','REBIND']);

export function transitionAccount(previous, action, all = []) {
  if (!action || !allowed.has(action.type) || !isSafeId(action.accountId))
    return fail('INVALID_ACCOUNT_COMMAND');
  if (action.type === 'ENROLL') {
    if (previous) return fail('ACCOUNT_ALREADY_EXISTS');
    if (action.expectedRevision !== 0 || !uid(action.personaUid)) return fail('INVALID_BINDING');
    if (all.some(a => active(a) && a.personaUid.toLowerCase() === action.personaUid.toLowerCase()))
      return fail('PERSONA_ALREADY_BOUND');
    return {ok:true, account:{ accountId:action.accountId, personaUid:action.personaUid,
      state:'WAITING_LOGIN', revision:1, bindingVersion:1, identity:null, override:null },
      event:'ENROLLED'};
  }
  if (!previous) return fail('ACCOUNT_NOT_FOUND');
  if (!Number.isSafeInteger(action.expectedRevision) ||
      previous.revision !== action.expectedRevision) return fail('STALE_REVISION');
  if (action.type === 'ARCHIVE') {
    if (!active(previous)) return fail('ALREADY_ARCHIVED');
    return {ok:true,account:{...previous,state:'ARCHIVED',
      identity:null, override:null, revision:previous.revision+1},event:'ARCHIVED'};
  }
  if (!active(previous)) return fail('ACCOUNT_ARCHIVED');
  let state, identity=previous.identity, override=previous.override, personaUid=previous.personaUid;
  let bindingVersion=previous.bindingVersion;
  switch (action.type) {
    case 'ACK_LOGIN':
      if (!['WAITING_LOGIN','REBIND_PENDING'].includes(previous.state)) return fail('INVALID_ACCOUNT_STATE');
      state='VERIFICATION_PENDING'; identity=null; override=null; break;
    case 'MANUAL_OVERRIDE':
      if (!['WAITING_LOGIN','VERIFICATION_PENDING','REBIND_PENDING','OVERRIDDEN'].includes(previous.state) ||
          !reasons.has(action.reason) || action.acknowledgeLimitedAuthority !== true)
        return fail('OVERRIDE_NOT_AUTHORIZED');
      state='OVERRIDDEN'; identity=null;
      override={source:'OPERATOR',reason:action.reason, consentRevision:previous.revision+1,
        grantsProviderMutation:false}; break;
    case 'VERIFY': {
      // This state transition is only invoked by a privileged readback adapter,
      // never directly by a UI message or a manual declaration.
      const proof=action.proof;
      if (!['WAITING_LOGIN','VERIFICATION_PENDING','OVERRIDDEN','REBIND_PENDING','VERIFIED'].includes(previous.state) ||
          proof?.source !== 'GUARDED_SESSION_READBACK' || proof.verified !== true ||
          proof.personaUid !== previous.personaUid || !digest(proof.principalFingerprint) ||
          !isSafeId(proof.observationId))
        return fail('INDEPENDENT_IDENTITY_PROOF_REQUIRED');
      if (all.some(a => active(a) && a.accountId !== action.accountId &&
          a.identity?.principalFingerprint === proof.principalFingerprint))
        return fail('IDENTITY_ALREADY_BOUND');
      identity={principalFingerprint:proof.principalFingerprint,observationId:proof.observationId,
        source:'GUARDED_SESSION_READBACK',bindingVersion};
      state='VERIFIED'; override=null; break;
    }
    case 'REBIND':
      if (!uid(action.personaUid) || action.personaUid === previous.personaUid ||
          action.explicitRepair !== true) return fail('REBIND_NOT_AUTHORIZED');
      if (all.some(a => active(a) && a.accountId !== action.accountId &&
          a.personaUid.toLowerCase() === action.personaUid.toLowerCase()))
        return fail('PERSONA_ALREADY_BOUND');
      personaUid=action.personaUid; bindingVersion=previous.bindingVersion+1;
      state='REBIND_PENDING'; identity=null; override=null; break;
    default: return fail('INVALID_ACCOUNT_COMMAND');
  }
  return {ok:true,account:{...previous,personaUid,bindingVersion,state,identity,override,
    revision:previous.revision+1},event:action.type};
}

export function createAccountStore(db) {
  function transact(mode, fn) {
    return new Promise((resolve,reject)=>{
      let tx, result=fail('TRANSACTION_INCOMPLETE');
      try { tx=db.transaction(mode==='readonly'?['meta']:['meta','events'],mode); }
      catch {reject(new Error('ACCOUNT_DB_UNAVAILABLE'));return;}
      tx.oncomplete=()=>resolve(result);
      tx.onabort=()=>reject(new Error('ACCOUNT_DB_ABORTED'));
      tx.onerror=()=>{};
      try {fn(tx, value=>{result=value;});}
      catch {try{tx.abort();}catch{}}
    });
  }
  // One IndexedDB readwrite transaction scans the small account keyspace,
  // checks exclusivity, and writes the next account before commit acknowledgement.
  function apply(action) {
    if (!action || !isSafeId(action.accountId)) return Promise.resolve(fail('INVALID_ACCOUNT_COMMAND'));
    return transact('readwrite',(tx,finish)=>{
      const meta=tx.objectStore('meta'), all=[];
      meta.openCursor().onsuccess=e=>{
        const cur=e.target.result;
        if (cur) {
          if (typeof cur.key==='string' && cur.key.startsWith('account:'))
            all.push(cur.value?.account);
          cur.continue();return;
        }
        const previous=all.find(a=>a?.accountId===action.accountId)||null;
        const result=transitionAccount(previous,action,all);
        if (result.ok) {
          meta.put({key:key(action.accountId),account:result.account});
          tx.objectStore('events').add({stage:'ACCOUNT_'+result.event,
            accountId:action.accountId,revision:result.account.revision});
        }
        finish(result);
      };
    });
  }
  function list() {
    return transact('readonly',(tx,finish)=>{
      const rows=[];
      tx.objectStore('meta').openCursor().onsuccess=e=>{
        const cur=e.target.result;
        if (!cur) {finish({ok:true,accounts:rows.slice(0,1000),
          truncated:rows.length>1000});return;}
        if (typeof cur.key==='string' && cur.key.startsWith('account:') && cur.value?.account)
          rows.push(cur.value.account);
        cur.continue();
      };
    });
  }
  function get(accountId) {
    if (!isSafeId(accountId)) return Promise.resolve(fail('INVALID_ACCOUNT_COMMAND'));
    return transact('readonly',(tx,finish)=>{
      tx.objectStore('meta').get(key(accountId)).onsuccess=e=>{
        const account=e.target.result?.account;
        finish(account?{ok:true,account}:fail('ACCOUNT_NOT_FOUND'));
      };
    });
  }
  return Object.freeze({apply,list,get});
}

// Account command replies do not expose session fingerprints, cookieStoreIds,
// user names, cookies, or evidence IDs.
export function publicAccount(account) {
  return {accountId:account.accountId,personaUid:account.personaUid,state:account.state,
    revision:account.revision,bindingVersion:account.bindingVersion,
    identity:account.identity?'VERIFIED':'UNVERIFIED',
    override:account.override?.reason||null,providerWrites:'OFF'};
}
