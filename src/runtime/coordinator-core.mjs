// S00: fixed-function, effect-free intake and transition rules.
// External effects can only be introduced later at the independently proven
// donor/Git/native adapters. No generic action graph or callback execution.
import {isSafeId,fail} from './journal.mjs';
import {isI17Quarantined,I17_QUARANTINE_CODE} from './legacy-quarantine.mjs';

const slugPattern = /^[a-z0-9][a-z0-9-]{0,99}$/;
export function validateCreateIntent(intent) {
  if (!intent || typeof intent !== 'object' || Array.isArray(intent) ||
      Object.keys(intent).some(k => !['intentId','slug','origin','accountId'].includes(k)) ||
      !isSafeId(intent.intentId) || !slugPattern.test(intent.slug || '') ||
      intent.origin !== 'OPERATOR' ||
      (intent.accountId !== undefined && !isSafeId(intent.accountId))) {
    return fail('INVALID_CREATE_INTENT');
  }
  if (isI17Quarantined(intent)) return fail(I17_QUARANTINE_CODE);
  return {ok:true};
}
// Only admission intent is recorded by S00. A persisted hold is not proof
// of account, donor lease, source provenance or provider effect.
export function transitionCreateIntent(existing, command) {
  if (!command || typeof command !== 'object' || Array.isArray(command))
    return fail('INVALID_COMMAND');
  if (command.type === 'ACCEPT') {
    const v=validateCreateIntent(command.intent);
    if (!v.ok) return v;
    if (existing) {
      const same=existing.intentId===command.intent.intentId &&
        existing.slug===command.intent.slug &&
        existing.origin===command.intent.origin &&
        existing.accountId===(command.intent.accountId||null);
      return same ? {ok:true,duplicate:true,changed:false,record:existing} :
        fail('INTENT_ID_CONFLICT');
    }
    return {ok:true,changed:true,record:{
      intentId:command.intent.intentId,slug:command.intent.slug,
      origin:command.intent.origin,accountId:command.intent.accountId||null,
      revision:1,state:'WAITING_CAPABILITY',hold:'S01_PROTECTED_ADMISSION_UNPROVEN'
    }};
  }
  if (!existing || existing.intentId !== command.intentId)
    return fail('INTENT_NOT_FOUND');
  if (!Number.isSafeInteger(command.expectedRevision) ||
      existing.revision !== command.expectedRevision)
    return fail('STALE_REVISION');
  if (isI17Quarantined(existing)) return fail(I17_QUARANTINE_CODE);
  if (command.type==='ADVANCE') {
    // This is deliberately a non-effecting S00 transition. The next slice
    // will add an explicit protected-admission oracle, not a fallback route.
    return {ok:true,changed:false,record:existing,admitted:false,
      code:'S01_PROTECTED_ADMISSION_UNPROVEN'};
  }
  return fail('COMMAND_NOT_ALLOWED');
}
