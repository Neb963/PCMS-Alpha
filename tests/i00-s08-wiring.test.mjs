import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('S08 creation entrypoints preserve Git authority and canonical scoped operator policy',async()=>{
 const paths=['src/runtime/coordinator-boundary.mjs','src/runtime/creation-watch.mjs',
  'src/runtime/supply-boundary.mjs'];
 for(const path of paths){
  const source=await readFile(path,'utf8');
  if(['coordinator-boundary.mjs','creation-watch.mjs'].some(name=>path.endsWith(name)))
   assert.match(source,/effectGate:createScopedCreationGate\(authority\)/,path);
  else assert.match(source,/standingS06\?\.gate\('development'\)===true/,path);
  assert.match(source,/standingS06\?\.gate\('gitWrite'\)===true/,path);
 }
 const runner=await readFile('src/runtime/creation-runner.mjs','utf8');
 assert.match(runner,/git=createGit\(api,\{open,gate:gitGate\}\)/);
 const release=await readFile('src/runtime/release-boundary.mjs','utf8');
 assert.match(release,/standingS06\?\.gate\('publication'\)===true/);
});

test('S08 cold recovery listener is registered once, immediately after donor bootstrap',async()=>{
 const entry=await readFile('src/runtime/entry.mjs','utf8');
 const donor=entry.indexOf("import '../lib/recovery-bootstrap.js';");
 const restore=entry.indexOf("import './restore-boundary.mjs';");
 const wake=entry.indexOf("import './wake.mjs';");
 assert.ok(donor>=0&&restore>donor&&wake>restore);
 assert.equal(entry.split("import './restore-boundary.mjs';").length-1,1);
});
