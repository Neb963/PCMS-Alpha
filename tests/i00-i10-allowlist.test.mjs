import test from 'node:test';
import assert from 'node:assert/strict';
import {AI_BROWSER_ASSERTIONS,perchanceAiPreviewCheck}
  from '../src/runtime/perchance-ai-oracle.mjs';
import {pinTestingAssertions} from '../src/runtime/ai-testing.mjs';
const slug='fixture-private';
function fixture({error=false,bodyText='ready',elements={},opaque=false}={}){
  const old={location:globalThis.location,document:globalThis.document};
  const elem=(value={})=>({
    getClientRects:()=>value.hidden?[]:[{}],
    closest:()=>value.ariaHidden?{}:null,
    textContent:value.text||'Visible',
    complete:value.complete,naturalWidth:value.width,naturalHeight:value.height,
    disabled:value.disabled,
    css:value.css,
    parentElement:value.parentElement||null,
    getAttribute:k=>k==='href'?value.href:null
  });
  const body=elem({text:bodyText});body.children=bodyText?[{}]:[];
  const page={readyState:'complete',body,
    defaultView:{getComputedStyle:el=>({
      display:el.css?.display||'block',
      visibility:el.css?.visibility||'visible',
      opacity:el.css?.opacity??'1'
    })},
    querySelector:s=>s==='#perchance-error-indicator'&&error?{}:null,
    querySelectorAll:s=>(elements[s]||[]).map(elem)};
  globalThis.location={origin:'https://perchance.org',pathname:'/'+slug,hash:'#edit'};
  globalThis.document={getElementById:id=>id==='outputIframeEl'?
    {tagName:'IFRAME',contentDocument:opaque?null:page}:null};
  return ()=>{globalThis.location=old.location;globalThis.document=old.document;};
}
test('P52-05 F: supported named assertions pass only observed rendered DOM conditions',()=>{
  for(const [name,selector,value] of [
    ['preview_heading_visible','h1,h2,h3,h4,h5,h6',{text:'Ready'}],
    ['preview_image_loaded','img',{complete:true,width:12,height:8}],
    ['preview_button_visible','button,input[type="button"],input[type="submit"]',{disabled:false}],
    ['preview_link_visible','a[href]',{href:'/source'}]
  ]){
    const restore=fixture({elements:{[selector]:[value]}});
    try{
      const r=perchanceAiPreviewCheck(slug,name);
      assert.equal(r.ok,true,name);assert.equal(r.result,'PASS',name);
      assert.equal(r.name,name);assert.equal(r.source,'INDEPENDENT_BROWSER_ASSERTION');
    }finally{restore();}
  }
  assert.equal(AI_BROWSER_ASSERTIONS.length,5);
});
test('P52-05 X: missing, hidden, broken or disabled semantic element is a proven FAIL',()=>{
  for(const [name,selector,entry] of [
    ['preview_heading_visible','h1,h2,h3,h4,h5,h6',{hidden:true,text:'Ready'}],
    ['preview_heading_visible','h1,h2,h3,h4,h5,h6',{text:' '}],
    ['preview_image_loaded','img',{complete:false,width:500,height:300}],
    ['preview_image_loaded','img',{complete:true,width:0,height:300}],
    ['preview_button_visible','button,input[type="button"],input[type="submit"]',{disabled:true}],
    ['preview_link_visible','a[href]',{href:'  '}],
    ['preview_heading_visible','h1,h2,h3,h4,h5,h6',
      {text:'Invisible heading',css:{visibility:'hidden'}}],
    ['preview_image_loaded','img',
      {complete:true,width:64,height:64,css:{opacity:'0'}}]
  ]){
    const restore=fixture({elements:{[selector]:[entry]}});
    try{assert.equal(perchanceAiPreviewCheck(slug,name).result,'FAIL',name);}
    finally{restore();}
  }
});
test('P52-05 X: errors trump matching output; inaccessible content never passes',()=>{
  let restore=fixture({error:true,elements:{'h1,h2,h3,h4,h5,h6':[{text:'Ready'}]}});
  try{assert.equal(perchanceAiPreviewCheck(slug,'preview_heading_visible').result,'FAIL');}
  finally{restore();}
  restore=fixture({opaque:true});
  try{assert.equal(perchanceAiPreviewCheck(slug,'preview_heading_visible').code,'PREVIEW_NOT_INSPECTABLE');}
  finally{restore();}
  restore=fixture();
  try{
    assert.equal(perchanceAiPreviewCheck(slug,'custom_script_injected').code,'PREVIEW_ASSERTION_NOT_SUPPORTED');
    assert.equal(perchanceAiPreviewCheck('wrong-slug','preview_heading_visible').code,'PREVIEW_TARGET_UNKNOWN');
  }finally{restore();}
});
test('P52-06 F: exact pinned TESTING.md declarations are names only, not PASS',()=>{
  const parsed=pinTestingAssertions('# Test fixtures\nPCMS_TEST: preview_heading_visible\nPCMS_TEST: preview_image_loaded\n');
  assert.deepEqual(parsed,{ok:true,tests:['preview_heading_visible','preview_image_loaded']});
  assert.equal(parsed.result,undefined);
  assert.equal(pinTestingAssertions('PCMS_TEST: preview_heading_visible\nPCMS_TEST: preview_heading_visible').code,
    'TESTING_DECLARATION_INVALID');
  assert.equal(pinTestingAssertions('PCMS_TEST: x'.repeat(2000)).ok,false);
});
test('P52-06 X: natural-language tests cannot be silently dropped as verified',()=>{
  assert.deepEqual(pinTestingAssertions('Try the gallery and check each image manually.'),
    {ok:true,tests:['optional_generator_tests']});
  assert.deepEqual(pinTestingAssertions('PCMS_TEST: preview_image_loaded\nAlso check conversion output.'),
    {ok:true,tests:['preview_image_loaded','optional_generator_tests']});
  assert.deepEqual(pinTestingAssertions('PCMS_TEST: unknown_expected'),
    {ok:true,tests:['unknown_expected']});
  assert.equal(pinTestingAssertions('').code,'TESTING_INPUT_UNVERIFIED');
});
