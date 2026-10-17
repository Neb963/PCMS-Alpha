import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {compileV2,streamV2Frames} from '../src/ui/backup-v2-codec.mjs';
import {digest,DB_STORES} from '../src/ui/backup-core.mjs';
import {createPortableBackupPayload,encodeBackupEnvelope} from
  '../donor/personamonkey/extension/lib/backup-package.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const enc=new TextEncoder();
async function source(){
  const values=[['main.pjs',enc.encode('output="fleet exact";')],
    ['index.html',enc.encode('<h1>fleet</h1>')],
    ['src/shared.bin',Uint8Array.from([0,254,255,6,0,17])]];
  const files=await Promise.all(values.map(async([path,bytes])=>({
    path,size:bytes.length,sha256:await digest(bytes)
  })));
  files.sort((a,b)=>a.path.localeCompare(b.path));
  const blobs=files.map(f=>({path:f.path,base64:Buffer.from(
    values.find(x=>x[0]===f.path)[1]).toString('base64')}));
  const fingerprint=await digest('PCMS_STAGED_SOURCE_V1\n'+
    files.map(f=>JSON.stringify([f.path,f.size,f.sha256])).join('\n'));
  return {ok:true,files,blobs,fingerprint};
}
test('S02 synthetic 50 account / 1000 source-bearing row fleet: no missing history or duplicate payload',async()=>{
  const stamp=Date.now(),before=process.memoryUsage().heapUsed;
  const candidate=await source(),pcms={schema:1,stores:Object.fromEntries(
    DB_STORES.map(x=>[x,[]]))};
  for(let i=0;i<50;i++)pcms.stores.meta.push({
    key:'account:synthetic-'+i,value:{account:{state:'VERIFICATION_PENDING',
      accountId:'account-'+i}}});
  for(let i=0;i<1000;i++)pcms.stores.meta.push({
    key:'stage-history:synthetic-'+i,value:{record:{
      candidate,previous:candidate,run:'held-history-'+i}}});
  const donor=await encodeBackupEnvelope({
    payload:createPortableBackupPayload({state:{},containers:[],selection:{kind:'full'}}),
    password:'synthetic-only-50-1000-password'
  });
  const plan=await compileV2(pcms,donor);
  assert.equal(plan.terminal.canonicalRows,1050);
  assert.equal(plan.terminal.uniqueBlobs,3,'dedup never loses source manifest references');
  assert.equal(plan.terminal.storeCounts.meta,1050);
  assert.equal(plan.refs.length,3);
  let total=0,fragments=0,peak=0;
  for await(const data of streamV2Frames(plan)){
    assert.ok(data.length<=65536);
    total+=data.length;fragments++;
    peak=Math.max(peak,data.length);
  }
  assert.equal(total,plan.plaintextBytes);
  const stats={accounts:50,records:1000,rows:plan.terminal.canonicalRows,
    blobCount:3,streamBytes:total,fragments,maxFragmentBytes:peak,
    elapsedMs:Date.now()-stamp,heapDeltaBytes:process.memoryUsage().heapUsed-before};
  console.log('S02_D_SYNTHETIC_SOURCE_FLEET='+JSON.stringify(stats));
});
