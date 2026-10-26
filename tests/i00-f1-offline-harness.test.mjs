import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
test('F1 offline browser harness never sends relay catalog or unrecognized fetches to the Internet',async()=>{
 const source=await readFile('scripts/fixtures/issue60_background.mjs','utf8');
 const prefix=source.slice(0,source.indexOf(' const {openCanonicalDatabase}')).replace('export async function','async function');
 const sent=[],context={URL,Response,Error,window:{fetch:async url=>{sent.push(String(url));return {ok:true}}},browser:{runtime:{}}};
 const install=vm.runInNewContext(prefix+'return {blockedNetwork};}\ninstallIssue60NativeFixture;',context);
 await assert.rejects(install({url:'https://outside-fixture.invalid/native',key:'fixture'}),/OFFLINE_FIXTURE_CONTROL_REQUIRED/);
 const fixture=await install({url:'http://127.0.0.1:12345/native',key:'fixture'});
 const catalog=await context.window.fetch('https://api.mullvad.net/network/v1-beta1/socks-proxies');
 assert.equal((await catalog.json()).length,4);assert.deepEqual(sent,[],'catalog is a local synthetic fixture');
 await assert.rejects(context.window.fetch('https://outside-fixture.invalid/'),/OFFLINE_FIXTURE_NETWORK_DENIED/);
 assert.deepEqual(sent,[]);assert.equal(fixture.blockedNetwork.length,1);
});
test('installed-browser health witness settles on the received message before a synchronous disconnect callback; absent messages still fail',async()=>{
 const source=await readFile('scripts/browser-i00-smoke.py','utf8');
 const script=/def guard_status\(session\):[\s\S]*?script = '''([\s\S]*?)'''/.exec(source)?.[1];assert.ok(script);
 for(const received of [true,false]){
  const replies=[],events={},port={onMessage:{addListener:f=>events.message=f},onDisconnect:{addListener:f=>events.disconnect=f},disconnect:()=>events.disconnect()};
  const run=vm.runInNewContext('(function(){'+script+'})',{browser:{runtime:{connect:()=>port}}});
  run(value=>replies.push(value));
  if(received)events.message({donorReady:true,providerEffects:'OFF'});else events.disconnect();
  assert.equal(replies.length,1);
  if(received)assert.equal(replies[0].donorReady,true);else assert.equal(replies[0].error,'health-port-disconnected');
 }
});
