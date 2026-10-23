import test from 'node:test';
import assert from 'node:assert/strict';
import {createGitCredentialResolver} from '../src/runtime/git-credential.mjs';

// A03 red oracle: a configured Git connection must resolve in the background
// without invoking any extra native host or exposing tokens to content scripts.
test('A03: configured Git token is resolved from background-only persistent storage',async()=>{
  const token='github_pat_'+'a'.repeat(40);
  const api={storage:{local:{get:async()=>({pcmsS03Git:{
    repository:'Neb963/per-gens',repositoryId:'42'}})}},
    runtime:{sendNativeMessage:async()=>{throw Error('FORBIDDEN_PCMS_NATIVE_HOST');}}};
  const store={get:async id=>id==='42'?{ok:true,token}: {ok:false,code:'GIT_RECONNECT_REQUIRED'}};
  const resolved=await createGitCredentialResolver(api,{store})();
  assert.equal(resolved.ok,true,'background storage must serve configured Git operations');
  assert.equal(resolved.token,token);
  assert.equal(resolved.source,'BROWSER_LOCAL');
});
