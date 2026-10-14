import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {buildI00} from '../scripts/build-i00.mjs';
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
  assert.match(shell,/query\.dispatchEvent\(new Event\('input'/);
  assert.match(inv,/inspectPick\.addEventListener/);
  assert.match(inv,/Historical local observation/);
});
test('I17: reject inherited toolbar donor popup and escaped-markup regressions',async()=>{
  assert.equal(html.includes('</script>\\n'),false,'visible raw escape sequence');
  const {original,combined}=await buildI00({packageArchive:false});
  assert.equal(original.action.default_popup,'popup/popup.html');
  assert.equal(combined.action.default_popup,undefined,'donor action not used as PCMS first entry');
  assert.match(combined.action.default_title,/PCMS Alpha/);
  assert.deepEqual(combined.action.default_icon,original.action.default_icon);
  assert.equal(combined.options_ui.page,'pcms/index.html');
});
