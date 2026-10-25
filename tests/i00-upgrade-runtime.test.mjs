import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

test('upgrade readiness rejects a visible old runtime, missing APIs and the wrong principal',()=>{
  const result=spawnSync('python3',['-c',`
import importlib.util
from unittest.mock import patch
spec=importlib.util.spec_from_file_location('upgrade','scripts/a08-upgrade-firefox.py')
u=importlib.util.module_from_spec(spec);spec.loader.exec_module(u)
ready={'version':'1.2.13','gecko':u.b.ID,'main':True,'storageAPI':True,'alarms':True}
old={**ready,'version':'1.2.0'}
observed=[]
samples=iter([old,None,ready])
def read(session,script):
    value=next(samples);observed.append(value);return value
with patch.object(u.b,'execute',read),patch.object(u.time,'sleep',lambda _:None):
    assert u.wait_upgraded_runtime('isolated-session','1.2.13')==ready
assert len(observed)==3, 'Visible old-version UI must not complete readiness'
for sample in [old,None,{**ready,'alarms':False},{**ready,'main':False},
               {**ready,'gecko':'wrong-addon'}]:
    ticks=iter([0,.1,.2,.3,1.1])
    with patch.object(u.b,'execute',lambda *_:sample), \\
         patch.object(u.time,'sleep',lambda _:None), \\
         patch.object(u.time,'monotonic',lambda:next(ticks)):
        try:
            u.wait_upgraded_runtime('isolated-session','1.2.13',timeout_seconds=1)
        except AssertionError:
            pass
        else:
            raise AssertionError(('Unsafe runtime accepted',sample))
print('upgrade-runtime adverse readiness checks passed')
`],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr||result.stdout);
  assert.match(result.stdout,/adverse readiness checks passed/);
});
