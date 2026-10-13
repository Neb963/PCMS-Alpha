#!/usr/bin/env python3
"""WebDriver/Marionette packaged-XPI persistent-install I00 smoke, no live provider calls."""
import base64
import hashlib
import http.client
import json
import os
import pathlib
import re
import subprocess
import sys
import tempfile
import time
from urllib.parse import urlparse
from urllib.error import HTTPError
from urllib.request import Request, urlopen

ID = 'persona-route-manager@local'
PORT = 44448
HOST = f'http://127.0.0.1:{PORT}'


def call(method, route, payload=None, timeout=30):
    b = json.dumps(payload).encode() if payload is not None else None
    req = Request(HOST + route, data=b, method=method, headers={'Content-Type':'application/json'})
    try:
        with urlopen(req, timeout=timeout) as response:
            body = json.loads(response.read())
    except HTTPError as exc:
        # The original harness discarded the WebDriver W3C error payload,
        # making Firefox product failures indistinguishable from harness defects.
        raw = exc.read(8192).decode('utf-8', errors='replace')
        try:
            detail = json.loads(raw).get('value', {})
            summary = {'error': detail.get('error'), 'message': detail.get('message')}
        except (ValueError, AttributeError):
            summary = {'response': raw[:1800]}
        raise RuntimeError('WebDriver '+method+' '+route+' HTTP '+str(exc.code)+': '+json.dumps(summary)[:2400]) from exc
    if body.get('value') and isinstance(body['value'], dict) and body['value'].get('error'):
        raise RuntimeError(body['value'])
    return body.get('value')


def open_session(firefox, profile):
    data = call('POST','/session',{'capabilities': {'alwaysMatch': {
        'browserName':'firefox',
        'moz:firefoxOptions':{
            'binary':str(firefox),
            'args':['-headless', '-no-remote', '-profile',str(profile)],
            'prefs':{'xpinstall.signatures.required':False,'extensions.autoDisableScopes':0,
                     'extensions.background.idle.timeout':1500}
        }
    }}}, timeout=60)
    return data['sessionId'] if 'sessionId' in data else data['value']['sessionId']


def execute(session, script):
    return call('POST',f'/session/{session}/execute/sync', {'script':script,'args':[]}, timeout=30)


def guard_status(session):
    script = '''const done=arguments[arguments.length-1];
    const port=browser.runtime.connect({name:'pcms-i01-health-readonly'});
    port.onMessage.addListener(value=>{try{port.disconnect()}catch(e){}done(value)});
    port.onDisconnect.addListener(()=>done({error:'health-port-disconnected'}));'''
    return call('POST',f'/session/{session}/execute/async', {'script':script,'args':[]},timeout=30)


def canonical_command(session, command):
    # Real packaged Firefox request to the isolated same-extension port.
    expression = '''const done=arguments[arguments.length-1];
    const port=browser.runtime.connect({name:'pcms-i02-canonical-readonly'});
    port.onMessage.addListener(value=>{try{port.disconnect()}catch(e){}done(value)});
    port.onDisconnect.addListener(()=>done({error:'canonical-disconnected'}));
    port.postMessage(COMMAND);'''
    expression=expression.replace('COMMAND',json.dumps(command))
    return call('POST',f'/session/{session}/execute/async',
                {'script':expression,'args':[]},timeout=30)



def account_command(session, command):
    # The real same-XPI account command endpoint; sender identity is supplied
    # by Firefox, never by the test payload.
    script = '''const done=arguments[arguments.length-1];
    const port=browser.runtime.connect({name:'pcms-i03-accounts'});
    port.onMessage.addListener(value=>{try{port.disconnect()}catch(e){}done(value)});
    port.onDisconnect.addListener(()=>done({error:'accounts-disconnected'}));
    port.postMessage(COMMAND);'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script.replace('COMMAND',json.dumps(command)),'args':[]},timeout=30)


def inventory_command(session, command):
    script = '''const done=arguments[arguments.length-1];
    const port=browser.runtime.connect({name:'pcms-i04-inventory'});
    port.onMessage.addListener(value=>{try{port.disconnect()}catch(e){}done(value)});
    port.onDisconnect.addListener(()=>done({error:'inventory-disconnected'}));
    port.postMessage(COMMAND);'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script.replace('COMMAND',json.dumps(command)),'args':[]},timeout=30)





def source_command(session, command):
    # Actual packaged extension port, no Git credentials or external requests.
    script = '''const done=arguments[arguments.length-1];
    const port=browser.runtime.connect({name:'pcms-i05-source'});
    port.onMessage.addListener(value=>{try{port.disconnect()}catch(e){}done(value)});
    port.onDisconnect.addListener(()=>done({error:'source-disconnected'}));
    port.postMessage(COMMAND);'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script.replace('COMMAND',json.dumps(command)),'args':[]},timeout=30)



def supply_command(session, command):
    # Real packaged supply port, no external provider credential or remote writes.
    script = '''const done=arguments[arguments.length-1];
    const port=browser.runtime.connect({name:'pcms-i06-supply'});
    port.onMessage.addListener(value=>{try{port.disconnect()}catch(e){}done(value)});
    port.onDisconnect.addListener(()=>done({error:'supply-disconnected'}));
    port.postMessage(COMMAND);'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script.replace('COMMAND',json.dumps(command)),'args':[]},timeout=30)



def adoption_command(session,command):
    # Actual installed same-XPI trusted I07 port; no live provider calls.
    script = '''const done=arguments[arguments.length-1];
    const port=browser.runtime.connect({name:'pcms-i07-adoption'});
    port.onMessage.addListener(value=>{try{port.disconnect()}catch(e){}done(value)});
    port.onDisconnect.addListener(()=>done({error:'adoption-disconnected'}));
    port.postMessage(COMMAND);'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script.replace('COMMAND',json.dumps(command)),'args':[]},timeout=30)


def supply_isolated_wrong_origin(session):
    script = '''const done=arguments[arguments.length-1];
    (async()=>{
      const {perchanceSupplyIsolated}=await import('./perchance-supply.mjs');
      const res=await perchanceSupplyIsolated({kind:'CREATE',slug:'browser-test-only',
        principalFingerprint:'a'.repeat(64)});
      done(res);
    })().catch(e=>done({code:'PROBE_ERROR',detail:String(e).slice(0,100)}));'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script,'args':[]},timeout=30)



def supply_effect_idb_probe(session):
    # Actual installed Firefox IndexedDB journal with strictly injected fake
    # Perchance/owner/Git ledgers. No live account or external effect.
    script = '''const done=arguments[arguments.length-1];
    (async()=>{
      const {createSupplyBoundary}=await import('./supply-boundary.mjs');
      const api={runtime:browser.runtime,storage:browser.storage};
      const sender={id:browser.runtime.id,url:browser.runtime.getURL('pcms/index.html')+'#generators'};
      const effects=[];
      const guard={
        getSafeRouteReadiness:async()=>({ready:true,
          personaUid:'persona-fixture-0001',cookieStoreId:'fixture-container',
          routeId:'fixture-protected'}),
        runSupplyStep:async (persona,req)=>{
          if(persona!=='persona-fixture-0001')throw Error('Wrong fake persona');
          effects.push(req.kind);
          if(req.kind==='CREATE')
            return {ok:true,ack:'CREATED',temporarySlug:'temp-fake-01'};
          if(req.kind==='READ_CREATE')
            return {ok:true,source:'INDEPENDENT_READBACK',privateEmpty:true,
              ownerMatches:true,temporarySlug:'temp-fake-01',remoteId:'remote_fake_0001'};
          if(req.kind==='RENAME')return {ok:true,ack:'RENAMED'};
          if(req.kind==='READ_RENAME')
            return {ok:true,source:'INDEPENDENT_READBACK',privateEmpty:true,
              ownerMatches:true,slug:req.slug,previousSlug:req.temporarySlug,
              remoteId:req.remoteId};
          throw Error('Unknown fake effect kind');
        }
      };
      const boundary=createSupplyBoundary(api,{guard:()=>guard,
        effectGate:()=>true,gitGate:()=>true,
        gitWrite:async ({folder,slug,token})=>{
          if(token!=='offline-git-write-token')throw Error('Wrong fixture token');
          effects.push('GIT_MARKER');
          return {ok:true,source:'GIT_READBACK',ready:false,emptyFolder:true,folder};
        }});
      const itemId='batch_browser_0002_001',batchId='batch_browser_0002';
      async function effect(revision){
        return boundary.run({type:'EXECUTE_ITEM',params:{batchId,itemId,
          expectedRevision:revision}},sender);
      }
      const created=await effect(1);
      const renamed=await effect(created.revision);
      const linked=await boundary.run({type:'FINISH_SOURCE_FOLDER',params:{
        batchId,itemId,expectedRevision:renamed.revision,
        token:'offline-git-write-token'}},sender);
      const fromPort=await boundary.run({type:'GET_BATCH',params:{batchId}},sender);
      done({created,renamed,linked,effects,
        final:fromPort?.batch?.items?.find(x=>x.itemId===itemId)});
    })().catch(e=>done({error:'I06_EFFECT_IDB_PROBE_FAILED',detail:String(e).slice(0,220)}));'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script,'args':[]},timeout=60)



def adoption_idb_probe(session):
    # B: real packaged Firefox extension and real persistent IndexedDB.
    # All Perchance and Git responses are explicit synthetic fixtures;
    # no live identity, credentials, provider writes or Git operations.
    script = '''const done=arguments[arguments.length-1];
    (async()=>{
      const {createAdoptionBoundary}=await import('./adoption-boundary.mjs');
      const {createAdoptionStore}=await import('./adoption-store.mjs');
      const {openCanonicalDatabase}=await import('./journal.mjs');
      const api={runtime:browser.runtime,storage:browser.storage};
      const sender={id:browser.runtime.id,url:browser.runtime.getURL('pcms/index.html')+'#generators'};
      const slug='gen-0999',principal='a'.repeat(64),trace=[];
      const original={ownerResult:'IS_OWNER',visibility:'UNLISTED',
        remotePublicId:'public_fixture_0001',pjs:'// archived original',
        html:'<main>Original</main>',assets:[]};
      const guard={
        getSafeRouteReadiness:async()=>({
          ready:true,personaUid:'persona-fixture-0001',
          cookieStoreId:'fixture-only',routeId:'fixture-protected'}),
        observeReadOnly:async()=>{trace.push('ORIGINAL_READ');
          return {ok:true,principalFingerprint:principal,original};}
      };
      const db=await openCanonicalDatabase();
      const store=createAdoptionStore(db);
      const boundary=createAdoptionBoundary(api,{guard:()=>guard,
        gitGate:()=>true,
        gitWrite:async ({folder,original:preserved})=>{
          const onDisk=await store.getFull(slug);
          if(onDisk.record?.archiveState!=='DISPATCH_POSSIBLE')
            throw Error('Missing durable Git dispatch marker');
          if(preserved.fingerprint!==onDisk.record.original.fingerprint)
            throw Error('Source bytes changed before fake Git dispatcher');
          trace.push('FAKE_GIT_AFTER_DURABLE_MARKER');
          return {ok:true,source:'INDEPENDENT_GIT_BYTE_READBACK',ready:false,
            prefix:'originals/'+slug+'/'+preserved.fingerprint,folder,
            head:'f'.repeat(40)};
        }});
      const cmd=(type,params)=>boundary.run({type,params},sender);
      const adopted=await cmd('CAPTURE_ADOPTION',{
        slug,expectedRevision:1,explicitPublicConsent:false});
      const listing=await cmd('GET_ADOPTION',{slug});
      const held=await createAdoptionBoundary(api,{guard:()=>guard}).run({
        type:'ARCHIVE_GIT',params:{slug,expectedRevision:adopted.revision,
          token:'synthetic-git-token-01'}},sender);
      const git=await cmd('ARCHIVE_GIT',{slug,
        expectedRevision:adopted.revision,token:'synthetic-git-token-01'});
      const protectedResult=await cmd('GET_ADOPTION',{slug});
      const tombstone=await cmd('ARCHIVE_LOCAL',{slug,
        expectedRevision:protectedResult.revision});
      const after=await cmd('GET_ADOPTION',{slug});
      const rejected=await cmd('ARCHIVE_GIT',{slug,
        expectedRevision:after.revision,token:'synthetic-git-token-01'});
      db.close();
      done({adopted,listing,held,git,protectedResult,tombstone,after,rejected,trace});
    })().catch(e=>done({error:'I07_IDB_PROBE_FAILED',detail:String(e).slice(0,200)}));'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script,'args':[]},timeout=70)

def source_idb_probe(session):
    # A real packaged Firefox IDB transaction with an injected synthetic Git
    # snapshot. No live GitHub/per-gens request. F tests own Git byte semantics.
    script = '''const done=arguments[arguments.length-1];
    (async()=>{
      const {createSourceBoundary}=await import('./source-boundary.mjs');
      const api={runtime:browser.runtime,storage:browser.storage};
      const sender={id:browser.runtime.id,url:browser.runtime.getURL('pcms/index.html')+'#generators'};
      let drift=false;
      const inspect=async ({folder})=>({
        ok:true,ready:true,folder,head:'b'.repeat(40),testingSha:null,
        fingerprint:drift?'c'.repeat(64):'a'.repeat(64),source:'READY'
      });
      const boundary=createSourceBoundary(api,{inspect});
      const get=(slug)=>boundary.run({type:'GET_ASSOCIATION',params:{slug}},sender);
      const bind=(slug)=>boundary.run({type:'ASSOCIATE_SOURCE',params:{
        slug,folder:'gens/a',token:'offline-fixture-token',expectedRevision:1,
        pinnedHead:'b'.repeat(40),pinnedFingerprint:'a'.repeat(64),
        pinnedTestingSha:null
      }},sender);
      const before=await get('gen-0999');
      const created=await bind('gen-0999');
      const duplicate=await bind('gen-0999');
      const collision=await bind('gen-0998');
      const linked=await get('gen-0999');
      const equal=await boundary.run({type:'RECHECK_SOURCE',params:{
        slug:'gen-0999',token:'offline-fixture-token'
      }},sender);
      drift=true;
      const changed=await boundary.run({type:'RECHECK_SOURCE',params:{
        slug:'gen-0999',token:'offline-fixture-token'
      }},sender);
      // Revise the actual account identity in Firefox IDB, leaving the old
      // owner inventory snapshot intact. Source association must hold.
      const {createAccountStore}=await import('./accounts.mjs');
      const {openCanonicalDatabase}=await import('./journal.mjs');
      const canon=await openCanonicalDatabase();
      drift=false; // Eliminate source drift so the negative oracle isolates the identity fence.
      const rotate=await createAccountStore(canon).apply({
        type:'VERIFY',accountId:'fixture_inventory_01',expectedRevision:2,
        proof:{source:'GUARDED_SESSION_READBACK',verified:true,
          personaUid:'persona-fixture-0001',principalFingerprint:'b'.repeat(64),
          observationId:'fixture_identity_rotated_01'}
      });
      canon.close();
      const stale=await get('gen-0999');
      const newBind=await bind('gen-0997');
      done({before,created,duplicate,collision,linked,equal,changed,rotate,stale,newBind});
    })().catch(e=>done({error:'I05_REAL_IDB_PROBE_FAILED',detail:String(e).slice(0,130)}));'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script,'args':[]},timeout=45)


def observer_isolation_probe(session):
    # Persistent installed-XPI B negative-oracle: execute the real packaged
    # fixed observer in Firefox, then assert that any attempt to inject it into
    # an unauthorized about:blank tab cannot supply a positive owner/session.
    # Positive provider replies are exercised with independent F transport
    # fixtures; no unmanaged local network exception is granted to the donor.
    script='''const done=arguments[arguments.length-1];
    (async()=>{
      const {perchanceReadIsolated}=await import('./perchance-observer.mjs');
      const internal=await perchanceReadIsolated({});
      const tab=await browser.tabs.create({url:'about:blank',active:false});
      try{
        let injection;
        try{
          const results=await browser.scripting.executeScript({
            target:{tabId:tab.id,frameIds:[0]},world:'ISOLATED',
            func:perchanceReadIsolated,args:[{}]
          });
          injection=results?.[0]?.result||{ok:false,code:'NO_RESULT'};
        }catch{
          injection={ok:false,code:'HOST_PERMISSION_DENIED'};
        }
        done({loaded:typeof perchanceReadIsolated==='function',
          internal,injection});
      }finally{await browser.tabs.remove(tab.id);}
    })().catch(e=>done({error:String(e).slice(0,180)}));'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script,'args':[]},timeout=30)


def inventory_idb_probe(session):
    # Packaged Firefox uses REAL persistent IDB, synthetic readback only.
    # No external Perchance account, route or remote mutation is touched.
    script = '''const done=arguments[arguments.length-1];
    (async()=>{
      const {openCanonicalDatabase}=await import('./journal.mjs');
      const {createAccountStore}=await import('./accounts.mjs');
      const {createInventoryStore}=await import('./inventory.mjs');
      const db=await openCanonicalDatabase();
      const accounts=createAccountStore(db), inventory=createInventoryStore(db);
      const accountId='fixture_inventory_01',personaUid='persona-fixture-0001';
      const enrolled=await accounts.apply({type:'ENROLL',accountId,
        personaUid,expectedRevision:0});
      const fingerprint='a'.repeat(64);
      const verified=await accounts.apply({type:'VERIFY',accountId,
        expectedRevision:1,proof:{source:'GUARDED_SESSION_READBACK',
          verified:true,personaUid,principalFingerprint:fingerprint,
          observationId:'fixture_identity_01'}});
      const items=Array.from({length:1250},(_,i)=>({
        slug:'gen-'+String(i).padStart(4,'0'),
        remoteId:'remote-'+String(i).padStart(8,'0'),
        ownerResult:'IS_OWNER',ownerObservationId:'owner_proof_01',
        ownerPrincipalFingerprint:fingerprint,visibility:'UNLISTED'
      }));
      const obs={source:'GUARDED_PERCHANCE_READBACK',complete:true,
        observationId:'fixture_inventory_observation_01',observedAt:1791841200000,
        accountId,personaUid,bindingVersion:1,accountRevision:2,
        principalFingerprint:fingerprint,generators:items};
      const accepted=await inventory.applyObservation(verified.account,obs);
      const first=await inventory.list({offset:0,limit:50});
      const selected=await inventory.list({query:'gen-0999'});
      const invalid=await inventory.list({offset:0,limit:101});
      db.close();
      done({enrolled:enrolled.ok,verified:verified.ok,accepted,first:{
        count:first.items?.length,total:first.total,first:first.items?.[0],
        last:first.items?.[49]},selected,invalid});
    })().catch(e=>done({error:'I04_REAL_IDB_PROBE_FAILED',detail:String(e).slice(0,100)}));'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script,'args':[]},timeout=60)


def account_idb_probe(session):
    # Real IndexedDB transaction fence (not a Node-only state reducer).
    script = '''const done=arguments[arguments.length-1];
    (async()=>{
      const {openCanonicalDatabase}=await import('./journal.mjs');
      const {createAccountStore}=await import('./accounts.mjs');
      const db=await openCanonicalDatabase(),store=createAccountStore(db);
      const first=await store.apply({type:'ENROLL',accountId:'fixture_account_a01',
        personaUid:'persona-aaaa-0001',expectedRevision:0});
      const collision=await store.apply({type:'ENROLL',accountId:'fixture_account_b02',
        personaUid:'persona-aaaa-0001',expectedRevision:0});
      const stale=await store.apply({type:'ACK_LOGIN',accountId:'fixture_account_a01',
        expectedRevision:0});
      const override=await store.apply({type:'MANUAL_OVERRIDE',
        accountId:'fixture_account_a01',expectedRevision:1,
        reason:'IDENTITY_UNOBSERVABLE',acknowledgeLimitedAuthority:true});
      const all=await store.list();
      db.close();
      done({first,collision,stale,override,all});
    })().catch(()=>done({error:'ACCOUNT_IDB_PROBE_FAILED'}));'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script,'args':[]},timeout=30)


def canonical_probe(session):
    # In a disposable profile only: exercise REAL IndexedDB transactions from
    # the packaged add-on origin, not just a mocked callback.
    script = '''const done=arguments[arguments.length-1];
    (async()=>{
      const module=await import('./journal.mjs');
      const store=module.createCanonicalStore(await module.openCanonicalDatabase());
      const targetId='fixture_target_01', operationId='fixture_operation_01';
      const created=await store.provisionTarget(targetId);
      const params={type:'RESERVE',targetId,operationId,effectType:'fake_effect_01',
        fingerprint:'a'.repeat(64),expectedRevision:1};
      const prepared=await store.apply(params);
      const duplicate=await store.apply(params);
      const stale=await store.apply({...params,operationId:'fixture_operation_02',expectedRevision:1});
      const possible=await store.apply({...params,type:'MARK_DISPATCH',expectedRevision:1});
      const cancelled=await store.apply({...params,type:'CANCEL',expectedRevision:2});
      store.close();
      done({created,prepared,duplicate,stale,possible,cancelled});
    })().catch(()=>done({error:'CANONICAL_PROBE_FAILED'}));'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script,'args':[]},timeout=30)


def canonical_notice_probe(session):
    # Exact bundled IDB store, not a fabricated notification record.
    script = '''const done=arguments[arguments.length-1];
    (async()=>{
      const module=await import('./journal.mjs');
      const store=module.createCanonicalStore(await module.openCanonicalDatabase());
      const note={scopeId:'fixture_scope_01',code:'SOURCE_HELD',
        severity:'SERIOUS',revision:1};
      const recorded=await store.recordNotice(note);
      const duplicate=await store.recordNotice(note);
      const stale=await store.ignoreNotice({...note,expectedRevision:0});
      const summary=await store.noticeSummary();
      store.close();
      done({recorded,duplicate,stale,summary});
    })().catch(()=>done({error:'IDB_NOTICE_PROBE_FAILED'}));'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script,'args':[]},timeout=30)


def canonical_abort_probe(session):
    # A real IndexedDB readwrite transaction is deliberately rolled back.
    # No provider stub is invoked and aborted writes must not create state.
    script = '''const done=arguments[arguments.length-1];
    (async()=>{
      const module=await import('./journal.mjs');
      const db=await module.openCanonicalDatabase();
      const tx=db.transaction(['entities','operations'],'readwrite');
      const terminal=new Promise(resolve=>{
        tx.onabort=()=>resolve('ABORTED');
        tx.oncomplete=()=>resolve('COMMITTED');
      });
      tx.objectStore('entities').add({id:'aborted_target_01',
        revision:1,activeOperationId:null});
      tx.abort();
      const actual=await terminal;
      const store=module.createCanonicalStore(db);
      const forbidden=await store.apply({type:'RESERVE',
        targetId:'aborted_target_01',operationId:'aborted_operation_01',
        expectedRevision:1,effectType:'fake_effect_01',fingerprint:'b'.repeat(64)});
      store.close();
      done({terminal:actual,forbidden});
    })().catch(()=>done({error:'IDB_ABORT_PROBE_FAILED'}));'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script,'args':[]},timeout=30)


def restore_marker_probe(session):
    script = '''const done=arguments[arguments.length-1];
    (async()=>{
      await browser.storage.local.set({pcmsRestoreInProgress:{active:true}});
      done(true);
    })().catch(()=>done(false));'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script,'args':[]},timeout=30)


def clear_restore_marker(session):
    script = '''const done=arguments[arguments.length-1];
    browser.storage.local.remove('pcmsRestoreInProgress').then(
      ()=>done(true),()=>done(false));'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script,'args':[]},timeout=30)


def diagnostic_zip_probe(session):
    script = '''const done=arguments[arguments.length-1];
    (async()=>{
      const {makeSafeArchive}=await import('./diagnostic-archive.mjs');
      const source=document.getElementById('report').textContent;
      const report=JSON.parse(source);
      const zip=makeSafeArchive({...report,secretCanary:'DO_NOT_EXPOSE'});
      const readback=new TextDecoder().decode(zip);
      done({magic:Array.from(zip.slice(0,4)),length:zip.length,
        files:readback.includes('report.json') && readback.includes('README.md'),
        canary:readback.includes('DO_NOT_EXPOSE')});
    })().catch(()=>done({error:'ARCHIVE_PROBE_FAILED'}));'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script,'args':[]},timeout=30)


def storage_alarm_count(session):
    script = '''const done=arguments[arguments.length-1];
    browser.storage.local.get('pcmsI01WakeHealth')
      .then(value=>done(value.pcmsI01WakeHealth?.alarmCount??0),
            error=>done({error:String(error)}));'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script,'args':[]},timeout=30)


def schedule_test_alarm(session):
    script = '''const done=arguments[arguments.length-1];
    browser.alarms.create('pcms-i01-health',{when:Date.now()+6000})
      .then(()=>done(true),error=>done({error:String(error)}));'''
    return call('POST',f'/session/{session}/execute/async',
                {'script':script,'args':[]},timeout=30)


def close(session):
    try: call('DELETE',f'/session/{session}',timeout=25)
    except Exception as exc: print('Session cleanup:',exc,file=sys.stderr)


def addons_uuid(profile):
    contents=(profile/'prefs.js').read_text(errors='replace')
    regex=r'^user_pref\("extensions\.webextensions\.uuids",\s*("(?:\\.|[^"\\])*")\);$'
    match=re.search(regex,contents,re.MULTILINE)
    if not match:
        raise AssertionError('Persisted Firefox extension UUID mapping not found after restart')
    mapping=json.loads(json.loads(match.group(1)))
    assert ID in mapping, 'Combined Gecko ID missing in persisted extension UUID mapping'
    return mapping[ID]


def main():
    archive=pathlib.Path(sys.argv[1]).resolve()
    browser=pathlib.Path(os.environ['FIREFOX_BINARY'])
    driver=pathlib.Path(os.environ['GECKODRIVER_BINARY'])
    expected_hash=hashlib.sha256(archive.read_bytes()).hexdigest()
    print('B XPI_SHA256=',expected_hash,flush=True)
    print('B FF_DEV_BINARY=',browser,flush=True)
    with tempfile.TemporaryDirectory(prefix='pcms-i00-firefox-') as folder:
        profile=pathlib.Path(folder)/'profile'
        profile.mkdir()
        (profile/'user.js').write_text('user_pref("xpinstall.signatures.required", false);\n')
        # Firefox 153+ refuses WebDriver navigation to extension pages without a
        # *test-only* opt-in. This agent runs only on disposable CI profile and
        # geckodriver binds loopback; production XPI permissions stay unchanged.
        server=subprocess.Popen([str(driver),'--port',str(PORT),'--allow-system-access'],stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
        try:
            for _ in range(80):
                try:
                    with urlopen(HOST+'/status',timeout=1) as s:
                        if json.load(s).get('value',{}).get('ready'): break
                except Exception: time.sleep(.25)
            else: raise RuntimeError('geckodriver did not become ready')
            first=open_session(browser,profile)
            try:
                installed=call('POST',f'/session/{first}/moz/addon/install',{'path':str(archive),'temporary':False},timeout=45)
                assert installed == ID, f'Unexpected installed add-on ID {installed}'
                print('B INSTALLED_ADDON_ID=',installed,flush=True)
            finally: close(first)
            # A *second process* with the same disposable profile distinguishes installed XPI from temp web-ext.
            after=open_session(browser,profile)
            try:
                uuid=addons_uuid(profile)
                print('B RESTARTED_ADDON_UUID_PRESENT=', bool(uuid), flush=True)
                url=f'moz-extension://{uuid}/pcms/index.html'
                call('POST',f'/session/{after}/url',{'url':url},timeout=30)
                for _ in range(40):
                    view=execute(after,"return {title:document.title, selected:[...document.querySelectorAll('[data-view]')].filter(x=>!x.hidden).map(x=>x.dataset.view), links:[...document.querySelectorAll('[data-workspace]')].map(x=>x.getAttribute('href')), unsafe:[...document.querySelectorAll('#view-generators button[aria-describedby=blocked-generators],#view-work-queue > .workspace-head > button,#view-refresher > .workspace-head > button')].filter(x=>!x.disabled).length}")
                    if view.get('selected'): break
                    time.sleep(.15)
                assert view['selected']==['overview'],view
                assert view['links']==['#overview','#generators','#work-queue','#accounts','#refresher','#settings'],view
                assert view['unsafe']==0,view
                # The exact installed XPI must expose a read-only guarded
                # background status; no valid status enables PCMS effects.
                isolated=observer_isolation_probe(after)
                assert isolated.get('loaded') is True,isolated
                assert isolated.get('internal',{}).get('code')=='WRONG_ORIGIN',isolated
                assert isolated.get('injection',{}).get('ok') is False,isolated
                assert isolated.get('injection',{}).get('code') in [
                    'HOST_PERMISSION_DENIED','WRONG_ORIGIN'],isolated
                print('B I04_PACKAGED_OBSERVER_INVALID_ORIGIN_AND_HOST_HOLD=PASS',flush=True)
                guard=guard_status(after)
                assert guard and guard.get('phase')=='I01',f'Missing I01 wake status: {guard}'
                assert guard.get('providerEffects')=='OFF',guard
                canonical=canonical_command(after,{'type':'SUMMARY'})
                assert canonical.get('ok') is True and canonical.get('storage')=='READY',canonical
                assert canonical.get('providerEffects')=='OFF',canonical
                personas=account_command(after,{'type':'LIST_PERSONAS'})
                assert personas.get('ok') is True and isinstance(personas.get('personas'),list),personas
                records=account_command(after,{'type':'LIST_ACCOUNTS'})
                assert records.get('ok') is True and records.get('accounts')==[],records
                denied_enroll=account_command(after,{'type':'ENROLL','params':{
                    'accountId':'fixture_forbidden_a01','personaUid':'persona-aaaa-0001','expectedRevision':0}})
                assert denied_enroll.get('code')=='PERSONA_NOT_AVAILABLE',denied_enroll
                tested=account_idb_probe(after)
                assert tested.get('first',{}).get('ok') is True,tested
                assert tested.get('collision',{}).get('code')=='PERSONA_ALREADY_BOUND',tested
                assert tested.get('stale',{}).get('code')=='STALE_REVISION',tested
                assert tested.get('override',{}).get('account',{}).get('state')=='OVERRIDDEN',tested
                assert tested.get('override',{}).get('account',{}).get('identity') is None,tested
                listed=account_command(after,{'type':'LIST_ACCOUNTS'})
                assert listed.get('ok') is True and len(listed.get('accounts',[]))==1,listed
                assert listed['accounts'][0]['identity']=='UNVERIFIED',listed
                assert listed['accounts'][0]['providerWrites']=='OFF',listed
                identity=account_command(after,{'type':'CHECK_IDENTITY','params':{
                    'accountId':'fixture_account_a01','expectedRevision':2}})
                assert identity.get('ok') is not True,identity
                print('B I03_REAL_IDB_EXCLUSIVITY_REVISION_OVERRIDE_AND_NO_FAKE_IDENTITY=PASS',flush=True)
                blank_inventory=inventory_command(after,{'type':'LIST_INVENTORY'})
                assert blank_inventory.get('ok') is True and blank_inventory.get('total')==0,blank_inventory
                unauthorized=inventory_command(after,{'type':'SYNC_ACCOUNT','params':{
                    'accountId':'fixture_account_a01','expectedRevision':2}})
                assert unauthorized.get('code')=='ACCOUNT_IDENTITY_UNVERIFIED',unauthorized
                seeded=inventory_idb_probe(after)
                assert seeded.get('enrolled') is True and seeded.get('verified') is True,seeded
                assert seeded.get('accepted',{}).get('ok') is True,seeded
                assert seeded.get('first',{}).get('count')==50,seeded
                assert seeded.get('first',{}).get('total')==1250,seeded
                assert seeded.get('first',{}).get('first',{}).get('providerWrites')=='OFF',seeded
                assert seeded.get('selected',{}).get('total')==1,seeded
                assert seeded.get('invalid',{}).get('code')=='INVALID_INVENTORY_QUERY',seeded
                inventory_page=inventory_command(after,{'type':'LIST_INVENTORY','params':{
                    'query':'gen-0999','offset':0,'limit':50}})
                assert inventory_page.get('ok') is True and inventory_page.get('total')==1,inventory_page
                assert inventory_page['items'][0]['slug']=='gen-0999',inventory_page
                assert inventory_page['items'][0]['evidence']=='HISTORICAL_READ_ONLY',inventory_page
                assert inventory_command(after,{'type':'SYNC_ACCOUNT','params':{
                    'accountId':'fixture_inventory_01','expectedRevision':2}}).get('ok') is not True
                call('POST',f'/session/{after}/url',{'url':url+'#generators'})
                for _ in range(40):
                    view=execute(after,"return {rows:document.querySelectorAll('#pcms-generators-rows tr').length, "
                        "count:document.getElementById('pcms-generator-count')?.textContent||'', "
                        "sync:document.getElementById('pcms-generator-sync')?.disabled}")
                    if '1250' in view.get('count',''):break
                    time.sleep(.15)
                assert view.get('rows')==50 and '1250' in view.get('count',''),view
                execute(after,"document.getElementById('pcms-generator-next').click();return true")
                for _ in range(40):
                    pagination=execute(after,"return document.getElementById('pcms-generator-count')?.textContent||''")
                    if '51–100' in pagination:break
                    time.sleep(.15)
                assert '51–100' in pagination,pagination
                print('B I04_REAL_IDB_1250_FILTER_PAGINATION_OWNER_HOLD=PASS',flush=True)

                # I06 actual installed Firefox IndexedDB and extension port
                # retain frozen operator slugs and reject duplication. Effect
                # activation is deliberately absent: NO provider request sent.
                read_batches=supply_command(after,{'type':'LIST_BATCHES'})
                assert read_batches.get('ok') is True,read_batches
                assert read_batches.get('batches')==[],read_batches
                frozen=supply_command(after,{'type':'FREEZE','params':{
                    'batchId':'batch_browser_0001',
                    'accountId':'fixture_inventory_01','expectedAccountRevision':2,
                    'slugs':['supply-test-one','supply-test-two','supply-test-two','gen-0999']}})
                assert frozen.get('ok') is True,frozen
                assert [x['state'] for x in frozen['batch']['items']]==[
                    'FROZEN','FROZEN','REJECTED','REJECTED'],frozen
                same=supply_command(after,{'type':'FREEZE','params':{
                    'batchId':'batch_browser_0002',
                    'accountId':'fixture_inventory_01','expectedAccountRevision':2,
                    'slugs':['supply-test-one','another-safe-name']}})
                assert same.get('ok') is True,same
                assert same['batch']['items'][0]['reason']=='ALREADY_OWNED',same
                assert same['batch']['items'][1]['state']=='FROZEN',same
                invalid=supply_command(after,{'type':'FREEZE','params':{
                    'batchId':'batch_browser_0003',
                    'accountId':'fixture_inventory_01','expectedAccountRevision':1,
                    'slugs':['safe-name']}})
                assert invalid.get('code')=='STALE_ACCOUNT_REVISION',invalid
                held=supply_command(after,{'type':'EXECUTE_ITEM','params':{
                    'batchId':'batch_browser_0001',
                    'itemId':'batch_browser_0001_000','expectedRevision':1}})
                assert held.get('code')=='PROVIDER_ACTIVATION_HELD',held
                previous=supply_command(after,{'type':'GET_BATCH','params':{
                    'batchId':'batch_browser_0001'}})
                assert previous.get('batch',{}).get('items',[{}])[0].get('state')=='FROZEN',previous
                unsafe=supply_command(after,{'type':'WRITE_PROVIDER','params':{}})
                assert unsafe.get('code')=='CAPABILITY_OFF',unsafe
                wrong_origin=supply_isolated_wrong_origin(after)
                assert wrong_origin.get('code')=='WRONG_ORIGIN',wrong_origin
                call('POST',f'/session/{after}/url',{'url':url+'#generators'})
                visible=execute(after,"return {input:!!document.getElementById('pcms-supply-slugs'),"
                    "queue:!!document.getElementById('pcms-supply-queue'),"
                    "freeze:document.getElementById('pcms-supply-freeze')?.disabled,"
                    "effects:document.getElementById('pcms-supply-feedback')?.textContent}")
                assert visible.get('input') is True and visible.get('queue') is True,visible
                assert visible.get('freeze') is True,visible
                persisted=supply_command(after,{'type':'LIST_BATCHES'})
                assert persisted.get('ok') is True and len(persisted['batches'])==2,persisted
                print('B I06_REAL_IDB_FROZEN_BATCH_COLLISION_HOLDS_ZERO_PROVIDER_EFFECTS=PASS',flush=True)

                # The same packaged XPI's real canonical store also exercises
                # distinct fake CREATE, RENAME and GIT dispatch journals.
                # Each fake returns an independent readback envelope.
                effect_probe=supply_effect_idb_probe(after)
                assert effect_probe.get('created',{}).get('state')=='CREATE_CONFIRMED',effect_probe
                assert effect_probe.get('renamed',{}).get('state')=='SOURCE_PENDING',effect_probe
                assert effect_probe.get('linked',{}).get('state')=='CONFIRMED',effect_probe
                assert effect_probe.get('effects')==[
                    'CREATE','READ_CREATE','RENAME','READ_RENAME','GIT_MARKER'],effect_probe
                assert effect_probe.get('final',{}).get('state')=='CONFIRMED',effect_probe
                same_again=supply_command(after,{'type':'EXECUTE_ITEM','params':{
                    'batchId':'batch_browser_0002','itemId':'batch_browser_0002_001',
                    'expectedRevision':effect_probe['linked']['revision']}})
                assert same_again.get('code')=='NOT_ADMISSIBLE',same_again
                print('B I06_REAL_IDB_FAKE_PROVIDER_AND_GIT_SEPARATE_MARKERS=PASS',flush=True)



                live_adoption_port=adoption_command(after,{'type':'LIST_ADOPTIONS'})
                assert live_adoption_port.get('ok') is True,live_adoption_port
                assert live_adoption_port.get('items')==[],live_adoption_port
                # I07: real packaged Firefox IndexedDB and guarded original
                # readback using only injected non-effecting synthetic origins.
                archive_probe=adoption_idb_probe(after)
                assert archive_probe.get('adopted',{}).get('ok') is True,archive_probe
                assert archive_probe.get('adopted',{}).get('archive')=='ARCHIVE_PENDING',archive_probe
                assert archive_probe.get('listing',{}).get('originalFiles')==2,archive_probe
                assert archive_probe.get('held',{}).get('code')=='GIT_WRITE_ACTIVATION_HELD',archive_probe
                assert archive_probe.get('git',{}).get('archive')=='ARCHIVED_GIT_CONFIRMED',archive_probe
                assert archive_probe.get('protectedResult',{}).get('archive')=='ARCHIVED_GIT_CONFIRMED',archive_probe
                assert archive_probe.get('after',{}).get('archived') is True,archive_probe
                assert archive_probe.get('rejected',{}).get('code')=='TOMBSTONE_HELD',archive_probe
                assert archive_probe.get('trace')==[
                    'ORIGINAL_READ','ORIGINAL_READ','FAKE_GIT_AFTER_DURABLE_MARKER'],archive_probe
                assert '// archived original' not in json.dumps(archive_probe),archive_probe
                real_adoption=adoption_command(after,{'type':'GET_ADOPTION',
                    'params':{'slug':'gen-0999'}})
                assert real_adoption.get('archived') is True,real_adoption
                assert real_adoption.get('originalFiles')==2,real_adoption
                assert '// archived original' not in json.dumps(real_adoption),real_adoption
                controls=execute(after,"return {capture:document.getElementById('pcms-adopt-capture')?.disabled,"
                    "receipts:!!document.getElementById('pcms-adopt-receipts'),"
                    "consent:document.getElementById('pcms-adopt-consent')?.disabled}")
                assert controls=={'capture':True,'receipts':True,'consent':True},controls
                print('B I07_PACKAGED_ORIGINAL_IDB_GIT_MARKER_TOMBSTONE_SYNTHETIC=PASS',flush=True)

                # I05: real permanently installed XPI source port and canonical
                # association; synthetic inspection only, zero private Git reads.
                unknown=source_command(after,{'type':'GET_ASSOCIATION','params':{'slug':'gen-0999'}})
                assert unknown.get('code')=='SOURCE_PENDING',unknown
                denied=source_command(after,{'type':'INSPECT_SOURCE','params':{
                    'folder':'gens/a','token':'short'}})
                assert denied.get('code')=='GITHUB_ACCESS_REQUIRED',denied
                no_write=source_command(after,{'type':'GIT_WRITE','params':{}})
                assert no_write.get('code')=='CAPABILITY_OFF',no_write
                scoped=source_idb_probe(after)
                assert scoped.get('before',{}).get('code')=='SOURCE_PENDING',scoped
                assert scoped.get('created',{}).get('associated') is True,scoped
                assert scoped.get('duplicate',{}).get('duplicate') is True,scoped
                assert scoped.get('collision',{}).get('code')=='SOURCE_ASSOCIATION_CONFLICT',scoped
                assert scoped.get('linked',{}).get('link',{}).get('folder')=='gens/a',scoped
                assert scoped.get('equal',{}).get('code')=='SOURCE_EQUIVALENT',scoped
                assert scoped.get('changed',{}).get('code')=='SOURCE_DRIFT',scoped
                assert scoped.get('rotate',{}).get('ok') is True,scoped
                assert scoped.get('stale',{}).get('code')=='SOURCE_ASSOCIATION_STALE',scoped
                assert scoped.get('newBind',{}).get('code')=='ACCOUNT_CONTEXT_CHANGED',scoped
                real_link=source_command(after,{'type':'GET_ASSOCIATION','params':{'slug':'gen-0999'}})
                assert real_link.get('code')=='SOURCE_ASSOCIATION_STALE',real_link
                view=execute(after,"return {present:!!document.getElementById('pcms-source-token'),"
                    "button:document.getElementById('pcms-source-associate')?.disabled,"
                    "saved:document.getElementById('pcms-source-token')?.value}")
                assert view=={'present':True,'button':True,'saved':''},view
                print('B I05_REAL_IDB_ASSOCIATION_COLLISION_DRIFT_ZERO_GIT_EFFECTS=PASS',flush=True)

                synthetic=canonical_probe(after)
                assert synthetic.get('created',{}).get('ok') is True,synthetic
                assert synthetic.get('prepared',{}).get('operation',{}).get('status')=='PREPARED',synthetic
                assert synthetic.get('duplicate',{}).get('duplicate') is True,synthetic
                assert synthetic.get('stale',{}).get('code')=='STALE_REVISION',synthetic
                assert synthetic.get('possible',{}).get('operation',{}).get('status')=='DISPATCH_POSSIBLE',synthetic
                assert synthetic.get('cancelled',{}).get('code')=='CANNOT_CANCEL_POSSIBLE_EFFECT',synthetic
                print('B I02_REAL_IDB_PREPARED_TO_DISPATCH_POSSIBLE=PASS',flush=True)
                abort=canonical_abort_probe(after)
                assert abort.get('terminal')=='ABORTED',abort
                assert abort.get('forbidden',{}).get('code')=='TARGET_UNVERIFIED',abort
                print('B I02_REAL_IDB_ABORT_NO_EFFECT=PASS',flush=True)
                noticed=canonical_notice_probe(after)
                assert noticed.get('recorded',{}).get('changed') is True,noticed
                assert noticed.get('duplicate',{}).get('changed') is False,noticed
                assert noticed.get('stale',{}).get('code')=='STALE_REVISION',noticed
                assert noticed.get('summary',{}).get('counts',{}).get('serious')==1,noticed
                notices=canonical_command(after,{'type':'GET_NOTICES'})
                assert notices.get('ok') is True and len(notices.get('notices',[]))==1,notices
                print('B I02_REAL_ATTENTION_DEDUP_AND_REVISION=PASS',flush=True)
                assert restore_marker_probe(after) is True
                held=canonical_command(after,{'type':'SUMMARY'})
                assert held.get('held') is True and held.get('restore')=='RESTORE_IN_PROGRESS',held
                account_hold=account_command(after,{'type':'ACK_LOGIN','params':{
                    'accountId':'fixture_account_a01','expectedRevision':2}})
                assert account_hold.get('code')=='RESTORE_HOLD',account_hold
                denied=canonical_command(after,{'type':'GET_OPERATION','operationId':'fixture_operation_01'})
                assert denied.get('code')=='CANONICAL_HOLD',denied
                assert clear_restore_marker(after) is True
                recovered=canonical_command(after,{'type':'SUMMARY'})
                assert recovered.get('held') is False,recovered
                print('B I02_OUTSIDE_IDB_RESTORE_SENTINEL=PASS',flush=True)
                boot_before=guard['bootId']
                print('B I01_WAKE_STATUS_INITIAL=',guard,flush=True)
                # Construct the alarm in an isolated disposable Firefox profile,
                # then remove the PCMS UI while the event page is suspended.
                # The persisted counter is independent of transient callbacks.
                alarm_before=storage_alarm_count(after)
                assert isinstance(alarm_before,int),alarm_before
                assert schedule_test_alarm(after) is True
                call('POST',f'/session/{after}/url',{'url':'about:blank'})
                time.sleep(14)
                call('POST',f'/session/{after}/url',{'url':url})
                guard_after=guard_status(after)
                alarm_after=storage_alarm_count(after)
                assert isinstance(alarm_after,int),alarm_after
                assert alarm_after>alarm_before,(
                    'No persisted real Firefox alarm delivery',alarm_before,alarm_after)
                print('B I01_REAL_ALARM_WAKE=PASS alarm count',
                      alarm_before,'->',alarm_after,flush=True)
                assert guard_after and guard_after.get('providerEffects')=='OFF',guard_after
                assert guard_after.get('bootId')!=boot_before,(
                    'Background did not demonstrably suspend/restart during idle',guard,guard_after)
                outcome=canonical_command(after,{'type':'GET_OPERATION','operationId':'fixture_operation_01'})
                assert outcome.get('ok') is True and outcome.get('state')=='HELD_UNCERTAIN',(
                    'Cold wake must recover possible dispatch without replay',outcome)
                print('B I02_REAL_IDB_CRASH_REHYDRATE_UNCERTAIN=PASS',flush=True)
                print('B I01_EVENT_PAGE_COLD_WAKE=PASS before=',boot_before,
                      'after=',guard_after['bootId'],flush=True)
                call('POST',f'/session/{after}/url',{'url':url+'#accounts'})
                view=execute(after,"return {selected:[...document.querySelectorAll('[data-view]')].filter(x=>!x.hidden).map(x=>x.dataset.view),active:document.querySelector('[aria-current=page]')?.dataset.workspace,blocked:document.querySelector('#pcms-enroll')?.disabled,refresh:document.querySelector('#pcms-refresh-accounts')?.disabled}")
                assert view=={'selected':['accounts'],'active':'accounts','blocked':True,'refresh':False},view
                account_ui=execute(after,"return {controls:!!document.getElementById('pcms-accounts-list'),description:document.getElementById('pcms-accounts-list')?.textContent||''}")
                assert account_ui.get('controls'),account_ui
                call('POST',f'/session/{after}/url',{'url':f'moz-extension://{uuid}/options/options.html'})
                title=execute(after,'return document.title')
                assert title, 'Original donor advanced option page not available'
                call('POST',f'/session/{after}/url',
                     {'url':f'moz-extension://{uuid}/pcms/emergency.html'})
                for _ in range(40):
                    report_json=execute(after,
                        "return document.getElementById('report')?.textContent||''")
                    if report_json.strip().startswith('{'): break
                    time.sleep(.15)
                safe=json.loads(report_json)
                assert safe.get('schema')=='PCMS_SAFE_DIAGNOSTIC_V1',safe
                assert safe.get('effects')=='OFF',safe
                assert set(safe)=={'schema','phase','effects','sections','wake'},safe
                assert safe['sections']['canonical']=='section_unavailable'
                diagnostic=diagnostic_zip_probe(after)
                assert diagnostic.get('magic')==[80,75,3,4],diagnostic
                assert diagnostic.get('files') is True and diagnostic.get('canary') is False,diagnostic
                assert 0 < diagnostic.get('length',0) < 65536,diagnostic
                print('B I02_REDACTED_ZIP_MARKDOWN=PASS',flush=True)
                print('B I02_CORE_INDEPENDENT_EMERGENCY=PASS',flush=True)
                call('POST',f'/session/{after}/url',{'url':url+'#overview'})
                for _ in range(40):
                    notice_ui=execute(after,
                        "return {button:document.querySelector('#pcms-attention-list button')?.textContent||'',text:document.querySelector('#pcms-attention-list')?.textContent||''}")
                    if notice_ui.get('button'):break
                    time.sleep(.15)
                if notice_ui.get('button')!='Ignore notice':
                    direct_notices=canonical_command(after,{'type':'GET_NOTICES'})
                    direct_summary=canonical_command(after,{'type':'SUMMARY'})
                    ui_state=execute(after,
                        "return {journal:document.getElementById('pcms-journal-health')?.textContent,queue:document.getElementById('pcms-work-queue-summary')?.textContent,ready:document.readyState,overview:document.getElementById('view-overview')?.hidden}")
                    raise AssertionError(('Attention UI did not show known fake notice',
                                          notice_ui,ui_state,direct_summary,direct_notices))
                assert 'SOURCE_HELD' in notice_ui.get('text',''),notice_ui
                execute(after,"document.querySelector('#pcms-attention-list button').click();return true")
                for _ in range(40):
                    residual=canonical_command(after,{'type':'GET_NOTICES'})
                    if residual.get('ok') is True and residual.get('notices')==[]:break
                    time.sleep(.15)
                assert residual.get('ok') is True and residual.get('notices')==[],residual
                uncertain=canonical_command(after,{'type':'GET_OPERATION',
                    'operationId':'fixture_operation_01'})
                assert uncertain.get('state')=='HELD_UNCERTAIN',uncertain
                print('B I02_UI_IGNORE_DOES_NOT_RELEASE_OPERATION=PASS',flush=True)
                # I09 B: exact installed Firefox Developer Edition XPI,
                # actual IndexedDB transactions, full source SHA-256, runtime
                # sender port, fail-closed staging and synthetic editor strip.
                # No external Perchance/Git requests and NO provider B claim.
                call('POST',f'/session/{after}/url',{'url':url+'#generators'})
                stage_ui=execute(after,"return {slug:!!document.getElementById('pcms-stage-slug'),pin:!!document.getElementById('pcms-stage-pin'),queue:!!document.getElementById('pcms-stage-queue'),state:document.getElementById('pcms-stage-status')?.textContent||''}")
                assert stage_ui.get('slug') and stage_ui.get('pin') and stage_ui.get('queue'),stage_ui
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const core=await import('./staging-core.mjs');
                  const module=await import('./staging-store.mjs');
                  const strip=await import('./editor-strip.mjs');
                  const journal=await import('./journal.mjs');
                  const enc=text=>btoa(String.fromCharCode(...new TextEncoder().encode(text)));
                  const slug='i09-b-fixture',fp='a'.repeat(64);
                  const candidate=await core.exactSource([
                    {path:'main.pjs',base64:enc('let x=2')},
                    {path:'index.html',base64:enc('<p>private</p>')},
                    {path:'src/nested/a.bin',base64:btoa(String.fromCharCode(0,255,128))},
                    {path:'src/empty.txt',base64:''}
                  ]);
                  const previous=await core.exactSource([
                    {path:'main.pjs',base64:''},
                    {path:'index.html',base64:''}
                  ]);
                  const different=await core.exactSource([
                    {path:'main.pjs',base64:enc('let x=1')},
                    {path:'index.html',base64:enc('<p>private</p>')},
                    {path:'src/obsolete.txt',base64:enc('old')}
                  ]);
                  const changes=core.diffSource(different,candidate).changes;
                  const account={accountId:'account_i09_b',personaUid:'persona-i09-b',
                    state:'VERIFIED',revision:2,bindingVersion:1,
                    identity:{source:'GUARDED_SESSION_READBACK',
                      bindingVersion:1,principalFingerprint:fp}};
                  const source={ok:true,ready:true,folder:'gens/'+slug,
                    fingerprint:'d'.repeat(64),testingSha:null,
                    head:'e'.repeat(40),sourceBytes:candidate.blobs};
                  const eligibility={ok:true,account,item:{remoteId:'public_i09_b'},
                    link:{folder:source.folder,accountId:account.accountId,
                      personaUid:account.personaUid,bindingVersion:1}};
                  const db=await journal.openCanonicalDatabase();
                  await new Promise((resolve,reject)=>{
                    const tx=db.transaction('meta','readwrite');
                    tx.objectStore('meta').put({key:'account:'+account.accountId,account});
                    tx.objectStore('meta').put({key:'source-link:'+slug,
                      link:{...eligibility.link}});
                    tx.oncomplete=resolve;tx.onerror=reject;tx.onabort=reject;
                  });
                  const store=module.createStagingStore(db);
                  const pinned=await store.pin({slug,candidate,previous,source,eligibility,
                    nonce:'f'.repeat(32)});
                  const cmd=msg=>new Promise(resolve=>{
                    const port=browser.runtime.connect({name:'pcms-i09-staging'});
                    port.onMessage.addListener(v=>{try{port.disconnect()}catch{}resolve(v)});
                    port.onDisconnect.addListener(()=>resolve({code:'DISCONNECTED'}));
                    port.postMessage(msg);
                  });
                  const actual=await cmd({type:'GET_STAGE',params:{slug}});
                  const blocked=await cmd({type:'STAGE_PRIVATE',params:{
                    slug,expectedRevision:pinned.revision,token:'read-only-git-token'}});
                  const prepared=await store.move(slug,pinned.revision,'PREPARED');
                  const possible=await store.move(slug,prepared.revision,'DISPATCH_POSSIBLE');
                  const recovery=await store.recover();
                  const held=await store.getFull(slug);
                  const noReplay=await store.move(slug,held.record.revision,'DISPATCH_POSSIBLE');
                  strip.renderPcmsEditorStrip({
                    slug,nonce:'f'.repeat(32),accountId:account.accountId,
                    personaUid:account.personaUid
                  },{location:{origin:'https://perchance.org',pathname:'/'+slug,hash:'#edit'},
                    document,browser});
                  const host=document.getElementById('pcms-alpha-editor-context');
                  const handoff=host?.querySelector('button');
                  if(handoff)handoff.click();
                  const handoffIntent=host?.dataset.pcmsHumanIntent==='true';
                  done({ok:pinned.ok&&actual.ok&&blocked.code==='PROVIDER_ACTIVATION_HELD'&&
                      held.record.state==='HELD_UNCERTAIN'&&
                      noReplay.code==='ILLEGAL_STAGE_TRANSITION'&&handoffIntent&&
                      previous.totalBytes===0&&changes.some(x=>x.kind==='DELETED')&&
                      changes.some(x=>x.kind==='ADDED'),
                    pinned,blocked,possible,recovery,held:held.record.state,
                    noReplay,changes,handOffIntent:handoffIntent,
                    digest:candidate.fingerprint});
                  db.close();
                })().catch(e=>done({error:String(e),stack:e?.stack?.slice(0,500)}));"""
                i09=call('POST',f'/session/{after}/execute/async',
                         {'script':code,'args':[]},timeout=90)
                assert i09.get('ok') is True,i09
                assert re.fullmatch('[a-f0-9]{64}',i09.get('digest','')),i09
                assert i09.get('held')=='HELD_UNCERTAIN',i09
                print('B I09_PACKAGED_FIREFOX_IDB_SOURCE_BYTES_CRASH_HOLD=PASS',flush=True)
                print('B I09_PACKAGED_SYNTHETIC_EDITOR_STRIP_NO_PROVIDER_ACTIVATION=PASS',flush=True)

                # I10 B: installed exact XPI, Firefox IndexedDB durable Settings
                # revisions and positive/negative exact-source oracle state.
                # No native AI transport/provider calls or external credentials.
                call('POST',f'/session/{after}/url',{'url':url+'#settings'})
                ai_settings=execute(after,"return {prompt:!!document.getElementById('pcms-ai-prompt'),save:!!document.getElementById('pcms-ai-save'),history:!!document.getElementById('pcms-ai-prompt-history')}")
                assert ai_settings=={'prompt':True,'save':True,'history':True},ai_settings
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const policy=await import('./ai-evidence.mjs');
                  const persistence=await import('./ai-store.mjs');
                  const journal=await import('./journal.mjs');
                  const db=await journal.openCanonicalDatabase();
                  const store=persistence.createAiStore(db);
                  const before=await store.getPrompt();
                  const updated=await store.changePrompt({text:'Independent B test',
                    tests:['observed_smoke']},before.current.revision);
                  const stale=await store.changePrompt({text:'stale',
                    tests:['observed_smoke']},before.current.revision);
                  const later=await store.getPrompt();
                  const exported=store.exportPrompt(later.history);
                  const stage={slug:'i10-b-private',revision:6,state:'SOURCE_VERIFIED',
                    accountId:'account-i10',candidate:{fingerprint:'a'.repeat(64)},
                    previous:{fingerprint:'b'.repeat(64)}};
                  const prepared=await store.start(stage);
                  const blockedDuplicate=await store.start({...stage,slug:'i10-b-other'});
                  const untrusted=policy.applyAiEvidence(policy.beginAiJob({
                    stage,prompt:later.current}).job,{type:'ASSISTANT_DONE',chat:1,
                    text:'ALL PASS'});
                  const fromPort=await new Promise(resolve=>{
                    const port=browser.runtime.connect({name:'pcms-i10-ai'});
                    port.onMessage.addListener(v=>{try{port.disconnect()}catch{}resolve(v)});
                    port.onDisconnect.addListener(()=>resolve({code:'DISCONNECTED'}));
                    port.postMessage({type:'LIST_JOBS'});
                  });
                  const job=await store.getJob('i10-b-private');
                  const wrongProof=policy.applyAiEvidence(policy.beginAiJob({
                    stage,prompt:later.current}).job,{type:'TEST',chat:1,
                      name:'observed_smoke',result:'PASS',observedAt:1,
                      sourceFingerprint:'a'.repeat(64),
                      independentSource:'AI_PROSE'});
                  done({ok:before.ok&&updated.ok&&
                    later.current.revision===before.current.revision+1&&
                    stale.code==='PROMPT_REVISION_STALE'&&exported.ok&&
                    prepared.ok&&blockedDuplicate.code==='AI_ACCOUNT_CONCURRENCY_HELD'&&
                    untrusted.ok===false&&wrongProof.ok===false&&
                    fromPort.ok&&fromPort.jobs.some(j=>j.slug==='i10-b-private')&&
                    job.evidence.state==='TESTS_UNVERIFIED'&&
                    job.promptRevision===later.current.revision,
                    savedRevision:later.current.revision,prepared,stale,
                    count:fromPort.jobs?.length,untrusted,wrongProof});
                  db.close();
                })().catch(e=>done({error:String(e),stack:e?.stack?.slice(0,500)}));"""
                ai_b=call('POST',f'/session/{after}/execute/async',
                          {'script':code,'args':[]},timeout=90)
                assert ai_b.get('ok') is True,ai_b
                print('B I10_PACKAGED_SETTINGS_CAS_PROMPT_PIN_AND_ORACLE_HOLDS=PASS',flush=True)
                call('POST',f'/session/{after}/url',{'url':url+'#work-queue'})
                ai_work=execute(after,"return {job:!!document.getElementById('pcms-ai-job-list'),prepare:!!document.getElementById('pcms-ai-prepare'),enabled:!document.getElementById('pcms-ai-prepare')?.disabled}")
                assert ai_work=={'job':True,'prepare':True,'enabled':False},ai_work
                print('B I10_PACKAGED_UI_HELD_NO_AI_PROVIDER_DISPATCH=PASS',flush=True)
                # I10 B: durable uncertain native send on real IndexedDB, actual
                # process-cold recovery state and full generator asset checkpoint.
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const persistence=await import('./ai-store.mjs');
                  const stageCore=await import('./staging-core.mjs');
                  const journal=await import('./journal.mjs');
                  const db=await journal.openCanonicalDatabase();
                  const store=persistence.createAiStore(db);
                  const current=await store.getJob('i10-b-private');
                  const armed=await store.armNative('i10-b-private',current.revision,'CHAT1_SEND');
                  const repeat=await store.armNative('i10-b-private',armed.revision,'CHAT1_SEND');
                  const recovered=await store.recoverNative();
                  const after=await store.getJob('i10-b-private');
                  const session='1'.repeat(64);
                  const busy=await store.observeNative('i10-b-private',after.revision,{
                    ok:true,slug:'i10-b-private',busy:true,sessionDigest:session,
                    chatEntries:2,sourceSaved:false});
                  const idle=await store.observeNative('i10-b-private',busy.revision,{
                    ok:true,slug:'i10-b-private',busy:false,sessionDigest:session,
                    chatEntries:3,sourceSaved:true});
                  const enc=text=>btoa(String.fromCharCode(...new TextEncoder().encode(text)));
                  const snapshot=await stageCore.exactSource([
                    {path:'main.pjs',base64:enc('list\u005cn  value')},
                    {path:'index.html',base64:enc('<h1>fixed</h1>')},
                    {path:'src/asset.dat',base64:btoa(String.fromCharCode(0,1,255))}
                  ]);
                  const full=await store.checkpointSource('i10-b-private',idle.revision,snapshot);
                  const stored=await store.getJobFull('i10-b-private');
                  const port=msg=>new Promise(resolve=>{
                    const p=browser.runtime.connect({name:'pcms-i10-ai'});
                    p.onMessage.addListener(v=>{try{p.disconnect()}catch{}resolve(v)});
                    p.onDisconnect.addListener(()=>resolve({code:'DISCONNECTED'}));
                    p.postMessage(msg);
                  });
                  const denied=await port({type:'BEGIN_NATIVE',params:{
                    slug:'i10-b-private',expectedRevision:full.revision,step:'CHAT1_SEND'
                  }});
                  done({ok:armed.ok&&repeat.code==='AI_EFFECT_RECONCILIATION_REQUIRED'&&
                    recovered.ok&&recovered.held>=1&&busy.ok&&idle.ok&&
                    full.ok&&stored.job.finalSource.blobs.length===3&&
                    stored.job.chat1.tests&&
                    stored.job.sourceFingerprint===snapshot.fingerprint&&
                    stored.job.state==='TESTS_UNVERIFIED'&&
                    denied.ok!==true,armed,repeat,recovered,denied,
                    fingerprint:snapshot.fingerprint,held:stored.job.hold});
                  db.close();
                })().catch(e=>done({error:String(e),stack:e?.stack?.slice(0,500)}));"""
                ai_recovery=call('POST',f'/session/{after}/execute/async',
                                 {'script':code,'args':[]},timeout=90)
                assert ai_recovery.get('ok') is True,ai_recovery
                print('B I10_PACKAGED_NATIVE_DISPATCH_JOURNAL_FULL_SOURCE_CRASH_HOLD=PASS',flush=True)
                # I10 B: synthetic independent-failure receipt feeding the
                # canonical no-progress state; never a fake live-provider PASS.
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const persistence=await import('./ai-store.mjs');
                  const journal=await import('./journal.mjs');
                  const db=await journal.openCanonicalDatabase();
                  const store=persistence.createAiStore(db),slug='i10-b-private';
                  const initial=await store.getJob(slug);
                  const session='1'.repeat(64);
                  const failed=await store.record(slug,initial.revision,{
                    type:'TEST',chat:1,name:'observed_smoke',
                    sourceFingerprint:initial.sourceFingerprint,
                    independentSource:'INDEPENDENT_BROWSER_ASSERTION',
                    result:'FAIL',observedAt:Date.now()
                  });
                  const armed=await store.armNative(slug,failed.revision,'CHAT1_REPAIR');
                  const seen=await store.observeNative(slug,armed.revision,{
                    ok:true,slug,busy:false,sessionDigest:session,
                    chatEntries:3,sourceSaved:true
                  });
                  const sealed=await store.getJobFull(slug);
                  const once=await store.checkpointSource(slug,seen.revision,
                    await (await import('./staging-core.mjs')).exactSource(sealed.job.finalSource.blobs));
                  const again=await store.armNative(slug,once.revision,'CHAT1_REPAIR');
                  const seenAgain=await store.observeNative(slug,again.revision,{
                    ok:true,slug,busy:false,sessionDigest:session,
                    chatEntries:4,sourceSaved:true
                  });
                  const still=await store.getJobFull(slug);
                  const twice=await store.checkpointSource(slug,seenAgain.revision,
                    await (await import('./staging-core.mjs')).exactSource(still.job.finalSource.blobs));
                  const noThird=await store.armNative(slug,twice.revision,'CHAT1_REPAIR');
                  done({ok:failed.ok&&failed.state==='KNOWN_FAILURE'&&
                    armed.ok&&seen.ok&&once.state==='KNOWN_FAILURE'&&
                    again.ok&&seenAgain.ok&&twice.state==='HELD_NO_PROGRESS'&&
                    twice.hold==='REPEATED_SAME_SOURCE_FAILED_REPAIR'&&
                    noThird.code==='AI_VERIFIED_FAILURE_AND_SESSION_REQUIRED',
                    failed,armed,once,again,twice,noThird});
                  db.close();
                })().catch(e=>done({error:String(e),stack:e?.stack?.slice(0,500)}));"""
                ai_loop=call('POST',f'/session/{after}/execute/async',
                             {'script':code,'args':[]},timeout=90)
                assert ai_loop.get('ok') is True,ai_loop
                print('B I10_PACKAGED_KNOWN_FAILURE_NOT_DOWNGRADED_AND_REPAIR_NO_PROGRESS_HOLD=PASS',flush=True)

                # I10 B: real canonical IndexedDB CAS on globally versioned
                # per-account concurrency, independent accounts, and observed
                # idle/exact-source slot release. Pure synthetic, no provider.
                call('POST',f'/session/{after}/url',{'url':url+'#settings'})
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const storeModule=await import('./ai-store.mjs');
                  const core=await import('./staging-core.mjs');
                  const journal=await import('./journal.mjs');
                  const enc=text=>btoa(String.fromCharCode(...new TextEncoder().encode(text)));
                  const source=await core.exactSource([
                    {path:'main.pjs',base64:enc('output = 1')},
                    {path:'index.html',base64:enc('<p>prepared</p>')}
                  ]);
                  const db=await journal.openCanonicalDatabase();
                  const store=storeModule.createAiStore(db);
                  const before=await store.getConcurrency();
                  const next=await store.changeConcurrency(before.setting.revision,2);
                  const stale=await store.changeConcurrency(before.setting.revision,3);
                  const bad=await store.changeConcurrency(next.setting.revision,50);
                  const stage=(slug,accountId)=>({
                    slug,accountId,revision:1,state:'SOURCE_VERIFIED',
                    candidate:{fingerprint:source.fingerprint},
                    previous:{fingerprint:'b'.repeat(64)}
                  });
                  const a=await store.start(stage('i10-slot-a','account-i10-slots'));
                  const b=await store.start(stage('i10-slot-b','account-i10-slots'));
                  const full=await store.start(stage('i10-slot-c','account-i10-slots'));
                  const independent=await store.start(stage('i10-slot-d','account-i10-separate'));
                  const armed=await store.armNative('i10-slot-a',a.revision,'CHAT1_SEND');
                  const observed=await store.observeNative('i10-slot-a',armed.revision,{
                    ok:true,slug:'i10-slot-a',busy:false,
                    sessionDigest:'d'.repeat(64),chatEntries:2,sourceSaved:true
                  });
                  const saved=await store.checkpointSource('i10-slot-a',
                    observed.revision,source);
                  const proof=await store.record('i10-slot-a',saved.revision,{
                    type:'TEST',chat:1,name:'observed_smoke',
                    sourceFingerprint:source.fingerprint,
                    independentSource:'INDEPENDENT_BROWSER_ASSERTION',
                    result:'PASS',observedAt:Date.now()
                  });
                  const released=await store.getJob('i10-slot-a');
                  const afterRelease=await store.start(stage('i10-slot-c','account-i10-slots'));
                  const portConfig=await new Promise(resolve=>{
                    const port=browser.runtime.connect({name:'pcms-i10-ai'});
                    port.onMessage.addListener(v=>{try{port.disconnect()}catch{}resolve(v)});
                    port.onDisconnect.addListener(()=>resolve({code:'DISCONNECTED'}));
                    port.postMessage({type:'GET_CONCURRENCY'});
                  });
                  done({ok:source.ok&&before.ok&&before.setting.perAccount===1&&
                    next.ok&&next.setting.perAccount===2&&
                    stale.code==='STALE_REVISION'&&bad.code==='AI_CONCURRENCY_INVALID'&&
                    a.ok&&b.ok&&full.code==='AI_ACCOUNT_CONCURRENCY_HELD'&&
                    independent.ok&&armed.ok&&observed.ok&&saved.ok&&
                    proof.ok&&proof.state==='TESTS_VERIFIED'&&
                    released.slotReleased===true&&afterRelease.ok&&
                    portConfig.ok&&portConfig.setting.perAccount===2,
                    before:before.setting,next:next.setting,stale,bad,
                    first:a.ok,second:b.ok,third:full,
                    independent:independent.ok,proof:proof.state,
                    released:released.slotReleased,afterRelease:afterRelease.ok,
                    portConfig:portConfig.setting});
                  db.close();
                })().catch(e=>done({error:String(e),stack:e?.stack?.slice(0,500)}));"""
                concurrency_b=call('POST',f'/session/{after}/execute/async',
                                   {'script':code,'args':[]},timeout=90)
                assert concurrency_b.get('ok') is True,concurrency_b
                print('B I10_PACKAGED_VERSIONED_CONCURRENCY_CAS_IDLE_SLOT_RELEASE=PASS',flush=True)

                # I10 B: two genuinely distinct (synthetic) native sessions,
                # final Chat2 source-changing repair, invalidated Chat1 suite,
                # observed independent retests on one final F and slot release.
                # Browser/IDB only: no live AI, Perchance account or writes.
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const journal=await import('./journal.mjs');
                  const storeModule=await import('./ai-store.mjs');
                  const core=await import('./staging-core.mjs');
                  const {planAiStep}=await import('./ai-supervisor.mjs');
                  const db=await journal.openCanonicalDatabase();
                  const store=storeModule.createAiStore(db);
                  // Earlier B checks deliberately change Settings. Each new
                  // synthetic job MUST pin its own current canonical revision.
                  const priorPrompt=await store.getPrompt();
                  const configured=await store.changePrompt({
                    text:'Run the independent fixed default generator smoke oracle; do not trust assistant text.',
                    tests:['default_generator_smoke']
                  },priorPrompt.current.revision);
                  const enc=s=>btoa(String.fromCharCode(...new TextEncoder().encode(s)));
                  const original=await core.exactSource([
                    {path:'main.pjs',base64:enc('output = 1')},
                    {path:'index.html',base64:enc('<p>v1</p>')}
                  ]);
                  const repaired=await core.exactSource([
                    {path:'main.pjs',base64:enc('output = 2')},
                    {path:'index.html',base64:enc('<p>v2</p>')},
                    {path:'src/new.bin',base64:'AAH/'}
                  ]);
                  const slug='i10-two-chat';
                  const stage={slug,accountId:'two-chat-account',revision:1,
                    state:'SOURCE_VERIFIED',candidate:{fingerprint:original.fingerprint},
                    previous:{fingerprint:'b'.repeat(64)}};
                  const begun=await store.start(stage,{
                    sha256:'f'.repeat(64),text:'Use a fresh isolated conversation.',
                    tests:['default_generator_smoke']
                  });
                  const sid1='1'.repeat(64),sid2='2'.repeat(64);
                  const send1=await store.armNative(slug,begun.revision,'CHAT1_SEND');
                  const idle1=await store.observeNative(slug,send1.revision,{
                    ok:true,slug,sessionDigest:sid1,busy:false,chatEntries:2,sourceSaved:true
                  });
                  const snapshot1=await store.checkpointSource(slug,idle1.revision,original);
                  const smoke=(revision,chat,fp)=>store.record(slug,revision,{
                    type:'TEST',chat,name:'default_generator_smoke',
                    sourceFingerprint:fp,independentSource:'INDEPENDENT_BROWSER_ASSERTION',
                    result:'PASS',observedAt:Date.now()
                  });
                  const pass1=await smoke(snapshot1.revision,1,original.fingerprint);
                  const reset=await store.armNative(slug,pass1.revision,'CHAT2_RESET');
                  const stale=await store.observeNative(slug,reset.revision,{
                    ok:true,slug,sessionDigest:null,busy:false,chatEntries:1,sourceSaved:true
                  });
                  const pendingDraft=await store.observeNative(slug,reset.revision,{
                    ok:true,slug,sessionDigest:null,busy:false,chatEntries:0,
                    inputOccupied:true,sourceSaved:true
                  });
                  const empty=await store.observeNative(slug,reset.revision,{
                    ok:true,slug,sessionDigest:null,busy:false,chatEntries:1,
                    resetGreetingVisible:true,inputOccupied:false,hasQueue:false,
                    sourceSaved:true
                  });
                  const send2=await store.armNative(slug,empty.revision,'CHAT2_SEND');
                  const idle2=await store.observeNative(slug,send2.revision,{
                    ok:true,slug,sessionDigest:sid2,busy:false,chatEntries:2,sourceSaved:true
                  });
                  const saved2=await store.checkpointSource(slug,idle2.revision,repaired);
                  const sealed=await store.getJobFull(slug);
                  const planned1=planAiStep(sealed.job);
                  const replay1=await smoke(saved2.revision,1,repaired.fingerprint);
                  const sealed2=await store.getJobFull(slug);
                  const planned2=planAiStep(sealed2.job);
                  const replay2=await smoke(replay1.revision,2,repaired.fingerprint);
                  const complete=await store.getJob(slug);
                  const recheck=await store.checkpointSource(slug,replay1.revision,repaired);
                  const afterRecheck=await store.getJob(slug);
                  const changedAgain=await store.checkpointSource(slug,recheck.revision,original);
                  const revoked=await store.getJob(slug);
                  done({ok:configured.ok&&
                    original.ok&&repaired.ok&&begun.ok&&send1.ok&&idle1.ok&&
                    snapshot1.ok&&pass1.ok&&reset.ok&&
                    stale.code==='AI_CHAT2_RESET_NOT_PROVEN'&&
                    pendingDraft.code==='AI_CHAT2_RESET_NOT_PROVEN'&&
                    empty.ok&&send2.ok&&idle2.ok&&
                    sid1!==sid2&&saved2.evidence?.chat1Pass===false&&
                    saved2.evidence?.state==='TESTS_UNVERIFIED'&&
                    planned1.code==='AI_CHAT2_ISOLATION_UNVERIFIED'&&
                    replay1.ok&&planned2.code==='AI_CHAT2_ISOLATION_UNVERIFIED'&&
                    replay2.code==='AI_CHAT2_ISOLATION_UNVERIFIED'&&
                    complete.state==='TESTS_UNVERIFIED'&&
                    complete.slotReleased===false&&recheck.ok&&
                    afterRecheck.state==='TESTS_UNVERIFIED'&&
                    afterRecheck.slotReleased===false&&changedAgain.ok&&
                    revoked.state==='TESTS_UNVERIFIED'&&
                    revoked.slotReleased===false&&
                    revoked.evidence.chat1Pass===false&&
                    revoked.evidence.chat2Pass===false,
                    saved:saved2,step1:planned1,step2:planned2,
                    begun,send1,idle1,snapshot1,pass1,reset,stale,pendingDraft,
                    empty,send2,idle2,
                    pass2:replay2?.state,complete:complete.state,
                    afterRecheck:afterRecheck.state});
                  db.close();
                })().catch(e=>done({error:String(e),stack:e?.stack?.slice(0,500)}));"""
                ai_twochat=call('POST',f'/session/{after}/execute/async',
                                {'script':code,'args':[]},timeout=90)
                assert ai_twochat.get('ok') is True,ai_twochat
                print('B I10_PACKAGED_CHAT2_DISTINCT_SID_WITHOUT_OPFS_PROOF_HELD=PASS',flush=True)

                # I08 B: real packaged Firefox crypto, canonical IDB, donor
                # portable format, Settings action, and wrong-password failure.
                # No live provider or native calls; no disk byte proof claimed.
                call('POST',f'/session/{after}/url',{'url':url+'#settings'})
                settings=execute(after,"return {button:!!document.getElementById('pcms-backup-export'),password:!!document.getElementById('pcms-backup-passphrase'),status:!!document.getElementById('pcms-backup-status')}")
                assert settings=={'button':True,'password':True,'status':True},settings
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const core=await import('./backup-core.mjs');
                  const donor=await import('../lib/backup-package.js');
                  const journal=await import('./journal.mjs');
                  const password='real-packaged-firefox-fixture-passphrase';
                  const db=await journal.openCanonicalDatabase();
                  const original=await core.snapshotCanonical(db);
                  db.close();
                  const payload=donor.createPortableBackupPayload({
                    state:{},containers:[],selection:{kind:'full'}
                  });
                  const inner=await donor.encodeBackupEnvelope({payload,password});
                  const archived=await core.encodeIntegrated({
                    pcms:original,donorEnvelope:inner,passphrase:password
                  });
                  const decoded=await core.decodeIntegrated(archived.text,password,{
                    decodeDonor:donor.decodeBackupEnvelope
                  });
                  const encryptedOnly=!archived.text.includes('fixture_operation_01')&&
                    !archived.text.includes('fixture_account_a01');
                  let wrongPasswordHeld=false;
                  try{await core.decodeIntegrated(archived.text,'wrong-password',{
                    decodeDonor:donor.decodeBackupEnvelope});}
                  catch{wrongPasswordHeld=true;}
                  const storePresent=original.stores.operations.some(
                    row=>row.value.operationId==='fixture_operation_01');
                  done({ok:encryptedOnly&&wrongPasswordHeld&&storePresent&&
                    JSON.stringify(decoded.pcms)===JSON.stringify(original),
                    encryptedOnly,wrongPasswordHeld,storePresent,
                    rows:decoded.pcms.stores.operations.length,hash:archived.sha256});
                })().catch(e=>done({error:String(e)}));"""
                proof=call('POST',f'/session/{after}/execute/async',
                           {'script':code,'args':[]},timeout=90)
                assert proof.get('ok') is True,proof
                assert re.fullmatch('[a-f0-9]{64}',proof.get('hash','')),proof
                print('B I08_PACKAGED_FIREFOX_ENCRYPTED_IDB_DONOR_ROUNDTRIP=PASS',flush=True)

                # Exercise the actual operator UI and Firefox Downloads API in
                # this disposable profile. This is not a production on-disk
                # byte re-read, and must never be called tier 3.
                bad_password=execute(after,"document.getElementById('pcms-backup-passphrase').value='short';document.getElementById('pcms-backup-export').click();return document.getElementById('pcms-backup-status').textContent")
                assert '12 characters' in bad_password,bad_password
                execute(after,"document.getElementById('pcms-backup-passphrase').value='real-packaged-firefox-fixture-passphrase';document.getElementById('pcms-backup-export').click();return true")
                backup_status=''
                for _ in range(120):
                    backup_status=execute(after,"return document.getElementById('pcms-backup-status')?.textContent||''")
                    if 'Browser reported complete (tier 2)' in backup_status or (
                        'Backup not confirmed:' in backup_status) or (
                        'browser download not confirmed:' in backup_status):
                        break
                    time.sleep(.25)
                assert 'Browser reported complete (tier 2)' in backup_status,backup_status
                assert 'Exact on-disk bytes have NOT been independently re-read' in backup_status,backup_status
                receipt=execute(after,"return document.getElementById('pcms-overview-backup')?.textContent||''")
                # Receipt projection is refreshed asynchronously after export.
                for _ in range(30):
                    receipt=execute(after,"return document.getElementById('pcms-overview-backup')?.textContent||''")
                    if 'BROWSER_REPORTED_COMPLETE' in receipt: break
                    time.sleep(.2)
                assert 'BROWSER_REPORTED_COMPLETE' in receipt,receipt
                print('B I08_MANUAL_UI_FIREFOX_DOWNLOAD_TIER2=PASS',flush=True)

                print('B PACKAGED_RESTART/NAVIGATION/DISABLED/ADVANCED: PASS',flush=True)
            finally: close(after)
        finally:
            server.terminate()
            try: server.wait(timeout=4)
            except subprocess.TimeoutExpired: server.kill()


if __name__=='__main__':
    if len(sys.argv)!=2: raise SystemExit('browser-i00-smoke.py path/to/combined.xpi')
    try: main()
    except Exception as exc:
        print('B HARNESS_OR_PRODUCT_FAILURE:',repr(exc),file=sys.stderr)
        raise
