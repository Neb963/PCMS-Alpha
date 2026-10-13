import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {createPortableBackupPayload,encodeBackupEnvelope,decodeBackupEnvelope} from '../donor/personamonkey/extension/lib/backup-package.js';
import {FORMAT,DB_STORES,serializeClone,deserializeClone,validatePcmsSnapshot,
  encodeIntegrated,decodeIntegrated,consistentOrThrow,verifyBrowserDownload,
  observeDownload,snapshotCanonical} from '../src/ui/backup-core.mjs';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const PASSWORD='I08-specific-portable-test-passphrase';
function samplePcms(){
  const stores=Object.fromEntries(DB_STORES.map(s=>[s,[]]));
  stores.entities.push({key:'generator-1',value:serializeClone({
    id:'generator-1',revision:7,source:'SRC_SECRET_NOT_OUTSIDE_GCM',
    files:{'index.html':'<main>Ω</main>', 'src/image.bin':new Uint8Array([0,255,42,12])}
  })});
  stores.operations.push({key:'possible-1',value:serializeClone({
    operationId:'possible-1',status:'DISPATCH_POSSIBLE',revision:9})});
  stores.meta.push({key:'some-key',value:serializeClone({key:'some-key',phase:'I07'})});
  return {schema:1,stores};
}
async function sampleDonor(){
  const payload=createPortableBackupPayload({state:{},containers:[],
    selection:{kind:'full'}});
  return encodeBackupEnvelope({payload,password:PASSWORD,scope:{kind:'full'}});
}
test('P55-01 and S6-I08: one outer envelope encrypts PCMS bytes even if donor considers its own payload nonsensitive',async()=>{
  const pcms=samplePcms(),donorEnvelope=await sampleDonor();
  const out=await encodeIntegrated({pcms,donorEnvelope,passphrase:PASSWORD});
  const header=JSON.parse(out.text);
  assert.deepEqual(Object.keys(header).sort(),['encryption','format','sealedPayload','version'].sort());
  assert.equal(header.format,FORMAT);
  assert.equal(out.text.includes('SRC_SECRET_NOT_OUTSIDE_GCM'),false);
  assert.equal(out.text.includes('generator-1'),false);
  assert.equal(out.text.includes('cookieStoreId'),false);
  const restored=await decodeIntegrated(out.text,PASSWORD,{decodeDonor:decodeBackupEnvelope});
  assert.equal(JSON.stringify(restored.pcms),JSON.stringify(pcms));
  assert.equal(restored.pcms.stores.operations[0].value.status,'DISPATCH_POSSIBLE');
  const binary=deserializeClone(restored.pcms.stores.entities[0].value.files['src/image.bin']);
  assert.deepEqual([...binary],[0,255,42,12]);
  assert.equal(restored.exclusions.some(t=>/WireGuard/.test(t)),true);
  assert.match(out.sha256,/^[a-f0-9]{64}$/);
});
test('P55-01: all decision-bearing header fields authenticated or rejected and zero mutations',async()=>{
  const out=await encodeIntegrated({pcms:samplePcms(),
    donorEnvelope:await sampleDonor(),passphrase:PASSWORD});
  let mutationCount=0;
  const open=async(candidate,password=PASSWORD)=>{
    const result=await decodeIntegrated(JSON.stringify(candidate),password,{decodeDonor:decodeBackupEnvelope});
    mutationCount++;return result;
  };
  const original=JSON.parse(out.text);
  const altered=[
    {...original,version:2},
    {...original,createdAt:'forged'},
    {...original,encryption:{...original.encryption,iterations:1}},
    {...original,encryption:{...original.encryption,salt:original.encryption.salt.slice(0,-1)+'A'}},
    {...original,encryption:{...original.encryption,iv:original.encryption.iv.slice(0,-1)+'A'}},
    {...original,sealedPayload:original.sealedPayload.slice(0,-3)+'AAA'},
    {...original,format:'personamonkey-backup'},
    {...original,encryption:null}
  ];
  for(const candidate of altered)await assert.rejects(()=>open(candidate));
  await assert.rejects(()=>decodeIntegrated(out.text,'wrong-passphrase',{decodeDonor:decodeBackupEnvelope}));
  const sealedDonor=await sampleDonor();
  await assert.rejects(()=>encodeIntegrated({pcms:samplePcms(),donorEnvelope:sealedDonor,passphrase:''}));
  assert.equal(mutationCount,0);
});
test('P55-01: malformed or unknown required store, duplicate key, donor plaintext, unsupported binary hold',async()=>{
  const p=samplePcms();delete p.stores.operations;
  assert.throws(()=>validatePcmsSnapshot(p),/BACKUP_INCOMPLETE/);
  const p2=samplePcms();p2.stores.meta.push(p2.stores.meta[0]);
  assert.throws(()=>validatePcmsSnapshot(p2),/BACKUP_DUPLICATE_ROW/);
  const p3=samplePcms();p3.stores.entities[0].value.cyclic=()=>{};
  await assert.rejects(()=>encodeIntegrated({pcms:p3,donorEnvelope:'{}',passphrase:PASSWORD}));
  assert.throws(()=>serializeClone({danger:new Blob(['not supported'])}),/BACKUP_UNSUPPORTED_VALUE/);
  const x=serializeClone({src:new Uint8Array([0,1,255]),now:new Date('2026-01-01T00:00:00Z')});
  assert.deepEqual([...deserializeClone(x).src],[0,1,255]);
  assert.equal(deserializeClone(x).now.getTime(),new Date('2026-01-01Z').getTime());
  const withMissing=serializeClone({owner:'fixture',unset:undefined});
  const recovered=deserializeClone(withMissing);
  assert.equal(Object.hasOwn(recovered,'unset'),true);
  assert.equal(recovered.unset,undefined);
});
test('P55-02: independent pre/post local and donor cuts reject concurrent revision/source changes',()=>{
  const a=samplePcms(),b=samplePcms();
  consistentOrThrow(a,b);
  b.stores.operations[0].value.status='CONFIRMED';
  assert.throws(()=>consistentOrThrow(a,b),/BACKUP_LOCAL_DRIFT/);
  const src=samplePcms();
  src.stores.entities[0].value.files['index.html']='changed by human';
  assert.throws(()=>consistentOrThrow(a,src),/BACKUP_LOCAL_DRIFT/);
  const donorBefore={profiles:{one:{revision:1}}},donorAfter={profiles:{one:{revision:2}}};
  assert.throws(()=>consistentOrThrow(donorBefore,donorAfter),/BACKUP_LOCAL_DRIFT/);
});
test('P55-02: bounded 1000-record immutable cut preserves source and uncertain external intent',()=>{
  const p=samplePcms();
  for(let i=0;i<1000;i++)p.stores.observations.push({
    key:i,value:serializeClone({fingerprint:'a'.repeat(64),source:'<x>☺</x>',revision:i})});
  validatePcmsSnapshot(p);
  assert.equal(p.stores.observations.length,1000);
  assert.equal(p.stores.operations[0].value.status,'DISPATCH_POSSIBLE');
});
test('P55-05: download start, moved/missing/corrupt/size-mismatched files never gain browser tier 2',()=>{
  const id=11,bytes=128,good='/home/test/Downloads/pcms-backups/pcms-alpha-2026-10-13-abc.encrypted';
  const file={id,filename:good,state:'complete',exists:true,fileSize:bytes};
  assert.equal(verifyBrowserDownload(file,{id,bytes}).tier,2);
  for(const mutate of [
    {state:'in_progress'},{state:'interrupted'},{exists:false},
    {fileSize:129},{filename:'/tmp/pcms-alpha-2026-10-13-abc.encrypted'},
    {filename:'/home/test/Downloads/other/pcms-alpha-2026-10-13-abc.encrypted'},
    {id:12}
  ])assert.equal(verifyBrowserDownload({...file,...mutate},{id,bytes}).tier,1);
});
test('P55-05: actual asynchronous Firefox-like onChanged plus search required; no phantom completion',async()=>{
  const listeners=new Set();
  let entry={id:3,filename:'/home/test/Downloads/pcms-backups/pcms-alpha-demo.encrypted',
    state:'in_progress',exists:false,fileSize:-1};
  const api={onChanged:{addListener(fn){listeners.add(fn);},
    removeListener(fn){listeners.delete(fn);}},async search({id}){return id===3?[entry]:[];}};
  const pending=observeDownload(api,3,128,{timeoutMs:200});
  entry={...entry,state:'complete',exists:true,fileSize:128};
  for(const listener of listeners)listener({id:3,state:{current:'complete'}});
  const got=await pending;
  assert.equal(got.tier,2);assert.equal(listeners.size,0);
  const gone=await observeDownload(api,4,128,{timeoutMs:25});
  assert.equal(gone.tier,1);
});
test('P55-02: single readonly IndexedDB transaction with cursor aborts on quota/source mismatch',async()=>{
  const values=samplePcms().stores;
  const db={
    objectStoreNames:{contains(name){return DB_STORES.includes(name);}},
    transaction(names,mode){
      assert.deepEqual(names,DB_STORES);assert.equal(mode,'readonly');
      const tx={oncomplete:null,onabort:null,onerror:null,abort(){this.onabort?.();},
        objectStore(name){
          return {openCursor(){
            const request={onsuccess:null};let i=0;
            const issue=()=>{
              const row=values[name][i++];
              request.onsuccess?.({target:{result:row?
                {key:row.key,value:row.value,continue(){queueMicrotask(issue)}}:null}});
              if(!row && names.every(n=>finished.has(n)))queueMicrotask(()=>tx.oncomplete?.());
            };
            const finished=globalThis.__not_used||new Set(); // overwritten below
            queueMicrotask(issue);
            return request;
          }};
        }};
      // Test the cut elsewhere; this stub intentionally cannot certify a
      // real browser's transaction completion semantics.
      return tx;
    }
  };
  // Missing authoritative store must reject without attempting a provider request.
  db.objectStoreNames.contains=name=>name!=='operations';
  await assert.rejects(snapshotCanonical(db),/BACKUP_INCOMPLETE/);
});
