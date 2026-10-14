import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
const html=await readFile('src/ui/index.html','utf8');
const css=await readFile('src/ui/shell.css','utf8');
const shell=await readFile('src/ui/shell.mjs','utf8');
const inv=await readFile('src/ui/inventory-view.mjs','utf8');
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
  assert.match(shell,/quickSearch\.addEventListener/);
  assert.match(shell,/showGeneratorPanel\('inventory'\)/);
  assert.match(shell,/pcms-source-target/);
  assert.match(shell,/pcms-adoption-target/);
  for(const panel of ['supply','adopt','stage','source'])
    assert.match(html,new RegExp('data-pcms-generator-panel="'+panel+'" hidden'));
  assert.match(shell,/query\.dispatchEvent\(new Event\('input'/);
  assert.match(inv,/inspectPick\.addEventListener/);
  assert.match(inv,/Historical local observation/);
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
