import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,stat,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const encode=value=>{
  const bytes=Buffer.from(JSON.stringify(value),'utf8');
  const header=Buffer.alloc(4);header.writeUInt32LE(bytes.length);
  return Buffer.concat([header,bytes]);
};
const decode=buffer=>{
  let pos=0,records=[];
  while(pos<buffer.length){
    assert.ok(pos+4<=buffer.length);
    const size=buffer.readUInt32LE(pos);pos+=4;
    assert.ok(size>0&&pos+size<=buffer.length);
    records.push(JSON.parse(buffer.subarray(pos,pos+size).toString('utf8')));
    pos+=size;
  }
  return records;
};
test('S02 exact native executable speaks length-prefixed protocol, rejects path injection and creates no root for inspect',async()=>{
  const home=await mkdtemp(path.join(tmpdir(),'pcms-s02-stdio-'));
  try{
    const messages=Buffer.concat([
      encode({action:'archive.inspect',runId:'s02_'+'b'.repeat(32)}),
      encode({action:'archive.inspect',runId:'../etc/passwd'})
    ]);
    const run=spawnSync('python3',['-u','native/backup_v2_host.py'],{
      cwd:repo,env:{...process.env,HOME:home},input:messages,
      timeout:12000,maxBuffer:50000});
    assert.equal(run.error,undefined);
    assert.equal(run.status,0,run.stderr.toString());
    const responses=decode(run.stdout);
    assert.deepEqual(responses.map(x=>x.code),[
      'BACKUP_NOT_TRACKED','BACKUP_RUN_ID_INVALID'
    ]);
    await assert.rejects(stat(path.join(home,'.local','share','pcms-alpha','backups')),
      {code:'ENOENT'});
  }finally{await rm(home,{recursive:true,force:true});}
});
