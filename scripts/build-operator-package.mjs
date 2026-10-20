// Assemble the operator delivery: XPI + user-scoped native hosts + optional
// PersonaMonkey runtime-witness host + installer, health check and guide.
// Deterministic tarball (sorted entries, fixed mtime) beside the XPI.
import {cp,mkdir,rm,readFile,writeFile,chmod,readdir,stat} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildI00} from './build-i00.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'build/pcms-alpha-operator');
const tarball=path.join(root,'build/pcms-alpha-operator.tar.gz');
const sha=b=>createHash('sha256').update(b).digest('hex');
async function files(dir,base=dir){
  const list=[];
  for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name<b.name?-1:1)){
    const full=path.join(dir,e.name);
    if(e.isDirectory())list.push(...await files(full,base));else list.push(path.relative(base,full));
  }
  return list;
}
export async function buildOperatorPackage(){
  const {output}=await buildI00();
  const xpi=await readFile(output);
  execFileSync('python3',[path.join(root,'scripts/build-s01-native.py')],{stdio:'ignore'});
  await rm(out,{recursive:true,force:true});
  for(const d of ['native','scripts','build','personamonkey-host'])await mkdir(path.join(out,d),{recursive:true});
  await writeFile(path.join(out,'pcms-alpha.xpi'),xpi);
  // The isolated diagnostic host expects build/pcms-alpha-i00.xpi beside it.
  await writeFile(path.join(out,'build/pcms-alpha-i00.xpi'),xpi);
  for(const f of ['backup_vault_host.py','backup_v2_host.py','backup_stream_v2.py',
    'backup_v2_retention.py','s08_isolated_browser_host.py'])
    await cp(path.join(root,'native',f),path.join(out,'native',f));
  for(const f of ['browser-i00-smoke.py','s02-ci-native-host.py'])
    await cp(path.join(root,'scripts',f),path.join(out,'scripts',f));
  await cp(path.join(root,'build/s01-native-candidate/native_host.py'),path.join(out,'personamonkey-host/native_host.py'));
  await cp(path.join(root,'build/s01-native-candidate/pcms_witness.py'),path.join(out,'personamonkey-host/pcms_witness.py'));
  await writeFile(path.join(out,'personamonkey-host/ORIGINAL_SHA256'),
    sha(await readFile(path.join(root,'donor/personamonkey/native/native_host.py')))+'\n');
  for(const f of ['install.sh','uninstall.sh','pcms-native-check.py'])
    await cp(path.join(root,'packaging',f),path.join(out,f));
  await cp(path.join(root,'docs/operator/OPERATOR-GUIDE.md'),path.join(out,'OPERATOR-GUIDE.md'));
  await writeFile(path.join(out,'VERSION'),sha(xpi).slice(0,12)+'\n');
  for(const f of ['install.sh','uninstall.sh','pcms-native-check.py','native/backup_vault_host.py',
    'native/backup_v2_host.py','native/s08_isolated_browser_host.py','personamonkey-host/native_host.py'])
    await chmod(path.join(out,f),0o755);
  const listed=(await files(out)).filter(f=>f!=='SHA256SUMS');
  const sums=[];
  for(const f of listed)sums.push(sha(await readFile(path.join(out,f)))+'  '+f);
  await writeFile(path.join(out,'SHA256SUMS'),sums.join('\n')+'\n');
  execFileSync('python3',['-c',`
import tarfile,sys,os
src,dst=sys.argv[1],sys.argv[2]
names=[]
for d,_,fs in os.walk(src):
  for f in fs:names.append(os.path.relpath(os.path.join(d,f),src))
with open(dst,'wb') as raw:
  import gzip
  with gzip.GzipFile(fileobj=raw,mode='wb',mtime=0) as gz:
    with tarfile.open(fileobj=gz,mode='w') as t:
      for n in sorted(names):
        info=t.gettarinfo(os.path.join(src,n),'pcms-alpha-operator/'+n)
        info.mtime=0;info.uid=info.gid=0;info.uname=info.gname=''
        with open(os.path.join(src,n),'rb') as fh:t.addfile(info,fh)
`,out,tarball]);
  const tar=await readFile(tarball);
  return {xpiSha256:sha(xpi),tarball,tarballSha256:sha(tar),files:listed.length+1,
    size:(await stat(tarball)).size};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  buildOperatorPackage().then(r=>{
    console.log('XPI SHA-256      '+r.xpiSha256);
    console.log('Package          '+r.tarball);
    console.log('Package SHA-256  '+r.tarballSha256);
  }).catch(e=>{console.error(e.message);process.exitCode=1;});
}
