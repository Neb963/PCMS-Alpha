import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const generated=path.join(root,'build/s01-native-candidate/native_host.py');
test('S01 E04: build exact original-host derivative without changing signed donor',async()=>{
 const baseline=await readFile(path.join(root,'donor/personamonkey/native/native_host.py'));
 const built=spawnSync('python3',[path.join(root,'scripts/build-s01-native.py')],{cwd:root,encoding:'utf8'});
 assert.equal(built.status,0,built.stderr);
 assert.ok((await stat(generated)).size>baseline.length);
 assert.deepEqual(await readFile(path.join(root,'donor/personamonkey/native/native_host.py')),baseline);
});
test('S01 E04 H narrow: actual native process reports paired OS clock counters over existing framed pipe',async()=>{
 const request=(id,extra={})=>{
   const raw=Buffer.from(JSON.stringify({id,command:'pcms.runtime_witness',...extra}));
   const header=Buffer.alloc(4);header.writeUInt32LE(raw.length);
   return Buffer.concat([header,raw]);
 };
 const run=spawnSync('python3',[generated],{
   input:Buffer.concat([request(1),request(2),request(3,{endpoint:'/tmp/forbidden'})]),
   timeout:5000,env:{...process.env,PRM_SOCKET:'/nonexistent-s01-native.sock'}});
 assert.equal(run.status,0,run.stderr.toString());
 let off=0,values=[];
 while(off<run.stdout.length){
   const n=run.stdout.readUInt32LE(off);off+=4;
   values.push(JSON.parse(run.stdout.subarray(off,off+n)));off+=n;
 }
 assert.equal(values.length,3);
 const [a,b,bad]=values;
 assert.equal(a.ok,true);assert.equal(b.ok,true);
 assert.equal(a.schema,1);assert.equal(a.sequence+1,b.sequence);
 assert.equal(a.nativeLifetimeId,b.nativeLifetimeId);
 assert.equal(a.observerConnectionId,b.observerConnectionId);
 assert.ok(BigInt(b.hostAwakeNs)>=BigInt(a.hostAwakeNs));
 assert.ok(BigInt(b.hostBootNs)>=BigInt(a.hostBootNs));
 assert.ok(BigInt(a.hostBootNs)>=BigInt(a.hostAwakeNs));
 assert.equal(bad.ok,false);
 assert.equal(bad.code,'WITNESS_INVALID_REQUEST');
 const later=spawnSync('python3',[generated],{input:request(4),
   timeout:5000,env:{...process.env,PRM_SOCKET:'/nonexistent-s01-native.sock'}});
 assert.equal(later.status,0);
 const size=later.stdout.readUInt32LE(0);
 const c=JSON.parse(later.stdout.subarray(4,4+size));
 assert.equal(c.ok,true);assert.notEqual(c.nativeLifetimeId,a.nativeLifetimeId);
 assert.notEqual(c.observerConnectionId,a.observerConnectionId);
});
