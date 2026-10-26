import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
test('F2 protected-tab oracle observes navigation and rejects old, wrong-context and unconfirmed tabs',()=>{
 const python=String.raw`
import journey_integration_recovery as journey
now=[0.0];reads=[0]
old={'id':16,'url':'https://perchance.org/','cookieStoreId':'protected-context'}
blank={'id':17,'url':'about:blank','cookieStoreId':'protected-context'}
ready={**blank,'url':'https://perchance.org/'}
def pause(delta):now[0]+=delta
def delayed():
 reads[0]+=1
 return [old,blank] if reads[0]==1 else [old,ready]
found=journey.wait_new_protected_tab(None,[16],'protected-context',timeout=1,read_tabs=delayed,clock=lambda:now[0],pause=pause)
assert found==ready and reads[0]==2
for invalid in [blank,{**ready,'cookieStoreId':'another-context'},{**ready,'url':'https://perchance.org.evil/'},{**ready,'url':'http://perchance.org/'},{**ready,'id':16},{**ready,'id':None}]:
 now[0]=0.0;reads[0]=0
 def observe():
  reads[0]+=1
  return [old,invalid]
 try:
  journey.wait_new_protected_tab(None,[16],'protected-context',timeout=.5,read_tabs=observe,clock=lambda:now[0],pause=pause)
 except AssertionError as exc:
  assert exc.args[0][0]=='ISSUE60_PROTECTED_TAB_NAVIGATION_UNCONFIRMED',exc
 else:raise AssertionError(('FALSE_TAB_ACCEPTANCE',invalid))
 assert 1<=reads[0]<=6,reads
print('PASS exact new protected tab; passive bounded URL observation; old/blank/wrong-context/origin/identity denied')
`;
 const out=spawnSync('python3',['-c',python],{cwd:root,encoding:'utf8',env:{...process.env,PYTHONPATH:path.join(root,'scripts')}});
 assert.equal(out.status,0,out.stdout+'\n'+out.stderr);
 assert.match(out.stdout,/PASS exact new protected tab/);
});
