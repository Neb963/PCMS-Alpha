import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {matchesApproval,safeRollbackAdmission} from '../src/runtime/release-core.mjs';
import {canonicalRefresherInputs,currentMarkerAuthority} from '../src/runtime/refresher-store.mjs';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {prepareMarker,recognizeMarker,markerReceipt,encodeText,MARKER_POLICY,REFRESH_METHOD} from '../src/runtime/refresh-marker.mjs';
import {runRefreshOwnedTab} from '../src/runtime/refresh-owned-tab.mjs';
import {perchanceRefreshMain} from '../src/runtime/perchance-refresh.mjs';
import {createRefresherProviderAdapter,sourceRefreshProjection} from '../src/runtime/refresher-provider-adapter.mjs';
import {emptyRefreshEvidence,reserveRefreshAttempt,dispatchPossible,reconcileRefreshAttempt} from '../src/runtime/refresher-effect-core.mjs';
import {canonicalJson,verifyRefreshReview,digestReview} from '../src/runtime/refresh-review.mjs';
import {measureRefreshResources} from '../src/runtime/refresh-resource.mjs';
const slug='ordinary-listed-refresh',remoteId='public_fixture_public_01',principal='a'.repeat(64);
const files=[{path:'main.pjs',base64:encodeText('output = ["unchanged"]')},
  {path:'index.html',base64:encodeText('<!doctype html>\n<div>[output]</div>\n<script>const s="literal";</script>')},
  {path:'src/image.bin',base64:Buffer.from([0,255,1,128]).toString('base64')}];
const base=await exactSource(files),id='1'.repeat(32);
const prepared=await prepareMarker(files,{approvedBaseFingerprint:base.fingerprint,id,consentRevision:1});
assert.equal(prepared.ok,true);
function nativeFixture({persist=true,lostAck=false,workspace=null}={}){
  let html=Buffer.from(files[1].base64,'base64').toString(),pjs=Buffer.from(files[0].base64,'base64').toString();
  const remote={files:structuredClone(files)},ledger=[];
  const menu={saveState:'saved'};
  globalThis.location={origin:'https://perchance.org',pathname:'/'+slug,hash:'#edit'};
  globalThis.document={getElementById:()=>null};
  globalThis.localStorage={getItem:()=>JSON.stringify({[slug]:{one:{}}})};
  globalThis.window={__editorReady:true,__saveInFlight:false,userOwnsThisGenerator:true,
    editorCollabInitialSyncIsPending:false,__collabRoomFailed:false,
    modelTextEditor:{getValue:()=>pjs,isClean:()=>menu.saveState==='saved'},
    outputTemplateEditor:{getValue:()=>html,isClean:()=>menu.saveState==='saved',setValue:v=>{html=v;menu.saveState='unsaved';}},
    srcState:{ready:async()=>{},list:()=>['image.bin'],readFile:async()=>Uint8Array.from([0,255,1,128]),
      isDirty:async()=>false,hasPending:()=>false,conflictPaths:()=>[]},menuBar:menu,
    aiAgentWorkspaceSnapshot:async()=>workspace,saveCheckpointManager:{isDivergenceBlocked:()=>false},
    app:{data:{generator:{name:slug,isPrivate:false,publicId:remoteId.slice(7)}},saveGenerator:async()=>{
      // Independent remote ledger, never derived from PCMS's effect result.
      ledger.push({html,pjs,asset:[0,255,1,128]});
      if(persist)remote.files=[{path:'main.pjs',base64:encodeText(pjs)},{path:'index.html',base64:encodeText(html)},files[2]];
      menu.saveState='saved';if(lostAck)throw Error('lost native ACK');return true;
    }}};
  return {remote,ledger,request:{slug,remoteId,plan:prepared.plan,previousFiles:files},
    current:()=>[{path:'main.pjs',base64:encodeText(pjs)},{path:'index.html',base64:encodeText(html)},files[2]]};
}
test('I17/P54-05 F: full-source derivation changes only one deterministic HTML prefix; replacement does not append',async()=>{
  assert.notEqual(prepared.pre.fingerprint,prepared.post.fingerprint);
  assert.deepEqual(prepared.post.blobs.filter(f=>f.path!=='index.html'),prepared.pre.blobs.filter(f=>f.path!=='index.html'));
  const receipt=markerReceipt(prepared.plan,1000);
  assert.equal((await recognizeMarker(prepared.post.blobs,receipt)).ok,true);
  const second=await prepareMarker(prepared.post.blobs,{approvedBaseFingerprint:base.fingerprint,
    previous:receipt,id:'2'.repeat(32),consentRevision:1});
  assert.equal(second.ok,true);assert.equal(second.plan.sequence,2);
  const html=Buffer.from(second.post.blobs.find(f=>f.path==='index.html').base64,'base64').toString();
  assert.equal(html.split('PCMS_REFRESH_MARKER').length,2);assert.ok(html.endsWith(Buffer.from(files[1].base64,'base64').toString()));
  assert.equal((await recognizeMarker(second.post.blobs,receipt)).ok,false);
});
test('I17/P53-07 X: functional/asset drift, unattributed marker and unsafe source never become approved F',async()=>{
  for(const candidate of [files.map(f=>f.path==='main.pjs'?{...f,base64:encodeText('changed code')}:f),
    files.map(f=>f.path==='src/image.bin'?{...f,base64:encodeText('changed asset')}:f),prepared.post.blobs])
    assert.equal((await prepareMarker(candidate,{approvedBaseFingerprint:base.fingerprint,id})).ok,false);
  for(const html of ['output = text','\ufeff<div>bom</div>','<div>PCMS_REFRESH_MARKER</div>']){
    const candidate=files.map(f=>f.path==='index.html'?{...f,base64:encodeText(html)}:f),source=await exactSource(candidate);
    assert.equal((await prepareMarker(candidate,{approvedBaseFingerprint:source.fingerprint,id})).ok,false,html);
  }
});
test('I17 F: fixed native preflight is read-only; one authorized save preserves PJS, assets and original HTML exactly',async()=>{
  const f=nativeFixture();
  assert.equal((await perchanceRefreshMain({...f.request,action:'PREFLIGHT'})).ok,true);
  assert.equal(f.ledger.length,0);
  assert.equal((await perchanceRefreshMain({...f.request,action:'SAVE'})).ok,true);
  assert.equal(f.ledger.length,1);
  assert.equal((await exactSource(f.remote.files)).fingerprint,prepared.plan.expectedPostSaveFingerprint);
  assert.equal((await perchanceRefreshMain({...f.request,action:'SAVE'})).ok,false);
  assert.equal(f.ledger.length,1);
});
test('I17 X: dirty/human/collaborative/wrong owner/private/drifted native contexts produce zero saves',async()=>{
  for(const scenario of ['dirty','human','collaborator','owner','private','target','source','asset','workspace','route']){
    const f=nativeFixture();
    if(scenario==='dirty')window.menuBar.saveState='unsaved';
    if(scenario==='human')document.getElementById=()=>({dataset:{pcmsHumanIntent:'true'}});
    if(scenario==='collaborator')window.yjsProvider={};
    if(scenario==='owner')window.userOwnsThisGenerator=false;
    if(scenario==='private')window.app.data.generator.isPrivate=true;
    if(scenario==='target')window.app.data.generator.publicId='other';
    if(scenario==='source')window.modelTextEditor.getValue=()=> 'different';
    if(scenario==='asset')window.srcState.readFile=async()=>new Uint8Array([4]);
    if(scenario==='workspace')window.aiAgentWorkspaceSnapshot=async()=>({preferWorkspace:{modelText:true,outputTemplate:false}});
    if(scenario==='route')location.origin='https://example.invalid';
    const out=await perchanceRefreshMain({...f.request,action:'SAVE'});
    assert.equal(out.ok,false,scenario);assert.equal(f.ledger.length,0,scenario);
  }
  const f=nativeFixture({workspace:{preferWorkspace:{modelText:false,outputTemplate:false}}});
  assert.equal((await perchanceRefreshMain({...f.request,action:'SAVE'})).ok,true);
});
function readDb(record){return {transaction(){const t={objectStore:()=>({get(){const req={};
  queueMicrotask(()=>{req.onsuccess?.({target:{result:{record}}});queueMicrotask(()=>t.oncomplete?.());});return req;}})};return t;}};}
test('I17/P54-05 F/X: production provider bridge uses fixed native save and independent ledger readback; ACK differs from persistence/feed',async()=>{
  for(const scenario of ['present','absent','partial','stale','429','no-persist','lost-ack','idb-abort']){
    const f=nativeFixture({persist:scenario!=='no-persist',lostAck:scenario==='lost-ack'}),order=[];
    const route={ready:true,routeId:'protected',cookieStoreId:'container',healthDomain:'egress_one'};
    const cfg={consent:{revision:1},lastReceipt:null};
    const guard=()=>({getSafeRouteReadiness:async()=>route,
      observeReadOnly:async()=>({ok:true,principalFingerprint:principal,original:{pjs:Buffer.from(f.remote.files[0].base64,'base64').toString(),
        html:Buffer.from(f.remote.files[1].base64,'base64').toString(),assets:[f.remote.files[2]],ownerResult:'IS_OWNER',
        remotePublicId:remoteId,visibility:'PUBLIC'}}),
      observeMonitoring:async()=>scenario==='429'?{ok:false,code:'RATE_LIMITED',retryAfterMs:900000}:
        {ok:true,complete:scenario!=='partial',principalFingerprint:principal,observedAt:scenario==='stale'?1:10000,
          items:scenario==='absent'?[]:[{slug}]},
      runRefreshStep:async(_uid,request,commit)=>{
        order.push('PREFLIGHT');const pre=await perchanceRefreshMain({...request,action:'PREFLIGHT'});if(!pre.ok)return pre;
        const mark=await commit('MARK');if(!mark.ok)return mark;
        order.push('SAVE');return perchanceRefreshMain({...request,action:'SAVE'});
      }});
    const adapter=createRefresherProviderAdapter({storage:{}},{database:async()=>readDb(cfg),guard,
      sentinel:{inspect:async()=>({held:false})},clock:()=>10000});
    const claim={id,slug,remoteId,personaUid:'fixture-persona',principalFingerprint:principal,
      releaseFingerprint:base.fingerprint,plan:prepared.plan};
    const executed=await adapter.execute(claim,{beforeSave:async()=>{
      order.push('JOURNAL_COMMIT');return {ok:scenario!=='idb-abort'};
    }});
    const check=await adapter.readback(claim);
    assert.equal(f.ledger.length,scenario==='idb-abort'?0:1,scenario);
    assert.equal(check.kind,['no-persist','idb-abort'].includes(scenario)?'NO_EFFECT':'EFFECT_CHANGED',scenario);
    if(scenario==='absent')assert.equal(check.feed.present,false);
    if(['partial','stale','429'].includes(scenario))assert.equal(check.feed.independent,false,scenario);
    if(scenario==='lost-ack')assert.equal(executed.ok,false);
    assert.deepEqual(order.slice(0,2),['PREFLIGHT','JOURNAL_COMMIT']);
  }
});
test('I17/P54-09: observed storage pressure holds before journal/native save; below the threshold the protected adapter remains executable',async()=>{
  const descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');
  try{
    for(const usage of [799,800,1001]){
      Object.defineProperty(globalThis,'navigator',{configurable:true,value:{storage:{estimate:async()=>({quota:1000,usage})}}});
      const f=nativeFixture();let marks=0;
      const route={ready:true,cookieStoreId:'fixture-container',routeId:'protected',healthDomain:'fixture-egress'};
      const adapter=createRefresherProviderAdapter({storage:{}},{database:async()=>readDb({consent:{revision:1}}),
        sentinel:{inspect:async()=>({held:false})},guard:()=>({getSafeRouteReadiness:async()=>route,
          observeReadOnly:async()=>({ok:true,principalFingerprint:principal,original:{ownerResult:'IS_OWNER',remotePublicId:remoteId,visibility:'PUBLIC',
            pjs:Buffer.from(files[0].base64,'base64').toString(),html:Buffer.from(files[1].base64,'base64').toString(),assets:[files[2]]}}),
          runRefreshStep:async(_uid,request,commit)=>{
            const pre=await perchanceRefreshMain({...request,action:'PREFLIGHT'});if(!pre.ok)return pre;
            const mark=await commit('MARK');if(!mark.ok)return mark;return perchanceRefreshMain({...request,action:'SAVE'});
          }})});
      const result=await adapter.execute({id,slug,remoteId,personaUid:'fixture-persona',principalFingerprint:principal,
        releaseFingerprint:base.fingerprint,plan:prepared.plan},{beforeSave:async()=>{marks++;return {ok:true};}});
      assert.equal(result.ok,usage<800);assert.equal(f.ledger.length,usage<800?1:0);assert.equal(marks,usage<800?1:0);
      if(usage>=800){assert.equal(result.code,'REFRESH_STORAGE_PRESSURE');assert.equal(result.effectBoundary,'NOT_DISPATCHED');}
    }
  }finally{if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;}
});

test('I17 X: effect reducer accepts only exact expected post-source, preserves uncertainty, separates absent feed',()=>{
  const candidate={method:REFRESH_METHOD,version:MARKER_POLICY,status:'ARMED_SINGLE_TEST',purpose:'SINGLE_TEST',
    evidenceId:id,sourceFingerprint:base.fingerprint,plan:prepared.plan};
  const reserved=reserveRefreshAttempt(emptyRefreshEvidence(),{id,at:10000,slug,sourceFingerprint:base.fingerprint,
    candidate,eligible:true,liveAuthorized:true});assert.equal(reserved.ok,true);
  const dispatch=dispatchPossible(reserved.evidence,id,10001).evidence;
  const wrong=reconcileRefreshAttempt(dispatch,id,{at:10002,kind:'EFFECT_CHANGED',sourceFingerprint:'b'.repeat(64),targetMatched:true,principalMatched:true});
  assert.equal(wrong.effectVerified,false);assert.equal(wrong.evidence.intent.id,id);
  const yes=reconcileRefreshAttempt(dispatch,id,{at:10002,kind:'EFFECT_CHANGED',sourceFingerprint:prepared.post.fingerprint,
    targetMatched:true,principalMatched:true,feed:{independent:true,complete:true,present:false,observedAt:10002}});
  assert.equal(yes.effectVerified,true);assert.equal(yes.feedState,'ABSENT');assert.equal(yes.evidence.suspended,true);
  assert.equal(yes.evidence.history[0].marker.source,'PCMS_REFRESH_MARKER');
});
test('I17 H-04 X/F: independently pinned signature binds actual canonical source/feed and measured target scope',async()=>{
  const pair=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const raw=await crypto.subtle.exportKey('jwk',pair.publicKey),publicKey={kty:raw.kty,crv:raw.crv,x:raw.x,y:raw.y};
  const reviewer={publicKey,fingerprint:await digestReview(publicKey)};
  const record={slug,accountId:'account_one',personaUid:'persona-one',bindingVersion:1,principalFingerprint:principal,
    approvedBaseFingerprint:base.fingerprint};
  const proof={id,effect:'EFFECT_CONFIRMED',marker:markerReceipt(prepared.plan,10000),feed:{state:'PRESENT',at:10002,rank:43}};
  const resource={kind:'PACKAGED_LOCAL_RESOURCE_MEASUREMENT',accounts:50,generators:1250,maxConcurrentSaves:1,
    digest:'c'.repeat(64),turnMs:10};
  const payload={schema:1,kind:'PCMS_H04_REVIEW',method:REFRESH_METHOD,policy:MARKER_POLICY,...record,operationId:id,
    expectedPostSaveFingerprint:prepared.post.fingerprint,feedObservedAt:10002,feedRank:43,reviewedAt:10003,
    validUntil:100000,repeatedUsePermitted:true,permissionEvidence:'operator-reviewed-provider-evidence-v1',
    minimumIntervalMs:600000,resourceDigest:resource.digest,maxTurnMs:100};
  const signature=Buffer.from(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},pair.privateKey,
    new TextEncoder().encode(canonicalJson(payload)))).toString('base64');
  const context={reviewer,record,proof,resource,now:10004};
  assert.equal((await verifyRefreshReview({payload,signature},context)).ok,true);
  for(const changed of [{...payload,slug:'wrong'},{...payload,repeatedUsePermitted:false},
    {...payload,resourceDigest:'d'.repeat(64)},{...payload,method:'SUPPORTED_AND_VERIFIED'}])
    assert.equal((await verifyRefreshReview({payload:changed,signature},context)).ok,false);
  for(const change of [{reviewer:{...reviewer,revoked:true}},{proof:{...proof,feed:{state:'ABSENT'}}},
    {resource:{...resource,generators:10}},{now:100001}])
    assert.equal((await verifyRefreshReview({payload,signature},{...context,...change})).ok,false);
  // Exercise the operator's delivered offline helper, including its actual
  // file/CLI envelope, against the same production verifier.
  const {mkdtemp,writeFile,stat,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os');
  const {execFileSync}=await import('node:child_process'),folder=await mkdtemp(tmpdir()+'/pcms-h04-review-helper-');
  try{
    const keys=folder+'/keys',challenge=folder+'/challenge.json',output=folder+'/signed.json';
    execFileSync(process.execPath,['scripts/i17-h04-review.mjs','key',keys]);
    assert.equal((await stat(keys+'/private-key.json')).mode&0o777,0o600);
    await writeFile(challenge,JSON.stringify({challenge:payload,resource}));
    execFileSync(process.execPath,['scripts/i17-h04-review.mjs','sign',keys+'/private-key.json',challenge,
      'operator-reviewed-helper-evidence','10','100',output,'--approve-repeated-use']);
    const signed=JSON.parse(await readFile(output,'utf8')),publicKey=JSON.parse(await readFile(keys+'/public-key.json','utf8'));
    const localReviewer={publicKey,fingerprint:await digestReview(publicKey)};
    assert.equal((await verifyRefreshReview(signed,{...context,reviewer:localReviewer,now:Date.now()})).ok,true);
    assert.throws(()=>execFileSync(process.execPath,['scripts/i17-h04-review.mjs','sign',keys+'/private-key.json',challenge,
      'operator-reviewed-helper-evidence','10','100',folder+'/must-not-sign.json'],{stdio:'pipe'}));
  }finally{await rm(folder,{recursive:true,force:true});}
});
test('I17/P54-09 F: same-XPI resource sample is bounded at 50 accounts/1250 generators and excludes provider capacity claims',async()=>{
  const report=await measureRefreshResources({storage:{}},{clock:()=>10000});
  assert.equal(report.generators,1250);assert.equal(report.queuePeak,1250);assert.equal(report.maxConcurrentSaves,1);
  assert.match(report.digest,/^[a-f0-9]{64}$/);assert.ok(report.serializedBytes<4000000);
});
test('I17 F: package production graph includes native donor executor and non-null adapter, not only qualification UI',async()=>{
  const [entry,overlay,guard]=await Promise.all(['entry.mjs','overlay.mjs','persona-guard.mjs'].map(x=>readFile('src/runtime/'+x,'utf8')));
  assert.match(entry,/createRefresherProviderAdapter\(browser/);assert.match(entry,/qualificationFor:row=>refreshAdapter.qualificationFor\(row\)/);
  for(const name of ['perchance-refresh.mjs','refresh-owned-tab.mjs','refresher-provider-adapter.mjs','refresh-source-store.mjs'])assert.ok(overlay.includes("'"+name+"'"));
  assert.match(overlay,/refreshIsolatedTab: async \(lease,request,beforeSave\)=>runRefreshOwnedTab/);
  assert.match(guard,/async function runRefreshStep/);
});


test('I17/P53-07 source provenance never transfers base-F publication/rollback approval to marked bytes',async()=>{
  const approval={slug,sourceFingerprint:base.fingerprint,files:base.files,previousFingerprint:base.fingerprint};
  assert.equal((await recognizeMarker(prepared.post.blobs,markerReceipt(prepared.plan,1000))).ok,true);
  assert.equal(matchesApproval(approval,{...approval,sourceFingerprint:prepared.post.fingerprint,files:prepared.post.files}).ok,false);
  assert.equal(safeRollbackAdmission({release:{state:'CONFIRMED_PUBLIC',approval},
    previous:base,observed:{source:'INDEPENDENT_FULL_BYTE_READBACK',fingerprint:prepared.post.fingerprint,visibility:'UNLISTED'},
    editor:{ok:true,clean:true},restore:{held:false}}).ok,false);
  assert.deepEqual(base.blobs,prepared.pre.blobs);
});


test('I17 production source provenance: historical Git B does not falsely block an independently approved/released F; explicit READY work still holds',()=>{
  const account={accountId:'account_01',personaUid:'persona-01',bindingVersion:1,state:'VERIFIED',
    identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,principalFingerprint:principal}};
  const generator={slug,accountId:account.accountId,personaUid:account.personaUid,bindingVersion:1,
    remoteId,ownerState:'OBSERVED_OWNER',visibility:'PUBLIC'};
  const release={slug,...generator,remoteId,principalFingerprint:principal,state:'CONFIRMED_PUBLIC',
    source:'INDEPENDENT_PUBLICATION_READBACK',sourceFingerprint:base.fingerprint,
    observationId:'observed_f_01',observedAt:10000};
  const link={slug,fingerprint:'c'.repeat(64),readyAtInspection:true};
  const records=[{key:'account:account_01',account},{key:'inventory:'+slug,generator},
    {key:'release:'+slug,release},{key:'source-link:'+slug,link}];
  const r=canonicalRefresherInputs(records)[0];assert.equal(r.releaseVerified,true);assert.equal(r.readyUpdate,false);
  assert.equal(r.releaseFingerprint,base.fingerprint);assert.equal(link.fingerprint,'c'.repeat(64));
  link.readyUpdate=true;assert.equal(canonicalRefresherInputs(records)[0].readyUpdate,true);
  release.principalFingerprint='f'.repeat(64);assert.equal(canonicalRefresherInputs(records)[0].releaseVerified,false);
});


test('I17 read-only reconciliation cannot transfer an old marker receipt across released F, account/Persona/session or consent changes',()=>{
  const row={slug,accountId:'account_one',personaUid:'fixture-persona',bindingVersion:1,remoteId,
    ownerVerified:true,releaseVerified:true,listing:'PUBLIC',releaseFingerprint:base.fingerprint,
    sourceRefresh:{policy:MARKER_POLICY,accountId:'account_one',personaUid:'fixture-persona',bindingVersion:1,remoteId,
      principalFingerprint:principal,approvedBaseFingerprint:base.fingerprint,
      consent:{revision:1,approvedBaseFingerprint:base.fingerprint}}};
  const state={accounts:{account_one:{verifiedIdentity:true,principalFingerprint:principal}}};
  assert.equal(currentMarkerAuthority(state,row,prepared.plan),true);
  for(const change of [{accountId:'account_other'},{personaUid:'other-persona'},{bindingVersion:2},
    {remoteId:'other_remote'},{ownerVerified:false},{releaseVerified:false},{listing:'UNLISTED'},
    {releaseFingerprint:'b'.repeat(64)},{identityHeld:true},{reviewHeld:true}])
    assert.equal(currentMarkerAuthority(state,{...row,...change},prepared.plan),false,JSON.stringify(change));
  for(const change of [{restoredHistorical:true},{consent:{revision:2,approvedBaseFingerprint:base.fingerprint}},
    {principalFingerprint:'b'.repeat(64)},{approvedBaseFingerprint:'c'.repeat(64)}])
    assert.equal(currentMarkerAuthority(state,{...row,sourceRefresh:{...row.sourceRefresh,...change}},prepared.plan),false);
  assert.equal(currentMarkerAuthority({accounts:{account_one:{verifiedIdentity:true,principalFingerprint:'d'.repeat(64)}}},row,prepared.plan),false);
});

test('I17 redacted source receipt strictly rejects nested private-source/token canaries even from corrupt metadata',()=>{
  const sentinel='DO_NOT_EXPORT_SECRET_SOURCE_TOKEN';
  const receipt=sourceRefreshProjection({revision:1,state:'TEST_READY',slug,accountId:'account_one',
    approvedBaseFingerprint:base.fingerprint,effectiveCurrentFingerprint:base.fingerprint,
    preview:{plan:{...prepared.plan,extra:sentinel},beforeFeed:{complete:true,code:'RECENT_PRESENT',token:sentinel}},
    lastProof:{id,at:10000,effect:'EFFECT_CONFIRMED',token:sentinel,marker:{...markerReceipt(prepared.plan,10000),secret:sentinel},
      feed:{state:'PRESENT',rank:1,at:10000,html:sentinel},attemptResult:{code:'SAVE_ACK_ONLY',secret:sentinel}},
    qualification:{method:REFRESH_METHOD,policy:MARKER_POLICY,secret:sentinel,reviewDigest:'b'.repeat(64)}});
  assert.equal(JSON.stringify(receipt).includes(sentinel),false);
  assert.equal(receipt.preview.plan.expectedPostSaveFingerprint,prepared.post.fingerprint);
  assert.equal(receipt.proof.marker.source,'PCMS_REFRESH_MARKER');
  assert.equal(sourceRefreshProjection({state:sentinel,lastHold:sentinel}).state,'UNKNOWN');
  const bad=sourceRefreshProjection({preview:{plan:{...prepared.plan,beforeMarker:sentinel}}});
  assert.equal(bad.preview.plan,null);assert.equal(JSON.stringify(bad).includes(sentinel),false);
});


test('I17 fixed donor executor waits through complete/loading owned blank documents, journals, saves once and verifies clean before close',async()=>{
  const f=nativeFixture(),tags=new Map(),closed=[],order=[];let reads=0,marked=false;
  const cookieStoreId='fixture-container',personaUid='fixture-persona',routeId='protected';
  const api={tabs:{query:async()=>[],create:async()=>({id:10}),get:async()=>({id:10,cookieStoreId,active:false,
      url:++reads<=3?'about:blank':'https://perchance.org/'+slug+'#edit',status:reads===1?'complete':reads<=3?'loading':'complete'}),
      remove:async id=>closed.push(id)},sessions:{setTabValue:async(_id,_key,value)=>tags.set(10,value),
      getTabValue:async()=>tags.get(10)},scripting:{executeScript:async req=>{
        assert.ok(reads>3,'Never inject into the owned empty document');
        if(req.func.name==='renderPcmsEditorStrip')return [{frameId:0,result:null}];
        if(req.func.name==='perchanceReadIsolated')return [{frameId:0,result:{ok:true,principalFingerprint:principal,original:{
          remotePublicId:remoteId,ownerResult:'IS_OWNER',visibility:'PUBLIC',
          pjs:Buffer.from(files[0].base64,'base64').toString(),html:Buffer.from(files[1].base64,'base64').toString(),assets:[files[2]]}}}];
        if(req.func.name==='perchanceRefreshMain'&&req.args[0].action==='SAVE'){assert.equal(marked,true);order.push('NATIVE_SAVE');}
        return [{frameId:0,result:await req.func(...req.args)}];
      }}};
  const result=await runRefreshOwnedTab(api,{getState:async()=>({profiles:{[cookieStoreId]:{personaUid,routeId}},
    routes:{protected:{enabled:true}}}),validate:async()=>({cookieStoreId}),routeTest:()=>({ok:true})},
    {personaUid,cookieStoreId,routeId,leaseId:'fixture-lease'},{...f.request,nonce:id,principalFingerprint:principal},async phase=>{
      if(phase==='MARK'){marked=true;order.push('COMMITTED_DISPATCH');}return {ok:true};
    });
  assert.equal(result.ok,true,result.code);assert.equal(f.ledger.length,1);assert.deepEqual(closed,[10]);
  assert.deepEqual(order,['COMMITTED_DISPATCH','NATIVE_SAVE']);
});
