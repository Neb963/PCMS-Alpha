// The only Perchance page executor used by I03/I04. Firefox injects this
// fixed function into its ISOLATED extension world, not the editable page JS
// world. No arbitrary code, caller URL, editKey or page message is accepted.
// The donor-owned host selects the tab under Persona lease and checks the
// route before/after injection. Returned data is strictly de-identified.
export async function perchanceReadIsolated({identityOnly=false}={}) {
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
    async function call(path,params) {
      // Isolated-world fetch, fixed same-origin URL, bounded response; no
      // underlying mutable editor APIs or page-world fetch monkeypatch.
      const ctrl=new AbortController();
      const timer=setTimeout(()=>ctrl.abort(),9000);
      try {
        const res=await fetch('https://perchance.org/api/'+path,{
          method:'POST',credentials:'same-origin',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({email,sessionToken:user.sessionToken,...params}),
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
    if(identityOnly)return {ok:true,principalFingerprint,
      sessionReply:{httpStatus:200,body:{status:'success',generators:[],generatorFolderMap:{}}},
      ownerReplies:[]};
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
