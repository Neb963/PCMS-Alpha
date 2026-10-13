import test from 'node:test';
import assert from 'node:assert/strict';
import {perchanceAiPreviewSmoke} from '../src/runtime/perchance-ai-oracle.mjs';
const slug='private-preview-fixture';
async function withPage(config,fn){
  const prev={document:globalThis.document,location:globalThis.location};
  const body={children:[{}],textContent:'Generator ready',
    getClientRects:()=>[{}]};
  const preview={readyState:'complete',body,
    getElementById:()=>config.error?{id:'perchance-error-indicator'}:null,
    querySelector:()=>config.error?{id:'perchance-error-indicator'}:null,
    querySelectorAll:()=>[]};
  const frame={tagName:'IFRAME',
    get contentDocument(){if(config.throwAccess)throw Error('SecurityError');
      return config.crossOrigin?null:preview;}};
  globalThis.document={getElementById:id=>id==='outputIframeEl'&&!config.missing?frame:null};
  globalThis.location={origin:'https://perchance.org',pathname:'/'+slug,hash:'#edit'};
  try{return await fn({body,preview});}finally{
    globalThis.document=prev.document;globalThis.location=prev.location;
  }
}
test('P52-05 independent smoke: a settled visible output can PASS, no model text required',async()=>{
  await withPage({},async()=>{
    const result=perchanceAiPreviewSmoke(slug);
    assert.equal(result.source,'INDEPENDENT_BROWSER_ASSERTION');
    assert.equal(result.name,'default_generator_smoke');
    assert.equal(result.result,'PASS');
    assert.ok(result.observedAt>0);
    assert.equal(result.text,undefined);
  });
});
test('P52-05 X error oracle is red-capable and never declares known runtime failure unavailable',async()=>{
  await withPage({error:true},async()=>{
    const result=perchanceAiPreviewSmoke(slug);
    assert.equal(result.result,'FAIL');
    assert.equal(result.reason,'OBSERVED_PREVIEW_ERROR');
  });
});
test('P52-05 unavailable or unsafe browser output is UNVERIFIED rather than green',async()=>{
  for(const options of [{missing:true},{crossOrigin:true},{throwAccess:true}]){
    await withPage(options,async()=>{
      const result=perchanceAiPreviewSmoke(slug);
      assert.equal(result.ok,false,JSON.stringify(options));
      assert.notEqual(result.result,'PASS');
    });
  }
  await withPage({},async({body})=>{
    body.textContent='';
    assert.equal(perchanceAiPreviewSmoke(slug).code,'PREVIEW_OUTPUT_UNVERIFIED');
  });
  await withPage({},async()=>{
    globalThis.location.pathname='/wrong';
    assert.equal(perchanceAiPreviewSmoke(slug).code,'PREVIEW_TARGET_UNKNOWN');
  });
});
