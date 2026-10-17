import test from 'node:test';
import assert from 'node:assert/strict';
import {scanV2AuthenticatedFrames} from '../src/ui/restore-v2-frame-scanner.mjs';
import {frameHeader,V2_FRAME,V2_LIMITS} from '../src/ui/backup-v2-codec.mjs';
const concat=(...parts)=>{
  const total=parts.reduce((n,v)=>n+v.length,0);
  const raw=new Uint8Array(total);let offset=0;
  for(const part of parts){raw.set(part,offset);offset+=part.length;}
  return raw;
};
async function* fragment(raw,n){
  for(let i=0;i<raw.length;i+=n)yield raw.subarray(i,i+n);
}
const blob=concat(new Uint8Array(32).fill(2),new Uint8Array([0,255,1,0]));
const canon=new TextEncoder().encode('{"key":"a","refs":[],"store":"meta","value":{}}');
const donor=new TextEncoder().encode('{"encrypted":"opaque"}');
const end=new TextEncoder().encode('{"schema":2}');
const full=concat(
 frameHeader(V2_FRAME.BLOB,blob.length),blob,
 frameHeader(V2_FRAME.CANONICAL,canon.length),canon,
 frameHeader(V2_FRAME.DONOR,donor.length),donor,
 frameHeader(V2_FRAME.END,end.length),end
);
test('S02 incremental parser accepts split frames, bounded donor chunks, exact end',async()=>{
  for(const width of [1,2,8,9,17,41,4096]){
    const frames=[];
    for await(const piece of scanV2AuthenticatedFrames(fragment(full,width)))
      frames.push(piece);
    assert.deepEqual(frames.map(x=>x.kind).filter(x=>x!=='DONOR_FRAGMENT'),
      ['BLOB','CANONICAL','DONOR_END','END']);
    assert.deepEqual(frames.find(x=>x.kind==='BLOB').bytes,blob);
    assert.deepEqual(frames.find(x=>x.kind==='CANONICAL').bytes,canon);
    const reassembled=concat(...frames.filter(x=>x.kind==='DONOR_FRAGMENT').map(x=>x.bytes));
    assert.deepEqual(reassembled,donor);
    assert.deepEqual(frames.at(-1).bytes,end);
  }
});
test('S02 scanner rejects unbounded CANONICAL, END and DONOR lengths before allocating',async()=>{
  const oversized=[
    [V2_FRAME.CANONICAL,BigInt(V2_LIMITS.canonical)+1n],
    [V2_FRAME.END,BigInt(V2_LIMITS.end)+1n],
    [V2_FRAME.DONOR,BigInt(V2_LIMITS.donor)+1n],
    [V2_FRAME.BLOB,(1n<<64n)-1n]
  ];
  for(const [tag,len] of oversized){
    const bad=new Uint8Array(9);
    bad[0]=tag;new DataView(bad.buffer).setBigUint64(1,len,false);
    await assert.rejects(async()=>{for await(const _ of scanV2AuthenticatedFrames(fragment(bad,1))){}},
      /RESTORE_V2_FRAME_BOUND_INVALID/);
  }
});
test('S02 scanner rejects wrong order, missing END, duplicate DONOR and trailing bytes',async()=>{
  const f=(t,v)=>concat(frameHeader(t,v.length),v);
  for(const invalid of [
    f(V2_FRAME.END,end),
    concat(f(V2_FRAME.DONOR,donor),f(V2_FRAME.DONOR,donor),f(V2_FRAME.END,end)),
    concat(f(V2_FRAME.DONOR,donor),f(V2_FRAME.END,end),new Uint8Array([0])),
    concat(f(V2_FRAME.DONOR,donor),frameHeader(V2_FRAME.END,end.length),end.subarray(0,2)),
    concat(f(V2_FRAME.DONOR,donor),f(V2_FRAME.END,end),f(V2_FRAME.END,end))
  ]){
    await assert.rejects(async()=>{for await(const _ of scanV2AuthenticatedFrames(fragment(invalid,7))){}},
      /RESTORE_V2_/);
  }
});
