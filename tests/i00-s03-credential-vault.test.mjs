import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
function python(lines){
  const run=spawnSync('python3',['-c',lines.join('\n')],{encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  return JSON.parse(run.stdout);
}
const setup=[
  'import importlib.util,json,subprocess',
  'spec=importlib.util.spec_from_file_location("vault","native/backup_vault_host.py")',
  'm=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)'
];
test('S03 native vault: fixed repository ID scope, fail closed and no arbitrary paths',()=>{
  const result=python([...setup,
    'calls=[]',
    'def fake(args,**kw):',
    '    calls.append(args)',
    '    return subprocess.CompletedProcess(args,0,stdout=b"fixture-credential-123456\\n")',
    'rows=[',
    ' {"action":"git.store","repositoryId":"42","credential":"too-short"},',
    ' {"action":"git.store","repositoryId":"42","credential":"credential\\nline"},',
    ' {"action":"git.store","repositoryId":"42","credential":"credential value space"},',
    ' {"action":"git.get","repositoryId":"../../../path"},',
    ' {"action":"git.remove","repositoryId":"0"},',
    ' {"action":"git.status","repositoryId":"42","extra":True},',
    ' {"action":"git.route","repositoryId":"42"},',
    ' {"action":"git.get","repositoryId":42},',
    ' {"action":"get","repositoryId":"42"}]',
    'out=[m.action(x,run=fake) for x in rows]',
    'print(json.dumps({"results":out,"hits":len(calls)}))'
  ]);
  assert.equal(result.hits,0);
  assert.ok(result.results.every(x=>!x.ok&&x.code==='DENIED'));
});
test('S03 native vault: stable attributes isolate repo and backup and redact status',()=>{
  const result=python([...setup,
    'calls=[]',
    'secret="fixture-credential-123456"',
    'def fake(args,**kw):',
    '    calls.append({"args":args,"input":bool(kw.get("input"))})',
    '    return subprocess.CompletedProcess(args,0,stdout=(secret+"\\n").encode())',
    'out=[',
    ' m.action({"action":"git.store","repositoryId":"42","credential":secret},run=fake),',
    ' m.action({"action":"git.status","repositoryId":"42"},run=fake),',
    ' m.action({"action":"git.get","repositoryId":"42"},run=fake),',
    ' m.action({"action":"git.remove","repositoryId":"42"},run=fake),',
    ' m.action({"action":"set","passphrase":"safe-unchanged-backup-key"},run=fake)]',
    'print(json.dumps({"out":out,"calls":calls}))'
  ]);
  assert.deepEqual(result.out[0],{ok:true});
  assert.deepEqual(result.out[1],{ok:true,present:true});
  assert.deepEqual(result.out[2],{ok:true,credential:'fixture-credential-123456'});
  assert.deepEqual(result.out[3],{ok:true});
  assert.deepEqual(result.out[4],{ok:true});
  for(const call of result.calls.slice(0,4)){
    assert.ok(call.args.includes('repository-id'));
    assert.ok(call.args.includes('42'));
    assert.ok(call.args.includes('github-credential-v1'));
    assert.ok(!call.args.includes('unattended-encrypted-backup'));
    assert.ok(!JSON.stringify(call).includes('fixture-credential-123456'));
  }
  assert.equal(result.calls[0].input,true);
  assert.equal(result.calls[3].input,false);
  assert.ok(result.calls[4].args.includes('unattended-encrypted-backup'));
});
test('S03 native vault: locked/unavailable lookup is never absence evidence',()=>{
  const result=python([...setup,
    'def locked(args,**kw):',
    '    return subprocess.CompletedProcess(args,1,stdout=b"")',
    'print(json.dumps(m.action({"action":"git.status","repositoryId":"42"},run=locked)))'
  ]);
  assert.deepEqual(result,{ok:false,code:'UNAVAILABLE'});
});
