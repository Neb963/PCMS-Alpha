// Native host is exercised without an actual Secret Service, profile or credential.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const path='native/backup_vault_host.py';
function python(script){
  const run=spawnSync('python3',['-c',script],{encoding:'utf8',timeout:4000});
  assert.equal(run.status,0,run.stderr);return JSON.parse(run.stdout);
}
test('P55-03: untrusted native commands, route tools and oversized payloads rejected',()=>{
  const script=`import json,importlib.util,struct,io,sys
spec=importlib.util.spec_from_file_location('vault',${JSON.stringify(path)})
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
hits=[]
def fake(args,**kw):
 hits.append(args)
 raise AssertionError('native tool invoked by unauthorised command')
rows=[{}, {'action':'route'}, {'action':'get','passphrase':'leak'},
 {'action':'set','passphrase':'short'}, {'action':'set','passphrase':'a'*5000},
 {'action':'get','extra':True}, ['get'], None]
out=[m.action(x,run=fake) for x in rows]
print(json.dumps({'out':out,'hits':hits,'host':m.HOST,'tool':m.TOOL,'max':m.MAX_INPUT}))
`;
  const result=python(script);
  assert.equal(result.hits.length,0);
  assert.equal(result.host,'local.pcms.backup_vault');
  assert.equal(result.tool,'/usr/bin/secret-tool');
  assert.equal(result.max,8192);
  assert.ok(result.out.every(v=>v.ok===false&&v.code==='DENIED'));
});
test('P55-03: secret is supplied via stdin only; stderr and failures redacted',()=>{
  const script=`import json,importlib.util,subprocess
spec=importlib.util.spec_from_file_location('vault',${JSON.stringify(path)})
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
calls=[]
def fake(args,**kw):
 calls.append({'args':args,'input':str(kw.get('input'))[:4],
  'stdin':kw.get('input') is not None,'stderr':kw.get('stderr')==subprocess.DEVNULL,
  'timeout':kw.get('timeout')})
 if 'lookup' in args:
  return subprocess.CompletedProcess(args,0,stdout=b'portable-vault-test-password\\n',stderr=b'')
 return subprocess.CompletedProcess(args,0,stdout=b'',stderr=b'')
secret='portable-vault-test-password'
a=m.action({'action':'set','passphrase':secret},run=fake)
b=m.action({'action':'get'},run=fake)
def fail(args,**kw):
 raise subprocess.TimeoutExpired(args,6)
c=m.action({'action':'get'},run=fail)
print(json.dumps({'set':a,'get':b,'timeout':c,'calls':calls}))
`;
  const result=python(script);
  assert.deepEqual(result.set,{ok:true});
  assert.deepEqual(result.get,{ok:true,passphrase:'portable-vault-test-password'});
  assert.deepEqual(result.timeout,{ok:false,code:'TIMEOUT'});
  assert.equal(result.calls.length,2);
  assert.equal(result.calls[0].stdin,true);
  assert.equal(result.calls[0].stderr,true);
  assert.equal(result.calls[1].stdin,false);
  for(const call of result.calls){
    assert.equal(call.timeout,6);
    assert.ok(!JSON.stringify(call).includes('portable-vault-test-password'));
  }
});
test('P55-03: exact Gecko allowed extension and no broad browser privileges',()=>{
  const manifest=JSON.parse(readFileSync('native/local.pcms.backup_vault.json','utf8'));
  assert.deepEqual(manifest.allowed_extensions,['persona-route-manager@local']);
  assert.equal(manifest.name,'local.pcms.backup_vault');
  assert.equal(manifest.type,'stdio');
  assert.match(manifest.path,/ABSOLUTE/); // operator-local installation required
});
