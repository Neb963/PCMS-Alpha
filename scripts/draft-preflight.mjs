#!/usr/bin/env node
// Rapid non-acceptance feedback for DRAFT pull requests only.
// Run exhaustive donor/XPI/installed-Firefox checks on ready_for_review/main.
import {execFileSync,spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {extname} from 'node:path';
function run(bin,args,timeout=150000){
 const child=spawnSync(bin,args,{stdio:'inherit',timeout});
 if(child.error||child.status!==0)throw Error('DRAFT_PREFLIGHT_FAILURE: '+bin+' '+args.join(' ')+' / '+(child.error?.code||child.status));
}
let files;
try{
 files=execFileSync('git',['diff','--name-only','--diff-filter=ACMR','-z','HEAD^1','HEAD'],{encoding:'buffer'})
  .toString('utf8').split('\0').filter(Boolean);
}catch{throw Error('DRAFT_PREFLIGHT_NO_BASE_DIFF; fail closed instead of claiming a green preflight')}
const changed=files.filter(name=>existsSync(name)&&!name.startsWith('/')&&!name.split('/').includes('..'));
if(changed.length!==files.length)throw Error('DRAFT_PREFLIGHT_UNSAFE_CHANGED_PATH');
const js=changed.filter(name=>/\.(?:js|mjs|cjs)$/.test(name));
const py=changed.filter(name=>name.endsWith('.py'));
const json=changed.filter(name=>name.endsWith('.json'));
const tests=changed.filter(name=>/^tests\/.*\.test\.mjs$/.test(name));
console.log('DRAFT_ONLY: changed='+changed.length+' scripts='+js.length+' tests='+tests.length+'; NOT full acceptance');
for(const file of js)run('node',['--check',file],25000);
for(const file of py)run('python3',['-c','import ast,sys; ast.parse(open(sys.argv[1],encoding="utf-8").read())',file],25000);
for(const file of json)JSON.parse(readFileSync(file,'utf8'));
if(tests.length)run('node',['--test',...tests],150000);
console.log('DRAFT_PREFLIGHT_PASS; Firefox, full donor and full regression suites NOT_RUN. Convert PR to Ready for full required CI.');
