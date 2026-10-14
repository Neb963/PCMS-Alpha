// I16: restore data is history, never a portable authorization token.
// Deterministic plan over already authenticated structured-clone rows.
import {DB_STORES,validatePcmsSnapshot,serializeClone,deserializeClone} from './backup-core.mjs';
const deny=code=>{throw Error(code);};
const keyOf=r=>JSON.stringify(r.key);
const exact=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function copyRow(row){return {key:structuredClone(row.key),value:deserializeClone(row.value)};}
function inertMeta(key,row,remap){
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
  }
  if(typeof key==='string'&&key.startsWith('inventory:')&&data.generator){
    const g=data.generator;
    if(typeof g.personaUid==='string')g.personaUid=remap[g.personaUid]||null;
    g.ownerResult='UNKNOWN';g.ownerVerified=false;g.visibility='UNKNOWN';
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
    data.state={...data.state,enabled:false,active:null,
      status:'SUSPENDED',code:'RESTORED_KEY_NOT_AUTHORITY'};
  }
  if(key==='refresher:shadow:v1'&&data.state){
    data.state={...data.state,globalPause:true,
      rows:(data.state.rows||[]).map(r=>({...r,paused:true})),
      accounts:Object.fromEntries(Object.entries(data.state.accounts||{})
        .map(([id,a])=>[id,{...a,paused:true}])),
      inflight:[],nextWakeAt:0};
  }
  // Other metadata remains preserved under the independent global guard.
  return row;
}
export function prepareRestoredCanonical({incoming,current,mode='merge',uidRemap={}}={}){
  validatePcmsSnapshot(incoming);validatePcmsSnapshot(current);
  if(!['merge','replace'].includes(mode))deny('RESTORE_MODE_INVALID');
  if(!uidRemap||typeof uidRemap!=='object'||Array.isArray(uidRemap))
    deny('RESTORE_UID_MAP_INVALID');
  const dests=new Set();
  for(const [oldId,newId] of Object.entries(uidRemap)){
    if(typeof oldId!=='string'||!oldId||typeof newId!=='string'||!newId||
      dests.has(newId))deny('RESTORE_UID_MAPPING_COLLISION');
    dests.add(newId);
  }
  const stores={};
  for(const name of DB_STORES){
    const previous=current.stores[name].map(copyRow);
    const restored=incoming.stores[name].map(copyRow).map(row=>{
      const value=row.value;
      if(name==='entities'&&value&&typeof value==='object'){
        value.activeOperationId=null;value.revision=(Number.isSafeInteger(value.revision)?value.revision:0)+1;
      }
      if(name==='operations'&&value&&typeof value==='object'&&
        !['CONFIRMED','ABORTED','REJECTED'].includes(value.status)){
        value.status='HELD_UNCERTAIN';value.revision=(Number.isSafeInteger(value.revision)?value.revision:0)+1;
      }
      if(name==='meta')inertMeta(row.key,row,uidRemap);
      if(name==='observations'&&value&&typeof value==='object'){
        value.restoredHistorical=true;
      }
      return row;
    });
    const map=new Map((mode==='replace'?[]:previous).map(row=>[keyOf(row),row]));
    for(const item of restored){
      const key=keyOf(item);
      if(map.has(key)&&!exact(map.get(key).value,item.value))
        deny('RESTORE_MERGE_CONFLICT');
      map.set(key,item);
    }
    stores[name]=[...map.values()].sort((a,b)=>{
      const x=a.key,y=b.key;
      if(typeof indexedDB!=='undefined'&&typeof indexedDB.cmp==='function')
        return indexedDB.cmp(x,y);
      if(typeof x==='number'&&typeof y==='number')return x-y;
      return String(x).localeCompare(String(y),'en');
    }).map(row=>({key:structuredClone(row.key),value:serializeClone(row.value)}));
  }
  const snapshot={schema:1,stores};
  validatePcmsSnapshot(snapshot);
  return snapshot;
}
