// Developer acceptance inventory, never an execution/route authority.
// Each domain expands to individual state records. --check detects vocabulary
// drift in production owners and stale generated documentation.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {incidentDestination} from '../src/ui/faithful/attention.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const words=s=>s.split(' ');
const common={retry:'Bounded domain alarm; reread current canonical revisions before progression.',
 timeout:'An observation deadline never cancels a possibly dispatched effect.',
 cancellation:'Pause prevents new effects; retain ownership until independent settlement.',
 uncertainty:'Read-only reconciliation; no blind replay, reassignment or expired-lock stealing.'};
const domain=(id,files,states,handler,destination,action,prerequisites,settlement)=>({id,files,
 states:words(states),handler,destination,action,prerequisites,settlement});
export const domains=[
 domain('readiness',['native-transport-overlay','protected-readiness'],
 'COMPLETE RELEASED ARCHIVED PREPARING INVENTORY_PENDING PINNED IDLE WAITING_FOR_DONOR CHECKING_ACCOUNTS ACCOUNT_HELD OBSERVED FAILED DONOR_STARTING DONOR_SECURITY_UNAVAILABLE MULLVAD_LOCAL_SERVICE_UNAVAILABLE MULLVAD_HELPER_INCOMPATIBLE MULLVAD_TUNNEL_UNAVAILABLE MULLVAD_TUNNEL_ROUTE_UNAVAILABLE MULLVAD_PROXY_UNREACHABLE MULLVAD_CONNECTION_UNVERIFIED MULLVAD_ROUTE_UNCONFIRMED MULLVAD_STATUS_TIMEOUT',
 'src/runtime/protected-readiness.mjs#createProtectedReadinessCoordinator;src/runtime/enrollment.mjs#upkeep;src/runtime/overlay.mjs#createPcmsEnrollmentDonor','Accounts / Connection','Inspect shared helper; permit donor-owned readiness recovery and verify each affected account before admission.',
 'Donor initialized, compatible existing Mullvad bridge, tunnel and authenticated proxy; no Direct fallback or second router.',
 'Fresh per-account protected egress, historical unique-exit reservation and original identity; host ready alone is insufficient.'),
 domain('authority',['s06-standing-authority'],
 'PREPARING HYDRATING INACTIVE_NO_STANDING_GRANT EXPLICIT_OPERATOR_AUTHORITY POLICY_CHANGE_PENDING RESTORE_HOLD GIT_CONFIGURATION_CHANGED',
 'src/runtime/s06-standing-authority.mjs#state','Settings / Automation','Inspect standing authorization and repository; grant or revoke the intended scope once.',
 'Trusted operator choice, matching configured repository, hydrated valid current policy, no restore hold.',
 'Current effective scoped gate after durable readback; revoke prevents new effects immediately, possible prior effects remain owned.'),
 domain('inventory',['inventory','adoption','adoption-store','original-archive'],
 'OBSERVED_OWNER UNKNOWN STALE UNAVAILABLE PENDING VERIFIED ARCHIVED_GIT_CONFIRMED ALL COLLISION DEVELOPING HELD IDLE INVENTORY_PENDING MISSING_VERIFIED OWNED_VERIFIED PUBLISHED RESOLVED REVIEW ABORTED COMPLETED CONFIRMED PREPARED REJECTED',
 'src/runtime/inventory-boundary.mjs#syncAccount;src/runtime/adoption-boundary.mjs','Generators / Source inspection; Accounts','Synchronize current owned inventory; inspect exact original-source capture and association.',
 'Current protected original account identity, complete inventory and full source/owned asset enumeration; no ownership inference from slug.',
 'Fresh complete owner/count observation, exact local original snapshot plus independently verified pinned Git original; adoption does not change listing/source.'),
 domain('accounts',['accounts','enrollment'],
 'ARCHIVED COMPLETE HELD INVENTORY_PENDING LOGIN NOT_ARCHIVED OVERRIDDEN PREPARING REBIND_PENDING RELEASED RELEASE_DEFERRED RELEASE_UNCONFIRMED REMOVED_ONLY_LOCALLY START VERIFICATION_PENDING VERIFIED WAITING_LOGIN PINNED CHECKING PERSONA ROUTE IDENTITY',
 'src/runtime/enrollment.mjs#upkeep','Accounts','Inspect account; complete login, verify/repair route or reactivate in context.',
 'Original principal, dedicated Persona, donor protection, current dual-family unique exit; human login when requested.',
 'Fresh protected account identity, inventory and committed route pin; archived account remains inactive.'),
 domain('creation',['creation-effects','creation-intake','creation-runner','creation-git-runner','creation-batch','coordinator-store'],
 'ARCHIVED ABORTED ALL CANCELLED CONFIRMED HELD INGESTING INTAKE_COMPLETE INTAKE_HELD QUEUED REJECTED RESOLVED STAGED WORKING ADOPTION_ORIGINAL_PENDING ASSOCIATED_NOT_READY COLLISION CREATE_DISPATCH_POSSIBLE CREATE_OBSERVING CREATE_PREPARED CREATE_UNCERTAIN GIT_INIT_PENDING GIT_PREPARED GIT_DISPATCH_POSSIBLE GIT_OBSERVING GIT_UNCERTAIN MISSING_VERIFIED OWNED_VERIFIED OWNER_MISSING_VERIFIED OWNER_READBACK_PENDING PRIVATE_EMPTY_CONFIRMED RENAME_DISPATCH_POSSIBLE RENAME_OBSERVING RENAME_PREPARED RENAME_UNCERTAIN TARGET_COLLISION_HELD VERIFIED WAITING_CAPABILITY',
 'src/runtime/creation-runner.mjs#step','Generators / Work Queue','Inspect per-item owner/source and current account; resolve an actual pin/source conflict.',
 'Standing scoped intent, known counts, fresh protected account/owner, persisted effect intent; I17 quarantine excluded.',
 'Independent attributable owner, private-empty bytes, remote identity and conditional Git association.'),
 domain('ready',['ready-planner','ready-store'],
 'ACTIVE RETIRED ALL COMPLETED NEEDS_ACTION RUNNING WAITING QUEUED OPERATOR_PAUSED READY_REVOKED_NOT_READY',
 'src/runtime/ready-development.mjs#tick','Work Queue','Inspect pinned main declaration; Resume or reconcile source identity.',
 'Complete pinned main, coherent READY, current account/source claim and development authorization.',
 'Canonical current candidate handed to staging/AI once; superseded work retained.'),
 domain('ai',['ai-evidence','ai-store'],
 'PUBLICATION_UNCERTAIN PUBLISHING RECOVERY_HOLD ALL CHAT1_OBSERVED_IDLE CHAT2_OBSERVED_IDLE CHAT2_RESET_OBSERVED COMPLETED CONFIRMED_PUBLIC DISPATCH_POSSIBLE FRESH_OBSERVED FRESH_VERIFIED HELD_NO_PROGRESS HELD_RECONCILE HUMAN_OWNED KNOWN_FAILURE NEEDS_ACTION PENDING PENDING_NATIVE_SESSION PREPARED QUEUED RUNNING RUNNING_OBSERVED SOURCE_VERIFIED TESTS_UNVERIFIED TESTS_VERIFIED VERIFIED WAITING',
 'src/runtime/ai-boundary.mjs#tick','Work Queue / Development','Inspect results; Pause/Resume/Give instructions; adopt human edits or individual exceptional review when permitted.',
 'Hydrated current authorization, pinned prompts/tests/full source, one writer, observed native idle; genuine failures cannot be waived.',
 'Independent tests on exact final bytes and observed helper quiescence; no AI publication authority.'),
 domain('source',['staging-store','staging-core'],
 'CONFIRMED PROVIDER_CONFIRMED SOURCE_PENDING SAVED_UNVERIFIED PROVEN_CLEAN CONFIRMED_PUBLIC HANDOFF_REQUESTED HELD_UNCERTAIN HUMAN_OWNED PINNED SOURCE_VERIFIED VERIFIED PREPARED DISPATCH_POSSIBLE',
 'src/runtime/staging-boundary.mjs','Generators / Source inspection','Compare saved, previous-good and human source; adopt human changes or defer.',
 'Complete exact manifests, one canonical source writer, current binding and clean editor.',
 'Independent exact saved-byte readback; never overwrite unsaved edits.'),
 domain('publication',['release-core','release-store','existing-update-store'],
 'CHAT1_OBSERVED_IDLE CHAT2_OBSERVED_IDLE APPROVAL_REQUESTED APPROVED CANCELED CONFIRMED CONFIRMED_PUBLIC DEFERRED DISPATCH_POSSIBLE REQUESTED SLEEPING SOURCE_VERIFIED STAGE_CONFIRMED TESTS_VERIFIED VERIFIED PREPARED RESTORED_UNLISTED UNLIST_CONFIRMED PUBLICATION_UNCERTAIN RECOVERY_HOLD UNLIST_DISPATCH_POSSIBLE UNLIST_UNCERTAIN STAGE_DISPATCH_POSSIBLE STAGE_UNCERTAIN RECOVERY_UNLIST_DISPATCH_POSSIBLE RECOVERY_UNLIST_UNCERTAIN RECOVERY_UNLIST_CONFIRMED RESTORE_DISPATCH_POSSIBLE RESTORE_UNCERTAIN RESTORE_CONFIRMED',
 'src/runtime/s06-publication-progress.mjs#tick','Work Queue / Publication','Inspect exact candidate and tests, request changes or explicitly approve current candidate.',
 'Exact human approval, current full source/owner, independent tests, conditional Git, bounded public hold and one writer.',
 'Independent source and listing observation matches exact approved revision; previous-good preserved.'),
 domain('refresher',['refresher-core','refresher-effect-core'],
 'ABSENT_ONCE ACTIVE ATTEMPT_PENDING DISPATCH_POSSIBLE EFFECT_CONFIRMED EFFECT_UNVERIFIED HEALTHY INEFFECTIVE OUTAGE PRESENT RESERVED SLEEPING SUPPORTED_AND_VERIFIED UNKNOWN UNOBSERVED VISIBILITY_SUSPENDED WAITING',
 'src/runtime/refresher-boundary.mjs#tick','Refresher','Inspect coverage/source outcome; Enable/Pause policy or resolve affected account/source.',
 'Enabled policy, current protected owner/source, complete feed, eligible 24h/72h budget, no conflicting writer.',
 'Saved bytes and feed placement observed separately; unknown active intervals earn no credit.'),
 domain('backup',['portable-runner','backup-auto-core','backup-auto-run'],
 'AUTHENTICATED_INVENTORY_ONLY BROWSER_REPORTED_COMPLETE COMPLETE REMOVED DELETE_HELD DELETION_POSSIBLE DISABLED DISPATCH_POSSIBLE DOWNLOAD_STARTED FAILED HELD_UNCERTAIN INTERNAL_VERIFIED PREPARING RECOVERY_VERIFIED VERIFIED',
 'src/runtime/portable-runner.mjs','Settings / Backups','Inspect downloaded artifact; retry a proved no-dispatch export or reconcile saved download.',
 'Source-complete stable local snapshot, browser downloads/storage; no password, vault or extra native host.',
 'Manifest integrity and browser download readback; independent disk reopen is a separate evidence tier.'),
 domain('restore',['restore-boundary','../ui/restore-stage','../ui/restore-gate','../ui/restore-core'],
 'BEFORE_DISPATCH COMMIT_POSSIBLE COMPLETE_INACTIVE CREATE_REQUESTED DIRECT_REVIEW_REQUIRED MAPPING_ONLY_UNVERIFIED OBSERVED PREPARING GUARD_INSTALLED DISPATCH_POSSIBLE HELD_UNCERTAIN MAPPING_COLLISION MAPPING_REQUIRED CREATE_POSSIBLE PREPARED REVIEW_REQUIRED',
 'src/runtime/restore-boundary.mjs','Settings / Backups','Inspect restore, mapping and interruption receipt; resume observation, cancel before dispatch or explicitly activate after checks.',
 'Verified passwordless archive, inspected account selection/mapping, prior controller stopped, preserved exclusions/source.',
 'Independent donor/canonical reopen; restored work stays inactive until fresh owner/route and explicit activation.'),
 domain('git',['catalog-identity-review','catalog-watch','writeback-store'],
 'CREATE_SEPARATE_APPROVED RENAME_EXISTING_COMPLETED CANCELED CHAT1_OBSERVED_IDLE CHAT2_OBSERVED_IDLE CONFIRMED DISPATCH_POSSIBLE HELD_UNCERTAIN PREPARED SOURCE_VERIFIED TESTS_VERIFIED REVIEW_REQUIRED GIT_UNCONFIGURED GIT_CREDENTIAL_INACCESSIBLE GIT_TOKEN_REJECTED GIT_REPOSITORY_IDENTITY_MISMATCH GIT_NETWORK_UNAVAILABLE GIT_LOCAL_STORAGE_UNAVAILABLE GIT_FOLDER_MISSING',
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
 domain('legacy-supply',['supply-plan','supply-store'],
 'ABORTED DISPATCH_POSSIBLE HELD_UNCERTAIN OBSERVING PREPARED REJECTED FROZEN CREATE_PREPARED CREATE_DISPATCH_POSSIBLE CREATE_UNCERTAIN CREATE_OBSERVING CREATE_CONFIRMED RENAME_PREPARED RENAME_DISPATCH_POSSIBLE RENAME_UNCERTAIN RENAME_OBSERVING PROVIDER_CONFIRMED SOURCE_PENDING GIT_PREPARED GIT_DISPATCH_POSSIBLE GIT_UNCERTAIN GIT_OBSERVING CONFIRMED VERIFIED CREATE_PREFLIGHT_FAILED RENAME_PREFLIGHT_FAILED GIT_PREFLIGHT_FAILED',
 'src/runtime/operation-context.mjs#projectOperationContext','Work Queue / Operation','Read saved historical source and operation provenance. Prepare new authorized work only after current prerequisite inspection.',
 'Historical identity and possible-effect journal retained; no automatic CREATE/RENAME replay, including every I17 intake.',
 'Read-only independently attributable historical outcome; current capability recovery is a separate fact.'),
 domain('scheduler',[],
 'WAITING RUNNING HELD TIMED_OUT FAILED RECOVERING ARCHIVED RELEASED PINNED VERIFIED' ,
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
 const found=[...source.matchAll(/\b(?:state|status|phase)\s*(?:[:=]\s*|===?\s*|!==?\s*)['"]([A-Z][A-Z0-9_]+)['"]/g)].map(m=>m[1]);
 for(const match of source.matchAll(/\[([^\[\]]+)\]\.includes\([^)]*\b(?:state|status|phase)\b[^)]*\)/g))
  found.push(...[...match[1].matchAll(/['"]([A-Z][A-Z0-9_]+)['"]/g)].map(m=>m[1]));
 for(const match of source.matchAll(/(?:const (?:changes|allow)\s*=\s*\{([\s\S]*?)\n\s*\};|const (?:SAFE_STATE|phases|routeStatuses|upgradePhases)\s*=\s*new Set\(\[([\s\S]*?)\]\)|export const RELEASE_STATES=Object.freeze\(\[([\s\S]*?)\]\))/g))
  found.push(...[...(match[1]||match[2]||match[3]).matchAll(/['"]([A-Z][A-Z0-9_]+)['"]/g)].map(m=>m[1]));
 return [...new Set(found)].sort();
}
export const unmappedStates=(domain,source)=>extractStates(source).filter(s=>!domain.states.includes(s));
export async function inventory(){
 const states=[],drift=[];
 for(const d of domains){
  for(const file of d.files){
   const source=await readFile(path.join(root,'src/runtime',file+'.mjs'),'utf8');
   for(const state of unmappedStates(d,source))drift.push(d.id+':'+file+':'+state);
  }
  for(const state of d.states)states.push({domain:d.id,state,owner:d.files.length?d.files.map(f=>path.posix.normalize('src/runtime/'+f+'.mjs')):d.handler.split(';').map(f=>f.split('#')[0]),
   rootCause:/UNCERTAIN|[A-Z_]*POSSIBLE|RECONCILE/.test(state)?'A prior external effect may still complete; ACK or attributable observation is missing.':state==='HUMAN_OWNED'?'Human source ownership prevents a conflicting automation writer.':/PENDING|WAITING|PREPAR|QUEUED|INGESTING|PINNED/.test(state)?'Prerequisite, ownership or next durable progression checkpoint is pending.':/HELD|FAIL|OUTAGE|UNAVAILABLE|COLLISION|MISSING|REVIEW/.test(state)?'The authoritative scoped record records an unresolved failure or required operator choice; retain its first causal code.':'Observed domain checkpoint; revalidate current prerequisites before new work.',
   automaticHandler:d.handler,operatorAction:d.action,prerequisites:d.prerequisites,
   destination:d.destination,settlement:d.settlement,...common,
   safetyHold:d.id==='legacy-supply'?'Historical inspection only; never automatic replay of possible CREATE/RENAME.':/UNCERTAIN|[A-Z_]*POSSIBLE|RECONCILE/.test(state)?
    'Possible effect remains owned; observation only until attributable independent settlement.':
    state==='HUMAN_OWNED'?'Preserve human edits; no conflicting source actor.':null});
 }
 const sampleTarget=code=>({
  ROUTE_UNAVAILABLE:{kind:'ACCOUNT',id:'account_inventory_0001'},
  ACCOUNT_UNVERIFIED:{kind:'ACCOUNT',id:'account_inventory_0001'},
  SOURCE_HELD:{kind:'GENERATOR',id:'inventory-generator'},
  GIT_FOLDER_MISSING:{kind:'GENERATOR',id:'inventory-generator'},
  GIT_FOLDER_RENAME_REVIEW:{kind:'GENERATOR',id:'inventory-generator'},
  OPERATION_UNCERTAIN:{kind:'OPERATION',id:'operation_inventory_0001'},
  RESTORE_IN_PROGRESS:{kind:'SETTINGS',id:'backups'},
  BACKUP_FAILED:{kind:'SETTINGS',id:'backups'},
  GIT_RECONNECT_REQUIRED:{kind:'SETTINGS',id:'connections'},
  CANONICAL_UNAVAILABLE:{kind:'SETTINGS',id:'diagnostics'},
  PROVIDER_OUTAGE:{kind:'SETTINGS',id:'refresher'}
 }[code]);
 const notices=Object.entries(noticePolicies).flatMap(([code,[destination,action,settlement]])=>
  ['VALID','ABSENT','STALE'].flatMap(target=>['ACTIVE','REVIEWED','RESOLVED'].map(state=>({code,target,state,
   destination,action,settlement,
   currentDestination:incidentDestination({code,scopeId:'scope_inventory_0001',
    ...(target==='VALID'?{target:sampleTarget(code)}:target==='STALE'?{target:{kind:'GENERATOR',id:'invalid target'}}:{}),reviewed:state==='REVIEWED'}),
   knownCorrection:target!=='VALID'&&['SOURCE_HELD','CANONICAL_UNAVAILABLE','OPERATION_UNCERTAIN','GIT_FOLDER_MISSING','GIT_FOLDER_RENAME_REVIEW'].includes(code)?'GAP-03; F3 must replace the observed generic incident fallback with the required contextual recovery.':null,
   acknowledgment:'Review never resolves or suppresses an active safety hold.',
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
