// Known synthetic schema; does not claim to serialize arbitrary Perchance schemas.
export async function siteProof(op,data){
  const req=r=>new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const done=t=>new Promise((resolve,reject)=>{t.oncomplete=resolve;t.onabort=t.onerror=()=>reject(t.error);});
  const open=async()=>{const r=indexedDB.open('pcms-synthetic',1);r.onupgradeneeded=()=>{const s=r.result.createObjectStore('records');s.createIndex('byKind','kind');};return req(r);};
  const root=await navigator.storage.getDirectory();
  if(op==='freeze'){localStorage.setItem('pcms-proof-frozen','true');return {frozen:true};}
  if(op==='thaw'){localStorage.removeItem('pcms-proof-frozen');return {frozen:false};}
  if(op==='write'){
    // This fixture owns every writer. Real provider quiescence remains a separate prerequisite.
    const frozen=localStorage.getItem('pcms-proof-frozen');localStorage.clear();
    for(const [k,v] of Object.entries(data.localStorage.values))localStorage.setItem(k,v);
    if(frozen)localStorage.setItem('pcms-proof-frozen',frozen);
    const db=await open(),tx=db.transaction('records','readwrite'),end=done(tx),store=tx.objectStore('records');store.clear();
    for(const row of data.indexedDB.databases[0].stores[0].records)store.put(row.value,row.key);
    await end;db.close();
    const existing=root.entries();
    for(;;){const entry=await existing.next();if(entry.done)break;await root.removeEntry(entry.value[0],{recursive:true});}
    for(const [path,b64] of Object.entries(data.opfs.files)){
      const names=path.split('/');let dir=root;for(const n of names.slice(0,-1))dir=await dir.getDirectoryHandle(n,{create:true});
      const h=await dir.getFileHandle(names.at(-1),{create:true}),w=await h.createWritable();await w.write(Uint8Array.from(atob(b64),c=>c.charCodeAt(0)));await w.close();
    }
    return {written:true};
  }
  if(op==='read'){
    const values={};for(const k of Object.keys(localStorage).sort())if(k!=='pcms-proof-frozen')values[k]=localStorage.getItem(k);
    const db=await open(),tx=db.transaction('records','readonly'),end=done(tx),s=tx.objectStore('records');
    const [keys,vals]=await Promise.all([req(s.getAllKeys()),req(s.getAll())]);
    const indexes=[...s.indexNames].map(n=>{const i=s.index(n);return {name:n,keyPath:i.keyPath,unique:i.unique,multiEntry:i.multiEntry};});
    const schema={name:s.name,keyPath:s.keyPath,autoIncrement:s.autoIncrement,indexes,records:keys.map((key,i)=>({key,value:vals[i]}))};
    await end;db.close();const files={};
    async function walk(dir,prefix=''){
      const iterator=dir.entries();for(;;){const e=await iterator.next();if(e.done)break;const [n,h]=e.value;
        if(h.kind==='directory')await walk(h,prefix+n+'/');
        else{const b=new Uint8Array(await(await h.getFile()).arrayBuffer());let raw='';for(const c of b)raw+=String.fromCharCode(c);files[prefix+n]=btoa(raw);}
      }
    }
    await walk(root);return {values,databases:[{name:'pcms-synthetic',version:1,stores:[schema]}],files};
  }
  throw Error('unknown synthetic site operation');
};
