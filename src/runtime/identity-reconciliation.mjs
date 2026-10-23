// A03: an authenticated slug observation is only a locator. A provider
// public ID may supersede that locator only at full original-source readback,
// under the same verified account/Persona/owner and in one canonical commit.
const slug=/^[a-z0-9][a-z0-9-]{0,99}$/;
const publicId=/^public_[A-Za-z0-9_-]{1,90}$/;
const hex=/^[0-9a-f]{64}$/;
const fail=code=>({ok:false,code});
export function planOriginalIdentityMigration(row,account,original,link=null){
  if(!row||!account||!original||
     !slug.test(row.slug||'')||
     row.accountId!==account.accountId||
     row.personaUid!==account.personaUid||
     row.bindingVersion!==account.bindingVersion||
     account.identity?.bindingVersion!==account.bindingVersion||
     account.identity?.source!=='GUARDED_SESSION_READBACK'||
     row.ownerState!=='OBSERVED_OWNER'||
     original.source!=='INDEPENDENT_FULL_BYTE_READBACK'||
     original.ok!==true||
     !publicId.test(original.remotePublicId||'')||
     !hex.test(original.fingerprint||'')||
     !Number.isSafeInteger(original.observedAt)||original.observedAt<=0)
    return fail('IDENTITY_PROOF_UNVERIFIED');
  // A linked source may already use the immutable ID even while historical
  // inventory remains slug-keyed. It must never point to a third identity.
  if(link&&(link.slug!==row.slug||link.accountId!==row.accountId||
     link.bindingVersion!==row.bindingVersion||
     (link.personaUid&&link.personaUid!==row.personaUid)||
     link.remoteId!==original.remotePublicId))
    return fail('IDENTITY_SOURCE_LINK_CONFLICT');
  if(row.remoteId===original.remotePublicId)
    return {ok:true,changed:false,record:row,proof:'EXACT_PUBLIC_ID'};
  if(row.remoteId!=='slug-'+row.slug)
    return fail('IDENTITY_PUBLIC_ID_CONFLICT');
  if(row.identitySchema&&row.identitySchema!==2)
    return fail('IDENTITY_SCHEMA_UNSUPPORTED');
  const alias={
    schema:2,slug:row.slug,accountId:row.accountId,
    personaUid:row.personaUid,bindingVersion:row.bindingVersion,
    previousId:row.remoteId,publicId:original.remotePublicId,
    originalFingerprint:original.fingerprint,
    observedAt:original.observedAt,
    evidence:'INDEPENDENT_FULL_BYTE_READBACK'
  };
  const record={...row,remoteId:original.remotePublicId,identitySchema:2,
    identityBasis:'INDEPENDENT_FULL_BYTE_READBACK',
    identityAliases:[row.remoteId],identityProof:{
      source:'ORIGINAL_SOURCE_READBACK',fingerprint:original.fingerprint,
      observedAt:original.observedAt},
    revision:row.revision+1};
  return {ok:true,changed:true,record,alias};
}
