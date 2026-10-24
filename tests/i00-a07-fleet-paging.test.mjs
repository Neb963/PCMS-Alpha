import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createInventoryStore} from '../src/runtime/inventory.mjs';
import {validateInventoryMessage} from '../src/runtime/inventory-boundary.mjs';
import {readFile} from 'node:fs/promises';

const api={runtime:{id:'persona-route-manager@local',
  getURL:p=>'moz-extension://fixture/'+p}};
const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')+'#generators'};

test('A07 RED: account sort must be applied before server pagination at realistic fleet size',async()=>{
  const db=fakeDatabase(),tx=db.transaction(['meta'],'readwrite');
  for(let i=0;i<1200;i++){
    const slug='generator-'+String(i).padStart(4,'0');
    const accountId='account-'+String(54-(i%55)).padStart(2,'0');
    tx.objectStore('meta').put({key:'inventory:'+slug,generator:{
      slug,accountId,ownerState:i%3?'OWNER_UNVERIFIED':'OBSERVED_OWNER',
      visibility:'UNLISTED',source:'SOURCE_PENDING',revision:1}});
  }
  await new Promise((resolve,reject)=>{tx.oncomplete=resolve;tx.onabort=reject;});
  const list=createInventoryStore(db);
  const p={sort:'account',offset:0,limit:24};
  assert.equal(validateInventoryMessage(api,sender,{type:'LIST_INVENTORY',params:p}).ok,true,
    'typed background inventory must support real server sort');
  const first=await list.list(p),second=await list.list({...p,offset:24});
  assert.equal(first.ok,true);assert.equal(second.ok,true);
  assert.equal(first.total,1200);assert.equal(second.total,1200);
  assert.equal(first.items.length,24);assert.equal(second.items.length,24);
  const observed=[...first.items,...second.items].map(x=>[x.accountId,x.slug].join(':'));
  assert.deepEqual(observed,[...observed].sort(),
    'server sort is globally ordered across adjacent pages, not page-local');
  assert.equal(new Set(observed).size,48);
  const filtered=await list.list({sort:'account',ownerState:'OBSERVED_OWNER',limit:24});
  assert.equal(filtered.total,400);
  assert.equal(filtered.items.length,24);
  assert.equal(validateInventoryMessage(api,sender,{type:'LIST_INVENTORY',params:{sort:'surprise'}}).ok,false);
});

test('A07 primary sort changes trigger fresh server pagination rather than rearranging only visible rows',async()=>{
 const bridge=await readFile(new URL('../src/ui/faithful/bridge.mjs',import.meta.url),'utf8');
 assert.match(bridge,/sort:state\.gen\.sort/);
 assert.match(bridge,/target\.id==='generator-sort'[^\n]*loadGenerators\(/);
});
