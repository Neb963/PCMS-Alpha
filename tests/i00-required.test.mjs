import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkRequired, MANDATORY } from '../scripts/verify-required.mjs';
import { readFile } from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
const flow = await readFile(new URL('../.github/workflows/required.yml', import.meta.url),'utf8').catch(()=>'');
test('pcms-required accepts only explicit success from both named mandatory jobs',()=>{
  assert.deepEqual(MANDATORY,['baseline','fast','firefox']);
  assert.equal(checkRequired({baseline:'success',fast:'success',firefox:'success'}).accepted,true);
  for(const candidate of [
    {baseline:'success',fast:'failure',firefox:'skipped'}, {baseline:'success',fast:'success',firefox:'skipped'},
    {baseline:'success',fast:'success'}, {baseline:'success',fast:'success',firefox:'cancelled'},
    {baseline:'success',fast:'neutral',firefox:'success'}, {baseline:'success',fast:'success',firefox:null}, {}, null
  ]) assert.equal(checkRequired(candidate).accepted,false,JSON.stringify(candidate));
});
test('required workflow is unfiltered and fail-closed on skipped dependencies',()=>{
  assert.match(flow,/pcms-required:/);
  assert.match(flow,/if: \$\{\{ always\(\) \}\}/);
  assert.match(flow,/needs: \[baseline, fast, firefox\]/);
  assert.doesNotMatch(flow,/continue-on-error\s*:/);
  assert.doesNotMatch(flow,/pull_request_target|workflow_run/);
  assert.doesNotMatch(flow,/^\s*paths(?:-ignore)?:/m);
});
test('docs-only and protected root changes do not skip the PR check',()=>{
  for(const path of ['README.md','docs/specs/x.md','AGENTS.md','.github/workflows/required.yml'])
    assert.ok(path && flow.includes('pull_request:'));
  assert.match(flow,/permissions:\s*\n\s*contents: read/);
});

test('draft preflight cannot publish a successful full required context',()=>{
  assert.equal(checkRequired({baseline:'success',fast:'success',firefox:'skipped'},{mode:'draft'}).accepted,false);
  assert.match(flow,/name: \$\{\{.*'pcms-draft-preflight'.*'pcms-required'/);
  assert.doesNotMatch(flow,/CI_MODE:/);
});
test('full acceptance executes protected base policy, not candidate policy',()=>{
  assert.match(flow,/ref: \$\{\{ github.event.pull_request.base.sha \|\| github.event.repository.default_branch \}\}/);
  assert.match(flow,/Checkout main-trusted full aggregate/);
  assert.match(flow,/ready_for_review/);
  assert.match(flow,/converted_to_draft/);
  assert.match(flow,/Draft-only changed-file preflight/);
  assert.match(flow,/run: node scripts\/draft-preflight.mjs/);
  assert.match(flow,/push:\s*\n\s*branches: \[main\]/);
  assert.match(flow,/workflow_dispatch:/);
});

test('CLI cannot turn skipped Firefox into protected success via CI_MODE',()=>{
  for(const mode of ['draft','full','invalid','']){
    const result=spawnSync(process.execPath,['scripts/verify-required.mjs',JSON.stringify({baseline:'success',fast:'success',firefox:'skipped'})],{encoding:'utf8',env:{...process.env,CI_MODE:mode}});
    assert.equal(result.status,1);
    assert.match(result.stderr,/firefox/);
  }
  const result=spawnSync(process.execPath,['scripts/verify-required.mjs',JSON.stringify({baseline:'success',fast:'success',firefox:'success'})],{encoding:'utf8'});
  assert.equal(result.status,0);
  assert.match(result.stdout,/FULL_ENGINEERING_GATE/);
});
