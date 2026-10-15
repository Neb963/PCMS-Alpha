import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {exactSource} from '../src/runtime/staging-core.mjs';
import {prepareMarker,recognizeMarker,markerReceipt,encodeText,MARKER_POLICY,REFRESH_METHOD} from '../src/runtime/refresh-marker.mjs';
import {perchanceRefreshMain} from '../src/runtime/perchance-refresh.mjs';
import {createRefresherProviderAdapter} from '../src/runtime/refresher-provider-adapter.mjs';
import {emptyRefreshEvidence,reserveRefreshAttempt,dispatchPossible,reconcileRefreshAttempt} from '../src/runtime/refresher-effect-core.mjs';
import {canonicalJson,verifyRefreshReview,digestReview} from '../src/runtime/refresh-review.mjs';
import {measureRefreshResources} from '../src/runtime/refresh-resource.mjs';
const slug='ordinary-listed-refresh',remoteId='fixture_public_01',principal='a'.repeat(64);
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
    app:{data:{generator:{name:slug,isPrivate:false,publicId:remoteId}},saveGenerator:async()=>{
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
