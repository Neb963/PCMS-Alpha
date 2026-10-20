import test from 'node:test';
import assert from 'node:assert/strict';
import {diffLines,unifiedHunks,splitLines,isText,imageType} from '../src/ui/source-diff.mjs';
const apply=(a,b,script)=>script.filter(e=>e.op!=='-').map(e=>e.op==='='?a[e.a]:b[e.b]);
test('publication review: line diff reconstructs F and shows only changed hunks',()=>{
  const a=splitLines('one\ntwo\nthree\nfour\nfive\nsix\nseven\neight\nnine\nten\n');
  const b=splitLines('one\ntwo\nTHREE\nfour\nfive\nsix\nseven\neight\nnine\nten\neleven\n');
  const s=diffLines(a,b);
  assert.deepEqual(apply(a,b,s),b);
  assert.deepEqual(s.filter(e=>e.op==='=').map(e=>a[e.a]),a.filter(x=>x!=='three'));
  const {hunks}=unifiedHunks(a,b,s,{context:1});
  assert.equal(hunks.length,2);
  assert.deepEqual(hunks[0].lines,[' two','-three','+THREE',' four']);
  assert.equal(hunks[0].aStart,2);assert.equal(hunks[1].lines.at(-1),'+eleven');
});
test('publication review: random edits always reconstruct; huge distance falls back',()=>{
  let seed=7;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
  for(let t=0;t<50;t++){
    const a=Array.from({length:Math.floor(rnd()*60)},()=>'l'+Math.floor(rnd()*8));
    const b=a.filter(()=>rnd()>.2).flatMap(x=>rnd()>.8?[x,'n'+Math.floor(rnd()*5)]:[x]);
    assert.deepEqual(apply(a,b,diffLines(a,b)),b);
  }
  const big=Array.from({length:3000},(_,i)=>'a'+i),other=Array.from({length:3000},(_,i)=>'b'+i);
  assert.equal(diffLines(big,other,{maxD:100}),null);
});
test('publication review: text/binary/image classification',()=>{
  assert.equal(isText(new TextEncoder().encode('ok ✓')),true);
  assert.equal(isText(new Uint8Array([0x89,0x50,0x4e,0x47,0,1])),false);
  assert.equal(imageType('src/a.PNG'),'image/png');assert.equal(imageType('src/x.js'),null);
});
