// S01 donor-owned per-request admission gate. Runtime grants are never restored.
// No browser, PCMS port, provider or native side effects exist in this module.
const FIELDS = Object.freeze(['bindingId','assignmentEpoch','personaUid','routeId','contextId',
  'routeRevision','evidenceId','reservationId','allocationRevision','ledgerEpoch',
  'exitSetDigest','grantRevision','pcmsEpoch']);
const ID = /^[a-z0-9_-]{8,128}$/i;
const HEX = /^[0-9a-f]{64}$/;
export const admissionKeyOf = input => Object.fromEntries(FIELDS.map(k=>[k,input?.[k]]));
const equal = (a,b) => FIELDS.every(k=>a?.[k] === b?.[k]);
const safeInt = n => Number.isSafeInteger(n) && n > 0;

export function validAdmissionKey(key) {
  return key && typeof key==='object' && !Array.isArray(key) &&
    Object.keys(key).length===FIELDS.length &&
    FIELDS.every(k=>Object.hasOwn(key,k)) &&
    FIELDS.filter(k=>!['routeRevision','allocationRevision','grantRevision'].includes(k))
      .every(k=> k==='exitSetDigest' ? HEX.test(key[k]) : ID.test(key[k])) &&
    ['routeRevision','allocationRevision','grantRevision'].every(k=>safeInt(key[k]));
}

// A profile is marked only by a donor-owned durable field, never by a tab URL,
// a page/port assertion or a PCMS in-memory account list.
export function createProtectedAdmission({readCommitted, now=Date.now, donorBootId}) {
  if(typeof readCommitted!=='function'||!ID.test(donorBootId))
    throw new TypeError('Trusted admission dependencies missing');
  let lastTime=0;
  let clockInvalid=false;
  const generations=new Map(), grants=new Map(), latches=new Set();
  const publication=new Map(), highestRevision=new Map();
  function clock() {
    const t=now();
    if(!Number.isSafeInteger(t)||t<=0||t<lastTime) clockInvalid=true;
    else lastTime=t;
    return clockInvalid?null:t;
  }
  function generation(bindingId){return generations.get(bindingId)||0;}
  function invalidateNow({bindingId,reason='CONFLICT'}={}) {
    if(bindingId!==undefined && !ID.test(bindingId))throw new TypeError('Invalid binding');
    if(bindingId) {
      generations.set(bindingId,generation(bindingId)+1);
      grants.delete(bindingId);latches.add(bindingId);
      publication.delete(bindingId);
      return Object.freeze({safetyGeneration:generation(bindingId),reason});
    }
    const affected=new Set([...generations.keys(),...grants.keys(),...publication.keys()]);
    for(const id of affected){
      generations.set(id,generation(id)+1);grants.delete(id);
      publication.delete(id);latches.add(id);
    }
    return Object.freeze({safetyGeneration:null,reason});
  }
  // Called ONLY by a trusted observer after the canonical transaction commits.
  // It cannot introduce a network grant: admit has a separate linearization.
  function publishCommitted(key, committed) {
    const t=clock();
    if(!t||!validAdmissionKey(key)||!equal(key,committed)||
      committed?.authority!=='BOUND_ACCOUNT_NETWORK'||
      committed.publicationSafetyGeneration!==generation(key.bindingId)||
      !Number.isSafeInteger(committed.snapshotValidUntil)||
      committed.snapshotValidUntil<=t)return {ok:false,code:'COMMITTED_AUTHORITY_INVALID'};
    if(key.grantRevision <= (highestRevision.get(key.bindingId)||0))
      return {ok:false,code:'STALE_GRANT_REVISION'};
    highestRevision.set(key.bindingId,key.grantRevision);
    publication.set(key.bindingId,{key:{...key},validUntil:committed.snapshotValidUntil,
      safetyGeneration:generation(key.bindingId)});
    latches.delete(key.bindingId);
    return {ok:true};
  }
  // Admit only after all awaited state and effect operations. No await after
  // comparing committed snapshot, safety generation and installing the grant.
  function admit(key,{evidenceValidUntil,expectedSafetyGeneration,routeRevision}={}) {
    const t=clock();
    const p=publication.get(key?.bindingId);
    if(!t||!p||!validAdmissionKey(key)||!equal(key,p.key)||
      expectedSafetyGeneration!==generation(key.bindingId)||
      p.safetyGeneration!==generation(key.bindingId)||latches.has(key.bindingId)||
      routeRevision!==key.routeRevision ||
      !Number.isSafeInteger(evidenceValidUntil)||evidenceValidUntil<=t ||
      p.validUntil<=t)return {ok:false,code:'ADMISSION_HELD'};
    let decision;
    try{decision=readCommitted(key);}catch{return {ok:false,code:'OBSERVER_UNAVAILABLE'};}
    if(!decision?.allow||!equal(decision.committed,key)||
      decision.committed.publicationSafetyGeneration!==generation(key.bindingId)||
      decision.committed.snapshotValidUntil!==p.validUntil)
      return {ok:false,code:'LEDGER_NOT_COMMITTED'};
    const grant=Object.freeze({...key,grantId:crypto.randomUUID(),
      donorBootId,safetyGeneration:generation(key.bindingId),
      expiresAt:Math.min(p.validUntil,evidenceValidUntil)});
    grants.set(key.bindingId,grant);
    return {ok:true,grant};
  }
  function inspect(profile) {
    if(typeof profile?.pcmsBindingId!=='string')return {managed:false,allow:true};
    const bindingId=profile.pcmsBindingId;
    const t=clock();
    const grant=grants.get(bindingId);
    const current=publication.get(bindingId);
    if(!ID.test(bindingId)||!t||!grant||!current||latches.has(bindingId)||
      grant.donorBootId!==donorBootId||grant.safetyGeneration!==generation(bindingId)||
      grant.expiresAt<=t||current.validUntil<=t||
      !equal(grant,current.key)||profile.personaUid!==grant.personaUid||
      profile.containerId!==grant.contextId||profile.routeId!==grant.routeId||
      profile.managed!==true||profile.status!=='active'||
      profile.killSwitch!==true || profile.blockLocalNetwork!==true)
      return {managed:true,allow:false,reason:'PCMS_ADMISSION_HELD'};
    // A cached in-memory grant is not independent authority. The trusted
    // synchronous observer must still attest this exact committed network
    // binding (or store/observer teardown immediately invalidates authority).
    let joined;
    try { joined=readCommitted(grant); } catch { joined=null; }
    if(!joined?.allow || !joined.committed || !equal(joined.committed,grant) ||
       joined.committed.authority!=='BOUND_ACCOUNT_NETWORK' ||
       joined.committed.publicationSafetyGeneration!==grant.safetyGeneration ||
       joined.committed.snapshotValidUntil!==current.validUntil) {
      invalidateNow({bindingId,reason:'CONFLICT'});
      return {managed:true,allow:false,reason:'PCMS_LEDGER_UNAVAILABLE'};
    }
    return {managed:true,allow:true,reason:'PCMS_ADMITTED'};
  }
  function describe(){return Object.freeze({admissionContract:2,networkGate:'PER_REQUEST_BOUNDED_GRANT',
    nativeCompatible:false, familyVerification:{ipv4:false,ipv6:false,verifiedBlocking:false},
    observationalInspector:false,runtimeWitness:false});}
  return Object.freeze({publishCommitted,admit,inspect,invalidateNow,describe,
    generation, // trusted local inspection only, not an external API
    isClockValid:()=>!clockInvalid});
}
