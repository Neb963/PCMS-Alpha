import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {verifyPackagedModuleGraph} from '../scripts/build-i00.mjs';
test('S08 packaging rejects missing entry dependency before XPI creation',async()=>{
 const root=await mkdtemp(path.join(os.tmpdir(),'s08-imports-'));
 try{
  await mkdir(path.join(root,'pcms'));
  await writeFile(path.join(root,'pcms','entry.mjs'),"import './dashboard-action.mjs';\n");
  await assert.rejects(verifyPackagedModuleGraph(root),/PACKAGED_MODULE_GRAPH_INCOMPLETE.*dashboard-action/);
  await writeFile(path.join(root,'pcms','dashboard-action.mjs'),"export const ready=true;\n");
  assert.equal((await verifyPackagedModuleGraph(root)).missing,0);
 }finally{await rm(root,{force:true,recursive:true});}
});
