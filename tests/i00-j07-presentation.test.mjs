import test from 'node:test';
import assert from 'node:assert/strict';
import {createPresentationPreferences,normalizePresentation,normalizeFilters,PRESENTATION_KEY,COLUMN_IDS} from '../src/runtime/presentation-preferences.mjs';
import {collectPortableLocal} from '../src/runtime/portable-local.mjs';
test('J07 presentation projection retains only bounded display state and never source/permission/credential authority',()=>{
 const raw={schema:1,theme:'dark',density:'comfortable',token:'excluded',grants:{publication:true},generator:{filters:{query:'q'.repeat(200),source:'GIT',account:'account-one',publication:true},columns:[{id:'account',visible:false,width:180},{id:'generator',visible:false,width:-8},{id:'account',width:5000},{id:'token',width:120}]},views:Array.from({length:80},(_,i)=>({id:i.toString(16).padStart(32,'0'),name:'View '+i,filters:null,columns:[]})),panelWidths:{generators:700,credentials:'no'}};
 const normalized=normalizePresentation(raw);assert.equal(normalized.views.length,80);assert.equal(normalized.generator.filters.query.length,80);
 assert.deepEqual(normalized.generator.columns.map(c=>c.id),['account','generator',...COLUMN_IDS.filter(id=>!['account','generator'].includes(id))]);
 assert.equal(normalized.generator.columns.find(c=>c.id==='generator').visible,true);assert.equal(normalized.generator.columns.find(c=>c.id==='account').visible,false);
 assert.equal(normalized.generator.columns.find(c=>c.id==='generator').width,240);assert.deepEqual(normalized.panelWidths,{generators:700});
 assert.equal(JSON.stringify(normalized).includes('publication'),false);assert.equal(JSON.stringify(normalized).includes('excluded'),false);
 assert.deepEqual(collectPortableLocal({[PRESENTATION_KEY]:raw,pcmsGitToken:'secret'}),{[PRESENTATION_KEY]:normalized});assert.equal(normalizeFilters(null).filter,'ALL');
});
test('J07 presentation changes serialize, survive lost write replies by readback and preserve the last observed state on quota failure',async()=>{
 let saved,fail=false,lost=false,writes=0;
 const storage={get:async()=>({[PRESENTATION_KEY]:structuredClone(saved)}),set:async value=>{writes++;if(fail)throw Error('Quota');saved=structuredClone(value[PRESENTATION_KEY]);if(lost)throw Error('ACK_LOST')}};
 const prefs=createPresentationPreferences(storage);await prefs.load();lost=true;
 await prefs.update(value=>({...value,theme:'dark'}));assert.equal(prefs.get().theme,'dark');
 lost=false;await Promise.all([prefs.update(value=>({...value,density:'comfortable'})),prefs.update(value=>({...value,panelWidths:{...value.panelWidths,generators:650}}))]);
 assert.equal(saved.theme,'dark');assert.equal(saved.density,'comfortable');assert.equal(saved.panelWidths.generators,650);
 fail=true;await assert.rejects(prefs.update(value=>({...value,theme:'light'})),/PRESENTATION_SAVE_UNCONFIRMED/);assert.equal(prefs.get().theme,'dark');
 fail=false;await prefs.update(value=>({...value,theme:'light'}));assert.equal(prefs.get().theme,'light');const before=writes;await prefs.update(value=>value);assert.equal(writes,before,'read refresh cannot churn identical display settings');
 const cold=createPresentationPreferences(storage);await cold.load();assert.deepEqual(cold.get(),prefs.get());
});
