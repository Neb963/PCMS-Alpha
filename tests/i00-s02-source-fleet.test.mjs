import {scanV2AuthenticatedFrames} from '../src/ui/restore-v2-frame-scanner.mjs';
import {decodeV2InactiveFrames} from '../src/ui/restore-v2-stream-decode.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileV2,streamV2Frames} from '../src/ui/backup-v2-codec.mjs';
import {digest,DB_STORES} from '../src/ui/backup-core.mjs';
import {createPortableBackupPayload,encodeBackupEnvelope,decodeBackupEnvelope} from
  '../donor/personamonkey/extension/lib/backup-package.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const enc=new TextEncoder();
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const passphrase='synthetic-only-50-1000-password';
const concat=parts=>{
  const size=parts.reduce((sum,part)=>sum+part.byteLength,0),result=new Uint8Array(size);
  let cursor=0;
  for(const part of parts){result.set(part,cursor);cursor+=part.byteLength;}
  return result;
};
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
    password:passphrase
  });
  const plan=await compileV2(pcms,donor);
  assert.equal(plan.terminal.canonicalRows,1050);
  assert.equal(plan.terminal.uniqueBlobs,3,'dedup never loses source manifest references');
  assert.equal(plan.terminal.storeCounts.meta,1050);
  assert.equal(plan.refs.length,3);
  let total=0,fragments=0,peak=0;
  const plaintextFragments=[];
  for await(const data of streamV2Frames(plan)){
    assert.ok(data.length<=65536);
    total+=data.length;fragments++;
    peak=Math.max(peak,data.length);
    plaintextFragments.push(data);
  }
  assert.equal(total,plan.plaintextBytes);
  // Disposable D-tier filesystem readback: actual source-bearing 1,000-record
  // GCM encryption, two independent native decrypt/inventory passes and
  // WebCrypto cross-runtime decryption, then full JS donor/source restoration.
  const folder=await mkdtemp(path.join(tmpdir(),'pcms-s02-1000-'));
  let diskProof,restoredRows=0;
  try{
    const destination=path.join(folder,'source-heavy.encrypted');
    const python=[
      'import sys,json',
      'from native.backup_stream_v2 import EncryptedWriter,verify_two_pass,BUFFER',
      'raw=sys.stdin.buffer.read()',
      'w=EncryptedWriter(sys.argv[1],sys.argv[2],len(raw))',
      'for pos in range(0,len(raw),BUFFER):w.append(raw[pos:pos+BUFFER])',
      'w.finish()',
      'print(json.dumps(verify_two_pass(sys.argv[1],sys.argv[2])))'
    ].join('\n');
    const sealed=spawnSync('python3',['-c',python,destination,passphrase],{
      cwd:root,input:Buffer.from(concat(plaintextFragments)),
      timeout:60000,encoding:'utf8',maxBuffer:2*1024*1024});
    assert.equal(sealed.error,undefined);
    assert.equal(sealed.status,0,sealed.stderr);
    diskProof=JSON.parse(sealed.stdout);
    assert.equal(diskProof.status,'AUTHENTICATED_SOURCE_INVENTORY');
    assert.equal(diskProof.canonicalRows,1050);
    assert.equal(diskProof.uniqueBlobs,3);
    const ciphertext=await readFile(destination),header=ciphertext.subarray(0,50);
    const material=await crypto.subtle.importKey('raw',enc.encode(passphrase),
      'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',
      iterations:250000,salt:header.subarray(14,30)},material,
      {name:'AES-GCM',length:256},false,['decrypt']);
    const opened=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',
      iv:header.subarray(30,42),additionalData:header,tagLength:128},
      key,ciphertext.subarray(50)));
    assert.deepEqual(opened,concat(plaintextFragments));
    async function* bounded(){
      for(let i=0;i<opened.byteLength;i+=49152)
        yield opened.subarray(i,i+49152);
    }
    const restored=await decodeV2InactiveFrames(
      scanV2AuthenticatedFrames(bounded()),{
        password:passphrase,decodeDonor:decodeBackupEnvelope});
    restoredRows=restored.pcms.stores.meta.length;
    assert.equal(restoredRows,1050);
    assert.equal(restored.pcms.stores.meta.filter(row=>
      row.key.startsWith('stage-history:')).length,1000);
    assert.equal(restored.pcms.stores.meta.find(row=>
      row.key==='stage-history:synthetic-999').value.record.candidate.blobs[2].base64,
      candidate.blobs[2].base64);
  }finally{await rm(folder,{recursive:true,force:true});}
  const stats={accounts:50,records:1000,rows:plan.terminal.canonicalRows,
    blobCount:3,streamBytes:total,fragments,maxFragmentBytes:peak,
    restoredRows,nativeDiskInventory:diskProof.status,
    elapsedMs:Date.now()-stamp,heapDeltaBytes:process.memoryUsage().heapUsed-before};
  console.log('S02_D_SYNTHETIC_SOURCE_FLEET='+JSON.stringify(stats));
});

async function sourceVariant(seed){
  const asBytes=(length,salt)=>Uint8Array.from({length},(_,i)=>
    (seed*71+i*29+salt*43+Math.floor(i/13))&255);
  const values=[
    ['main.pjs',enc.encode('output="source-'+seed+'";\nvar rev='+seed+';')],
    ['index.html',enc.encode('<div data-source="'+(seed%17)+'">safe</div>')],
    ['src/asset.bin',asBytes(300+seed%4096,1)],
    ['src/preview.bin',asBytes(seed%89,2)],
    ['src/revision.bin',asBytes(17+(seed*19)%128,3)]
  ];
  const files=await Promise.all(values.map(async([path,bytes])=>({
    path,size:bytes.length,sha256:await digest(bytes)
  })));
  files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
  return {ok:true,files,blobs:files.map(f=>({
    path:f.path,base64:Buffer.from(values.find(v=>v[0]===f.path)[1]).toString('base64')
  })),fingerprint:await digest('PCMS_STAGED_SOURCE_V1\n'+
    files.map(f=>JSON.stringify([f.path,f.size,f.sha256])).join('\n'))};
}
test('S02 F3 heterogeneous 50/1024 fleet: thousands of distinct raw assets and long donor, no omission',async()=>{
  const memBefore=process.memoryUsage(),began=performance.now();
  const pcms={schema:1,stores:Object.fromEntries(DB_STORES.map(store=>[store,[]]))};
  for(let i=0;i<50;i++)pcms.stores.meta.push({key:'account:stress-'+i,value:{
    account:{accountId:'stress-'+i,state:'ARCHIVED',personaUid:'uid-'+i,
      exitHistory:['203.0.113.'+(i%250),'2001:db8::'+i]}}});
  for(let i=0;i<1024;i++){
    const candidate=await sourceVariant(i+10);
    const previous=await sourceVariant(i+9);
    pcms.stores.meta.push({key:'stage-history:stress-'+i,value:{
      record:{candidate,previous,owner:'stress-'+i%50,
        approval:{candidateRevision:'historical-only-'+i},state:'HELD_UNCERTAIN'}}});
  }
  const data=Object.fromEntries(Array.from({length:50},(_,i)=>
    ['gm-values:stress-'+i,{generators:Array.from({length:45},
      (_,j)=>('src-'+i+'-'+j+'-').repeat(20))}]));
  const donorState={profiles:{},scripts:{},routes:{},workflows:{}};
  const containers=[],cookiesByProfile={},syntheticValues={};
  for(let i=0;i<50;i++){
    const context='firefox-container-'+(200+i),script='script-'+i;
    donorState.profiles[context]={containerId:context,managed:true,
      routeId:'__block__',name:'Restorable Synthetic '+i,
      scriptIds:[script],personaUid:undefined};
    donorState.scripts[script]={id:script,name:'Synthetic Script '+i,
      code:'// synthetic source '+i+'\n'+('var a='+i+';').repeat(30)};
    containers.push({cookieStoreId:context,name:'Restorable Synthetic '+i,
      color:'blue',icon:'fingerprint'});
    cookiesByProfile[context]=[{name:'synthetic-'+i,
      value:'disposable-'+i+'-'+('x'.repeat(120)),domain:'example.invalid',
      path:'/',secure:true,httpOnly:true}];
    syntheticValues['gm-values:'+script]={sourceKey:'synthetic-'+i,
      data:('payload-'+i+'-').repeat(400)};
  }
  const rawDonor=createPortableBackupPayload({state:donorState,containers,
    cookiesByProfile,userscriptData:syntheticValues,selection:{kind:'full'}});
  assert.equal(rawDonor.personas.length,50);
  assert.equal(rawDonor.scripts.length,50);
  assert.equal(Object.keys(rawDonor.cookies).length,50);
  assert.equal(Object.keys(rawDonor.gmValues).length,50);
  const donor=await encodeBackupEnvelope({payload:rawDonor,password:passphrase});
  assert.ok(donor.length>100000,'donor must be materially sized, not empty');
  const plan=await compileV2(pcms,donor);
  assert.equal(plan.terminal.canonicalRows,1074);
  assert.ok(plan.terminal.uniqueBlobs>3000,
    'test requires actual diverse source and binary assets');
  assert.ok(plan.plaintextBytes>4*1024*1024,
    'not a three-blob miniature; must exercise multiple MiB');
  const pieces=[],seenMax={fragment:0};
  for await(const block of streamV2Frames(plan)){
    pieces.push(block);
    seenMax.fragment=Math.max(seenMax.fragment,block.length);
  }
  assert.ok(seenMax.fragment<=65536);
  const content=concat(pieces),temp=await mkdtemp(path.join(tmpdir(),'pcms-s02-f3-'));
  try{
    const destination=path.join(temp,'heterogeneous.encrypted');
    const script=[
      'import sys,json,resource,os',
      'from native.backup_stream_v2 import EncryptedWriter,verify_two_pass,BUFFER',
      'plain=sys.stdin.buffer.read()',
      'writer=EncryptedWriter(sys.argv[1],sys.argv[2],len(plain))',
      'for i in range(0,len(plain),BUFFER):writer.append(plain[i:i+BUFFER])',
      'writer.finish()',
      'result=verify_two_pass(sys.argv[1],sys.argv[2])',
      'result["peakNativeRssKiB"]=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss',
      'result["encryptedDiskBytes"]=os.stat(sys.argv[1]).st_size',
      'print(json.dumps(result))'
    ].join('\n');
    const native=spawnSync('python3',['-c',script,destination,passphrase],{
      cwd:root,input:Buffer.from(content),encoding:'utf8',timeout:120000,
      maxBuffer:2*1024*1024
    });
    assert.equal(native.error,undefined);
    assert.equal(native.status,0,native.stderr);
    const result=JSON.parse(native.stdout);
    assert.equal(result.status,'AUTHENTICATED_SOURCE_INVENTORY');
    assert.equal(result.canonicalRows,1074);
    assert.equal(result.uniqueBlobs,plan.terminal.uniqueBlobs);
    assert.equal(result.encryptedDiskBytes,content.length+66);
    const encrypted=await readFile(destination),header=encrypted.subarray(0,50);
    const material=await crypto.subtle.importKey('raw',enc.encode(passphrase),
      'PBKDF2',false,['deriveKey']);
    const key=await crypto.subtle.deriveKey({name:'PBKDF2',hash:'SHA-256',
      iterations:250000,salt:header.subarray(14,30)},material,
      {name:'AES-GCM',length:256},false,['decrypt']);
    const opened=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',
      iv:header.subarray(30,42),additionalData:header,tagLength:128},
      key,encrypted.subarray(50)));
    async function* segments(){
      for(let i=0;i<opened.byteLength;i+=32768)
        yield opened.subarray(i,i+32768);
    }
    const decoded=await decodeV2InactiveFrames(
      scanV2AuthenticatedFrames(segments()),{
        password:passphrase,decodeDonor:decodeBackupEnvelope});
    assert.equal(decoded.pcms.stores.meta.length,1074);
    assert.equal(decoded.donor.personas.length,50);
    assert.equal(decoded.donor.scripts.length,50);
    assert.equal(Object.keys(decoded.donor.cookies).length,50);
    assert.equal(Object.keys(decoded.donor.gmValues).length,50);
    assert.equal(decoded.inventory.uniqueBlobs,plan.terminal.uniqueBlobs);
    for(const i of [0,31,127,511,1023]){
      const record=decoded.pcms.stores.meta.find(x=>x.key==='stage-history:stress-'+i);
      assert.ok(record);
      assert.deepEqual(record.value.record.candidate,
        pcms.stores.meta[50+i].value.record.candidate);
      assert.deepEqual(record.value.record.previous,
        pcms.stores.meta[50+i].value.record.previous);
    }
    const stats={accounts:50,historyRows:1024,canonicalRows:1074,
      uniqueSourceBlobs:result.uniqueBlobs,
      donorEncryptedBytes:new TextEncoder().encode(donor).length,
      donorPersonas:decoded.donor.personas.length,
      donorCookies:Object.keys(decoded.donor.cookies).length,
      plaintextBytes:content.length,
      encryptedDiskBytes:result.encryptedDiskBytes,
      peakNativeRssKiB:result.peakNativeRssKiB,
      nodeHeapDelta:process.memoryUsage().heapUsed-memBefore.heapUsed,
      nodeRssDelta:process.memoryUsage().rss-memBefore.rss,
      elapsedMs:Math.round(performance.now()-began)};
    console.log('S02_F3_DIVERSE_SOURCE_MEASURE='+JSON.stringify(stats));
  }finally{await rm(temp,{recursive:true,force:true});}
});
