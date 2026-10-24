#!/usr/bin/env node
/** Fail-closed result aggregator: DRAFT is a preflight, READY/main is a full gate.
 * GitHub draft PRs cannot merge. A ready_for_review transition runs a NEW
 * full check on the exact PR head; after any further edits, return to draft.
 */
export const MANDATORY=Object.freeze(['baseline','fast','firefox']);
export function checkRequired(result,{mode='full'}={}){
 if(!['full','draft'].includes(mode))
   return {accepted:false,bad:['INVALID_CI_MODE'],tier:'INVALID'};
 const expected=mode==='draft'?['baseline','fast']:MANDATORY;
 const bad=expected.filter(name=>!result||result[name]!=='success');
 if(mode==='draft' && result?.firefox!=='skipped')bad.push('DRAFT_FIREFOX_NOT_SKIPPED');
 return {accepted:bad.length===0,bad,tier:mode==='draft'?'DRAFT_PREFLIGHT_ONLY':'FULL_ENGINEERING_GATE'};
}
if(process.argv[1]&&import.meta.url===new URL(`file://${process.argv[1]}`).href){
 let observations;
 try{observations=JSON.parse(process.argv[2]??'{}')}catch{observations=null}
 const mode=process.env.CI_MODE||'full';
 const verdict=checkRequired(observations,{mode});
 if(!verdict.accepted){
  console.error(`pcms-required FAIL [${verdict.tier}]: ${verdict.bad.join(', ')}`);
  process.exitCode=1;
 }else{
  console.log(`pcms-required PASS [${verdict.tier}]: ${mode==='draft'?
   'draft syntax/changed-tests only; NOT merge, B, or product acceptance':
   'baseline, full fast/donor/XPI and packaged Firefox jobs succeeded'}`);
 }
}
