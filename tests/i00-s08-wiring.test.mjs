import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('S08 packaged creation entrypoints require explicit standing grants',async()=>{
 const paths=['src/runtime/coordinator-boundary.mjs','src/runtime/creation-watch.mjs',
  'src/runtime/supply-boundary.mjs'];
 for(const path of paths){
  const source=await readFile(path,'utf8');
  assert.match(source,/standingS06\?\.gate\('development'\)===true/,path);
  assert.match(source,/standingS06\?\.gate\('gitWrite'\)===true/,path);
 }
 const runner=await readFile('src/runtime/creation-runner.mjs','utf8');
 assert.match(runner,/git=createGit\(api,\{open,gate:gitGate\}\)/);
 const release=await readFile('src/runtime/release-boundary.mjs','utf8');
 assert.match(release,/standingS06\?\.gate\('publication'\)===true/);
});
