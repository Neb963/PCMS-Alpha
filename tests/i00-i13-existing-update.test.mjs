import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {sealPrevious,unlockPrevious,authorizeSleepingUpdate} from '../src/runtime/existing-update-core.mjs';
import {validateExistingMessage,createExistingBoundary} from '../src/runtime/existing-update-boundary.mjs';
import {perchanceExistingMain} from '../src/runtime/perchance-existing.mjs';
globalThis.crypto??=webcrypto;
const H='b'.repeat(64),slug='existing-fixture';
const b64=x=>Buffer.from(x).toString('base64');
const oldFiles=[
  {path:'main.pjs',base64:b64('old P')},
  {path:'index.html',base64:b64('<p>P</p>')},
  {path:'src/deleted.bin',base64:b64([0,255,10])}
],newFiles=[
  {path:'main.pjs',base64:b64('updated F')},
  {path:'index.html',base64:b64('<p>F</p>')},
  {path:'src/added.bin',base64:b64([0,255,11])}
];
test('P53-08 F/X: AES-GCM encrypted P has authenticated full binary manifest, wrong password and tampering held',async()=>{
  const old=await exactSource(oldFiles);
  const sealed=await sealPrevious(old,'correct-horse-battery-recovery');
  assert.equal(sealed.ok,true);
  assert.equal(sealed.ciphertext.includes('old P'),false);
  assert.equal(JSON.stringify(sealed).includes('deleted.bin'),false);
  const unlocked=await unlockPrevious(sealed,'correct-horse-battery-recovery');
  assert.equal(unlocked.ok,true);
  assert.equal(unlocked.source.fingerprint,old.fingerprint);
  assert.equal((await unlockPrevious(sealed,'bad-password-goes-here')).ok,false);
  assert.equal((await unlockPrevious({...sealed,fingerprint:H},'correct-horse-battery-recovery')).ok,false);
  assert.equal((await unlockPrevious({...sealed,ciphertext:(sealed.ciphertext[0]==='A'?'B':'A')+sealed.ciphertext.slice(1)},
    'correct-horse-battery-recovery')).ok,false);
  assert.equal((await sealPrevious({...old,fingerprint:H},'correct-horse-battery-recovery')).ok,false);
});
test('P53-07 F/X: adopted public P requires same owner, archived original and real sleeping slot',async()=>{
  const original=await exactSource(oldFiles);
  const account={accountId:'account_fixture_01',revision:4,state:'VERIFIED',
    personaUid:'persona-fixture01',bindingVersion:1,identity:{
      source:'GUARDED_SESSION_READBACK',principalFingerprint:H}};
  const adoption={slug,accountId:account.accountId,accountRevision:4,
    personaUid:account.personaUid,bindingVersion:1,principalFingerprint:H,
    remotePublicId:'public_fixture01',archiveState:'ARCHIVED_GIT_CONFIRMED'};
  const inventory={slug,accountId:account.accountId,personaUid:account.personaUid,
    bindingVersion:1,remoteId:adoption.remotePublicId,ownerState:'OBSERVED_OWNER'};
  const shadow={phase:'SLEEPING',sleepRemaining:7200000,paused:false,slot:false,
    identityHeld:false,reviewHeld:false,ownerVerified:true,releaseVerified:true,
    bindingVersion:1,remoteId:inventory.remoteId,accountId:inventory.accountId,
    personaUid:account.personaUid};
  const remote={ok:true,remotePublicId:inventory.remoteId,ownerResult:'IS_OWNER',
    visibility:'PUBLIC',source:original};
  const base={account,inventory,adoption,shadow,original,remote};
  assert.equal(authorizeSleepingUpdate(base).ok,true);
  for(const bad of [
    {...base,shadow:{...shadow,phase:'ACTIVE'}},
    {...base,shadow:{...shadow,releaseVerified:false}},
    {...base,shadow:{...shadow,slot:true}},
    {...base,adoption:{...adoption,archiveState:'HELD_UNCERTAIN'}},
    {...base,inventory:{...inventory,remoteId:'public_changed'}},
    {...base,remote:{...remote,visibility:'UNLISTED'}},
    {...base,remote:{...remote,source:{...original,fingerprint:H}}},
    {...base,account:{...account,revision:5}}
  ])assert.equal(authorizeSleepingUpdate(bad).ok,false);
});
function fakeNative({dirty=false,peer=false,human=false,otherSource=false,
  lostAck=false}={}){
  const old={window:globalThis.window,location:globalThis.location,
    document:globalThis.document};
  let saves=0,writeCount=0,deleteCount=0,dirtySource=false;
  let pjs=otherSource?'human unsaved edit':'old P',html='<p>P</p>';
  const assets=new Map([['deleted.bin',new Uint8Array([0,255,10])]]);
  let privacy=false,saveState='saved';
  const generator={name:slug,get isPrivate(){return privacy;},
    set isPrivate(v){privacy=v;}};
  const model={getValue:()=>pjs,setValue:x=>{pjs=x;saveState='unsaved';},
    isClean:()=>!dirty};
  const output={getValue:()=>html,setValue:x=>{html=x;saveState='unsaved';},
    isClean:()=>!dirty};
  globalThis.location={origin:'https://perchance.org',pathname:'/'+slug,hash:'#edit'};
  globalThis.document={getElementById:()=>({dataset:{pcmsHumanIntent:human?'true':'false'}})};
  globalThis.window={__editorReady:true,__saveInFlight:false,
    userOwnsThisGenerator:true,
    app:{data:{generator},async saveGenerator(){
      saves++;if(lostAck)throw Error('lost');
      saveState='saved';dirtySource=false;return true;
    }},
    modelTextEditor:model,outputTemplateEditor:output,
    srcState:{
      list:()=>Object.fromEntries([...assets.keys()].map(k=>[k,{pending:false}])),
      readFile:async n=>assets.get(n)?.buffer,
      async writeFile(n,v){writeCount++;assets.set(n,new Uint8Array(v));dirtySource=true;saveState='unsaved';},
      async deleteFile(n){deleteCount++;assets.delete(n);dirtySource=true;saveState='unsaved';},
      isDirty:async()=>dirtySource,hasPending:()=>false,conflictPaths:()=>[]
    },
    menuBar:{get saveState(){return saveState;}},
    saveCheckpointManager:{isDivergenceBlocked:()=>false},
    editorCollabInitialSyncIsPending:false,
    ...(peer?{yjsProviderRoomName:'unknown-room'}:{})
  };
  return {state:()=>({pjs,html,privacy,saves,writeCount,deleteCount,
    paths:[...assets.keys()],image:assets.get('added.bin')}),
    restore(){for(const k of Object.keys(old)){
      if(old[k]===undefined)delete globalThis[k];else globalThis[k]=old[k];
    }}
  };
}
test('P53-08 F/X: genuine native full-F update deletes previous binary and restore P remains unlisted',async()=>{
  const f=fakeNative();
  try{
    const request={slug,previousFiles:oldFiles};
    assert.equal((await perchanceExistingMain({...request,action:'UNLIST'})).code,'UNLIST_ACK_ONLY');
    assert.equal(f.state().privacy,true);
    const updated=await perchanceExistingMain({...request,action:'STAGE',targetFiles:newFiles});
    assert.equal(updated.code,'STAGE_ACK_ONLY',JSON.stringify(updated));
    assert.deepEqual(f.state().paths,['added.bin']);
    assert.equal(f.state().deleteCount,1);
    assert.equal(f.state().pjs,'updated F');
    assert.equal(f.state().privacy,true);
    const restored=await perchanceExistingMain({slug,action:'RESTORE',
      previousFiles:newFiles,targetFiles:oldFiles});
    assert.equal(restored.code,'RESTORE_ACK_ONLY',JSON.stringify(restored));
    assert.deepEqual(f.state().paths,['deleted.bin']);
    assert.equal(f.state().pjs,'old P');
    assert.equal(f.state().privacy,true);
    assert.equal(f.state().saves,3);
  }finally{f.restore();}
});
test('P53-08 X: lost ack is uncertain and dirty/peer/human/external edits yield zero remote effects',async()=>{
  for(const props of [{dirty:true},{human:true},{peer:true},{otherSource:true}]){
    const f=fakeNative(props);
    try{
      const o=await perchanceExistingMain({slug,action:'UNLIST',previousFiles:oldFiles});
      assert.equal(o.ok,false,JSON.stringify({props,o}));
      assert.equal(f.state().saves,0);
      assert.equal(f.state().privacy,false);
    }finally{f.restore();}
  }
  const lost=fakeNative({lostAck:true});
  try{
    const out=await perchanceExistingMain({slug,action:'UNLIST',previousFiles:oldFiles});
    assert.equal(out.code,'UNLIST_POSSIBLY_DISPATCHED');
    assert.equal(lost.state().saves,1);
  }finally{lost.restore();}
});
test('I13 X: forged ports, untyped passphrases, target confusion and caller source all denied',async()=>{
  const sender={id:'fixture',url:'moz-extension://fixture/pcms/index.html'};
  const api={runtime:{id:'fixture',getURL:p=>'moz-extension://fixture/'+p},
    storage:{local:{get:async()=>({})}}};
  const good={type:'PREPARE',params:{slug,passphrase:'password-long-enough'}};
  assert.equal(validateExistingMessage(api,sender,good).ok,true);
  // S05 READY is authorized through the protected Git vault. Legacy
  // source inspection still refuses the absent credential internally.
  assert.equal(validateExistingMessage(api,sender,{type:'PIN_STAGE',params:{
    slug,expectedRevision:3,passphrase:'password-long-enough'}}).ok,true);
  assert.equal(validateExistingMessage(api,sender,{type:'PIN_STAGE',params:{
    slug,expectedRevision:3,passphrase:'password-long-enough',token:'short'}}).ok,false);
  assert.equal(validateExistingMessage(api,{...sender,url:'https://perchance.org'},good).code,'UNTRUSTED_SENDER');
  for(const invalid of [
    {type:'PUBLISH',params:{slug}},
    {...good,params:{...good.params,sourceBytes:oldFiles}},
    {...good,params:{...good.params,slug:'../wrong'}},
    {...good,params:{...good.params,passphrase:'short'}},
    {type:'STAGE',params:{slug,expectedRevision:1,source:newFiles}},
    {type:'RESTORE',params:{slug,expectedRevision:0,passphrase:'password-long-enough'}}
  ])assert.equal(validateExistingMessage(api,sender,invalid).ok,false);
  let effects=0;
  const boundary=createExistingBoundary(api,{
    open:async()=>({}),existingFactory:()=>({get:async()=>({ok:false,code:'NOT_FOUND'})}),
    guard:()=>({runExistingStep:async()=>{effects++;return {ok:true};}})});
  assert.equal((await boundary.run({type:'GET',params:{slug}},sender)).code,'NOT_FOUND');
  assert.equal(effects,0);
});
