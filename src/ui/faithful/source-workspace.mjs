// Main-only source workspace. Read-only bytes never confer source-writer or
// publication authority. A snapshot and its selected file remain revision-bound.
export function createSourceWorkspace({root,el,b,request,reload,connect}){
 return function open(item){
  const prior=root.activeElement,overlay=el('div','drawer-overlay'),panel=el('section','drawer source-workspace');
  panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','GitHub source for '+item.slug);
  const close=()=>{epoch++;overlay.remove();if(prior?.isConnected)prior.focus({preventScroll:true})};
  const heading=el('div','drawer-head');heading.append(el('h2','drawer-title','Source · '+item.slug),b('Close',close));
  const body=el('div','drawer-body'),status=el('p','setting-note','Reading source from GitHub main…');status.setAttribute('role','status');
  const actions=el('div','form-foot'),layout=el('div','source-layout'),tree=el('nav','source-tree'),view=el('section','source-file');
  tree.setAttribute('aria-label','Source files');view.setAttribute('aria-label','Selected source file');
  const search=el('input','form-input');search.type='search';search.placeholder='Find a source file';search.setAttribute('aria-label','Find a source file');
  const list=el('div'),pager=el('div','form-foot');tree.append(search,list,pager);layout.append(tree,view);body.append(actions,status,layout);
  panel.append(heading,body);overlay.append(panel);root.append(overlay);
  let snapshot=null,folder='generators/'+item.slug,offset=0,epoch=0,busy=false,selected=item.initialPath||null;
  const call=(type,params,timeout=95000)=>request('pcms-i05-source',type,params,timeout);
  function draw(){list.replaceChildren();pager.replaceChildren();if(!snapshot)return;
   const files=snapshot.paths.filter(f=>f.path.toLowerCase().includes(search.value.trim().toLowerCase()));
   if(offset>=files.length)offset=0;
   for(const file of files.slice(offset,offset+50)){
    const choose=b(file.path,()=>void showFile(file),'source-file-button');choose.dataset.sourcePath=file.path;
    choose.setAttribute('aria-current',String(selected===file.path));list.append(choose);
   }
   if(!files.length)list.append(el('p','setting-note','No matching files.'));
   const prev=b('Previous',()=>{offset=Math.max(0,offset-50);draw()},'btn small'),next=b('Next',()=>{offset+=50;draw()},'btn small');
   prev.disabled=offset===0;next.disabled=offset+50>=files.length;
   pager.append(prev,el('span','setting-note',(files.length?offset+1:0)+'–'+Math.min(offset+50,files.length)+' of '+files.length),next);
  }
  async function showFile(file){const at=++epoch,source=snapshot;selected=file.path;draw();view.replaceChildren(el('p','setting-note','Reading '+file.path+'…'));
   try{const out=await call('READ_SOURCE_FILE',{folder:source.folder,path:file.path,pinnedHead:source.head,pinnedSha256:file.sha256});
    if(!overlay.isConnected||at!==epoch)return;if(!out.ok)throw Error(out.code);
    const bytes=Uint8Array.from(atob(out.base64),c=>c.charCodeAt(0));
    const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
    if(at!==epoch)return;if(bytes.length!==file.size||sha!==file.sha256)throw Error('SOURCE_FILE_UNVERIFIED');
    view.replaceChildren(el('h3','',file.path),el('p','setting-note',file.size+' bytes · main snapshot '+source.head.slice(0,10)));
    try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
     if(text.includes('\0'))throw Error('BINARY');
     const code=el('textarea','form-input source-code');code.readOnly=true;code.rows=22;code.spellcheck=false;code.value=text;code.setAttribute('aria-label','Source '+file.path);view.append(code);
    }catch{view.append(el('p','setting-note','Binary asset. Download the verified bytes to inspect it.'))}
    view.append(b('Download file',()=>{const url=URL.createObjectURL(new Blob([bytes]));const a=el('a');a.href=url;a.download=file.path.split('/').at(-1);a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)},'btn small'));
   }catch(error){if(at!==epoch)return;view.replaceChildren(el('p','setting-note',error.message==='SOURCE_SNAPSHOT_EXPIRED'?'This source view expired. Refresh source to reopen the file.':'File could not be verified. Refresh source or retry this file.'))}
  }
  async function inspect(){if(busy)return;busy=true;refresh.disabled=true;epoch++;status.textContent='Reading the complete source from GitHub main…';
   try{const out=await call('INSPECT_SOURCE',{folder});if(!overlay.isConnected)return;
    if(!out.ok){snapshot=null;draw();view.replaceChildren();status.textContent=out.code==='GIT_RECONNECT_REQUIRED'?'Connect GitHub to browse this source.':out.code==='SOURCE_PENDING'?'This folder is not on main yet. Source preparation will resume when GitHub is available.':'Source is unavailable. Check GitHub and retry; saved originals are preserved.';return}
    snapshot=out;folder=out.folder;status.textContent=out.files+' files · '+(out.ready?'READY':'Not READY')+' · main snapshot '+out.head.slice(0,10);draw();
    // Routine unambiguous local linking needs no per-folder approval. The
    // production boundary rechecks current account, owner, revision and Git.
    if(item.ownerState==='OBSERVED_OWNER'&&Number.isSafeInteger(item.revision)){
     const linked=await call('ASSOCIATE_SOURCE',{slug:item.slug,folder:out.folder,expectedRevision:item.revision,pinnedFingerprint:out.fingerprint,pinnedHead:out.head,pinnedTestingSha:out.testingSha});
     if(!overlay.isConnected)return;
     if(linked.ok)void reload();
     else if(['SOURCE_ASSOCIATION_CONFLICT','SOURCE_REASSOCIATION_REQUIRES_REVIEW'].includes(linked.code))status.textContent+=' · Source association needs review; existing links are preserved.';
    }
    const first=out.paths.find(f=>f.path===selected)||out.paths.find(f=>f.path==='main.pjs')||out.paths[0];if(first)void showFile(first);
   }catch{status.textContent='GitHub could not be read. Retry when the connection is available.'}
   finally{busy=false;refresh.disabled=false}
  }
  const refresh=b('Refresh source',()=>void inspect(),'btn small');actions.append(refresh,b('GitHub connection',()=>{close();connect()},'btn small'));
  search.addEventListener('input',()=>{offset=0;draw()});
  overlay.addEventListener('click',e=>{if(e.target===overlay)close()});
  overlay.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();close();return}if(e.key==='Tab'){
   const controls=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled)')].filter(e=>!e.hidden);
   const index=controls.indexOf(root.activeElement);if(e.shiftKey&&index<=0){e.preventDefault();controls.at(-1)?.focus()}else if(!e.shiftKey&&index===controls.length-1){e.preventDefault();controls[0]?.focus()}
  }});refresh.focus();void inspect();
 };
}
