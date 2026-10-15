// Detached H-04 review signatures cannot be replaced by page/UI support flags.
import {hex,MARKER_POLICY,REFRESH_METHOD} from './refresh-marker.mjs';
import {fail} from './journal.mjs';
export const canonicalJson=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?
  Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const bytes=s=>Uint8Array.from(atob(s),x=>x.charCodeAt(0));
export async function digestReview(value){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',
  new TextEncoder().encode(canonicalJson(value))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function publicReviewKey(j){
  if(j?.kty!=='EC'||j.crv!=='P-256'||typeof j.x!=='string'||typeof j.y!=='string'||
    !/^[A-Za-z0-9_-]{43}$/.test(j.x)||!/^[A-Za-z0-9_-]{43}$/.test(j.y)||j.d!==undefined)return null;
  return {kty:'EC',crv:'P-256',x:j.x,y:j.y};
}
export async function verifyRefreshReview(envelope,{reviewer,record,proof,resource,now}){
  try{
    const p=envelope?.payload,j=publicReviewKey(reviewer?.publicKey);
    if(!j||reviewer.revoked||reviewer.fingerprint!==await digestReview(j)||
      typeof envelope.signature!=='string'||envelope.signature.length>128)return fail('H04_TRUSTED_SIGNATURE_REQUIRED');
    const publicKey=await crypto.subtle.importKey('jwk',j,{name:'ECDSA',namedCurve:'P-256'},false,['verify']);
    if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},publicKey,bytes(envelope.signature),
      new TextEncoder().encode(canonicalJson(p))))return fail('H04_SIGNATURE_INVALID');
    if(p?.schema!==1||p.kind!=='PCMS_H04_REVIEW'||p.method!==REFRESH_METHOD||p.policy!==MARKER_POLICY||
      p.slug!==record.slug||p.accountId!==record.accountId||p.personaUid!==record.personaUid||
      p.bindingVersion!==record.bindingVersion||p.principalFingerprint!==record.principalFingerprint||
      p.approvedBaseFingerprint!==record.approvedBaseFingerprint||
      p.operationId!==proof?.id||proof?.effect!=='EFFECT_CONFIRMED'||proof.feed?.state!=='PRESENT'||
      p.expectedPostSaveFingerprint!==proof.marker?.effectiveCurrentFingerprint||
      p.feedObservedAt!==proof.feed.at||p.feedRank!==proof.feed.rank||
      !Number.isSafeInteger(p.reviewedAt)||p.reviewedAt<proof.feed.at||p.reviewedAt>now||
      !Number.isSafeInteger(p.validUntil)||p.validUntil<=now||p.validUntil>now+30*86400000||
      p.repeatedUsePermitted!==true||typeof p.permissionEvidence!=='string'||
      !/^[A-Za-z0-9_.:/-]{8,240}$/.test(p.permissionEvidence)||
      !Number.isSafeInteger(p.minimumIntervalMs)||p.minimumIntervalMs<600000||p.minimumIntervalMs>86400000||
      !resource||resource.kind!=='PACKAGED_LOCAL_RESOURCE_MEASUREMENT'||resource.accounts<50||resource.generators<1000||
      resource.maxConcurrentSaves!==1||!hex(resource.digest)||p.resourceDigest!==resource.digest||
      !Number.isFinite(p.maxTurnMs)||p.maxTurnMs<resource.turnMs||p.maxTurnMs>10000)
      return fail('H04_SCOPE_OR_EVIDENCE_MISMATCH');
    return {ok:true,qualification:{method:REFRESH_METHOD,policy:MARKER_POLICY,
      evidenceId:proof.id,reviewDigest:await digestReview(p),reviewerFingerprint:reviewer.fingerprint,
      resourceDigest:resource.digest,minimumIntervalMs:p.minimumIntervalMs,validUntil:p.validUntil,
      approvedBaseFingerprint:record.approvedBaseFingerprint,reviewedAt:p.reviewedAt}};
  }catch{return fail('H04_REVIEW_UNVERIFIED');}
}
