import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
const html=await readFile('src/ui/index.html','utf8');
const css=await readFile('src/ui/shell.css','utf8');
const shell=await readFile('src/ui/shell.mjs','utf8');
const inv=await readFile('src/ui/inventory-view.mjs','utf8');
const search=await readFile('src/ui/global-search-view.mjs','utf8');
test('I17: shell implements prototype workstation chrome without losing operational destinations',()=>{
  assert.match(css,/grid-template-columns:var\(--nav-w\) minmax\(0,1fr\)/);
  assert.match(html,/class="pcms-brand"/);
  assert.match(html,/id="pcms-quick-generator-search"/);
  assert.match(html,/pcms-overview-signals/);
  assert.match(html,/class="pcms-inventory-stage"/);
  for(const d of ['overview','generators','work-queue','accounts','refresher','settings']){
    assert.match(html,new RegExp('id="view-'+d+'"'));
    assert.match(html,new RegExp('data-workspace="'+d+'"'));
  }
  assert.match(css,/@media\(max-width:550px\)/);
  for(const stat of ['occupied','capacity','eligible','observed'])
    assert.match(html,new RegExp('id="pcms-refresher-'+stat+'"'));
  assert.match(html,/class="pcms-refresher-stats"/);
  assert.match(html,/class="pcms-refresher-policy-grid"/);
  assert.match(html,/Scheduling diagnostics and observation recovery/);
  assert.match(search,/field\.addEventListener\('input'/);
  assert.match(search,/pcms-i04-inventory/);
  assert.match(search,/pcms-i03-accounts/);
  assert.match(shell,/showGeneratorPanel\('inventory'\)/);
  assert.match(shell,/pcms-source-target/);
  assert.match(shell,/pcms-adoption-target/);
  assert.match(shell,/showWorkPanel/);
  for(const work of ['writeback','release','ai','recovery'])
    assert.match(html,new RegExp('data-pcms-work-panel="'+work+'"[^>]*hidden'));
  assert.match(html,/data-pcms-work-panel="activity"/);
  for(const panel of ['supply','adopt','stage','source'])
    assert.match(html,new RegExp('data-pcms-generator-panel="'+panel+'" hidden'));
  assert.match(shell,/field\.dispatchEvent\(new Event\('input'/);
  assert.match(inv,/pcms-generator-row-target/);
  assert.match(inv,/pcms-generator-inspector-actions/);
  assert.doesNotMatch(inv,/first\.append\(document\.createTextNode\(' '\),timing\)/);
  assert.match(inv,/Historical observation/);
});
test('I17: reject inherited toolbar donor popup and escaped-markup regressions',async()=>{
  assert.equal(html.includes('</script>\\n'),false,'visible raw escape sequence');
  const donor=JSON.parse(await readFile('donor/personamonkey/extension/manifest.json','utf8'));
  const build=await readFile('scripts/build-i00.mjs','utf8');
  assert.equal(donor.action.default_popup,'popup/popup.html');
  assert.match(build,/delete combined\.action\.default_popup/);
  assert.match(build,/default_title:'PCMS Alpha/);
  assert.match(build,/combined\.action = \{\.\.\.original\.action/);
  assert.match(build,/page:'pcms\/index.html'/);
  // The existing i00-build test independently verifies the built manifest;
  // do not run a concurrent destructive build against the same staging tree.
});

test('I17 real inventory affordances follow approved v3.1 workstation interactions',()=>{
  for(const key of ['all','owner','attention','missing'])
    assert.match(html,new RegExp('data-pcms-inventory-view="'+key+'"'));
  for(const key of ['account','visibility','source','observed'])
    assert.match(html,new RegExp('data-pcms-inventory-column="'+key+'"'));
  for(const id of ['pcms-generator-sort','pcms-generator-preview-selection',
    'pcms-generator-clear-selection','pcms-generator-selection-preview','pcms-generator-sort-direction'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.doesNotMatch(inv,/function sortPage\(items\)/);
  assert.match(inv,/function previewSelection\(\)/);
  assert.match(inv,/renderControls\(\)/);
  assert.match(inv,/filter\.value=VIEWS\[view\]/);
  assert.match(inv,/sortBy:sort,sortDirection:direction/);
  assert.match(css,/\.pcms-inventory-presets/);
  assert.match(css,/\.pcms-column-picker/);
  assert.doesNotMatch(inv,/innerHTML\s*=/);
});

test('I17 guarded operator supply uses exactly one item command and never auto-replays',async()=>{
  const supply=await readFile('src/ui/supply-view.mjs','utf8');
  assert.match(supply,/type==='EXECUTE_ITEM'\?75000:6500/);
  assert.match(supply,/window\.prompt\('Type '/);
  assert.match(supply,/supply\('ARM_DISPOSABLE_TEST'/);
  assert.match(supply,/supply\('EXECUTE_ITEM'/);
  assert.match(supply,/expectedRevision:item\.revision/);
  assert.match(supply,/do not blindly retry/i);
  assert.doesNotMatch(supply,/setInterval\(/);
});

test('I17 installed Firefox B contains full-fleet sorted pagination oracle',async()=>{
  const browserHarness=await readFile('scripts/browser-i00-smoke.py','utf8');
  assert.match(browserHarness,/B I17_GLOBAL_1250_SORT_PAGING_AND_OBSERVED_COLUMN=PASS/);
  assert.match(browserHarness,/first_sort\.get\('first'\)=='gen-1249'/);
  assert.match(browserHarness,/second_sort\.get\('first'\)=='gen-1199'/);
  assert.match(browserHarness,/bad_sort\.get\('code'\)=='INVALID_PARAMS'/);
});

test('I17 installed Firefox B denies disguised provider arms without side effects',async()=>{
  const harness=await readFile('scripts/browser-i00-smoke.py','utf8');
  assert.match(harness,/B I17_DISPOSABLE_ARM_REJECTS_NORMAL_SLUG_NO_PROVIDER_EFFECT=PASS/);
  assert.match(harness,/normal_arm\.get\('code'\)=='PILOT_DISPOSABLE_SLUG_REQUIRED'/);
  assert.match(harness,/malformed_arm\.get\('code'\)=='INVALID_PARAMS'/);
  assert.match(harness,/still_frozen\.get\('batch'/);
});
