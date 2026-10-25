import {restoredTargetBindings} from './restore-identities.mjs';
import {donorPreparationReceipt,observeDonorPreparation,checkpointCanonicalBaseline,donorBaselineReceipt,observeDonorBaseline,restoredAutomationHistory,canonicalWithAutomationHistory} from './restore-observation.mjs';
import {collectPortableLocal,splitPortableLocal,preparePortableLocalRestore} from './portable-local.mjs';
// I16: one guarded local restore command. A resume NEVER redispatches a step.
// No provider/API calls or fresh-controller activation. Source/checkpoint secrets
// exist only in the caller's live extension port and this invocation.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {snapshotCanonical,snapshotCanonicalV2,digest,MAX_ARCHIVE_BYTES} from './backup-core.mjs';
import {readPortableStage} from './portable-restore-stage.mjs';
import {inspectPortableRestore,verifyPortableCheckpoint} from './portable-restore-plan.mjs';
import {createPortableBackupPayload,decodeBackupEnvelope} from '../lib/backup-package.js';
import {filterOrdinaryAutomationJobs} from '../lib/automation-history.js';
import {previewRestore,verifyCheckpoint,validateRestoreTransport,stableRestoreDonorCut} from './restore-core.mjs';
import {createRestoreGate} from './restore-gate.mjs';
import {createRestoreStageEngine} from './restore-stage.mjs';
import {prepareRestoredCanonical} from './restore-sanitize.mjs';
import {applyCanonicalSnapshot} from './restore-idb.mjs';
import {getPcmsRestoreDonor} from './restore-donor.mjs';
import {BLOCK_ROUTE_ID} from '../lib/constants.js';
import {settlePcmsWork} from './work-checkpoint.mjs';
import {autoBackup} from './backup-auto-boundary.mjs';
import {reconcileRestore} from './restore-reconcile.mjs';
export const RESTORE_PORT='pcms-i16-restore';
export const REACTIVATE_CONSENT='THE PREVIOUS PCMS INSTALLATION IS STOPPED';
const fail=code=>({ok:false,code});
const redacted=e=>/^(RESTORE_|BACKUP_)[A-Z0-9_]{3,70}$/.test(e?.message||'')?e.message:'RESTORE_HELD_UNKNOWN';
const hex=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const assert=(value,code)=>{if(!value)throw Error(code);};
const createKey=(epoch,i)=>'PCMS Restore '+epoch.slice(8,20)+' '+String(i).padStart(3,'0');

export function trustedRestoreSender(api,sender){
  // Reuse the exercised I02/I15 extension-page sender authority instead of
  // inventing a second Firefox-specific URL/fragment interpretation.
  if(!trustedExtensionPage(api,sender))return false;
  try {
    return new URL(sender.url).pathname===
      new URL(api.runtime.getURL('pcms/index.html')).pathname;
  }catch{return false;}
}
async function readPortable(api,donor,snapshot){
  const stored=await api.storage.local.get(null),extras=Object.create(null);
  for(const [k,v] of Object.entries(stored||{}))
    if(k==='automationJobs'||k.startsWith('gm-values:'))extras[k]=v;
  const args={state:snapshot.state,containers:snapshot.containers,
    userscriptData:extras,selection:{kind:'full'},
    automationHistory:filterOrdinaryAutomationJobs(Object.values(extras.automationJobs||{}))};
  const initial=createPortableBackupPayload(args),cookies=Object.create(null);
  for(const p of initial.personas){
    const rows=await donor.cookies(p.sourceId);
    assert(Array.isArray(rows),'RESTORE_COOKIE_READ_UNAVAILABLE');
    cookies[p.sourceId]=rows;
  }
  return createPortableBackupPayload({...args,cookiesByProfile:cookies});
}
async function destination(api,donor){
  const snap=await donor.snapshot();
  assert(snap?.state&&Array.isArray(snap.containers),'RESTORE_DONOR_UNAVAILABLE');
  const db=await openCanonicalDatabase();
  let pcms;
  try{pcms=await snapshotCanonical(db);}finally{db.close();}
  return {snap:stableRestoreDonorCut(snap),pcms,
    portable:await readPortable(api,donor,snap)};
}
function mappingFromContainers(payload,requested,containers,epoch,{allowCreate=false}={}){
  const map=Object.create(null),used=new Set();
  for(const [i,p] of (payload.personas||[]).entries()){
    const choice=requested[p.key];
    if(choice==='__create__'){
      const named=createKey(epoch,i);
      const matches=containers.filter(c=>c?.name===named&&c.cookieStoreId);
      assert(matches.length<=1,'RESTORE_NEW_CONTAINER_AMBIGUOUS');
      assert(matches.length===1||allowCreate,'RESTORE_CONTAINER_NOT_OBSERVED');
      if(matches.length===1){
        assert(!used.has(matches[0].cookieStoreId),'RESTORE_MAPPING_COLLISION');
        used.add(matches[0].cookieStoreId);map[p.key]=matches[0].cookieStoreId;
      }
    }else{
      assert(typeof choice==='string'&&containers.some(c=>c.cookieStoreId===choice),
        'RESTORE_MAPPING_UNVERIFIED');
      assert(!used.has(choice),'RESTORE_MAPPING_COLLISION');
      used.add(choice);map[p.key]=choice;
    }
  }
  return map;
}
function uidMap(sourcePersonas){
  const map=Object.create(null),used=new Set();
  for(const p of sourcePersonas||[]){
    if(!p.sourceUid)continue;
    assert(typeof p.targetUid==='string'&&!used.has(p.targetUid),'RESTORE_UID_MAPPING_COLLISION');
    used.add(p.targetUid);map[p.sourceUid]=p.targetUid;
  }
  return map;
}
function cookieMatch(expected,actual){
  const safe=c=>JSON.stringify([c.name,c.value,c.domain,c.path||'/',c.secure===true,
    c.httpOnly===true,c.firstPartyDomain||'',c.partitionKey||null]);
  const got=new Set(actual.map(safe));
  return expected.every(item=>got.has(safe(item)));
}
export function createRestoreBoundary(api,{getDonor=getPcmsRestoreDonor,
  database=openCanonicalDatabase,backupRunner=autoBackup?.runner,settle=settlePcmsWork}={}){
  const gate=createRestoreGate(api.storage.local);
  let running=null,registered=false;
  // Static PCMS listeners can become ready before PersonaMonkey's guarded
  // recovery-bootstrap dynamic background import. Wake that pinned read-only
  // donor service, then await its actual adapter attachment. Never construct a
  // donor surrogate, create an identity or bypass the donor bootstrap.
  async function donorReady(){
    try{return getDonor()}catch(e){
      if(e?.message!=='RESTORE_DONOR_UNAVAILABLE')throw e;
    }
    try{await api.runtime.sendMessage({type:'GET_SNAPSHOT'})}catch{}
    for(let attempt=0;attempt<30;attempt++){
      try{return getDonor()}catch(e){
        if(e?.message!=='RESTORE_DONOR_UNAVAILABLE')throw e;
      }
      await new Promise(resolve=>setTimeout(resolve,150));
    }
    throw Error('RESTORE_DONOR_UNAVAILABLE');
  }
  async function status(){
    const result=await gate.inspect();
    const held=result.held?await gate.read():null;
    const recovery=held?.recovery;
    const portableScopes=typeof recovery?.portableStageScope==='string'&&
      typeof recovery?.portableCheckpointScope==='string'?
      {stageScope:recovery.portableStageScope,
        checkpointScope:recovery.portableCheckpointScope}:null;
    return {ok:true,...result,portableScopes,preparation:held?.status==='PREPARING'?{
      epoch:held.epoch,revision:held.revision,stageScope:held.stageScope}:null,
      providerEffects:'OFF',remoteActivation:'OFF'};
  }
  // Shared durable I16 stage engine for both authenticated v1 and native v2.
  // Possible donor/cookie/canonical effects are never automatically replayed.
  async function applyGuardedGroups({db,donor,baseline,intent,req,payload,
    incomingPcms,mode,fresh=false,accountChoices={},v2=false,incomingLocal=null,continuing=false}){
        let mappings=null,preparedDonor=null,remaps=null,preparedCanonical=null;
        const session={epoch:intent.epoch,revision:intent.revision};
        const recovered=intent.donorPreparation;
        if(recovered?.status==='COMMIT_POSSIBLE'){
          assert(await observeDonorPreparation(recovered,await donor.snapshot()),'RESTORE_DONOR_READBACK_PENDING');
          mappings=recovered.mappings;remaps=uidMap(recovered.sourcePersonas);
          const observed=await donor.snapshot();
          preparedDonor={sourcePersonas:recovered.sourcePersonas,scriptMap:recovered.scriptMap,
            workflowMap:recovered.workflowMap,candidate:observed.state};
        }
        async function step(group,operation,dispatch,readback){
          const fingerprint=await digest(JSON.stringify(operation));
          const engine=createRestoreStageEngine(gate,{
            dispatch:async()=>{await dispatch();},
            readback:async()=>readback(fingerprint)
          });
          let saved=await gate.read(),outcome;
          assert(saved?.epoch===session.epoch,'RESTORE_STALE_GUARD');
          session.revision=saved.revision;
          const previous=saved.groups[group];
          if(previous){
            assert(continuing&&saved.protocol===2&&previous.fingerprint===fingerprint,'RESTORE_RECOVERY_FINGERPRINT_MISMATCH');
            if(previous.status==='OBSERVED'){
              const proof=await readback(fingerprint);
              assert(proof?.source==='INDEPENDENT_READBACK'&&proof.digest===fingerprint,'RESTORE_OBSERVED_GROUP_CHANGED');
              return saved;
            }
            if(['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(previous.status)){
              // A donor group can be interrupted during container creation or
              // pure preparation. Its separate COMMIT_POSSIBLE WAL decides
              // whether any donor commit may still be issued.
              if(group==='donor-personas'&&saved.donorPreparation?.status!=='COMMIT_POSSIBLE')await dispatch();
              saved=await gate.read();
              outcome=await engine.reconcile({epoch:session.epoch,revision:saved.revision,group,step:group,fingerprint});
            }else outcome=await engine.execute({epoch:session.epoch,revision:session.revision,
              group,step:group,fingerprint,continuePrepared:true});
          }else outcome=await engine.execute({epoch:session.epoch,revision:session.revision,
            group,step:group,fingerprint});
          session.revision=outcome.revision;
          assert(outcome.groups[group]?.status==='OBSERVED',
            'RESTORE_PARTIAL_HELD');
          return outcome;
        }
        await step('donor-personas',{payload:await digest(JSON.stringify(payload)),
          mappings:req,mode:mode},async()=>{
          let containers=await donor.containers();
          for(const [i,p] of (payload.personas||[]).entries()){
            if(req[p.key]!=='__create__')continue;
            const name=createKey(intent.epoch,i),prior=await gate.read();
            const matches=containers.filter(c=>c.name===name);
            assert(matches.length<=1,'RESTORE_NEW_CONTAINER_AMBIGUOUS');
            if(prior.createdContainers?.[p.key]){
              assert(matches.length===1&&matches[0].cookieStoreId===prior.createdContainers[p.key],
                'RESTORE_CONTAINER_RECEIPT_MISMATCH');continue;
            }
            let made=matches[0];
            if(prior.protocol===2){
              if(prior.containerIntents?.[p.key])assert(made,'RESTORE_CONTAINER_OUTCOME_UNCERTAIN');
              else{
                assert(!made,'RESTORE_CONTAINER_ALREADY_EXISTS');
                await gate.prepareContainer({epoch:intent.epoch,revision:prior.revision,personaKey:p.key,name});
                made=await donor.createContainer({name,color:p.color||'blue',icon:p.icon||'fingerprint'});
              }
            }else{
              assert(!made,'RESTORE_CONTAINER_ALREADY_EXISTS');
              made=await donor.createContainer({name,color:p.color||'blue',icon:p.icon||'fingerprint'});
            }
            assert(made?.cookieStoreId,'RESTORE_CONTEXT_RESULT_UNKNOWN');
            containers=await donor.containers();
            assert(containers.some(c=>c.cookieStoreId===made.cookieStoreId&&c.name===name),'RESTORE_CONTEXT_READBACK_FAILED');
            const snapshot=await gate.read();
            await gate.recordContainer({epoch:intent.epoch,revision:snapshot.revision,
              personaKey:p.key,cookieStoreId:made.cookieStoreId});
          }
          mappings=mappingFromContainers(payload,req,containers,intent.epoch);
          preparedDonor=await donor.prepare({payload,mappings,mode,regeneratePersonaUids:fresh});
          remaps=uidMap(preparedDonor.sourcePersonas);
          let held=await gate.read();
          if(held.protocol===2){
            const receipt=await donorPreparationReceipt(preparedDonor,baseline.snap,mappings);
            held=await gate.donorReceipt({epoch:held.epoch,revision:held.revision,receipt});
            await gate.donorReceipt({epoch:held.epoch,revision:held.revision,commitPossible:true});
          }
          await donor.commit(preparedDonor.candidate);
        },async fp=>{
          if(!preparedDonor||!mappings)return {source:'INDEPENDENT_READBACK',digest:'0'.repeat(64)};
          const now=await donor.snapshot();
          const receipt=(await gate.read())?.donorPreparation;
          if(receipt)return {source:'INDEPENDENT_READBACK',digest:await observeDonorPreparation(receipt,now)?fp:'0'.repeat(64)};
          const personasVerified=preparedDonor.sourcePersonas.every(p=>{
            const row=now.state.profiles?.[p.containerId];
            return row?.personaUid===p.targetUid&&row?.routeId===BLOCK_ROUTE_ID&&
              row?.killSwitch===true&&row.blockLocalNetwork===true&&row.managed===true;
          });
          // An acknowledged donor commit does not prove source was persisted.
          // Compare each imported script and workflow including source text.
          const scriptsVerified=Object.values(preparedDonor.scriptMap||{})
            .every(id=>same(now.state.scripts?.[id],preparedDonor.candidate.scripts?.[id]));
          const workflowsVerified=Object.values(preparedDonor.workflowMap||{})
            .every(id=>same(now.state.workflows?.[id],preparedDonor.candidate.workflows?.[id]));
          const untouchedPreserved=Object.entries(baseline.snap.state.profiles||{})
            .filter(([id])=>!Object.values(mappings).includes(id))
            .every(([id,p])=>same(now.state.profiles?.[id],p));
          const policyPreserved=same(now.state.global,baseline.snap.state.global)&&
            same(now.state.routes,baseline.snap.state.routes);
          const valid=personasVerified&&scriptsVerified&&workflowsVerified&&
            untouchedPreserved&&policyPreserved;
          return {source:'INDEPENDENT_READBACK',digest:valid?fp:'0'.repeat(64)};
        });
        await step('donor-cookies',{cookies:await digest(JSON.stringify(payload.cookies||{})),
          mappings},async()=>{
          for(const [key,records] of Object.entries(payload.cookies||{})){
            const id=mappings[key];
            assert(id&&Array.isArray(records),'RESTORE_COOKIE_MAPPING_MISSING');
            const outcome=await donor.importCookies(id,records);
            assert(outcome?.failed===0,'RESTORE_COOKIE_PARTIAL');
          }
        },async fp=>{
          for(const [key,records] of Object.entries(payload.cookies||{})){
            const list=await donor.cookies(mappings[key]);
            if(!cookieMatch(records,list))
              return {source:'INDEPENDENT_READBACK',digest:'0'.repeat(64)};
          }
          return {source:'INDEPENDENT_READBACK',digest:fp};
        });
        const gm=Object.create(null);
        for(const [key,items] of Object.entries(payload.gmValues||{})){
          const source=payload.scripts?.find(s=>s.key===key);
          const mappedId=preparedDonor?.scriptMap?.[key];
          const mapped=mappedId?preparedDonor.candidate.scripts?.[mappedId]:null;
          // Ambiguous script names are not authoritative Git/GM identifiers.
          if(source&&mapped&&mapped.id===mappedId)
            gm['gm-values:'+mapped.id]=items;
          else throw Error('RESTORE_GM_MAPPING_UNVERIFIED');
        }
        const localPatch=preparePortableLocalRestore(incomingLocal,baseline.local||{}, {mode,uidRemap:remaps});
        const history=await restoredAutomationHistory(payload,preparedDonor,intent.epoch,intent.startedAt);
        const portableValues={...gm,...localPatch};
        const portableOperation={gm:await digest(JSON.stringify(gm)),
          ...(incomingLocal!==null?{local:await digest(JSON.stringify(localPatch))}:{})};
        await step('donor-portable',portableOperation,
          async()=>{
            if(Object.keys(portableValues).length)await api.storage.local.set(portableValues);
          },
          async fp=>{
            const got=await api.storage.local.get(Object.keys(portableValues));
            return {source:'INDEPENDENT_READBACK',
              digest:Object.keys(portableValues).every(k=>same(got[k],portableValues[k]))?fp:'0'.repeat(64)};
          });
        preparedCanonical=prepareRestoredCanonical({incoming:canonicalWithAutomationHistory(incomingPcms,history,intent.epoch),
          current:baseline.pcms,mode,uidRemap:remaps,targetBindings:restoredTargetBindings(preparedDonor.sourcePersonas),fresh,accountChoices});
        await step('pcms-canonical',{pcms:await digest(JSON.stringify(preparedCanonical))},
          async()=>applyCanonicalSnapshot(db,preparedCanonical,{
            assertHeld:async()=>(await gate.inspect()).held===true,
            expectedBefore:baseline.pcms}),
          async fp=>{
            // V2 may exceed the v1 64 MiB archive cap. Verify the entire
            // committed canonical source without reimposing the v1 limit.
            const got=v2?await snapshotCanonicalV2(db,{serializedValues:true}):
              await snapshotCanonical(db);
            return {source:'INDEPENDENT_READBACK',
              digest:same(got,preparedCanonical)?fp:'0'.repeat(64)};
          });
    return {ok:true};
  }

  async function apply(args){
    if(running)return fail('RESTORE_BUSY');
    // All effects remain disabled until human plan review and actual file proof.
    running=(async()=>{
      let db=null;
      try{
        const admitted=validateRestoreTransport(args);
        assert(admitted.ok,admitted.code);
        assert(await gate.read()===null,'RESTORE_ALREADY_HELD');
        const donor=await donorReady(),baseline=await destination(api,donor);
        const req=args.mappings||{};
        const reviewed=await previewRestore({archiveText:args.archiveText,password:args.password,
          decodeDonor:decodeBackupEnvelope,mode:args.mode,fresh:args.fresh===true,
          mappings:req,currentPcms:baseline.pcms,currentDonor:baseline.snap,
          currentPortable:baseline.portable,containers:baseline.snap.containers});
        if(reviewed.planSha256!==args.reviewedPlanSha256){
          // Trusted same-XPI diagnostic: only irreversible digests, never
          // source, Persona identifiers, cookies, route data or decrypted bytes.
          const plan=reviewed.plan;
          return {ok:false,code:'RESTORE_PLAN_CHANGED',diagnostic:{
            actualPlanSha256:reviewed.planSha256,
            archiveSha256:plan.archiveSha256,
            sourceSha256:plan.sourceSha256,
            destinationSha256:plan.destinationSha256,
            groupsSha256:await digest(JSON.stringify(plan.groups)),
            riskSha256:await digest(JSON.stringify(plan.risk)),
            canonicalStoreCounts:Object.fromEntries(Object.entries(baseline.pcms.stores)
              .map(([name,rows])=>[name,rows.length])),
            pcmsSha256:await digest(JSON.stringify(baseline.pcms)),
            donorSha256:await digest(JSON.stringify(baseline.snap)),
            portableSha256:await digest(JSON.stringify(baseline.portable))}};
        }
        assert(Object.keys(req).length===reviewed.opened.donor.personas.length,
          'RESTORE_MAPPING_INCOMPLETE');
        assert(!reviewed.plan.groups.some(g=>g.status==='DIRECT_REVIEW_REQUIRED'),
          'RESTORE_DIRECT_REVIEW_REQUIRED');
        assert(reviewed.plan.groups.every(g=>g.status==='MAPPING_ONLY_UNVERIFIED'||
          g.status==='CREATE_REQUESTED'),'RESTORE_MAPPING_UNVERIFIED');
        const checkpoint=await verifyCheckpoint({checkpointText:args.checkpointText,
          password:args.password,decodeDonor:decodeBackupEnvelope,
          currentPcms:baseline.pcms,currentPortable:baseline.portable,
          archivedAtLeastTier:3});
        // Re-read destination before the external independent hold. Neither
        // snapshot nor browser file selection alone grants a mutation token.
        const latest=await destination(api,donor);
        assert(same(latest,baseline),'RESTORE_DESTINATION_DRIFT');
        const intent=await gate.begin({planSha256:reviewed.planSha256,
          archiveSha256:reviewed.plan.archiveSha256,
          destinationSha256:reviewed.plan.destinationSha256,
          checkpointSha256:checkpoint.sha256,reviewedPlanSha256:args.reviewedPlanSha256,
          checkpointTier:checkpoint.tier,fresh:args.fresh===true,
          recovery:{mode:args.mode,mappings:req}});
        // Once guard is written/read back, any crash or failed adapter leaves
        // the controller inactive. No automatic retry or rollback.
        const afterGuard=await destination(api,donor);
        assert(same(afterGuard,baseline),'RESTORE_DESTINATION_CHANGED_AFTER_GUARD');
        const incoming=reviewed.opened, payload=incoming.donor;
        db=await database();
        await applyGuardedGroups({db,donor,baseline,intent,req,
          payload:incoming.donor,incomingPcms:incoming.archive.pcms,
          mode:args.mode});
        return {...(await status()),ok:true,code:'RESTORED_INACTIVE_REVIEW_REQUIRED',
          dataRecovered:true,ownerSessionsVerified:false,
          protectedRoutesVerified:false,predecessorProvenOff:false};
      }catch(e){return fail(redacted(e));}
      finally{try{db?.close();}catch{}}
    })().finally(()=>{running=null;});
    return running;
  }

  // A02 source-complete portable restore: only trusted PCMS extension pages
  // may pass disposable stage IDs. No raw archive, token, password or cookie
  // arrays cross the background port, and no native PCMS host is consulted.
  async function destinationPortable(donor){
    const snap=await donor.snapshot();
    assert(snap?.state&&Array.isArray(snap.containers),'RESTORE_DONOR_UNAVAILABLE');
    const db=await database();
    let pcms;try{pcms=await snapshotCanonicalV2(db,{serializedValues:true});}
    finally{db.close();}
    return {snap:stableRestoreDonorCut(snap),pcms,
      portable:await readPortable(api,donor,snap),
      local:collectPortableLocal(await api.storage.local.get(null))};
  }
  const validScope=s=>typeof s==='string'&&/^portable_[a-f0-9]{32}$/.test(s);
  const validMappings=m=>m&&typeof m==='object'&&!Array.isArray(m)&&
    Object.entries(m).length<=10000&&Object.entries(m).every(([k,v])=>
      k.length>0&&k.length<=256&&typeof v==='string'&&v.length<=256);
  async function preparePortable(args){
    if(running)return fail('RESTORE_BUSY');
    running=(async()=>{
      try{
        assert(validScope(args?.stageScope),'RESTORE_PREPARATION_INVALID');
        const incoming=await readPortableStage(args.stageScope);
        let held=await gate.read();
        if(held)assert(held.status==='PREPARING'&&held.stageScope===args.stageScope&&
          held.archiveSha256===incoming.receipt.chain,'RESTORE_ALREADY_HELD');
        else held=await gate.prepare({stageScope:args.stageScope,archiveSha256:incoming.receipt.chain});
        await settle();
        return {...await status(),ok:true,code:'RESTORE_PREPARED'};
      }catch(e){return fail(redacted(e))}
    })().finally(()=>{running=null});
    return running;
  }
  async function checkpointPortable(args){
    if(running)return fail('RESTORE_BUSY');
    running=(async()=>{
      try{
        const held=await gate.read();
        assert(held?.status==='PREPARING'&&held.epoch===args?.epoch&&
          held.revision===args?.revision&&held.stageScope===args?.stageScope,
          'RESTORE_STALE_PREPARATION');
        await settle();
        assert(backupRunner?.checkpoint,'RESTORE_BACKUP_UNAVAILABLE');
        const result=await backupRunner.checkpoint(args);
        return {...result,preparation:{epoch:held.epoch,revision:held.revision,stageScope:held.stageScope}};
      }catch(e){return fail(redacted(e))}
    })().finally(()=>{running=null});
    return running;
  }
  async function applyPortable(args){
    if(running)return fail('RESTORE_BUSY');
    running=(async()=>{
      let db=null;
      try{
        assert(args&&typeof args==='object'&&!Array.isArray(args)&&
          validScope(args.stageScope)&&validScope(args.checkpointScope)&&
          args.stageScope!==args.checkpointScope&&
          ['merge','replace'].includes(args.mode)&&
          typeof args.fresh==='boolean'&&validMappings(args.mappings)&&
          args.accountChoices&&typeof args.accountChoices==='object'&&
          !Array.isArray(args.accountChoices)&&
          Object.entries(args.accountChoices).length<=10000&&
          Object.entries(args.accountChoices).every(([id,choice])=>
            typeof id==='string'&&id.length>0&&id.length<=256&&
            ['INCLUDE_INACTIVE','EXCLUDE'].includes(choice))&&
          hex(args.reviewedPlanSha256),'RESTORE_PORTABLE_INPUT_INVALID');
        const preparation=await gate.read();
        if(preparation){
          assert(preparation.status==='PREPARING'&&preparation.epoch===args.preparation?.epoch&&
            preparation.revision===args.preparation?.revision&&preparation.stageScope===args.stageScope,
            'RESTORE_STALE_PREPARATION');
          await settle();
        }else assert(!args.preparation,'RESTORE_STALE_PREPARATION');
        const incoming=await readPortableStage(args.stageScope);
        const checkpoint=await readPortableStage(args.checkpointScope);
        const donor=await donorReady();
        const baseline=await destinationPortable(donor);
        const reviewed=await inspectPortableRestore({
          incoming,mode:args.mode,fresh:args.fresh,
          mappings:args.mappings,accountChoices:args.accountChoices,
          currentPcms:baseline.pcms,
          currentDonor:baseline.snap,currentPortable:baseline.portable,currentLocal:baseline.local,
          containers:baseline.snap.containers});
        assert(reviewed.planSha256===args.reviewedPlanSha256,
          'RESTORE_PLAN_CHANGED');
        assert(reviewed.plan.risk.accountDecisionsMissing===0&&
          Object.keys(args.mappings).length===incoming.donor.personas.length&&
          !reviewed.plan.groups.some(g=>g.status==='DIRECT_REVIEW_REQUIRED')&&
          reviewed.plan.groups.every(g=>['MAPPING_ONLY_UNVERIFIED',
            'CREATE_REQUESTED'].includes(g.status)),
          'RESTORE_MAPPING_UNVERIFIED');
        const checked=await verifyPortableCheckpoint({
          checkpoint,currentPcms:baseline.pcms,currentPortable:baseline.portable,currentLocal:baseline.local});
        const incomingLocal=splitPortableLocal(incoming.canonical).values;
        preparePortableLocalRestore(incomingLocal,baseline.local,{mode:args.mode});
        const later=await destinationPortable(donor);
        assert(same(later,baseline),'RESTORE_DESTINATION_DRIFT');
        const intent=await gate.begin({
          planSha256:reviewed.planSha256,
          archiveSha256:incoming.receipt.chain,
          destinationSha256:reviewed.plan.destinationSha256,
          checkpointSha256:checked.sha256,
          reviewedPlanSha256:args.reviewedPlanSha256,
          checkpointTier:checked.tier,fresh:reviewed.plan.fresh,protocol:2,
          donorBaseline:await donorBaselineReceipt(baseline.snap),
          preparation:preparation?{epoch:preparation.epoch,revision:preparation.revision}:null,
          recovery:{mode:args.mode,mappings:args.mappings,
            accountChoices:args.accountChoices,
            portableStageScope:args.stageScope,
            portableCheckpointScope:args.checkpointScope}
        });
        const afterGuard=await destinationPortable(donor);
        assert(same(afterGuard,baseline),'RESTORE_DESTINATION_CHANGED_AFTER_GUARD');
        db=await database();
        await applyGuardedGroups({db,donor,baseline,intent,
          req:args.mappings,payload:incoming.donor,
          incomingPcms:incoming.canonical,mode:args.mode,
          fresh:reviewed.plan.fresh,accountChoices:args.accountChoices,v2:true,incomingLocal});
        const final=await gate.inspect();
        assert(final.held&&final.activation==='OFF'&&
          final.status==='COMPLETE_INACTIVE','RESTORE_PORTABLE_FINAL_HOLD_REQUIRED');
        return {...(await status()),ok:true,code:'RESTORED_PORTABLE_INACTIVE',
          sourceRows:incoming.receipt.rows,sourceAudit:incoming.receipt.sourceAudit,
          dataRecovered:true,protectedRoutesVerified:false,
          ownerSessionsVerified:false,providerEffects:'OFF'};
      }catch(e){return fail(redacted(e));}
      finally{try{db?.close()}catch{}}
    })().finally(()=>{running=null});
    return running;
  }
  async function reconcilePortable(args){
    if(running)return fail('RESTORE_BUSY');
    running=(async()=>{
      let db=null;
      try{
        const intent=await gate.read();
        assert(intent?.active===true&&intent.status!=='PREPARING'&&
          validScope(intent.recovery?.portableStageScope)&&validScope(intent.recovery?.portableCheckpointScope)&&
          args?.stageScope===intent.recovery.portableStageScope&&args?.checkpointScope===intent.recovery.portableCheckpointScope,
          'RESTORE_PORTABLE_RECONCILE_SCOPE');
        const incoming=await readPortableStage(args.stageScope),checkpoint=await readPortableStage(args.checkpointScope);
        assert(incoming.receipt.chain===intent.archiveSha256&&checkpoint.receipt.chain===intent.checkpointSha256,
          'RESTORE_RECOVERY_SOURCE_CHANGED');
        const donor=await donorReady();db=await database();
        if(intent.protocol!==2)return await reconcileRestore({gate,api,donor,db,
          portableIncoming:incoming,portableCheckpoint:checkpoint});
        await settle();
        const actual=await destinationPortable(donor);
        if(intent.donorPreparation?.status!=='COMMIT_POSSIBLE')
          assert(await observeDonorBaseline(intent.donorBaseline,actual.snap),'RESTORE_DESTINATION_DRIFT');
        const baseline={snap:actual.snap,pcms:checkpointCanonicalBaseline(checkpoint.canonical,actual.pcms),
          portable:checkpoint.donor,local:splitPortableLocal(checkpoint.canonical).values||{}};
        if(!intent.groups['pcms-canonical']||intent.groups['pcms-canonical'].status==='BEFORE_DISPATCH')
          assert(same(actual.pcms,baseline.pcms),'RESTORE_DESTINATION_DRIFT');
        if(!intent.groups['donor-portable']||intent.groups['donor-portable'].status==='BEFORE_DISPATCH')
          assert(same(actual.local,baseline.local),'RESTORE_CHECKPOINT_LOCAL_DRIFT');
        await applyGuardedGroups({db,donor,baseline,intent,req:intent.recovery.mappings,
          payload:incoming.donor,incomingPcms:incoming.canonical,mode:intent.recovery.mode,
          fresh:intent.fresh,accountChoices:intent.recovery.accountChoices||{},v2:true,
          incomingLocal:splitPortableLocal(incoming.canonical).values,continuing:true});
        return {...await status(),ok:true,code:'RESTORE_CONTINUED_WITHOUT_REPLAY'};
      }catch(e){return fail(redacted(e))}
      finally{try{db?.close()}catch{}}
    })().finally(()=>{running=null});
    return running;
  }
  async function run(message,sender){
    if(!trustedRestoreSender(api,sender))return fail('UNTRUSTED_SENDER');
    if(!message||typeof message!=='object'||Array.isArray(message))return fail('RESTORE_INPUT_INVALID');
    if(message.action==='STATUS')return status();
    if(message.action==='PREPARE_PORTABLE')return preparePortable(message.params);
    if(message.action==='CHECKPOINT_PORTABLE')return checkpointPortable(message.params);
    if(message.action==='CANCEL_PREPARATION'){
      if(running)return fail('RESTORE_BUSY');
      try{return await gate.cancel(message.params||{})}catch(e){return fail(redacted(e))}
    }
    if(message.action==='APPLY_PORTABLE')return applyPortable(message.params);
    if(message.action==='RECONCILE_PORTABLE')return reconcilePortable(message.params);
    // Client amendment v1.0.1: legacy encrypted/password/native commands
    // are not production restore capabilities. Preserve old implementation as
    // historical test code, but deny every superseded port operation.
    if(['PREVIEW_V2','APPLY_V2','RECONCILE','APPLY'].includes(message.action))
      return fail('RESTORE_COMMAND_NOT_ALLOWED');
    if(message.action==='REACTIVATE'){
      // Explicit fresh-controller activation after a fully observed restore.
      // The operator attests the predecessor PCMS controller is stopped
      // (single-machine product: two live controllers must never coexist).
      const p=message.params||{};
      if(running)return fail('RESTORE_BUSY');
      if(p.consent!==REACTIVATE_CONSENT||p.predecessorStopped!==true||
         typeof p.epoch!=='string'||!Number.isSafeInteger(p.revision))
        return fail('RESTORE_REACTIVATION_CONSENT_REQUIRED');
      try{
        const out=await gate.reactivate({epoch:p.epoch,revision:p.revision});
        return {...out,next:['RECONNECT_GITHUB','CONFIRM_ACCOUNT_LOGINS','REGRANT_PROTECTED_WORKFLOWS'],
          grants:'REVOKED_UNTIL_REAPPLIED'};
      }catch(e){return fail(redacted(e));}
    }
    return fail('RESTORE_COMMAND_NOT_ALLOWED');
  }
  function register(){
    if(registered)return;registered=true;
    api.runtime.onConnect.addListener(port=>{
      if(port.name!==RESTORE_PORT)return;
      let busy=false;
      port.onMessage.addListener(msg=>{
        if(busy){try{port.postMessage(fail('RESTORE_PORT_BUSY'));}catch{}return;}
        busy=true;
        void run(msg,port.sender).then(v=>{try{port.postMessage(v);}catch{}})
          .catch(()=>{try{port.postMessage(fail('RESTORE_HELD_UNKNOWN'));}catch{}})
          .finally(()=>{busy=false;});
      });
    });
    // Startup reads status only. Never execute, retry or release guard on wake.
  }
  return Object.freeze({register,run,status});
}
if(typeof browser!=='undefined')createRestoreBoundary(browser).register();
