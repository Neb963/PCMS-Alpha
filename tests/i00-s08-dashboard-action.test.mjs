import test from 'node:test';
import assert from 'node:assert/strict';
import {createDashboardAction} from '../src/runtime/dashboard-action.mjs';
const target='moz-extension://pcms/pcms/index.html';
const fake=(tabs=[])=>{
  const calls=[]; let listener;
  const api={runtime:{getURL:p=> 'moz-extension://pcms/'+p},
    action:{onClicked:{addListener:fn=>{listener=fn}}},
    tabs:{query:async()=>tabs,update:async(...a)=>{calls.push(['update',...a])},
      create:async p=>{calls.push(['create',p]);return {id:88}}},
    windows:{update:async(...a)=>{calls.push(['window',...a])}}};
  return {api,calls,click:()=>listener()};
};
test('toolbar creates one full dashboard instead of opening compact popup',async()=>{
  const {api,calls}=fake([]);
  const action=createDashboardAction(api);await action.open();
  assert.deepEqual(calls,[['create',{url:target,active:true}]]);
});
test('toolbar focuses existing dashboard with matching exact extension URL',async()=>{
  const {api,calls}=fake([{id:17,windowId:4,url:target+'#refresher'},
    {id:18,windowId:5,url:'https://perchance.org'}]);
  await createDashboardAction(api).open();
  assert.deepEqual(calls,[['update',17,{active:true}],['window',4,{focused:true}]]);
});
test('concurrent icon clicks share one navigation',async()=>{
  const {api,calls}=fake();const action=createDashboardAction(api);
  await Promise.all([action.open(),action.open()]);
  assert.equal(calls.filter(x=>x[0]==='create').length,1);
});
