// S05 fixed native source-writer selection. This policy does not execute a
// provider effect; it classifies a canonical previous-F manifest so a
// nonempty private generator uses the I13 exact-source replacement adapter.
const fail=code=>({ok:false,code});
const pathOK=p=>p==='main.pjs'||p==='index.html'||
  (typeof p==='string'&&p.startsWith('src/')&&p.length<=240&&
   p===p.normalize('NFC')&&p.split('/').every(s=>
     /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(s)&&
     s!=='.'&&s!=='..'&&!s.endsWith('.')));
export function choosePrivateStageAdapter(previousFiles){
 if(!Array.isArray(previousFiles)||previousFiles.length<2||
    previousFiles.length>502)return fail('S05_PREVIOUS_MANIFEST_INVALID');
 const names=new Set();
 for(const f of previousFiles){
   if(!pathOK(f?.path)||typeof f.base64!=='string'||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.base64)||
      names.has(f.path.toLowerCase()))
     return fail('S05_PREVIOUS_MANIFEST_INVALID');
   names.add(f.path.toLowerCase());
 }
 if(!names.has('main.pjs')||!names.has('index.html'))
   return fail('S05_PREVIOUS_MANIFEST_INVALID');
 const empty=previousFiles.length===2&&previousFiles.every(f=>f.base64==='');
 return {ok:true,adapter:empty?'PRIVATE_EMPTY_I09':'PRIVATE_NONEMPTY_I13'};
}
