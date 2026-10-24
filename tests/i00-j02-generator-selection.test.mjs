import test from 'node:test';
import assert from 'node:assert/strict';
import {createGeneratorSelection} from '../src/ui/faithful/generator-selection.mjs';
const key='pcmsUiGeneratorSelectionV1';
const row=(n,accountId='account_selection_01')=>({slug:'selected-'+n,accountId,revision:3});
test('J02 selection survives pages/reopening and never silently follows an account change',async()=>{
 let saved={};const writes=[];
 const storage={get:async()=>structuredClone(saved),set:async value=>{writes.push(structuredClone(value));saved=structuredClone(value)}};
 const first=createGeneratorSelection(storage);await first.ready;
 await first.setMany(Array.from({length:1200},(_,i)=>row(i)),true);
 assert.equal(first.status().count,1200);assert.equal(writes.length,1);
 const second=createGeneratorSelection(storage);await second.ready;
 assert.equal(second.status().count,1200);
 assert.equal(second.includes({...row(1),accountId:'account_different_owner'}),false);
 assert.equal(second.snapshot().find(x=>x.slug==='selected-1').accountId,'account_selection_01');
 await second.set({...row(1),accountId:'account_different_owner'},true);
 assert.equal(second.status().count,1200);
 assert.equal(second.includes({...row(1),accountId:'account_different_owner'}),true);
 await second.remove('selected-1');assert.equal(second.status().count,1199);
 await second.clear();assert.deepEqual(saved[key].items,[]);
});
test('J02 a click while saved selection loads preserves previous targets and write failures keep current scope',async()=>{
 let release;const pending=new Promise(r=>release=r),writes=[];
 const selection=createGeneratorSelection({get:()=>pending,set:async value=>{writes.push(value);throw Error('QUOTA')}});
 const clicked=selection.set(row('new'),true);
 release({[key]:{schema:1,items:[row('old')]}});
 await clicked;
 assert.deepEqual(selection.snapshot().map(x=>x.slug).sort(),['selected-new','selected-old']);
 assert.match(selection.status().error,/could not be saved/);assert.equal(writes.length,1);
});
test('J02 malformed preference entries do not become selected targets',async()=>{
 const selection=createGeneratorSelection({get:async()=>({[key]:{schema:1,items:[
  row('safe'),{slug:'../../other',accountId:'account_other',revision:1},
  {slug:'unsafe',accountId:'x',revision:1},{slug:'wrong',accountId:'account_other',revision:-1}
 ]}}),set:async()=>{}});
 await selection.ready;assert.deepEqual(selection.snapshot(),[row('safe')]);
});
