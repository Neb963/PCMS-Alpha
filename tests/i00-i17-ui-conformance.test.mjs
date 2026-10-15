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
  assert.match(supply,/type==='EXECUTE_ITEM'\?75000:type==='FINISH_SOURCE_FOLDER'\?150000:6500/);
  assert.match(supply,/requestTypedConfirmation\(action,typed/);
  assert.doesNotMatch(supply,/window\.prompt\(/);
  assert.match(supply,/pendingSteps\.has\(rowKey\)/);
  assert.match(supply,/rowStatus\.setAttribute\('aria-live','polite'\)/);
  assert.match(supply,/supply\('ARM_DISPOSABLE_TEST'/);
  assert.match(supply,/supply\('EXECUTE_ITEM'/);
  assert.match(supply,/expectedRevision:item\.revision/);
  assert.match(supply,/do not blindly retry|do not retry blindly/i);
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

test('I17 operator supply presents narrow pilot honestly, without general activation claims',async()=>{
  assert.match(html,/General creation and Git writes remain held/);
  assert.match(html,/Only a disposable pcms-test- supply item/);
  const supply=await readFile('src/ui/supply-view.mjs','utf8');
  assert.match(supply,/only exact disposable private tests may be armed/);
  assert.match(supply,/No external effect yet/);
  assert.match(supply,/Git writes remain held/);
});

test('I17 operator private stage requires an explicit disposable arm distinct from publication',async()=>{
  const stage=await readFile('src/ui/staging-view.mjs','utf8');
  const boundary=await readFile('src/runtime/staging-boundary.mjs','utf8');
  assert.match(html,/id="pcms-stage-arm"/);
  assert.match(stage,/requestTypedConfirmation\(arm,expected/);
  assert.doesNotMatch(stage,/window\.prompt\(/);
  assert.match(stage,/invoke\('ARM_DISPOSABLE_STAGE'/);
  assert.match(stage,/invoke\('STAGE_PRIVATE'/);
  assert.match(stage,/pcms-test-\[a-z0-9-\]/);
  assert.match(boundary,/const stageAuthorized=r=>/);
  assert.match(boundary,/pilotClock\(\)\+120000/);
  assert.match(boundary,/intent\.revision,'DISPATCH_POSSIBLE'/);
  assert.match(boundary,/if\(stagePilotMatches\(r\)\)pilotArm=null/);
});

test('I17 packaged Firefox checks private staging pilot rejection without provider writes',async()=>{
  const harness=await readFile('scripts/browser-i00-smoke.py','utf8');
  assert.match(harness,/B I17_STAGING_DISPOSABLE_ARM_REJECTS_NORMAL_OR_SPOOFED_STAGE=PASS/);
  assert.match(harness,/deniedPilot\.code==='PILOT_DISPOSABLE_SLUG_REQUIRED'/);
  assert.match(harness,/spoofedPilot\.code==='INVALID_PARAMS'/);
  const stage=await readFile('src/ui/staging-view.mjs','utf8');
  assert.match(stage,/requestExplicitConfirmation\(start/);
  assert.doesNotMatch(stage,/window\.confirm\(/);
});

test('I17 private staging matches compact prototype control hierarchy and keeps actions real',()=>{
  assert.match(html,/class="pcms-stage-steps"/);
  assert.match(html,/class="pcms-stage-fields"/);
  assert.match(html,/class="pcms-stage-actions"/);
  assert.match(html,/Staging requirements and recovery/);
  for(const id of ['pcms-stage-pin','pcms-stage-arm','pcms-stage-start',
    'pcms-stage-reconcile','pcms-stage-handoff','pcms-stage-refresh','pcms-stage-clear'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(css,/\.pcms-stage-fields\{display:grid/);
  assert.match(css,/@media\(max-width:730px\)/);
});

test('I17 private non-READY Git marker requires exact disposable arm and ephemeral token',async()=>{
  const src=await readFile('src/ui/supply-view.mjs','utf8');
  const gate=await readFile('src/runtime/supply-boundary.mjs','utf8');
  assert.match(src,/supply\('ARM_DISPOSABLE_GIT'/);
  assert.match(src,/supply\('FINISH_SOURCE_FOLDER'/);
  assert.match(src,/credential\.type='password'/);
  assert.match(src,/credential\.value=''/);
  assert.match(gate,/gitPilotMatches/);
  assert.match(gate,/if\(gitPilotMatches\(\{account:current\.account,batch:b,item\}\)\)gitPilotArm=null/);
});

test('I17 uncertain Git marker has distinct read-only reconciliation control',async()=>{
  const supply=await readFile('src/ui/supply-view.mjs','utf8');
  const boundary=await readFile('src/runtime/supply-boundary.mjs','utf8');
  assert.match(supply,/Reconcile Git marker \(read-only\)/);
  assert.match(supply,/supply\('RECONCILE_GIT'/);
  assert.match(boundary,/async function reconcileGit/);
  assert.match(boundary,/gitRead\(params\)/);
  assert.match(boundary,/event:'GIT_OBSERVING'/);
});

test('I17 packaged Firefox B refuses premature Git write and readback for frozen source',async()=>{
  const harness=await readFile('scripts/browser-i00-smoke.py','utf8');
  assert.match(harness,/B I17_GIT_MARKER_ARM_AND_READ_ONLY_RECONCILE_DENY_FROZEN=PASS/);
  assert.match(harness,/frozen_git_arm\.get\('code'\)=='NOT_ADMISSIBLE'/);
  assert.match(harness,/frozen_git_read\.get\('code'\)=='NOT_ADMISSIBLE'/);
});

test('I17 operator native AI asks for exact disposable step instead of implying general capability',async()=>{
  const boundary=await readFile('src/runtime/ai-boundary.mjs','utf8');
  const aiView=await readFile('src/ui/ai-view.mjs','utf8');
  assert.match(boundary,/ARM_DISPOSABLE_AI/);
  assert.match(boundary,/pilotClock\(\)\+120000/);
  assert.match(boundary,/if\(pilotMatches\(ctx\)\)pilotArm=null/);
  assert.match(aiView,/requestTypedConfirmation\(/);
  assert.match(aiView,/selectedJob!==confirmedJob/);
  assert.doesNotMatch(aiView,/window\.prompt\(/);
  assert.match(aiView,/await ai\('ARM_DISPOSABLE_AI'/);
  assert.match(aiView,/testSlug\.test\(name\)/);
});

test('I17 native AI panel separates preparation, Chat 1/2 and advanced controls',()=>{
  assert.match(html,/class="pcms-ai-fields"/);
  assert.match(html,/class="pcms-ai-actions"/);
  assert.match(html,/class="pcms-inline-help pcms-ai-recovery"/);
  assert.match(html,/Chat 1 · Test and repair/);
  assert.match(html,/Chat 2 · Optional tests/);
  for(const id of ['pcms-ai-prepare','pcms-ai-refresh','pcms-ai-run',
    'pcms-ai-observe','pcms-ai-test','pcms-ai-newchat','pcms-ai-chat2',
    'pcms-ai-fresh','pcms-ai-advance','pcms-ai-repair','pcms-ai-opfs'])
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
  assert.match(css,/\.pcms-ai-actions\{display:grid/);
  assert.match(css,/@media\(max-width:680px\)/);
});

test('I17 operator writeback includes separate one-time private Git authorization',async()=>{
  const b=await readFile('src/runtime/writeback-boundary.mjs','utf8');
  const v=await readFile('src/ui/writeback-view.mjs','utf8');
  assert.match(html,/id="pcms-writeback-arm-manual"/);
  assert.match(b,/ARM_DISPOSABLE_COMMIT/);
  assert.match(b,/pilotClock\(\)\+120000/);
  assert.match(v,/requestTypedConfirmation\(armManual,expected/);
  assert.doesNotMatch(v,/window\.prompt\(/);
  assert.match(v,/request\('ARM_DISPOSABLE_COMMIT'/);
  assert.match(b,/if\(pilotMatches\(record\)\)manualPilot=null/);
});

test('I17 publication requires distinct one-use exact source authorization',async()=>{
  const svc=await readFile('src/runtime/release-boundary.mjs','utf8');
  const ui=await readFile('src/ui/release-view.mjs','utf8');
  assert.match(html,/id="pcms-release-arm"/);
  assert.match(svc,/ARM_DISPOSABLE_RELEASE/);
  assert.match(svc,/pilotClock\(\)\+120000/);
  assert.match(svc,/record.kind==='PRIVATE_NEW'/);
  assert.match(ui,/requestTypedConfirmation\(armBtn,expected/);
  assert.doesNotMatch(ui,/window\.prompt\(/);
  assert.match(ui,/command\('ARM_DISPOSABLE_RELEASE'/);
  assert.match(svc,/if\(pilotMatches\(stored.record\)\)releasePilot=null/);
});

test('I17 Git writeback and release have symmetric operator step flows, not inert controls',async()=>{
  const writeback=await readFile('src/ui/writeback-view.mjs','utf8');
  const release=await readFile('src/ui/release-view.mjs','utf8');
  for(const [id,module] of [
    ['pcms-writeback-preview',writeback],['pcms-writeback-prepare',writeback],
    ['pcms-writeback-arm-manual',writeback],['pcms-writeback-commit',writeback],
    ['pcms-writeback-reconcile',writeback],['pcms-release-preview',release],
    ['pcms-release-approve',release],['pcms-release-arm',release],
    ['pcms-release-dispatch',release],['pcms-release-reconcile',release]]){
    assert.equal((html.match(new RegExp('id="'+id+'"','g'))||[]).length,1,id);
    assert.match(module,new RegExp("['\"]"+id+"['\"]"),id);
  }
  assert.match(html,/class="pcms-inline-help pcms-wb-help"/);
  assert.match(html,/class="pcms-inline-help pcms-release-help"/);
  assert.match(html,/3 · Authorize private test/);
  assert.match(html,/4 · Publish once/);
});

test('PCMS-ESR-007 F/X: inline exact intent is accessible, cancellable and never performs backend actions',async()=>{
  const helper=await readFile('src/ui/typed-confirm.mjs','utf8');
  const supply=await readFile('src/ui/supply-view.mjs','utf8');
  const browserHarness=await readFile('scripts/browser-i00-smoke.py','utf8');
  assert.match(helper,/input\.value !== expected/);
  assert.match(helper,/finish\(null\)/);
  assert.match(helper,/finish\(expected\)/);
  assert.match(helper,/cancelPendingConfirmations\(root\)/);
  assert.match(helper,/input\.focus\(\)/);
  assert.match(helper,/trigger\.disabled = true/);
  assert.match(helper,/status\.setAttribute\('aria-live', 'polite'\)/);
  assert.match(helper,/form\.addEventListener\('submit'/);
  assert.doesNotMatch(helper,/browser\.|fetch\(|runtime\.connect/);
  assert.match(supply,/supply\('ARM_DISPOSABLE_TEST'/);
  assert.match(supply,/supply\('EXECUTE_ITEM'/);
  assert.match(supply,/pendingSteps\.delete\(rowKey\)/);
  assert.match(browserHarness,/B I17_ESR007_REAL_WORK_QUEUE_INLINE_CANCEL_MISMATCH_GUARDED_DENIAL_ZERO_DISPATCH=PASS/);
  assert.match(browserHarness,/still_frozen|unchanged\.get\('batch'/);
});
