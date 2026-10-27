import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {test} from 'node:test';

// Regression for postmerge F4 clean-profile timing: attachShadow is called
// early, before template fetches, presentation hydration, event registration
// and the pcms-faithful-ready commit. Navigating with a bare shadowRoot can
// silently leave the Overview page active.
test('clean installed-Firefox harness awaits full primary mount before navigating', async () => {
  const harness = await readFile('scripts/a01-clean-firefox.py','utf8');
  const bridge = await readFile('src/ui/faithful/bridge.mjs','utf8');
  assert.match(bridge, /root\.addEventListener\('click'/);
  assert.match(bridge, /document\.body\.classList\.add\('pcms-faithful-ready'\)/);
  assert.match(harness, /mounted:document\.body\.classList\.contains\('pcms-faithful-ready'\)/);
  assert.match(harness, /if observation\.get\('mounted'\):break/);
  assert.match(harness, /assert observation\.get\('mounted'\)/);
  assert.doesNotMatch(harness, /if observation\.get\('shadow'\):break/);
  assert.match(harness, /if selected!=route:raise AssertionError/);
});
