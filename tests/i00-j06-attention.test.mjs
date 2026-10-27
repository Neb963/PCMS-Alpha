import test from 'node:test';
import assert from 'node:assert/strict';
import {acknowledgeIncident,incidentDestination,validIncidentTarget,incidentPrimaryAction} from '../src/ui/faithful/attention.mjs';
import {createCanonicalStore} from '../src/runtime/journal.mjs';
import {fakeDatabase} from './fake-idb.mjs';
const n={scopeId:'account_fixture',code:'ROUTE_UNAVAILABLE',revision:2,reviewed:false};
test('J06 incident target is typed, durable and cannot inject a URL or mutation command',async()=>{
 const store=createCanonicalStore(fakeDatabase()),target={kind:'GENERATOR',id:'exact-source'};
 assert.equal((await store.recordNotice({...n,severity:'ACTION_REQUIRED',target})).ok,true);
 assert.deepEqual((await store.listNotices()).notices[0].target,target);
 for(const invalid of [{kind:'URL',id:'https://example.test'},{kind:'SETTINGS',id:'delete-everything'},{kind:'ACCOUNT',id:n.scopeId,execute:'MUTATE'}]){
  assert.equal(validIncidentTarget(invalid),false);
  assert.equal((await store.recordNotice({...n,severity:'SERIOUS',revision:3,target:invalid})).ok,false);
 }
 assert.deepEqual(incidentDestination(n),{kind:'CONTEXT',id:n.code},'an opaque scope is not an account identity');
 assert.deepEqual(incidentDestination({...n,code:'BACKUP_FAILED'}),{kind:'SETTINGS',id:'backups'});
});
test('J06 lost acknowledgement is independently observed; no duplicate write and no resolution',async()=>{
 let reviewed=false,writes=0;
 const request=async(type)=>{if(type==='LIST_NOTICE_PAGE')return {ok:true,items:[{...n,reviewed}]};writes++;reviewed=true;throw Error('ACK_LOST')};
 const out=await acknowledgeIncident(n,request);assert.equal(out.ok,true);assert.equal(out.stillActionable,true);assert.equal(writes,1);
 assert.equal((await acknowledgeIncident(n,request)).ok,true);assert.equal(writes,1);
});
test('J06 stale escalation is shown before acknowledgement and a failed click remains retryable',async()=>{
 let fail=true,writes=0;
 const request=async(type)=>{if(type==='LIST_NOTICE_PAGE')return {ok:true,items:[n]};writes++;if(fail)throw Error('OFFLINE');return {ok:true,stillActionable:true}};
 assert.equal((await acknowledgeIncident(n,request)).ok,false);fail=false;
 assert.equal((await acknowledgeIncident(n,request)).ok,true);assert.equal(writes,2);
 const stale=await acknowledgeIncident(n,async()=>({ok:true,items:[{...n,revision:3}]}));
 assert.equal(stale.code,'STALE_REVISION');
});

test('Work Queue primary link names the actual verified target or the contextual action, never a fake diagnostic item',()=>{
 const target={kind:'ACCOUNT',id:'account_valid_001'};
 assert.deepEqual(incidentPrimaryAction({...n,target}),{label:'Open affected item',kind:'ENTITY'});
 assert.deepEqual(incidentPrimaryAction({...n}),{label:'Inspect cause',kind:'CONTEXT'});
 assert.deepEqual(incidentPrimaryAction({...n,code:'CANONICAL_UNAVAILABLE',target:{kind:'SETTINGS',id:'diagnostics'}}),
  {label:'Inspect cause',kind:'CONTEXT'});
 assert.deepEqual(incidentPrimaryAction({...n,code:'CANONICAL_UNAVAILABLE'}),
  {label:'Inspect cause',kind:'CONTEXT'});
 assert.deepEqual(incidentPrimaryAction({...n,code:'BACKUP_FAILED',target:{kind:'SETTINGS',id:'backups'}}),
  {label:'Open Backups',kind:'SETTINGS',id:'backups'});
 assert.deepEqual(incidentPrimaryAction({...n,code:'BACKUP_FAILED',target:{kind:'SETTINGS',id:'diagnostics'}}),
  {label:'Inspect cause',kind:'CONTEXT'});
 assert.deepEqual(incidentPrimaryAction({...n,code:'PROVIDER_OUTAGE'}),
  {label:'Open Refresher',kind:'SETTINGS',id:'refresher'});
 assert.deepEqual(incidentPrimaryAction({...n,code:'SOURCE_HELD',target:{kind:'GENERATOR',id:'example-owned'}}),
  {label:'Open affected item',kind:'ENTITY'});
 assert.deepEqual(incidentPrimaryAction({...n,code:'OPERATION_UNCERTAIN',target:{kind:'OPERATION',id:'operation_held_001'}}),
  {label:'Open affected item',kind:'ENTITY'});
});
