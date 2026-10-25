import {mergeRestoredExitLedgers} from './restore-exits.mjs';
import {splitPortableLocal} from './portable-local.mjs';
// I16: restore data is history, never a portable authorization token.
// Deterministic plan over already authenticated structured-clone rows.
import {DB_STORES,validatePcmsSnapshot,serializeClone,deserializeClone} from './backup-core.mjs';
const deny=code=>{throw Error(code);};
const keyOf=r=>JSON.stringify(r.key);
const exact=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function copyRow(row){return {key:structuredClone(row.key),value:deserializeClone(row.value)};}
function inertMeta(key,row,remap,existing=null){
  const data=row.value;
  if(!data||typeof data!=='object')return row;
  if(typeof key==='string'&&key.startsWith('account:')&&data.account){
    const a=data.account;
    if(typeof a.personaUid==='string'&&a.state!=='ARCHIVED'){
      const uid=remap[a.personaUid];
      if(!uid)deny('RESTORE_UID_MAPPING_MISSING');
      a.personaUid=uid;
    }
    a.identity=null;a.override=null;
    if(a.state!=='ARCHIVED')a.state='VERIFICATION_PENDING';
    a.revision=(Number.isSafeInteger(a.revision)?a.revision:0)+1;
    a.bindingVersion=(Number.isSafeInteger(a.bindingVersion)?a.bindingVersion:0)+1;
  }
  if(typeof key==='string'&&key.startsWith('inventory:')&&data.generator){
    const g=data.generator;
    if(typeof g.personaUid==='string')g.personaUid=remap[g.personaUid]||null;
    // Restored owner observation is history, never current account authority.
    g.ownerState='OWNER_UNVERIFIED';g.ownerResult='UNKNOWN';
    g.ownerVerified=false;g.visibility='UNKNOWN';g.management='OBSERVED_ONLY';
    g.source='SOURCE_PENDING';g.lastObservationId=null;g.lastObservedAt=0;
    g.ownerObservationId=null;g.principalFingerprint=null;
    g.reviewHeld=true;g.identityHeld=true;
  }
  if(typeof key==='string'&&key.startsWith('stage:')&&data.record)data.record.restoredHistorical=true;
  if(typeof key==='string'&&key.startsWith('s05-ready:')&&data.record)data.record.restoredHistorical=true;
  if(typeof key==='string'&&key.startsWith('release:')&&data.release){
    if(data.release.state!=='RESTORE_REVIEW_REQUIRED'||!data.release.restoredEffects?.length)data.release.restoredEffects=[...(data.release.restoredEffects||[]),{state:data.release.state,dispatchPossible:data.release.dispatchPossible===true,source:data.release.source||null,sourceFingerprint:data.release.approval?.sourceFingerprint||null}];
    data.release={...data.release,
      state:'RESTORE_REVIEW_REQUIRED',dispatchPossible:false,
      approval:null,reason:'RESTORED_APPROVAL_IS_HISTORY'};
  }
  if(typeof key==='string'&&key.startsWith('ai-job:')&&data.job){
    if(!data.job.restoredOriginal){const raw=structuredClone(data.job);delete raw.restoredOriginal;data.job.restoredOriginal=raw;}
    data.job.restoredEffects=[...(data.job.restoredEffects||[]),{state:data.job.state,native:data.job.native?.state||null}];
    data.job={...data.job,state:'TESTS_UNVERIFIED',
      hold:'RESTORED_TESTS_NEED_NEW_OBSERVATION',executionSlotReleased:true};
  }
  if(typeof key==='string'&&key.startsWith('writeback:')&&data.record){
    data.record={...data.record,restoredHistorical:true,
      restoredEffects:data.record.state==='RESTORE_REVIEW_REQUIRED'&&data.record.restoredEffects?.length?data.record.restoredEffects:[...(data.record.restoredEffects||[]),{state:data.record.state}],
      state:data.record.state==='CONFIRMED'?'CONFIRMED':'RESTORE_REVIEW_REQUIRED'};
  }
  if(key==='writeback-settings'&&data.setting){
    data.setting={...data.setting,autoEnabled:false};
  }
  if(key==='backup:auto-state'&&data.state){
    data.historicalArchives=structuredClone(data.state.archives||[]);
    data.state={...data.state,enabled:false,active:null,archives:[],
      lastSuccessDay:-1,lastAttemptDay:-1,nextAttemptAt:0,freshRequest:null,
      status:'SUSPENDED',code:'RESTORED_FILE_NOT_VERIFIED'};
  }
  if(['backup:manual-active','backup:manual-last-complete'].includes(key)){
    data.status='RESTORED_HISTORY_ONLY';data.downloadId=null;
    data.tier=0;data.code='RESTORED_FILE_NOT_VERIFIED';
  }
  if(typeof key==='string'&&key.startsWith('backup:v2:')&&
     key!=='backup:v2:active'){
    data.state='RESTORED_HISTORY_ONLY';
    // Hashes survive as archival facts; they cannot qualify a native file.
    data.acceptedBytes=0;data.preparedSha256=null;
  }
  if(key==='refresher:shadow:v1'&&data.state){
    const prior=existing?.state||{};
    const oldRows=new Map((prior.rows||[]).map(r=>[r.stableId,r]));
    data.state={...data.state,
      // Independent guard enforces safety; manual Pauses remain distinct.
      globalPause:data.state.globalPause===true||prior.globalPause===true,
      rows:(data.state.rows||[]).map(r=>({...r,
        paused:r.paused===true||oldRows.get(r.stableId)?.paused===true,
        personaUid:typeof r.personaUid==='string'?
          (remap[r.personaUid]||null):null,slot:false})),
      accounts:Object.fromEntries(Object.entries(data.state.accounts||{})
        .map(([id,a])=>[id,{...a,
          paused:a.paused===true||prior.accounts?.[id]?.paused===true,
          personaUid:typeof a.personaUid==='string'?
            (remap[a.personaUid]||null):null,
          verifiedIdentity:false,principalFingerprint:null}])),
      inflight:[],dueIndex:[],nextWakeAt:0,nextAdmissionAt:0};
  }
  // Other metadata remains preserved under the independent global guard.
  return row;
}
// Preserve reliable *destination* removals even for replace mode. The
// archived account is not authority to undo a later local removal.
export function prepareRestoredCanonical({incoming,current,mode='merge',
  uidRemap={},targetBindings=null,fresh=false,accountChoices={}}={}){
  validatePcmsSnapshot(incoming);validatePcmsSnapshot(current);
  incoming=splitPortableLocal(incoming).pcms;current=splitPortableLocal(current).pcms;
  if(!['merge','replace'].includes(mode))deny('RESTORE_MODE_INVALID');
  if(!uidRemap||typeof uidRemap!=='object'||Array.isArray(uidRemap))
    deny('RESTORE_UID_MAP_INVALID');
  const dests=new Set();
  for(const [oldId,newId] of Object.entries(uidRemap)){
    if(typeof oldId!=='string'||!oldId||typeof newId!=='string'||!newId||
      dests.has(newId))deny('RESTORE_UID_MAPPING_COLLISION');
    dests.add(newId);
  }
  if(!accountChoices||typeof accountChoices!=='object'||
     Array.isArray(accountChoices))deny('RESTORE_ACCOUNT_CHOICES_INVALID');
  const historical=new Map();
  const local=new Map(current.stores.meta.filter(row=>
    typeof row.key==='string').map(row=>[row.key,deserializeClone(row.value)]));
  const incomingAccounts=incoming.stores.meta.filter(row=>
    typeof row.key==='string'&&row.key.startsWith('account:')&&
    row.value?.account).map(row=>({id:row.value.account.accountId,
      account:row.value.account}));
  const excluded=new Set(),selectedRemoved=new Set();
  for(const {id,account} of incomingAccounts){
    if(typeof id!=='string'||!id||
       accountChoices[id]&&!['INCLUDE_INACTIVE','EXCLUDE'].includes(accountChoices[id]))
      deny('RESTORE_ACCOUNT_CHOICES_INVALID');
    const localRemoval=local.get('removal:'+id);
    const newer=localRemoval&&
      localRemoval.state==='REMOVED_ONLY_LOCALLY'&&
      Number.isSafeInteger(localRemoval.revision)&&
      localRemoval.revision>(Number.isSafeInteger(account.revision)?account.revision:0);
    if(localRemoval&&!newer&&local.get('account:'+id)?.account?.restoredRemovalRevision!==localRemoval.revision)
      deny('RESTORE_REMOVAL_HISTORY_AMBIGUOUS');
    if(newer){
      historical.set(id,localRemoval);
      if(accountChoices[id]==='INCLUDE_INACTIVE')selectedRemoved.add(id);
      else excluded.add(id);
      continue;
    }
    if(accountChoices[id]==='EXCLUDE'){excluded.add(id);continue;}
    if(fresh&&accountChoices[id]!=='INCLUDE_INACTIVE')
      deny('RESTORE_FRESH_ACCOUNT_DECISION_REQUIRED');
  }
  // Choices for accounts not actually in the archive are not approvals.
  if(Object.keys(accountChoices).some(id=>!incomingAccounts.some(a=>a.id===id)))
    deny('RESTORE_ACCOUNT_CHOICES_INVALID');
  // A restored archive cannot overwrite the destination's automatic or
  // manual backup evidence. These local-only records track disk outcomes and
  // last-known-good files; importing a different profile's receipts as live
  // controller state would either lose the local good copy or invent one.
  const localBackupEvidence=key=>typeof key==='string'&&
    (key==='backup:auto-state'||key==='backup:manual-active'||key==='backup:manual-last-complete'||
     key.startsWith('backup:v2:'));
  const exitKey='network:s01:exit-ownership-v1';
  const sourceExits=incoming.stores.meta.find(r=>r.key===exitKey)?.value;
  const currentExits=local.get(exitKey);
  const affectedAccounts=incomingAccounts.filter(a=>!excluded.has(a.id)).map(a=>a.id);
  const accountTargets=targetBindings===null?null:Object.fromEntries(incomingAccounts.filter(a=>!excluded.has(a.id)).map(({id,account})=>{
    const personaUid=uidRemap[account.personaUid];
    return [id,{personaUid,bindingId:targetBindings[personaUid]||null}];
  }));
  const mergedExits=sourceExits||currentExits?mergeRestoredExitLedgers(sourceExits,currentExits,{uidRemap,affectedAccounts,accountTargets}):null;
  const stores={};
  for(const name of DB_STORES){
    const previous=current.stores[name].map(copyRow);
    const priorByKey=new Map(previous.map(row=>[keyOf(row),row.value]));
    const rawByKey=new Map(incoming.stores[name].map(row=>[JSON.stringify(row.key),row.value]));
    const restored=incoming.stores[name].filter(row=>{
      // A different profile's in-flight native lease is never authority.
      if(name==='meta'&&row.key==='backup:v2:active')return false;
      if(name!=='meta'||typeof row.key!=='string'||
         !row.key.startsWith('account:'))return true;
      return !excluded.has(row.value?.account?.accountId);
    }).map(copyRow).map(row=>{
      const value=row.value;
      if(name==='entities'&&value&&typeof value==='object'){
        value.activeOperationId=null;value.revision=(Number.isSafeInteger(value.revision)?value.revision:0)+1;
      }
      if(name==='operations'&&value&&typeof value==='object'&&
        !['CONFIRMED','ABORTED','REJECTED'].includes(value.status)){
        value.status='HELD_UNCERTAIN';value.revision=(Number.isSafeInteger(value.revision)?value.revision:0)+1;
      }
      if(name==='meta')inertMeta(row.key,row,uidRemap,priorByKey.get(keyOf(row)));
      if(name==='meta'&&selectedRemoved.has(value?.account?.accountId)){
        const a=value.account,prior=priorByKey.get(keyOf(row))?.account;
        a.state='VERIFICATION_PENDING';a.identity=null;a.override=null;a.removed=null;
        a.revision=Math.max(a.revision,historical.get(a.accountId).revision+1);
        a.bindingVersion=Math.max(a.bindingVersion,(prior?.bindingVersion||0)+1);
        a.restoredRemovalRevision=historical.get(a.accountId).revision;
        a.boundPrincipal=prior?.boundPrincipal||a.boundPrincipal||null;
        a.history=[...(a.history||[]),{event:'RESTORED_INACTIVE_AFTER_LOCAL_REMOVAL',
          removalRevision:historical.get(a.accountId).revision}];
      }
      if(name==='observations'&&value&&typeof value==='object'){
        value.restoredHistorical=true;
      }
      return row;
    });
    const map=new Map((mode==='replace'?[]:previous).map(row=>[keyOf(row),row]));
    if(name==='meta'){
      // A replace never erases verified later removals or exit allocations.
      for(const row of previous){
        if(typeof row.key==='string'&&
          (row.key.startsWith('removal:')||
           row.key==='network:s01:exit-ownership-v1'||
           localBackupEvidence(row.key)))
          map.set(keyOf(row),row);
      }
    }
    for(const item of restored){
      const key=keyOf(item);
      if(name==='meta'&&typeof item.key==='string'&&
         localBackupEvidence(item.key)&&map.has(key))
        continue; // The observed destination disk/retention truth wins.
      // The exact same source/destination row is an idempotent merge even
      // when restore sanitization removes its old live authority.
      if(name==='meta'&&typeof item.key==='string'&&
        item.key.startsWith('removal:')&&historical.has(
          item.key.slice('removal:'.length)))continue;
      if(name==='meta'&&item.key==='network:s01:exit-ownership-v1'){
        item.value=mergedExits;
        map.set(key,item);continue;
      }
      const explicitlyRecovered=name==='meta'&&selectedRemoved.has(item.value?.account?.accountId);
      if(!explicitlyRecovered&&map.has(key)&&!exact(map.get(key).value,item.value)&&
        !exact(serializeClone(map.get(key).value),rawByKey.get(key)))
        deny('RESTORE_MERGE_CONFLICT');
      map.set(key,item);
    }
    if(name==='meta'&&mergedExits)map.set(JSON.stringify(exitKey),{key:exitKey,value:mergedExits});
    stores[name]=[...map.values()].sort((a,b)=>{
      const x=a.key,y=b.key;
      if(typeof indexedDB!=='undefined'&&typeof indexedDB.cmp==='function')
        return indexedDB.cmp(x,y);
      if(typeof x==='number'&&typeof y==='number')return x-y;
      // IndexedDB compares string keys by code units, not locale collation.
      const sx=String(x),sy=String(y);
      return sx<sy?-1:sx>sy?1:0;
    }).map(row=>({key:structuredClone(row.key),value:serializeClone(row.value)}));
  }
  // Never treat inventory belonging to a replaced binding as current.
  for(const row of stores.meta)row.value=deserializeClone(row.value);
  const accounts=new Map(stores.meta.filter(r=>typeof r.key==='string'&&
    r.key.startsWith('account:')&&r.value?.account)
    .map(r=>[r.value.account.accountId,r.value.account]));
  const restoredIds=new Set(incomingAccounts.filter(a=>!excluded.has(a.id)).map(a=>a.id));
  const ledger=stores.meta.find(r=>r.key==='network:s01:exit-ownership-v1')?.value;
  for(const binding of Object.values(ledger?.bindings||{})){
    const account=accounts.get(binding.accountId);
    if(account&&restoredIds.has(account.accountId))account.bindingId=binding.bindingId;
  }
  if(accountTargets)for(const [id,target] of Object.entries(accountTargets)){
    const account=accounts.get(id);if(!account)continue;
    account.bindingId=target.bindingId;account.upgrade=null;
    account.routeStatus='HELD';account.routeCode='RESTORED_ROUTE_REVERIFICATION';
  }
  // Non-authorizing source locators follow the selected account, while their
  // original evidence stays inspectable. Effect journals are never retargeted.
  for(const row of stores.meta){
    if(typeof row.key!=='string')continue;
    const association=row.key.startsWith('adoption:')?row.value?.adoption:
      row.key.startsWith('source-link:')?row.value?.link:
      row.key.startsWith('identity-alias:')?row.value?.identity:null;
    const account=association&&accounts.get(association.accountId);
    if(!account||!restoredIds.has(account.accountId))continue;
    association.restoredContextHistory=[...(association.restoredContextHistory||[]),{
      personaUid:association.personaUid||null,bindingVersion:association.bindingVersion,
      accountRevision:association.accountRevision,principalFingerprint:association.principalFingerprint||null}];
    association.personaUid=account.personaUid;
    association.bindingVersion=account.bindingVersion;
    association.accountRevision=account.revision;
    association.restoredOwnerReverificationRequired=true;
  }
  const uidOwners=new Map();
  for(const a of accounts.values()){
    if(a.state==='ARCHIVED')continue;
    if(typeof a.personaUid!=='string'||!a.personaUid)
      deny('RESTORE_ACTIVE_BINDING_MISSING');
    const priorOwner=uidOwners.get(a.personaUid);
    if(priorOwner&&priorOwner!==a.accountId)deny('RESTORE_DUPLICATE_ACTIVE_BINDING');
    uidOwners.set(a.personaUid,a.accountId);
  }
  for(const record of stores.meta){
    const g=record.value?.generator;
    if(typeof record.key!=='string'||!record.key.startsWith('inventory:')||!g)continue;
    const account=accounts.get(g.accountId);
    if(!account){
      // A removed account's generator/source evidence remains historical,
      // not silently dropped or converted into a live account association.
      if(excluded.has(g.accountId)){
        g.personaUid=null;g.accountRevision=null;
        g.ownerState='HISTORICAL_REMOVED_ACCOUNT';
        g.reviewHeld=true;g.identityHeld=true;continue;
      }
      deny('RESTORE_ACCOUNT_REFERENCE_MISSING');
    }
    g.personaUid=account.personaUid;
    g.bindingVersion=account.bindingVersion;
    g.accountRevision=account.revision;
  }
  stores.meta=stores.meta.map(row=>({key:row.key,value:serializeClone(row.value)}));
  const snapshot={schema:1,stores};
  validatePcmsSnapshot(snapshot);
  return snapshot;
}

// Validate all deterministic canonical conflicts before installing an import
// guard or changing donor data. New Persona UIDs are donor-owned and unknown
// until creation; distinct provisional IDs check structure without claiming
// an identity observation. The final plan is recomputed with observed UIDs.
export function preflightRestoredCanonical({incoming,current,donor,mappings,
  currentDonor,mode,fresh,accountChoices}){
  const uidRemap=Object.create(null),targetBindings=Object.create(null);
  const sourceAccounts=incoming.stores.meta.filter(r=>typeof r.key==='string'&&r.key.startsWith('account:')).map(r=>r.value?.account).filter(Boolean);
  const localAccounts=current.stores.meta.filter(r=>typeof r.key==='string'&&r.key.startsWith('account:')).map(r=>r.value?.account).filter(Boolean);
  for(const [i,p] of (donor.personas||[]).entries()){
    const source=p.profile?.personaUid;
    if(!source)continue;
    const target=mappings[p.key];
    const known=target!=='__create__'&&currentDonor.state.profiles?.[target]?.personaUid;
    const targetProfile=target!=='__create__'&&currentDonor.state.profiles?.[target];
    const tag=targetProfile?.pcmsBindingId||null;
    if(tag){
      const sourceAccount=sourceAccounts.find(a=>a.personaUid===source);
      const destinationAccount=localAccounts.find(a=>a.personaUid===known&&a.bindingId===tag);
      if(!sourceAccount||!destinationAccount||sourceAccount.accountId!==destinationAccount.accountId)
        deny('RESTORE_PROTECTED_PERSONA_BELONGS_TO_OTHER_ACCOUNT');
    }
    uidRemap[source]=known||'restore-preflight-'+i;
    targetBindings[uidRemap[source]]=tag;
  }
  return prepareRestoredCanonical({incoming,current,uidRemap,targetBindings,mode,fresh,accountChoices});
}
