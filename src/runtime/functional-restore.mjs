// Operator-initiated functional test in a NEW, disposable local database.
// Never applies donor data, alters the real journal, or grants execution.
import {DB_NAME,openCanonicalDatabase} from './journal.mjs';
import {DB_STORES,snapshotCanonicalV2,preflightSourceRecovery} from './backup-core.mjs';
import {readPortableArchive} from './portable-archive.mjs';
import {splitPortableLocal,preparePortableLocalRestore} from './portable-local.mjs';
import {prepareRestoredCanonical} from './restore-sanitize.mjs';
import {applyCanonicalSnapshot} from './restore-idb.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export async function inspectDisposableRestore(archive,{factory=globalThis.indexedDB}={}){
 const opened=await readPortableArchive(archive.blob),local=splitPortableLocal(opened.canonical);
 const uidRemap=Object.fromEntries((opened.donor.personas||[]).filter(p=>p.profile?.personaUid)
  .map(p=>[p.profile.personaUid,crypto.randomUUID()]));
 const accountChoices=Object.fromEntries(local.pcms.stores.meta.filter(r=>
  typeof r.key==='string'&&r.key.startsWith('account:')&&r.value?.account)
  .map(r=>[r.value.account.accountId,'INCLUDE_INACTIVE']));
 const empty={schema:1,stores:Object.fromEntries(DB_STORES.map(k=>[k,[]]))};
 const prepared=prepareRestoredCanonical({incoming:local.pcms,current:empty,mode:'replace',fresh:true,uidRemap,accountChoices});
 const name='pcms-diagnostic-restore-'+crypto.randomUUID(),settingKey='diagnostic:local-settings:'+name;
 const settings=preparePortableLocalRestore(local.values,{}, {mode:'replace'});
 if(local.values)prepared.stores.meta.push({key:settingKey,value:{key:settingKey,settings}});
 prepared.stores.meta.sort((a,b)=>a.key<b.key?-1:a.key>b.key?1:0);
 const open=()=>openCanonicalDatabase({open:(_name,version)=>factory.open(name,version)});
 let db=null;
 try{
  db=await open();
  const proof=await applyCanonicalSnapshot(db,prepared,{
   expectedBefore:empty,assertHeld:async()=>db?.name===name&&name!==DB_NAME});
  db.close();db=await open();
  const observed=await snapshotCanonicalV2(db,{serializedValues:true});
  if(!same(observed,prepared))throw Error('BACKUP_FUNCTIONAL_RESTORE_MISMATCH');
  const sourceAudit=await preflightSourceRecovery(observed);
  if(!same(sourceAudit,opened.archiveSourceAudit))throw Error('BACKUP_FUNCTIONAL_SOURCE_MISMATCH');
  return {ok:true,code:'ISOLATED_CANONICAL_RESTORE_REOPEN_VERIFIED',rows:proof.rows,
   sourceAudit,originalJournalChanged:false,donorEffects:'OFF',providerEffects:'OFF',
   diskReadback:false,processRestart:false,localSettingsInspected:local.values!==null};
 }finally{
  try{db?.close()}catch{}
  await new Promise(resolve=>{try{const r=factory.deleteDatabase(name);r.onsuccess=r.onerror=r.onblocked=()=>resolve()}catch{resolve()}});
 }
}
