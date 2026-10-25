import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {DB_STORES} from '../src/ui/backup-core.mjs';
import {collectPortableLocal,archiveWithPortableLocal,splitPortableLocal,preparePortableLocalRestore,PORTABLE_LOCAL_META} from '../src/runtime/portable-local.mjs';
import {verifyPortableCheckpoint,inspectPortableRestore} from '../src/runtime/portable-restore-plan.mjs';
import {createPortableBackupPayload} from '../donor/personamonkey/extension/lib/backup-package.js';
import {encodePortableArchive,readPortableArchive} from '../src/runtime/portable-archive.mjs';
import {prepareRestoredCanonical} from '../src/ui/restore-sanitize.mjs';
if(!globalThis.crypto)globalThis.crypto=webcrypto;
const empty=()=>({schema:1,stores:Object.fromEntries(DB_STORES.map(s=>[s,[]]))});
const local=()=>({
 pcmsS03Git:{repository:'Neb963/per-gens',repositoryId:'1411034835',token:'NEVER_EXPORT_CREDENTIAL'},
 pcmsS06StandingAuthority:{grants:{development:true,gitWrite:true,publication:true}},
 pcmsRestoreInProgress:{active:true},unknownRuntimeSecret:'NEVER_EXPORT_UNKNOWN',
 pcmsUiGeneratorSelectionV1:{schema:1,items:[{slug:'example',accountId:'account_fixture',revision:3}]},
 pcmsR4FolderIdentityReviews:[{repositoryId:'1411034835',newSlug:'new-name',oldSlug:'old-name',state:'RENAME_EXISTING_REQUESTED',revision:2,automaticRenameApproved:true}],
 'pcmsR4ExistingRenameAttempt:new-name':{schema:1,newSlug:'new-name',oldSlug:'old-name',state:'DISPATCH_POSSIBLE',revision:4,operationId:'rename_aaaa',sourceFingerprint:'a'.repeat(64),ownerChoiceSource:'HUMAN_EXACT_RENAME_SCOPE'},
 pcmsR4MissingGitFolders:{repositoryId:'1411034835',slugs:['old-name']}
});
test('J06 real archive frames nonsecret settings and rename WAL, with no credential/grant/guard import',async()=>{
 const pcms=empty(),projected=collectPortableLocal(local()),archived=archiveWithPortableLocal(pcms,local());
 assert.equal(pcms.stores.meta.length,0);assert.equal(archived.stores.meta.length,1);
 const donor=createPortableBackupPayload({state:{},containers:[],selection:{kind:'full'}});
 const encoded=await encodePortableArchive({pcms:archived,donor,appVersion:'1.2.13'}),opened=await readPortableArchive(encoded.blob);
 assert.deepEqual(JSON.parse(JSON.stringify(splitPortableLocal(opened.canonical).values)),projected);
 const text=await encoded.blob.text();assert.equal(text.includes('NEVER_EXPORT'),false);assert.equal(text.includes('pcmsS06StandingAuthority'),false);assert.equal(text.includes('pcmsRestoreInProgress'),false);
 const patch=preparePortableLocalRestore(projected,{}, {mode:'replace'});
 assert.equal(patch.pcmsR4FolderIdentityReviews[0].automaticRenameApproved,false);
 assert.equal(patch.pcmsR4FolderIdentityReviews[0].state,'REVIEW_REQUIRED');
 assert.equal(patch['pcmsR4ExistingRenameAttempt:new-name'].state,'OUTCOME_UNCERTAIN');
 assert.equal(patch['pcmsR4ExistingRenameAttempt:new-name'].ownerChoiceSource,undefined);
 const applied=prepareRestoredCanonical({incoming:archived,current:pcms,mode:'replace'});
 assert.equal(applied.stores.meta.some(r=>r.key===PORTABLE_LOCAL_META),false,'archive-only row never becomes live competing authority');
});
test('J06 unsupported archive local keys are rejected and destination possible rename effects are never overwritten',()=>{
 const pcms=archiveWithPortableLocal(empty(),local());
 pcms.stores.meta[0].value.values.pcmsS06StandingAuthority={grants:{publication:true}};
 assert.throws(()=>splitPortableLocal(pcms),/PORTABLE_LOCAL_SCHEMA_INVALID/);
 const source=collectPortableLocal(local()),destination=structuredClone(source);
 destination['pcmsR4ExistingRenameAttempt:new-name'].operationId='different_possible_effect';
 assert.throws(()=>preparePortableLocalRestore(source,destination,{mode:'replace'}),/RESTORE_LOCAL_RENAME_UNCERTAIN/);
 assert.throws(()=>preparePortableLocalRestore(source,{pcmsS03Git:{repository:'Neb963/per-gens',repositoryId:'99'}},{mode:'merge'}),/RESTORE_LOCAL_SETTINGS_CONFLICT/);
});
test('J06 checkpoint and reviewed plan bind local settings independently of real canonical data',async()=>{
 const current=empty(),settings=collectPortableLocal(local()),donor=createPortableBackupPayload({state:{},containers:[],selection:{kind:'full'}});
 const checkpoint={canonical:archiveWithPortableLocal(current,settings),donor,sourceVerified:true,receipt:{status:'READY',chain:'a'.repeat(64)}};
 assert.equal((await verifyPortableCheckpoint({checkpoint,currentPcms:current,currentPortable:donor,currentLocal:settings})).tier,3);
 const changed=structuredClone(settings);changed.pcmsUiGeneratorSelectionV1.items=[];
 await assert.rejects(()=>verifyPortableCheckpoint({checkpoint,currentPcms:current,currentPortable:donor,currentLocal:changed}),/RESTORE_CHECKPOINT_LOCAL_DRIFT/);
 const args={incoming:checkpoint,currentPcms:current,currentDonor:{state:{},containers:[]},currentPortable:donor};
 const a=await inspectPortableRestore({...args,currentLocal:settings}),b=await inspectPortableRestore({...args,currentLocal:changed});
 assert.notEqual(a.planSha256,b.planSha256);
 const changedSource=structuredClone(current);changedSource.stores.meta.push({key:'adoption:example',value:{source:'changed'}});
 await assert.rejects(()=>verifyPortableCheckpoint({checkpoint,currentPcms:changedSource,currentPortable:donor,currentLocal:settings}),/RESTORE_CHECKPOINT_PCMS_DRIFT/);
});

test('J06 actual missing-folder history and alternate valid repository survive export',()=>{
 const data={pcmsS03Git:{repository:'Example/valid-repository',repositoryId:'91',token:'EXCLUDED'},
 pcmsR4MissingGitFolders:{repositoryId:'91',slugs:['removed-folder']}};
 assert.deepEqual(collectPortableLocal(data),{pcmsR4MissingGitFolders:data.pcmsR4MissingGitFolders,
 pcmsS03Git:{repository:'Example/valid-repository',repositoryId:'91'}});
});
test('J06 deterministic canonical conflicts fail at inspection before a restore guard or donor write',async()=>{
 const current=empty(),archive=empty(),donor=createPortableBackupPayload({state:{},containers:[],selection:{kind:'full'}});
 archive.stores.meta.push({key:'setting:example',value:{value:'archive'}});
 current.stores.meta.push({key:'setting:example',value:{value:'current'}});
 const incoming={canonical:archive,donor,sourceVerified:true,receipt:{status:'READY',chain:'a'.repeat(64)}};
 await assert.rejects(()=>inspectPortableRestore({incoming,currentPcms:current,currentDonor:{state:{},containers:[]},currentPortable:donor,mode:'merge'}),/RESTORE_MERGE_CONFLICT/);
 assert.equal(current.stores.meta[0].value.value,'current');
});
test('J06 a reliably removed account stays excluded by default and can explicitly return inactive without erasing removal history',()=>{
 const current=empty(),archive=empty(),uid='11111111-1111-4111-8111-111111111111';
 archive.stores.meta=[{key:'account:account_fixture',value:{key:'account:account_fixture',account:{accountId:'account_fixture',personaUid:uid,state:'VERIFIED',revision:2,bindingVersion:1,boundPrincipal:'a'.repeat(64)}}}];
 const removal={key:'removal:account_fixture',state:'REMOVED_ONLY_LOCALLY',revision:5,accountId:'account_fixture'};
 current.stores.meta=[{key:'account:account_fixture',value:{key:'account:account_fixture',account:{accountId:'account_fixture',personaUid:uid,state:'REMOVED',revision:5,bindingVersion:3,boundPrincipal:'a'.repeat(64)}}},{key:removal.key,value:removal}];
 const omitted=prepareRestoredCanonical({incoming:archive,current,mode:'replace',uidRemap:{[uid]:uid}});
 assert.equal(omitted.stores.meta.some(r=>r.key==='account:account_fixture'),false);
 const included=prepareRestoredCanonical({incoming:archive,current,mode:'merge',uidRemap:{[uid]:uid},accountChoices:{account_fixture:'INCLUDE_INACTIVE'}});
 const account=included.stores.meta.find(r=>r.key==='account:account_fixture').value.account;
 assert.equal(account.state,'VERIFICATION_PENDING');assert.equal(account.identity,null);assert.equal(account.revision,6);assert.equal(account.bindingVersion,4);
 assert.equal(account.restoredRemovalRevision,5);assert.deepEqual(JSON.parse(JSON.stringify(included.stores.meta.find(r=>r.key===removal.key).value)),removal);
 assert.doesNotThrow(()=>prepareRestoredCanonical({incoming:included,current:included,mode:'merge',uidRemap:{[uid]:uid},accountChoices:{account_fixture:'INCLUDE_INACTIVE'}}));
});
