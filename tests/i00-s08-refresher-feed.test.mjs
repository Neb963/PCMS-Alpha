import test from 'node:test';
import assert from 'node:assert/strict';
import {verifiedRefreshFeed} from '../src/runtime/refresher-boundary.mjs';
const proof={slug:'pcms-test-demo',accountId:'account_test_01',
 refresh:{savedSourceFingerprint:'b'.repeat(64),awaitingVisibility:false,intent:null,
 history:[{id:'marker_12345678',effect:'EFFECT_CONFIRMED',at:400}]},
 presence:{source:'GUARDED_RECENT_LIST',present:true,position:4,observedAt:500}};
test('S08 recent-feed PASS needs post-save independent complete-feed readback',()=>{
 assert.equal(verifiedRefreshFeed(proof),true);
 assert.equal(verifiedRefreshFeed({...proof,presence:{...proof.presence,observedAt:400}}),false);
 assert.equal(verifiedRefreshFeed({...proof,presence:{...proof.presence,source:'LOCAL_FIXTURE'}}),false);
 assert.equal(verifiedRefreshFeed({...proof,refresh:{...proof.refresh,awaitingVisibility:true}}),false);
 assert.equal(verifiedRefreshFeed({...proof,refresh:{...proof.refresh,history:[{effect:'EFFECT_UNVERIFIED',at:400}]}}),false);
 assert.equal(verifiedRefreshFeed({...proof,refresh:{...proof.refresh,intent:{id:'pending'}}}),false);
});
