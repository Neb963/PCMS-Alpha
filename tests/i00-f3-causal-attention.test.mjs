import test from 'node:test';
import assert from 'node:assert/strict';
import {fakeDatabase} from './fake-idb.mjs';
import {createCanonicalStore} from '../src/runtime/journal.mjs';
import {createNoticeDispatcher} from '../src/runtime/notices.mjs';
import {createCommandBoundary,validateCommand} from '../src/runtime/command-boundary.mjs';
import {incidentGroupKey,groupNotices} from '../src/ui/attention-model.mjs';
const T=2000000;
function fixture(){
 const db=fakeDatabase(),store=createCanonicalStore(db),desktop=[];
 const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},
  storage:{local:{get:async()=>({})}},notifications:{create:async n=>desktop.push(n)}};
 return {db,store,api,desktop,d:createNoticeDispatcher(api,store),
  sender:{id:api.runtime.id,url:api.runtime.getURL('pcms/index.html')}};
}
const note=(i,cause)=>({scopeId:'account_f3_'+String(i).padStart(4,'0'),code:'ROUTE_UNAVAILABLE',
 severity:'ACTION_REQUIRED',revision:1,at:T,cause,
 target:{kind:'ACCOUNT',id:'account_f3_'+String(i).padStart(4,'0')}});
test('F3 explicit helper failure groups 50 accounts; 50 independent holds and notification scopes remain distinct',async()=>{
 const f=fixture();
 for(let i=0;i<50;i++)await f.d.emit(note(i,'personamonkey_connection'));
 for(let i=50;i<100;i++)await f.d.emit(note(i,'ACCOUNT_ROUTE_UNAVAILABLE'));
 assert.equal(f.desktop.length,51);
 const all=await f.store.listNotices(100),groups=groupNotices(all.notices);
 assert.equal(groups.length,51);
 const shared=groups.find(g=>g.key==='shared:personamonkey_connection');
 assert.equal(shared.scopes.length,50);assert.equal(shared.count,50);
 let after='',keys=[];
 do{
  const page=await f.store.pageNoticeGroups({after,limit:20});
  assert.equal(page.total,51);assert.equal(page.totalNotices,100);
  assert.ok(page.items.length<=20);keys.push(...page.items.map(g=>g.key));
  after=page.more?page.next:null;
 }while(after);
 assert.equal(keys.length,51);assert.equal(new Set(keys).size,51);
 const first=await f.store.pageNoticeGroups({query:'personamonkey_connection',limit:20});
 assert.equal(first.total,1);assert.equal(first.unfilteredTotal,51);
 assert.equal(first.items[0].affectedCount,50);assert.equal(first.items[0].memberCount,50);
 assert.equal(first.items[0].eventCount,50);
 let cursor='',members=[];
 do{const p=await f.store.pageNoticeMembers({groupKey:shared.key,after:cursor,limit:20});
  assert.equal(p.total,50);assert.ok(p.items.length<=20);
  members.push(...p.items);cursor=p.more?p.next:null;
 }while(cursor);
 assert.equal(members.length,50);assert.equal(new Set(members.map(n=>n.scopeId)).size,50);
 const searched=await f.store.pageNoticeMembers({groupKey:shared.key,query:'account_f3_0049'});
 assert.equal(searched.total,1);assert.equal(searched.unfilteredTotal,50);
 assert.equal(searched.items[0].target.id,'account_f3_0049');
 for(const n of members)await f.store.acknowledgeNotice({scopeId:n.scopeId,code:n.code,expectedRevision:1});
 const reviewed=await f.store.pageNoticeGroups({query:'personamonkey_connection'});
 assert.equal(reviewed.items[0].reviewed,true);assert.equal(reviewed.items[0].memberCount,50);
 assert.equal((await f.store.noticeSummary()).counts.actionRequired,100);
});
test('F3 verified shared recovery retains history; relapse renotifies once inside the old window',async()=>{
 const f=fixture();
 for(let i=0;i<50;i++)await f.d.emit(note(i,'personamonkey_connection'));
 for(let i=0;i<50;i++)await f.d.resolve({scopeId:note(i).scopeId,code:'ROUTE_UNAVAILABLE',
  evidence:'ROUTE_HEALTH_OBSERVED',at:T});
 assert.equal((await f.store.pageNoticeGroups()).total,0);
 const history=await f.store.pageNoticeGroups({state:'RESOLVED'});
 assert.equal(history.total,1);assert.equal(history.items[0].affectedCount,50);
 const original=(await f.store.inspectNotice(note(0))).notice;
 assert.equal(original.state,'RESOLVED');assert.equal(original.history.at(-1).event,'RESOLVED');
 assert.equal(original.history.at(-1).evidence,'ROUTE_HEALTH_OBSERVED');
 for(let i=0;i<50;i++)await f.d.emit({...note(i,'personamonkey_connection'),revision:2});
 assert.equal(f.desktop.length,2,'one initial outage plus one relapse, not 50 relapse alerts');
 const reopened=(await f.store.inspectNotice(note(0))).notice;
 assert.equal(reopened.state,'ACTIVE');assert.equal(reopened.reviewed,false);
 assert.equal(reopened.count,2);assert.equal(reopened.firstAt,T);
 assert.equal(reopened.history.at(-1).event,'REOPENED');
});
test('F3 material action changes retain the first cause, reopen review and notify once per shared action',async()=>{
 const f=fixture(),base={scopeId:'git_connection',code:'GIT_RECONNECT_REQUIRED',
  severity:'ACTION_REQUIRED',cause:'git_connection',at:T,target:{kind:'SETTINGS',id:'connections'}};
 await f.d.emit({...base,revision:1,reason:'GIT_NETWORK_UNAVAILABLE'});
 await f.store.acknowledgeNotice({scopeId:base.scopeId,code:base.code,expectedRevision:1});
 await f.d.emit({...base,revision:2,reason:'GITHUB_AUTH_REJECTED'});
 const current=(await f.store.inspectNotice(base)).notice;
 assert.equal(current.reviewed,false);assert.equal(current.firstReason,'GIT_NETWORK_UNAVAILABLE');
 assert.equal(current.reason,'GITHUB_AUTH_REJECTED');assert.equal(f.desktop.length,2);
 await f.d.emit({...base,revision:3,reason:'GITHUB_AUTH_REJECTED'});
 assert.equal(f.desktop.length,2);assert.equal((await f.store.inspectNotice(base)).notice.count,3);
 const gitChange={...note(5,'git_main_change:123:'+('a'.repeat(40))),code:'GIT_FOLDER_MISSING'};
 assert.equal(incidentGroupKey(gitChange),'shared:'+gitChange.cause);
 assert.notEqual(incidentGroupKey({...gitChange,cause:'git_main_change:wrong'}),'shared:git_main_change:wrong');
});
test('F3 superseded diagnostic cannot write between canonical read and notification metadata read',async()=>{
 const f=fixture();let checks=0;
 const n=note(1,'personamonkey_connection');
 const out=await f.store.recordNotice({...n,isCurrent:()=>++checks===1});
 assert.equal(out.code,'NOTICE_SUPERSEDED');
 assert.equal(f.db.read('meta','attention:'+n.scopeId+':'+n.code),undefined);
 assert.equal(f.db.keys('meta').length,0);
});
test('F3 exact contextual reads and paged groups use actual trusted read-only boundary; malformed and forged commands fail',async()=>{
 const f=fixture(),n=note(1,'personamonkey_connection');await f.d.emit(n);
 const boundary=createCommandBoundary(f.api,{open:async()=>f.db});
 const request=type=>boundary.dispatch({type,params:{scopeId:n.scopeId,code:n.code}},f.sender);
 const before=structuredClone(f.db.read('meta','attention:'+n.scopeId+':'+n.code));
 const context=await request('GET_NOTICE_CONTEXT');
 assert.equal(context.notice.target.id,n.scopeId);assert.equal(context.providerEffects,'NONE');
 const page=await boundary.dispatch({type:'LIST_NOTICE_GROUP_PAGE',params:{limit:1}},f.sender);
 assert.equal(page.items.length,1);assert.equal(page.items[0].affectedCount,1);
 assert.deepEqual(f.db.read('meta','attention:'+n.scopeId+':'+n.code),before);
 for(const msg of [
  {type:'GET_NOTICE_CONTEXT',params:{scopeId:n.scopeId,code:n.code,execute:'CREATE'}},
  {type:'LIST_NOTICE_GROUP_PAGE',params:{limit:101}},
  {type:'LIST_NOTICE_GROUP_MEMBERS',params:{groupKey:'shared:ACCOUNT_ROUTE_UNAVAILABLE'}},
  {type:'LIST_NOTICE_GROUP_MEMBERS',params:{groupKey:page.items[0].key,after:'https://example.test'}}
 ])assert.equal((await boundary.dispatch(msg,f.sender)).ok,false);
 assert.equal(validateCommand(f.api,{...f.sender,url:'https://example.test'},{
  type:'GET_NOTICE_CONTEXT',params:{scopeId:n.scopeId,code:n.code}}).code,'UNTRUSTED_SENDER');
});
