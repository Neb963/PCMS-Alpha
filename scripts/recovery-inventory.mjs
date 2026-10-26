// Developer acceptance inventory, never an execution/route authority.
// Each domain expands to individual state records. --check detects vocabulary
// drift in production owners and stale generated documentation.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const words=s=>s.split(' ');
const common={retry:'Bounded domain alarm; reread current canonical revisions before progression.',
 timeout:'An observation deadline never cancels a possibly dispatched effect.',
 cancellation:'Pause prevents new effects; retain ownership until independent settlement.',
 uncertainty:'Read-only reconciliation; no blind replay, reassignment or expired-lock stealing.'};
const domain=(id,files,states,handler,destination,action,prerequisites,settlement)=>({id,files,
 states:words(states),handler,destination,action,prerequisites,settlement});
export const domains=[
 domain('accounts',['accounts','enrollment'],
 'ARCHIVED COMPLETE HELD INVENTORY_PENDING LOGIN NOT_ARCHIVED OVERRIDDEN PREPARING REBIND_PENDING RELEASED RELEASE_DEFERRED RELEASE_UNCONFIRMED REMOVED_ONLY_LOCALLY START VERIFICATION_PENDING VERIFIED WAITING_LOGIN PINNED CHECKING PERSONA ROUTE IDENTITY',
 'src/runtime/enrollment.mjs#upkeep','Accounts','Inspect account; complete login, verify/repair route or reactivate in context.',
 'Original principal, dedicated Persona, donor protection, current dual-family unique exit; human login when requested.',
 'Fresh protected account identity, inventory and committed route pin; archived account remains inactive.'),
 domain('creation',['creation-effects','creation-intake','creation-runner','creation-git-runner'],
 'ADOPTION_ORIGINAL_PENDING ASSOCIATED_NOT_READY COLLISION CREATE_DISPATCH_POSSIBLE CREATE_OBSERVING CREATE_PREPARED CREATE_UNCERTAIN GIT_INIT_PENDING GIT_PREPARED GIT_DISPATCH_POSSIBLE GIT_OBSERVING GIT_UNCERTAIN MISSING_VERIFIED OWNED_VERIFIED OWNER_MISSING_VERIFIED OWNER_READBACK_PENDING PRIVATE_EMPTY_CONFIRMED RENAME_DISPATCH_POSSIBLE RENAME_OBSERVING RENAME_PREPARED RENAME_UNCERTAIN TARGET_COLLISION_HELD VERIFIED WAITING_CAPABILITY',
 'src/runtime/creation-runner.mjs#step','Generators / Work Queue','Inspect per-item owner/source and current account; resolve an actual pin/source conflict.',
 'Standing scoped intent, known counts, fresh protected account/owner, persisted effect intent; I17 quarantine excluded.',
 'Independent attributable owner, private-empty bytes, remote identity and conditional Git association.'),
 domain('ready',['ready-planner','ready-store'],
 'ACTIVE RETIRED ALL COMPLETED NEEDS_ACTION RUNNING WAITING QUEUED OPERATOR_PAUSED READY_REVOKED_NOT_READY',
 'src/runtime/ready-development.mjs#tick','Work Queue','Inspect pinned main declaration; Resume or reconcile source identity.',
 'Complete pinned main, coherent READY, current account/source claim and development authorization.',
 'Canonical current candidate handed to staging/AI once; superseded work retained.'),
 domain('ai',['ai-evidence','ai-store'],
 'ALL CHAT1_OBSERVED_IDLE CHAT2_OBSERVED_IDLE CHAT2_RESET_OBSERVED COMPLETED CONFIRMED_PUBLIC DISPATCH_POSSIBLE FRESH_OBSERVED FRESH_VERIFIED HELD_NO_PROGRESS HELD_RECONCILE HUMAN_OWNED KNOWN_FAILURE NEEDS_ACTION PENDING PENDING_NATIVE_SESSION PREPARED QUEUED RUNNING RUNNING_OBSERVED SOURCE_VERIFIED TESTS_UNVERIFIED TESTS_VERIFIED VERIFIED WAITING',
 'src/runtime/ai-boundary.mjs#tick','Work Queue / Development','Inspect results; Pause/Resume/Give instructions; adopt human edits or individual exceptional review when permitted.',
 'Hydrated current authorization, pinned prompts/tests/full source, one writer, observed native idle; genuine failures cannot be waived.',
 'Independent tests on exact final bytes and observed helper quiescence; no AI publication authority.'),
 domain('source',['staging-store'],
 'CONFIRMED_PUBLIC HANDOFF_REQUESTED HELD_UNCERTAIN HUMAN_OWNED PINNED SOURCE_VERIFIED VERIFIED PREPARED DISPATCH_POSSIBLE',
 'src/runtime/staging-boundary.mjs','Generators / Source inspection','Compare saved, previous-good and human source; adopt human changes or defer.',
 'Complete exact manifests, one canonical source writer, current binding and clean editor.',
 'Independent exact saved-byte readback; never overwrite unsaved edits.'),
 domain('publication',['release-core','release-store','existing-update-store'],
 'APPROVAL_REQUESTED APPROVED CANCELED CONFIRMED CONFIRMED_PUBLIC DEFERRED DISPATCH_POSSIBLE REQUESTED SLEEPING SOURCE_VERIFIED STAGE_CONFIRMED TESTS_VERIFIED VERIFIED PREPARED RESTORED_UNLISTED UNLIST_CONFIRMED PUBLICATION_UNCERTAIN RECOVERY_HOLD',
 'src/runtime/s06-publication-progress.mjs#tick','Work Queue / Publication','Inspect exact candidate and tests, request changes or explicitly approve current candidate.',
 'Exact human approval, current full source/owner, independent tests, conditional Git, bounded public hold and one writer.',
 'Independent source and listing observation matches exact approved revision; previous-good preserved.'),
 domain('refresher',['refresher-core','refresher-effect-core'],
 'ABSENT_ONCE ACTIVE ATTEMPT_PENDING DISPATCH_POSSIBLE EFFECT_CONFIRMED EFFECT_UNVERIFIED HEALTHY INEFFECTIVE OUTAGE PRESENT RESERVED SLEEPING SUPPORTED_AND_VERIFIED UNKNOWN UNOBSERVED VISIBILITY_SUSPENDED WAITING',
 'src/runtime/refresher-boundary.mjs#tick','Refresher','Inspect coverage/source outcome; Enable/Pause policy or resolve affected account/source.',
 'Enabled policy, current protected owner/source, complete feed, eligible 24h/72h budget, no conflicting writer.',
 'Saved bytes and feed placement observed separately; unknown active intervals earn no credit.'),
 domain('backup',['portable-runner','backup-auto-core','backup-auto-run'],
 'AUTHENTICATED_INVENTORY_ONLY BROWSER_REPORTED_COMPLETE COMPLETE DELETE_HELD DELETION_POSSIBLE DISABLED DISPATCH_POSSIBLE DOWNLOAD_STARTED FAILED HELD_UNCERTAIN INTERNAL_VERIFIED PREPARING RECOVERY_VERIFIED VERIFIED',
 'src/runtime/portable-runner.mjs','Settings / Backups','Inspect downloaded artifact; retry a proved no-dispatch export or reconcile saved download.',
 'Source-complete stable local snapshot, browser downloads/storage; no password, vault or extra native host.',
 'Manifest integrity and browser download readback; independent disk reopen is a separate evidence tier.'),
 domain('restore',['restore-boundary'],
 'BEFORE_DISPATCH COMMIT_POSSIBLE COMPLETE_INACTIVE CREATE_REQUESTED DIRECT_REVIEW_REQUIRED MAPPING_ONLY_UNVERIFIED OBSERVED PREPARING',
 'src/runtime/restore-boundary.mjs','Settings / Backups','Inspect restore, mapping and interruption receipt; resume observation, cancel before dispatch or explicitly activate after checks.',
 'Verified passwordless archive, inspected account selection/mapping, prior controller stopped, preserved exclusions/source.',
 'Independent donor/canonical reopen; restored work stays inactive until fresh owner/route and explicit activation.'),
 domain('git',['catalog-identity-review','catalog-watch'],
 'REVIEW_REQUIRED GIT_UNCONFIGURED GIT_CREDENTIAL_INACCESSIBLE GIT_TOKEN_REJECTED GIT_REPOSITORY_IDENTITY_MISMATCH GIT_NETWORK_UNAVAILABLE GIT_LOCAL_STORAGE_UNAVAILABLE GIT_FOLDER_MISSING',
 'src/runtime/catalog-watch.mjs#tick','Settings / Connections; Work Queue / Source','Inspect pinned source/history, scan current main, resolve identity choice or reconnect only when required.',
 'Browser-local credential, configured repository identity, complete pinned main; remote absence never means provider deletion.',
 'Fresh complete main and credential/identity readback; conditional writes retain current-head guards.'),
 domain('native',['native-prepare-overlay'],
 'PREPARED DISPATCH_POSSIBLE',
 'src/runtime/native-prepare-overlay.mjs','Accounts / Connection','Inspect shared connection and pending preparation; wait for independent native settlement.',
 'PersonaMonkey sole native/route authority, durable preparation intent and no conflicting prepare.',
 'Correlated native ACK or independent authenticated preparation readback; timeout alone is not settlement.'),
 domain('operations',['operation-context'],
 'PREPARED READY_TO_DISPATCH PREFLIGHT_FAILED DISPATCH_POSSIBLE OBSERVING HELD_UNCERTAIN CONFIRMED ABORTED REJECTED',
 'src/runtime/operation-context.mjs#projectOperationContext','Work Queue / Operation','Read saved status/provenance; inspect current prerequisites for new authorized work only.',
 'Historical records are read-only; original I17 batch and slug never automatically CREATE/RENAME.',
 'Independent matching effect readback; recovered current capability does not resolve historical uncertainty.'),
 domain('scheduler',[],
 'WAITING RUNNING HELD TIMED_OUT FAILED RECOVERING',
 'src/runtime/catalog-watch.mjs;src/runtime/creation-watch.mjs;src/runtime/account-boundary.mjs','Attention / Contextual domain','Inspect last attempt/checkpoint; wake safe recovery without replaying effects.',
 'Current domain authority and canonical effect ownership; independent scopes remain runnable.',
 'Durable redacted receipt identifies last attempt/success/failure and next safe retry.')
];
export const noticePolicies={
 ROUTE_UNAVAILABLE:['Accounts','Verify affected protected route; shared helper check when causally applicable.','Fresh account-specific route/identity pin'],
 ACCOUNT_UNVERIFIED:['Accounts','Complete login or confirm original identity.','Fresh original principal and owned inventory'],
 SOURCE_HELD:['Generators / Source','Compare exact source/history; adopt human changes or defer.','Current full source and writer settlement'],
 RESTORE_IN_PROGRESS:['Settings / Backups','Inspect/resume interrupted restore; retain inactive safety hold.','Donor/canonical readback and explicit verified activation'],
 CANONICAL_UNAVAILABLE:['Settings / Diagnostics','Check browser-local storage; preserve effects until storage reopens.','Successful canonical reopen and pending-effect reconciliation'],
 OPERATION_UNCERTAIN:['Work Queue / Operation','Read-only saved-status reconciliation; no replay.','Attributable independent outcome; otherwise explicit hold'],
 PROVIDER_OUTAGE:['Refresher / affected account','Inspect provider/feed and affected account; retain source/route holds.','Fresh protected provider/feed observation'],
 BACKUP_FAILED:['Settings / Backups','Inspect export status/download and retry only a known-safe step.','Manifest and download observation'],
 GIT_RECONNECT_REQUIRED:['Settings / Connections','Inspect actual Git cause; reconnect only invalid/missing credential.','Fresh complete main and repository identity'],
 GIT_FOLDER_MISSING:['Work Queue / Source','Inspect history/current source and scan main; preserve live generator.','Complete main reappearance or explicit source identity decision'],
 GIT_FOLDER_RENAME_REVIEW:['Work Queue / Identity','Inspect old/new source; choose distinct creation or verified rename.','Canonical explicit identity choice and independent readback']
};
export function extractStates(source){
 return [...new Set([...source.matchAll(/\b(?:state|status|phase)\s*(?:[:=]\s*|===?\s*|!==?\s*)['"]([A-Z][A-Z0-9_]+)['"]/g)].map(m=>m[1]))].sort();
}
export async function inventory(){
 const states=[],drift=[];
 for(const d of domains){
  for(const file of d.files){
   const source=await readFile(path.join(root,'src/runtime',file+'.mjs'),'utf8');
   for(const state of extractStates(source))if(!d.states.includes(state))drift.push(d.id+':'+file+':'+state);
  }
  for(const state of d.states)states.push({domain:d.id,state,owner:d.files.map(f=>'src/runtime/'+f+'.mjs'),
   rootCause:'Inspect authoritative '+d.id+' record and first causal failure; state alone is not a diagnosis.',
   automaticHandler:d.handler,operatorAction:d.action,prerequisites:d.prerequisites,
   destination:d.destination,settlement:d.settlement,...common,
   safetyHold:/UNCERTAIN|DISPATCH_POSSIBLE|COMMIT_POSSIBLE|RECONCILE/.test(state)?
    'Possible effect remains owned; observation only until attributable independent settlement.':
    state==='HUMAN_OWNED'?'Preserve human edits; no conflicting source actor.':null});
 }
 const notices=Object.entries(noticePolicies).flatMap(([code,[destination,action,settlement]])=>
  ['VALID','ABSENT','STALE'].flatMap(target=>['ACTIVE','REVIEWED','RESOLVED'].map(state=>({code,target,state,
   destination,action,settlement,acknowledgment:'Review never resolves or suppresses an active safety hold.',
   fallback:'Use typed domain context when target is missing/stale; never an unrelated empty queue search.'}))));
 return {schema:1,source:'Production state owners + explicit accepted state/notice policies',drift,states,notices,
  historicalQuarantine:{batch:'batch_e2c328e54f9c4a6ab89f1084134fde52',slug:'pcms-test-esr-chain-20261015-a01',
   action:'READ_ONLY_CURRENT_PREREQUISITE_INSPECTION',automaticCreate:false,automaticRename:false,replay:false}};
}
export async function main(check=false){
 const out=await inventory();
 if(out.drift.length)throw Error('UNMAPPED_RECOVERY_STATE: '+out.drift.join(','));
 const file=path.join(root,'docs/verification/F0-RECOVERY-INVENTORY.json'),bytes=JSON.stringify(out,null,2)+'\n';
 if(check){if(await readFile(file,'utf8')!==bytes)throw Error('RECOVERY_INVENTORY_STALE');}
 else await writeFile(file,bytes);
 console.log(`${out.states.length} states; ${out.notices.length} notice/target/current-state cases; zero unmapped production literals`);
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))
 main(process.argv.includes('--check')).catch(e=>{console.error(e.message);process.exitCode=1;});
