import test from 'node:test';
import assert from 'node:assert/strict';
import {destinationOwnedPortable} from '../src/runtime/restore-identities.mjs';
import {bindingTagChanges} from '../src/runtime/pcms-donor-fence.mjs';
import {prepareRestoredCanonical,preflightRestoredCanonical} from '../src/ui/restore-sanitize.mjs';
import {mergeRestoredExitLedgers} from '../src/runtime/restore-exits.mjs';
import {preserveUnselectedDonorSources} from '../src/runtime/restore-preserve.mjs';
import {DB_STORES} from '../src/ui/backup-core.mjs';
const empty=()=>({schema:1,stores:Object.fromEntries(DB_STORES.map(k=>[k,[]]))});
const sourceUid='11111111-1111-4111-8111-111111111111',targetUid='22222222-2222-4222-8222-222222222222';
const donor={personas:[{key:'p',profile:{personaUid:sourceUid,pcmsBindingId:'bind_source'}}]};
const ledger=(bindingId,personaUid)=>({key:'network:s01:exit-ownership-v1',schema:2,revision:1,owners:{'IPv4:8.8.8.8':'account_same'},bindings:{[bindingId]:{bindingId,accountId:'account_same',personaUid,pin:'HELD',history:[]}}});
function canonical(uid,bindingId){const snapshot=empty();snapshot.stores.meta=[{key:'account:account_same',value:{key:'account:account_same',account:{accountId:'account_same',personaUid:uid,bindingId,state:'VERIFIED',revision:4,bindingVersion:2}}},{key:'network:s01:exit-ownership-v1',value:ledger(bindingId,uid)}];return snapshot;}
test('restore cannot transplant portable protected tags; destination UID and tag remain donor-owned',()=>{
 const before={profiles:{target:{personaUid:targetUid,pcmsBindingId:'bind_target'}}};
 const portable=destinationOwnedPortable(donor,before,{p:'target'});
 assert.equal(portable.personas[0].profile.personaUid,targetUid);
 assert.equal(portable.personas[0].profile.pcmsBindingId,'bind_target');
 assert.deepEqual(bindingTagChanges(before,{profiles:{target:portable.personas[0].profile}}),{ok:true});
 const untagged=destinationOwnedPortable(donor,{profiles:{target:{personaUid:targetUid}}},{p:'target'});
 assert.equal(untagged.personas[0].profile.pcmsBindingId,undefined);
 assert.equal(donor.personas[0].profile.pcmsBindingId,'bind_source');
});
test('same-account source/destination binding differences preserve matching destination binding and historical exclusions',()=>{
 const incoming=canonical(sourceUid,'bind_source'),current=canonical(targetUid,'bind_target');
 const state={profiles:{target:{personaUid:targetUid,pcmsBindingId:'bind_target'}}};
 const snapshot=preflightRestoredCanonical({incoming,current,donor,mappings:{p:'target'},currentDonor:{state},mode:'replace',fresh:false});
 const account=snapshot.stores.meta.find(r=>r.key==='account:account_same').value.account;
 const exits=snapshot.stores.meta.find(r=>r.key==='network:s01:exit-ownership-v1').value;
 assert.equal(account.personaUid,targetUid);assert.equal(account.bindingId,'bind_target');
 assert.equal(account.state,'VERIFICATION_PENDING');assert.equal(exits.bindings.bind_target.personaUid,targetUid);
 assert.equal(exits.bindings.bind_target.pin,'HELD');assert.ok(exits.restoredBindingHistory.bind_source);
 const wrong=structuredClone(current);wrong.stores.meta[0].value.account.accountId='account_other';
 assert.throws(()=>preflightRestoredCanonical({incoming,current:wrong,donor,mappings:{p:'target'},currentDonor:{state},mode:'replace'}),/RESTORE_PROTECTED_PERSONA_BELONGS_TO_OTHER_ACCOUNT/);
});
test('new untagged destination keeps source associations recoverable but never imports a live binding or retargets an uncertain operation',()=>{
 const incoming=canonical(sourceUid,'bind_source');
 for(const [prefix,field] of [['adoption','adoption'],['source-link','link'],['identity-alias','identity']])incoming.stores.meta.push({key:prefix+':fixture',value:{key:prefix+':fixture',[field]:{accountId:'account_same',personaUid:sourceUid,bindingVersion:2,accountRevision:4,principalFingerprint:'a'.repeat(64)}}});
 incoming.stores.operations.push({key:'operation_fixture',value:{id:'operation_fixture',personaUid:sourceUid,status:'DISPATCH_POSSIBLE',revision:1}});
 const restored=prepareRestoredCanonical({incoming,current:empty(),mode:'replace',fresh:true,uidRemap:{[sourceUid]:targetUid},targetBindings:{[targetUid]:null},accountChoices:{account_same:'INCLUDE_INACTIVE'}});
 const account=restored.stores.meta.find(r=>r.key==='account:account_same').value.account;
 assert.equal(account.bindingId,null);assert.equal(account.upgrade,null);
 const exits=restored.stores.meta.find(r=>r.key==='network:s01:exit-ownership-v1').value;
 assert.equal(Object.keys(exits.bindings).length,0);assert.ok(exits.restoredBindingHistory.bind_source);assert.equal(exits.owners['IPv4:8.8.8.8'],'account_same');
 for(const [prefix,field] of [['adoption','adoption'],['source-link','link'],['identity-alias','identity']]){
  const association=restored.stores.meta.find(r=>r.key===prefix+':fixture').value[field];
  assert.equal(association.personaUid,targetUid);assert.equal(association.bindingVersion,account.bindingVersion);
  assert.equal(association.restoredContextHistory[0].personaUid,sourceUid);assert.equal(association.restoredOwnerReverificationRequired,true);
 }
 assert.equal(restored.stores.operations[0].value.personaUid,sourceUid);assert.equal(restored.stores.operations[0].value.status,'HELD_UNCERTAIN');
});
test('retired destination tag history retains the original observed UID/context instead of the imported UID remap',()=>{
 const current=ledger('bind_source',sourceUid);current.bindings.bind_source.contextId='firefox-container-old';
 const merged=mergeRestoredExitLedgers(current,current,{uidRemap:{[sourceUid]:targetUid},affectedAccounts:['account_same'],accountTargets:{account_same:{personaUid:targetUid,bindingId:null}}});
 const retired=merged.restoredBindingHistory.bind_source;
 assert.equal(retired.destinationRetired,true);assert.equal(retired.personaUid,sourceUid);assert.equal(retired.contextId,'firefox-container-old');assert.equal(retired.pin,'HELD');
 assert.equal(merged.owners['IPv4:8.8.8.8'],'account_same');
});
test('cloned external artifacts never inherit verified installation ownership',()=>{
 const script={id:'shared',externalArtifact:{ownerKey:'owner_fixture',artifactId:'artifact_fixture',ownershipVerified:true},profileIds:['unrelated','selected']};
 const current={scripts:{shared:script},workflows:{}};
 const imported={state:{profiles:{selected:{scriptIds:['shared']}},scripts:{shared:structuredClone(script)},workflows:{}},maps:{script:new Map([['s','shared']]),workflow:new Map()}};
 preserveUnselectedDonorSources(imported,current,['selected'],{newId:()=> 'cloned'});
 assert.equal(imported.state.scripts.shared.externalArtifact.ownershipVerified,true);
 assert.equal(imported.state.scripts.cloned.externalArtifact.ownershipVerified,false);
 assert.equal(Object.values(imported.state.scripts).filter(s=>s.externalArtifact.ownershipVerified).length,1);
});

test('source history cannot assert destination retirement provenance',()=>{
 const source=ledger('bind_source',sourceUid);source.bindings.bind_source.destinationRetired=true;
 source.restoredBindingHistory={bind_old:{...source.bindings.bind_source,bindingId:'bind_old',destinationRetired:true}};
 const restored=mergeRestoredExitLedgers(source,null,{affectedAccounts:['account_same'],accountTargets:{account_same:{personaUid:targetUid,bindingId:null}}});
 assert.equal(restored.restoredBindingHistory.bind_old.destinationRetired,undefined);
 assert.equal(restored.restoredBindingHistory.bind_source.destinationRetired,undefined);
});
