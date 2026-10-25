// Portable profiles carry history, never a transferable protection marker.
// Reuse only the identity actually owned by the destination donor container.
export function destinationOwnedPortable(payload,current,mappings){
 return {...payload,personas:(payload.personas||[]).map(entry=>{
  const target=current.profiles?.[mappings[entry.key]];
  if(!target?.personaUid)throw Error('RESTORE_TARGET_IDENTITY_UNVERIFIED');
  const profile={...entry.profile,personaUid:target.personaUid};
  delete profile.pcmsBindingId;
  if(target.pcmsBindingId)profile.pcmsBindingId=target.pcmsBindingId;
  return {...entry,profile};
 })};
}
export function restoredTargetBindings(personas){
 return Object.fromEntries((personas||[]).map(p=>[p.targetUid,p.bindingId||null]));
}
