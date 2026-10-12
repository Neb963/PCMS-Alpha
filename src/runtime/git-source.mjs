// I05: READ-ONLY Git source inspector. The sole permitted repository is the
// operator's private per-gens/main; credentials never enter canonical storage.
export const GIT_REPO = 'Neb963/per-gens';
const API = 'https://api.github.com/repos/' + GIT_REPO;
const shaOK = s => typeof s === 'string' && /^[a-f0-9]{40}$/.test(s);
const segment = s => typeof s === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(s) &&
  s !== '.' && s !== '..' && !s.endsWith('.');
export function safeFolder(path) {
  return typeof path === 'string' && path.length <= 240 &&
    path.split('/').length >= 1 &&
    path.split('/').length <= 6 && path.split('/').every(segment) &&
    path === path.normalize('NFC');
}
function safeTreePath(path) {
  return typeof path === 'string' && path.length <= 512 &&
    path.split('/').every(segment) && path === path.normalize('NFC');
}
const issue = code => ({ ok:false, code, ready:false, source:'SOURCE_PENDING' });
function bytesOfBase64(b64) {
  if (typeof b64 !== 'string' || b64.length > 18000000 ||
      !/^[a-zA-Z0-9+/=\s]*$/.test(b64)) throw Error('INVALID_BLOB');
  const raw = atob(b64.replace(/\s/g,''));
  return Uint8Array.from(raw, c => c.charCodeAt(0));
}
async function digest(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))]
    .map(x=>x.toString(16).padStart(2,'0')).join('');
}
async function verifyGitBlob(bytes, expected) {
  const head=new TextEncoder().encode('blob '+bytes.length+'\0');
  const combined=new Uint8Array(head.length+bytes.length);
  combined.set(head);combined.set(bytes,head.length);
  const actual=[...new Uint8Array(await crypto.subtle.digest('SHA-1',combined))]
    .map(x=>x.toString(16).padStart(2,'0')).join('');
  return actual===expected;
}
const UTF8 = new TextDecoder('utf-8',{fatal:true});
function readiness(raw) {
  let text;
  try {text=UTF8.decode(raw);}catch{return {valid:false,ready:false};}
  const lines=text.replace(/\r\n/g,'\n').split('\n');
  const statuses=lines.filter(line => /^\s*Status\s*:/.test(line));
  if(statuses.length!==1)return {valid:false,ready:false};
  return {valid:true,ready:statuses[0]==='Status: READY'};
}
export function compareGitSource(pinned, fresh, { pinnedTesting = true }={}) {
  if(!pinned?.ok || !fresh?.ok)return issue('SOURCE_UNVERIFIED');
  if(!fresh.ready)return issue('READY_REVOKED');
  if(pinned.folder!==fresh.folder || pinned.fingerprint!==fresh.fingerprint)
    return issue('SOURCE_DRIFT');
  // Existing jobs retain their pinned test bytes; new jobs use the latest.
  return {ok:true,code:pinned.testingSha!==fresh.testingSha?
    (pinnedTesting?'PINNED_TESTING_UNCHANGED':'TESTING_UPDATED'):'SOURCE_EQUIVALENT',
    ready:true,source:'READY',testingSha:pinnedTesting?pinned.testingSha:fresh.testingSha,
    head:fresh.head,fingerprint:fresh.fingerprint};
}
export async function inspectGitSource({token,folder}, transport=fetch) {
  if(!safeFolder(folder))return issue('UNSAFE_SOURCE_PATH');
  if(typeof token!=='string'||token.length<10||token.length>512||
    /[^\x21-\x7e]/.test(token))return issue('GITHUB_ACCESS_REQUIRED');
  let requests=0;
  async function get(route) {
    if(++requests>504)throw Error('REQUEST_LIMIT');
    const response=await transport(API+route,{
      method:'GET',credentials:'omit',cache:'no-store',redirect:'error',
      headers:{Accept:'application/vnd.github+json',
        Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}
    });
    if(!response||typeof response.status!=='number')throw Error('BAD_HTTP');
    if(response.status!==200) {
      const error=Error('HTTP_'+response.status);error.http=response.status;throw error;
    }
    // All API JSON boundaries are untrusted; no response text is exported.
    return await response.json();
  }
  try {
    let ref;
    try {ref=await get('/git/ref/heads/main');}
    catch(e) {return e.http===404||e.http===409?issue('GITHUB_UNINITIALIZED'):
      issue(e.http===401||e.http===403?'GITHUB_ACCESS_DENIED':'GITHUB_UNAVAILABLE');}
    const head=ref?.object?.sha;
    if(!shaOK(head) || ref.ref!=='refs/heads/main' ||
       ref.object?.type!=='commit')return issue('SOURCE_UNVERIFIED');
    const commit=await get('/git/commits/'+head);
    if(!shaOK(commit?.tree?.sha))return issue('SOURCE_UNVERIFIED');
    const tree=await get('/git/trees/'+commit.tree.sha+'?recursive=1');
    if(tree?.truncated!==false || !Array.isArray(tree.tree) ||
       tree.tree.length>30000)return issue('SOURCE_MANIFEST_UNSUPPORTED');
    const prefix=folder+'/',entries=[],seen=new Set();
    let found=false,bytesTotal=0;
    for(const node of tree.tree){
      const p=node?.path;
      if(p===folder) {
        if(node.type!=='tree'||node.mode!=='040000')return issue('SOURCE_MANIFEST_UNSUPPORTED');
        found=true;continue;
      }
      if(typeof p!=='string'||!p.startsWith(prefix))continue;
      if(!safeTreePath(p)||!shaOK(node.sha))return issue('SOURCE_MANIFEST_UNSUPPORTED');
      const relative=p.slice(prefix.length);
      if(!safeTreePath(relative))return issue('SOURCE_MANIFEST_UNSUPPORTED');
      const key=relative.toLowerCase();
      if(seen.has(key))return issue('SOURCE_ASSOCIATION_CONFLICT');
      seen.add(key);
      if(node.type==='tree'){
        if(node.mode!=='040000')return issue('SOURCE_MANIFEST_UNSUPPORTED');
        continue;
      }
      if(node.type!=='blob'||node.mode!=='100644' ||
         !Number.isSafeInteger(node.size)||node.size<0||
         node.size>12*1024*1024)return issue('SOURCE_MANIFEST_UNSUPPORTED');
      bytesTotal+=node.size;
      if(bytesTotal>16*1024*1024||entries.length>=500)
        return issue('SOURCE_MANIFEST_UNSUPPORTED');
      entries.push({path:relative,sha:node.sha,size:node.size});
    }
    if(!found && entries.length===0)return issue('SOURCE_PENDING');
    const marker=entries.find(x=>x.path==='DEPLOYMENT.md');
    const js=entries.find(x=>x.path==='main.pjs');
    const html=entries.find(x=>x.path==='index.html');
    // A folder with no strict marker or without both deployable root files
    // is inspectable, but cannot become a READY candidate.
    const hashes=new Map(), rawMarker={value:null};
    for(const e of entries) {
      const blob=await get('/git/blobs/'+e.sha);
      if(blob?.encoding!=='base64'||blob.sha!==e.sha||
        blob.size!==e.size)return issue('SOURCE_UNVERIFIED');
      let raw;
      try{raw=bytesOfBase64(blob.content);}catch{return issue('SOURCE_MANIFEST_UNSUPPORTED');}
      if(raw.length!==e.size || !(await verifyGitBlob(raw,e.sha)))return issue('SOURCE_UNVERIFIED');
      hashes.set(e.path,await digest(raw));
      if(e.path==='DEPLOYMENT.md')rawMarker.value=raw;
    }
    const meta=marker&&rawMarker.value?readiness(rawMarker.value):{valid:false,ready:false};
    if(marker&&!meta.valid)return issue('SOURCE_MANIFEST_UNSUPPORTED');
    // README is documentation; TESTING is separately pinned. All other
    // blobs (including arbitrary binary src/ assets) affect deployment bytes.
    const deployable=entries.filter(e=>e.path!=='TESTING.md' && e.path!=='README.md')
      .sort((a,b)=>a.path.localeCompare(b.path,'en'));
    const canonical=deployable.map(e=>JSON.stringify([e.path,e.size,hashes.get(e.path)])).join('\n');
    const fingerprint=await digest(new TextEncoder().encode('PCMS_SOURCE_V1\n'+canonical));
    const ready=Boolean(meta.ready&&js&&html&&js.size>0&&html.size>0);
    const test=entries.find(e=>e.path==='TESTING.md');
    return {ok:true,code:ready?'READY':'NOT_READY',ready,source:ready?'READY':'SOURCE_PENDING',
      repo:GIT_REPO,branch:'main',head,treeSha:commit.tree.sha,folder,
      fingerprint,testingSha:test?hashes.get('TESTING.md'):null,
      paths:entries.sort((a,b)=>a.path.localeCompare(b.path,'en')).map(e=>({
        path:e.path,size:e.size,sha256:hashes.get(e.path)
      })),files:entries.length};
  }catch{return issue('SOURCE_UNVERIFIED');}
}
