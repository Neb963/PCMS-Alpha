// Exact, versioned remote derivation of reviewed F. No source is ignored.
import {exactSource} from './staging-core.mjs';
import {fail} from './journal.mjs';
export const MARKER_POLICY='html_prefix_v1', REFRESH_METHOD='GUARDED_SOURCE_SAVE';
export const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
export const opId=s=>typeof s==='string'&&/^[a-f0-9]{32}$/.test(s);
export function encodeText(s){
  const b=new TextEncoder().encode(s);let raw='';
  for(let i=0;i<b.length;i+=8192)raw+=String.fromCharCode(...b.subarray(i,i+8192));
  return btoa(raw);
}
export const markerText=(base,sequence,id)=>`<!-- PCMS_REFRESH_MARKER:${MARKER_POLICY}:F=${base}:S=${sequence}:O=${id} -->\n`;
export function validMarkerPlan(p){
  return p?.policy===MARKER_POLICY&&p.anchor==='HTML_BYTE_ZERO'&&opId(p.operationId)&&
    hex(p.approvedBaseFingerprint)&&hex(p.expectedPreSaveFingerprint)&&
    hex(p.expectedPostSaveFingerprint)&&p.expectedPreSaveFingerprint!==p.expectedPostSaveFingerprint&&
    Number.isSafeInteger(p.sequence)&&p.sequence>0&&p.sequence<=1000000&&
    p.afterMarker===markerText(p.approvedBaseFingerprint,p.sequence,p.operationId)&&
    typeof p.beforeMarker==='string'&&p.beforeMarker.length<=260;
}
export async function prepareMarker(files,{approvedBaseFingerprint,previous=null,id,consentRevision=0}={}){
  if(!hex(approvedBaseFingerprint)||!opId(id))return fail('MARKER_AUTHORITY_UNVERIFIED');
  const pre=await exactSource(files);if(!pre.ok)return pre;
  const htmlFile=pre.blobs.find(f=>f.path==='index.html');let html;
  try{html=new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(htmlFile.base64),x=>x.charCodeAt(0)));}
  catch{return fail('MARKER_HTML_UNVERIFIED');}
  if(new TextEncoder().encode(html).length>262144)return fail('MARKER_HTML_SIZE_LIMIT');
  let beforeMarker='',sequence=1;
  if(previous){
    if(previous.source!=='PCMS_REFRESH_MARKER'||previous.policy!==MARKER_POLICY||
      previous.approvedBaseFingerprint!==approvedBaseFingerprint||
      previous.effectiveCurrentFingerprint!==pre.fingerprint||
      !opId(previous.operationId)||!Number.isSafeInteger(previous.sequence)||previous.sequence<1)
      return fail('MARKER_PROVENANCE_RECONCILIATION_REQUIRED');
    beforeMarker=markerText(approvedBaseFingerprint,previous.sequence,previous.operationId);
    if(!html.startsWith(beforeMarker))return fail('MARKER_PROVENANCE_RECONCILIATION_REQUIRED');
    html=html.slice(beforeMarker.length);sequence=previous.sequence+1;
  }else if(pre.fingerprint!==approvedBaseFingerprint)return fail('FUNCTIONAL_SOURCE_DRIFT');
  // Byte zero is outside all original HTML parsing contexts. Require an
  // actual HTML document/fragment and explicit review of this precise slot.
  // Reject arbitrary text/PJS, existing unknown markers, XML and BOMs.
  if(!/^\s*(?:<!doctype\s+html\b|<(?:html|head|body|div|main|section|article|header|footer|p|h[1-6]|style|script|form|span|button|textarea|!--)(?:\s|>|-))/i.test(html)||
     html.includes('PCMS_REFRESH_MARKER'))return fail('MARKER_SAFE_SLOT_REQUIRED');
  const base=await exactSource(pre.blobs.map(f=>f.path==='index.html'?{path:f.path,base64:encodeText(html)}:f));
  if(!base.ok||base.fingerprint!==approvedBaseFingerprint)return fail('FUNCTIONAL_SOURCE_DRIFT');
  const afterMarker=markerText(approvedBaseFingerprint,sequence,id);
  const post=await exactSource(pre.blobs.map(f=>f.path==='index.html'?{path:f.path,base64:encodeText(afterMarker+html)}:f));
  if(!post.ok)return post;
  const plan={policy:MARKER_POLICY,anchor:'HTML_BYTE_ZERO',operationId:id,sequence,consentRevision,
    approvedBaseFingerprint,expectedPreSaveFingerprint:pre.fingerprint,
    expectedPostSaveFingerprint:post.fingerprint,beforeMarker,afterMarker};
  return validMarkerPlan(plan)?{ok:true,plan,pre,post}:fail('MARKER_PLAN_INVALID');
}
// Verification is reconstruction against an attributed receipt, never regex
// stripping arbitrary comments or normalizing user source.
export async function recognizeMarker(files,receipt){
  const result=await prepareMarker(files,{approvedBaseFingerprint:receipt?.approvedBaseFingerprint,
    previous:receipt,id:'f'.repeat(32)});
  return result.ok?{ok:true,approvedBaseFingerprint:result.plan.approvedBaseFingerprint,
    effectiveCurrentFingerprint:result.pre.fingerprint}:result;
}
export function markerReceipt(plan,at){
  if(!validMarkerPlan(plan)||!Number.isSafeInteger(at)||at<1)return null;
  return {source:'PCMS_REFRESH_MARKER',policy:plan.policy,anchor:plan.anchor,
    operationId:plan.operationId,sequence:plan.sequence,consentRevision:plan.consentRevision,
    approvedBaseFingerprint:plan.approvedBaseFingerprint,
    expectedPreSaveFingerprint:plan.expectedPreSaveFingerprint,
    expectedPostSaveFingerprint:plan.expectedPostSaveFingerprint,
    effectiveCurrentFingerprint:plan.expectedPostSaveFingerprint,observedAt:at};
}
