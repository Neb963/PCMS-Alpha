// S03: read-only, main-pinned GitHub catalog. No source, provider or Git mutation.
// Credentials are ephemeral per invocation; never return them to callers.
const ORIGIN = 'https://api.github.com/repos/';
const SHA = /^[0-9a-f]{40}$/;
const REPO = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const SLUG = /^[a-z0-9][a-z0-9-]{0,99}$/;
const SAFE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
const PROMPT = 'pcms/prompts/default-chat1.md';
const error = code => ({ok:false,code,complete:false});
const validPath = s => typeof s === 'string' && s.length <= 512 &&
  s === s.normalize('NFC') && s.split('/').every(x =>
    SAFE.test(x) && x !== '.' && x !== '..' && !x.endsWith('.'));
const managed = s => s === PROMPT || s === 'pcms' ||
  s === 'pcms/prompts' || s === 'generators' || s.startsWith('generators/');
const hex = bytes => [...new Uint8Array(bytes)].map(x => x.toString(16).padStart(2,'0')).join('');
const utf8 = new TextDecoder('utf-8',{fatal:true});
export const S03_PROMPT_PATH = PROMPT;
export function validRepository(repository) {return REPO.test(repository || '') && repository === repository.normalize('NFC');}
export function recognizedSlug(slug){return SLUG.test(slug || '');}
export function catalogScopeFingerprint(rows) {
  // This is a stable *scope* identity, not cryptographic authorization.
  // Comparison also checks every exact material item separately.
  return rows.map(x=>JSON.stringify([x.slug,x.markerOid,x.ready,x.sourceState,x.folderTreeOid||null,x.testingOid||null]))
    .sort().join('\n');
}
export function compareCatalogScopes(pinned, current) {
  if(!pinned?.ok || !current?.ok || !pinned.complete || !current.complete ||
    pinned.repositoryId !== current.repositoryId)return error('IMPORT_SCOPE_UNVERIFIED');
  if(catalogScopeFingerprint(pinned.generators) !== catalogScopeFingerprint(current.generators))
    return error('IMPORT_SCOPE_CHANGED');
  return {ok:true,code:'IMPORT_SCOPE_UNCHANGED',head:current.head};
}
export function makeInitialImportPreview(catalog, observations = []) {
  if(!catalog?.ok || !catalog.complete)return error('CATALOG_INCOMPLETE');
  const bySlug=new Map();
  for(const o of observations){
    if(!recognizedSlug(o?.slug) || bySlug.has(o.slug))return error('OWNERSHIP_FACTS_UNVERIFIED');
    bySlug.set(o.slug,o);
  }
  const items=catalog.generators.map(g=>{
    const o=bySlug.get(g.slug);
    const evidence=o?.state==='OWNED_VERIFIED' && o?.ownerVerified===true ? 'OWNED_VERIFIED':
      o?.state==='MISSING_VERIFIED' && o?.absenceVerified===true ? 'MISSING_VERIFIED':
      'AMBIGUOUS';
    return {slug:g.slug,folder:g.folder,ready:g.ready,sourceState:g.sourceState,
      markerOid:g.markerOid,observed:evidence,
      accountId:evidence!=='AMBIGUOUS'&&typeof o?.accountId==='string'?o.accountId:null,
      proposedAccountId:evidence==='MISSING_VERIFIED' &&
        typeof o?.proposedAccountId==='string'?o.proposedAccountId:null};
  });
  const unresolved=items.filter(x=>x.observed==='AMBIGUOUS' ||
    (x.observed==='MISSING_VERIFIED'&&!x.proposedAccountId)).length;
  return {ok:true,code:unresolved?'IMPORT_PREVIEW_NEEDS_FACTS':'IMPORT_PREVIEW_COMPLETE',
    repository:catalog.repository,repositoryId:catalog.repositoryId,head:catalog.head,
    scopeFingerprint:catalogScopeFingerprint(catalog.generators),
    items,unresolved,requiresExplicitInitialApproval:true,approved:false};
}
function blobBytes(content) {
  if(typeof content!=='string'||content.length>1048576 ||
    !/^[A-Za-z0-9+/\s=]*$/.test(content))throw Error('INVALID_BLOB');
  return Uint8Array.from(atob(content.replace(/\s/g,'')),c=>c.charCodeAt(0));
}
async function verifyBlob(bytes,oid){
  const pre=new TextEncoder().encode('blob '+bytes.length+'\0');
  const all=new Uint8Array(pre.length+bytes.length);
  all.set(pre);all.set(bytes,pre.length);
  return hex(await crypto.subtle.digest('SHA-1',all))===oid;
}
export async function scanMainCatalog({token,repository='Neb963/per-gens',maxRequests=4096}, transport=fetch) {
  if(!validRepository(repository))return error('REPOSITORY_INVALID');
  if(typeof token!=='string'||token.length<12||token.length>512||
     !/^[\x21-\x7e]+$/.test(token))return error('GIT_CREDENTIAL_REQUIRED');
  if(!Number.isSafeInteger(maxRequests)||maxRequests<3||maxRequests>16384)
    return error('REQUEST_BUDGET_INVALID');
  const ROOT=ORIGIN+repository;
  let requests=0;
  async function get(route) {
    if(++requests>maxRequests)throw Error('CATALOG_INCOMPLETE');
    const response=await transport(ROOT+route,{
      method:'GET',credentials:'omit',cache:'no-store',redirect:'error',
      headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,
        'X-GitHub-Api-Version':'2022-11-28'}
    });
    if(response?.status===401||response?.status===403||response?.status===404)
      throw Error('GIT_ACCESS_DENIED');
    if(response?.status!==200)throw Error('GIT_UNAVAILABLE');
    return await response.json();
  }
  async function tree(sha) {
    if(!SHA.test(sha))throw Error('CATALOG_INCOMPLETE');
    const data=await get('/git/trees/'+sha);
    if(data?.truncated!==false||!Array.isArray(data.tree))throw Error('CATALOG_INCOMPLETE');
    return data.tree;
  }
  async function fallback(rootSha){
    // Walk *only* the allowed subtrees; unrelated repo files are out of scope.
    const found=[];
    const root=await tree(rootSha);
    const queue=[];
    for(const item of root){
      if(item.path==='generators'||item.path==='pcms'){
        if(item.type!=='tree'||item.mode!=='040000')throw Error('CATALOG_INCOMPLETE');
        found.push({...item,path:item.path});
        queue.push({prefix:item.path,sha:item.sha});
      }
    }
    const visited=new Set();
    while(queue.length){
      const next=queue.shift();
      if(visited.has(next.prefix))throw Error('CATALOG_INCOMPLETE');
      visited.add(next.prefix);
      for(const item of await tree(next.sha)){
        if(typeof item.path!=='string'||item.path.includes('/'))throw Error('CATALOG_INCOMPLETE');
        const path=next.prefix+'/'+item.path;
        found.push({...item,path});
        if(item.type==='tree')queue.push({prefix:path,sha:item.sha});
      }
    }
    return found;
  }
  async function readText(entry,maxBytes) {
    if(!entry||entry.type!=='blob'||entry.mode!=='100644'||
      !Number.isSafeInteger(entry.size)||entry.size>maxBytes||entry.size<0)
      throw Error('CATALOG_INCOMPLETE');
    const b=await get('/git/blobs/'+entry.sha);
    if(b?.encoding!=='base64'||b.sha!==entry.sha||b.size!==entry.size)
      throw Error('CATALOG_INCOMPLETE');
    const bytes=blobBytes(b.content);
    if(bytes.length!==entry.size || !(await verifyBlob(bytes,entry.sha)))
      throw Error('CATALOG_INCOMPLETE');
    return utf8.decode(bytes);
  }
  try{
    // A 404 on main is not evidence of an empty repository.
    const repo=await get('');
    if(repo?.full_name!==repository||repo.private!==true||
      !(typeof repo.id==='number'||typeof repo.id==='string'))
      return error('REPOSITORY_IDENTITY_UNVERIFIED');
    const ref=await get('/git/ref/heads/main');
    if(ref?.ref!=='refs/heads/main'||ref.object?.type!=='commit'||
      !SHA.test(ref.object?.sha||''))return error('MAIN_UNVERIFIED');
    const head=ref.object.sha;
    const commit=await get('/git/commits/'+head);
    if(!SHA.test(commit?.tree?.sha||''))return error('MAIN_UNVERIFIED');
    const rootSha=commit.tree.sha;
    // A truncated recursive tree is NOT a partial inventory: descend with
    // nonrecursive tree SHAs until every managed path is accounted for.
    const recursive=await get('/git/trees/'+rootSha+'?recursive=1');
    const nodes=recursive?.truncated===false&&Array.isArray(recursive.tree)?
      recursive.tree:await fallback(rootSha);
    const entries=new Map(),collisions=new Set();
    for(const e of nodes){
      if(typeof e?.path!=='string'||!managed(e.path))continue;
      if(!validPath(e.path)||!SHA.test(e.sha||'')||
        !(['blob','tree'].includes(e.type))||
        (e.type==='tree'&&e.mode!=='040000')||
        (e.type==='blob'&&(e.mode!=='100644'||!Number.isSafeInteger(e.size)||
          e.size<0||e.size>12*1024*1024)))
        throw Error('CATALOG_INCOMPLETE');
      const key=e.path.toLowerCase();
      if(collisions.has(key))throw Error('CATALOG_CONFLICT');
      collisions.add(key);
      entries.set(e.path,e);
    }
    const generatorFolders=new Map();
    for(const [path,entry] of entries){
      if(!path.startsWith('generators/'))continue;
      const parts=path.split('/'),slug=parts[1];
      if(!recognizedSlug(slug))throw Error('CATALOG_CONFLICT');
      if(!generatorFolders.has(slug))generatorFolders.set(slug,[]);
      generatorFolders.get(slug).push({path,entry,parts});
    }
    const generators=[];
    for(const [slug,files] of [...generatorFolders].sort(([a],[b])=>a.localeCompare(b,'en'))){
      const folder='generators/'+slug;
      if(entries.get(folder)?.type!=='tree')throw Error('CATALOG_INCOMPLETE');
      const marker=entries.get(folder+'/DEPLOYMENT.md');
      if(!marker)continue; // Unrecognized draft folder has no creation authority.
      const markerText=await readText(marker,16384);
      const statuses=markerText.replace(/\r\n/g,'\n').split('\n')
        .filter(x=>/^\s*Status\s*:/.test(x));
      const valid=statuses.length===1 &&
        (statuses[0]==='Status: READY'||statuses[0]==='Status: NOT_READY'||
         statuses[0]==='Status: SOURCE_PENDING');
      const ready=valid&&statuses[0]==='Status: READY';
      const deployable=files.filter(f=>f.entry.type==='blob'&&
        (f.parts.length===3&&['main.pjs','index.html'].includes(f.parts[2])||
         f.parts.length>=4&&f.parts[2]==='src'));
      const rootPjs=entries.get(folder+'/main.pjs');
      const rootHtml=entries.get(folder+'/index.html');
      const sourceState=!valid?'INVALID_DECLARATION':ready&&rootPjs?.size>0&&rootHtml?.size>0?
        'READY_UNVERIFIED_COHERENCE':'NOT_READY';
      const testing=entries.get(folder+'/TESTING.md');
      generators.push({slug,folder,markerOid:marker.sha,ready:sourceState==='READY_UNVERIFIED_COHERENCE',
        sourceState,testingOid:testing?.type==='blob'?testing.sha:null,
        sourceFiles:deployable.length,
        // A tree OID is proof of *Git* snapshot identity, not host source bytes.
        folderTreeOid:entries.get(folder).sha});
    }
    const promptEntry=entries.get(PROMPT);
    const prompt=promptEntry?{
      state:'PRESENT',path:PROMPT,oid:promptEntry.sha,
      text:await readText(promptEntry,262144)}:
      {state:'ABSENT',path:PROMPT,oid:null,text:null};
    return {ok:true,code:'CATALOG_COMPLETE',complete:true,repository,
      repositoryId:String(repo.id),head,rootTreeOid:rootSha,
      prompt,generators,recognizedCount:generators.length,
      requests,source:'PINNED_MAIN_READ_ONLY'};
  }catch(e){
    return error(['CATALOG_CONFLICT','CATALOG_INCOMPLETE','GIT_ACCESS_DENIED',
      'GIT_UNAVAILABLE'].includes(e?.message)?e.message:'CATALOG_INCOMPLETE');
  }
}
