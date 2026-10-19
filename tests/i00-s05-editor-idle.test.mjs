import test from 'node:test';
import assert from 'node:assert/strict';
import {createPersonaGuard} from '../src/runtime/persona-guard.mjs';
function guardFixture({editor=true,drift=false,absentInspector=false}={}){
 const personaUid='aaaaaaaa',cookieStoreId='firefox-container-1';
 const state={personaUid,cookieStoreId,routeId:'protected',
  route:{enabled:true},pcmsBindingId:'binding_aaa'};
 const leases=new Set();
 let releases=0,inspected=0;
 const shared={
  resolve:async()=>state,
  acquire:async()=>{
   const leaseId='lease-'+String(inspected+1);leases.add(leaseId);
   return {leaseId,cookieStoreId};
  },
  validate:async(_,id)=>{
   if(!leases.has(id))throw Error('revoked');
   return {cookieStoreId};
  },
  release:async id=>{leases.delete(id);releases++;}
 };
 const donor=createPersonaGuard({
  initialize:async()=>{},
  securityState:{ready:true,privacySafe:true,
    proxyControl:'controlled_by_this_extension'},
  shared,getRouteTest:async()=>({ok:true,data:{ip:'203.0.113.25'}}),
  pinGate:()=>({allow:true}),
  ...(absentInspector?{}:{inspectNoEditorTabs:async()=>{
    inspected++;
    if(drift)state.routeId='block';
    return editor?{ok:false,code:'S05_EDITOR_TAB_PRESENT'}:
      {ok:true,noEditors:true};
  }})
 });
 return {donor,stats:()=>({inspected,releases,active:leases.size})};
}
test('S05 source entry refuses unknown or present human Firefox editor under donor guard',async()=>{
 const present=guardFixture({editor:true});
 const r=await present.donor.inspectSourceEditorIdle('aaaaaaaa','valid-slug');
 assert.equal(r.code,'S05_EDITOR_TAB_PRESENT');
 assert.equal(present.stats().releases,1);
 assert.equal(present.stats().active,0);
 const missing=guardFixture({absentInspector:true});
 assert.equal((await missing.donor.inspectSourceEditorIdle('aaaaaaaa','valid-slug')).code,
   'S05_EDITOR_INSPECTOR_UNAVAILABLE');
 assert.equal(missing.stats().active,0);
});
test('S05 positive local no-tab proof remains bounded and route-fenced',async()=>{
 const good=guardFixture({editor:false});
 const r=await good.donor.inspectSourceEditorIdle('aaaaaaaa','valid-slug');
 assert.equal(r.ok,true,JSON.stringify(r));
 assert.equal(r.clean,true);
 assert.equal(r.source,'GUARDED_NO_LOCAL_EDITOR');
 assert.equal(good.stats().inspected,1);
 assert.equal(good.stats().active,0);
 const changed=guardFixture({editor:false,drift:true});
 assert.equal((await changed.donor.inspectSourceEditorIdle('aaaaaaaa','valid-slug')).ok,false);
 assert.equal(changed.stats().active,0);
 assert.equal(changed.stats().releases,1);
});
