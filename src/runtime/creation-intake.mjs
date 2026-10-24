// S04: pure coalescence of operator and verified pinned-main creation origins.
// This module has no provider/Git/route effect capability.
import {isI17Quarantined,I17_QUARANTINE_CODE} from './legacy-quarantine.mjs';

const slug=/^[a-z0-9][a-z0-9-]{0,99}$/;
const oid=/^[0-9a-f]{40}$/;
const repoId=/^[1-9][0-9]{0,19}$/;
const safeId=/^[A-Za-z0-9_-]{8,100}$/;
const fail=code=>({ok:false,code});
export function validateGitCreationWitness(w){
  if(!w||typeof w!=='object'||Array.isArray(w)||
    Object.keys(w).some(k=>!['slug','repository','repositoryId','head',
      'markerOid','complete','verifiedMain','initialImport'].includes(k))||
    !slug.test(w.slug||'')||!repoId.test(w.repositoryId||'')||
    typeof w.repository!=='string'||!/^[-.A-Za-z0-9_]+\/[-.A-Za-z0-9_]+$/.test(w.repository)||
    !oid.test(w.head||'')||!oid.test(w.markerOid||'')||
    w.complete!==true||w.verifiedMain!==true||
    (w.initialImport!==undefined&&(!w.initialImport||!Number.isSafeInteger(w.initialImport.revision)||w.initialImport.revision<1||
      !/^[a-f0-9]{64}$/.test(w.initialImport.scopeDigest||'')||w.initialImport.target?.slug!==w.slug||
      !(w.initialImport.folderTreeOid===null||oid.test(w.initialImport.folderTreeOid||'')))))return fail('UNVERIFIED_GIT_MAIN_WITNESS');
  if(isI17Quarantined(w))return fail(I17_QUARANTINE_CODE);
  return {ok:true};
}
const sourceKey=s=>s.type==='OPERATOR'?'operator:'+s.intentId:
  'git:'+s.repositoryId+':'+s.slug;
function normalizedSources(existing){
  if(Array.isArray(existing?.sources))return existing.sources;
  if(existing?.origin==='OPERATOR'&&safeId.test(existing.intentId||'')){
    return [{type:'OPERATOR',intentId:existing.intentId,accountId:existing.accountId||null}];
  }
  return [];
}
export function coalesceCreation(existing,source){
  if(!source||typeof source!=='object'||Array.isArray(source))return fail('INVALID_SOURCE');
  const git=source.type==='GITHUB_MAIN';
  if(git){
    if(!safeId.test(source.intentId||''))return fail('INVALID_SOURCE');
    const valid=validateGitCreationWitness(source.witness);
    if(!valid.ok)return valid;
  }else if(source.type!=='OPERATOR'||!safeId.test(source.intentId||'')||
    !slug.test(source.slug||'')||
    (source.accountId!==null&&source.accountId!==undefined&&!safeId.test(source.accountId))){
    return fail('INVALID_SOURCE');
  }
  const requestedSlug=git?source.witness.slug:source.slug;
  if(isI17Quarantined({slug:requestedSlug}))return fail(I17_QUARANTINE_CODE);
  if(existing&&existing.slug!==requestedSlug)return fail('SLUG_MISMATCH');
  const nextSource=git?{type:'GITHUB_MAIN',repositoryId:source.witness.repositoryId,
    repository:source.witness.repository,slug:requestedSlug,
    markerOid:source.witness.markerOid,head:source.witness.head,
    ...(source.witness.initialImport?{initialImport:structuredClone(source.witness.initialImport)}:{})}:
    {type:'OPERATOR',intentId:source.intentId,accountId:source.accountId||null};
  const prior=normalizedSources(existing);
  const idx=prior.findIndex(s=>sourceKey(s)===sourceKey(nextSource));
  // A second repository is not silently permitted to claim the same source folder.
  if(git&&prior.some(s=>s.type==='GITHUB_MAIN'&&
       s.repositoryId!==nextSource.repositoryId))return fail('GIT_REPOSITORY_COLLISION');
  if(!git&&prior.some(s=>s.type==='OPERATOR'&&s.intentId===source.intentId&&
       s.accountId!==(source.accountId||null)))return fail('INTENT_ID_CONFLICT');
  const pins=new Set(prior.filter(s=>s.type==='OPERATOR'&&s.accountId)
    .map(s=>s.accountId));
  if(!git&&source.accountId)pins.add(source.accountId);
  const pinConflict=pins.size>1||
    (!!existing?.accountId&&[...pins].some(p=>p!==existing.accountId));
  const selectedPin=!pinConflict&&pins.size===1?[...pins][0]:null;
  if(idx>=0&&git&&nextSource.initialImport&&JSON.stringify(prior[idx].initialImport||null)!==JSON.stringify(nextSource.initialImport)){
    if(nextSource.initialImport.revision<=(prior[idx].initialImport?.revision||0))return fail('INITIAL_IMPORT_UNREVIEWED_BINDING_CHANGED');
    const sources=prior.slice();sources[idx]=nextSource;
    return {ok:true,changed:true,record:{...existing,sources,revision:existing.revision+1,
      ...((existing.sourceDriftReason||existing.hold)==='GIT_SOURCE_CHANGED_WITH_ACTIVE_OPERATION'?{sourceDrift:false,sourceDriftReason:null,hold:null}:{})}};
  }
  if(idx>=0&&git&&prior[idx].markerOid===nextSource.markerOid){
    if(JSON.stringify(prior[idx].initialImport||null)===JSON.stringify(nextSource.initialImport||null)||!nextSource.initialImport)
      return {ok:true,duplicate:true,changed:false,record:existing};
    return fail('INITIAL_IMPORT_UNREVIEWED_BINDING_CHANGED');
  }
  if(idx>=0&&git&&existing?.state==='ASSOCIATED_NOT_READY'&&!existing.sourceDrift&&!existing.pinConflict){
    const sources=prior.slice();sources[idx]=nextSource;
    return {ok:true,changed:true,record:{...existing,sources,revision:existing.revision+1}};
  }
  if(idx>=0&&git&&existing?.sourceDrift===true)
    return {ok:true,duplicate:true,changed:false,record:existing};
  if(idx>=0&&git&&existing?.state!=='WAITING_CAPABILITY'){
    // A new Git source fingerprint after any downstream admission must
    // not replace the evidence to which the possible effect was bound.
    return {ok:true,changed:true,conflict:true,
      record:{...existing,revision:existing.revision+1,
        hold:'GIT_SOURCE_CHANGED_WITH_ACTIVE_OPERATION',sourceDriftReason:'GIT_SOURCE_CHANGED_WITH_ACTIVE_OPERATION',sourceDrift:true}};
  }
  if(idx>=0&&JSON.stringify(prior[idx])===JSON.stringify(nextSource))
    return {ok:true,duplicate:true,changed:false,record:existing};
  const sources=prior.slice();
  if(idx>=0)sources[idx]=nextSource;else sources.push(nextSource);
  const record=existing?{...existing,sources,revision:existing.revision+1,
    accountId:existing.accountId||
      (existing.state==='WAITING_CAPABILITY'?selectedPin:null),
    ...(pinConflict?{hold:'ACCOUNT_PIN_CONFLICT',pinConflict:true}:{} )}:
    {intentId:source.intentId,slug:requestedSlug,origin:git?'GITHUB_MAIN':'OPERATOR',
      accountId:git?null:source.accountId||null,revision:1,
      sources,state:'WAITING_CAPABILITY',hold:'S04_ADMISSION_NOT_VERIFIED'};
  // New origin/readback never clears uncertain provider state, source locks or
  // previous decision. A change of Git HEAD alone is not permission to deploy.
  return {ok:true,duplicate:false,changed:true,conflict:!!pinConflict,record};
}
