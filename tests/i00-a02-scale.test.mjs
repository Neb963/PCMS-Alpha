// A02 executable scale probes. These are fixture measurements, not operator
// machine capacity claims. The browser/profile H tier is separate.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {DB_STORES,MAX_ARCHIVE_BYTES} from '../src/ui/backup-core.mjs';
import {encodePortableArchive,readPortableArchive} from
  '../src/runtime/portable-archive.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const empty=()=>({schema:1,stores:Object.fromEntries(DB_STORES.map(s=>[s,[]]))});
const donor=()=>({version:1,settings:null,routes:[],personas:[],
  scripts:[],workflows:[],cookies:{},gmValues:{},automationHistory:[]});
test('A02 portable archive exceeds legacy 64 MiB without truncation or host',async()=>{
  const pcms=empty();
  const source='X'.repeat(69*1024*1024);
  pcms.stores.entities.push({key:'large-source',value:{source}});
  const before=process.memoryUsage();
  const archive=await encodePortableArchive({pcms,donor:donor()});
  assert.ok(archive.bytes>MAX_ARCHIVE_BYTES,
    {archiveBytes:archive.bytes,legacyMax:MAX_ARCHIVE_BYTES});
  let sourceSeen=false;
  const decoded=await readPortableArchive(archive.blob,{collect:false,
    onRecord:async frame=>{
      if(frame.kind==='pcms'){
        assert.equal(frame.store,'entities');
        assert.equal(frame.value.value.source.length,source.length);
        assert.equal(frame.value.value.source,source);
        sourceSeen=true;
      }
    },auditStaged:async()=>archive.sourceAudit});
  assert.equal(decoded.integrity,'FRAME_AND_SOURCE_VERIFIED');
  assert.equal(sourceSeen,true);
  assert.equal(decoded.rows,1);
  const after=process.memoryUsage();
  const rssDelta=after.rss-before.rss;
  console.log('A02_64M_RESOURCE',JSON.stringify({bytes:archive.bytes,
    fragments:archive.frames,rssDeltaBytes:rssDelta}));
  assert.ok(rssDelta<2*1024*1024*1024,'fixture exceeded bounded test-memory ceiling');
},{timeout:180000});
test('A02 100001 canonical rows survive portable framing and recovery stream',async()=>{
  const pcms=empty();
  for(let i=0;i<100001;i++)pcms.stores.entities.push({
    key:'generator_'+String(i).padStart(8,'0'),
    value:{id:'generator_'+i,state:'HELD',version:i}});
  const archive=await encodePortableArchive({pcms,donor:donor()});
  let seen=0,first=null,last=null;
  const opened=await readPortableArchive(archive.blob,{collect:false,
    onRecord:async frame=>{
      if(frame.kind!=='pcms')return;
      if(first===null)first=frame.value.key;
      last=frame.value.key;seen++;
    },auditStaged:async()=>archive.sourceAudit});
  assert.equal(opened.rows,100001);assert.equal(seen,100001);
  assert.equal(first,'generator_00000000');
  assert.equal(last,'generator_00100000');
  assert.equal(opened.integrity,'FRAME_AND_SOURCE_VERIFIED');
  console.log('A02_100K_RESOURCE',JSON.stringify({rows:opened.rows,
    frames:opened.frames,bytes:archive.bytes}));
},{timeout:180000});
