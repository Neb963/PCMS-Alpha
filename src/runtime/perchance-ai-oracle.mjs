// I10 allowlisted independent browser-observed tests. This function is run
// only as a fixed ISOLATED-world browser script on the donor-selected owned
// editor tab. Model/chat text never supplies result, assertions, or code.
export const AI_BROWSER_ASSERTIONS=Object.freeze([
  'default_generator_smoke',
  'preview_heading_visible',
  'preview_image_loaded',
  'preview_button_visible',
  'preview_link_visible'
]);
export function perchanceAiPreviewCheck(slug,name){
  const unknown=code=>({ok:false,code});
  if(typeof slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(slug)||
     !['default_generator_smoke','preview_heading_visible',
       'preview_image_loaded','preview_button_visible',
       'preview_link_visible'].includes(name))
    return unknown('PREVIEW_ASSERTION_NOT_SUPPORTED');
  if(location.origin!=='https://perchance.org'||
     location.pathname!=='/'+slug||location.hash!=='#edit')
    return unknown('PREVIEW_TARGET_UNKNOWN');
  try{
    const frame=document.getElementById('outputIframeEl');
    if(!frame||frame.tagName!=='IFRAME'||!frame.contentDocument)
      return unknown('PREVIEW_NOT_INSPECTABLE');
    const page=frame.contentDocument;
    if(page.readyState!=='complete'||!page.body)
      return unknown('PREVIEW_NOT_SETTLED');
    const observed=(result,reason)=>({
      ok:true,source:'INDEPENDENT_BROWSER_ASSERTION',
      name,result,observedAt:Date.now(),reason
    });
    // A visible runtime error is a real FAIL for every asserted outcome,
    // even when some older output remains in the preview.
    if(page.querySelector('#perchance-error-indicator'))
      return observed('FAIL','OBSERVED_PREVIEW_ERROR');
    const visible=el=>{
      if(!el||typeof el.getClientRects!=='function'||
         el.getClientRects().length===0)return false;
      if(el.closest?.('[hidden],[aria-hidden="true"]'))return false;
      // A bounding rectangle alone does not prove visibility: opacity:0
      // and visibility:hidden retain layout boxes. Include ancestors.
      if(typeof page.defaultView?.getComputedStyle!=='function')
        throw Error('PREVIEW_CSS_UNOBSERVABLE');
      let ancestor=el,depth=0;
      while(ancestor&&depth++<64){
        const style=page.defaultView.getComputedStyle(ancestor);
        if(!style)throw Error('PREVIEW_CSS_UNOBSERVABLE');
        if(style.display==='none'||style.visibility==='hidden'||
           style.visibility==='collapse'||Number(style.opacity)===0)
          return false;
        ancestor=ancestor.parentElement;
      }
      return !ancestor;
    };
    const any=(selector,predicate=()=>true)=>
      [...page.querySelectorAll(selector)].some(el=>visible(el)&&predicate(el));
    let passed=false;
    if(name==='default_generator_smoke'){
      // Opaque/inaccessible iframe, empty body or missing visible content
      // is UNVERIFIED, not a semantic "all generator tests passed".
      if(!page.body.children.length||!page.body.textContent?.trim()||
         !visible(page.body))
        return unknown('PREVIEW_OUTPUT_UNVERIFIED');
      passed=true;
    }else if(name==='preview_heading_visible'){
      passed=any('h1,h2,h3,h4,h5,h6',el=>Boolean(el.textContent?.trim()));
    }else if(name==='preview_image_loaded'){
      passed=any('img',el=>el.complete===true&&
        Number.isFinite(el.naturalWidth)&&el.naturalWidth>0&&
        Number.isFinite(el.naturalHeight)&&el.naturalHeight>0);
    }else if(name==='preview_button_visible'){
      passed=any('button,input[type="button"],input[type="submit"]',
        el=>el.disabled!==true);
    }else if(name==='preview_link_visible'){
      passed=any('a[href]',el=>Boolean(el.getAttribute('href')?.trim()));
    }
    return observed(passed?'PASS':'FAIL',passed?
      'BROWSER_OBSERVED_ASSERTION':'BROWSER_OBSERVED_ASSERTION_FALSE');
  }catch{return unknown('PREVIEW_OBSERVATION_UNVERIFIED');}
}
// Backward-compatible fixed smoke transport for earlier F/B consumers.
export function perchanceAiPreviewSmoke(slug){
  return perchanceAiPreviewCheck(slug,'default_generator_smoke');
}
