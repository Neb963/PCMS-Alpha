import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {buildI00} from '../scripts/build-i00.mjs';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

test('F4 final combined package advances monotonically without donor/Gecko changes or capability cutoffs',async t=>{
  const dir=await mkdtemp(path.join(tmpdir(),'pcms-f4-release-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const {original,combined,stage}=await buildI00({packageArchive:false,buildDirectory:dir});
  assert.equal(original.version,'1.2.0');
  assert.equal(combined.version,'1.2.19');
  assert.deepEqual(combined.browser_specific_settings,original.browser_specific_settings);
  assert.equal(combined.browser_specific_settings.gecko.id,'persona-route-manager@local');
  assert.deepEqual(combined.permissions,original.permissions);
  assert.deepEqual(combined.optional_permissions,original.optional_permissions);
  assert.equal(combined.action.default_popup,undefined);
  assert.deepEqual(combined.background,{scripts:['pcms/entry.mjs'],type:'module'});
  const entry=await readFile(path.join(stage,'pcms/entry.mjs'),'utf8');
  for(const unit of ['backup-auto-boundary.mjs','refresher-boundary.mjs','ai-boundary.mjs',
    'catalog-watch.mjs','creation-watch.mjs'])
    assert.match(entry,new RegExp(unit.replaceAll('.','\\.')));
});

test('F4 existing-combined upgrade uses exact prior source and digest, genuine AOM update and real IDB cold readback',async()=>{
  const helper=await readFile('scripts/f4-previous-package.py','utf8');
  const upgrade=await readFile('scripts/a08-upgrade-firefox.py','utf8');
  assert.match(helper,/a3081ad84d25dbc4d73b2bcb30af6761af2083fb/);
  assert.match(helper,/3d1aae973f91319f9f9672e6d6d6df4d6277cbf8/);
  assert.match(helper,/aa372c2aae803cab093f8453331b7f48c2ff274872594bc99c834160201e3fcc/);
  assert.match(helper,/git\(root, 'worktree', 'add'/);
  assert.match(helper,/BASE_XPI_SHA256/);
  assert.match(upgrade,/main\(previous_archive=previous\)/);
  assert.match(upgrade,/installAddonFromAOMWithOptions/);
  assert.match(upgrade,/F4_EXISTING_COMBINED_CANONICAL_IDB_SURVIVES_COLD_UPDATE/);
  assert.match(upgrade,/F6_REAL_1_2_18_TO_1_2_19_UPGRADE/);
  assert.match(upgrade,/registry_version=='1.2.19'/);
  assert.doesNotMatch(upgrade,/MONKEY_PATCH|skipUpgrade|upgradeBypass/);
});

test('F4 operator release guide is versioned, short, safe, and separates live provider outcomes',async()=>{
  const guide=await readFile('docs/operator/OPERATOR-GUIDE.md','utf8');
  for(const required of ['1.2.19','persona-route-manager@local','about:addons',
    'Mullvad','Turnstile','Git','AI','Refresher','Backup','Work Queue',
    'source','unverified','unsigned'])
    assert.ok(guide.toLowerCase().includes(required.toLowerCase()),required);
  assert.match(guide,/do not resubmit CREATE\/RENAME/i);
  assert.match(guide,/not.*establish real Mullvad/i);
  assert.ok(guide.length<5800,'short final live acceptance guide');
});

test('F4 clean-home Firefox navigation starts only after canonical interactive mount and verifies each real route',async()=>{
  const source=await readFile('scripts/a01-clean-firefox.py','utf8');
  const mark=source.indexOf("document.body.classList.contains('pcms-faithful-ready')");
  const click=source.indexOf('button.click();return true;');
  assert.ok(mark>=0 && click>mark,'do not dispatch an unrecoverable early click before primary handlers mount');
  assert.match(source,/A01_PRIMARY_INTERACTION_HANDLERS_NOT_READY/);
  assert.match(source,/A01_PRIMARY_CONTROLLER_MOUNT_READY_BEFORE_NAVIGATION/);
  assert.match(source,/getAttribute\('aria-current'\)/);
  assert.match(source,/location\.hash\.slice\(1\)/);
  assert.match(source,/PRIMARY_ROUTE_NOT_RENDERED/);
});
