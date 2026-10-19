import test from 'node:test';
import assert from 'node:assert/strict';
import {choosePrivateStageAdapter} from '../src/runtime/ready-native-source.mjs';
const blob=(path,value)=>({path,base64:Buffer.from(value).toString('base64')});
test('S05 new empty source retains I09 strict private-empty writer',()=>{
 const r=choosePrivateStageAdapter([blob('main.pjs',''),blob('index.html','')]);
 assert.deepEqual(r,{ok:true,adapter:'PRIVATE_EMPTY_I09'});
});
test('S05 saved nonempty PJS, HTML or src/ assets must use I13 full replacement writer',()=>{
 for(const files of [
  [blob('main.pjs','P'),blob('index.html','')],
  [blob('main.pjs',''),blob('index.html','HTML')],
  [blob('main.pjs',''),blob('index.html',''),blob('src/data.json','{}')],
  [blob('main.pjs',''),blob('index.html',''),blob('src/binary.bin',Buffer.from([0,255]))]
 ]){
  const r=choosePrivateStageAdapter(files);
  assert.deepEqual(r,{ok:true,adapter:'PRIVATE_NONEMPTY_I13'});
 }
});
test('S05 bad or uncertain P manifest cannot be treated as private-empty',()=>{
 for(const rows of [
  [],null,[blob('main.pjs','')],
  [blob('main.pjs',''),blob('main.pjs','')],
  [blob('index.html',''),blob('src/../unsafe','')],
  [blob('main.pjs',''),blob('index.html',''),blob('SRC/unexpected','')],
  [{path:'main.pjs',base64:'!'},{path:'index.html',base64:''}]
 ]){
  const r=choosePrivateStageAdapter(rows);
  assert.equal(r.code,'S05_PREVIOUS_MANIFEST_INVALID');
 }
});
