import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {buildI00} from '../scripts/build-i00.mjs';
import {createProtectedAdmission} from '../src/runtime/protected-admission.mjs';

const fakeRoute={id:'protected_route_01',host:'127.0.0.1',port:1080};
const key={bindingId:'binding_001',assignmentEpoch:'assignment_001',personaUid:'persona_001',
 routeId:fakeRoute.id,contextId:'firefox-container-001',routeRevision:1,
 evidenceId:'evidence_001',reservationId:'reservation_001',allocationRevision:1,
 ledgerEpoch:'ledger_001',exitSetDigest:'a'.repeat(64),grantRevision:1,
 pcmsEpoch:'pcms_epoch_001'};
const record={...key,authority:'BOUND_ACCOUNT_NETWORK',publicationSafetyGeneration:0,snapshotValidUntil:5000};
const profile={pcmsBindingId:key.bindingId,personaUid:key.personaUid,routeId:key.routeId,
 containerId:key.contextId,managed:true,status:'active',killSwitch:true,blockLocalNetwork:true};
function isolateFunction(source,begin,end,name,context) {
 const start=source.indexOf(begin),stop=source.indexOf(end,start+begin.length);
 assert.ok(start>=0 && stop>start, 'Production routing function present');
 return vm.runInNewContext(source.slice(start,stop)+'\n'+name+';',context);
}
function harness(bg,{managed=true,admitted=false,mode='proxy',interrupt=false}={}) {
 let timestamp=1000,resolveCalls=0,denyLedger=false;
 const grant=createProtectedAdmission({readCommitted:()=>denyLedger?{allow:false}:{allow:true,committed:record},
  now:()=>timestamp,donorBootId:'boot_001'});
 if(admitted){assert.equal(grant.publishCommitted(key,record).ok,true);
   assert.equal(grant.admit(key,{expectedSafetyGeneration:0,routeRevision:1,
    evidenceValidUntil:4000}).ok,true);}
 const requests=[];
 const state={profiles:{'firefox-container-001':managed?profile:{...profile,pcmsBindingId:null}}};
 const ctx={pcmsAdmission:grant,BLACKHOLE_PROXY:{type:'http',host:'127.0.0.1',port:9},
  initialize:async()=>{},getState:async()=>state,extensionBaseUrl:'moz-extension://test/',
  isExtensionOrigin:()=>false,getRouteTestRequestOverride:()=>null,
  isRouteTestFetchUrl:()=>false,routeDecision:()=>({mode,route:fakeRoute}),
  securityState:{privacySafe:true},recordBlock:(_d,why)=>requests.push(why),
  buildProxyInfo:()=>({type:'socks',host:'127.0.0.1',port:1080}),
  proxyInfoMatches:()=>true,directInfoIsDirect:()=>true,
  mullvadRuntime:{resolve:async()=>{resolveCalls++;if(interrupt)grant.invalidateNow({bindingId:key.bindingId});return fakeRoute;}}};
 const proxy=isolateFunction(bg,'async function handleProxyRequest(details) {','function recordBlock(details, reason) {',
 'handleProxyRequest',ctx);
 const before=isolateFunction(bg,'async function handleBeforeRequest(details) {','async function fetchMullvadRelays()',
 'handleBeforeRequest',ctx);
 const details={tabId:3,cookieStoreId:'firefox-container-001',url:'https://example.invalid/',
  proxyInfo:{type:'socks',host:'127.0.0.1',port:1080}};
 return {proxy,before,details,grant,requests,calls:()=>resolveCalls,time:v=>{timestamp=v}};
}
test('actual staged donor proxy AND blocking hooks deny tagged managed Persona before routing',async()=>{
 const {stage}=await buildI00({packageArchive:false});
 const bg=await readFile(path.join(stage,'background.js'),'utf8');
 const h=harness(bg);
 const a=await h.proxy(h.details),b=await h.before(h.details);
 assert.equal(a[0].port,9); assert.deepEqual(JSON.parse(JSON.stringify(b)),{cancel:true});
 assert.equal(h.calls(),0); // native resolver never runs for held managed traffic
 assert.ok(h.requests.includes('pcms-admission-held'));
});
test('unmanaged donor Persona retains original proxy and listener behavior',async()=>{
 const {stage}=await buildI00({packageArchive:false});
 const bg=await readFile(path.join(stage,'background.js'),'utf8');
 const h=harness(bg,{managed:false});
 assert.equal((await h.proxy(h.details)).type,'socks');
 assert.deepEqual(JSON.parse(JSON.stringify(await h.before(h.details))),{});
});
test('admitted managed session rejects Direct and revocation while resolver awaits',async()=>{
 const {stage}=await buildI00({packageArchive:false});
 const bg=await readFile(path.join(stage,'background.js'),'utf8');
 const direct=harness(bg,{admitted:true,mode:'direct'});
 assert.equal((await direct.proxy(direct.details))[0].port,9);
 assert.deepEqual(JSON.parse(JSON.stringify(await direct.before(direct.details))),{cancel:true});
 const revoked=harness(bg,{admitted:true,interrupt:true});
 assert.equal((await revoked.proxy(revoked.details))[0].port,9);
 assert.deepEqual(JSON.parse(JSON.stringify(await revoked.before(revoked.details))),{cancel:true});
});
