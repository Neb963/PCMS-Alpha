// Permanent, origin-independent fence for the unresolved historical I17 effect.
// This is a product/operation identifier fence, not an inferred remote outcome.
// It must be checked BEFORE any new CREATE/RENAME dispatch regardless of origin.
export const I17_QUARANTINED_BATCH = 'batch_e2c328e54f9c4a6ab89f1084134fde52';
export const I17_QUARANTINED_SLUG = 'pcms-test-esr-chain-20261015-a01';
export const I17_QUARANTINE_CODE = 'I17_ORIGINAL_EFFECT_QUARANTINED';

const normalize = value => typeof value === 'string' ? value.toLowerCase() : null;
export function isI17Quarantined(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return false;
  if (input.batchId === I17_QUARANTINED_BATCH ||
      input.itemId === I17_QUARANTINED_BATCH ||
      (typeof input.itemId === 'string' &&
       input.itemId.startsWith(I17_QUARANTINED_BATCH + '_'))) return true;
  for (const key of ['slug', 'requestedSlug', 'originalSlug', 'targetSlug',
    'candidateSlug', 'temporarySlug']) {
    if (normalize(input[key]) === I17_QUARANTINED_SLUG) return true;
  }
  return Array.isArray(input.slugs) &&
    input.slugs.some(value => normalize(value) === I17_QUARANTINED_SLUG);
}
export function admissionForI17Supply(kind, request) {
  if (['CREATE', 'RENAME', 'PREFLIGHT_CREATE', 'PREFLIGHT_RENAME'].includes(kind) &&
      isI17Quarantined(request)) {
    return {ok:false,code:I17_QUARANTINE_CODE,effectBoundary:'NOT_DISPATCHED'};
  }
  return {ok:true};
}
