import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {prepareRestoredCanonical} from '../src/ui/restore-sanitize.mjs';
import {compileV2,streamV2Frames,decodeAuthenticatedV2,canonicalJSON}
  from '../src/ui/backup-v2-codec.mjs';
import {serializeClone,deserializeClone,digest}
  from '../src/ui/backup-core.mjs';
import {prepareInactiveV2} from '../src/ui/restore-v2-prep.mjs';
import {createPortableBackupPayload,encodeBackupEnvelope,decodeBackupEnvelope}
  from '../donor/personamonkey/extension/lib/backup-package.js';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const empty=()=>({schema:1,stores:{entities:[],operations:[],events:[],meta:[],observations:[]}});
const row=(key,value)=>({key,value});
const account=(id,revision=2)=>row('account:'+id,{account:{accountId:id,
  revision,state:'ARCHIVED',personaUid:'uid-'+id,history:[]}});
const removal=(id,revision=8)=>row('removal:'+id,{
  key:'removal:'+id,state:'REMOVED_ONLY_LOCALLY',revision,personaUid:'uid-'+id,
  exitHistory:['198.19.1.8','2001:db8::8']});
test('R3: archived account Z is excluded by newer removal in merge and replace',()=>{
  for(const mode of ['merge','replace']){
    const saved=empty(),destination=empty();
    saved.stores.meta.push(account('Z'));
    saved.stores.meta.push(row('inventory:Z',{generator:{accountId:'Z',
      sourceFiles:[{path:'main.pjs',sha256:'a'.repeat(64)}]}}));
    destination.stores.meta.push(removal('Z'));
    const prepared=prepareRestoredCanonical({incoming:saved,current:destination,mode});
    const keys=prepared.stores.meta.map(v=>v.key);
    assert.ok(!keys.includes('account:Z'));
    assert.ok(keys.includes('removal:Z'));
    const inventory=deserializeClone(prepared.stores.meta.find(v=>v.key==='inventory:Z').value);
    assert.equal(inventory.generator.ownerState,'HISTORICAL_REMOVED_ACCOUNT');
    assert.equal(inventory.generator.personaUid,null);
  }
});
test('R3: old tombstone ambiguity and bypassed newer removal stay held',()=>{
  const saved=empty(),destination=empty();saved.stores.meta.push(account('Z',3));
  destination.stores.meta.push(removal('Z',2));
  assert.throws(()=>prepareRestoredCanonical({incoming:saved,current:destination}),
    /RESTORE_REMOVAL_HISTORY_AMBIGUOUS/);
  destination.stores.meta[0]=removal('Z',8);
  assert.throws(()=>prepareRestoredCanonical({incoming:saved,current:destination,
    accountChoices:{Z:'INCLUDE_INACTIVE'}}),
    /RESTORE_REMOVED_ACCOUNT_REQUIRES_SEPARATE_REVIEW/);
});
test('R3: fresh-profile inclusion requires explicit choice; no hidden binding authority',()=>{
  const saved=empty();saved.stores.meta.push(account('Z'));
  assert.throws(()=>prepareRestoredCanonical({incoming:saved,current:empty(),
    mode:'replace',fresh:true}),/RESTORE_FRESH_ACCOUNT_DECISION_REQUIRED/);
  const exclude=prepareRestoredCanonical({incoming:saved,current:empty(),
    mode:'replace',fresh:true,accountChoices:{Z:'EXCLUDE'}});
  assert.ok(!exclude.stores.meta.some(v=>v.key==='account:Z'));
  const include=prepareRestoredCanonical({incoming:saved,current:empty(),
    mode:'replace',fresh:true,accountChoices:{Z:'INCLUDE_INACTIVE'}});
  const recorded=deserializeClone(include.stores.meta.find(v=>v.key==='account:Z').value);
  assert.equal(recorded.account.state,'ARCHIVED');assert.equal(recorded.account.identity,null);
});
test('R3: conflicting historic exit ownership and UID remaps block admission',()=>{
  const src=empty(),dest=empty();
  src.stores.meta.push(account('Z'));
  src.stores.meta.push(row('network:s01:exit-ownership-v1',{owners:{'IPv4:198.19.1.8':'Z'}}));
  dest.stores.meta.push(row('network:s01:exit-ownership-v1',{owners:{'IPv4:198.19.1.8':'Y'}}));
  assert.throws(()=>prepareRestoredCanonical({incoming:src,current:dest,mode:'replace'}),
    /RESTORE_EXIT_HISTORY_CONFLICT/);
  assert.throws(()=>prepareRestoredCanonical({incoming:src,current:empty(),
    uidRemap:{oldA:'same',oldB:'same'}}),/RESTORE_UID_MAPPING_COLLISION/);
});
test('R6: nested literal discriminator may never become Undefined/Bytes/Date',async()=>{
  const donor=await encodeBackupEnvelope({payload:createPortableBackupPayload({
    state:{},containers:[],selection:{kind:'full'}}),
    password:'disposable-strong-backup-passphrase'});
  for(const name of ['Undefined','Date','Bytes','NumberNegativeZero']){
    const src=empty();src.stores.meta.push(row('source:literal',{meta:{
      nested:[{__pcmsType:name}],asset:{x:2}}}));
    await assert.rejects(compileV2(src,donor),/BACKUP_V2_RESERVED_DISCRIMINATOR/);
  }
});
test('R6: raw Date, undefined, binary buffer and -0 roundtrip through real v2 frame and sanitizer',async()=>{
  const password='disposable-strong-backup-passphrase';
  const donor=await encodeBackupEnvelope({payload:createPortableBackupPayload({
    state:{},containers:[],selection:{kind:'full'}}),password});
  const pcms=empty(),now=new Date('2024-07-04T04:00:01Z');
  pcms.stores.meta.push(row('source:types',{history:[
    {timestamp:now,missing:undefined,binary:new Uint8Array([0,255,44]),
      raw:new Uint8Array([9,8]).buffer,negative:-0,normal:0}
  ]}));
  const plan=await compileV2(pcms,donor),parts=[];
  for await(const frag of streamV2Frames(plan))parts.push(frag);
  const plain=new Uint8Array(parts.reduce((a,x)=>a+x.length,0));
  let at=0;for(const frag of parts){plain.set(frag,at);at+=frag.length;}
  const proof='f'.repeat(64);
  const prepared=await prepareInactiveV2({
    authenticatedPlaintext:plain,
    readback:{state:'AUTHENTICATED_SECOND_PASS',sha256:proof},
    expectedCiphertextSha256:proof,password,decodeDonor:decodeBackupEnvelope,
    currentPcms:empty(),mode:'replace'});
  const restored=deserializeClone(prepared.prepared.stores.meta[0].value).history[0];
  assert.equal(restored.timestamp.toISOString(),now.toISOString());
  assert.equal(Object.hasOwn(restored,'missing'),true);
  assert.equal(restored.missing,undefined);
  assert.deepEqual([...restored.binary],[0,255,44]);
  assert.deepEqual([...new Uint8Array(restored.raw)],[9,8]);
  assert.ok(Object.is(restored.negative,-0));assert.ok(!Object.is(restored.normal,-0));
  assert.equal(prepared.activation,'OFF');
});
test('R5: Python native lexical JSON and JS canonicalJSON agree on numeric/Unicode vectors',()=>{
  const vectors=[
    ['{"a":1}',true],['{"a":1.0}',false],['{"a":1e+0}',false],
    ['{"a":1e-7}',true],['{"a":0.000001}',true],['{"a":1e-06}',false],
    ['{"a":1e+21}',true],['{"a":-0}',false],
    ['{"a":9007199254740992}',true],['{"a":9007199254740993}',false],
    ['{"a":-9007199254740992}',true],['{"a":1e309}',false],
    ['{"a":NaN}',false],['{"z":1,"a":2}',false],
    ['{"a":1,"a":2}',false],
    ['{"\\ud800":1}',false],
    ['{"\\ud83d\\ude00":1}',false],
    ['{"😀":1}',true],
    ['{"\uE000":1,"😀":2}',false],
    ['{"😀":2,"\uE000":1}',true]
  ];
  const python=[
    'import sys,json',
    'from native.backup_stream_v2 import _Inventory',
    'for raw in json.loads(sys.stdin.read()):',
    ' try: _Inventory._json(raw.encode("utf-8"),"BACKUP_JSON_INVALID"); print("1")',
    ' except (ValueError,UnicodeError): print("0")'
  ].join('\n');
  const executed=spawnSync('python3',['-c',python],{input:JSON.stringify(vectors.map(x=>x[0])),
    encoding:'utf8',timeout:15000});
  assert.equal(executed.status,0,executed.stderr);
  const native=executed.stdout.trim().split('\n').map(x=>x==='1');
  for(const [i,[raw,expected]] of vectors.entries()){
    let accepted=false;
    try{accepted=canonicalJSON(JSON.parse(raw))===raw;}catch{}
    assert.equal(accepted,expected,'JS:'+raw);
    assert.equal(native[i],expected,'native:'+raw);
  }
});
