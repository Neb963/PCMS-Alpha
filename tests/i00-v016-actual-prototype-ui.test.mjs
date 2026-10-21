import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
const read=path=>readFile(path,'utf8');
const base='src/ui/faithful/';
const html=await read('src/ui/index.html'),build=await read('scripts/build-i00.mjs');
const bridge=await read(base+'bridge.mjs'),stylesheet=await read(base+'prototype.css');
const shell=await read(base+'shell.html');
const routes=['overview','generators','work-queue','accounts','refresher','settings'];
test('accepted prototype structure rather than prior native markup is PRIMARY',()=>{
 assert.match(html,/faithful\/native-shell\.css/);
 assert.match(html,/faithful\/bridge\.mjs/);
 assert.match(html,/pcms-legacy-return/);
 assert.match(bridge,/attachShadow\(\{mode:'open'\}\)/);
 assert.match(bridge,/pcms-faithful-ready/);
 assert.match(bridge,/root\.innerHTML=assets\['symbols\.html'\]\+assets\['shell\.html'\]/);
 assert.match(bridge,/new URL\('prototype\.css',url\)/);
 for(const route of routes)assert.ok(bridge.includes(route));
});
test('all six accepted prototype-derived templates are actual packaged assets',async()=>{
 for(const route of routes){
  const text=await read(base+route+'.html');
  assert.ok(text.length>950,route+' missing substantial structure');
  assert.match(text,/data-view=/);
  assert.doesNotMatch(text,/\bSample local record\b|\bDemo data\b|52 sample connected|simulated running/i);
 }
 for(const asset of ['symbols.html','shell.html','native-shell.css','prototype.css','bridge.mjs']){
  assert.ok((await stat(base+asset)).size>350,asset+' missing');
 }
 assert.match(stylesheet,/\.ref-table-scroll/);
 assert.match(stylesheet,/\.sidebar/);
 assert.match(stylesheet,/\.settings-main/);
 assert.match(shell,/UI v0\.1\.6/);
});
test('canonical read-only ports feed prototype views; original guarded mutating controls survive',()=>{
 for(const s of ['pcms-i04-inventory','pcms-i03-accounts','pcms-i12-refresher','LIST_INVENTORY','LIST_ACCOUNTS','GET_REFRESHER'])assert.ok(bridge.includes(s));
 assert.match(bridge,/const native=document\.querySelector\('body > \.app'\)/);
 assert.match(bridge,/document\.getElementById\(id\)/);
 assert.match(bridge,/pcms-native-open/);
 assert.match(bridge,/function nativeAction\(/);
 assert.match(bridge,/function guardedClick\(/);
 assert.doesNotMatch(bridge,/guardedClick\('pcms-refresher-save'\)/);
 assert.match(bridge,/nativeAction\('refresher',null,'pcms-refresher-enable'\)/);
 assert.match(bridge,/mount\(\)\.catch/);
 assert.equal((bridge.match(/\binnerHTML\s*=/g)||[]).length,2,'only static bundled shell and selected local template may be parsed as HTML');
 assert.match(bridge,/template\.innerHTML=html/);
 assert.match(bridge,/const route=state\.route,html=templates\.get\(route\)/);
 assert.match(bridge,/root\.innerHTML=assets\['symbols\.html'\]\+assets\['shell\.html'\]/);
 assert.doesNotMatch(bridge,/postMessage\(\{type:'(?:SET_POLICY|EXECUTE_ITEM|DISPATCH|REMOVE_ACCOUNT|RESTORE)/);
 for(const id of ['pcms-generator-query','pcms-refresher-enable','pcms-refresher-rows','pcms-release-approve','pcms-backup-export']){
  assert.ok(html.includes('id="'+id+'"'),'native guarded control removed '+id);
 }
});
test('prototype supports adverse navigation and fail-open presentation recovery',()=>{
 assert.match(bridge,/window\.addEventListener\('hashchange'/);
 assert.match(bridge,/if\(!found\.length\)/);
 assert.match(bridge,/No matching local records/);
 assert.match(bridge,/Unknown|unverified|Unavailable/i);
 assert.match(bridge,/root\.addEventListener\('keydown'/);
 assert.match(bridge,/root\.activeElement/);
 assert.match(bridge,/host\.remove\(\)/);
 assert.match(bridge,/body\.classList\.remove\('pcms-faithful-ready'\)/);
});
test('Firefox upgrades v1.2.1 XPI to 1.2.2 with donor manifest unchanged',()=>{
 assert.match(build,/original\.version!=='1\.2\.0'/);
 assert.match(build,/combined\.version='1\.2\.2'/);
 assert.match(html,/v015-faithful\.mjs/);
 assert.match(html,/faithful\/bridge\.mjs/);
});
