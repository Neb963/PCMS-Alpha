import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceApprovedPublication} from '../src/ui/faithful/publication-flow.mjs';
const approval={ok:true,slug:'my-generator',state:'APPROVED',revision:7};
const run=(responses={})=>{
 const calls=[];
 const invoke=async(type,params)=>{
   calls.push({type,params});
   const value=responses[type];
   if(value instanceof Error)throw value;
   return typeof value==='function'?value(params):value;
 };
 return {calls,invoke};
};
test('A05: approval dispatches exactly once and only independent source/listing receipt succeeds',async()=>{
 const c=run({DISPATCH:{ok:true,state:'PUBLICATION_UNCERTAIN'},
   GET:{ok:true,slug:'my-generator',revision:9,state:'PUBLICATION_UNCERTAIN'},
   RECONCILE:{ok:true,slug:'my-generator',revision:10,state:'CONFIRMED_PUBLIC'}});
 const out=await advanceApprovedPublication({slug:approval.slug,approval,invoke:c.invoke});
 assert.equal(out.ok,true);
 assert.deepEqual(c.calls.map(x=>x.type),['DISPATCH','GET','RECONCILE']);
 assert.equal(c.calls[0].params.expectedRevision,7);
 assert.equal(c.calls[2].params.expectedRevision,9);
});
test('A05: lost dispatch reply is never a license to retry publication',async()=>{
 const c=run({DISPATCH:new Error('lost-ack'),
   GET:{ok:true,slug:'my-generator',revision:8,state:'DISPATCH_POSSIBLE'},
   RECONCILE:{ok:true,slug:'my-generator',revision:9,state:'PUBLICATION_UNCERTAIN'}});
 const out=await advanceApprovedPublication({slug:approval.slug,approval,invoke:c.invoke});
 assert.equal(out.ok,false);
 assert.equal(out.state,'PUBLICATION_UNCERTAIN');
 assert.deepEqual(c.calls.map(x=>x.type),['DISPATCH','GET','RECONCILE']);
});
test('A05: forged, stale or missing approval cannot dispatch',async()=>{
 const c=run();
 for(const bad of [undefined,{...approval,slug:'another'},
   {...approval,revision:0},{...approval,state:'DISPATCH_POSSIBLE'},
   {...approval,ok:false}]){
   assert.equal((await advanceApprovedPublication({slug:approval.slug,approval:bad,invoke:c.invoke})).ok,false);
 }
 assert.equal(c.calls.length,0);
});
test('A05: held authorization never causes publication effect or automatic retry',async()=>{
 const c=run({DISPATCH:{ok:false,code:'PUBLICATION_ACTIVATION_HELD'}});
 const out=await advanceApprovedPublication({slug:approval.slug,approval,invoke:c.invoke});
 assert.equal(out.code,'PUBLICATION_ACTIVATION_HELD');
 assert.deepEqual(c.calls.map(x=>x.type),['DISPATCH']);
});
test('A05: no independent confirmation never becomes a successful publication',async()=>{
 for(const response of [undefined,{ok:false,code:'READBACK_DENIED'},
   {ok:true,slug:approval.slug,revision:8,state:'PUBLICATION_UNCERTAIN'}]){
   const c=run({DISPATCH:{ok:true},GET:response,
     RECONCILE:{ok:false,code:'SOURCE_MISMATCH',state:'PUBLICATION_UNCERTAIN'}});
   const out=await advanceApprovedPublication({slug:approval.slug,approval,invoke:c.invoke});
   assert.equal(out.ok,false);
   assert.ok(c.calls.filter(x=>x.type==='DISPATCH').length===1);
 }
});
test('A05: no blind replay even if server persisted a still-approved record',async()=>{
 const c=run({DISPATCH:new Error('connection loss'),
   GET:{ok:true,slug:approval.slug,revision:7,state:'APPROVED'}});
 const out=await advanceApprovedPublication({slug:approval.slug,approval,invoke:c.invoke});
 assert.equal(out.ok,false);
 assert.deepEqual(c.calls.map(x=>x.type),['DISPATCH','GET']);
});
