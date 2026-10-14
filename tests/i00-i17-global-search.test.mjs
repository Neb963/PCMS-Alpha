import test from 'node:test';
import assert from 'node:assert/strict';
import {RESULT_LIMIT,validSearchQuery,localSearchResults} from '../src/ui/global-search-core.mjs';
import {readFile} from 'node:fs/promises';
test('P56-05 / UX-01 F: canonical search preserves identity and bounds partial results',()=>{
 const generators=Array.from({length:24},(_,i)=>({slug:'fleet-'+String(i).padStart(3,'0'),accountId:'acct_shared'}));
 const accounts=[{accountId:'acct_shared',state:'VERIFIED',identity:{token:'secret-should-not-display'}},
   {accountId:'acct_extra',state:'ARCHIVED'}];
 const output=localSearchResults('ACCt_ShArEd',generators,accounts,{inventoryPartial:true});
 assert.equal(output.items.length,RESULT_LIMIT);
 assert.equal(output.partial,true);
 assert(output.items.some(x=>x.kind==='account'&&x.key==='acct_shared'));
 assert(output.items.every(x=>Object.keys(x).sort().join()==='key,kind,title'));
 assert(!JSON.stringify(output).includes('secret-should-not-display'));
 assert(output.items.every(x=>Object.isFrozen(x)));
 assert.equal(validSearchQuery('  Fixture_A '),'fixture_a');
 assert.equal(validSearchQuery('x'.repeat(200)).length,80);
});
test('P56-05 / UX-01 X: malformed external identity never becomes a navigation target',()=>{
 const item=localSearchResults('abc',[
  {slug:'abc<script>',accountId:'acct_good'}, {slug:'abc-valid',accountId:'acct_good'},
  {slug:'abc-valid',accountId:'acct_good'}],[
  {accountId:'abc<script>',route:'DIRECT'},{accountId:'abc_user',identity:{credential:'secret'}}]);
 assert.deepEqual(item.items,[{kind:'account',key:'abc_user',title:'abc_user'},
   {kind:'generator',key:'abc-valid',title:'abc-valid'}]);
 assert(!JSON.stringify(item).includes('DIRECT'));
 assert(!JSON.stringify(item).includes('secret'));
 assert.deepEqual(localSearchResults('x',[],[]),{items:[],partial:false});
});
test('P56-05 / UX-01 X: search UI only connects existing readonly ports and fences stale responses',async()=>{
 const ui=await readFile('src/ui/global-search-view.mjs','utf8');
 const shell=await readFile('src/ui/shell.mjs','utf8');
 assert.match(ui,/pcms-i04-inventory.*LIST_INVENTORY/);
 assert.match(ui,/pcms-i03-accounts.*LIST_ACCOUNTS/);
 assert.match(ui,/id!==epoch/);
 assert.match(ui,/if\(inflight\)\{needNew=true;return;\}/);
 assert.match(ui,/button\.textContent|name\.textContent=item\.title/);
 assert.doesNotMatch(ui,/innerHTML|fetch\s*\(|sendMessage\s*\(|browser\.tabs|browser\.storage/);
 assert.match(shell,/pcms-global-generator-target/);
 const accountUI=await readFile('src/ui/accounts-view.mjs','utf8');
 assert.match(accountUI,/pcms-global-account-target/);
 assert.match(accountUI,/found\.focus\(/);
});
