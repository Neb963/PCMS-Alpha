import {createHash} from 'node:crypto';
import {lstat,readFile,readdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export const DONOR_COMMIT='9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf';
export const DONOR_TREE='9d59d800c3a687b2e7360c64d9dd859d701d6ba5';
export const blobSha=bytes=>createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
function treeHash(inventory){
  const rootNode=new Map();
  for(const [filename,{mode,sha}] of inventory){
    const parts=filename.split('/');
    let node=rootNode;
    for(const piece of parts.slice(0,-1)){
      if(!node.has(piece))node.set(piece,new Map());
      node=node.get(piece);
      if(!(node instanceof Map))throw Error('Donor file-directory collision: '+filename);
    }
    const leaf=parts.at(-1);
    if(node.has(leaf))throw Error('Donor duplicate tree name: '+filename);
    node.set(leaf,{mode,sha});
  }
  const hash=node=>{
    const entries=[...node].map(([name,value])=>({
      name,dir:value instanceof Map,
      mode:value instanceof Map?'40000':value.mode,
      sha:value instanceof Map?hash(value):value.sha
    }));
    entries.sort((a,b)=>Buffer.compare(
      Buffer.from(a.name+(a.dir?'/':'')),Buffer.from(b.name+(b.dir?'/':''))));
    const data=Buffer.concat(entries.map(x=>Buffer.concat([
      Buffer.from(x.mode+' '+x.name+'\0'),Buffer.from(x.sha,'hex')
    ])));
    return createHash('sha1').update(Buffer.from('tree '+data.length+'\0')).update(data).digest('hex');
  };
  return hash(rootNode);
}
async function walk(dir,prefix='',found=[]){
  for(const entry of await readdir(path.join(dir,prefix),{withFileTypes:true})){
    const name=prefix?prefix+'/'+entry.name:entry.name;
    if(entry.name==='.git')throw Error('Unexpected nested donor Git repository');
    if(entry.isSymbolicLink())throw Error('Unexpected donor symlink: '+name);
    if(entry.isDirectory())await walk(dir,name,found);
    else if(entry.isFile())found.push(name);
    else throw Error('Unexpected donor entry: '+name);
  }
  return found;
}
export async function verifyDonor(dir=path.join(root,'donor/personamonkey')){
  const manifest=await readFile(path.join(root,'donor/upstream-blobs.tsv'),'utf8');
  const expected=new Map();
  for(const line of manifest.split('\n')){
    if(!line||line.startsWith('#'))continue;
    const match=/^(100644|100755) ([0-9a-f]{40})\t([^\r\n]+)$/.exec(line);
    if(!match)throw Error('Invalid donor manifest line: '+line.slice(0,70));
    const [,mode,sha,name]=match;
    if(name.startsWith('/')||name.includes('\\')||name.split('/').some(x=>!x||x==='.'||x==='..')||expected.has(name))
      throw Error('Invalid/duplicate donor manifest path: '+name);
    expected.set(name,{mode,sha});
  }
  if(expected.size!==223)throw Error('Unexpected pinned donor count: '+expected.size);
  const tree=treeHash(expected);
  if(tree!==DONOR_TREE)throw Error('Donor provenance manifest changed: expected '+DONOR_TREE+' actual '+tree);
  const paths=await walk(dir);
  const actual=new Set(paths);
  const missing=[...expected.keys()].filter(x=>!actual.has(x));
  const extra=paths.filter(x=>!expected.has(x));
  if(missing.length||extra.length)throw Error('Donor inventory mismatch; missing='+missing.slice(0,5)+' extra='+extra.slice(0,5));
  for(const [name,{mode,sha}] of expected){
    const filename=path.join(dir,name);
    const info=await lstat(filename);
    const actualMode=(info.mode&0o111)?'100755':'100644';
    if(actualMode!==mode)throw Error('Donor mode mismatch: '+name);
    const actualSha=blobSha(await readFile(filename));
    if(actualSha!==sha)throw Error('Donor blob mismatch: '+name+' expected='+sha+' got='+actualSha);
  }
  return {commit:DONOR_COMMIT,tree:DONOR_TREE,files:expected.size};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  verifyDonor().then(r=>console.log('DONOR VERIFIED',JSON.stringify(r))).catch(e=>{
    console.error(e.message);process.exitCode=1;
  });
}
