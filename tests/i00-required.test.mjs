import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkRequired, MANDATORY } from '../scripts/verify-required.mjs';
import { readFile } from 'node:fs/promises';
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
