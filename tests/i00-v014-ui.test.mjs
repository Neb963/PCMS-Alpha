import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GROUPS,panelGroup,safeQuery,generatorRow,accountRow,stableResults} from '../src/ui/v014-ui-core.mjs';
const html=await readFile('src/ui/index.html','utf8');
const ui=await readFile('src/ui/v014-desktop-ui.mjs','utf8');
const css=await readFile('src/ui/v014-desktop.css','utf8');
const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
const idSet=new Set(ids);
test('desktop UI preserves every production ID uniquely and all six canonical routes',()=>{
 assert.equal(idSet.size,ids.length,'duplicate ID can attach a handler to wrong control');
 for(const dest of ['overview','generators','work-queue','accounts','refresher','settings']){
  assert.match(html,new RegExp('id="view-'+dest+'"'));
  assert.match(html,new RegExp('data-workspace="'+dest+'"'));
 }
 for(const key of ['pcms-generator-query','pcms-refresher-rows','pcms-refresher-enable',
  'pcms-restore-apply','pcms-backup-export','pcms-s06-grant-development','pcms-diagnostic-run',
  'pcms-accounts-list','pcms-ai-jobs-heading','pcms-release-heading','pcms-catalog-heading']){
  assert.ok(idSet.has(key),'production control missing '+key);
 }
});
test('all DOM IDREFs in labeled sections resolve, including search suggestions',()=>{
 for(const hit of html.matchAll(/aria-(?:labelledby|controls)="([^"]+)"/g))
  for(const id of hit[1].split(/\s+/))
   assert.ok(idSet.has(id),'ARIA reference unresolved '+id);
 assert.match(html,/role="combobox"/);
 assert.match(html,/id="pcms-v014-search-results"[\s\S]*?role="listbox"/);
});
test('new production script is packaged by existing builder with all imports present',()=>{
 assert.match(html,/<link rel="stylesheet" href="v014-desktop\.css">/);
 assert.match(html,/<script type="module" src="v014-desktop-ui\.mjs"><\/script>/);
 assert.match(ui,/from '\.\/v014-ui-core\.mjs'/);
 assert.match(ui,/pcms-i04-inventory/);
 assert.match(ui,/pcms-i03-accounts/);
 assert.doesNotMatch(ui,/innerHTML|outerHTML|insertAdjacentHTML|eval\s*\(|new Function/);
 assert.doesNotMatch(ui,/CREATE_PERSONA|REMOVE_ACCOUNT|EXECUTE_ITEM|DISPATCH|SET_POLICY|RESTORE|ARM_EXACT/);
});
test('all configured workflow panels exist and have stable group mapping',()=>{
 for(const [route,descriptors] of Object.entries(GROUPS)){
  const section=html.split('id="view-'+route+'"')[1]?.split(/<section class="workspace" id="view-/)[0]||'';
  assert.ok(section.length>100,'workspace missing '+route);
  for(const d of descriptors){
   for(const head of d.heads){
    assert.ok(idSet.has(head),'workflow heading missing '+head);
    assert.equal(panelGroup(route,head),d.key);
   }
  }
 }
 assert.equal(panelGroup('work-queue',''),'activity');
 assert.equal(panelGroup('settings',''),'permissions');
 assert.equal(panelGroup('generators','unexpected'),'other');
});
test('canonical lookup projection rejects injection and hostile identity shapes',()=>{
 assert.equal(safeQuery('<img src=x onerror=alert(1)>'),'<img src=x onerror=alert(1)>');
 assert.equal(safeQuery(' x '.repeat(100)).length,80);
 assert.equal(safeQuery(null),'');
 assert.equal(generatorRow({slug:'<img src=x onerror=1>'}),null);
 assert.equal(generatorRow({slug:null}),null);
 assert.equal(accountRow({accountId:'"><svg onload=1>'}),null);
 assert.deepEqual(generatorRow({slug:'a-1',accountId:'acct-a'}),{kind:'generator',id:'a-1',account:'acct-a'});
 assert.equal(stableResults([{kind:'generator',id:'a'},{kind:'generator',id:'a'},{kind:'account',id:'a'}]).length,2);
 assert.equal(stableResults(Array.from({length:10000},(_,i)=>({kind:'generator',id:String(i)}))).length,10);
});
test('global account lookup transfers focus after canonical async row construction',async()=>{
 const accounts=await readFile('src/ui/accounts-view.mjs','utf8');
 assert.match(ui,/new CustomEvent\('pcms-v014-account-target'/);
 assert.match(accounts,/addEventListener\('pcms-v014-account-target'/);
 assert.match(accounts,/section\.dataset\.pcmsV014AccountId=a\.accountId/);
 assert.match(accounts,/locateRequestedAccount\(\)/);
 assert.doesNotMatch(accounts,/querySelector\('\[data-pcms-v014-account-id="/);
});
test('catalog public-update shortcut selects the real Work Queue update panel',async()=>{
 const catalog=await readFile('src/ui/catalog-view.mjs','utf8');
 assert.match(catalog,/new CustomEvent\('pcms-v014-workflow-request'/);
 assert.match(catalog,/detail:\{route:'work-queue',group:'update'\}/);
 assert.match(ui,/addEventListener\('pcms-v014-workflow-request'/);
 assert.equal(panelGroup('work-queue','pcms-existing-heading'),'update');
});
test('Refresher queue precedes collapsed policy and no guarded controls are removed',()=>{
 const from=html.indexOf('id="view-refresher"');
 const until=html.indexOf('id="view-settings"',from);
 const section=html.slice(from,until);
 assert.ok(section.indexOf('id="pcms-refresher-rows"') <
   section.indexOf('id="pcms-v014-refresher-policy"'),
   'table must remain the dominant Refresher workspace surface');
 assert.match(section,/<details class="pcms-v014-refresher-policy"/);
 assert.match(section,/<summary>Scheduling policy/);
 for(const id of ['pcms-refresher-active','pcms-refresher-sleep',
  'pcms-refresher-grace','pcms-refresher-cap','pcms-refresher-enable',
  'pcms-refresher-save','pcms-refresher-account-pause'])
  assert.ok(section.includes('id="'+id+'"'),'protected policy control must be retained: '+id);
 assert.ok(section.indexOf('id="pcms-refresher-query"')<
   section.indexOf('id="pcms-refresher-rows"'),'search immediately accessible');
});
test('presentation does not hide the Refresher list or disable production controls',()=>{
 assert.match(css,/#view-refresher \.table-scroll/);
 assert.match(css,/overflow:auto/);
 assert.doesNotMatch(css,/#pcms-refresher-rows\s*\{[^}]*display:\s*none/);
 assert.doesNotMatch(css,/pointer-events:\s*none[^}]*#view-refresher/);
 assert.match(html,/id="pcms-refresher-reload"/);
 assert.match(html,/id="pcms-refresher-query"/);
});
