import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,webcrypto} from 'node:crypto';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {inspectWriteback,writeGitCandidate,observeGitCandidate,
  parseTerminalSuggestion,commitMessage} from '../src/runtime/git-writeback.mjs';
import {validateWritebackMessage,createWritebackBoundary} from '../src/runtime/writeback-boundary.mjs';
globalThis.crypto??=webcrypto;
const TOKEN='test-github-write-token',FOLDER='gens/demo';
const b64=x=>Buffer.from(x).toString('base64');
const sha256=x=>createHash('sha256').update(x).digest('hex');
const gitsha=x=>{const b=Buffer.from(x);return createHash('sha1').update('blob '+b.length+'\0').update(b).digest('hex');};
const FILE=(path,bytes)=>({path,base64:b64(bytes)});
const input=[FILE('main.pjs','new code'),FILE('index.html','<main>new</main>'),
  FILE('src/binary.dat',Buffer.from([0,255,8,2]))];
const base=async()=>exactSource(input);
function fake(options={}){
  const H0='a'.repeat(40),H1='c'.repeat(40),H2='e'.repeat(40);
  const T0='b'.repeat(40),T1='d'.repeat(40),T2='f'.repeat(40);
  let head=H0,patches=0,posts=0,force=false;
  const blobs=new Map(),trees=new Map(),commits=new Map();
  const put=(path,bytes)=>{
    const b=Buffer.from(bytes),sha=gitsha(b);blobs.set(sha,b);
    return {path,sha,size:b.length,mode:'100644',type:'blob'};
  };
  const ready=put(FOLDER+'/DEPLOYMENT.md','Status: READY\n');
  const old=[
    ready,put(FOLDER+'/TESTING.md','assert old'),
    put(FOLDER+'/main.pjs','old code'),put(FOLDER+'/index.html','<main>old</main>'),
    put(FOLDER+'/src/obsolete.css','obsolete'),
    put('.github/workflows/ci.yml','name: unrelated'),
    put('other/readme.md','unrelated')];
  trees.set(T0,old);commits.set(H0,{tree:T0,parents:[]});
  const respond=(status,data)=>({status,json:async()=>data});
  let afterBlob=0;
  async function transport(url,init){
    const path=new URL(url).pathname.replace('/repos/Neb963/per-gens','');
    const method=init.method;
    assert.equal(init.headers.Authorization,'Bearer '+TOKEN);
    assert.equal(init.redirect,'error');
    if(method==='GET'&&path==='')return respond(200,{full_name:'Neb963/per-gens',private:true});
    if(method==='GET'&&path==='/git/ref/heads/main'){
      if(options.unrelatedDrift&&!options.didDrift){
        options.didDrift=true;
        const newer=[...old,put('other/advanced.md','changed unrelated')];
        trees.set(T2,newer);commits.set(H2,{tree:T2,parents:[H0]});head=H2;
      }
      if(options.relevantDrift&&!options.didDrift){
        options.didDrift=true;
        const newer=old.map(e=>e.path===FOLDER+'/main.pjs'?put(e.path,'other writer'):e);
        trees.set(T2,newer);commits.set(H2,{tree:T2,parents:[H0]});head=H2;
      }
      return respond(200,{ref:'refs/heads/main',object:{sha:head,type:'commit'}});
    }
    if(method==='GET'&&path.startsWith('/git/commits/')){
      const c=commits.get(path.split('/').at(-1));
      return c?respond(200,{tree:{sha:c.tree},parents:c.parents.map(sha=>({sha}))}):respond(404,{});
    }
    if(method==='GET'&&path.startsWith('/git/trees/')){
      const t=trees.get(path.split('/').at(-1));
      return t?respond(200,{tree:t,truncated:false}):respond(404,{});
    }
    if(method==='GET'&&path.startsWith('/git/blobs/')){
      const sha=path.split('/').at(-1),blob=blobs.get(sha);
      return blob?respond(200,{sha,size:blob.length,encoding:'base64',
        content:b64(options.corruptRead?Buffer.from('corrupt'):blob)}):
        respond(404,{});
    }
    if(method==='POST'&&path==='/git/blobs'){
      posts++;afterBlob++;
      if(options.failBlob&&afterBlob===1)return respond(500,{});
      const v=JSON.parse(init.body),b=Buffer.from(v.content,'base64');
      const sha=gitsha(b);blobs.set(sha,b);
      return respond(201,{sha});
    }
    if(method==='POST'&&path==='/git/trees'){
      posts++;
      if(options.failTree)return respond(500,{});
      const v=JSON.parse(init.body),prior=trees.get(v.base_tree);
      const updated=[...prior.filter(x=>!v.tree.some(y=>y.path===x.path)),
        ...v.tree.filter(x=>x.sha!==null).map(x=>({...x,size:blobs.get(x.sha)?.length}))];
      trees.set(T1,updated);return respond(201,{sha:T1});
    }
    if(method==='POST'&&path==='/git/commits'){
      posts++;
      if(options.failCommit)return respond(500,{});
      const v=JSON.parse(init.body);
      commits.set(H1,{tree:v.tree,parents:v.parents});return respond(201,{sha:H1});
    }
    if(method==='PATCH'&&path==='/git/refs/heads/main'){
      patches++;const v=JSON.parse(init.body);
      force=v.force;
      if(options.rejectPatch)return respond(422,{});
      const commit=commits.get(v.sha);
      if(!commit?.parents.includes(head))return respond(422,{});
      head=v.sha;
      if(options.lostPatchAck)throw Error('lost ACK after moved ref');
      return respond(200,{object:{sha:head}});
    }
    throw Error(method+' '+path);
  }
  return {transport,metrics:()=>({head,patches,posts,force}),
    inspect:()=>trees.get(commits.get(head).tree).map(x=>x.path)};
}
const write=async(f,extra={})=>writeGitCandidate({
  token:TOKEN,folder:FOLDER,baseHead:'a'.repeat(40),expectedHead:extra.expectedHead||'a'.repeat(40),
  source:await base(),message:'fix: validated source',
  ...extra},f.transport);
test('P53-04 all add/change/delete bytes in one nonforced update; policy files and unrelated trees retained',async()=>{
  const f=fake();
  const r=await write(f);
  assert.equal(r.code,'GIT_COMMITTED_VERIFIED',JSON.stringify(r));
  assert.equal(r.parent,'a'.repeat(40));
  assert.deepEqual(r.changedPaths.sort(),[
    FOLDER+'/index.html',FOLDER+'/main.pjs',FOLDER+'/src/binary.dat',
    FOLDER+'/src/obsolete.css'].sort());
  const keys=f.inspect();
  assert.ok(keys.includes(FOLDER+'/DEPLOYMENT.md')&&keys.includes(FOLDER+'/TESTING.md'));
  assert.ok(keys.includes('other/readme.md')&&keys.includes('.github/workflows/ci.yml'));
  assert.ok(!keys.includes(FOLDER+'/src/obsolete.css'));
  assert.deepEqual(f.metrics().patches,1);
  assert.equal(f.metrics().force,false);
});
test('P53-04 reject relevant divergence before upload and admit unrelated parent only on revalidation',async()=>{
  const conflicting=fake({relevantDrift:true});
  assert.equal((await write(conflicting)).code,'GIT_RELEVANT_PATH_CONFLICT');
  assert.equal(conflicting.metrics().patches,0);
  const other=fake({unrelatedDrift:true});
  const pre=await inspectWriteback({token:TOKEN,folder:FOLDER,baseHead:'a'.repeat(40)},other.transport);
  assert.equal(pre.ok,true,JSON.stringify(pre));assert.equal(pre.head,'e'.repeat(40));
  const r=await write(other,{expectedHead:'e'.repeat(40)});
  assert.equal(r.ok,true,JSON.stringify(r));
  assert.equal(r.parent,'e'.repeat(40));
  assert.ok(other.inspect().includes('other/advanced.md'));
});
test('P53-04 blob/tree/commit/policy failures never move main or expose partial source',async()=>{
  for(const option of ['failBlob','failTree','failCommit','rejectPatch']){
    const f=fake({[option]:true}),r=await write(f);
    assert.equal(r.ok,false,option);
    assert.equal(f.metrics().head,'a'.repeat(40),option);
    assert.ok(f.metrics().patches<=1,option);
  }
});
test('P53-05 lost ref ACK is uncertain, independently observed bytes do not invent author attribution',async()=>{
  const f=fake({lostPatchAck:true}),r=await write(f);
  assert.equal(r.code,'GIT_WRITE_UNCERTAIN');
  assert.equal(f.metrics().patches,1);
  const observation=await observeGitCandidate({token:TOKEN,folder:FOLDER,
    baseHead:'a'.repeat(40),source:await base()},f.transport);
  assert.equal(observation.code,'GIT_EQUIVALENT_ATTRIBUTION_UNKNOWN');
  assert.equal(f.metrics().patches,1);
});
test('P53-04 corrupted readback never certifies committed bytes',async()=>{
  const f=fake({corruptRead:true});
  const r=await write(f);
  assert.equal(r.ok,false,JSON.stringify(r));
  assert.equal(f.metrics().patches,0);
});
test('P53-06 only exact settled, attributed terminal assistant has inert valid suggestion',()=>{
  const session='2'.repeat(64);
  const packet={kind:'TERMINAL_ASSISTANT',origin:'DONOR_GUARDED_NATIVE_HISTORY',
    sessionDigest:session,settled:true,text:'All done.\nPCMS_COMMIT_MESSAGE: fix: hello'};
  assert.deepEqual(parseTerminalSuggestion(packet,session),{ok:true,text:'fix: hello'});
  for(const bad of [
    {...packet,kind:'USER'}, {...packet,origin:'PAGE_DOM'},
    {...packet,sessionDigest:'3'.repeat(64)}, {...packet,settled:false},
    {...packet,text:packet.text+'\nPCMS_COMMIT_MESSAGE: override'},
    {...packet,text:'PCMS_COMMIT_MESSAGE: command\nmalicious'},
    {...packet,text:'PCMS_COMMIT_MESSAGE: abc\nPCMS_COMMIT_MESSAGE: def'}])
    assert.equal(parseTerminalSuggestion(bad,session).ok,false);
  assert.equal(commitMessage('fix: allowed').ok,true);
  assert.equal(commitMessage('publish\nforce push').ok,false);
});
test('P53-06 UI port rejects arbitrary source, source paths or untrusted sender',()=>{
  const api={runtime:{id:'donor-id',getURL:x=>'moz-extension://test/'+x}};
  const external={id:'other',url:'https://perchance.org'};
  assert.equal(validateWritebackMessage(api,external,{type:'COMMIT',params:{slug:'demo',
    expectedRevision:1,token:TOKEN}}).ok,false);
  const sender={id:'donor-id',url:'moz-extension://test/pcms/index.html'};
  for(const extra of [{source:{files:[]}},{folder:'other'},{force:true},{approved:true}]){
    assert.equal(validateWritebackMessage(api,sender,{type:'COMMIT',params:{
      slug:'demo',expectedRevision:1,token:TOKEN,...extra}}).ok,false);
  }
});
test('P53-05 default packaged write capability is never activated through a UI call',async()=>{
  const api={runtime:{id:'donor-id',getURL:x=>'moz-extension://test/'+x}};
  const sender={id:'donor-id',url:'moz-extension://test/pcms/index.html'};
  const boundary=createWritebackBoundary(api,{open:async()=>{throw Error('db off');}});
  const result=await boundary.run({type:'COMMIT',params:{
    slug:'demo',expectedRevision:1,token:TOKEN}},sender);
  assert.equal(result.ok,false);
});
