// Read-only canonical snapshots. Viewing bytes grants no test/publication authority.
import {createStagingStore} from './staging-store.mjs';
import {createAiStore} from './ai-store.mjs';
import {exactSource,diffSource} from './staging-core.mjs';
import {evaluation} from './ai-evidence.mjs';
const fail=code=>({ok:false,code});
export function createLocalSourceReview(db,{stageFactory=createStagingStore,aiFactory=createAiStore}={}){
 async function snapshot(slug){
  const [stage,job]=await Promise.all([stageFactory(db).getFull(slug),aiFactory(db).getJobFull(slug)]);
  if(!stage.ok)return fail('REVIEW_STAGE_UNAVAILABLE');
  const r=stage.record,j=job.ok&&job.job.stageRevision===r.revision?job.job:null;
  const stored=j?.finalSource||r.candidate;
  const [source,previous]=await Promise.all([exactSource(stored?.blobs),exactSource(r.previous?.blobs)]);
  if(!source.ok||source.fingerprint!==stored?.fingerprint||!previous.ok||previous.fingerprint!==r.previous.fingerprint)
   return fail('REVIEW_STORED_SOURCE_CORRUPT');
  const tests=j?evaluation(j):{state:'UNVERIFIED'};
  return {ok:true,source,previous,summary:{ok:true,slug,stageRevision:r.revision,jobRevision:j?.revision||0,
   sourceFingerprint:source.fingerprint,previousFingerprint:previous.fingerprint,
   files:source.files,priorFiles:previous.files,diff:diffSource(previous,source).changes,
   sourceKind:j?.finalSource?'DEVELOPMENT_SNAPSHOT':'STAGED_INPUT',
   tests:{state:tests.state,default:(j?.prompt?.tests||[]).map(name=>({name,result:j.chat1?.tests?.[name]?.result||'UNVERIFIED'})),
    optional:(j?.optionalTesting?.tests||[]).map(name=>({name,result:j.chat2?.tests?.[name]?.result||'UNVERIFIED'}))},
   sourceHead:r.sourceHead,sourceFolder:r.sourceFolder,accountId:r.accountId,remotePublicId:r.remotePublicId,
   publication:'SEPARATE_CURRENT_SOURCE_APPROVAL_REQUIRED'}};
 }
 async function view(slug){const s=await snapshot(slug);return s.ok?s.summary:s;}
 async function chunk(p){
  const s=await snapshot(p.slug);if(!s.ok)return s;
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
 return Object.freeze({view,chunk});
}
