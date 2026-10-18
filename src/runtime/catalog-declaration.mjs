// S03 independent, read-only coherent READY and full source pin. This is an
// input inspection API, not authority to stage, publish or create a generator.
// A READY line by itself is NEVER sufficient to dispatch source mutation.
import {validRepository,recognizedSlug} from './git-catalog.mjs';
const SHA=/^[a-f0-9]{40}$/;
const MAX_FILE=12*1024*1024;
const FAIL=code=>({ok:false,code});
const encoder=new TextEncoder();
const utf8=new TextDecoder('utf-8',{fatal:true});
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('');
const validPath=p=>typeof p==='string'&&p.length<=512&&p===p.normalize('NFC')&&
  p.split('/').every(s=>/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(s)&&
    s!=='.'&&s!=='..'&&!s.endsWith('.'));
function bytes(base64){
  if(typeof base64!=='string'||base64.length>MAX_FILE*1.4+1000||
     !/^[A-Za-z0-9+/\s=]*$/.test(base64))throw Error('INVALID_BLOB');
  return Uint8Array.from(atob(base64.replace(/\s/g,'')),x=>x.charCodeAt(0));
}
const fingerprint=async text=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(text)));
async function verify(raw,sha){
  const pre=encoder.encode('blob '+raw.length+'\0'),combined=new Uint8Array(pre.length+raw.length);
  combined.set(pre);combined.set(raw,pre.length);
  return hex(await crypto.subtle.digest('SHA-1',combined))===sha;
}
export function parseReadyDeclaration(text){
  if(typeof text!=='string')return FAIL('DECLARATION_INVALID');
  const lines=text.replace(/\r\n/g,'\n').split('\n');
  const statuses=lines.filter(l=>/^\s*Status\s*:/.test(l));
  const revisions=lines.filter(l=>/^\s*Ready-Revision\s*:/.test(l));
  if(statuses.length!==1||revisions.length>1)return FAIL('DECLARATION_INVALID');
  if(!['Status: READY','Status: NOT_READY','Status: SOURCE_PENDING'].includes(statuses[0]))
    return FAIL('DECLARATION_INVALID');
  const ready=statuses[0]==='Status: READY';
  if(!ready)return {ok:true,ready:false,token:null,legacy:false};
  if(revisions.length===0)return {ok:true,ready:true,token:null,legacy:true};
  const match=/^Ready-Revision: ([A-Za-z0-9_.:-]{8,128})$/.exec(revisions[0]);
  return match?{ok:true,ready:true,token:match[1],legacy:false}:FAIL('READY_REVISION_INVALID');
}
export async function inspectReadyCandidate({
  repository,token,slug,pinnedHead,includeSourceBytes=false,maxRequests=4096
},transport=fetch){
  if(!validRepository(repository)||!recognizedSlug(slug)||!SHA.test(pinnedHead||'')||
     typeof token!=='string'||token.length<12||token.length>512||
     !/^[\x21-\x7e]+$/.test(token))return FAIL('READY_INSPECTION_INVALID');
  const base='https://api.github.com/repos/'+repository,folder='generators/'+slug;
  let requests=0;
  async function get(route){
    if(++requests>maxRequests)throw Error('READY_BUDGET_EXHAUSTED');
    const r=await transport(base+route,{method:'GET',credentials:'omit',redirect:'error',
      cache:'no-store',headers:{Accept:'application/vnd.github+json',
        Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2022-11-28'}});
    if(r?.status!==200)throw Error('READY_TRANSPORT_UNAVAILABLE');
    return r.json();
  }
  async function tree(sha){
    if(!SHA.test(sha))throw Error('READY_TREE_UNVERIFIED');
    const r=await get('/git/trees/'+sha);
    if(r?.truncated!==false||!Array.isArray(r.tree))throw Error('READY_TREE_INCOMPLETE');
    return r.tree;
  }
  async function snapshot(commitSha){
    const commit=await get('/git/commits/'+commitSha);
    if(!SHA.test(commit?.tree?.sha||''))throw Error('READY_COMMIT_UNVERIFIED');
    const recursive=await get('/git/trees/'+commit.tree.sha+'?recursive=1');
    if(recursive?.truncated===false&&Array.isArray(recursive.tree))
      return recursive.tree.filter(x=>x.path===folder||x.path.startsWith(folder+'/'));
    // Follow the actual root->generators->slug tree OIDs. Never accept
    // GitHub's truncated prefix as a complete manifest.
    const root=await tree(commit.tree.sha);
    const generators=root.filter(x=>x.path==='generators');
    if(generators.length!==1||generators[0].type!=='tree')throw Error('READY_FOLDER_MISSING');
    const scopes=await tree(generators[0].sha);
    const target=scopes.filter(x=>x.path===slug);
    if(target.length!==1||target[0].type!=='tree')throw Error('READY_FOLDER_MISSING');
    const output=[{path:folder,sha:target[0].sha,type:'tree',mode:'040000'}];
    const queue=[{prefix:folder,sha:target[0].sha}],visited=new Set();
    while(queue.length){
      const next=queue.shift();
      if(visited.has(next.prefix))throw Error('READY_TREE_CONFLICT');
      visited.add(next.prefix);
      for(const x of await tree(next.sha)){
        if(typeof x.path!=='string'||x.path.includes('/'))throw Error('READY_TREE_INCOMPLETE');
        const entry={...x,path:next.prefix+'/'+x.path};
        output.push(entry);
        if(x.type==='tree')queue.push({prefix:entry.path,sha:x.sha});
      }
    }
    return output;
  }
  async function readBlob(entry){
    if(entry?.type!=='blob'||entry.mode!=='100644'||!SHA.test(entry.sha||'')||
       !Number.isSafeInteger(entry.size)||entry.size<0||entry.size>MAX_FILE)
      throw Error('READY_BLOB_UNVERIFIED');
    const b=await get('/git/blobs/'+entry.sha);
    if(b?.sha!==entry.sha||b.encoding!=='base64'||b.size!==entry.size)
      throw Error('READY_BLOB_UNVERIFIED');
    const raw=bytes(b.content);
    if(raw.length!==entry.size||!(await verify(raw,entry.sha)))
      throw Error('READY_BLOB_UNVERIFIED');
    return raw;
  }
  function scopeRows(rows){
    const m=new Map();
    for(const e of rows){
      if(!validPath(e?.path)||!SHA.test(e.sha||'')||m.has(e.path.toLowerCase()))
        throw Error('READY_TREE_CONFLICT');
      m.set(e.path.toLowerCase(),e);
      if(e.type==='tree'&&e.mode!=='040000')throw Error('READY_TREE_UNVERIFIED');
      if(e.type==='blob'&&(e.mode!=='100644'||!Number.isSafeInteger(e.size)||
        e.size<0||e.size>MAX_FILE))throw Error('READY_TREE_UNVERIFIED');
      if(!['tree','blob'].includes(e.type))throw Error('READY_TREE_UNVERIFIED');
    }
    return m;
  }
  try{
    const repo=await get('');
    if(repo?.full_name!==repository||repo.private!==true)return FAIL('READY_REPOSITORY_UNVERIFIED');
    const ref=await get('/git/ref/heads/main');
    if(ref?.ref!=='refs/heads/main'||ref.object?.sha!==pinnedHead||
       ref.object?.type!=='commit')return FAIL('READY_MAIN_MOVED');
    const current=scopeRows(await snapshot(pinnedHead));
    const marker=current.get((folder+'/DEPLOYMENT.md').toLowerCase());
    if(!marker)return FAIL('READY_MARKER_ABSENT');
    const markerText=utf8.decode(await readBlob(marker));
    const parsed=parseReadyDeclaration(markerText);
    if(!parsed.ok||!parsed.ready)return FAIL(parsed.code||'READY_REVOKED');
    // GitHub's path-scoped commits list is constrained to ancestry of the
    // pinned commit; the first changed marker identifies the declaration event.
    const changes=await get('/commits?sha='+pinnedHead+'&path='+
      encodeURIComponent(folder+'/DEPLOYMENT.md')+'&per_page=1');
    if(!Array.isArray(changes)||changes.length!==1||!SHA.test(changes[0]?.sha||''))
      return FAIL('READY_DECLARATION_HISTORY_UNVERIFIED');
    const introduced=changes[0].sha;
    const declared=scopeRows(await snapshot(introduced));
    const declaredMarker=declared.get((folder+'/DEPLOYMENT.md').toLowerCase());
    if(declaredMarker?.sha!==marker.sha)
      return FAIL('READY_DECLARATION_DRIFT');
    const candidates=[];
    for(const [path,entry] of declared){
      const relative=entry.path.slice(folder.length+1);
      if(!relative||entry.type==='tree')continue;
      if(relative==='main.pjs'||relative==='index.html'||relative.startsWith('src/')){
        if(relative.startsWith('src/')&&!validPath(relative))throw Error('READY_TREE_UNVERIFIED');
        candidates.push({path:relative,sha:entry.sha,size:entry.size,entry});
      }else if(!['DEPLOYMENT.md','TESTING.md','README.md'].includes(relative))
        throw Error('READY_UNSUPPORTED_SOURCE_PATH');
    }
    if(!candidates.some(e=>e.path==='main.pjs'&&e.size>0)||
       !candidates.some(e=>e.path==='index.html'&&e.size>0))
      return FAIL('READY_SOURCE_INCOMPLETE');
    for(const c of candidates){
      const latest=current.get((folder+'/'+c.path).toLowerCase());
      if(latest?.sha!==c.sha||latest.size!==c.size)
        return FAIL('READY_SOURCE_DRIFT_AFTER_DECLARATION');
    }
    const newestPaths=[...current.values()].filter(e=>e.type==='blob'&&
      (e.path===folder+'/main.pjs'||e.path===folder+'/index.html'||
       e.path.startsWith(folder+'/src/'))).map(e=>e.path.slice(folder.length+1));
    if(newestPaths.length!==candidates.length||
       newestPaths.some(p=>!candidates.some(c=>c.path===p)))
      return FAIL('READY_SOURCE_DRIFT_AFTER_DECLARATION');
    const files=[];
    for(const c of candidates.sort((a,b)=>a.path.localeCompare(b.path,'en'))){
      const raw=await readBlob(c.entry);
      const sha256=hex(await crypto.subtle.digest('SHA-256',raw));
      files.push({path:c.path,size:c.size,sha256,oid:c.sha,
        ...(includeSourceBytes?{base64:btoa(String.fromCharCode(...raw))}:{})});
    }
    const inputFingerprint=await fingerprint('PCMS_SOURCE_V1\n'+files.map(f=>
      JSON.stringify([f.path,f.size,f.sha256])).join('\n'));
    const testing=current.get((folder+'/TESTING.md').toLowerCase());
    const optionalTesting=testing?{state:'PRESENT',oid:testing.sha,
      sha256:hex(await crypto.subtle.digest('SHA-256',await readBlob(testing)))}:
      {state:'ABSENT',oid:null,sha256:null};
    return {ok:true,code:'READY_COHERENT_INPUT_PINNED',
      repository,slug,pinnedHead,declarationCommit:introduced,markerOid:marker.sha,
      token:parsed.token,legacy:parsed.legacy,inputFingerprint,files,optionalTesting,
      declarationIdentity:parsed.legacy?
        ['legacy',introduced,marker.sha].join(':'):
        ['v1',parsed.token,introduced,marker.sha].join(':'),
      requests};
  }catch(e){
    return FAIL(['READY_TREE_INCOMPLETE','READY_SOURCE_DRIFT_AFTER_DECLARATION',
      'READY_UNSUPPORTED_SOURCE_PATH','READY_BUDGET_EXHAUSTED',
      'READY_TREE_CONFLICT','READY_BLOB_UNVERIFIED','READY_TRANSPORT_UNAVAILABLE',
      'READY_TREE_UNVERIFIED'].includes(e?.message)?e.message:'READY_INSPECTION_UNVERIFIED');
  }
}
