// Disposable proof format: uncompressed ZIP32; no library or production dependency.
export const enc = new TextEncoder();
export const dec = new TextDecoder('utf-8', {fatal:true});
export const jsonBytes = x => enc.encode(JSON.stringify(x));
export const hash = async x => [...new Uint8Array(await crypto.subtle.digest('SHA-256',x))].map(v=>v.toString(16).padStart(2,'0')).join('');
export const REQUIRED = ['core','modules','sources','history','journal','credentials','personas','cookies','localStorage','indexedDB','opfs','ai','native'];
export function crc32(b) { let n=0xffffffff; for(const v of b) {n^=v;for(let i=0;i<8;i++) n=(n>>>1)^((n&1)?0xedb88320:0);}return (n^0xffffffff)>>>0; }
const safe = n => typeof n==='string' && /^[a-zA-Z0-9_./-]+$/.test(n) && !n.startsWith('/') && !n.split('/').some(x=>!x || x==='.' || x==='..');
function join(parts) { const b=new Uint8Array(parts.reduce((n,x)=>n+x.length,0));let o=0;for(const x of parts){b.set(x,o);o+=x.length;}return b; }
function header(n, fields) {const b=new Uint8Array(n),v=new DataView(b.buffer);for(const [o,x,s] of fields)v[s===2?'setUint16':'setUint32'](o,x,true);return b;}
export function zip(entries) {
  const body=[],central=[];let off=0;
  for(const [name,data] of entries) {
    if(!safe(name)||!(data instanceof Uint8Array)||data.length>0xffffffff)throw Error('invalid ZIP entry');
    const n=enc.encode(name),c=crc32(data);
    body.push(header(30,[[0,0x04034b50],[4,20,2],[14,c],[18,data.length],[22,data.length],[26,n.length,2]]),n,data);
    central.push(header(46,[[0,0x02014b50],[4,20,2],[6,20,2],[16,c],[20,data.length],[24,data.length],[28,n.length,2],[42,off]]),n);
    off+=30+n.length+data.length;
  }
  const cd=join(central);
  if(off+cd.length>0xffffffff||entries.length>65535)throw Error('ZIP64 required; proof size only');
  return join([...body,cd,header(22,[[0,0x06054b50],[8,entries.length,2],[10,entries.length,2],[12,cd.length],[16,off]])]);
}
export function unzip(b) {
  if(!(b instanceof Uint8Array)||b.length<22)throw Error('truncated');
  const v=new DataView(b.buffer,b.byteOffset,b.byteLength),end=b.length-22;
  if(v.getUint32(end,true)!==0x06054b50||v.getUint16(end+20,true)!==0)throw Error('missing ZIP commit/footer');
  if(v.getUint32(end+4,true)!==0||v.getUint16(end+8,true)!==v.getUint16(end+10,true))throw Error('multi-disk');
  let p=v.getUint32(end+16,true),localEnd=0;const cdEnd=p+v.getUint32(end+12,true),out=new Map();
  if(cdEnd!==end)throw Error('central bounds');
  const count=v.getUint16(end+10,true);
  for(let i=0;i<count;i++) {
    if(p+46>cdEnd||v.getUint32(p,true)!==0x02014b50)throw Error('central header');
    const n=v.getUint16(p+28,true),extra=v.getUint16(p+30,true),comment=v.getUint16(p+32,true);
    if(p+46+n+extra+comment>cdEnd)throw Error('name bounds');
    const name=dec.decode(b.slice(p+46,p+46+n)),size=v.getUint32(p+24,true),o=v.getUint32(p+42,true);
    if(!safe(name)||out.has(name)||v.getUint16(p+8,true)!==0||v.getUint16(p+10,true)!==0||v.getUint16(p+34,true)!==0)throw Error('unsupported/duplicate ZIP entry');
    if(o!==localEnd||o+30>b.length||v.getUint32(o,true)!==0x04034b50)throw Error('local bounds/order');
    const ln=v.getUint16(o+26,true),le=v.getUint16(o+28,true),start=o+30+ln+le;
    if(start+size>v.getUint32(end+16,true)||dec.decode(b.slice(o+30,o+30+ln))!==name||v.getUint16(o+6,true)!==0||v.getUint16(o+8,true)!==0||v.getUint32(o+18,true)!==size||v.getUint32(o+22,true)!==size||v.getUint32(p+20,true)!==size)throw Error('local mismatch');
    const data=b.slice(start,start+size),crc=crc32(data);
    if(crc!==v.getUint32(p+16,true)||crc!==v.getUint32(o+14,true))throw Error('CRC mismatch');
    out.set(name,data);localEnd=start+size;p+=46+n+extra+comment;
  }
  if(p!==cdEnd||localEnd!==v.getUint32(end+16,true))throw Error('unlisted ZIP bytes');
  return out;
}
export async function makeArchive(sections,{complete=true,missing=[],captureId='synthetic-cut-1'}={}) {
  const files=[];const entries=[];
  for(const [category,value] of Object.entries(sections)) {
    if(!REQUIRED.includes(category))throw Error('unknown category');
    const path=`data/${category}.json`,b=jsonBytes(value);
    files.push({path,category,bytes:b.length,sha256:await hash(b)});entries.push([path,b]);
  }
  const manifest={format:'pcms-proof-zip',version:1,coreABI:1,captureId,complete,missing,unencrypted:true,credentialsIncluded:true,required:REQUIRED,files};
  const m=jsonBytes(manifest);
  return zip([['manifest.json',m],['manifest.sha256',enc.encode(await hash(m))],...entries]);
}
export async function validate(b) {
  const z=unzip(b),mb=z.get('manifest.json');
  if(!mb||dec.decode(z.get('manifest.sha256')||new Uint8Array())!==await hash(mb))throw Error('manifest hash');
  const m=JSON.parse(dec.decode(mb));
  if(m.format!=='pcms-proof-zip'||m.version!==1||m.coreABI!==1)throw Error('incompatible format/ABI');
  if(!m.complete||!Array.isArray(m.missing)||m.missing.length||!m.unencrypted||!m.credentialsIncluded)throw Error('incomplete coverage');
  if(JSON.stringify(m.required)!==JSON.stringify(REQUIRED)||!Array.isArray(m.files))throw Error('coverage inventory');
  const seen=new Set(),sections={};
  for(const f of m.files) {
    const data=z.get(f.path);
    if(!REQUIRED.includes(f.category)||seen.has(f.category)||f.path!==`data/${f.category}.json`||!data||data.length!==f.bytes||await hash(data)!==f.sha256)throw Error('entry integrity/coverage');
    seen.add(f.category);sections[f.category]=JSON.parse(dec.decode(data));
  }
  if(seen.size!==REQUIRED.length||z.size!==m.files.length+2)throw Error('missing/unlisted content');
  validatePayload(sections);
  return {manifest:m,sections};
}
function validatePayload(s){
  const check=(ok,name)=>{if(!ok)throw Error('missing/incompatible payload: '+name);};
  const obj=x=>x&&typeof x==='object'&&!Array.isArray(x);
  for(const k of ['records','queue','jobs','exportReceipts'])check(Array.isArray(s.core?.[k]),'core.'+k);
  check(obj(s.core.config)&&obj(s.core.schedule),'config/schedules');
  check(s.core.jobs.every(j=>typeof j.id==='string'&&typeof j.status==='string'&&Number.isInteger(j.jobABI)&&['none','sent'].includes(j.effect)),'jobs');
  const p=s.modules?.package;
  check(p?.id==='synthetic-module'&&p.coreABI===1&&p.jobABI===1&&typeof p.background==='string'&&typeof p.ui==='string'&&typeof p.version==='string','module ABI/files');
  check(obj(s.modules.settings)&&typeof s.modules.enabled==='boolean','module settings/status');
  check(obj(s.sources)&&Object.keys(s.sources).length&&Array.isArray(s.history)&&Array.isArray(s.journal),'source/history/Journal');
  check(typeof s.credentials?.githubToken==='string'&&typeof s.credentials?.otherSecret==='string','credentials');
  check(Array.isArray(s.personas?.items)&&s.personas.items.length>0&&Array.isArray(s.personas.routes)&&obj(s.personas.mappings),'Personas/routes');
  const stores=new Set(s.personas.items.map(x=>x.cookieStoreId));check(stores.size===s.personas.items.length&&[...stores].every(x=>typeof x==='string'),'container identity');
  check(Array.isArray(s.cookies)&&s.cookies.every(c=>stores.has(c.storeId)&&typeof c.name==='string'&&typeof c.value==='string'&&typeof c.domain==='string'&&typeof c.path==='string'&&typeof c.session==='boolean'),'cookies');
  for(const k of ['localStorage','indexedDB','opfs'])check(Array.isArray(s[k])&&s[k].length===stores.size&&new Set(s[k].map(x=>x.storeId)).size===stores.size&&s[k].every(x=>stores.has(x.storeId)&&x.origin==='http://127.0.0.1:8765'),'origin scopes '+k);
  check(s.localStorage.every(x=>obj(x.values)),'localStorage contents');
  check(s.indexedDB.every(x=>Array.isArray(x.databases)&&x.databases.every(d=>Array.isArray(d.stores)&&d.stores.every(t=>Array.isArray(t.records)))),'IndexedDB contents');
  check(s.opfs.every(x=>obj(x.files)),'OPFS contents');
  check(Array.isArray(s.ai?.chatIds)&&Array.isArray(s.ai.attachments)&&typeof s.ai.draft==='string','AI references/draft');
  check(obj(s.native?.files)&&Object.hasOwn(s.native.files,'configs/entry-a.conf')&&Array.isArray(s.native.prerequisites),'native bundle/prerequisites');
}
