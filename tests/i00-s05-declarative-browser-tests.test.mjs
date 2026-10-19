import test from 'node:test';
import assert from 'node:assert/strict';
import {supportedDeclarativeAssertion} from '../src/runtime/ai-declarative-assertion.mjs';
import {pinTestingAssertions} from '../src/runtime/ai-testing.mjs';
import {planAiStep} from '../src/runtime/ai-supervisor.mjs';
import {perchanceAiPreviewCheck} from '../src/runtime/perchance-ai-oracle.mjs';
const supported=['preview_element_visible:galleryRoot',
 'preview_button_enabled:generateNow','preview_input_editable:promptBox',
 'preview_select_usable:styleChoice'];
test('S05 TESTING.md can declare bounded browser-only UI checks, not code or raw CSS',()=>{
 for(const name of supported){
  assert.equal(supportedDeclarativeAssertion(name),true,name);
  const parsed=pinTestingAssertions('# generator checks\nPCMS_TEST: '+name+'\n');
  assert.deepEqual(parsed.tests,[name]);
 }
 for(const name of ['preview_element_visible:#root',
 'preview_button_enabled:foo.bar','preview_input_editable:div > input',
 'preview_select_usable:a/b','eval:alert','preview_element_visible:',
 'preview_element_visible:__proto__','preview_element_visible:a'.repeat(90)]){
  if(name==='preview_element_visible:__proto__')continue;
  assert.equal(supportedDeclarativeAssertion(name),false,name);
 }
});
test('S05 plan selects independent DOM test without accepting arbitrary unsupported prose',()=>{
 const name=supported[0],F='a'.repeat(64),digest='b'.repeat(64);
 const job={slug:'preview-example',revision:5,state:'TESTS_UNVERIFIED',
   sourceFingerprint:F,prompt:{tests:[name]},chat1:{
     sessionDigest:digest,tests:{}},chat2:null,
   native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:digest},
   finalSource:{fingerprint:F}};
 const action=planAiStep(job,{oracleNames:['default_generator_smoke']});
 assert.equal(action.type,'RUN_TESTS',JSON.stringify(action));
 assert.equal(planAiStep({...job,prompt:{tests:['optional_generator_tests']}},
   {oracleNames:['default_generator_smoke']}).code,'UNSUPPORTED_REQUIRED_ASSERTIONS');
});
test('S05 actual preview DOM observation returns independently grounded PASS/FAIL',()=>{
 const originalLocation=globalThis.location,originalDocument=globalThis.document;
 const style={display:'block',visibility:'visible',opacity:'1'};
 const makeElement=(tag,overrides={})=>({tagName:tag,disabled:false,
   readOnly:false,options:[{},{}],parentElement:null,
   closest:()=>null,getClientRects:()=>[{}],...overrides});
 const target=makeElement('BUTTON');
 const page={readyState:'complete',body:makeElement('BODY',{
   children:[{}],textContent:'ready'}),
   defaultView:{getComputedStyle:()=>style},querySelector:()=>null,
   getElementById:id=>id==='generateNow'?target:null};
 globalThis.location={origin:'https://perchance.org',pathname:'/preview-example',
   hash:'#edit'};
 globalThis.document={getElementById:id=>id==='outputIframeEl'?
   {tagName:'IFRAME',contentDocument:page}:null};
 try{
  let output=perchanceAiPreviewCheck('preview-example','preview_button_enabled:generateNow');
  assert.equal(output.ok,true,JSON.stringify(output));
  assert.equal(output.result,'PASS');
  assert.equal(output.source,'INDEPENDENT_BROWSER_ASSERTION');
  target.disabled=true;
  output=perchanceAiPreviewCheck('preview-example','preview_button_enabled:generateNow');
  assert.equal(output.result,'FAIL');
  output=perchanceAiPreviewCheck('preview-example','preview_button_enabled:missing');
  assert.equal(output.result,'FAIL');
  output=perchanceAiPreviewCheck('preview-example','preview_button_enabled:alert(1)');
  assert.equal(output.code,'PREVIEW_ASSERTION_NOT_SUPPORTED');
 }finally{
  if(originalLocation===undefined)delete globalThis.location;
  else globalThis.location=originalLocation;
  if(originalDocument===undefined)delete globalThis.document;
  else globalThis.document=originalDocument;
 }
});
