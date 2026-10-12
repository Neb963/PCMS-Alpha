// I04 Perchance read-only compatibility interpreter. It does NOT make HTTP
// requests, read session tokens, inject page code or confer write authority.
// The caller must be a separately qualified donor-owned guarded page executor
// that keeps email and token wholly inside the Perchance page and reports
// independently observed response statuses. No executor is installed yet.
import { fail, isSafeId } from './journal.mjs';

const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const HEX=/^[a-f0-9]{64}$/;
const MAX=5000;
const own = value => Object.prototype.toString.call(value)==='[object Object]' &&
  (Object.getPrototypeOf(value)===Object.prototype || Object.getPrototypeOf(value)===null);
const safeSlug=v=>typeof v==='string'&&SLUG.test(v);

export function classifySessionResponse(httpStatus, payload) {
  // No success from a local loggedIn flag, cookie presence or an HTTP 200
  // alone. Historical Perchance: POST /api/getGeneratorsByUser, status success.
  if(httpStatus!==200||!own(payload))return fail('SESSION_PROBE_UNAVAILABLE');
  if(payload.status==='session-token-error')return fail('SESSION_REJECTED');
  if(payload.status!=='success')return fail('SESSION_PROBE_UNAVAILABLE');
  if(!Array.isArray(payload.generators)||payload.generators.length>MAX ||
     !own(payload.generatorFolderMap))return fail('SESSION_SCHEMA_UNVERIFIED');
  return {ok:true,count:payload.generators.length};
}

export function classifyOwnerResponse(httpStatus,payload) {
  if(httpStatus!==200||!own(payload))return fail('OWNER_READBACK_UNAVAILABLE');
  if(payload.status==='is-owner')return {ok:true,ownerResult:'IS_OWNER'};
  if(payload.status==='is-not-owner')return {ok:true,ownerResult:'NOT_OWNER'};
  if(payload.status==='session-token-error')return fail('SESSION_REJECTED');
  return fail('OWNER_READBACK_UNAVAILABLE');
}

export function normalizeReadOnlyInventory({
  sessionReply, items, ownerReplies, account, context, observationId, observedAt
}) {
  if(!account||account.state!=='VERIFIED'||account.identity?.source!=='GUARDED_SESSION_READBACK'||
     !HEX.test(account.identity.principalFingerprint)||
     account.identity.bindingVersion!==account.bindingVersion)
    return fail('ACCOUNT_IDENTITY_UNVERIFIED');
  if(!context||context.accountId!==account.accountId||
     context.accountRevision!==account.revision||
     context.personaUid!==account.personaUid||
     context.bindingVersion!==account.bindingVersion||
     context.principalFingerprint!==account.identity.principalFingerprint)
    return fail('SESSION_CONTEXT_CHANGED');
  const confirmed=classifySessionResponse(sessionReply?.httpStatus,sessionReply?.body);
  if(!confirmed.ok)return confirmed;
  // Only records from the exact authenticated inventory reply may be
  // normalized. Local page edits, folder names or collaboration links are
  // never substituted as an owned account's generator inventory.
  if(items!==sessionReply.body.generators||!Array.isArray(items)||
     !(ownerReplies instanceof Map) || ownerReplies.size!==items.length)
    return fail('INVENTORY_PROOF_MISMATCH');
  const seen=new Set(),result=[];
  for(const entry of items) {
    if(!own(entry))return fail('INVENTORY_SCHEMA_UNVERIFIED');
    // Accepted historical discovery did not prove a stable server-assigned
    // generator ID. Treat name as a locator ONLY; never immutable identity.
    const slug=entry.generatorName ?? entry.name;
    if(!safeSlug(slug)||seen.has(slug)||typeof entry.isPrivate!=='boolean')
      return fail('INVENTORY_SCHEMA_UNVERIFIED');
    seen.add(slug);
    const reply=ownerReplies.get(slug);
    const owner=classifyOwnerResponse(reply?.httpStatus,reply?.body);
    if(!owner.ok)return owner;
    result.push({
      slug,remoteId:'slug-'+slug,identityBasis:'SLUG_ONLY',
      ownerResult:owner.ownerResult,
      ownerPrincipalFingerprint:owner.ownerResult==='IS_OWNER'?account.identity.principalFingerprint:null,
      ownerObservationId:owner.ownerResult==='IS_OWNER'?observationId:null,
      visibility:entry.isPrivate?'UNLISTED':'PUBLIC'
    });
  }
  if(ownerReplies.size!==seen.size||![...ownerReplies.keys()].every(s=>seen.has(s)))
    return fail('INVENTORY_PROOF_MISMATCH');
  if(!isSafeId(observationId)||!Number.isSafeInteger(observedAt)||observedAt<=0)
    return fail('INVALID_OBSERVATION_CONTEXT');
  return {ok:true,observation:{
    source:'GUARDED_PERCHANCE_READBACK',complete:true,
    accountId:account.accountId,personaUid:account.personaUid,
    accountRevision:account.revision,bindingVersion:account.bindingVersion,
    principalFingerprint:account.identity.principalFingerprint,
    observationId,observedAt,generators:result
  }};
}

// Adapter for a FUTURE verified donor-owned page executor. Not automatically
// installed in production; no caller-supplied page claim or fake can be
// promoted to proof. No raw email, token, headers or page content in output.
export function createReadOnlyInterpreter({
  readProtectedPage, now=()=>Date.now(),newObservationId=()=>crypto.randomUUID().replaceAll('-','')
}) {
  if(typeof readProtectedPage!=='function')throw TypeError('Qualified protected-page executor required');
  return async function inventoryReader(context,account) {
    const packet=await readProtectedPage(context);
    if(!packet)return null;
    const value=normalizeReadOnlyInventory({
      sessionReply:packet.sessionReply,
      items:packet.sessionReply?.body?.generators,
      ownerReplies:packet.ownerReplies,context,account,
      observationId:newObservationId(),observedAt:now()
    });
    return value.ok?value.observation:null;
  };
}
