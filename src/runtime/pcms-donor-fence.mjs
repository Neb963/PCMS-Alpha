// S01: installed only inside the same XPI donor background. No page/port API.
// Protected Persona tag removal is never an ordinary donor state edit.
const ids = v => typeof v === 'string' && /^[a-z0-9_-]{8,128}$/i.test(v);
const networkGlobals = g => Object.fromEntries([
  'enforcePrivacyControls','strictProxyVerification','unmanagedPolicy',
  'blockSpeculative','webRTCMode','mullvadNative'
].map(k=>[k,g?.[k]]));
let admission = null;
export function installDonorAdmissionFence(gate) {
  if (admission || !gate || typeof gate.invalidateNow !== 'function')
    throw new TypeError('S01 admission fence unavailable or already installed');
  admission = gate;
}
export function bindingTagChanges(before, after) {
  const a=before?.profiles||{},b=after?.profiles||{};
  const held=new Set();
  for(const [contextId,profile] of Object.entries(a)) {
    if(!ids(profile?.pcmsBindingId))continue;
    const candidate=b[contextId];
    if(!candidate || candidate.pcmsBindingId!==profile.pcmsBindingId ||
        candidate.personaUid!==profile.personaUid) return {ok:false,code:'PCMS_BINDING_TAG_MUTATION_HELD'};
    const routeA=before?.routes?.[profile.routeId], routeB=after?.routes?.[candidate.routeId];
    if(profile.routeId!==candidate.routeId ||
       profile.status!==candidate.status ||
       profile.killSwitch!==candidate.killSwitch ||
       profile.blockLocalNetwork!==candidate.blockLocalNetwork ||
       profile.domainMode!==candidate.domainMode ||
       JSON.stringify(profile.allowedDomains)!==JSON.stringify(candidate.allowedDomains) ||
       JSON.stringify(profile.blockedDomains)!==JSON.stringify(candidate.blockedDomains) ||
       profile.rotationRole!==candidate.rotationRole ||
       profile.rotationOperationId!==candidate.rotationOperationId ||
       JSON.stringify(routeA)!==JSON.stringify(routeB) ||
       JSON.stringify(networkGlobals(before?.global))!==JSON.stringify(networkGlobals(after?.global))) {
      held.add(profile.pcmsBindingId);
    }
  }
  // A prior empty marker may be installed only by an explicit separately
  // fenced S01 stage operation, not by an ordinary Set State/backup/import.
  for(const [contextId,profile] of Object.entries(b)) {
    if(profile?.pcmsBindingId && profile.pcmsBindingId!==a[contextId]?.pcmsBindingId)
      return {ok:false,code:'PCMS_BINDING_TAG_MUTATION_HELD'};
  }
  return {ok:true,held:[...held]};
}
export function beforeDonorStateCommit(before,after) {
  const change=bindingTagChanges(before,after);
  if(!change.ok)throw Object.assign(new Error('Protected Persona binding change blocked'),{code:change.code});
  if(change.held.length && !admission)
    throw Object.assign(new Error('Admission fence unavailable'),{code:'PCMS_ADMISSION_FENCE_UNAVAILABLE'});
  // Synchronous safety linearization BEFORE donor async save. On save failure
  // grant remains withdrawn. Not all unrelated Persona edits cause revocation.
  for(const bindingId of change.held) admission.invalidateNow({bindingId,reason:'ROUTE_DRIFT'});
  return change;
}
// A browser.storage.onChanged callback cannot import untrusted tag deletion
// while bypassing the guarded donor mutation serializer.
export function beforeDonorExternalStorageAccept(before,after) {
  return beforeDonorStateCommit(before,after);
}
