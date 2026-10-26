import test from 'node:test';
import assert from 'node:assert/strict';
import {createFolderIdentityBoundary,validateIdentityMessage} from '../src/runtime/folder-identity-boundary.mjs';
import {createCatalogWatcher} from '../src/runtime/catalog-watch.mjs';
const H='a'.repeat(40),TREE='b'.repeat(40),MARKER='c'.repeat(40);
function fixture(count=1001){
 const slugs=Array.from({length:count},(_,i)=>'missing-'+String(i).padStart(4,'0'));
 const generators=slugs.map((_,i)=>({slug:'new-'+String(i).padStart(4,'0'),markerOid:MARKER,folderTreeOid:TREE}));
 const reviews=generators.map(g=>({repositoryId:'42',oldSlug:slugs[0],newSlug:g.slug,
  newTreeOid:TREE,markerOid:MARKER,oldTreeOid:'d'.repeat(40),evidenceHead:H,state:'REVIEW_REQUIRED',revision:1,reason:'IDENTITY_AMBIGUOUS'}));
 const data={pcmsS03Git:{repository:'fixture/source',repositoryId:'42'},
  pcmsS03CatalogLastComplete:{repository:'fixture/source',repositoryId:'42',head:H,rootTreeOid:TREE,complete:true,generators,observedAt:1000},
  pcmsR4FolderIdentityReviews:reviews,pcmsR4MissingGitFolders:{repositoryId:'42',slugs,
   observations:{[slugs[0]]:{firstAbsentHead:H,lastAbsentHead:H,lastPresentHead:'d'.repeat(40),observedAt:1000}}},
  pcmsS03CatalogReceipt:{code:'CATALOG_OBSERVED_READ_ONLY',head:H,repositoryId:'42'}};
 const effects=[],refreshes=[];
 const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},storage:{local:{
  get:async keys=>Object.fromEntries((Array.isArray(keys)?keys:[keys]).map(k=>[k,structuredClone(data[k])])),
  set:async()=>{throw Error('READ_ONLY_BOUNDARY_UNEXPECTED_WRITE');}}}};
 const sender={id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')};
 const boundary=createFolderIdentityBoundary(api,{renameService:{run:async()=>{effects.push('RENAME');throw Error('UNEXPECTED_RENAME');}},
  refreshMain:async options=>{refreshes.push(options);
   if(data.failRefresh)return {ok:false,code:'GIT_NETWORK_UNAVAILABLE'};
   const slug=slugs.at(-1);data.pcmsS03CatalogLastComplete={...data.pcmsS03CatalogLastComplete,
    head:'e'.repeat(40),observedAt:2000,generators:[...generators,{slug,markerOid:MARKER,folderTreeOid:TREE}]};
   data.pcmsR4MissingGitFolders={...data.pcmsR4MissingGitFolders,slugs:slugs.slice(0,-1)};
   return {ok:true,code:'CATALOG_OBSERVED_READ_ONLY'};
  }});
 return {data,effects,refreshes,slugs,generators,api,sender,run:(type,params)=>boundary.dispatch({type,params},sender)};
}
for(const count of [31,1001])test('F3 all '+count+' missing sources and identity reviews remain reachable with exact bounded pages/search',async()=>{
 const f=fixture(count);
 for(const kind of ['MISSING','REVIEW']){
  let after='',items=[];
  do{const p=await f.run('LIST_PAGE',{kind,after,limit:20,query:''});
   assert.equal(p.ok,true);assert.equal(p.total,count);assert.equal(p.unfilteredTotal,count);
   assert.ok(p.items.length<=20);items.push(...p.items);after=p.more?p.next:null;
  }while(after);
  const key=kind==='MISSING'?'slug':'newSlug';
  assert.equal(items.length,count);assert.equal(new Set(items.map(r=>r[key])).size,count);
  const last=kind==='MISSING'?f.slugs.at(-1):f.generators.at(-1).slug;
  const searched=await f.run('LIST_PAGE',{kind,limit:20,query:last});
  assert.equal(searched.total,1);assert.equal(searched.unfilteredTotal,count);
  assert.equal(searched.items[0][key],last);assert.equal(searched.more,false);
 }
 assert.equal(f.effects.length,0);assert.equal(f.refreshes.length,0);
});
test('F3 missing-source context preserves actual pinned history, bounds related identities and distinguishes Git outage',async()=>{
 const f=fixture(),out=await f.run('GET_CONTEXT',{slug:f.slugs[0]});
 assert.equal(out.ok,true);assert.equal(out.presence,'MISSING_IN_COMPLETE_MAIN');
 assert.equal(out.head,H);assert.equal(out.observation.lastPresentHead,'d'.repeat(40));
 assert.equal(out.review.length,20);assert.equal(out.reviewTotal,1001);assert.equal(out.reviewMore,true);
 f.data.pcmsS03CatalogReceipt={code:'GIT_NETWORK_UNAVAILABLE'};
 const failed=await f.run('GET_CONTEXT',{slug:f.slugs[0]});
 assert.equal(failed.presence,'MISSING_IN_COMPLETE_MAIN');assert.equal(failed.head,H);
 assert.equal(failed.currentConnectionCode,'GIT_NETWORK_UNAVAILABLE');
 const unknown=await f.run('GET_CONTEXT',{slug:'unrecorded-generator'});
 assert.equal(unknown.presence,'NOT_RECORDED');assert.equal(unknown.observation,null);
 assert.equal(f.effects.length,0);
});
test('F3 explicit refresh asks the existing observer for read-only mode; failed read never changes prior absence into deletion/recovery',async()=>{
 const f=fixture(),last=f.slugs.at(-1);
 f.data.failRefresh=true;
 const failed=await f.run('REFRESH_OBSERVATION',{slug:last});
 assert.equal(failed.code,'GIT_NETWORK_UNAVAILABLE');
 assert.equal((await f.run('GET_CONTEXT',{slug:last})).presence,'MISSING_IN_COMPLETE_MAIN');
 delete f.data.failRefresh;
 const refreshed=await f.run('REFRESH_OBSERVATION',{slug:last});
 assert.equal(refreshed.presence,'PRESENT_IN_COMPLETE_MAIN');assert.equal(refreshed.head,'e'.repeat(40));
 assert.deepEqual(f.refreshes,[{observeOnly:true},{observeOnly:true}]);
 assert.equal(f.effects.length,0);
 for(const params of [{kind:'MISSING',limit:101},{kind:'MISSING',after:123},
  {kind:'MISSING',after:'https://example.test'},{kind:'MISSING',query:'x'.repeat(101)},{kind:'MISSING',execute:'DELETE'}])
  assert.equal((await f.run('LIST_PAGE',params)).ok,false);
 assert.equal((await f.run('GET_CONTEXT',{slug:123})).ok,false);
 assert.equal(validateIdentityMessage(f.api,{id:'other',url:f.sender.url},{type:'LIST_PAGE',params:{kind:'MISSING'}}).code,'UNTRUSTED_SENDER');
});
function watcherFixture({badReceipt=false}={}){
 const data={pcmsS03Git:{repository:'fixture/source',repositoryId:'42'}},progress=[],incidents=[];
 const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},storage:{local:{
  get:async key=>({[key]:structuredClone(data[key])}),
  set:async rows=>{for(const [key,value] of Object.entries(rows)){
    assert.equal(JSON.stringify(value).includes('synthetic_browser_credential'),false);
    if(badReceipt&&key==='pcmsS03CatalogReceipt'&&value.code==='CATALOG_OBSERVED_READ_ONLY')continue;
    data[key]=structuredClone(value);
   }}}},alarms:{create:async()=>{}}};
 const step=name=>async()=>{progress.push(name);return {ok:true,progressed:1};};
 const watcher=createCatalogWatcher(api,{clock:()=>1000,native:async()=>({ok:true,credential:'synthetic_browser_credential'}),
  scan:async()=>({ok:true,complete:true,repositoryId:'42',head:H,rootTreeOid:TREE,generators:[],recognizedCount:0}),
  incidents:async(kind,details)=>incidents.push({kind,details}),ingestComplete:step('creationIntake'),ingestReady:step('readyIntake'),
  progressReady:step('ready'),progressChanges:step('changes'),progressWriteback:step('writeback'),
  progressCleanBulk:step('clean'),progressPublication:step('publication')});
 return {watcher,progress,incidents,data};
}
test('F3 existing catalog observer read-only refresh runs no progress/intake effects; normal due work remains enabled',async()=>{
 const f=watcherFixture(),read=await f.watcher.tick({observeOnly:true});
 assert.equal(read.ok,true);assert.deepEqual(f.progress,[]);
 assert.equal(f.data.pcmsS03CatalogLastComplete.head,H);
 const normal=await f.watcher.tick();assert.equal(normal.ok,true);
 assert.deepEqual([...f.progress].sort(),['creationIntake','readyIntake','ready','changes','writeback','clean','publication'].sort());
});
test('F3 a complete snapshot without its independently read-back receipt cannot resolve or progress',async()=>{
 const f=watcherFixture({badReceipt:true}),out=await f.watcher.tick();
 assert.equal(out.ok,false);assert.equal(out.code,'GIT_LOCAL_STORAGE_UNAVAILABLE');
 assert.deepEqual(f.progress,[]);assert.equal(f.incidents.some(x=>x.kind==='RESOLVE'),false);
});

test('F3 full valid 100-character source names can be searched without silent truncation',async()=>{
 const f=fixture(31),slug='x'.repeat(100);f.data.pcmsR4MissingGitFolders.slugs.push(slug);
 const out=await f.run('LIST_PAGE',{kind:'MISSING',query:slug,limit:20});
 assert.equal(out.ok,true);assert.equal(out.total,1);assert.equal(out.unfilteredTotal,32);
 assert.equal(out.items[0].slug,slug);
});
