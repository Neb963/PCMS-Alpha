import test from 'node:test';
import assert from 'node:assert/strict';
import {saveRefresherChoice,feedCoverage,placementText,observedAge} from '../src/ui/faithful/refresher-choices.mjs';
const snap=(revision,value=false)=>({ok:true,revision,policy:{refreshEnabled:value}});
const options=(request)=>({request,type:'SET_POLICY',params:{policy:{refreshEnabled:true}},baseline:false,select:x=>x.policy.refreshEnabled,matches:x=>x.policy.refreshEnabled===true});
test('J05 ordinary clock revisions do not block a policy choice; one stale CAS can retry after unchanged choice readback',async()=>{
 let rev=20,writes=0,state=snap(rev);
 const request=async(type,p)=>{if(type==='GET_REFRESHER')return structuredClone(state);writes++;assert.equal(p.expectedRevision,state.revision);if(writes===1){state.revision++;return {ok:false,code:'STALE_REVISION'}}state=snap(++rev+1,true);return {ok:true}};
 assert.equal((await saveRefresherChoice(options(request))).ok,true);assert.equal(writes,2);
});
test('J05 lost mutation acknowledgment is reconciled exactly once; unknown unchanged outcome is never replayed',async()=>{
 for(const committed of [true,false]){
  let state=snap(3),writes=0;const request=async type=>{if(type==='GET_REFRESHER')return structuredClone(state);writes++;if(committed)state=snap(4,true);throw Error('disconnect')};
  const result=await saveRefresherChoice(options(request));assert.equal(result.ok,committed);assert.equal(writes,1);
 }
});
test('J05 a changed operator choice preserves input and submits no mutation; unavailable readback cannot fabricate success',async()=>{
 let writes=0;const opts=options(async type=>{if(type==='GET_REFRESHER')return snap(8);writes++;return {ok:true}});
 opts.baseline='other-operator';assert.equal((await saveRefresherChoice(opts)).code,'CHOICE_CHANGED');assert.equal(writes,0);
 let reads=0;const r=await saveRefresherChoice(options(async type=>{if(type==='GET_REFRESHER'){if(++reads>1)throw Error();return snap(8)}writes++;return {ok:true}}));assert.equal(r.ok,false);assert.equal(r.code,'READBACK_UNAVAILABLE');assert.equal(writes,1);
});
test('J05 feed share preserves actual denominator, zero/unknown/stale distinctions and source-save independence',()=>{
 const now=1000000,recent={complete:true,stale:false,latestOccupancy:{at:now-1,feedSize:100,ownedVisible:25,ownedPublic:1200}};
 assert.deepEqual(feedCoverage(recent,now),{label:'25 / 100 · 25.0%',detail:'Observed just now · 1200 owned public generators',fresh:true});
 assert.equal(feedCoverage({...recent,complete:false},now).fresh,false);
 assert.match(feedCoverage({...recent,latestOccupancy:{...recent.latestOccupancy,feedSize:0,ownedVisible:0}},now).label,/empty page/);
 assert.equal(feedCoverage({...recent,latestOccupancy:{...recent.latestOccupancy,ownedVisible:101}},now).label,'Not measured');
 assert.equal(placementText({refresh:{sourceSavedAt:now}},now),'Not observed');
 assert.match(placementText({presence:{source:'GUARDED_RECENT_LIST',present:true,position:12,observedAt:now-1,stale:true}},now),/^Historical #12/);
 assert.equal(observedAge(now+1,now),'not observed');
});
