// S04/S02: metadata-only witness extracted from an independently
// authenticated, source-audited full inactive restore. Never derives proof
// from a live local snapshot or an archive filename/ACK.
const HEX=/^[a-f0-9]{64}$/,SHA=/^[a-f0-9]{40}$/;
const ID=/^[A-Za-z0-9_-]{8,100}$/;
const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const fail=()=>{throw Error('S04_RECOVERED_ADOPTION_INVALID');};
export function recoveredAdoptionWitnesses(pcms){
  if(pcms?.schema!==1||!Array.isArray(pcms?.stores?.meta))fail();
  const witnesses=[],seen=new Set();
  for(const {key,value} of pcms.stores.meta){
    if(typeof key!=='string'||!key.startsWith('adoption:'))continue;
    const slug=key.slice(9),a=value?.adoption;
    if(!SLUG.test(slug)||a?.slug!==slug||seen.has(slug))fail();
    seen.add(slug);
    if(a.archived===true||a.archiveState!=='ARCHIVED_GIT_CONFIRMED')continue;
    const original=a.original;
    if(!original||!HEX.test(original.fingerprint||'')||
       !ID.test(a.accountId||'')||!ID.test(a.personaUid||'')||
       !Number.isSafeInteger(a.revision)||a.revision<1||
       !Number.isSafeInteger(a.bindingVersion)||a.bindingVersion<1||
       !SHA.test(a.archiveCommit||'')||
       !ID.test(original.remotePublicId||'')||
       a.archiveRef!=='refs/tags/pcms-originals/'+
         original.remotePublicId+'/'+original.fingerprint)fail();
    witnesses.push(Object.freeze({
      slug,accountId:a.accountId,personaUid:a.personaUid,
      remotePublicId:original.remotePublicId,
      fingerprint:original.fingerprint,revision:a.revision,
      bindingVersion:a.bindingVersion,
      archiveCommit:a.archiveCommit,archiveRef:a.archiveRef
    }));
  }
  return Object.freeze(witnesses);
}
