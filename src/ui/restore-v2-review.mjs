// S02: operator-reviewed native-file identity and destination binding.
// This hash is an authorization comparison, not a source of permissions.
import {digest} from './backup-core.mjs';
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const reject=code=>{throw Error(code)};
function values(value,accepted){
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).length>10000)reject('RESTORE_V2_MAPPING_INVALID');
  const out=Object.create(null);
  for(const [key,v] of Object.entries(value).sort(([a],[b])=>a<b?-1:a>b?1:0)){
    if(key.length===0||key.length>256||typeof v!=='string'||v.length>256||
       !accepted(v))reject('RESTORE_V2_MAPPING_INVALID');
    out[key]=v;
  }
  return out;
}
export async function reviewV2NativePlan({
  runId,ciphertextSha256,preparedSha256,cutDigest,destinationSha256,
  checkpointSha256,mappings,accountChoices
}={}){
  if(!/^s02_[a-f0-9]{32}$/.test(runId||'')||
     ![ciphertextSha256,preparedSha256,cutDigest,destinationSha256,
       checkpointSha256].every(hex)||
     ciphertextSha256!==checkpointSha256)
    reject('RESTORE_V2_REVIEW_PROOF_INVALID');
  const safeMappings=values(mappings,v=>v==='__create__'||/^firefox-container-[0-9]+$/.test(v));
  const safeChoices=values(accountChoices,v=>['INCLUDE_INACTIVE','EXCLUDE'].includes(v));
  const plan=Object.freeze({schema:1,kind:'S02-REVIEWED-NATIVE-FRESH-REPLACE',
    runId,archiveSha256:ciphertextSha256,preparedSha256,cutDigest,
    destinationSha256,checkpointSha256,
    mode:'replace',fresh:true,mappings:safeMappings,accountChoices:safeChoices,
    activation:'OFF',providerEffects:'OFF',donorController:'RESTORE_HELD'});
  return Object.freeze({plan,planSha256:await digest(JSON.stringify(plan))});
}
