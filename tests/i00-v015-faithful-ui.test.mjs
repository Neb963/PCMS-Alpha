import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const html=await readFile('src/ui/index.html','utf8');
const css=await readFile('src/ui/v015-faithful.css','utf8');
const js=await readFile('src/ui/v015-faithful.mjs','utf8');
const base=await readFile('src/ui/v014-desktop-ui.mjs','utf8');
test('faithful production UI is loaded AFTER guarded production modules',()=>{
 const pos=s=>html.indexOf(s);
 assert.ok(pos('v015-faithful.css')>pos('v014-desktop.css'));
 assert.ok(pos('v015-faithful.mjs')>pos('v014-desktop-ui.mjs'));
 assert.ok(pos('v014-desktop-ui.mjs')>pos('refresher-view.mjs'));
 assert.match(js,/mountOverview\(\)/);
 for(const label of ['mountHeader','mountGeneratorInventory','mountQueue','mountAccounts','mountRefresher','mountSettings'])
   assert.match(js,new RegExp('function '+label+'\\('));
});
test('faithful UI retains stable extension routes and all native authority surfaces',()=>{
 for(const dest of ['overview','generators','work-queue','accounts','refresher','settings']){
  assert.match(html,new RegExp('id="view-'+dest+'"'));
  assert.match(html,new RegExp('data-workspace="'+dest+'"'));
 }
 for(const id of ['pcms-generators-rows','pcms-generator-query','pcms-generator-owner-filter',
  'pcms-generator-account','pcms-accounts-list','pcms-add-account',
  'pcms-refresher-rows','pcms-refresher-global-pause','pcms-refresher-enable',
  'pcms-release-approve','pcms-restore-apply','pcms-backup-export']){
   assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(js,/\\.append\\(policy\\)/);
 assert.match(js,/\\.append\\(global\\)/);
 assert.match(js,/\\.append\\(search\\)/);
 assert.doesNotMatch(js,/\binnerHTML\b|\bouterHTML\b|insertAdjacentHTML|\beval\(/);
});
test('operator journeys reuse original DOM nodes and observed state, not mock commands',()=>{
 for(const id of ['pcms-generator-query','pcms-generator-owner-filter',
   'pcms-refresher-reload','pcms-refresher-phase','pcms-accounts-list']){
   assert.match(js,new RegExp(''+id));
 }
 assert.match(js,/browser\.runtime\.connect\(\{name:port\}\)/);
 assert.match(js,/pcms-i12-refresher/);
 assert.match(js,/GET_REFRESHER/);
 assert.match(js,/Promise\.allSettled/);
 assert.doesNotMatch(js,/EXECUTE_ITEM|APPLY_RESTORE|REMOVE_ACCOUNT|PUBLISH|SET_POLICY|RUN_CREATE_STEP|DISPATCH/);
 assert.doesNotMatch(js,/sample fleet|sample connected|mock state|demo data/i);
});
test('desktop workspaces replace old visual hierarchy, not merely buttons/colors',()=>{
 for(const selector of ['v015-inventory-panel','v015-queue-board','v015-accounts-panel',
   'v015-refresher-layout','v015-refresher-rail','v015-refresher-stats',
   'v015-settings-layout','v015-overview-split'])
  assert.ok(css.includes(selector),'missing complete workspace geometry '+selector);
 assert.match(css,/#view-refresher \.v015-refresher-panel table/);
 assert.match(css,/#view-generators \.v015-inventory-panel table/);
 assert.match(css,/#view-settings \.v015-settings-nav/);
 assert.match(css,/grid-template-columns:repeat\(4,minmax\(0,1fr\)\)/);
 assert.match(css,/@media\(max-height:650px\)/);
 assert.doesNotMatch(css,/#pcms-refresher-rows\s*\{[^}]*display:\s*none/);
});
test('request admission and background modules remain unchanged by presentation',()=>{
 for(const name of ['v015-faithful.mjs','v015-faithful.css'])
  assert.match(html,new RegExp(name.replaceAll('.','\\.')));
 assert.match(js,/navigate\('generators','create'\)/);
 assert.match(js,/navigate\('work-queue',o\.group\)/);
 assert.match(js,/new MutationObserver/);
 // Existing v0.1.4 source/adoption/timing target handlers must coexist.
 assert.match(base,/pcms-source-target/);
 assert.match(base,/pcms-adoption-target/);
 assert.match(base,/pcms-v014-account-target/);
});
