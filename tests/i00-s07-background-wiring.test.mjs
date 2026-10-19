import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('S07 B packaging input: sole Refresher wake includes dormant guarded native adapter',async()=>{
  const entry=await readFile('src/runtime/entry.mjs','utf8');
  const overlay=await readFile('src/runtime/overlay.mjs','utf8');
  assert.match(entry,/createRefresherNativeAdapter\(\)/);
  assert.match(entry,/createRefresherBoundary\(browser,\{qualificationFor:/);
  assert.equal((entry.match(/createRefresherBoundary\(browser/g)||[]).length,1);
  for(const required of ['refresher-native.mjs','refresher-admission.mjs',
    'perchance-existing.mjs','perchance-observer.mjs','perchance-monitor.mjs'])
    assert.ok(overlay.includes("'"+required+"'"),required);
  assert.match(overlay,/refresherCleanupTab: async/);
  assert.match(overlay,/createdBy:request\.action==='REFRESH'\?'PCMS_S07':'PCMS_I13'/);
  assert.match(overlay,/func:perchanceExistingMain,args:\[request\]/);
  assert.match(overlay,/func:perchanceRefresherCleanMain,args:\[slug\]/);
});
test('S07 background monitor: temporary tab is fixed same-origin, protected container and read-only only',async()=>{
  const overlay=await readFile('src/runtime/overlay.mjs','utf8');
  const start=overlay.indexOf('  readIsolatedTab: async');
  const end=overlay.indexOf('  supplyIsolatedTab: async',start);
  assert.ok(start>0&&end>start);
  const route=overlay.slice(start,end);
  assert.match(route,/const fixedSource=!identityOnly&&originalSlug!==null/);
  assert.match(route,/if\(!monitoringRequest&&!fixedSource\)/);
  assert.match(route,/return \{ok:false,code:'NO_PERCHANCE_TAB'\}/);
  assert.match(route,/url:'https:\/\/perchance.org\/',cookieStoreId,active:false/);
  assert.match(route,/createdBy:'PCMS_S07_MONITOR'/);
  assert.match(route,/world:'ISOLATED'/);
  assert.match(route,/finally\{/);
  assert.match(route,/latest\.active===false/);
  assert.doesNotMatch(route,/world:'MAIN'|saveGenerator|isPrivate\s*=|runExistingStep/);
});
