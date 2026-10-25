import {restoredTargetBindings} from './restore-identities.mjs';
import {splitPortableLocal,preparePortableLocalRestore} from './portable-local.mjs';
// I16 recovery is observation-only: never create a context, import cookies,
// commit donor state or replace canonical rows after a lost acknowledgement.
import {decodeBackupEnvelope} from '../lib/backup-package.js';
import {BLOCK_ROUTE_ID} from '../lib/constants.js';
import {digest,snapshotCanonical,snapshotCanonicalV2} from './backup-core.mjs';
import {openRestoreArchive} from './restore-core.mjs';
import {prepareRestoredCanonical} from './restore-sanitize.mjs';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const refuse=c=>{throw Error(c);};
function cookiesMatch(expected,observed){
  const tuple=c=>JSON.stringify([c.name,c.value,c.domain,c.path||'/',c.secure===true,
    c.httpOnly===true,c.firstPartyDomain||'',c.partitionKey||null]);
  const actual=new Set(observed.map(tuple));
  return expected.every(x=>actual.has(tuple(x)));
}
function resolved(payload,settings,containers,epoch,recorded={}){
  const map=Object.create(null),used=new Set();
  for(const [i,p] of (payload.personas||[]).entries()){
    const original=settings[p.key];
    const matches=original==='__create__'?
      containers.filter(x=>x.name==='PCMS Restore '+epoch.slice(8,20)+' '+
        String(i).padStart(3,'0')):
      containers.filter(x=>x.cookieStoreId===original);
    const id=matches.map(x=>x.cookieStoreId);
    if(recorded[p.key]&&id[0]!==recorded[p.key])
      refuse('RESTORE_CONTEXT_RECEIPT_MISMATCH');
    if(id.length!==1||used.has(id[0]))refuse('RESTORE_MAPPING_NOT_RECONCILED');
    map[p.key]=id[0];used.add(id[0]);
  }
  return map;
}
function remaps(payload,bindings,state){
  const uid=Object.create(null),targets=new Set();
  for(const p of payload.personas||[]){
    const target=state.profiles?.[bindings[p.key]];
    if(!target||target.managed!==true||target.routeId!==BLOCK_ROUTE_ID||
      target.killSwitch!==true||target.blockLocalNetwork!==true||
      typeof target.personaUid!=='string')refuse('RESTORE_PERSONA_NOT_RECONCILED');
    if(p.profile?.personaUid){
      if(targets.has(target.personaUid))refuse('RESTORE_UID_MAPPING_COLLISION');
      uid[p.profile.personaUid]=target.personaUid;targets.add(target.personaUid);
    }
  }
  return uid;
}
export async function reconcileRestore({gate,api,donor,db,archiveText,
  checkpointText,password,portableIncoming=null,portableCheckpoint=null}){
  const row=await gate.read();
  if(!row?.active||!row.recovery)refuse('RESTORE_RECOVERY_NOT_POSSIBLE');
  const portable=portableIncoming&&portableCheckpoint;
  if(portable){
    if(portableIncoming.sourceVerified!==true||
       portableCheckpoint.sourceVerified!==true||
       portableIncoming.receipt?.chain!==row.archiveSha256||
       portableCheckpoint.receipt?.chain!==row.checkpointSha256)
      refuse('RESTORE_RECOVERY_SOURCE_CHANGED');
  }else if(await digest(archiveText)!==row.archiveSha256||
     await digest(checkpointText)!==row.checkpointSha256)
    refuse('RESTORE_RECOVERY_SOURCE_CHANGED');
  const incoming=portable?{donor:portableIncoming.donor,
    archive:{pcms:portableIncoming.canonical}}:
    await openRestoreArchive(archiveText,password,{decodeDonor:decodeBackupEnvelope});
  const old=portable?{donor:portableCheckpoint.donor,
    archive:{pcms:portableCheckpoint.canonical}}:
    await openRestoreArchive(checkpointText,password,{decodeDonor:decodeBackupEnvelope});
  const current=await donor.snapshot();
  const containers=await donor.containers();
  const bindings=resolved(incoming.donor,row.recovery.mappings,containers,row.epoch,row.createdContainers);
  const map=remaps(incoming.donor,bindings,current.state);
  const incomplete=Object.entries(row.groups).find(([,g])=>
    ['DISPATCH_POSSIBLE','HELD_UNCERTAIN'].includes(g?.status));
  if(!incomplete)return {ok:true,code:'RESTORE_NO_UNCERTAIN_STEP',
    held:true,activation:'OFF'};
  const [group,record]=incomplete;
  let outcome=false;
  let operation;
  if(group==='donor-personas'){
    operation={payload:await digest(JSON.stringify(incoming.donor)),
      mappings:row.recovery.mappings,mode:row.recovery.mode};
    // If source scripts/workflows were imported, their byte/enable audit
    // needs the original pinned donor mapping; absent it, hold for review.
    outcome=!(incoming.donor.scripts||[]).length&&
      !(incoming.donor.workflows||[]).length;
  }else if(group==='donor-cookies'){
    operation={cookies:await digest(JSON.stringify(incoming.donor.cookies||{})),
      mappings:bindings};
    outcome=true;
    for(const [key,records] of Object.entries(incoming.donor.cookies||{})){
      const got=await donor.cookies(bindings[key]);
      if(!Array.isArray(got)||!cookiesMatch(records,got)){outcome=false;break;}
    }
  }else if(group==='donor-portable'){
    const local=portable?splitPortableLocal(incoming.archive.pcms).values:null;
    const oldLocal=portable?splitPortableLocal(old.archive.pcms).values||{}:{};
    const patch=preparePortableLocalRestore(local,oldLocal,{mode:row.recovery.mode});
    operation={gm:await digest(JSON.stringify({})),
      ...(local!==null?{local:await digest(JSON.stringify(patch))}:{})};
    const observed=await api.storage.local.get(Object.keys(patch));
    outcome=Object.keys(incoming.donor.gmValues||{}).length===0&&
      Object.keys(patch).every(k=>equal(observed[k],patch[k]));
  }else if(group==='pcms-canonical'){
    const actual=await (portable?snapshotCanonicalV2(db,{serializedValues:true}):snapshotCanonical(db));
    const selfKeys=['backup:manual-active','backup:manual-last-complete'];
    const baseline=portable?{...old.archive.pcms,stores:{...old.archive.pcms.stores,
      meta:[...old.archive.pcms.stores.meta.filter(r=>!selfKeys.includes(r.key)),
        ...actual.stores.meta.filter(r=>selfKeys.includes(r.key))].sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0)}}:old.archive.pcms;
    const expected=prepareRestoredCanonical({incoming:incoming.archive.pcms,
      current:baseline,mode:row.recovery.mode,uidRemap:map,
      targetBindings:restoredTargetBindings(row.donorPreparation?.sourcePersonas),
      fresh:portable&&row.fresh===true,
      accountChoices:portable?row.recovery.accountChoices||{}:{}});
    operation={pcms:await digest(JSON.stringify(expected))};
    outcome=equal(actual,expected);
  }else refuse('RESTORE_UNKNOWN_GROUP');
  const fingerprint=await digest(JSON.stringify(operation));
  if(!record.fingerprint||record.fingerprint!==fingerprint)
    refuse('RESTORE_RECOVERY_FINGERPRINT_MISMATCH');
  if(!outcome)return {ok:false,code:'RESTORE_OUTCOME_UNCERTAIN',
    group,held:true,activation:'OFF'};
  const confirmed=await gate.advance({epoch:row.epoch,revision:row.revision,
    group,step:record.step,status:'OBSERVED',fingerprint,
    observation:{source:'INDEPENDENT_READBACK',digest:fingerprint}});
  return {ok:true,code:'RESTORE_OBSERVED_NO_REPLAY',group,
    revision:confirmed.revision,held:true,activation:'OFF'};
}
