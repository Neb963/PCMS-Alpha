// S05 canonical bridge from a pinned S03 READY witness to staged binary
// source. Neither an operator supplied Git URL nor a declaration alone can
// authorize source mutation.
import {exactSource} from './staging-core.mjs';
const fail=code=>({ok:false,code});
const sha=/^[0-9a-f]{40}$/,sha64=/^[0-9a-f]{64}$/;
export async function stageReadyGitSource({catalog,coherent,ready,slug,repositoryId}){
  if(!catalog?.ok||catalog.complete!==true||
     catalog.source!=='PINNED_MAIN_READ_ONLY'||
     catalog.repositoryId!==repositoryId||
     !sha.test(catalog.head||'')||
     !coherent?.ok||coherent.code!=='READY_COHERENT_INPUT_PINNED'||
     coherent.pinnedHead!==catalog.head||
     coherent.slug!==slug||
     !sha64.test(coherent.inputFingerprint||''))
    return fail('S05_PINNED_MAIN_SOURCE_UNVERIFIED');
  const identifier=coherent.legacy?
    'legacy-'+coherent.declarationCommit+'-'+coherent.markerOid:
    'rev-'+coherent.token;
  if(!ready?.active||ready.desired||['READY_REVOKED_NOT_READY','OPERATOR_PAUSED'].includes(ready.hold)||
     ready.active.identifier!==identifier||
     ready.active.inputFingerprint!==coherent.inputFingerprint)
    return fail('S05_NEWER_READY_OR_NO_ADMISSION');
  if(!Array.isArray(coherent.files)||coherent.files.length<2||
     coherent.files.some(f=>!f||typeof f.base64!=='string'))
    return fail('S05_FULL_SOURCE_BYTES_MISSING');
  const candidate=await exactSource(coherent.files);
  if(!candidate.ok)return candidate;
  return {ok:true,candidate,source:{
    ok:true,ready:true,source:'S05_MAIN_COHERENT_FULL_BYTES',
    folder:'generators/'+slug,head:catalog.head,
    // Git input fingerprint is distinct from the independent staged
    // full-source fingerprint; never conflate their hash domains.
    fingerprint:coherent.inputFingerprint,
    testingSha:coherent.optionalTesting?.sha256||null,
    sourceBytes:coherent.files,
    gitReadyIdentifier:identifier,
    gitReadyInputFingerprint:coherent.inputFingerprint
  }};
}
