import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
const out=path.join(root,'build/s01-native-candidate');
const python=String.raw`
import base64, json, threading
from types import SimpleNamespace
from pcms_probe import measure_prepared_exit,V4_URL,V6_URL
from pathlib import Path
class Router:
  def __init__(self):
    self.lock=threading.RLock()
    self.forwarders={'route_001': SimpleNamespace(relay_ip='10.124.1.2',relay_port=1080)}
    self.healthy=True
  def status(self):
    return dict(ready=self.healthy,base_route_bound=self.healthy,
       base_proxy_reachable=self.healthy,selected_entry='entry_001')
  def _validate_relay_target(self,ip,port):
    assert ip=='10.124.1.2' and port==1080
router=Router(); calls=[]
def fixed(relay,port,request):
  calls.append(request)
  assert relay=='10.124.1.2' and port==1080
  assert request['max_redirects']==0 and request['method']=='GET'
  assert not request['headers']
  assert request['url'] in (V4_URL,V6_URL)
  ip='45.66.77.88' if request['url']==V4_URL else '2a01:4f8:1c1c::1'
  return dict(ok=True,status=200,final_url=request['url'],
    body_base64=base64.b64encode(json.dumps({'ip':ip}).encode()).decode())
ok=measure_prepared_exit(router,'route_001','context_001',fixed)
assert ok['ok'] and ok['ipv4']['state']=='VERIFIED' and ok['ipv6']['state']=='VERIFIED',ok
assert ok['disposition']=='HOLD_TTL_UNQUALIFIED'
assert 'validUntilMs' not in ok
assert len(calls)==2
assert not measure_prepared_exit(router,'unknown_001','context_001',fixed)['ok']
assert len(calls)==2
def missing_v6(relay,port,request):
  if request['url']==V6_URL:
    return {'ok':False,'status':503,'final_url':request['url']}
  return fixed(relay,port,request)
assert not measure_prepared_exit(router,'route_001','context_001',missing_v6)['ok']
def drift(relay,port,request):
  val=fixed(relay,port,request)
  router.forwarders['route_001']=SimpleNamespace(relay_ip='10.124.1.2',relay_port=1080)
  return val
assert measure_prepared_exit(router,'route_001','context_001',drift)['code']=='CANDIDATE_CHANGED_DURING_PROBE'
router.healthy=False
assert measure_prepared_exit(router,'route_001','context_001',fixed)['code']=='PROTECTION_UNVERIFIED'
assert not any('perchance.org' in call['url'] for call in calls)
print('S01_NATIVE_FIXED_PROBE_D=PASS')
`;
test('S01 E01: staged donor daemon only has bounded fixed-endpoint dual-family probe; signed original unchanged',async()=>{
 const before=await readFile(path.join(root,'donor/personamonkey/native/routerd.py'));
 const built=spawnSync('python3',[path.join(root,'scripts/build-s01-native.py')],
   {cwd:root,encoding:'utf8',timeout:10000});
 assert.equal(built.status,0,built.stderr);
 const syntax=spawnSync('python3',['-c',`import ast,pathlib
for name in ("routerd.py","pcms_probe.py"):
 ast.parse(pathlib.Path(name).read_text(encoding="utf8"))
print("PYTHON_SOURCE_VALID")`],{cwd:out,encoding:'utf8',timeout:10000});
 assert.equal(syntax.status,0,syntax.stderr);
 const p=await readFile(path.join(out,'routerd.py'),'utf8');
 assert.ok(p.includes('if cmd == "pcms.verify_exit":'));
 assert.ok(p.includes('fetch_through_relay'));
 assert.deepEqual(await readFile(path.join(root,'donor/personamonkey/native/routerd.py')),before);
 const run=spawnSync('python3',['-c',python],{cwd:out,encoding:'utf8',timeout:10000});
 assert.equal(run.status,0,run.stderr||run.stdout);
 assert.match(run.stdout,/S01_NATIVE_FIXED_PROBE_D=PASS/);
});
