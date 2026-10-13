// The only Perchance page executor used by I03/I04. Firefox injects this
// fixed function into its ISOLATED extension world, not the editable page JS
// world. No arbitrary code, caller URL, editKey or page message is accepted.
// The donor-owned host selects the tab under Persona lease and checks the
// route before/after injection. Returned data is strictly de-identified.
export async function perchanceReadIsolated({identityOnly=false,originalSlug=null}={}) {
  const denied=(code)=>({ok:false,code});
  try {
    if(location.origin!=='https://perchance.org')return denied('WRONG_ORIGIN');
    const raw=localStorage.getItem('app-storage');
    if(typeof raw!=='string'||raw.length>160000)return denied('NO_PAGE_SESSION');
    const state=JSON.parse(raw);
    const user=state?.user;
    // Page-local store is a credential source, NOT proof. Server response
    // verifies the pair and identity is bound by a one-way fingerprint.
    if(user?.loggedIn!==true||typeof user.email!=='string'||
       typeof user.sessionToken!=='string'||user.sessionToken.length<8||
       user.sessionToken.length>8192)return denied('NO_PAGE_SESSION');
    const email=user.email.trim().toLowerCase();
    if(email.length>254||!/^[-.!#$%&'*+\/=?^_`{|}~a-z0-9]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(email))
      return denied('SESSION_IDENTITY_UNOBSERVABLE');
    const bytes=new TextEncoder().encode(email);
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    const principalFingerprint=Array.from(new Uint8Array(digest))
      .map(b=>b.toString(16).padStart(2,'0')).join('');
    const startChange=localStorage.getItem('sessionTokenLastChangeTime');
    const safeStatus=x=>['success','is-owner','is-not-owner','session-token-error'].includes(x)?x:'unknown';
    async function call(path,params,{unauthenticated=false}={}) {
      // Isolated-world fetch, fixed same-origin URL, bounded response; no
      // underlying mutable editor APIs or page-world fetch monkeypatch.
      const ctrl=new AbortController();
      const timer=setTimeout(()=>ctrl.abort(),9000);
      try {
        const res=await fetch('https://perchance.org/api/'+path,{
          method:'POST',credentials:'same-origin',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify(unauthenticated?params:{email,sessionToken:user.sessionToken,...params}),
          signal:ctrl.signal,redirect:'error',cache:'no-store'
        });
        if(res.status!==200)return {httpStatus:res.status===403?403:0,body:{status:'unknown'}};
        if(!String(res.headers.get('content-type')||'').includes('json'))
          return {httpStatus:0,body:{status:'unknown'}};
        const payload=await res.json();
        if(!payload||typeof payload!=='object'||Array.isArray(payload))
          return {httpStatus:0,body:{status:'unknown'}};
        return {httpStatus:200,body:payload};
      }catch{return {httpStatus:0,body:{status:'unknown'}};}
      finally{clearTimeout(timer);}
    }
    const session=await call('getGeneratorsByUser',{});
    if(session.httpStatus!==200||session.body.status!=='success'||
       !Array.isArray(session.body.generators)||session.body.generators.length>5000||
       !session.body.generatorFolderMap||
       typeof session.body.generatorFolderMap!=='object'||
       Array.isArray(session.body.generatorFolderMap))
      return denied(session.body?.status==='session-token-error'?
        'SESSION_REJECTED':'SESSION_PROBE_UNAVAILABLE');
    if(localStorage.getItem('sessionTokenLastChangeTime')!==startChange ||
       localStorage.getItem('app-storage')!==raw)return denied('SESSION_CHANGED');
    if(identityOnly&&originalSlug!==null)return denied('INVALID_OBSERVER_MODE');
    if(identityOnly)return {ok:true,principalFingerprint,
      sessionReply:{httpStatus:200,body:{status:'success',generators:[],generatorFolderMap:{}}},
      ownerReplies:[]};
    if(originalSlug!==null){
      if(typeof originalSlug!=='string' ||
         !/^[a-z0-9][a-z0-9-]{0,99}$/.test(originalSlug))
        return denied('INVALID_GENERATOR');
      const listed=session.body.generators.filter(g=>g?.name===originalSlug);
      if(listed.length!==1||typeof listed[0].isPrivate!=='boolean')
        return denied('ORIGINAL_NOT_IN_OWNER_INVENTORY');
      const owner=await call('checkGeneratorOwnership',{generatorName:originalSlug});
      const page=await call('getGeneratorPageData',{generatorName:originalSlug},{unauthenticated:true});
      const generator=page.body?.generator;
      if(owner.httpStatus!==200||owner.body?.status!=='is-owner'||
         page.httpStatus!==200||page.body?.status!=='success'||
         generator?.name!==originalSlug||
         generator?.isPrivate!==listed[0].isPrivate||
         typeof generator?.publicId!=='string'||
         !/^[a-zA-Z0-9_-]{1,90}$/.test(generator.publicId)||
         typeof generator.modelText!=='string'||
         typeof generator.outputTemplate!=='string')
        return denied('ORIGINAL_SOURCE_UNVERIFIED');
      // srcManifest references alone do not prove asset bytes. Stop rather
      // than constructing a falsely complete backup from filenames.
      const manifest=generator.srcManifest;
      const empty=Array.isArray(manifest)?manifest.length===0:
        manifest&&typeof manifest==='object'&&!Array.isArray(manifest)&&
        Object.keys(manifest).length===0;
      const assets=[];
      if(!empty){
        if(!manifest||typeof manifest!=='object'||Array.isArray(manifest)||
           Object.getPrototypeOf(manifest)!==Object.prototype ||
           Object.keys(manifest).length>500)
          return denied('ORIGINAL_ASSET_BYTES_UNVERIFIED');
        const paths=Object.keys(manifest),seen=new Set();
        let total=0;
        for(const path of paths){
          const parts=path.split('/');
          const entry=manifest[path];
          if(!path.startsWith('src/')||path.length>240||
             path!==path.normalize('NFC')||
             parts.some(part=>!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(part)||
               part==='.'||part==='..'||part.endsWith('.'))||
             seen.has(path.toLowerCase())||
             !entry||typeof entry!=='object'||
             typeof entry.key!=='string'||
             !/^[0-9a-f]{32}\.[a-z0-9]{1,20}$/.test(entry.key)||
             !Number.isSafeInteger(entry.size)||entry.size<0||
             entry.size>12*1024*1024)
            return denied('ORIGINAL_ASSET_BYTES_UNVERIFIED');
          seen.add(path.toLowerCase());total+=entry.size;
          if(total>16*1024*1024)return denied('ORIGINAL_ASSET_BYTES_UNVERIFIED');
        }
        for(const path of paths.sort()){
          const entry=manifest[path],ctrl=new AbortController();
          const timeout=setTimeout(()=>ctrl.abort(),12000);
          try{
            // Read-only fixed CDN URL from a strictly validated committed
            // manifest key. A URL without byte evidence is never accepted.
            const response=await fetch('https://user.uploads.dev/file/'+entry.key,{
              method:'GET',credentials:'omit',cache:'no-store',
              redirect:'error',signal:ctrl.signal});
            if(response.status!==200||
               (Number(response.headers.get('content-length')||'0')>entry.size))
              return denied('ORIGINAL_ASSET_BYTES_UNVERIFIED');
            const bytes=new Uint8Array(await response.arrayBuffer());
            if(bytes.length!==entry.size||
               bytes.length>12*1024*1024)
              return denied('ORIGINAL_ASSET_BYTES_UNVERIFIED');
            const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
            const sha256=[...digest].map(v=>v.toString(16).padStart(2,'0')).join('');
            let binary='';
            for(let i=0;i<bytes.length;i+=8192)
              binary+=String.fromCharCode(...bytes.subarray(i,i+8192));
            assets.push({path,size:bytes.length,sha256,base64:btoa(binary)});
          }catch{return denied('ORIGINAL_ASSET_BYTES_UNVERIFIED');}
          finally{clearTimeout(timeout);}
          if(localStorage.getItem('app-storage')!==raw ||
             localStorage.getItem('sessionTokenLastChangeTime')!==startChange)
            return denied('SESSION_CHANGED');
        }
      }
      if(localStorage.getItem('sessionTokenLastChangeTime')!==startChange ||
         localStorage.getItem('app-storage')!==raw ||
         location.origin!=='https://perchance.org')
        return denied('SESSION_CHANGED');
      return {ok:true,principalFingerprint,original:{
        remotePublicId:'public_'+generator.publicId,
        ownerResult:'IS_OWNER',visibility:listed[0].isPrivate?'UNLISTED':'PUBLIC',
        pjs:generator.modelText,html:generator.outputTemplate,assets
      }};
    }
    const generatorRecords=[],names=new Set();
    for(const item of session.body.generators){
      if(!item||typeof item!=='object'||Array.isArray(item)||
        typeof item.name!=='string'||!/^[a-z0-9][a-z0-9-]{0,99}$/.test(item.name)||
        typeof item.isPrivate!=='boolean'||names.has(item.name))
        return denied('INVENTORY_SCHEMA_UNVERIFIED');
      names.add(item.name);
      generatorRecords.push({name:item.name,isPrivate:item.isPrivate});
    }
    // A bounded fanout; no mutations and no partial complete-observation
    // claim if any response is invalid. All calls run in the same Persona tab.
    const ownerReplies=new Array(generatorRecords.length);
    let cursor=0,problem=null;
    await Promise.all(Array.from({length:Math.min(12,generatorRecords.length)},async()=>{
      while(problem===null&&cursor<generatorRecords.length){
        const index=cursor++,name=generatorRecords[index].name;
        const response=await call('checkGeneratorOwnership',{generatorName:name});
        const status=safeStatus(response.body?.status);
        if(response.httpStatus!==200||
           !['is-owner','is-not-owner'].includes(status)) {
          problem=status==='session-token-error'?'SESSION_REJECTED':'OWNER_READBACK_UNAVAILABLE';
          return;
        }
        ownerReplies[index]=[name,{httpStatus:200,body:{status}}];
      }
    }));
    if(problem)return denied(problem);
    if(localStorage.getItem('sessionTokenLastChangeTime')!==startChange ||
       localStorage.getItem('app-storage')!==raw ||location.origin!=='https://perchance.org')
      return denied('SESSION_CHANGED');
    return {ok:true,principalFingerprint,
      sessionReply:{httpStatus:200,body:{status:'success',
        generators:generatorRecords,generatorFolderMap:{}}},
      ownerReplies};
  }catch{return denied('OBSERVER_UNVERIFIED');}
}
