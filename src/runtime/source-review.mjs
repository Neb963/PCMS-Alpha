// Read-only canonical snapshots. Viewing bytes grants no test/publication authority.
import {createStagingStore} from './staging-store.mjs';
import {createAiStore} from './ai-store.mjs';
import {exactSource,diffSource} from './staging-core.mjs';
import {evaluation} from './ai-evidence.mjs';
const fail=code=>({ok:false,code});
export function createLocalSourceReview(db,{stageFactory=createStagingStore,aiFactory=createAiStore}={}){
 const read=key=>new Promise((resolve,reject)=>{const t=db.transaction('meta','readonly'),q=t.objectStore('meta').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(Error('REVIEW_READ_FAILED'))});
 async function history(slug,{before=0,limit=20}={}){
  const items=await new Promise((resolve,reject)=>{const t=db.transaction('meta','readonly'),q=t.objectStore('meta').openCursor(),rows=[];
   q.onsuccess=e=>{const c=e.target.result;if(!c){resolve(rows);return}
    if(typeof c.key==='string'&&c.key.startsWith('ai-history:'+slug+':')){const j=c.value?.job;
     if(j?.slug===slug&&Number.isSafeInteger(j.revision)&&j.revision>0&&(!before||j.revision<before))rows.push({revision:j.revision,stageRevision:j.stageRevision,sourceFingerprint:j.sourceFingerprint,state:j.state,at:c.value.archivedAt||j.createdAt||null})}
    c.continue()};q.onerror=()=>reject(Error('REVIEW_READ_FAILED'))});
  items.sort((a,b)=>b.revision-a.revision);const page=items.slice(0,limit);return {ok:true,slug,items:page,more:items.length>limit,nextCursor:items.length>limit?page.at(-1).revision:null};
 }
 async function snapshot(slug,historyRevision){
  const [stage,job]=await Promise.all([stageFactory(db).getFull(slug),aiFactory(db).getJobFull(slug)]);
  if(!stage.ok)return fail('REVIEW_STAGE_UNAVAILABLE');
  let r=stage.record,j=job.ok&&job.job.stageRevision===r.revision?job.job:null;
  if(historyRevision!==undefined){
   const archived=await read('ai-history:'+slug+':'+historyRevision);j=archived?.job;
   if(j?.slug!==slug||j.revision!==historyRevision)return fail('REVIEW_HISTORY_NOT_FOUND');
   if(r.revision!==j.stageRevision)r=(await read('stage-history:'+slug+':'+j.stageRevision))?.record;
   if(!r||r.slug!==slug||r.revision!==j.stageRevision)return fail('REVIEW_HISTORY_STAGE_UNAVAILABLE');
  }
  const stored=j?.finalSource||r.candidate;
  const [source,previous]=await Promise.all([exactSource(stored?.blobs),exactSource(r.previous?.blobs)]);
  if(!source.ok||source.fingerprint!==stored?.fingerprint||!previous.ok||previous.fingerprint!==r.previous?.fingerprint)
   return fail('REVIEW_STORED_SOURCE_CORRUPT');
  const tests=j?evaluation(j):{state:'UNVERIFIED'};
  return {ok:true,source,previous,summary:{ok:true,slug,stageRevision:r.revision,jobRevision:j?.revision||0,
   sourceFingerprint:source.fingerprint,previousFingerprint:previous.fingerprint,
   files:source.files,priorFiles:previous.files,diff:diffSource(previous,source).changes,
   sourceKind:historyRevision!==undefined?'HISTORICAL_CHECKPOINT':j?.finalSource?'DEVELOPMENT_SNAPSHOT':'STAGED_INPUT',
   ...(historyRevision!==undefined?{historyRevision}:{}),
   tests:{state:tests.state,default:(j?.prompt?.tests||[]).map(name=>({name,result:j.chat1?.tests?.[name]?.result||'UNVERIFIED'})),
    optional:(j?.optionalTesting?.tests||[]).map(name=>({name,result:j.chat2?.tests?.[name]?.result||'UNVERIFIED'}))},
   sourceHead:r.sourceHead,sourceFolder:r.sourceFolder,accountId:r.accountId,remotePublicId:r.remotePublicId,
   publication:'SEPARATE_CURRENT_SOURCE_APPROVAL_REQUIRED'}};
 }
 async function view(slug,historyRevision){const s=await snapshot(slug,historyRevision);return s.ok?s.summary:s;}
 async function chunk(p){
  const s=await snapshot(p.slug,p.historyRevision);if(!s.ok)return s;
  const v=s.summary;
  if(v.stageRevision!==p.stageRevision||v.jobRevision!==p.jobRevision||v.sourceFingerprint!==p.fingerprint)
   return fail('REVIEW_SNAPSHOT_CHANGED');
  const source=p.origin==='P'?s.previous:s.source,file=source.blobs.find(x=>x.path===p.path);
  if(!file)return fail('REVIEW_FILE_NOT_FOUND');
  const bytes=Uint8Array.from(atob(file.base64),c=>c.charCodeAt(0));
  if(p.offset>bytes.length)return fail('REVIEW_OFFSET_INVALID');
  const part=bytes.subarray(p.offset,p.offset+8192);let raw='';
  for(const value of part)raw+=String.fromCharCode(value);
  return {ok:true,slug:p.slug,stageRevision:v.stageRevision,jobRevision:v.jobRevision,fingerprint:v.sourceFingerprint,
   selectedFingerprint:source.fingerprint,origin:p.origin,path:p.path,offset:p.offset,length:part.length,total:bytes.length,
   fileSha256:source.files.find(f=>f.path===p.path).sha256,base64:btoa(raw),
   nextOffset:p.offset+part.length<bytes.length?p.offset+8192:null};
 }
 return Object.freeze({view,chunk,history});
}
