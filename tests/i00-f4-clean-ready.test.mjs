import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('clean persistent Firefox probe waits for rendered controller before clicking all six real routes',async()=>{
 const [harness,bridge]=await Promise.all([
  readFile('scripts/a01-clean-firefox.py','utf8'),
  readFile('src/ui/faithful/bridge.mjs','utf8')
 ]);
 // A shadow root exists at module evaluation, before any async UI mount.
 // Merely probing .shadowRoot is explicitly insufficient after cold boot.
 assert.match(harness,/mountedReady:document\.body\.classList\.contains\('pcms-faithful-ready'\)/);
 assert.match(harness,/routes\.every\(route=>!!sh\.querySelector\(/);
 assert.match(harness,/if observation\.get\('mountedReady'\):break/);
 assert.match(harness,/assert observation\.get\('mountedReady'\)/);
 assert.doesNotMatch(harness,/if observation\.get\('shadow'\):break/);
 assert.match(harness,/for route in \('overview','generators','work-queue','accounts','refresher','settings'\)/);
 assert.match(harness,/button\.click\(\);return true/);
 assert.match(harness,/if selected!=route:raise AssertionError/);
 // Publisher is subsequent to listener installation and first render.
 const bind=bridge.indexOf('routeHandlers();await render();');
 const ready=bridge.indexOf("document.body.classList.add('pcms-faithful-ready');");
 assert.ok(bind>0&&ready>bind,'readiness published too early for navigation');
});
