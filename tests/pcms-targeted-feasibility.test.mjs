// Executed only as a NEW changed test by the existing draft preflight.
// Does not import production runtime, historical tests or donor regression suites.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
test('targeted PCMS feasibility in disposable normal-sandbox Firefox',()=>{
  const dir=mkdtempSync(join(tmpdir(),'pcms-targeted-ci-'));
  const run=(cmd,args,env,timeout=120000)=>{
    const r=spawnSync(cmd,args,{env,encoding:'utf8',timeout,maxBuffer:12*1024*1024});
    process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');assert.equal(r.status,0,r.error?.message||`${cmd} failed`);
  };
  const base='research/pcms-targeted-feasibility';
  run('node',[`${base}/offline.mjs`],process.env,15000);
  const env={...process.env,GITHUB_ENV:join(dir,'browser.env')};
  run('bash',['scripts/setup-firefox.sh'],env,65000);
  const resolved={...process.env};for(const line of readFileSync(env.GITHUB_ENV,'utf8').trim().split('\n')){const at=line.indexOf('=');resolved[line.slice(0,at)]=line.slice(at+1);}
  run('python3',[`${base}/browser-proof.py`],resolved,110000);
});
