import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,stat} from 'node:fs/promises';
const read=path=>readFile(path,'utf8');
const base='src/ui/faithful/';
const html=await read('src/ui/index.html'),build=await read('scripts/build-i00.mjs');
const bridge=await read(base+'bridge.mjs'),stylesheet=await read(base+'prototype.css');
const shell=await read(base+'shell.html'),awaitSource=await read(base+'source-workspace.mjs');
const refresherUI=await read(base+'refresher-workspace.mjs'),refresherChoices=await read(base+'refresher-choices.mjs');
const routes=['overview','generators','work-queue','accounts','refresher','settings'];
test('accepted prototype structure rather than prior native markup is PRIMARY',()=>{
 assert.match(html,/faithful\/native-shell\.css/);
 assert.match(html,/faithful\/bridge\.mjs/);
 assert.doesNotMatch(html,/pcms-legacy-return/);
 assert.equal((html.match(/<script type="module"/g)||[]).length,1);
 assert.match(html,/<script type="module" src="faithful\/bridge\.mjs"><\/script>/);
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
 assert.doesNotMatch(shell,/PCMS local · Not verified/);
 assert.match(bridge,/version.textContent='PCMS '\+state.version/);
 assert.match(bridge,/browser.runtime.getManifest\(\).version/);
});
test('canonical primary controls call protected typed runtime with exact revisions; original safety gates survive',()=>{
 for(const s of ['pcms-i04-inventory','pcms-i03-accounts','pcms-i12-refresher','LIST_INVENTORY','LIST_ACCOUNTS','GET_REFRESHER'])assert.ok(bridge.includes(s));
 assert.doesNotMatch(bridge,/const native=document\.querySelector/);
 assert.doesNotMatch(bridge,/function nativeAction\(|function guardedClick\(|pcms-native-open/);
 assert.match(bridge,/window\.addEventListener\('focus',refreshOnWake\)/);
 assert.doesNotMatch(bridge,/guardedClick\('pcms-refresher-save'\)/);
 assert.match(bridge,/createRefresherWorkspace\(\{root,el,b/);
 assert.match(bridge,/readPort\('pcms-i12-refresher',type,params/);
 assert.match(refresherUI,/type:'SET_POLICY',params:\{policy:\{refreshEnabled:desired\}\}/);
 assert.match(refresherUI,/type:'SET_GENERATOR_POLICY'/);
 assert.match(refresherChoices,/expectedRevision:current\.revision/);
 assert.match(refresherChoices,/result\?\.code==='STALE_REVISION'&&attempt===0/);
 assert.doesNotMatch(refresherUI,/\binnerHTML\s*=/,'dynamic Refresher evidence remains text');
 assert.match(bridge,/createSourceWorkspace\(\{root,el,b,request:readPort/);
 const source=awaitSource;assert.match(source,/request\('pcms-i05-source',type/);
 assert.match(source,/call\('INSPECT_SOURCE'/);assert.match(source,/call\('READ_SOURCE_FILE'/);assert.match(source,/expectedRevision:item.revision/);
 assert.match(bridge,/readPort\('pcms-i07-adoption','RETRY_ADOPTION'/);
 assert.match(bridge,/readPort\('pcms-i07-adoption','READ_ORIGINAL_FILE'/);
 assert.doesNotMatch(bridge,/explicitPublicConsent/,'routine adoption uses account-level authorization');
 assert.match(bridge,/mount\(\)\.catch/);
 assert.equal((bridge.match(/\binnerHTML\s*=/g)||[]).length,4,
   'only versioned, repository-bundled shell and static primary templates may be parsed as HTML');
 assert.match(bridge,/tpl\.innerHTML=portableRestoreTemplate/);
 assert.match(bridge,/tpl\.innerHTML=diagnosticTemplate/);
 assert.match(bridge,/mountPortableRestore\(section\)/);
 assert.match(bridge,/mountDiagnosticController\(section\)/);
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
 assert.match(bridge,/root\.replaceChildren\(\)/);
 assert.match(bridge,/Emergency diagnostics/);
 assert.match(bridge,/body\.classList\.add\('pcms-faithful-ready'\)/);
 assert.doesNotMatch(bridge,/host\.remove\(\)/);
});
test('Firefox upgrades v1.2.1 XPI to 1.2.20 with donor manifest unchanged',()=>{
 assert.match(build,/original\.version!=='1\.2\.0'/);
 assert.match(build,/combined\.version='1\.2\.19'/);
 assert.doesNotMatch(html,/src="v015-faithful\.mjs"/);
 assert.match(html,/faithful\/bridge\.mjs/);
});
