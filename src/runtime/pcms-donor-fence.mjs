// S01: installed only inside the same XPI donor state manager. No page/port API.
// A durable pcmsBindingId tag on a donor Persona means "network only through
// the PCMS route pin". Ordinary donor state edits, imports or storage events
// can never add, remove or transplant a tag; only a same-XPI one-commit permit
// may create a NEW Block-routed tagged Persona, or tag ONE existing untagged
// Persona in place (legacy account upgrade), or remove one explicitly
// archived account Persona with only the donor's reference cleanup.
const BLOCK='__block__';
const ids = v => typeof v === 'string' && /^[a-z0-9_-]{8,128}$/i.test(v);
const permits=new WeakSet();

export function issueBoundPersonaCreatePermit({bindingId}={}){
  if(!ids(bindingId))throw new TypeError('Invalid protected binding');
  const permit=Object.freeze({kind:'CREATE',bindingId});
  permits.add(permit);
  return permit;
}
export function issueExistingPersonaTagPermit({bindingId,contextId,personaUid}={}){
  if(!ids(bindingId)||typeof contextId!=='string'||!contextId||!ids(personaUid))
    throw new TypeError('Invalid protected binding');
  const permit=Object.freeze({kind:'TAG',bindingId,contextId,personaUid});
  permits.add(permit);
  return permit;
}
export function issueBoundPersonaDeletePermit({bindingId,contextId,personaUid}={}){
  if(!ids(bindingId)||typeof contextId!=='string'||!contextId||!ids(personaUid))
    throw new TypeError('Invalid protected binding');
  const permit=Object.freeze({kind:'DELETE',bindingId,contextId,personaUid});
  permits.add(permit);return permit;
}
function validateDeletePermit(before,after,permit){
  const prior=before?.profiles?.[permit.contextId];
  if(!prior||prior.pcmsBindingId!==permit.bindingId||prior.personaUid!==permit.personaUid||
    after?.profiles?.[permit.contextId])return false;
  const expected=structuredClone(before);delete expected.profiles[permit.contextId];
  if(expected.global?.unmanagedPolicy==='direct')expected.global.unmanagedPolicy='block';
  for(const script of Object.values(expected.scripts||{}))
    script.profileIds=(script.profileIds||[]).filter(id=>id!==permit.contextId);
  for(const workflow of Object.values(expected.workflows||{}))
    for(const step of workflow.steps||[])if(step.profileId===permit.contextId)step.profileId='';
  return JSON.stringify(expected)===JSON.stringify(after);
}
function validateTagPermit(before,after,permit){
  const a=before?.profiles||{};
  if(Object.values(a).some(p=>p?.pcmsBindingId===permit.bindingId))return false;
  const prior=a[permit.contextId],tagged=after?.profiles?.[permit.contextId];
  if(!prior||prior.pcmsBindingId||prior.managed!==true||
     String(prior.personaUid).toLowerCase()!==permit.personaUid.toLowerCase()||
     tagged?.pcmsBindingId!==permit.bindingId)return false;
  // The tag is the ONLY change in this commit (route, kill switch, all else equal).
  const candidate=structuredClone(after);
  if('pcmsBindingId' in prior)candidate.profiles[permit.contextId].pcmsBindingId=prior.pcmsBindingId;
  else delete candidate.profiles[permit.contextId].pcmsBindingId;
  return JSON.stringify(candidate)===JSON.stringify(before);
}
function validateCreatePermit(before,after,permit){
  if(!permit||!permits.delete(permit))return false;
  if(permit.kind==='TAG')return validateTagPermit(before,after,permit);
  if(permit.kind==='DELETE')return validateDeletePermit(before,after,permit);
  const a=before?.profiles||{},b=after?.profiles||{};
  if(Object.values(a).some(p=>p?.pcmsBindingId===permit.bindingId))return false;
  const added=Object.keys(b).filter(id=>!a[id]);
  if(added.length!==1)return false;
  const made=b[added[0]];
  if(made?.pcmsBindingId!==permit.bindingId||made.routeId!==BLOCK||made.managed!==true||
     made.status!=='active'||made.killSwitch!==true||made.blockLocalNetwork!==true)return false;
  // Nothing else in donor state may change in the same commit.
  const rest=structuredClone(after);delete rest.profiles[added[0]];
  return JSON.stringify(rest.profiles)===JSON.stringify(a)&&
    JSON.stringify({...rest,profiles:null})===JSON.stringify({...before,profiles:null});
}
export function bindingTagChanges(before, after) {
  const a=before?.profiles||{},b=after?.profiles||{};
  for(const [contextId,profile] of Object.entries(a)) {
    if(!ids(profile?.pcmsBindingId))continue;
    const candidate=b[contextId];
    if(!candidate || candidate.pcmsBindingId!==profile.pcmsBindingId ||
        candidate.personaUid!==profile.personaUid) return {ok:false,code:'PCMS_BINDING_TAG_MUTATION_HELD'};
  }
  for(const [contextId,profile] of Object.entries(b)) {
    if(profile?.pcmsBindingId && profile.pcmsBindingId!==a[contextId]?.pcmsBindingId)
      return {ok:false,code:'PCMS_BINDING_TAG_MUTATION_HELD'};
  }
  return {ok:true};
}
// Synchronous, before the donor's async save. Route changes of tagged
// Personas need no fence here: the per-request pin compares the live route.
export function beforeDonorStateCommit(before,after,permit=null) {
  if(permit!==null){
    if(!validateCreatePermit(before,after,permit))
      throw Object.assign(new Error('Protected binding create rejected'),
        {code:'PCMS_BINDING_CREATE_UNAUTHORIZED'});
    return {ok:true,created:true};
  }
  const change=bindingTagChanges(before,after);
  if(!change.ok)throw Object.assign(new Error('Protected Persona binding change blocked'),{code:change.code});
  return change;
}
