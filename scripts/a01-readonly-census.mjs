#!/usr/bin/env node
/**
 * A01 readonly *source/package* migration census. Never opens a live browser
 * profile, contacts a provider, reads credentials or mutates repository files.
 * Indications in source are NOT evidence of installed user state.
 */
import {readdir,readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SCAN=['src/runtime','src/ui','donor/personamonkey/extension',
  'native','packaging','scripts'];
const KINDS=Object.freeze({
  idbSchema:/\b(createObjectStore|indexedDB\.open|factory\.open)\s*\(/g,
  browserStorage:/\b(?:browser|api)\.storage\.(?:local|sync|session)\b/g,
  cookiesSession:/\b(?:cookies\.(?:getAll|set|remove)|contextualIdentities|userScripts|GM_[A-Za-z]+)\b/g,
  pcmsNativeHost:/\blocal\.pcms\.[a-z0-9_]+\b/g,
  donorBridge:/\bcom\.persona\.mullvad_router\b/g,
  secretVault:/\b(?:Secret Service|secret-tool|vaultRead|backup_vault|git\.get|git\.put)\b/gi,
  cryptoOrPassword:/\b(?:AES-GCM|PBKDF2|passphrase|password)\b/gi,
  identityAlias:/\b(?:public_|slug-|repositoryId|personaUid|pcmsBindingId)\b/g,
  sourceIntegrity:/\b(?:sourceFingerprint|candidateFingerprint|sha256|sourceRevision|previousGood|fingerprint)\b/gi,
  journalAndRecovery:/\b(?:DISPATCH_POSSIBLE|HELD_UNCERTAIN|OBSERVING|RECOVERY|createObjectStore)\b/g,
  externalEffect:/\b(?:sendNativeMessage|downloads\.download|fetch\s*\(|tabs\.create)\b/g
});
const hex=b=>createHash('sha256').update(b).digest('hex');
export async function census({root=ROOT,scope=SCAN}={}){
  // No credential VALUES are read from browser storage; no raw matching lines
  // are exported. Code paths + symbol classes only.
  const entries=[],paths=[];
  for(const dir of scope){
    const target=path.join(root,dir);
    try{if((await stat(target)).isDirectory()){
      for(const rel of await walkFrom(target,dir,root))paths.push(rel);
    }}catch(e){if(e.code!=='ENOENT')throw e;}
  }
  for(const rel of paths.sort()){
    const bytes=await readFile(path.join(root,rel));
    if(bytes.length>4*1024*1024)continue;
    const code=bytes.toString('utf8'),lines=code.split('\n');
    const signals={};
    for(const [kind,re] of Object.entries(KINDS)){
      let total=0; const lineNumbers=[];
      for(let i=0;i<lines.length;i++){
        re.lastIndex=0;const matches=[...lines[i].matchAll(re)];
        if(matches.length){total+=matches.length;if(lineNumbers.length<12)lineNumbers.push(i+1);}
      }
      if(total)signals[kind]={count:total,lines:lineNumbers};
    }
    // Literal schema identifiers only. This is a source-derived migration
    // index, not a claim that any user profile contains the relevant stores.
    const namesFor=(regex,group=1)=>[...new Set(
      [...code.matchAll(regex)].map(x=>x[group]).filter(x=>
        typeof x==='string'&&/^[A-Za-z0-9_.:-]{1,80}$/.test(x)))].sort();
    const symbols={
      objectStores:namesFor(/\.createObjectStore\(\s*['"]([^'"]+)['"]/g),
      databaseNames:namesFor(/\b(?:DB_NAME|DB_VERSION|SCHEMA)\s*=\s*['"]([^'"]+)['"]/g),
      staticStorageKeys:namesFor(/\.storage\.(?:local|sync|session)\.(?:get|remove)\s*\(\s*['"]([^'"]+)['"]/g),
      nativeHostIds:namesFor(/\b(local\.pcms\.[a-z0-9_]+|com\.persona\.mullvad_router)\b/g)
    };
    if(Object.keys(signals).length)entries.push({path:rel,sha256:hex(bytes),signals,symbols});
  }
  const classes=Object.fromEntries(Object.keys(KINDS).map(k=>
    [k,entries.filter(e=>e.signals[k]).length]));
  return {schema:'pcms.a01.source-census/1',
    scope:'REPOSITORY_SOURCE_ONLY_NOT_OPERATOR_PROFILE',
    observedAt:'DETERMINISTIC_FILE_BYTES_NO_RUNTIME_TIMESTAMP',
    filesScanned:paths.length,filesWithSignals:entries.length,classes,entries,
    unknown:['actual installed native host registrations','operator Firefox profiles and cookies',
      'current source snapshots and unfinished journals','real provider and Git remote state',
      'preexisting profile/route migrations','unreadable binary/host runtime data']};
}
async function walkFrom(target,relative,root){
  const found=[];
  async function visit(folder){
    for(const e of (await readdir(folder,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){
      const full=path.join(folder,e.name),rel=path.relative(root,full).split(path.sep).join('/');
      if(e.isDirectory())await visit(full);
      else if(e.isFile()&&/\.(?:mjs|js|json|py|sh|html)$/.test(e.name))found.push(rel);
    }
  }
  await visit(target);return found;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv.length>2){console.error('A01_READ_ONLY_NO_ARGUMENTS');process.exitCode=2;}
  else census().then(x=>console.log(JSON.stringify(x,null,2)))
    .catch(e=>{console.error('A01_CENSUS_FAILED',e.message);process.exitCode=1;});
}
