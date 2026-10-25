// C52: one human decision over an immutable selected set of unchanged,
// independently tested source. Every individual publication keeps its normal
// current Git/owner/editor/route checks and dispatch journal.
import {createStagingStore} from './staging-store.mjs';
import {createAiStore} from './ai-store.mjs';
import {createReadyStore} from './ready-store.mjs';
import {createWritebackStore} from './writeback-store.mjs';
import {createReleaseStore} from './release-store.mjs';
import {createS06HumanStore} from './s06-human-review.mjs';
import {createS06ChangeStore} from './s06-request-changes.mjs';
import {planS06Writeback} from './s06-writeback-progress.mjs';
import {releaseContext,releaseTestContext,approvalTuple,matchesApproval,releaseCandidateKind} from './release-core.mjs';
import {exactSource} from './staging-core.mjs';
const fail=code=>({ok:false,code}),key=id=>'clean-bulk:'+id;
export const cleanBulkId=id=>typeof id==='string'&&/^clean_[a-z0-9]{8,16}_[a-f0-9]{32}$/.test(id);
const hash=async value=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const read=(db,k)=>new Promise((resolve,reject)=>{const q=db.transaction('meta','readonly').objectStore('meta').get(k);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(Error('BULK_READ_FAILED'))});
const terminal=item=>['CONFIRMED','CANCELED'].includes(item.state)||item.state==='HELD'&&item.requiresNewReview;
export async function inspectCleanCandidate(db,slug){
 const [stage,job,ready,writeback,human,change]=await Promise.all([createStagingStore(db).getFull(slug),createAiStore(db).getJobFull(slug),createReadyStore(db).get(slug),createWritebackStore(db).getFull(slug),createS06HumanStore(db).get(slug),createS06ChangeStore(db).get(slug)]);
 if(!stage.ok||!job.ok||!ready.ok||!writeback.ok)return fail('CLEAN_CANDIDATE_NOT_READY');
 const s=stage.record,j=job.job;
 if(j.operatorPaused||j.exceptionFrozen||s.humanReclaimPending||human?.state==='DEFERRED'||(change?.state==='REQUESTED'&&change.parentStageRevision===s.revision))return fail('CLEAN_CANDIDATE_OPERATOR_HOLD');
 if(!releaseTestContext(s,j).ok)return fail('CLEAN_INDEPENDENT_TESTS_REQUIRED');
 const decision=planS06Writeback({ready,stage,job,writeback});
 if(!decision.ok||decision.type!=='REVIEW'||decision.mode!=='S06')return fail('CLEAN_CONFIRMED_GIT_SOURCE_REQUIRED');
 const [source,previous,accountRow,inventoryRow]=await Promise.all([exactSource(j.finalSource?.blobs),exactSource(s.previous?.blobs),read(db,'account:'+s.accountId),read(db,'inventory:'+slug)]);
 if(!source.ok||source.fingerprint!==j.verifiedFinal||!previous.ok||previous.fingerprint!==s.previous.fingerprint)return fail('CLEAN_SOURCE_BYTES_UNVERIFIED');
 if(!releaseContext(s,accountRow?.account,inventoryRow?.generator).ok)return fail('CLEAN_OWNER_CHANGED');
 // This is the immutable DECLARED input hash domain, not previous-public P
 // and not a child stage which may already contain AI-modified source.
 const input=await hash('PCMS_SOURCE_V1\n'+[...source.files].sort((a,b)=>a.path.localeCompare(b.path,'en')).map(f=>JSON.stringify([f.path,f.size,f.sha256])).join('\n'));
 if(input!==ready.record.active?.inputFingerprint||input!==s.readyInputFingerprint)return fail('MODIFIED_SOURCE_REQUIRES_INDIVIDUAL_REVIEW');
 const existing=(await read(db,'existing-update:'+slug))?.record;
 const kind=releaseCandidateKind(s,inventoryRow?.generator,existing);
 const approval=approvalTuple({slug,stage:s,job:j,source,previous,git:{ok:true,testingSha:s.testingSha},kind});
 if(!approval.ok)return approval;
 return {ok:true,snapshot:{tuple:approval.tuple,readyIdentifier:s.readyIdentifier,readyInputFingerprint:input,writebackCommit:writeback.record.commitSha}};
}
function transact(db,run){return new Promise((resolve,reject)=>{let result=fail('CLEAN_BULK_TRANSACTION_INCOMPLETE');const t=db.transaction(['meta','events'],'readwrite');t.oncomplete=()=>resolve(result);t.onabort=()=>reject(Error('CLEAN_BULK_TRANSACTION_ABORTED'));try{run(t.objectStore('meta'),t,x=>result=x)}catch{t.abort()}})}
const view=(r,{offset=0,limit=25}={})=>{
 const all=[...r.items,...r.excluded],counts={};for(const item of all)counts[item.state]=(counts[item.state]||0)+1;
 return {ok:true,id:r.id,revision:r.revision,state:r.state,digest:r.digest,totalSelected:all.length,eligible:r.items.length,excluded:r.excluded.length,counts,
  approvedAt:r.approvedAt||null,createdAt:r.createdAt,offset,more:offset+limit<all.length,
  items:all.slice(offset,offset+limit).map(x=>({slug:x.slug,state:x.state,code:x.code||null,sourceFingerprint:x.snapshot?.tuple?.sourceFingerprint||null,requiresNewReview:x.requiresNewReview===true}))};
};
export function createCleanBulkStore(db){
 const getFull=async id=>{if(!cleanBulkId(id))return fail('CLEAN_BULK_ID_INVALID');const row=await read(db,key(id));return row?.record?{ok:true,record:row.record}:fail('CLEAN_BULK_NOT_FOUND')};
 const get=async(id,page={})=>{const r=await getFull(id);return r.ok?view(r.record,page):r};
 async function prepare(slugs){
  if(!Array.isArray(slugs)||!slugs.length||slugs.length>100000||new Set(slugs).size!==slugs.length||slugs.some(s=>typeof s!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(s)))return fail('CLEAN_BULK_SELECTION_INVALID');
  const items=[],excluded=[];
  for(const slug of [...slugs].sort()){
   const release=await createReleaseStore(db).get(slug);
   if(release.ok&&['APPROVED','DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN','RECOVERY_HOLD'].includes(release.state)){excluded.push({slug,state:'EXCLUDED',code:'EXISTING_PUBLICATION_REQUIRES_INSPECTION'});continue}
   const out=await inspectCleanCandidate(db,slug);
   if(!out.ok){excluded.push({slug,state:'EXCLUDED',code:out.code});continue}
   if(release.ok&&release.state==='CONFIRMED_PUBLIC'&&release.sourceFingerprint===out.snapshot.tuple.sourceFingerprint&&release.stageRevision===out.snapshot.tuple.stageRevision&&release.jobRevision===out.snapshot.tuple.jobRevision){excluded.push({slug,state:'EXCLUDED',code:'EXACT_SOURCE_ALREADY_PUBLISHED'});continue}
   items.push({slug,state:'PENDING',snapshot:out.snapshot,previousRelease:release.ok?{releaseId:release.releaseId,revision:release.revision,state:release.state}:null});
  }
  const id='clean_'+Date.now().toString(36)+'_'+crypto.randomUUID().replaceAll('-',''),digest=await hash(JSON.stringify(items.map(x=>[x.slug,x.snapshot,x.previousRelease])));
  const record={id,revision:1,state:'DRAFT',digest,createdAt:Date.now(),items,excluded,cursor:0};
  return transact(db,(m,t,done)=>{m.add({key:key(id),record});t.objectStore('events').add({stage:'CLEAN_PUBLICATION_SET_PREPARED',id,digest,eligible:items.length,excluded:excluded.length,providerEffects:'NONE'});done(view(record))});
 }
 function approve(id,expectedRevision,digest){return transact(db,(m,t,done)=>m.get(key(id)).onsuccess=e=>{
  const r=e.target.result?.record;if(!r||r.revision!==expectedRevision||r.digest!==digest||r.state!=='DRAFT'||!r.items.length){done(fail('CLEAN_BULK_APPROVAL_STALE'));return}
  const names=new Set(r.items.map(x=>x.slug));let overlap=false;
  m.openCursor().onsuccess=scan=>{const c=scan.target.result;if(c){const other=c.value?.record;if(typeof c.key==='string'&&c.key.startsWith('clean-bulk:')&&other.id!==id&&['APPROVED','CANCEL_REQUESTED'].includes(other.state)&&other.items.some(x=>!terminal(x)&&names.has(x.slug)))overlap=true;c.continue();return}
   if(overlap){done(fail('CLEAN_BULK_ALREADY_ACTIVE'));return}
   const next={...r,revision:r.revision+1,state:'APPROVED',approvedAt:Date.now()};m.put({key:key(id),record:next});t.objectStore('events').add({stage:'CLEAN_PUBLICATION_SET_APPROVED',id,digest,exactSources:r.items.length});done(view(next));
  };
 });}
 function update(id,expectedRevision,index,patch){return transact(db,(m,t,done)=>m.get(key(id)).onsuccess=e=>{
  const r=e.target.result?.record;if(!r||r.revision!==expectedRevision||!['APPROVED','CANCEL_REQUESTED'].includes(r.state)||!Number.isInteger(index)||!r.items[index]){done(fail('CLEAN_BULK_CHANGED'));return}
  const items=r.items.map((x,i)=>i===index?{...x,...patch}:x),next={...r,revision:r.revision+1,items,cursor:(index+1)%items.length};
  if(items.every(terminal))next.state='FINISHED';m.put({key:key(id),record:next});done(view(next));
 });}
 function cancel(id,expectedRevision){return transact(db,(m,t,done)=>m.get(key(id)).onsuccess=e=>{const r=e.target.result?.record;
  if(!r||r.revision!==expectedRevision||!['DRAFT','APPROVED'].includes(r.state)){done(fail('CLEAN_BULK_CHANGED'));return}
  if(r.state==='DRAFT'){const next={...r,revision:r.revision+1,state:'CANCELED'};m.put({key:key(id),record:next});done(view(next));return}
  // Revoke the set and every unsent batch approval in the same transaction
  // used by publication dispatch; possible effects remain reconciliation-only.
  const items=structuredClone(r.items);let at=0;
  function next(){if(at===items.length){const record={...r,revision:r.revision+1,items,state:items.every(terminal)?'FINISHED':'CANCEL_REQUESTED'};
    m.put({key:key(id),record});t.objectStore('events').add({stage:'CLEAN_PUBLICATION_SET_CANCELED',id,possibleEffects:'RECONCILE_ONLY'});done(view(record));return}
   const item=items[at++];if(terminal(item)){next();return}
   m.get('release:'+item.slug).onsuccess=rl=>{const release=rl.target.result?.release,same=release&&matchesApproval(release.approval,item.snapshot.tuple).ok;
    if(same&&['DISPATCH_POSSIBLE','PUBLICATION_UNCERTAIN','RECOVERY_HOLD'].includes(release.state)){item.state='VERIFYING';item.code='POSSIBLE_PUBLICATION_RECONCILE_ONLY';}
    else if(same&&release.state==='CONFIRMED_PUBLIC'){item.state='CONFIRMED';item.code='INDEPENDENT_PUBLIC_READBACK';}
    else{item.state='CANCELED';item.code='CANCELED_BEFORE_BATCH_DISPATCH';
     if(same&&release.state==='APPROVED'&&release.cleanBulkSetId===id&&release.dispatchPossible!==true){
      m.put({key:'release:'+item.slug,release:{...release,state:'CANCELED',reason:'OPERATOR_CANCELED_UNSENT_BULK',revision:release.revision+1,changedAt:Date.now()}});
      t.objectStore('events').add({stage:'RELEASE_CANCELED',slug:item.slug,releaseId:release.releaseId,sourceFingerprint:release.approval.sourceFingerprint});
     }
    }
    next();
   };
  }
  next();
 });}
 async function list({after='',limit=20,activeOnly=false}={}){return new Promise((resolve,reject)=>{const t=db.transaction('meta','readonly'),items=[];t.oncomplete=()=>{items.sort((a,b)=>a.id.localeCompare(b.id));const page=items.slice(0,limit);resolve({ok:true,items:page,more:items.length>limit,nextCursor:items.length>limit?page.at(-1).id:null})};t.onabort=reject;
  t.objectStore('meta').openCursor().onsuccess=e=>{const c=e.target.result;if(!c)return;const r=c.value?.record;if(typeof c.key==='string'&&c.key.startsWith('clean-bulk:')&&r.id>after&&(!activeOnly||['APPROVED','CANCEL_REQUESTED'].includes(r.state)))items.push({id:r.id,revision:r.revision,state:r.state,eligible:r.items.length,createdAt:r.createdAt});c.continue()};
 });}
 return Object.freeze({prepare,get,getFull,approve,update,cancel,list});
}
