// I10 fixed, browser-observed preview smoke oracle. Run in the ISOLATED
// world on the exact donor-selected #edit tab; NEVER accept test payload
// from model chat, page text, UI or a generic injected JS expression.
// This is one smoke assertion, not a general evaluator of TESTING.md prose.
export function perchanceAiPreviewSmoke(slug) {
  const unknown=code=>({ok:false,code});
  if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)||
     location.origin!=='https://perchance.org'||
     location.pathname!=='/'+slug||location.hash!=='#edit')
    return unknown('PREVIEW_TARGET_UNKNOWN');
  try{
    const frame=document.getElementById('outputIframeEl');
    // Cross-origin/opaque sandboxed frames cannot be claimed as checked.
    if(!frame||frame.tagName!=='IFRAME'||!frame.contentDocument)
      return unknown('PREVIEW_NOT_INSPECTABLE');
    const page=frame.contentDocument;
    if(page.readyState!=='complete'||!page.body)
      return unknown('PREVIEW_NOT_SETTLED');
    const indicator=page.getElementById('perchance-error-indicator');
    const errors=page.querySelectorAll('#perchance-error-indicator');
    if(indicator||errors.length>0)
      return {ok:true,source:'INDEPENDENT_BROWSER_ASSERTION',
        name:'default_generator_smoke',result:'FAIL',observedAt:Date.now(),
        reason:'OBSERVED_PREVIEW_ERROR'};
    // A non-empty visible runtime document is the only supported assertion.
    // An empty DOM, inaccessible iframe, or missing output structure is
    // UNVERIFIED, NOT an implicit PASS.
    const body=page.body;
    if(body.children.length===0||!body.textContent?.trim()||
       body.getClientRects?.().length===0)
      return unknown('PREVIEW_OUTPUT_UNVERIFIED');
    return {ok:true,source:'INDEPENDENT_BROWSER_ASSERTION',
      name:'default_generator_smoke',result:'PASS',observedAt:Date.now(),
      reason:'INSPECTED_SETTLED_NONEMPTY_PREVIEW'};
  }catch{return unknown('PREVIEW_OBSERVATION_UNVERIFIED');}
}
