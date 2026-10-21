import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawnSync} from 'node:child_process';
const script=String.raw`
import importlib.util,json,os
spec=importlib.util.spec_from_file_location('vault','native/backup_vault_host.py')
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
old=os.environ.copy()
os.environ.pop('DBUS_SESSION_BUS_ADDRESS',None)
os.environ.pop('XDG_RUNTIME_DIR',None)
absent=m.action({'action':'diagnostic.environment'})
os.environ['DBUS_SESSION_BUS_ADDRESS']='synthetic-do-not-export'
os.environ['XDG_RUNTIME_DIR']='synthetic-do-not-export'
present=m.action({'action':'diagnostic.environment'})
wrong=m.action({'action':'diagnostic.environment','repositoryId':'1411034835'})
invalid=m.action({'action':'diagnostic.anything'})
os.environ.clear();os.environ.update(old)
print(json.dumps({'absent':absent,'present':present,'wrong':wrong,'invalid':invalid}))
`;
test('R3 restricted native host exposes only nonsecret environment booleans',()=>{
 const p=spawnSync('python3',['-c',script],{encoding:'utf8'});
 assert.equal(p.status,0,p.stderr);
 const v=JSON.parse(p.stdout);
 assert.deepEqual(Object.keys(v.present).sort(),
  ['ok','protocol','dbusSession','runtimeDir','secretTool'].sort());
 assert.equal(v.present.ok,true);assert.equal(v.present.protocol,2);
 assert.equal(v.absent.dbusSession,false);assert.equal(v.absent.runtimeDir,false);
 assert.equal(v.present.dbusSession,true);assert.equal(v.present.runtimeDir,true);
 assert.deepEqual(v.wrong,{ok:false,code:'DENIED'});
 assert.deepEqual(v.invalid,{ok:false,code:'DENIED'});
 assert.doesNotMatch(p.stdout,/synthetic-do-not-export/);
});
