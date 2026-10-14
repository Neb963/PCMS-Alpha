// I16: one guarded local restore command. A resume NEVER redispatches a step.
// No provider/API calls or fresh-controller activation. Source/checkpoint secrets
// exist only in the caller's live extension port and this invocation.
import {openCanonicalDatabase,createRestoreSentinel} from './journal.mjs';
import {trustedExtensionPage} from './command-boundary.mjs';
import {snapshotCanonical,digest} from './backup-core.mjs';
import {createPortableBackupPayload,decodeBackupEnvelope} from '../lib/backup-package.js';
import {filterOrdinaryAutomationJobs} from '../lib/automation-history.js';
import {previewRestore,verifyCheckpoint} from './restore-core.mjs';
import {createRestoreGate} from './restore-gate.mjs';
import {createRestoreStageEngine} from './restore-stage.mjs';
import {prepareRestoredCanonical} from './restore-sanitize.mjs';
import {applyCanonicalSnapshot} from './restore-idb.mjs';
import {getPcmsRestoreDonor} from './restore-donor.mjs';
import {reconcileRestore} from './restore-reconcile.mjs';
export const RESTORE_PORT='pcms-i16-restore';
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
  return {snap,pcms,portable:await readPortable(api,donor,snap)};
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
  database=openCanonicalDatabase}={}){
  const gate=createRestoreGate(api.storage.local);
  let running=null,registered=false;
  async function status(){
    const result=await gate.inspect();
    return {ok:true,...result,providerEffects:'OFF',remoteActivation:'OFF'};
  }
  async function apply(args){
    if(running)return fail('RESTORE_BUSY');
    // All effects remain disabled until human plan review and actual file proof.
    running=(async()=>{
      let db=null;
      try{
        assert(args&&typeof args==='object'&&typeof args.archiveText==='string'&&
          typeof args.checkpointText==='string'&&typeof args.password==='string'&&
          args.password.length>=12&&hex(args.reviewedPlanSha256),
          'RESTORE_INPUT_INVALID');
        assert(await gate.read()===null,'RESTORE_ALREADY_HELD');
        const donor=getDonor(),baseline=await destination(api,donor);
        const req=args.mappings||{};
        const reviewed=await previewRestore({archiveText:args.archiveText,password:args.password,
          decodeDonor:decodeBackupEnvelope,mode:args.mode,fresh:args.fresh===true,
          mappings:req,currentPcms:baseline.pcms,currentDonor:baseline.snap,
          currentPortable:baseline.portable,containers:baseline.snap.containers});
        assert(reviewed.planSha256===args.reviewedPlanSha256,'RESTORE_PLAN_CHANGED');
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
        let mappings=null,preparedDonor=null,remaps=null,preparedCanonical=null;
        db=await database();
        const session={epoch:intent.epoch,revision:intent.revision};
        async function step(group,operation,dispatch,readback){
          const fingerprint=await digest(JSON.stringify(operation));
          const engine=createRestoreStageEngine(gate,{
            dispatch:async()=>{await dispatch();},
            readback:async()=>readback(fingerprint)
          });
          const outcome=await engine.execute({epoch:session.epoch,revision:session.revision,
            group,step:group,fingerprint});
          session.revision=outcome.revision;
          assert(outcome.groups[group]?.status==='OBSERVED',
            'RESTORE_PARTIAL_HELD');
          return outcome;
        }
        await step('donor-personas',{payload:await digest(JSON.stringify(payload)),
          mappings:req,mode:args.mode},async()=>{
          let containers=await donor.containers();
          for(const [i,p] of (payload.personas||[]).entries()){
            if(req[p.key]!=='__create__')continue;
            const name=createKey(intent.epoch,i);
            assert(containers.every(c=>c.name!==name),'RESTORE_CONTAINER_ALREADY_EXISTS');
            const made=await donor.createContainer({name,color:p.color||'blue',
              icon:p.icon||'fingerprint'});
            assert(made?.cookieStoreId,'RESTORE_CONTEXT_RESULT_UNKNOWN');
            containers=await donor.containers();
          }
          mappings=mappingFromContainers(payload,req,containers,intent.epoch);
          preparedDonor=await donor.prepare({payload,mappings,mode:args.mode});
          remaps=uidMap(preparedDonor.sourcePersonas);
          await donor.commit(preparedDonor.candidate);
        },async fp=>{
          if(!preparedDonor||!mappings)return {source:'INDEPENDENT_READBACK',digest:'0'.repeat(64)};
          const now=await donor.snapshot();
          const valid=preparedDonor.sourcePersonas.every(p=>{
            const row=now.state.profiles?.[p.containerId];
            return row?.personaUid===p.targetUid&&row?.routeId==='block'&&
              row?.killSwitch===true&&row.managed===true;
          });
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
        await step('donor-portable',{gm:await digest(JSON.stringify(gm))},
          async()=>{if(Object.keys(gm).length)await api.storage.local.set(gm);},
          async fp=>{
            const got=await api.storage.local.get(Object.keys(gm));
            return {source:'INDEPENDENT_READBACK',
              digest:Object.keys(gm).every(k=>same(got[k],gm[k]))?fp:'0'.repeat(64)};
          });
        preparedCanonical=prepareRestoredCanonical({incoming:incoming.archive.pcms,
          current:baseline.pcms,mode:args.mode,uidRemap:remaps});
        await step('pcms-canonical',{pcms:await digest(JSON.stringify(preparedCanonical))},
          async()=>applyCanonicalSnapshot(db,preparedCanonical,{
            assertHeld:async()=>(await gate.inspect()).held===true,
            expectedBefore:baseline.pcms}),
          async fp=>{
            const got=await snapshotCanonical(db);
            return {source:'INDEPENDENT_READBACK',
              digest:same(got,preparedCanonical)?fp:'0'.repeat(64)};
          });
        return {ok:true,code:'RESTORED_INACTIVE_REVIEW_REQUIRED',
          ...(await status()),dataRecovered:true,ownerSessionsVerified:false,
          protectedRoutesVerified:false,predecessorProvenOff:false};
      }catch(e){return fail(redacted(e));}
      finally{try{db?.close();}catch{}}
    })().finally(()=>{running=null;});
    return running;
  }
  async function run(message,sender){
    if(!trustedRestoreSender(api,sender))return fail('UNTRUSTED_SENDER');
    if(!message||typeof message!=='object'||Array.isArray(message))return fail('RESTORE_INPUT_INVALID');
    if(message.action==='STATUS')return status();
    if(message.action==='RECONCILE'){
      if(running)return fail('RESTORE_BUSY');
      let db;
      try{
        db=await database();
        return await reconcileRestore({gate,api,donor:getDonor(),db,
          archiveText:message.params?.archiveText,
          checkpointText:message.params?.checkpointText,
          password:message.params?.password});
      }catch(e){return fail(redacted(e));}
      finally{try{db?.close();}catch{}}
    }
    if(message.action==='APPLY')return apply(message.params);
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
