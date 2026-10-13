import test from 'node:test';
import assert from 'node:assert/strict';
import {perchanceReleaseMain} from '../src/runtime/perchance-release.mjs';
const base64=bytes=>Buffer.from(bytes).toString('base64');
const files=[
  {path:'main.pjs',base64:base64('source F')},
  {path:'index.html',base64:base64('<p>F</p>')},
  {path:'src/pixel.bin',base64:base64([0,255,128])}
];
const request={action:'PUBLISH',slug:'generator-one',files};
function setup({dirty=false,peer=false,wrongBytes=false,human=false,saveResult=true,unknown=false}={}){
  const old={window:globalThis.window,location:globalThis.location,
    document:globalThis.document};
  let saves=0;const generator={name:'generator-one',isPrivate:true},
    src=new Uint8Array(wrongBytes?[0,255,129]:[0,255,128]);
  globalThis.location={origin:'https://perchance.org',
    pathname:'/generator-one',hash:'#edit'};
  globalThis.document={getElementById:()=>({
    dataset:{pcmsHumanIntent:human?'true':'false'}})};
  globalThis.window={
    app:{data:{generator},async saveGenerator(){
      saves++;if(unknown)throw Error('lost ack');
      return saveResult;
    }},
    __editorReady:true,__saveInFlight:false,userOwnsThisGenerator:true,
    modelTextEditor:{getValue:()=> 'source F',isClean:()=>!dirty},
    outputTemplateEditor:{getValue:()=>'<p>F</p>',isClean:()=>true},
    srcState:{list:()=>new Map([['pixel.bin',null]]),
      readFile:async()=>src,isDirty:async()=>dirty,
      hasPending:()=>false,conflictPaths:()=>[]},
    menuBar:{saveState:'saved'},
    saveCheckpointManager:{isDivergenceBlocked:()=>false},
    yjsProvider:null,yDoc:null,
    editorCollabInitialSyncIsPending:false,
    ...(peer?{yjsProviderRoomName:'unknown-second-client'}:{})
  };
  return {saves:()=>saves,private:()=>generator.isPrivate,
    restore:()=>{
      for(const k of Object.keys(old)){
        if(old[k]===undefined)delete globalThis[k];
        else globalThis[k]=old[k];
      }
    }};
}
test('P53-08 F/X: fixed native action flips listing once only after exact binary F and clean owner',async()=>{
  const f=setup();
  try{
    const o=await perchanceReleaseMain(request);
    assert.equal(o.code,'PUBLICATION_ACK_ONLY');
    assert.equal(f.saves(),1);assert.equal(f.private(),false);
  }finally{f.restore();}
});
test('P53-07/X: human dirty editor, peer/unknown collaboration, changed src and wrong target cause zero effects',async()=>{
  for(const props of [{dirty:true},{human:true},{peer:true},{wrongBytes:true}]){
    const f=setup(props);
    try{
      const o=await perchanceReleaseMain(request);
      assert.equal(o.ok,false,JSON.stringify({props,o}));
      assert.equal(f.saves(),0);assert.equal(f.private(),true);
    }finally{f.restore();}
  }
  const f=setup();
  try{
    for(const bad of [
      {...request,action:'REPLACE_SOURCE'},
      {...request,slug:'generator-two'},
      {...request,files:[...files,files[0]]},
      {...request,files:files.slice(0,2)},
      {...request,files:files.map((x,i)=>i===0?{...x,base64:base64('other')}:x)}
    ]) {
      const o=await perchanceReleaseMain(bad);
      assert.equal(o.ok,false,JSON.stringify(o));
      assert.equal(f.saves(),0);
    }
    globalThis.location.origin='https://example.org';
    assert.equal((await perchanceReleaseMain(request)).ok,false);
    assert.equal(f.saves(),0);
  }finally{f.restore();}
});
test('P53-08 F/X: provider error or lost acknowledgement is NOT proof of publication',async()=>{
  for(const props of [{unknown:true},{saveResult:false}]){
    const f=setup(props);
    try{
      const o=await perchanceReleaseMain(request);
      assert.equal(o.ok,false);
      assert.equal(f.saves(),1);
      assert.equal(f.private(),false);
      assert.match(o.code,/UNVERIFIED|POSSIBLY_DISPATCHED/);
    }finally{f.restore();}
  }
});
