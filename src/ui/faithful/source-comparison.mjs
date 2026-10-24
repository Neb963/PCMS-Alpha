// Read-only source comparison. Every file is read from one revision-bound
// snapshot and independently hashed before display or download.
export async function readComparisonFile({view,origin,file,request}){
 const parts=[];let offset=0,total=0;
 do{
  const r=await request('GET_LOCAL_CHUNK',{slug:view.slug,stageRevision:view.stageRevision,
   jobRevision:view.jobRevision,fingerprint:view.sourceFingerprint,origin,path:file.path,offset});
  if(!r?.ok||r.slug!==view.slug||r.stageRevision!==view.stageRevision||r.jobRevision!==view.jobRevision||
   r.fingerprint!==view.sourceFingerprint||r.selectedFingerprint!==(origin==='P'?view.previousFingerprint:view.sourceFingerprint)||
   r.origin!==origin||r.path!==file.path||r.offset!==offset||r.total!==file.size||r.fileSha256!==file.sha256)
   throw Error(r?.code||'REVIEW_BYTES_UNVERIFIED');
  const part=Uint8Array.from(atob(r.base64),c=>c.charCodeAt(0));
  const end=offset+part.length;
  if(part.length!==r.length||part.length>8192||end>file.size||
   r.nextOffset!==(end<file.size?end:null)||(!part.length&&end<file.size))throw Error('REVIEW_BYTES_UNVERIFIED');
  parts.push(part);total+=part.length;offset=r.nextOffset;
  if(total>16*1024*1024)throw Error('REVIEW_BYTES_UNVERIFIED');
 }while(offset!==null);
 const bytes=new Uint8Array(total);let at=0;for(const p of parts){bytes.set(p,at);at+=p.length}
 const sha=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
 if(total!==file.size||sha!==file.sha256)throw Error('REVIEW_BYTES_UNVERIFIED');
 return bytes;
}
// Patience anchors avoid quadratic work on large files. Unanchored regions
// remain complete removals/additions; no lines or bytes are silently omitted.
export function sourceLineDiff(before,after){
 const a=before.match(/[^\n]*\n|[^\n]+$/g)||[],z=after.match(/[^\n]*\n|[^\n]+$/g)||[],out=[];
 const add=(kind,lines,start,end)=>{if(end>start)out.push({kind,text:lines.slice(start,end).join('')})};
 function walk(lo,hi,ls,hs,depth){
  let p=0;while(lo+p<hi&&ls+p<hs&&a[lo+p]===z[ls+p])p++;
  add('same',a,lo,lo+p);lo+=p;ls+=p;
  let s=0;while(hi-s>lo&&hs-s>ls&&a[hi-s-1]===z[hs-s-1])s++;
  const ae=hi-s,ze=hs-s;
  if(lo<ae&&ls<ze&&depth<12){
   const am=new Map(),zm=new Map();
   for(let i=lo;i<ae;i++)am.set(a[i],am.has(a[i])?-1:i);
   for(let i=ls;i<ze;i++)zm.set(z[i],zm.has(z[i])?-1:i);
   const pairs=[];for(const [line,i] of am){const j=zm.get(line);if(i>=0&&j>=0)pairs.push([i,j])}
   const tails=[],tailIndices=[],prev=[];
   for(let i=0;i<pairs.length;i++){const j=pairs[i][1];let l=0,r=tails.length;
    while(l<r){const m=(l+r)>>1;if(tails[m]<j)l=m+1;else r=m}
    prev[i]=l?tailIndices[l-1]:-1;tails[l]=j;tailIndices[l]=i;
   }
   const anchors=[];for(let i=tailIndices.at(-1);i!==undefined&&i>=0;i=prev[i])anchors.push(pairs[i]);anchors.reverse();
   if(anchors.length){let x=lo,y=ls;for(const [i,j] of anchors){walk(x,i,y,j,depth+1);add('same',a,i,i+1);x=i+1;y=j+1}walk(x,ae,y,ze,depth+1)}
   else{add('removed',a,lo,ae);add('added',z,ls,ze)}
  }else{add('removed',a,lo,ae);add('added',z,ls,ze)}
  add('same',a,ae,hi);
 }
 walk(0,a.length,0,z.length,0);return out;
}
export function mountSourceComparison({container,view,el,b,request}){
 const section=el('section','source-comparison'),heading=el('h3','','Source changes'),note=el('p','setting-note',
  'Previous saved source and '+(view.sourceKind==='DEVELOPMENT_SNAPSHOT'?'saved development checkpoint':'staged input')+'. Publication eligibility is checked separately.');
 const layout=el('div','source-layout'),tree=el('nav','source-tree'),display=el('section','source-file');
 tree.setAttribute('aria-label','Compare source files');display.setAttribute('aria-label','Source comparison');
 const search=el('input','form-input');search.type='search';search.placeholder='Find a file';search.setAttribute('aria-label','Find a comparison file');
 const list=el('div'),pager=el('div','form-foot');tree.append(search,list,pager);layout.append(tree,display);section.append(heading,note,layout);container.append(section);
 const old=new Map((view.priorFiles||[]).map(f=>[f.path,f])),next=new Map((view.files||[]).map(f=>[f.path,f]));
 const paths=[...new Set([...old.keys(),...next.keys()])].sort(),cache=new Map();let offset=0,epoch=0,selected='';
 const kind=path=>!old.has(path)?'Added':!next.has(path)?'Deleted':old.get(path).sha256===next.get(path).sha256?'Unchanged':'Changed';
 function draw(){list.replaceChildren();pager.replaceChildren();const items=paths.filter(p=>p.toLowerCase().includes(search.value.trim().toLowerCase()));
  if(offset>=items.length)offset=0;
  for(const path of items.slice(offset,offset+50)){const button=b(path+' · '+kind(path),()=>void show(path),'source-file-button');
   button.dataset.comparePath=path;button.setAttribute('aria-current',String(selected===path));list.append(button)}
  const prev=b('Previous files',()=>{offset=Math.max(0,offset-50);draw()}),more=b('Next files',()=>{offset+=50;draw()});
  prev.disabled=offset===0;more.disabled=offset+50>=items.length;
  pager.append(prev,el('span','setting-note',(items.length?offset+1:0)+'–'+Math.min(offset+50,items.length)+' of '+items.length),more);
 }
 async function bytes(origin,path){const file=(origin==='P'?old:next).get(path);if(!file)return null;
  const key=origin+':'+path;if(!cache.has(key))cache.set(key,readComparisonFile({view,origin,file,request}).catch(e=>{cache.delete(key);throw e}));return cache.get(key);
 }
 function download(data,path,origin){const url=URL.createObjectURL(new Blob([data])),a=el('a');a.href=url;a.download=origin+'-'+path.split('/').at(-1);a.click();setTimeout(()=>URL.revokeObjectURL(url),30000)}
 async function show(path){const at=++epoch;selected=path;draw();display.replaceChildren(el('p','setting-note','Reading and verifying '+path+'…'));
  try{const [p,f]=await Promise.all([bytes('P',path),bytes('F',path)]);if(at!==epoch||!section.isConnected)return;
   display.replaceChildren(el('h4','',path+' · '+kind(path)));const actions=el('div','form-foot');
   for(const [name,data,origin] of [['Download previous',p,'previous'],['Download candidate',f,'candidate']])if(data)actions.append(b(name,()=>download(data,path,origin)));
   display.append(actions);const columns=el('div','source-compare-columns');let textPair=[];
   for(const [name,data] of [['Previous',p],['Candidate',f]]){const column=el('section');column.append(el('h4','',name));
    if(data===null){column.append(el('p','setting-note','File absent'));textPair.push('')}
    else{try{const text=new TextDecoder('utf-8',{fatal:true}).decode(data);if(text.includes('\0'))throw Error('BINARY');textPair.push(text);
      const code=el('textarea','form-input source-code');code.readOnly=true;code.rows=20;code.spellcheck=false;code.value=text;code.setAttribute('aria-label',name+' '+path);column.append(code);
     }catch{textPair.push(null);column.append(el('p','setting-note','Binary asset · '+data.length+' verified bytes. Download to inspect.'))}}
    columns.append(column);
   }
   display.append(columns);
   if(textPair.every(x=>x!==null)){const details=el('details','source-line-diff');details.append(el('summary','','Line changes (− previous, + candidate)'));
    const code=el('pre','source-preview');for(const part of sourceLineDiff(...textPair)){const span=el('span','diff-'+part.kind);span.textContent=part.text.split(/(?<=\n)/).map(line=>(part.kind==='added'?'+ ':part.kind==='removed'?'− ':'  ')+line).join('');code.append(span)}details.append(code);display.append(details)}
  }catch{if(at===epoch)display.replaceChildren(el('p','setting-note','This file could not be verified or the checkpoint changed. Refresh the review to read the current source.'),b('Retry file',()=>void show(path)))}
 }
 search.addEventListener('input',()=>{offset=0;draw()});draw();if(paths.length)void show(paths.includes('main.pjs')?'main.pjs':paths[0]);
 return {element:section};
}
