// R4: structural Git folder disappearance and possible identity change.
// Only independently complete main revisions enter here. A rename candidate
// is NOT a provider instruction or proof that two folders share ownership.
const SLUG=/^[a-z0-9][a-z0-9-]{0,99}$/;
const SHA=/^[0-9a-f]{40}$/;
const RID=/^[1-9][0-9]{0,19}$/;
export const REVIEW_KEY='pcmsR4FolderIdentityReviews';
function validSnapshot(s){
 return s&&s.complete===true&&RID.test(s.repositoryId||'')&&
   SHA.test(s.head||'')&&Array.isArray(s.generators)&&
   s.generators.length<=100000&&s.generators.every(g=>
      SLUG.test(g.slug||'')&&SHA.test(g.markerOid||'')&&(!g.folderTreeOid||SHA.test(g.folderTreeOid)));
}
export function planMainFolderChanges(prior,current,records=[]){
 if(!validSnapshot(current))return {ok:false,code:'MAIN_SNAPSHOT_INCOMPLETE'};
 if(prior&&!validSnapshot(prior))return {ok:false,code:'PRIOR_SNAPSHOT_UNVERIFIED'};
 if(prior&&prior.repositoryId!==current.repositoryId)
   return {ok:false,code:'REPOSITORY_IDENTITY_CHANGED'};
 if(!Array.isArray(records)||records.length>20000)return {ok:false,code:'REVIEW_STATE_INVALID'};
 const old=new Map((prior?.generators||[]).map(g=>[g.slug,g]));
 const now=new Map(current.generators.map(g=>[g.slug,g]));
 if(old.size!==(prior?.generators?.length||0)||now.size!==current.generators.length)
   return {ok:false,code:'DUPLICATE_SLUG'};
 const added=prior?[...now.keys()].filter(s=>!old.has(s)):[];
 const missing=prior?[...old.keys()].filter(s=>!now.has(s)):[];
 // An apparent rename can be one-to-one only with an exact independent
 // source-folder match. Otherwise hold each new identity as ambiguous.
 const relevant=records.filter(r=>r.repositoryId===current.repositoryId&&
   (r.oldSlug===null||SLUG.test(r.oldSlug||''))&&SLUG.test(r.newSlug||''));
 const created=[];
 if(missing.length&&added.length){
  for(const slug of added){
   const candidate=now.get(slug);
   const exact=missing.filter(s=>SHA.test(candidate.folderTreeOid||'')&&
     old.get(s)?.folderTreeOid===candidate.folderTreeOid);
   const possible=exact.length===1?exact[0]:missing.length===1?missing[0]:null;
   const oldSlug=possible||null;
   if(!relevant.some(r=>r.newSlug===slug)){
    created.push({repositoryId:current.repositoryId,oldSlug,newSlug:slug,
      oldTreeOid:oldSlug?old.get(oldSlug).folderTreeOid:null,
      newTreeOid:candidate.folderTreeOid,markerOid:candidate.markerOid,
      evidenceHead:current.head,state:'REVIEW_REQUIRED',revision:1,
      reason:exact.length===1?'EXACT_FOLDER_TREE_MATCH':'IDENTITY_AMBIGUOUS'});
   }
  }
 }
 const review=[...relevant,...created];
 const held=[];
 const stale=[];
 for(const rec of review){
  const target=now.get(rec.newSlug);
  // Material change in candidate bytes revokes a previously approved choice.
  const stable=target&&target.folderTreeOid===rec.newTreeOid&&
    target.markerOid===rec.markerOid;
  // A disappeared original folder may be restored while a pending choice is
  // being reviewed. That invalidates any apparent-rename assumption; a prior
  // "create separate" approval must not silently resume creation.
  const originalReturned=Boolean(rec.oldSlug&&now.has(rec.oldSlug));
  if(!stable||originalReturned){stale.push(rec.newSlug);held.push(rec.newSlug);continue;}
  if(!['CREATE_SEPARATE_APPROVED','RENAME_EXISTING_COMPLETED'].includes(rec.state))
    held.push(rec.newSlug);
 }
 return {ok:true,added,missing,created,review,held:[...new Set(held)],
   stale:[...new Set(stale)],source:'COMPLETE_MAIN_DIFF',providerEffects:'OFF'};
}
export function chooseFolderIdentity(plan,{newSlug,choice,expectedTreeOid}){
 if(!plan?.ok||!SLUG.test(newSlug||'')||!SHA.test(expectedTreeOid||'')||
   !['CREATE_SEPARATE','RENAME_EXISTING'].includes(choice))
   return {ok:false,code:'INVALID_IDENTITY_CHOICE'};
 const row=plan.review?.find(r=>r.newSlug===newSlug);
 if(!row||row.state!=='REVIEW_REQUIRED')
   return {ok:false,code:'IDENTITY_REVIEW_NOT_PENDING'};
 if(row.newTreeOid!==expectedTreeOid)
   return {ok:false,code:'IDENTITY_SOURCE_CHANGED'};
 if(choice==='RENAME_EXISTING'&&!row.oldSlug)
   return {ok:false,code:'ORIGINAL_IDENTITY_AMBIGUOUS'};
 // Choice is durable intent only. Existing-target rename requires a separate
 // owner, source, route and provider feasibility proof before ANY effect.
 return {ok:true,record:{...row,state:choice==='CREATE_SEPARATE'?
   'CREATE_SEPARATE_APPROVED':'RENAME_EXISTING_REQUESTED'},
   providerEffects:'OFF',requiresOwnerReadback:choice==='RENAME_EXISTING'};
}
