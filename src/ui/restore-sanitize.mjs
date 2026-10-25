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
  if(typeof key==='string'&&key.startsWith('release:')&&data.release){
    data.release={...data.release,
      state:'RESTORE_REVIEW_REQUIRED',dispatchPossible:false,
      approval:null,reason:'RESTORED_APPROVAL_IS_HISTORY'};
  }
  if(typeof key==='string'&&key.startsWith('ai-job:')&&data.job){
    data.job={...data.job,state:'TESTS_UNVERIFIED',
      hold:'RESTORED_TESTS_NEED_NEW_OBSERVATION',executionSlotReleased:true};
  }
  if(typeof key==='string'&&key.startsWith('writeback:')&&data.record){
    data.record={...data.record,state:'RESTORE_REVIEW_REQUIRED'};
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
  uidRemap={},fresh=false,accountChoices={}}={}){
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
  const excluded=new Set();
  for(const {id,account} of incomingAccounts){
    if(typeof id!=='string'||!id||
       accountChoices[id]&&!['INCLUDE_INACTIVE','EXCLUDE'].includes(accountChoices[id]))
      deny('RESTORE_ACCOUNT_CHOICES_INVALID');
    const localRemoval=local.get('removal:'+id);
    const newer=localRemoval&&
      localRemoval.state==='REMOVED_ONLY_LOCALLY'&&
      Number.isSafeInteger(localRemoval.revision)&&
      localRemoval.revision>(Number.isSafeInteger(account.revision)?account.revision:0);
    if(localRemoval&&!newer)deny('RESTORE_REMOVAL_HISTORY_AMBIGUOUS');
    if(newer){
      if(accountChoices[id]==='INCLUDE_INACTIVE')
        deny('RESTORE_REMOVED_ACCOUNT_REQUIRES_SEPARATE_REVIEW');
      excluded.add(id);historical.set(id,localRemoval);continue;
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
      if(name==='meta'&&item.key==='network:s01:exit-ownership-v1'&&
        map.has(key)&&!exact(map.get(key).value,item.value))
        deny('RESTORE_EXIT_HISTORY_CONFLICT');
      if(map.has(key)&&!exact(map.get(key).value,item.value)&&
        !exact(serializeClone(map.get(key).value),rawByKey.get(key)))
        deny('RESTORE_MERGE_CONFLICT');
      map.set(key,item);
    }
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
