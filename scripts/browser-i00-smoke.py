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


def wait_donor_ready(session, timeout_seconds=12):
    # Read-only bootstrap witness, not a retry of a mutating operation.
    # The static PCMS listeners wake before PersonaMonkey's asynchronous
    # recovery/bootstrap dynamically imports its guarded background.
    last = None
    until = time.monotonic() + timeout_seconds
    while time.monotonic() < until:
        last = guard_status(session)
        if last.get('donorReady') is True:
            assert last.get('providerEffects') == 'OFF', last
            return last
        assert last.get('admission') in (
            'HELD_DONOR_BOOTSTRAP','PER_ACCOUNT_ROUTE_PIN'), last
        time.sleep(.15)
    raise AssertionError({'code':'DONOR_STARTUP_READINESS_TIMEOUT',
                          'last':last})


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



def coordinator_command(session, command):
    # The installed S00 fixed-intent port; synthetic data, no external effects.
    script = '''const done=arguments[arguments.length-1];
    const port=browser.runtime.connect({name:'pcms-s00-coordinator'});
    port.onMessage.addListener(value=>{try{port.disconnect()}catch(e){}done(value)});
    port.onDisconnect.addListener(()=>done({error:'coordinator-disconnected'}));
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
      // S01/C-59: a DIFFERENT principal can never rebind the account.
      const rotateDenied=await createAccountStore(canon).apply({
        type:'VERIFY',accountId:'fixture_inventory_01',expectedRevision:2,
        proof:{source:'GUARDED_SESSION_READBACK',verified:true,
          personaUid:'persona-fixture-0001',principalFingerprint:'b'.repeat(64),
          observationId:'fixture_identity_rotated_01'}
      });
      // A fresh same-principal observation still revises the account context.
      const rotate=await createAccountStore(canon).apply({
        type:'VERIFY',accountId:'fixture_inventory_01',expectedRevision:2,
        proof:{source:'GUARDED_SESSION_READBACK',verified:true,
          personaUid:'persona-fixture-0001',principalFingerprint:'a'.repeat(64),
          observationId:'fixture_identity_reobserved_01'}
      });
      canon.close();
      const stale=await get('gen-0999');
      const newBind=await bind('gen-0997');
      done({before,created,duplicate,collision,linked,equal,changed,rotateDenied,rotate,stale,newBind});
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



def owned_firefox_pids(profile):
    # Linux CI H oracle: inspect the OS process commandline rather than trusting
    # a WebDriver session ID or a JS boot token. Never search/stop other profiles.
    target=str(profile.resolve())
    found=set()
    proc=pathlib.Path('/proc')
    if not proc.exists():
        raise AssertionError('S01_OS_PROCESS_INSPECTION_UNAVAILABLE')
    for item in proc.iterdir():
        if not item.name.isdigit():
            continue
        try:
            argv=[os.fsdecode(a) for a in (item/'cmdline').read_bytes().split(b'\0') if a]
            for idx,arg in enumerate(argv[:-1]):
                if (arg in ('-profile','--profile') and
                    pathlib.Path(argv[idx+1]).resolve()==pathlib.Path(target)):
                    found.add(int(item.name))
                    break
        except (OSError,ValueError,PermissionError):
            continue
    return found


def require_owned_exit(profile, previous, timeout=5):
    limit=time.monotonic()+timeout
    while time.monotonic()<limit:
        live=owned_firefox_pids(profile)&previous
        if not live:
            return True
        time.sleep(.1)
    raise AssertionError('S01_OWNED_FIREFOX_PROCESS_NOT_EXITED')


class _ProxyOracle:
    """Loopback HTTP proxy that only RECORDS request targets (independent oracle)."""
    def __init__(self):
        import http.server, threading
        seen=self.seen=[]
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(inner):
                seen.append(inner.path)
                body=b'ok'
                inner.send_response(200);inner.send_header('Content-Length',str(len(body)))
                inner.end_headers();inner.wfile.write(body)
            def log_message(inner,*args): pass
        self.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
        self.port=self.server.server_address[1]
        threading.Thread(target=self.server.serve_forever,daemon=True).start()
    def close(self): self.server.shutdown()


def s01_add_account_profile(browser, archive, folder):
    """S01 B: real Add Account in a disposable profile, then donor pin enforcement."""
    profile=folder/'s01-enrollment-profile'
    profile.mkdir()
    (profile/'user.js').write_text('user_pref("xpinstall.signatures.required", false);\n')
    first=open_session(browser,profile)
    try:
        assert call('POST',f'/session/{first}/moz/addon/install',
                    {'path':str(archive),'temporary':False},timeout=45)==ID
    finally: close(first)
    session=open_session(browser,profile)
    oracle=_ProxyOracle()
    try:
        uuid=addons_uuid(profile)
        call('POST',f'/session/{session}/url',{'url':f'moz-extension://{uuid}/pcms/index.html#accounts'})
        wait_donor_ready(session)
        for _ in range(120):
            ui=execute(session,"return {add:document.getElementById('pcms-add-account')?.disabled,legacy:!!document.getElementById('pcms-persona-picker')}")
            if ui.get('add') is False: break
            time.sleep(.25)
        assert ui=={'add':False,'legacy':False},(ui,account_command(session,{'type':'LIST_ACCOUNTS'}))
        print('B S01_ADD_ACCOUNT_CONTROL_ENABLED_NO_MANUAL_PERSONA_PICKER=PASS',flush=True)
        started=account_command(session,{'type':'ADD_ACCOUNT'})
        assert started.get('ok') is True,started
        account=None
        for _ in range(240):
            listed=account_command(session,{'type':'LIST_ACCOUNTS'})
            account=next((a for a in listed.get('accounts',[]) if a['accountId']==started['accountId']),None)
            if account and not account.get('working') and account.get('setup',{}).get('phase') in ('HELD','LOGIN'):
                break
            time.sleep(.5)
        assert account,listed
        # CI has no PersonaMonkey native Mullvad helper: setup must hold, never
        # reach login or fall back to an unprotected route.
        assert account['state']=='PREPARING' and account['setup']['phase']=='HELD',account
        assert account['setup']['code'] in ('MULLVAD_LOCAL_SERVICE_UNAVAILABLE','NO_ROUTE_CANDIDATES',
            'DONOR_SECURITY_UNAVAILABLE'),account
        assert account.get('message'),account
        print('B S01_REAL_ADD_ACCOUNT_HELD_WITHOUT_NATIVE=',account['setup']['code'],flush=True)
        network=account_command(session,{'type':'NETWORK_STATUS'})
        assert network.get('ok') is True and network.get('activePins')==0,network
        # Inspect donor state from the PersonaMonkey settings page (security review sender).
        call('POST',f'/session/{session}/url',{'url':f'moz-extension://{uuid}/options/options.html'})
        script="""const done=arguments[arguments.length-1];(async()=>{
          const send=m=>browser.runtime.sendMessage(m);
          let snap=await send({type:'GET_SNAPSHOT'});
          const tagged=Object.values(snap.state.profiles).filter(p=>p.pcmsBindingId);
          if(tagged.length!==1)return {error:'TAGGED_COUNT_'+tagged.length};
          const t=tagged[0];
          const initial={routeId:t.routeId,killSwitch:t.killSwitch,blockLocal:t.blockLocalNetwork};
          const state=structuredClone(snap.state);
          state.routes['ci-s01-http']={id:'ci-s01-http',name:'CI proxy oracle',type:'http',
            host:'127.0.0.1',port:PORT,enabled:true};
          const preview=await send({type:'PREVIEW_STATE_CHANGE',state});
          await send({type:'AUTHORIZE_SECURITY_PREVIEW',previewId:preview.previewId,approvedDelta:preview.delta});
          await send({type:'COMMIT_STATE_PREVIEW',authorizationId:preview.previewId});
          await send({type:'UPDATE_PROFILE_ROUTE',profileId:t.containerId,routeId:'ci-s01-http'});
          const ordinary=await send({type:'CREATE_PERSONA',input:{name:'CI ordinary',routeId:'ci-s01-http',
            profile:{killSwitch:true,blockLocalNetwork:false}}});
          snap=await send({type:'GET_SNAPSHOT'});
          const after=snap.state.profiles[t.containerId];
          await browser.tabs.create({url:'http://s01-oracle.example/tagged',cookieStoreId:t.containerId,active:false});
          await browser.tabs.create({url:'http://s01-oracle.example/ordinary',
            cookieStoreId:ordinary.container.cookieStoreId,active:false});
          await new Promise(r=>setTimeout(r,5000));
          return {initial,tagStillPresent:after.pcmsBindingId===t.pcmsBindingId,assigned:after.routeId,
            privacySafe:snap.security.privacySafe===true};
        })().then(done).catch(e=>done({error:String(e)}));""".replace('PORT',str(oracle.port))
        out=call('POST',f'/session/{session}/execute/async',{'script':script,'args':[]},timeout=60)
        assert 'error' not in out,out
        assert out['initial']=={'routeId':'__block__','killSwitch':True,'blockLocal':True},out
        assert out['tagStillPresent'] is True and out['assigned']=='ci-s01-http',out
        print('B S01_DONOR_PERSONA_CREATED_TAGGED_BLOCK_ROUTE=PASS',flush=True)
        tagged_seen=[p for p in oracle.seen if p.endswith('/tagged')]
        assert not tagged_seen,('S01_UNPINNED_MANAGED_REQUEST_ESCAPED',oracle.seen)
        print('B S01_UNPINNED_TAGGED_PERSONA_REQUEST_NEVER_REACHED_PROXY=PASS',flush=True)
        if out['privacySafe']:
            assert any(p.endswith('/ordinary') for p in oracle.seen),('S01_ORDINARY_PERSONA_BROKEN',oracle.seen)
            print('B S01_ORDINARY_PERSONA_SAME_ROUTE_UNAFFECTED=PASS',flush=True)
        else:
            print('B S01_ORDINARY_PERSONA_SAME_ROUTE_UNAFFECTED=NOT_TESTED (donor privacy not safe in this runner)',flush=True)
        s01_legacy_and_archive(session,uuid,oracle,out['privacySafe'],started['accountId'])
    finally:
        oracle.close()
        close(session)


def _options(session,uuid,body,timeout=60):
    """Run a script as the PersonaMonkey settings page (the donor security-review sender)."""
    call('POST',f'/session/{session}/url',{'url':f'moz-extension://{uuid}/options/options.html'})
    # The harness idles the event page after 1.5s; after a wake the donor's
    # message listener registers only once its dynamic import finishes. Wake
    # it with a read-only call before sending any mutating message.
    script=("const done=arguments[arguments.length-1];(async()=>{const send=m=>browser.runtime.sendMessage(m);"
        "for(let i=0;i<80;i++){const s=await send({type:'GET_SNAPSHOT'}).catch(()=>null);if(s&&s.state)break;"
        "await new Promise(r=>setTimeout(r,250));}"+body+
        "})().then(done).catch(e=>done({error:String(e)}));")
    out=call('POST',f'/session/{session}/execute/async',{'script':script,'args':[]},timeout=timeout)
    assert 'error' not in out,out
    return out


def _pcms(session,uuid,body,timeout=60):
    call('POST',f'/session/{session}/url',{'url':f'moz-extension://{uuid}/pcms/index.html#accounts'})
    script="const done=arguments[arguments.length-1];(async()=>{"+body+\
        "})().then(done).catch(e=>done({error:String(e)}));"
    out=call('POST',f'/session/{session}/execute/async',{'script':script,'args':[]},timeout=timeout)
    assert 'error' not in out,out
    return out


def _wait_account(session,account_id,done,limit=240):
    for _ in range(limit):
        listed=account_command(session,{'type':'LIST_ACCOUNTS'})
        account=next((a for a in listed.get('accounts',[]) if a['accountId']==account_id),None)
        if account and not account.get('working') and done(account): return account
        time.sleep(.5)
    raise AssertionError(('S01_ACCOUNT_WAIT_TIMEOUT',account_id,listed))


def s01_legacy_and_archive(session,uuid,oracle,privacy_safe,added_id):
    """C-56..C-59 in place upgrade of a pre-S01 record and C-58 Archive release, real XPI paths."""
    made=_options(session,uuid,"""
      await send({type:'CREATE_PERSONA',input:{name:'CI legacy account',routeId:'ci-s01-http',
        profile:{killSwitch:true,blockLocalNetwork:false}}});
      // Resolve from authoritative donor state, not the message reply.
      let found=[];
      for(let i=0;i<40&&found.length!==1;i++){
        const snap=await send({type:'GET_SNAPSHOT'});
        found=Object.values(snap.state.profiles).filter(p=>p.name==='CI legacy account'&&!p.pcmsBindingId);
        if(found.length!==1)await new Promise(r=>setTimeout(r,250));
      }
      if(found.length!==1)return {error:'LEGACY_PERSONA_COUNT_'+found.length};
      const ordinary={profile:found[0]},ctx=found[0].containerId;
      await browser.tabs.create({url:'http://s01-oracle.example/legacy-before',cookieStoreId:ctx,active:false});
      await new Promise(r=>setTimeout(r,3000));
      return {personaUid:ordinary.profile.personaUid,contextId:ctx};""")
    if privacy_safe:
        assert any(p.endswith('/legacy-before') for p in oracle.seen),oracle.seen
    # A pre-S01 record exactly as the old build stored it: verified identity,
    # no binding tag, no boundPrincipal.
    seeded=_pcms(session,uuid,"""
      const {openCanonicalDatabase}=await import('./journal.mjs');
      const db=await openCanonicalDatabase();
      const record={accountId:'legacy_account_ci01',personaUid:'PERSONA',state:'VERIFIED',revision:2,bindingVersion:1,
        identity:{principalFingerprint:'c'.repeat(64),observationId:'identity_legacy_ci01',
          source:'GUARDED_SESSION_READBACK',bindingVersion:1},override:null,history:[]};
      await new Promise((ok,bad)=>{const tx=db.transaction(['meta'],'readwrite');
        tx.objectStore('meta').put({key:'account:legacy_account_ci01',account:record});tx.oncomplete=ok;tx.onabort=bad;});
      db.close();return {ok:true};""".replace('PERSONA',made['personaUid']))
    assert seeded.get('ok') is True,seeded
    listed=account_command(session,{'type':'LIST_ACCOUNTS'})
    legacy=next(a for a in listed['accounts'] if a['accountId']=='legacy_account_ci01')
    assert legacy['protectedRoute']=='LEGACY_UNPINNED',legacy
    started=account_command(session,{'type':'UPGRADE_ACCOUNT','params':{'accountId':'legacy_account_ci01','expectedRevision':2}})
    assert started.get('ok') is True,started
    legacy=_wait_account(session,'legacy_account_ci01',lambda a:a.get('upgrade',{}) and a['upgrade'].get('phase') in ('HELD','COMPLETE'))
    # No native Mullvad helper in CI: the route step holds, but identity is intact.
    assert legacy['upgrade']['phase']=='HELD',legacy
    assert legacy['upgrade']['code'] in ('MULLVAD_LOCAL_SERVICE_UNAVAILABLE','NO_ROUTE_CANDIDATES','NO_UNIQUE_EXIT_AVAILABLE'),legacy
    assert legacy['state']=='VERIFIED' and legacy['revision']==2 and legacy['identity']=='VERIFIED',legacy
    assert legacy['personaUid']==made['personaUid'],legacy
    stored=_pcms(session,uuid,"""
      const {openCanonicalDatabase}=await import('./journal.mjs');
      const db=await openCanonicalDatabase();
      const row=await new Promise(ok=>{const r=db.transaction(['meta'],'readonly').objectStore('meta')
        .get('account:legacy_account_ci01');r.onsuccess=()=>ok(r.result);});
      const all=await new Promise(ok=>{const keys=[];const c=db.transaction(['meta'],'readonly').objectStore('meta').openCursor();
        c.onsuccess=e=>{const x=e.target.result;if(!x)return ok(keys);if(String(x.key).startsWith('account:'))keys.push(x.key);x.continue();};});
      db.close();
      const snap=await browser.runtime.sendMessage({type:'GET_SNAPSHOT'});
      const p=snap.state.profiles['CTX'];
      return {bound:row.account.boundPrincipal,binding:row.account.bindingId,prior:row.account.upgrade.priorExitHistory,
        accounts:all.length,tag:p.pcmsBindingId,route:p.routeId,personas:Object.values(snap.state.profiles)
          .filter(x=>x.personaUid==='UID').length};""".replace('CTX',made['contextId']).replace('UID',made['personaUid']))
    assert stored['bound']=='c'*64 and stored['tag']==stored['binding'],stored
    assert stored['prior']=='UNOBSERVED' and stored['route']=='ci-s01-http' and stored['personas']==1,stored
    print('B S01_LEGACY_ACCOUNT_UPGRADED_IN_PLACE_SAME_ID_PERSONA_PRINCIPAL_REVISION=PASS',flush=True)
    seen=len(oracle.seen)
    _options(session,uuid,"""
      await browser.tabs.create({url:'http://s01-oracle.example/legacy-after',cookieStoreId:'CTX',active:false});
      await new Promise(r=>setTimeout(r,4000));return {ok:true};""".replace('CTX',made['contextId']))
    assert not any(p.endswith('/legacy-after') for p in oracle.seen[seen:]),oracle.seen
    print('B S01_UPGRADING_LEGACY_PERSONA_BLOCKED_UNTIL_PINNED=PASS',flush=True)
    # C-58 Archive: give both Personas their own Mullvad route resource (no
    # native host in CI), keep a human tab in one, then archive both.
    prepared=_options(session,uuid,"""
      let snap=await send({type:'GET_SNAPSHOT'});
      const state=structuredClone(snap.state);
      for(const [id,host] of [['ci-s01-mv-a','10.124.0.91'],['ci-s01-mv-b','10.124.0.92']])
        state.routes[id]={id,name:id,provider:'mullvad',type:'socks',host,port:1080,proxyDNS:true,enabled:true};
      const preview=await send({type:'PREVIEW_STATE_CHANGE',state});
      await send({type:'AUTHORIZE_SECURITY_PREVIEW',previewId:preview.previewId,approvedDelta:preview.delta});
      await send({type:'COMMIT_STATE_PREVIEW',authorizationId:preview.previewId});
      snap=await send({type:'GET_SNAPSHOT'});
      const added=Object.values(snap.state.profiles).find(p=>p.pcmsBindingId&&p.containerId!=='CTX');
      for(const t of await browser.tabs.query({cookieStoreId:'CTX'}))await browser.tabs.remove(t.id);
      await send({type:'UPDATE_PROFILE_ROUTE',profileId:added.containerId,routeId:'ci-s01-mv-a'});
      await send({type:'UPDATE_PROFILE_ROUTE',profileId:'CTX',routeId:'ci-s01-mv-b'});
      await browser.tabs.create({url:'about:blank',cookieStoreId:added.containerId,active:false});
      return {added:added.containerId};""".replace('CTX',made['contextId']))
    # The account port trusts only the PCMS page sender: return there first.
    call('POST',f'/session/{session}/url',{'url':f'moz-extension://{uuid}/pcms/index.html#accounts'})
    rev=lambda i:next(a for a in account_command(session,{'type':'LIST_ACCOUNTS'})['accounts'] if a['accountId']==i)['revision']
    busy=account_command(session,{'type':'ARCHIVE','params':{'accountId':added_id,'expectedRevision':rev(added_id)}})
    assert busy.get('ok') is True and busy.get('release')=='RELEASE_DEFERRED',busy
    idle=account_command(session,{'type':'ARCHIVE','params':{'accountId':'legacy_account_ci01','expectedRevision':rev('legacy_account_ci01')}})
    assert idle.get('ok') is True and idle.get('release') in ('RELEASE_UNCONFIRMED','RELEASED'),idle
    after=account_command(session,{'type':'LIST_ACCOUNTS'})['accounts']
    states={a['accountId']:(a['state'],a.get('route',{}).get('status'),a.get('route',{}).get('code')) for a in after}
    assert states[added_id]==('ARCHIVED','RELEASE_DEFERRED','RESOURCE_IN_USE'),states
    assert states['legacy_account_ci01'][0]=='ARCHIVED',states
    kept=_options(session,uuid,"""
      const snap=await send({type:'GET_SNAPSHOT'});
      return {tagged:Object.values(snap.state.profiles).filter(p=>p.pcmsBindingId).length,
        routes:['ci-s01-mv-a','ci-s01-mv-b'].filter(id=>snap.state.routes[id]).length};""")
    assert kept=={'tagged':2,'routes':2},kept
    print('B S01_ARCHIVE_DEFERS_IN_USE_RELEASE_AND_RELEASES_IDLE_VIA_DONOR=',states['legacy_account_ci01'][1],flush=True)


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
        old_daemon=None
        server=subprocess.Popen([str(driver),'--port',str(PORT),'--allow-system-access'],stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
        try:
            for _ in range(80):
                try:
                    with urlopen(HOST+'/status',timeout=1) as s:
                        if json.load(s).get('value',{}).get('ready'): break
                except Exception: time.sleep(.25)
            else: raise RuntimeError('geckodriver did not become ready')
            first=open_session(browser,profile)
            original_firefox_pids=owned_firefox_pids(profile)
            assert original_firefox_pids,'S01_FIRST_FIREFOX_PROCESS_NOT_OBSERVED'
            try:
                installed=call('POST',f'/session/{first}/moz/addon/install',{'path':str(archive),'temporary':False},timeout=45)
                assert installed == ID, f'Unexpected installed add-on ID {installed}'
                print('B INSTALLED_ADDON_ID=',installed,flush=True)
            finally: close(first)
            require_owned_exit(profile,original_firefox_pids)
            # The same original-profile process must actually be dead before
            # reusing the persisted XPI profile in a NEW process.
            after=open_session(browser,profile)
            restarted_firefox_pids=owned_firefox_pids(profile)
            assert restarted_firefox_pids,'S01_RESTART_FIREFOX_NOT_OBSERVED'
            assert not restarted_firefox_pids.intersection(original_firefox_pids),(
                'S01_OS_PROCESS_ID_REUSED_OR_NOT_TERMINATED')
            print('H S01_OWNED_OS_FIREFOX_EXIT_RELAUNCH=PASS; old_count=',
                  len(original_firefox_pids),'new_count=',len(restarted_firefox_pids),
                  flush=True)
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
                guard=wait_donor_ready(after)
                assert guard and guard.get('phase')=='I01',f'Missing I01 wake status: {guard}'
                assert guard.get('providerEffects')=='OFF',guard
                canonical=canonical_command(after,{'type':'SUMMARY'})
                assert canonical.get('ok') is True and canonical.get('storage')=='READY',canonical
                assert canonical.get('providerEffects')=='OFF',canonical
                s00_intent={'intentId':'intent_s00_browser_001',
                    'slug':'s00-local-fixture','origin':'OPERATOR'}
                s00_first=coordinator_command(after,{'type':'ACCEPT_CREATE_INTENT',
                    'params':s00_intent})
                assert s00_first.get('ok') is True and s00_first.get('record',{}).get('state')=='WAITING_CAPABILITY',s00_first
                s00_repeat=coordinator_command(after,{'type':'ACCEPT_CREATE_INTENT',
                    'params':s00_intent})
                assert s00_repeat.get('duplicate') is True,s00_repeat
                s00_hold=coordinator_command(after,{'type':'ADVANCE_CREATE_INTENT',
                    'params':{'intentId':s00_intent['intentId'],'expectedRevision':1}})
                assert s00_hold.get('ok') is True and s00_hold.get('admitted') is False,s00_hold
                assert s00_hold.get('providerEffects')=='OFF',s00_hold
                s00_denied=coordinator_command(after,{'type':'ACCEPT_CREATE_INTENT',
                    'params':{'intentId':'intent_s00_forbidden_001',
                    'slug':'pcms-test-esr-chain-20261015-a01','origin':'OPERATOR'}})
                assert s00_denied.get('code')=='I17_ORIGINAL_EFFECT_QUARANTINED',s00_denied
                print('B S00_INSTALLED_CANONICAL_INTENT_AND_QUARANTINE=PASS',flush=True)
                personas=account_command(after,{'type':'LIST_PERSONAS'})
                assert personas.get('ok') is True and isinstance(personas.get('personas'),list),personas
                records=account_command(after,{'type':'LIST_ACCOUNTS'})
                assert records.get('ok') is True and records.get('accounts')==[],records
                network=account_command(after,{'type':'NETWORK_STATUS'})
                assert network.get('ok') is True,network
                assert network.get('revision')==0 and network.get('ownedExits')==0,network
                assert network.get('reservations')==0,network
                assert network.get('admission')=='PER_ACCOUNT_ROUTE_PIN',network
                assert network.get('pins',{}).get('active')==0,network
                print('B S01_INSTALLED_CANONICAL_EXIT_LEDGER_EMPTY_PIN_TABLE=PASS',flush=True)
                assert execute(after,"return !!document.getElementById('pcms-check-native-witness')") is True
                witness=account_command(after,{'type':'WITNESS_STATUS'})
                assert witness.get('ok') in (False,True),witness
                if witness.get('ok'):
                    assert witness.get('qualifiedTime') is False,witness
                    assert witness.get('capability')=='READ_ONLY_NATIVE_PAIR',witness
                else:
                    assert witness.get('code') in (
                        'NATIVE_WITNESS_UNAVAILABLE','NATIVE_WITNESS_UNQUALIFIED'),witness
                print('B S01_EXPLICIT_SAME_XPI_NATIVE_WITNESS_DIAGNOSTIC_NO_CREDIT=PASS',flush=True)
                denied_enroll=account_command(after,{'type':'ENROLL','params':{
                    'accountId':'fixture_forbidden_a01','personaUid':'persona-aaaa-0001','expectedRevision':0}})
                assert denied_enroll.get('code')=='COMMAND_NOT_ALLOWED',denied_enroll
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
                assert scoped.get('rotateDenied',{}).get('code')=='IDENTITY_CHANGED',scoped
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
                s00_after_wake=coordinator_command(after,{'type':'GET_CREATE_INTENT',
                    'params':{'intentId':'intent_s00_browser_001'}})
                assert s00_after_wake.get('ok') is True,s00_after_wake
                assert s00_after_wake.get('record',{}).get('state')=='WAITING_CAPABILITY',s00_after_wake
                assert s00_after_wake.get('record',{}).get('revision')==1,s00_after_wake
                print('B S00_INSTALLED_COLD_WAKE_PERSISTED_HELD_INTENT=PASS',flush=True)
                call('POST',f'/session/{after}/url',{'url':url+'#accounts'})
                view=execute(after,"return {selected:[...document.querySelectorAll('[data-view]')].filter(x=>!x.hidden).map(x=>x.dataset.view),active:document.querySelector('[aria-current=page]')?.dataset.workspace,blocked:document.querySelector('#pcms-persona-picker')===null,refresh:document.querySelector('#pcms-refresh-accounts')?.disabled}")
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
                assert set(safe)=={'schema','phase','effects','sections','wake','refresher'},safe
                assert set(safe['refresher'])=={'mode','mutations','turns','reads','queuePeak','readPeak','unknownIntervals','alarmHeld','code'},safe
                assert safe['refresher']['mode']=='SHADOW_ONLY' and safe['refresher']['mutations']==0,safe
                assert safe['refresher']['readPeak']<=2,safe
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
                  const recoveredAgain=await store.recoverNative();
                  const afterAgain=await store.getJob('i10-b-private');
                  const session='1'.repeat(64);
                  const greetingOnly=await store.observeNative('i10-b-private',
                    after.revision,{ok:true,slug:'i10-b-private',busy:false,
                    sessionDigest:session,chatEntries:1,sourceSaved:true});
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
                    recovered.ok&&recovered.held>=1&&
                    recoveredAgain.ok&&recoveredAgain.held===0&&
                    afterAgain.revision===after.revision&&
                    greetingOnly.code==='AI_SESSION_UNVERIFIED'&&
                    busy.ok&&idle.ok&&
                    full.ok&&stored.job.finalSource.blobs.length===3&&
                    stored.job.chat1.tests&&
                    stored.job.sourceFingerprint===snapshot.fingerprint&&
                    stored.job.state==='TESTS_UNVERIFIED'&&
                    denied.ok!==true,armed,repeat,recovered,denied,
                    greetingOnly,recoveredAgain,afterAgainRevision:afterAgain.revision,
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
                # I10 B: synthetic *real canonical IDB* one-repair convergence
                # with independent F1 FAIL / F2 PASS; no Perchance request.
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const journal=await import('./journal.mjs');
                  const core=await import('./staging-core.mjs');
                  const {createAiStore}=await import('./ai-store.mjs');
                  const b64=t=>btoa(String.fromCharCode(...new TextEncoder().encode(t)));
                  const A=await core.exactSource([
                    {path:'main.pjs',base64:b64('output = 1')},
                    {path:'index.html',base64:b64('<b>failed before repair</b>')}
                  ]);
                  const F=await core.exactSource([
                    {path:'main.pjs',base64:b64('output = 2')},
                    {path:'index.html',base64:b64('<b>observed after repair</b>')},
                    {path:'src/new.dat',base64:btoa(String.fromCharCode(0,255,8))}
                  ]);
                  const db=await journal.openCanonicalDatabase(),store=createAiStore(db);
                  const slug='i10-convergence',sid='f'.repeat(64);
                  const prepared=await store.start({
                    slug,revision:2,state:'SOURCE_VERIFIED',accountId:'i10-convergence-owner',
                    candidate:{fingerprint:A.fingerprint},previous:{fingerprint:'b'.repeat(64)}
                  });
                  const sent=await store.armNative(slug,prepared.revision,'CHAT1_SEND');
                  const seen=await store.observeNative(slug,sent.revision,{
                    ok:true,slug,sessionDigest:sid,busy:false,chatEntries:2,sourceSaved:true
                  });
                  const sourceA=await store.checkpointSource(slug,seen.revision,A);
                  const failed=await store.record(slug,sourceA.revision,{
                    type:'TEST',chat:1,name:'observed_smoke',
                    sourceFingerprint:A.fingerprint,independentSource:'INDEPENDENT_BROWSER_ASSERTION',
                    result:'FAIL',observedAt:Date.now()
                  });
                  const repair=await store.armNative(slug,failed.revision,'CHAT1_REPAIR');
                  const repaired=await store.observeNative(slug,repair.revision,{
                    ok:true,slug,sessionDigest:sid,busy:false,chatEntries:4,sourceSaved:true
                  });
                  const sourceF=await store.checkpointSource(slug,repaired.revision,F);
                  const oldResult=await store.record(slug,sourceF.revision,{
                    type:'TEST',chat:1,name:'observed_smoke',
                    sourceFingerprint:A.fingerprint,independentSource:'INDEPENDENT_BROWSER_ASSERTION',
                    result:'PASS',observedAt:Date.now()
                  });
                  const pass=await store.record(slug,sourceF.revision,{
                    type:'TEST',chat:1,name:'observed_smoke',
                    sourceFingerprint:F.fingerprint,independentSource:'INDEPENDENT_BROWSER_ASSERTION',
                    result:'PASS',observedAt:Date.now()
                  });
                  const noRepair=await store.armNative(slug,pass.revision,'CHAT1_REPAIR');
                  const recheck=await store.checkpointSource(slug,pass.revision,F);
                  const final=await store.getJobFull(slug);
                  done({ok:A.ok&&F.ok&&prepared.ok&&sent.ok&&seen.ok&&sourceA.ok&&
                    failed.state==='KNOWN_FAILURE'&&repair.ok&&repaired.ok&&
                    sourceF.ok&&sourceF.state==='TESTS_UNVERIFIED'&&
                    oldResult.code==='INDEPENDENT_TEST_EVIDENCE_REQUIRED'&&
                    pass.ok&&pass.state==='TESTS_VERIFIED'&&
                    pass.slotReleased===true&&
                    noRepair.code==='AI_VERIFIED_FAILURE_AND_SESSION_REQUIRED'&&
                    recheck.ok&&recheck.state==='TESTS_VERIFIED'&&
                    final.ok&&final.job.sourceFingerprint===F.fingerprint&&
                    final.job.finalSource.files.length===3&&
                    final.job.chat1.tests.observed_smoke?.sourceFingerprint===F.fingerprint&&
                    final.job.executionSlotReleased===true,
                    failed:failed.state,sourceF:sourceF.state,oldResult,
                    after:pass.state,noRepair,rechecked:recheck.state});
                  db.close();
                })().catch(e=>done({error:String(e),stack:e?.stack?.slice(0,500)}));"""
                convergence_b=call('POST',f'/session/{after}/execute/async',
                                    {'script':code,'args':[]},timeout=90)
                assert convergence_b.get('ok') is True,convergence_b
                print('B I10_PACKAGED_SYNTHETIC_F1_FAIL_F2_ASSET_REPAIR_RETEST=PASS',flush=True)

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
                # I10 B: real canonical IDB persists scheduler admission clock,
                # CAS deferral and previous uncertain native state across
                # closing/reopening DB handles, without any provider effect.
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const journal=await import('./journal.mjs');
                  const {createAiStore}=await import('./ai-store.mjs');
                  const db=await journal.openCanonicalDatabase();
                  const store=createAiStore(db);
                  const original=await store.getJobFull('i10-slot-d');
                  const created=original.job?.createdAt;
                  const until=Date.now()+120000;
                  const deferred=await store.deferScheduler('i10-slot-d',
                    original.job.revision,until,'AI_WAKE_ROUTE_UNVERIFIED');
                  const stale=await store.deferScheduler('i10-slot-d',
                    original.job.revision,until,'AI_WAKE_ROUTE_UNVERIFIED');
                  db.close();
                  const secondDb=await journal.openCanonicalDatabase();
                  const readback=await createAiStore(secondDb).getJobFull('i10-slot-d');
                  done({ok:original.ok&&Number.isSafeInteger(created)&&created>0&&
                    deferred.ok&&stale.code==='STALE_REVISION'&&
                    readback.ok&&readback.job.schedulerDeferredUntil===until&&
                    readback.job.schedulerHold==='AI_WAKE_ROUTE_UNVERIFIED'&&
                    readback.job.createdAt===created&&
                    !readback.job.native&&
                    readback.job.executionSlotReleased!==true&&
                    readback.job.sourceFingerprint===original.job.sourceFingerprint,
                    created,deferred,stale,persisted:readback.job.schedulerDeferredUntil,
                    native:readback.job.native});
                  secondDb.close();
                })().catch(e=>done({error:String(e),stack:e?.stack?.slice(0,400)}));"""
                deferral_b=call('POST',f'/session/{after}/execute/async',
                                {'script':code,'args':[]},timeout=90)
                assert deferral_b.get('ok') is True,deferral_b
                print('B I10_PACKAGED_SCHEDULER_DURABLE_DEFERRAL_CAS=PASS',flush=True)
                # B verified XPI parser/registry; no provider interaction.
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const oracle=await import('./perchance-ai-oracle.mjs');
                  const testing=await import('./ai-testing.mjs');
                  const ok=testing.pinTestingAssertions('PCMS_TEST: preview_heading_visible\\nPCMS_TEST: preview_image_loaded');
                  const extra=testing.pinTestingAssertions('PCMS_TEST: preview_button_visible\\nCheck business rules manually.');
                  done({ok:ok.ok&&ok.tests.join('|')==='preview_heading_visible|preview_image_loaded'&&
                    oracle.AI_BROWSER_ASSERTIONS.length===5&&extra.ok&&
                    extra.tests.includes('optional_generator_tests'),
                    parsed:ok,extra});
                })().catch(e=>done({error:String(e)}));"""
                check_assertions=call('POST',f'/session/{after}/execute/async',
                                      {'script':code,'args':[]},timeout=90)
                assert check_assertions.get('ok') is True,check_assertions
                print('B I10_PACKAGED_NAMED_ASSERTIONS_AND_PROSE_HOLD=PASS',flush=True)

                # I10 B: installed XPI imports the read-only OPFS inspector,
                # and the trusted page cannot impersonate a provider editor.
                # No live OPFS/server state is accessed by this negative.
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const {perchanceAiOpfsProbe}=await import('./perchance-ai-opfs.mjs');
                  const invalid=await perchanceAiOpfsProbe({
                    slug:'private-opfs',nonce:'f'.repeat(32)
                  });
                  const bad=await perchanceAiOpfsProbe({
                    slug:'private-opfs',nonce:'0'
                  });
                  done({ok:invalid.code==='WORKSPACE_EDITOR_CHANGED'&&
                    invalid.isolation==='UNVERIFIED'&&
                    bad.code==='WORKSPACE_REQUEST_INVALID'&&
                    bad.isolation==='UNVERIFIED',
                    invalid,bad});
                })().catch(e=>done({error:String(e)}));"""
                opfs_b=call('POST',f'/session/{after}/execute/async',
                            {'script':code,'args':[]},timeout=90)
                assert opfs_b.get('ok') is True,opfs_b
                print('B I10_PACKAGED_OPFS_LOCAL_PROBE_WRONG_ORIGIN_HOLD=PASS',flush=True)
                # I10 B: both halves of the history boundary really ship in
                # the installed XPI, and wrong-origin browser code cannot
                # extract credentials or perform an external history fetch.
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const m=await import('./perchance-ai-history.mjs');
                  const nonce='f'.repeat(32);
                  const main=await m.perchanceAiHistoryCredentials({
                    slug:'private-owned',nonce});
                  const read=await m.perchanceAiHistoryIsolated({
                    slug:'private-owned',nonce,sessionId:'session-opaque-01234567',
                    routingKey:'1234.safefake',sessionDigest:'a'.repeat(64),
                    firstPrompt:'Test T1'});
                  done({ok:main.code==='AI_HISTORY_WRONG_EDITOR'&&
                    read.code==='AI_HISTORY_WRONG_EDITOR'&&
                    JSON.stringify({main,read}).indexOf('session-opaque')===-1,
                    main,read});
                })().catch(e=>done({error:String(e)}));"""
                history_b=call('POST',f'/session/{after}/execute/async',
                                 {'script':code,'args':[]},timeout=90)
                assert history_b.get('ok') is True,history_b
                print('B I10_PACKAGED_ISOLATED_HISTORY_WRONG_ORIGIN_GUARD=PASS',flush=True)


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
                  const pendingAttachment=await store.observeNative(slug,reset.revision,{
                    ok:true,slug,sessionDigest:null,busy:false,chatEntries:1,
                    resetGreetingVisible:true,inputOccupied:false,hasQueue:false,
                    attachmentsPending:true,sourceSaved:true
                  });
                  const empty=await store.observeNative(slug,reset.revision,{
                    ok:true,slug,sessionDigest:null,busy:false,chatEntries:1,
                    resetGreetingVisible:true,inputOccupied:false,hasQueue:false,
                    attachmentsPending:false,sourceSaved:true
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
                    pendingAttachment.code==='AI_CHAT2_RESET_NOT_PROVEN'&&
                    empty.ok&&send2.ok&&idle2.ok&&
                    sid1!==sid2&&saved2.evidence?.chat1Pass===false&&
                    saved2.evidence?.state==='TESTS_UNVERIFIED'&&
                    planned1.type==='RUN_TESTS'&&planned1.chat===1&&
                    replay1.ok&&planned2.type==='VERIFY_FRESH_CHAT2'&&
                    planned2.effect==='GATED_READ_ONLY_HISTORY'&&
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
                # I10 B: positive *synthetic* canonical revision-checked fresh
                # Chat2 history+OPFS witness and negative forged/stale receipts.
                # Executes in the real packaged extension and IndexedDB.
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const db=await (await import('./journal.mjs')).openCanonicalDatabase();
                  const store=(await import('./ai-store.mjs')).createAiStore(db);
                  const exact=(await import('./staging-core.mjs')).exactSource;
                  const source=await exact([
                    {path:'main.pjs',base64:btoa('output = 42')},
                    {path:'index.html',base64:btoa('<p>verified</p>')}
                  ]);
                  const slug='i10-positive-chat2',a='a'.repeat(64),b='b'.repeat(64);
                  const created=await store.start({slug,accountId:'i10-positive-owner',
                    state:'SOURCE_VERIFIED',revision:1,
                    candidate:{fingerprint:source.fingerprint},
                    previous:{fingerprint:'f'.repeat(64)}},
                    {sha256:'c'.repeat(64),text:'Pinned T1',
                      tests:['default_generator_smoke']});
                  const send=await store.armNative(slug,created.revision,'CHAT1_SEND');
                  const s1=await store.observeNative(slug,send.revision,{
                    ok:true,slug,sessionDigest:a,busy:false,chatEntries:2,sourceSaved:true});
                  const save=await store.checkpointSource(slug,s1.revision,source);
                  const full=await store.getJobFull(slug);
                  const test=(rev,chat)=>store.record(slug,rev,{type:'TEST',chat,
                    name:chat===1?full.job.prompt.tests[0]:'default_generator_smoke',
                    sourceFingerprint:source.fingerprint,
                    independentSource:'INDEPENDENT_BROWSER_ASSERTION',
                    result:'PASS',observedAt:Date.now()});
                  const first=await test(save.revision,1);
                  const reset=await store.armNative(slug,first.revision,'CHAT2_RESET');
                  const clear=await store.observeNative(slug,reset.revision,{
                    ok:true,slug,sessionDigest:null,busy:false,chatEntries:1,
                    resetGreetingVisible:true,inputOccupied:false,hasQueue:false,
                    attachmentsPending:false,sourceSaved:true});
                  const ask=await store.armNative(slug,clear.revision,'CHAT2_SEND');
                  const s2=await store.observeNative(slug,ask.revision,{
                    ok:true,slug,sessionDigest:b,busy:false,chatEntries:2,sourceSaved:true});
                  const final=await store.checkpointSource(slug,s2.revision,source);
                  const hist={ok:true,code:'AI_SERVER_HISTORY_FIRST_PROMPT_OBSERVED',
                    serverHistory:'FIRST_USER_IS_T1',sessionDigest:b};
                  const opfs={ok:true,isolation:'UNVERIFIED',
                    workspaceRootState:'PRESENT_UNTRUSTED',
                    workerNamespace:'CURRENT_SESSION_WORKER_INIT_LOCK',
                    sessionDigest:b};
                  const missing=await store.verifySecondChat(slug,final.revision,
                    hist,{...opfs,workspaceRootState:'ABSENT'});
                  const forged=await store.verifySecondChat(slug,final.revision,
                    {...hist,sessionDigest:a},opfs);
                  const onlyFolder=await store.verifySecondChat(slug,final.revision,
                    hist,{...opfs,workerNamespace:'UNVERIFIED'});
                  const permitted=await store.verifySecondChat(slug,final.revision,hist,opfs);
                  const stale=await store.verifySecondChat(slug,final.revision,hist,opfs);
                  const second=await test(permitted.revision,2);
                  const job=await store.getJob(slug);
                  done({ok:created.ok&&send.ok&&s1.ok&&save.ok&&first.ok&&
                    reset.ok&&clear.ok&&ask.ok&&s2.ok&&final.ok&&
                    missing.code==='AI_FRESH_CHAT_EVIDENCE_UNVERIFIED'&&
                    forged.code==='AI_FRESH_CHAT_EVIDENCE_UNVERIFIED'&&
                    onlyFolder.code==='AI_FRESH_CHAT_EVIDENCE_UNVERIFIED'&&
                    permitted.ok&&permitted.chat2IsolationVerified===true&&
                    stale.code==='STALE_REVISION'&&second.ok&&
                    second.state==='TESTS_VERIFIED'&&
                    job.evidence.chat2Pass===true&&job.slotReleased===true,
                    missing,forged,onlyFolder,permitted,stale,second:second.state});
                  db.close();
                })().catch(e=>done({error:String(e),stack:e?.stack?.slice(0,500)}));"""
                chat2_positive=call('POST',f'/session/{after}/execute/async',
                                     {'script':code,'args':[]},timeout=90)
                assert chat2_positive.get('ok') is True,chat2_positive
                print('B I10_PACKAGED_SYNTHETIC_CHAT2_HISTORY_WORKSPACE_CAS_AND_RETEST=PASS',flush=True)


                # I11 B: exact installed-XPI UI controls and real IDB canonical
                # writeback CAS. No real Git or provider effect is attempted.
                call('POST',f'/session/{after}/url',{'url':url+'#work-queue'})
                ui=execute(after,"return {preview:!!document.getElementById('pcms-writeback-preview'),prepare:!!document.getElementById('pcms-writeback-prepare'),commit:!!document.getElementById('pcms-writeback-commit'),reconcile:!!document.getElementById('pcms-writeback-reconcile'),status:!!document.getElementById('pcms-writeback-status'),cancel:!!document.getElementById('pcms-writeback-cancel'),arm:!!document.getElementById('pcms-writeback-arm-auto'),disarm:!!document.getElementById('pcms-writeback-disarm-auto')}")
                assert ui=={'preview':True,'prepare':True,'commit':True,'reconcile':True,'status':True,'cancel':True,'arm':True,'disarm':True},ui
                # Actual installed-XPI button clicks must produce visible
                # responses rather than only existing in the DOM.
                execute(after,"const el=document.getElementById('pcms-writeback-slug');el.value='missing-private';el.dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('pcms-writeback-preview').click();return true")
                preview_result=''
                for _ in range(60):
                    preview_result=execute(after,"return document.getElementById('pcms-writeback-status').textContent")
                    if 'TESTED_FINAL_SOURCE_REQUIRED' in preview_result: break
                    time.sleep(.1)
                assert 'TESTED_FINAL_SOURCE_REQUIRED' in preview_result,preview_result
                execute(after,"document.getElementById('pcms-writeback-disarm-auto').click();return true")
                disarm_result=''
                for _ in range(60):
                    disarm_result=execute(after,"return document.getElementById('pcms-writeback-status').textContent")
                    if 'AUTO_CREDENTIAL_DISARMED' in disarm_result: break
                    time.sleep(.1)
                assert 'AUTO_CREDENTIAL_DISARMED' in disarm_result,disarm_result
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const db=await (await import('./journal.mjs')).openCanonicalDatabase();
                  const store=(await import('./writeback-store.mjs')).createWritebackStore(db);
                  const exact=(await import('./staging-core.mjs')).exactSource;
                  const source=await exact([
                    {path:'main.pjs',base64:btoa('output = 77')},
                    {path:'index.html',base64:btoa('<main>safe</main>')},
                    {path:'src/test.bin',base64:btoa(String.fromCharCode(0,255,2))}
                  ]);
                  const slug='i11-b-synthetic',head='a'.repeat(40);
                  const stage={slug,revision:5,state:'SOURCE_VERIFIED',
                    verifiedAt:1,accountId:'i11-b-account',personaUid:'i11-b-persona',
                    principalFingerprint:'b'.repeat(64),
                    remotePublicId:'i11-b-remote',sourceHead:head,
                    sourceFolder:'gens/i11-b-synthetic',
                    candidate:{fingerprint:source.fingerprint}};
                  const job={slug,revision:3,stageRevision:5,state:'TESTS_VERIFIED',
                    sourceFingerprint:source.fingerprint,verifiedFinal:source.fingerprint,
                    finalSource:{fingerprint:source.fingerprint,files:source.files,
                      blobs:source.blobs},executionSlotReleased:true,
                    native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:'1'.repeat(64)},
                    prompt:{revision:1,tests:['default_generator_smoke']},
                    chat1:{sessionDigest:'1'.repeat(64),
                      tests:{default_generator_smoke:{
                        result:'PASS',sourceFingerprint:source.fingerprint}}},chat2:null,
                    changes:[]};
                  await new Promise((resolve,reject)=>{
                    const tx=db.transaction(['meta'],'readwrite');
                    tx.objectStore('meta').put({key:'stage:'+slug,record:stage});
                    tx.objectStore('meta').put({key:'ai-job:'+slug,accountId:stage.accountId,job});
                    tx.oncomplete=resolve;tx.onabort=()=>reject('ABORT');
                  });
                  const before=await store.settings();
                  const auto=await store.changeSettings(before.setting.revision,true);
                  const wrong=await store.changeSettings(before.setting.revision,false);
                  const prepared=await store.prepare({name:slug,stage,job,
                    probe:{head,baseHead:head,folder:stage.sourceFolder},mode:'AUTO',
                    message:'fix: exact synthetic',operationId:'writeback_'+'1'.repeat(32)});
                  const disabled=await store.changeSettings(auto.setting.revision,false);
                  const revoked=await store.arm(slug,prepared.revision);
                  const still=await store.get(slug);
                  // Off-by-default canonical port does not allow Git mutation.
                  const ask=(type,params)=>new Promise((resolve)=>{
                    const port=browser.runtime.connect({name:'pcms-i11-writeback'});
                    port.onMessage.addListener(v=>{resolve(v);port.disconnect();});
                    port.postMessage({type,params});
                  });
                  const effect=await ask('COMMIT',{slug,expectedRevision:prepared.revision,
                    token:'test-github-write-token'});
                  const secondSlug='i11-b-replay';
                  const stage2={...stage,slug:secondSlug,sourceFolder:'gens/i11-b-replay'};
                  const job2={...job,slug:secondSlug};
                  await new Promise((resolve,reject)=>{
                    const tx=db.transaction(['meta'],'readwrite');
                    tx.objectStore('meta').put({key:'stage:'+secondSlug,record:stage2});
                    tx.objectStore('meta').put({key:'ai-job:'+secondSlug,accountId:stage2.accountId,job:job2});
                    tx.oncomplete=resolve;tx.onabort=()=>reject('ABORT');
                  });
                  const prepared2=await store.prepare({name:secondSlug,
                    stage:stage2,job:job2,
                    probe:{head,baseHead:head,folder:stage2.sourceFolder},
                    mode:'MANUAL',message:'fix: synthetic safe',
                    operationId:'writeback_'+'2'.repeat(32)});
                  const sealed=(await store.getFull(secondSlug)).record.sealedSource;
                  const sealedExact=sealed?.fingerprint===source.fingerprint&&
                    JSON.stringify(sealed.blobs)===JSON.stringify(source.blobs)&&
                    JSON.stringify(sealed.files)===JSON.stringify(source.files);
                  const armed2=await store.arm(secondSlug,prepared2.revision);
                  const duplicate2=await store.arm(secondSlug,armed2.revision);
                  const reboot2=await store.get(secondSlug);
                  const reopened=await (await import('./journal.mjs')).openCanonicalDatabase();
                  const persisted=await (await import('./writeback-store.mjs')).createWritebackStore(reopened).get(slug);
                  const canceled=await store.cancelPrepared(slug,persisted.revision);
                  const repeatCancel=await store.cancelPrepared(slug,canceled.revision);
                  const reprepared=await store.prepare({name:slug,stage,job,
                    probe:{head,baseHead:head,folder:stage.sourceFolder},
                    mode:'MANUAL',message:'fix: new explicit review',
                    operationId:'writeback_'+'3'.repeat(32)});
                  const persistedFull=(await (await import('./writeback-store.mjs')).createWritebackStore(reopened).getFull(secondSlug)).record;
                  const sealedSurvivesRestart=JSON.stringify(persistedFull.sealedSource)===
                    JSON.stringify(sealed);
                  done({ok:source.ok&&before.ok&&auto.ok&&wrong.code==='STALE_REVISION'&&
                    prepared.ok&&disabled.ok&&
                    revoked.code==='WRITEBACK_ADMISSION_REVOKED'&&
                    still.state==='PREPARED'&&persisted.state==='PREPARED'&&
                    effect.code==='GIT_AUTO_DISARMED'&&
                    prepared2.ok&&armed2.state==='DISPATCH_POSSIBLE'&&
                    duplicate2.code==='WRITEBACK_RECONCILIATION_REQUIRED'&&
                    reboot2.state==='DISPATCH_POSSIBLE'&&
                    sealedExact&&sealedSurvivesRestart&&
                    canceled.state==='CANCELED'&&
                    repeatCancel.code==='CANNOT_CANCEL_POSSIBLE_GIT_EFFECT'&&
                    reprepared.state==='PREPARED'&&
                    reprepared.revision===canceled.revision+1,
                    prepared,wrong,revoked,still,persisted,effect});
                  reopened.close();db.close();
                })().catch(e=>done({error:String(e),stack:e?.stack?.slice(0,400)}));"""
                proof=call('POST',f'/session/{after}/execute/async',
                           {'script':code,'args':[]},timeout=90)
                assert proof.get('ok') is True,proof
                print('B I11_PACKAGED_GIT_HELD_CAS_AUTO_OPTOUT_AND_UI=PASS',flush=True)

                # I12 real packaged modules/IDB, synthetic provider evidence.
                # Synthetic CONFIRMED_PUBLIC fixtures do not prove a live release.
                call('POST',f'/session/{after}/url',{'url':url+'#refresher'})
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const journal=await import('./journal.mjs');
                  const core=await import('./refresher-core.mjs');
                  const module=await import('./refresher-store.mjs');
                  const runtime=await import('./refresher-boundary.mjs');
                  const db=await journal.openCanonicalDatabase(),store=module.createRefresherStore(db);
                  const hash='b'.repeat(64),now=Date.now()+60000,boot='i12_packaged_synthetic_boot';
                  const begin=performance.now();
                  await new Promise((resolve,reject)=>{
                    const tx=db.transaction(['meta'],'readwrite'),m=tx.objectStore('meta');
                    for(let i=0;i<50;i++){
                      const accountId='i12_account_'+String(i).padStart(4,'0');
                      const personaUid='persona-i12-'+String(i).padStart(4,'0');
                      m.put({key:'account:'+accountId,account:{accountId,personaUid,bindingVersion:1,
                        state:'VERIFIED',revision:1,identity:{source:'GUARDED_SESSION_READBACK',
                        bindingVersion:1,principalFingerprint:hash}}});
                    }
                    for(let i=0;i<1250;i++){
                      const slug='i12-b-'+String(i).padStart(4,'0'),a=i%50;
                      const accountId='i12_account_'+String(a).padStart(4,'0');
                      const personaUid='persona-i12-'+String(a).padStart(4,'0');
                      const remoteId='i12_remote_'+String(i).padStart(8,'0');
                      m.put({key:'inventory:'+slug,generator:{slug,accountId,personaUid,bindingVersion:1,
                        remoteId,ownerState:'OBSERVED_OWNER',visibility:'PUBLIC',lastObservedAt:now,revision:1}});
                      m.put({key:'release:'+slug,release:{slug,accountId,personaUid,bindingVersion:1,
                        remoteId,state:'CONFIRMED_PUBLIC',source:'INDEPENDENT_PUBLICATION_READBACK',
                        sourceFingerprint:hash,principalFingerprint:hash,observationId:'i12_observed_'+String(i).padStart(8,'0'),
                        observedAt:now}});
                    }
                    m.put({key:core.REFRESHER_KEY,state:core.emptyShadow()});
                    tx.oncomplete=resolve;tx.onabort=()=>reject(Error('fixture aborted'));
                  });
                  let turn=await store.turn({now:now-8*core.HOUR,bootId:boot});
                  if(!turn.ok)throw Error(turn.code);
                  let state=turn.state;
                  const first=state.rows.find(r=>r.slug==='i12-b-0000');
                  const second=state.rows.find(r=>r.slug==='i12-b-0001');
                  first.phase='ACTIVE';first.slot=true;first.activeRemaining=24*core.HOUR;
                  first.admittedAt=now-8*core.HOUR;first.checkpoint=now-8*core.HOUR;
                  second.phase='SLEEPING';second.sleepRemaining=72*core.HOUR;
                  await new Promise((resolve,reject)=>{
                    const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put({key:core.REFRESHER_KEY,state});
                    tx.oncomplete=resolve;tx.onabort=()=>reject(Error('seed aborted'));
                  });
                  const receipt={source:'GUARDED_OPERATIONAL_INTERVAL',id:'i12_interval_observed',
                    bootId:boot,browserRunning:true,complete:true,from:now-8*core.HOUR,to:now,
                    accounts:Object.entries(state.accounts).map(([accountId,a])=>({accountId,
                      personaUid:a.personaUid,bindingVersion:a.bindingVersion,health:'HEALTHY',protected:true,sessionVerified:true})),
                    witnesses:[0,1].map(i=>({accountId:'witness_'+i,domain:'independent_'+i,
                      routeVerified:true,observedAt:now,result:'HEALTHY'}))};
                  turn=await store.turn({now,bootId:boot,receipt});
                  const firstRead=await store.list(now,{query:'i12-b-',limit:25});
                  const exact16=firstRead.items.find(r=>r.slug==='i12-b-0000').activeRemaining;
                  const exact64=firstRead.items.find(r=>r.slug==='i12-b-0001').sleepRemaining;
                  const occupied=firstRead.occupied;
                  await Promise.all([store.turn({now,bootId:boot,receipt}),store.turn({now,bootId:boot,receipt})]);
                  const replay=await store.list(now,{query:'i12-b-',limit:25});
                  const competing=await Promise.all([
                    store.pause(replay.revision,'GLOBAL',null,true),
                    store.changePolicy(replay.revision,{manualCap:5})]);
                  const winners=competing.filter(r=>r.ok).length;
                  const snapshot=await store.read();
                  const transaction=db.transaction('meta','readwrite');
                  transaction.objectStore('meta').put({key:core.REFRESHER_KEY,state:core.emptyShadow()});
                  const abort=await new Promise(resolve=>{transaction.onabort=()=>resolve(true);transaction.abort();});
                  const unchanged=(await store.read()).state.revision===snapshot.state.revision;
                  await store.pause(snapshot.state.revision,'GLOBAL',null,false);
                  const c=await store.claim({kind:'RECENT',now:now+1000,bootId:boot,claimId:'i12_recent_claim'});
                  if(!c.ok)throw Error(c.code);
                  const observed=await store.complete(c.claim.claimId,{ok:true,complete:true,
                    observedAt:c.claim.startedAt,principalFingerprint:c.claim.principalFingerprint,
                    items:[{slug:'i12-b-0000',views:1200}]},now+2000);
                  const afterObservation=await store.list(now+2000,{query:'i12-b-',limit:25});
                  const absent=afterObservation.items.find(r=>r.slug==='i12-b-0001').presence;
                  const metric=afterObservation.items.find(r=>r.slug==='i12-b-0000').metric;
                  let virtualNow=now+3000,requests=0,sequence=0,alarms=new Map();
                  const api={runtime:{id:browser.runtime.id,getURL:browser.runtime.getURL},
                    storage:browser.storage,alarms:{create:async(n,p)=>alarms.set(n,{name:n,...p}),
                      get:async n=>alarms.get(n)}};
                  // Make a recent observation due, keeping request budget shared.
                  const preRuntime=(await store.read()).state;preRuntime.recent.nextDueAt=0;
                  await new Promise((resolve,reject)=>{
                    const tx=db.transaction('meta','readwrite');tx.objectStore('meta').put({key:core.REFRESHER_KEY,state:preRuntime});
                    tx.oncomplete=resolve;tx.onabort=()=>reject(Error('observer seed aborted'));
                  });
                  const service=runtime.createRefresherBoundary(api,{open:async()=>db,
                    clock:()=>virtualNow,newId:()=> 'i12_synthetic_id_'+(++sequence),observationGate:()=>true,
                    guard:()=>({getSafeRouteReadiness:async uid=>({ready:true,cookieStoreId:'synthetic-container-'+uid,routeId:'synthetic-protected-'+uid,healthDomain:'egress_'+uid}),
                      observeMonitoring:async(uid,request)=>{
                        requests++;virtualNow+=1000;
                        const live=(await store.read()).state;
                        const account=Object.values(live.accounts).find(a=>a.personaUid===uid);
                        return request.kind==='RECENT'?{ok:true,complete:true,items:[{slug:'i12-b-0000',views:1207}],
                          principalFingerprint:account.principalFingerprint}:
                          {ok:true,views:777,unit:'VIEWS',source:'GUARDED_READ_ONLY',principalFingerprint:account.principalFingerprint};
                      }})});
                  const runtimeProof=await service.tick();
                  const runtimeState=(await store.read()).state;
                  const isolated=await (await import('./perchance-monitor.mjs')).perchanceMonitorIsolated({kind:'RECENT'});
                  const command=(type,params={})=>new Promise(resolve=>{
                    const port=browser.runtime.connect({name:'pcms-i12-refresher'});
                    port.onMessage.addListener(v=>{resolve(v);port.disconnect();});port.postMessage({type,params});
                  });
                  const injection=await command('GET_REFRESHER',{receipt:{healthy:true}});
                  const activation=await command('OBSERVE_NOW');
                  const view=await command('GET_REFRESHER',{query:'i12-b-',limit:25});
                  const globalPause=await command('SET_PAUSE',{expectedRevision:view.revision,scope:'GLOBAL',paused:true});
                  const invalid=await command('SET_PAUSE',{expectedRevision:view.revision,scope:'GLOBAL',paused:false});
                  done({ok:exact16===16*core.HOUR&&exact64===64*core.HOUR&&
                    firstRead.total===1250&&replay.occupied===occupied&&winners===1&&abort&&unchanged&&
                    observed.accepted&&absent.present===false&&absent.absence==='NOT_A_DELETION'&&metric.views===1200&&
                    runtimeProof.ok&&runtimeProof.observation==='OBSERVED'&&requests===2&&
                    runtimeState.healthIntervals.length>0&&runtimeState.diagnostics.readPeak<=2&&
                    isolated.code==='WRONG_ORIGIN'&&injection.ok===false&&activation.code==='MONITOR_ACTIVATION_HELD'&&
                    globalPause.ok&&invalid.code==='STALE_REVISION',
                    exact16,exact64,occupied,replayOccupied:replay.occupied,winners,abort,unchanged,
                    observation:observed.code,runtimeProof,requests,activation,injection,globalPause,invalid,
                    measurement:{accounts:50,generators:1250,elapsedMs:Math.round(performance.now()-begin),
                      serializedBytes:JSON.stringify(runtimeState).length,queuePeak:runtimeState.diagnostics.queuePeak,
                      readPeak:runtimeState.diagnostics.readPeak},
                    persistedRevision:(await store.read()).state.revision});
                  db.close();
                })().catch(e=>done({error:String(e),stack:e?.stack?.slice(0,600)}));"""
                i12_proof=call('POST',f'/session/{after}/execute/async',{'script':code,'args':[]},timeout=90)
                assert i12_proof.get('ok') is True,i12_proof
                print('B I12_PACKAGED_IDB_INTERVAL_CAS_FLEET_OBSERVER_AND_HELD_PORT=PASS',flush=True)
                print('B I12_PACKAGED_MEASUREMENTS=',json.dumps(i12_proof['measurement']),flush=True)
                execute(after,"location.hash='#refresher';document.getElementById('pcms-refresher-query').value='i12-b-';document.getElementById('pcms-refresher-reload').click();return true")
                ui={}
                for _ in range(60):
                    ui=execute(after,"return {rows:document.querySelectorAll('#pcms-refresher-rows tr').length,summary:document.getElementById('pcms-refresher-summary').textContent,page:document.getElementById('pcms-refresher-page').textContent,pause:document.getElementById('pcms-refresher-global-pause').textContent,unsafe:document.querySelector('#view-refresher > .workspace-head > button').disabled}")
                    if '1250' in ui.get('page','') and ui.get('pause')=='Resume globally': break
                    time.sleep(.1)
                assert ui['rows']==25 and '1250' in ui['page'] and ui['unsafe'] is True,ui
                assert ui['pause']=='Resume globally',ui
                execute(after,"document.querySelector('#pcms-refresher-rows button').click();return true")
                inspector=execute(after,"return {visible:!document.getElementById('pcms-refresher-inspector').hidden,selected:document.getElementById('pcms-refresher-selected').textContent}")
                assert inspector['visible'] and 'i12-b-0000' in inspector['selected'],inspector
                print('B I12_PACKAGED_REFRESHER_PAGING_PAUSE_INSPECTOR=PASS',flush=True)
                alarm_code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const prior=(await browser.storage.local.get('pcmsI12AlarmCount')).pcmsI12AlarmCount||0;
                  await browser.alarms.create('pcms-refresher-turn',{when:Date.now()+6000});
                  done({prior});
                })().catch(e=>done({error:String(e)}));"""
                alarm_prior=call('POST',f'/session/{after}/execute/async',{'script':alarm_code,'args':[]})
                call('POST',f'/session/{after}/url',{'url':'about:blank'})
                time.sleep(9)
                call('POST',f'/session/{after}/url',{'url':url+'#refresher'})
                alarm_after=call('POST',f'/session/{after}/execute/async',{'script':"const done=arguments[arguments.length-1];browser.storage.local.get('pcmsI12AlarmCount').then(v=>done(v.pcmsI12AlarmCount||0));",'args':[]})
                assert alarm_after>alarm_prior['prior'],(alarm_prior,alarm_after)
                print('B I12_REAL_ALARM_WITHOUT_DASHBOARD=PASS',flush=True)
                # Full relaunch of the same persistent installation; no reinstall.
                close(after)
                after=open_session(browser,profile)
                assert addons_uuid(profile)==uuid
                call('POST',f'/session/{after}/url',{'url':url+'#refresher'})
                restart_code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const db=await (await import('./journal.mjs')).openCanonicalDatabase();
                  const state=(await (await import('./refresher-store.mjs')).createRefresherStore(db).read()).state;
                  const alarm=await browser.alarms.get('pcms-refresher-turn');
                  done({paused:state.globalPause,first:state.rows.find(r=>r.slug==='i12-b-0000').activeRemaining,
                    alarm:!!alarm,alarms:(await browser.alarms.getAll()).filter(a=>a.name==='pcms-refresher-turn').length,
                    held:state.accounts['i12_account_0000'].health});db.close();
                })().catch(e=>done({error:String(e)}));"""
                restarted=call('POST',f'/session/{after}/execute/async',{'script':restart_code,'args':[]})
                assert restarted['paused'] is True and restarted['first']==16*3600000,restarted
                assert restarted['alarm'] is True and restarted['alarms']==1,restarted
                assert restarted['held']=='UNKNOWN',restarted
                print('B I12_PERSISTENT_RESTART_BUDGET_PAUSE_SINGLE_ALARM_REPAIR=PASS',flush=True)

                # I14 B: exact installed XPI, canonical CAS holds and
                # operator projection. No fake result can enable real effects.
                call('POST',f'/session/{after}/url',{'url':url+'#refresher'})
                i14_code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const core=await import('./refresher-effect-core.mjs');
                  const journal=await import('./journal.mjs');
                  const db=await journal.openCanonicalDatabase();
                  const store=(await import('./refresher-store.mjs')).createRefresherStore(db);
                  const before=await store.read();
                  const row=before.state.rows[0];
                  const denied=await store.reserveAttempt({stableId:row?.stableId,
                    id:'packaged_test_attempt',now:Date.now(),candidate:null,liveAuthorized:false});
                  const after=await store.read();
                  const port=browser.runtime.connect({name:'pcms-i12-refresher'});
                  port.onMessage.addListener(result=>{
                    done({ok:before.ok&&after.ok&&!denied.ok&&
                      before.revision===after.revision&&
                      before.state.revision===after.state.revision&&
                      result.ok&&result.refreshCapability==='LIVE_REFRESH_OFF_UNTIL_PROVEN'&&
                      core.qualifyRefreshCandidate(null).ok===false,
                      beforeRows:before.state.rows.length,
                      denied:denied.code,capability:result.refreshCapability,
                      response:result,unchanged:before.state.revision===after.state.revision});
                    port.disconnect();db.close();
                  });
                  port.postMessage({type:'GET_REFRESHER',params:{limit:5}});
                })().catch(e=>done({error:String(e),stack:e?.stack?.slice(0,500)}));"""
                i14=call('POST',f'/session/{after}/execute/async',
                         {'script':i14_code,'args':[]},timeout=90)
                assert i14.get('ok') is True,i14
                ui=execute(after,"return {provider:document.getElementById('pcms-refresher-provider')?.textContent||'',summary:document.getElementById('pcms-refresher-summary')?.textContent||''}")
                assert 'mutation disabled' in ui['provider'] and 'visibility-held' in ui['summary'],ui
                print('B I14_PACKAGED_PERSISTENT_IDB_GATED_EFFECTS_AND_REFERSHER_PROOF_UI=PASS',flush=True)

                # I13 B: exact packaged XPI, real IndexedDB atomic approval
                # vs duplicate dispatch, installed operator controls, and
                # independent postrestart uncertainty. No live provider effects.
                call('POST',f'/session/{after}/url',{'url':url+'#work-queue'})
                ui=execute(after,"return {release:!!document.getElementById('pcms-release-preview'),approve:document.getElementById('pcms-release-approve').disabled,dispatch:document.getElementById('pcms-release-dispatch').disabled,resolve:document.getElementById('pcms-release-reconcile').disabled}")
                assert ui=={'release':True,'approve':True,'dispatch':True,'resolve':True},ui
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const journal=await import('./journal.mjs');
                  const stageCore=await import('./staging-core.mjs');
                  const core=await import('./release-core.mjs');
                  const module=await import('./release-store.mjs');
                  const db=await journal.openCanonicalDatabase();
                  const text=s=>btoa(s),slug='i13-fixture-release',fp='e'.repeat(64);
                  const source=await stageCore.exactSource([
                    {path:'main.pjs',base64:text('F source')},
                    {path:'index.html',base64:text('<h1>F</h1>')},
                    {path:'src/binary.bin',base64:btoa(String.fromCharCode(0,255,1))}]);
                  const previous=await stageCore.exactSource([
                    {path:'main.pjs',base64:text('')},
                    {path:'index.html',base64:text('')}]);
                  const stage={slug,accountId:'i13_account_fixture',
                    personaUid:'persona-i13-fixture',bindingVersion:1,
                    accountRevision:4,principalFingerprint:fp,
                    remotePublicId:'public_i13_fixture',revision:2,
                    state:'SOURCE_VERIFIED',verifiedAt:Date.now(),
                    sourceFolder:'gens/i13-fixture-release',testingSha:fp,
                    sourceHead:'f'.repeat(40),nonce:'1'.repeat(32),
                    previous,candidate:source};
                  const job={slug,revision:3,stageRevision:2,
                    sourceFingerprint:source.fingerprint,verifiedFinal:source.fingerprint,
                    finalSource:source,state:'TESTS_VERIFIED',executionSlotReleased:true,
                    prompt:{revision:1,tests:['default_generator_smoke']},
                    native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:fp},
                    chat1:{tests:{default_generator_smoke:{
                      result:'PASS',sourceFingerprint:source.fingerprint}}},chat2:null};
                  const account={accountId:stage.accountId,personaUid:stage.personaUid,
                    bindingVersion:1,revision:4,state:'VERIFIED',
                    identity:{source:'GUARDED_SESSION_READBACK',
                      bindingVersion:1,principalFingerprint:fp}};
                  const inventory={slug,revision:5,accountId:account.accountId,
                    personaUid:stage.personaUid,bindingVersion:1,
                    remoteId:stage.remotePublicId,ownerState:'OBSERVED_OWNER',visibility:'UNLISTED'};
                  await new Promise((resolve,reject)=>{
                    const tx=db.transaction('meta','readwrite'),m=tx.objectStore('meta');
                    m.put({key:'stage:'+slug,record:stage});
                    m.put({key:'ai-job:'+slug,job});
                    m.put({key:'account:'+account.accountId,account});
                    m.put({key:'inventory:'+slug,generator:inventory});
                    tx.oncomplete=resolve;tx.onabort=()=>reject(Error('I13 seed aborted'));
                  });
                  const git={ok:true,testingSha:fp};
                  const approval=core.approvalTuple({slug,stage,job,source,previous,git});
                  const store=module.createReleaseStore(db);
                  const first=await store.approve({approval,stage,job,account,inventory,
                    source,previous,kind:'PRIVATE_NEW',
                    releaseId:'release_'+ 'f'.repeat(32)});
                  const duplicate=await store.approve({approval,stage,job,account,inventory,
                    source,previous,kind:'PRIVATE_NEW',
                    releaseId:'release_'+ 'd'.repeat(32)});
                  const results=await Promise.all([
                    store.markDispatch(slug,first.revision,approval.tuple),
                    store.markDispatch(slug,first.revision,approval.tuple)]);
                  const successes=results.filter(r=>r.ok).length;
                  const advanced=results.find(r=>r.ok);
                  const uncertain=await store.settle(slug,advanced.revision,{
                    proof:{ok:true,source:'INDEPENDENT_PUBLICATION_READBACK',
                      sourceFingerprint:'0'.repeat(64)},
                    reason:'MISMATCH_OR_LOST_ACK'});
                  const retried=await store.markDispatch(slug,uncertain.revision,approval.tuple);
                  const port=browser.runtime.connect({name:'pcms-i13-release'});
                  const delivered=new Promise(resolve=>port.onMessage.addListener(v=>resolve(v)));
                  port.postMessage({type:'GET',params:{slug}});
                  const actual=await delivered;port.disconnect();
                  const restored=await store.get(slug);
                  done({ok:first.ok&&duplicate.code==='EXISTING_RELEASE_REQUIRES_REVIEW'&&
                    successes===1&&uncertain.state==='PUBLICATION_UNCERTAIN'&&
                    retried.ok===false&&restored.revision===uncertain.revision&&
                    actual.state==='PUBLICATION_UNCERTAIN',
                    first,duplicate,successes,uncertain,retried,actual});
                  db.close();
                })().catch(e=>done({error:String(e),stack:e?.stack?.slice(0,600)}));"""
                proof=call('POST',f'/session/{after}/execute/async',
                           {'script':code,'args':[]},timeout=90)
                assert proof.get('ok') is True,proof
                print('B I13_PACKAGED_EXACT_APPROVAL_IDB_CAS_NO_REPLAY_AND_PORT=PASS',flush=True)
                chunk_script="""const done=arguments[arguments.length-1];
                (async()=>{
                  const journal=await import('./journal.mjs');
                  const db=await journal.openCanonicalDatabase();
                  const req=db.transaction('meta','readonly').objectStore('meta').get('stage:i13-fixture-release');
                  const stage=await new Promise(resolve=>req.onsuccess=()=>resolve(req.result?.record));
                  function ask(params){
                    return new Promise(resolve=>{
                      const port=browser.runtime.connect({name:'pcms-i13-release'});
                      port.onMessage.addListener(v=>{resolve(v);port.disconnect();});
                      port.postMessage({type:'GET_REVIEW_CHUNK',params});
                    });
                  }
                  const base={slug:stage.slug,stageRevision:stage.revision,
                    fingerprint:stage.candidate.fingerprint};
                  const root=await ask({...base,origin:'F',path:'main.pjs',offset:0});
                  const image=await ask({...base,origin:'F',path:'src/binary.bin',offset:0});
                  const prior=await ask({...base,origin:'P',path:'main.pjs',offset:0});
                  const invalid=await ask({...base,origin:'F',path:'../private',offset:0});
                  done({ok:root.ok&&atob(root.base64)==='F source'&&
                    image.ok&&atob(image.base64)===String.fromCharCode(0,255,1)&&
                    prior.ok&&prior.length===0&&!invalid.ok,
                    root:{ok:root.ok,total:root.total},image:{ok:image.ok,total:image.total},
                    prior:{ok:prior.ok,total:prior.total},invalid});
                  db.close();
                })().catch(e=>done({error:String(e)}));"""
                proof=call('POST',f'/session/{after}/execute/async',
                           {'script':chunk_script,'args':[]},timeout=90)
                assert proof.get('ok') is True,proof
                print('B I13_PACKAGED_P_F_BINARY_PAGED_SOURCE_REVIEW=PASS',flush=True)
                close(after)
                after=open_session(browser,profile)
                assert addons_uuid(profile)==uuid
                call('POST',f'/session/{after}/url',{'url':url+'#work-queue'})
                proof=call('POST',f'/session/{after}/execute/async',{'script':"""
                const done=arguments[arguments.length-1];
                (async()=>{
                  const db=await (await import('./journal.mjs')).openCanonicalDatabase();
                  const r=await (await import('./release-store.mjs'))
                    .createReleaseStore(db).get('i13-fixture-release');
                  const port=browser.runtime.connect({name:'pcms-i13-release'});
                  port.onMessage.addListener(x=>{done({receipt:r,port:x});port.disconnect();db.close();});
                  port.postMessage({type:'GET',params:{slug:'i13-fixture-release'}});
                })().catch(e=>done({error:String(e)}));""",'args':[]},timeout=90)
                assert proof['receipt']['state']=='PUBLICATION_UNCERTAIN' and (
                    proof['port']['state']=='PUBLICATION_UNCERTAIN'),proof
                print('B I13_INSTALLED_RESTART_DURABLE_UNCERTAIN_PUBLICATION=PASS',flush=True)

                # I13 B: existing public P is an encrypted sealed snapshot;
                # real Firefox IDB serializes races and holds uncertain effects.
                call('POST',f'/session/{after}/url',{'url':url+'#work-queue'})
                current=execute(after,"return {prepare:!!document.getElementById('pcms-existing-prepare'),verify:!!document.getElementById('pcms-existing-recheck-unlist'),restore:!!document.getElementById('pcms-existing-recheck-restore'),held:document.getElementById('pcms-existing-unlist').disabled}")
                assert current=={'prepare':True,'verify':True,'restore':True,'held':True},current
                code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const journal=await import('./journal.mjs');
                  const core=await import('./existing-update-core.mjs');
                  const module=await import('./existing-update-store.mjs');
                  const source=(await import('./staging-core.mjs'));
                  const refresher=await import('./refresher-core.mjs');
                  const db=await journal.openCanonicalDatabase();
                  const slug='i13-existing-fixture',fp='e'.repeat(64),
                    accountId='i13_existing_account',personaUid='persona-i13-existing',
                    remoteId='public_i13_existing01';
                  const p=await source.exactSource([
                    {path:'main.pjs',base64:btoa('original')},
                    {path:'index.html',base64:btoa('<p>P</p>')},
                    {path:'src/binary.bin',base64:btoa(String.fromCharCode(0,255,8))}
                  ]);
                  const seal=await core.sealPrevious(p,'browser-fixture-private-passphrase');
                  const decrypted=await core.unlockPrevious(seal,'browser-fixture-private-passphrase');
                  const negative=await core.unlockPrevious(seal,'wrong-browser-fixture-passphrase');
                  const account={accountId,personaUid,revision:4,bindingVersion:1,state:'VERIFIED',
                    identity:{source:'GUARDED_SESSION_READBACK',bindingVersion:1,
                      principalFingerprint:fp}};
                  const inventory={slug,accountId,personaUid,bindingVersion:1,revision:2,
                    remoteId,ownerState:'OBSERVED_OWNER',visibility:'PUBLIC'};
                  const adoption={slug,accountId,personaUid,bindingVersion:1,accountRevision:4,
                    principalFingerprint:fp,remotePublicId:remoteId,
                    revision:6,archiveState:'ARCHIVED_GIT_CONFIRMED',
                    original:{source:'INDEPENDENT_FULL_BYTE_READBACK',
                      fingerprint:p.fingerprint,blobs:p.blobs}};
                  const state=refresher.emptyShadow();
                  state.rows.push({stableId:'i13_existing_stable',slug,accountId,personaUid,
                    bindingVersion:1,remoteId,phase:'SLEEPING',sleepRemaining:72*3600000,
                    activeRemaining:0,ordinal:1,paused:false,slot:false,identityHeld:false,
                    ownerVerified:true,releaseVerified:true,reviewHeld:false});
                  state.accounts[accountId]={personaUid,bindingVersion:1,paused:false};
                  if(!refresher.validShadow(state))throw Error('invalid synthetic shadow');
                  await new Promise((resolve,reject)=>{
                    const t=db.transaction(['meta'],'readwrite'),m=t.objectStore('meta');
                    m.put({key:'account:'+accountId,account});
                    m.put({key:'inventory:'+slug,generator:inventory});
                    m.put({key:'adoption:'+slug,adoption});
                    m.put({key:refresher.REFRESHER_KEY,state});
                    t.oncomplete=resolve;t.onabort=()=>reject(Error('I13 seed aborted'));
                  });
                  const store=module.createExistingStore(db);
                  const remote={ok:true,remotePublicId:remoteId,ownerResult:'IS_OWNER',
                    visibility:'PUBLIC',source:p};
                  const first=await store.prepare({context:{
                    ok:true,originalArchiveFingerprint:p.fingerprint},
                    original:p,seal,remote,shadow:state.rows[0],account,inventory,adoption});
                  const second=await store.prepare({context:{
                    ok:true,originalArchiveFingerprint:p.fingerprint},
                    original:p,seal,remote,shadow:state.rows[0],account,inventory,adoption});
                  const competing=await Promise.all([
                    store.move(slug,first.revision,'UNLIST_DISPATCH'),
                    store.move(slug,first.revision,'UNLIST_DISPATCH')]);
                  const winners=competing.filter(x=>x.ok);
                  const operations=await new Promise((resolve,reject)=>{
                    const t=db.transaction('operations','readonly');
                    const req=t.objectStore('operations').getAll();
                    req.onsuccess=()=>resolve(req.result.filter(x=>
                      x.targetId==='existing_'+slug));
                    req.onerror=()=>reject(Error('operations unavailable'));
                  });
                  const uncertain=await store.move(slug,winners[0].revision,
                    'UNLIST_UNCERTAIN',{reason:'LOST_ACK'});
                  const retry=await store.move(slug,uncertain.revision,'UNLIST_DISPATCH');
                  const port=browser.runtime.connect({name:'pcms-i13-existing'});
                  const reply=new Promise(resolve=>port.onMessage.addListener(resolve));
                  port.postMessage({type:'GET',params:{slug}});
                  const actual=await reply;port.disconnect();
                  done({ok:seal.ok&&decrypted.ok&&!negative.ok&&first.ok&&
                    second.code==='EXISTING_ALREADY_PREPARED'&&winners.length===1&&
                    operations.length===1&&
                    operations[0].status==='DISPATCH_POSSIBLE'&&
                    uncertain.state==='UNLIST_UNCERTAIN'&&retry.ok===false&&
                    actual.state==='UNLIST_UNCERTAIN',
                    first,second,competing,operations:operations.length,
                    uncertain,retry,actual});
                  db.close();
                })().catch(e=>done({error:String(e),stack:e?.stack?.slice(0,600)}));"""
                proof=call('POST',f'/session/{after}/execute/async',
                           {'script':code,'args':[]},timeout=90)
                assert proof.get('ok') is True,proof
                print('B I13_INSTALLED_EXISTING_ENCRYPTED_P_CAS_UNLIST_UNCERTAIN=PASS',flush=True)
                execute(after,"document.getElementById('pcms-existing-slug').value='i13-existing-fixture';document.getElementById('pcms-existing-slug').dispatchEvent(new Event('input',{bubbles:true}));document.getElementById('pcms-existing-get').click();return true")
                existing_ui=''
                for _ in range(80):
                    existing_ui=execute(after,"return document.getElementById('pcms-existing-status').textContent")
                    if 'UNLIST_UNCERTAIN' in existing_ui:break
                    time.sleep(.15)
                assert 'UNLIST_UNCERTAIN' in existing_ui,existing_ui
                assert execute(after,"return document.getElementById('pcms-existing-unlist').disabled") is True
                print('B I13_EXISTING_UI_NO_BLIND_UNLIST_RETRY=PASS',flush=True)

                # Synthetic prior confirmed public F permits a NEW source
                # lifecycle only with archived immutable release/AI/stage/P.
                cycle="""const done=arguments[arguments.length-1];
                (async()=>{
                  const journal=await import('./journal.mjs'),core=await import('./staging-core.mjs');
                  const rec=await import('./existing-update-core.mjs');
                  const existing=await import('./existing-update-store.mjs');
                  const stageModule=await import('./staging-store.mjs');
                  const aiModule=await import('./ai-store.mjs');
                  const releaseModule=await import('./release-store.mjs');
                  const refresh=await import('./refresher-core.mjs');
                  const db=await journal.openCanonicalDatabase();
                  const slug='i13-repeat-generator',fp='f'.repeat(64),
                    accountId='i13_repeat_account',personaUid='persona-i13-repeat',
                    remoteId='public_i13_repeat';
                  const original=await core.exactSource([{path:'main.pjs',base64:btoa('previous P0')},
                    {path:'index.html',base64:btoa('<p>P0</p>')}]);
                  const p1=await core.exactSource([{path:'main.pjs',base64:btoa('published P1')},
                    {path:'index.html',base64:btoa('<p>P1</p>')}]);
                  const p2=await core.exactSource([{path:'main.pjs',base64:btoa('ready P2')},
                    {path:'index.html',base64:btoa('<p>P2</p>')}]);
                  const account={accountId,personaUid,revision:4,state:'VERIFIED',
                    bindingVersion:1,identity:{source:'GUARDED_SESSION_READBACK',
                      bindingVersion:1,principalFingerprint:fp}};
                  const inventory={slug,revision:3,accountId,personaUid,
                    bindingVersion:1,remoteId,ownerState:'OBSERVED_OWNER',visibility:'UNLISTED'};
                  const adoption={slug,revision:6,accountId,accountRevision:4,personaUid,
                    bindingVersion:1,principalFingerprint:fp,remotePublicId:remoteId,
                    archiveState:'ARCHIVED_GIT_CONFIRMED',original:{
                      source:'INDEPENDENT_FULL_BYTE_READBACK',
                      fingerprint:original.fingerprint,blobs:original.blobs}};
                  const initial={slug,revision:12,state:'STAGE_CONFIRMED',accountId,
                    accountRevision:4,personaUid,bindingVersion:1,
                    principalFingerprint:fp,remotePublicId:remoteId,
                    previousFingerprint:original.fingerprint,
                    stagedFingerprint:p1.fingerprint,
                    stageSource:p1,recovery:(await rec.sealPrevious(original,'synthetic-history-passphrase')),
                    nonce:'1'.repeat(32),operationId:'existing_'+ '1'.repeat(32)};
                  const priorStage={slug,revision:5,state:'SOURCE_VERIFIED',
                    accountId,accountRevision:4,personaUid,bindingVersion:1,
                    principalFingerprint:fp,remotePublicId:remoteId,
                    sourceFolder:'gens/'+slug,sourceHead:'a'.repeat(40),
                    testingSha:fp,candidate:p1,previous:original,
                    verifiedAt:Date.now(),nonce:'1'.repeat(32)};
                  const priorJob={slug,revision:7,stageRevision:5,
                    state:'TESTS_VERIFIED',executionSlotReleased:true,
                    sourceFingerprint:p1.fingerprint,verifiedFinal:p1.fingerprint,
                    finalSource:p1,prompt:{revision:1,tests:['default_generator_smoke']},
                    native:{state:'CHAT1_OBSERVED_IDLE',sessionDigest:fp},
                    chat1:{tests:{default_generator_smoke:{
                      result:'PASS',sourceFingerprint:p1.fingerprint}}},chat2:null};
                  const approved={slug,accountId,personaUid,bindingVersion:1,accountRevision:4,
                    principalFingerprint:fp,remotePublicId:remoteId,
                    stageRevision:5,jobRevision:7,sourceFingerprint:p1.fingerprint,
                    previousFingerprint:original.fingerprint,kind:'PRIVATE_NEW',
                    files:p1.files,gitFolder:'gens/'+slug,
                    gitTestingSha:fp,testPromptRevision:1,testingFingerprint:null};
                  const priorRelease={slug,revision:6,releaseId:'release_'+ '1'.repeat(32),
                    kind:'PRIVATE_NEW',state:'CONFIRMED_PUBLIC',
                    accountId,personaUid,bindingVersion:1,remoteId,
                    principalFingerprint:fp,source:'INDEPENDENT_PUBLICATION_READBACK',
                    sourceFingerprint:p1.fingerprint,approvedAt:Date.now()-10000,
                    observedAt:Date.now()-1000,observationId:'observed_'+ '2'.repeat(32),
                    approval:approved,sealedSource:p1};
                  const sh=refresh.emptyShadow();
                  sh.rows=[{stableId:'i13_repeat_stable',slug,accountId,personaUid,
                    remoteId,bindingVersion:1,ordinal:1,phase:'SLEEPING',
                    sleepRemaining:36*3600000,activeRemaining:0,paused:false,slot:false,
                    ownerVerified:true,releaseVerified:true,reviewHeld:false,identityHeld:false}];
                  sh.accounts[accountId]={paused:false,personaUid,bindingVersion:1};
                  const link={slug,folder:'gens/'+slug,accountId,bindingVersion:1,
                    remoteId,personaUid};
                  await new Promise((resolve,reject)=>{
                    const t=db.transaction('meta','readwrite'),m=t.objectStore('meta');
                    for(const item of [{key:'account:'+accountId,account},
                      {key:'inventory:'+slug,generator:inventory},{key:'adoption:'+slug,adoption},
                      {key:'existing-update:'+slug,record:initial},
                      {key:'stage:'+slug,record:priorStage},
                      {key:'ai-job:'+slug,accountId,job:priorJob},
                      {key:'release:'+slug,release:priorRelease},
                      {key:'source-link:'+slug,link},
                      {key:refresh.REFRESHER_KEY,state:sh}])m.put(item);
                    t.oncomplete=resolve;t.onabort=()=>reject(Error('repeat seed abort'));
                  });
                  const ec=existing.createExistingStore(db);
                  const previous=await rec.sealPrevious(p1,'synthetic-history-passphrase');
                  const prepared=await ec.prepare({context:{ok:true,
                    originalArchiveFingerprint:original.fingerprint},
                    original:p1,seal:previous,shadow:sh.rows[0],
                    account,inventory,adoption,remote:{ok:true,remotePublicId:remoteId,
                      ownerResult:'IS_OWNER',visibility:'PUBLIC',source:p1}});
                  const priorHist=await new Promise(resolve=>{
                    const req=db.transaction('meta','readonly').objectStore('meta')
                      .get('existing-history:'+slug+':'+initial.operationId);
                    req.onsuccess=()=>resolve(req.result?.record);
                  });
                  // Unlisting and bytes are simulated evidence only; separate
                  // native tests prove the fixed effect path.
                  const stages=stageModule.createStagingStore(db);
                  const pinned=await stages.pin({slug,candidate:p2,previous:p1,
                    source:{ok:true,ready:true,folder:'gens/'+slug,head:'b'.repeat(40),
                      fingerprint:fp,testingSha:fp,sourceBytes:p2.blobs},
                    eligibility:{ok:true,account,item:{remoteId}},nonce:'2'.repeat(32)});
                  const oldStage=await new Promise(resolve=>{
                    const req=db.transaction('meta','readonly').objectStore('meta')
                      .get('stage-history:'+slug+':5');
                    req.onsuccess=()=>resolve(req.result?.record);
                  });
                  // Seal a new SOURCE_VERIFIED stage in this synthetic fixture.
                  await new Promise((resolve,reject)=>{
                    const t=db.transaction('meta','readwrite'),m=t.objectStore('meta');
                    m.put({key:'stage:'+slug,record:{...priorStage,revision:pinned.revision,
                      nonce:'2'.repeat(32),candidate:p2,previous:p1,
                      state:'SOURCE_VERIFIED'}});
                    t.oncomplete=resolve;t.onabort=()=>reject(Error('stage advance abort'));
                  });
                  const ai=await aiModule.createAiStore(db).start({...priorStage,
                    revision:pinned.revision,nonce:'2'.repeat(32),
                    candidate:p2,previous:p1,state:'SOURCE_VERIFIED'});
                  const oldAi=await new Promise(resolve=>{
                    const req=db.transaction('meta','readonly').objectStore('meta')
                      .get('ai-history:'+slug+':7');
                    req.onsuccess=()=>resolve(req.result?.job);
                  });
                  const newJob={...priorJob,revision:ai.revision,stageRevision:pinned.revision,
                    sourceFingerprint:p2.fingerprint,verifiedFinal:p2.fingerprint,
                    finalSource:p2,chat1:{tests:{default_generator_smoke:{
                      result:'PASS',sourceFingerprint:p2.fingerprint}}}};
                  await new Promise((resolve,reject)=>{
                    const t=db.transaction('meta','readwrite');
                    t.objectStore('meta').put({key:'ai-job:'+slug,accountId,job:newJob});
                    t.oncomplete=resolve;t.onabort=()=>reject(Error('synthetic tests seed aborted'));
                  });
                  const newStage=(await stages.getFull(slug)).record;
                  const releaseCore=await import('./release-core.mjs');
                  const approve=releaseCore.approvalTuple({slug,stage:newStage,
                    job:newJob,source:p2,previous:p1,git:{ok:true,testingSha:fp},
                    kind:'EXISTING_UPDATE'});
                  const releases=releaseModule.createReleaseStore(db);
                  const firstApproval=await releases.approve({approval:approve,stage:newStage,
                    job:newJob,account,inventory,source:p2,previous:p1,
                    releaseId:'release_'+ '3'.repeat(32),kind:'EXISTING_UPDATE'});
                  const canceled=await releases.cancelApproved(slug,firstApproval.revision);
                  const renewed=await releases.approve({approval:approve,stage:newStage,
                    job:newJob,account,inventory,source:p2,previous:p1,
                    releaseId:'release_'+ '4'.repeat(32),kind:'EXISTING_UPDATE'});
                  const previousRelease=await new Promise(resolve=>{
                    const req=db.transaction('meta','readonly').objectStore('meta')
                      .get('release-history:'+slug+':'+priorRelease.releaseId);
                    req.onsuccess=()=>resolve(req.result?.release);
                  });
                  const canceledHistory=await new Promise(resolve=>{
                    const req=db.transaction('meta','readonly').objectStore('meta')
                      .get('release-history:'+slug+':'+firstApproval.releaseId);
                    req.onsuccess=()=>resolve(req.result?.release);
                  });
                  done({ok:prepared.ok&&priorHist?.state==='STAGE_CONFIRMED'&&
                    pinned.ok&&pinned.revision===6&&oldStage?.revision===5&&
                    ai.ok&&ai.revision===8&&oldAi?.revision===7&&
                    firstApproval.ok&&canceled.state==='CANCELED'&&
                    renewed.state==='APPROVED'&&
                    previousRelease?.state==='CONFIRMED_PUBLIC'&&
                    canceledHistory?.state==='CANCELED',
                    prepared,pinned,ai,priorArchived:!!priorHist,
                    stageArchived:!!oldStage,aiArchived:!!oldAi,
                    firstApproval,canceled,renewed,
                    releaseArchived:!!previousRelease,canceledArchived:!!canceledHistory});
                  db.close();
                })().catch(e=>done({error:String(e),stack:e?.stack?.slice(0,600)}));"""
                proof=call('POST',f'/session/{after}/execute/async',
                           {'script':cycle,'args':[]},timeout=90)
                assert proof.get('ok') is True,proof
                print('B I13_REPEAT_CYCLE_IMMUTABLE_EXISTING_STAGE_AI_HISTORY=PASS',flush=True)

                # I08 B: real packaged Firefox crypto, canonical IDB, donor
                # portable format, Settings action, and wrong-password failure.
                # No live provider or native calls; no disk byte proof claimed.
                call('POST',f'/session/{after}/url',{'url':url+'#settings'})
                settings=execute(after,"return {button:!!document.getElementById('pcms-backup-export'),password:!!document.getElementById('pcms-backup-passphrase'),status:!!document.getElementById('pcms-backup-status')}")
                assert settings=={'button':True,'password':True,'status':True},settings
                # S02 B: new source-completeness action runs in the same installed
                # XPI, reads the real synthetic historical IDB, and truthfully
                # holds a source-incomplete legacy publication. v1 codec stays
                # usable to preserve that historical record, not to bless it.
                audit_button=execute(after,"const b=document.getElementById('pcms-backup-audit');if(b)b.click();return !!b")
                assert audit_button is True,'S02 read-only source audit not packaged'
                audit_status=''
                for _ in range(50):
                    audit_status=execute(after,"return document.getElementById('pcms-backup-audit-status')?.textContent||''")
                    if 'Source-complete recovery HELD:' in audit_status or (
                        'Local source-byte audit passed' in audit_status):
                        break
                    time.sleep(.1)
                assert 'Source-complete recovery HELD: BACKUP_SOURCE_INCOMPLETE' in audit_status,audit_status
                assert 'No external effects' in audit_status,audit_status
                print('B S02_PACKAGED_READONLY_SOURCE_RECOVERY_HOLD=PASS',flush=True)
                # S02 B: production packaged v2 codec runs on real Firefox
                # with complete original/current/history/binary source and
                # donor portable encoder. This is NOT a native-host or H proof.
                v2_code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const v2=await import('./backup-v2-codec.mjs');
                  const scanner=await import('./restore-v2-frame-scanner.mjs');
                  const cryptoCore=await import('./backup-core.mjs');
                  const donor=await import('../lib/backup-package.js');
                  const pass='disposable-s02-browser-password';
                  const raw=[['main.pjs',new TextEncoder().encode('output = "hello"')],
                    ['index.html',new TextEncoder().encode('<b>hello</b>')],
                    ['src/binary.bin',new Uint8Array([0,255,1,0,42])]];
                  const files=await Promise.all(raw.map(async([path,bytes])=>({
                    path,size:bytes.length,sha256:await cryptoCore.digest(bytes)})));
                  files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
                  const blobs=raw.map(([path,bytes])=>({path,base64:
                    btoa(String.fromCharCode(...bytes))})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
                  const fingerprint=await cryptoCore.digest('PCMS_STAGED_SOURCE_V1'+String.fromCharCode(10)+files.map(
                    f=>JSON.stringify([f.path,f.size,f.sha256])).join(String.fromCharCode(10)));
                  const source={ok:true,files,blobs,fingerprint};
                  const pcms={schema:1,stores:{entities:[],operations:[{key:'uncertain',
                    value:{status:'HELD_UNCERTAIN'}}],events:[],meta:[
                    {key:'stage:fixture',value:{record:{candidate:source,previous:source}}},
                    {key:'stage-history:fixture:1',value:{record:{candidate:source,previous:source}}}
                  ],observations:[]}};
                  const payload=donor.createPortableBackupPayload({state:{},
                    containers:[],selection:{kind:'full'}});
                  const sealed=await donor.encodeBackupEnvelope({payload,password:pass});
                  const plan=await v2.compileV2(pcms,sealed),chunks=[];
                  for await(const chunk of v2.streamV2Frames(plan))chunks.push(chunk);
                  const all=new Uint8Array(plan.plaintextBytes);let o=0;
                  for(const chunk of chunks){all.set(chunk,o);o+=chunk.length;}
                  let scannerBlobs=0,scannerDonorBytes=0,scannerEnds=0;
                  async function* pieces(){
                    for(let j=0;j<all.length;j+=31)yield all.subarray(j,j+31);
                  }
                  for await(const frame of scanner.scanV2AuthenticatedFrames(pieces())){
                    if(frame.kind==='BLOB')scannerBlobs++;
                    if(frame.kind==='DONOR_FRAGMENT')scannerDonorBytes+=frame.bytes.length;
                    if(frame.kind==='END')scannerEnds++;
                  }
                  const restored=await v2.decodeAuthenticatedV2(all,{
                    decodeDonor:donor.decodeBackupEnvelope,password:pass});
                  // The actual packaged Firefox IDB stores native-like second
                  // pass bytes, and only a terminal receipt permits decoding.
                  const staged=await import('./restore-v2-inactive-stage.mjs');
                  const prepare=await import('./restore-v2-prep.mjs');
                  const db=await staged.openV2StageDB();
                  const stage=staged.createV2InactiveStage(db,{assertHeld:async()=>true});
                  const run='s02_'+crypto.randomUUID().replaceAll('-','');
                  const proofSha='a'.repeat(64),empty={
                    schema:1,stores:{entities:[],operations:[],events:[],
                      meta:[],observations:[]}};
                  await stage.begin(run,{state:'INACTIVE_STAGING_REQUIRED',
                    sha256:proofSha,plaintextBytes:all.length});
                  let seq=0;
                  for(let j=0;j<all.length;j+=49152)
                    await stage.append(run,seq++,all.subarray(j,j+49152));
                  await stage.finish(run,{state:'AUTHENTICATED_SECOND_PASS',
                    sha256:proofSha,complete:true},seq);
                  const stagedRestored=await prepare.prepareInactiveV2FromStage({
                    stage,runId:run,readback:{state:'AUTHENTICATED_SECOND_PASS',
                      sha256:proofSha,complete:true},
                    expectedCiphertextSha256:proofSha,currentPcms:empty,
                    password:pass,decodeDonor:donor.decodeBackupEnvelope,
                    mode:'replace'});
                  db.close();
                  const exact=restored.pcms.stores.meta[0].value.record.candidate;
                  done({ok:o===all.length&&plan.terminal.uniqueBlobs===3&&
                    stagedRestored.status==='INACTIVE_PREPARED_NOT_APPLIED'&&
                    stagedRestored.prepared.stores.meta.length===2&&
                    stagedRestored.activation==='OFF'&&
                    scannerBlobs===3&&scannerEnds===1&&
                    scannerDonorBytes===new TextEncoder().encode(sealed).length&&
                    restored.pcms.stores.operations[0].value.status==='HELD_UNCERTAIN'&&
                    exact.blobs.length===3&&
                    exact.blobs.some(x=>x.path==='src/binary.bin'&&x.base64==='AP8BACo=')&&
                    restored.donor.personas.length===0});
                })().catch(e=>done({error:String(e)}));"""
                result=call('POST',f'/session/{after}/execute/async',
                            {'script':v2_code,'args':[]},timeout=90)
                assert result.get('ok') is True,result
                print('B S02_PACKAGED_V2_SOURCE_FRAME_BINARY_AND_DONOR_ROUNDTRIP=PASS',flush=True)
                # S02 B: real installed Firefox IndexedDB intent/CAS with an
                # independently recorded synthetic native-effect ledger.
                # This is NOT an actual installed privileged native H test.
                v2_session="""const done=arguments[arguments.length-1];
                (async()=>{
                  const module=await import('./backup-v2-session.mjs');
                  const donor=await import('../lib/backup-package.js');
                  const open=()=>new Promise((resolve,reject)=>{
                    const req=indexedDB.open('s02-v2-'+crypto.randomUUID(),1);
                    req.onupgradeneeded=()=>req.result.createObjectStore('meta',{keyPath:'key'});
                    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
                  });
                  const db=await open(),runId='s02_'+('d'.repeat(32));
                  const pass='disposable-S02-browser-passphrase';
                  const payload=donor.createPortableBackupPayload({state:{},
                    containers:[],selection:{kind:'full'}});
                  const envelope=await donor.encodeBackupEnvelope({payload,password:pass});
                  const pcms={schema:1,stores:{entities:[],operations:[],events:[],
                    meta:[],observations:[]}};
                  const ledger=[],observations={bytes:0,seq:0};
                  const transport=()=>({close(){},async exchange(cmd){
                    ledger.push({action:cmd.action,sequence:cmd.sequence});
                    if(cmd.action==='export.begin')return {ok:true,state:'OPEN_OBSERVED',runId:cmd.runId};
                    if(cmd.action==='export.append'){
                      if(cmd.sequence!==observations.seq)throw Error('DOUBLE_APPEND');
                      observations.seq++;
                      observations.bytes+=atob(cmd.bytes).length;
                      return {ok:true,state:'APPEND_OBSERVED',runId:cmd.runId,
                        sequence:cmd.sequence,acceptedBytes:observations.bytes};
                    }
                    if(cmd.action==='export.finish')return {ok:true,state:'WRITTEN_UNVERIFIED',runId:cmd.runId};
                    if(cmd.action==='backup.verify')return {ok:true,state:'AUTHENTICATED_INVENTORY_ONLY',runId:cmd.runId,
                      sha256:'a'.repeat(64),uniqueBlobs:0,canonicalRows:0};
                    throw Error('UNEXPECTED_NATIVE_OPERATION');
                  }});
                  const state=await module.exportV2Candidate({db,api:browser,pcms,
                    donorEnvelope:envelope,checkScope:async()=>true,
                    checkRestoreHold:async()=>false,connect:transport,runId});
                  const inspected=await module.createV2Ledger(db).inspect(runId);
                  let duplicateHeld=false;
                  try{await module.exportV2Candidate({db,api:browser,pcms,
                    donorEnvelope:envelope,checkScope:async()=>true,
                    checkRestoreHold:async()=>false,connect:transport,
                    runId:'s02_'+('e'.repeat(32))});}
                  catch{duplicateHeld=true;}
                  done({ok:state.ok&&duplicateHeld&&
                    inspected.state==='AUTHENTICATED_INVENTORY_ONLY'&&
                    inspected.acceptedBytes===inspected.plaintextBytes&&
                    ledger[0]?.action==='export.begin'&&
                    ledger.at(-1)?.action==='backup.verify'&&
                    ledger.filter(e=>e.action==='export.begin').length===1,
                    status:inspected.state,parts:observations.seq});
                  db.close();
                })().catch(e=>done({error:String(e)}));"""
                check=call('POST',f'/session/{after}/execute/async',
                           {'script':v2_session,'args':[]},timeout=90)
                assert check.get('ok') is True,check
                print('B S02_INSTALLED_V2_IDB_EFFECT_JOURNAL_AND_SYNTHETIC_HOST_NO_REPLAY=PASS',flush=True)

                # S02 B: real packaged candidate self-verifier, actual IDB
                # encrypted staging and donor/source decoder. The native port
                # is an independent synthetic byte/effect ledger; NOT host H.
                v2_verify="""const done=arguments[arguments.length-1];
                (async()=>{
                  const v2=await import('./backup-v2-codec.mjs');
                  const session=await import('./backup-v2-session.mjs');
                  const checker=await import('./backup-v2-verify.mjs');
                  const donor=await import('../lib/backup-package.js');
                  const open=()=>new Promise((resolve,reject)=>{
                    const req=indexedDB.open('s02-v2-verify-'+crypto.randomUUID(),1);
                    req.onupgradeneeded=()=>req.result.createObjectStore('meta',{keyPath:'key'});
                    req.onsuccess=()=>resolve(req.result);
                    req.onerror=()=>reject(req.error);
                  });
                  const db=await open(),runId='s02_'+crypto.randomUUID().replaceAll('-','');
                  const password='S02_disposable_b_verifier_password';
                  const portable=donor.createPortableBackupPayload({
                    state:{},containers:[],selection:{kind:'full'}});
                  const envelope=await donor.encodeBackupEnvelope({payload:portable,password});
                  const empty={schema:1,stores:{entities:[],operations:[],
                    events:[],meta:[],observations:[]}};
                  const plan=await v2.compileV2(empty,envelope);
                  const raw=new Uint8Array(plan.plaintextBytes),parts=[];
                  let cursor=0;
                  for await(const chunk of v2.streamV2Frames(plan)){
                    raw.set(chunk,cursor);cursor+=chunk.length;
                  }
                  const nativeSteps=[],cipher='c'.repeat(64);
                  const native=()=>({close(){},async exchange(req){
                    nativeSteps.push(req.action);
                    if(req.action==='export.begin')return {
                      ok:true,state:'OPEN_OBSERVED',runId:req.runId};
                    if(req.action==='export.append')return {
                      ok:true,state:'APPEND_OBSERVED',runId:req.runId,
                      sequence:req.sequence,acceptedBytes:0};
                    if(req.action==='restore.begin')return {
                      ok:true,runId:req.runId,state:'INACTIVE_STAGING_REQUIRED',
                      plaintextBytes:raw.length,sha256:cipher};
                    if(req.action==='restore.read'){
                      const size=30000,start=req.sequence*size;
                      const fragment=raw.subarray(start,start+size);
                      const complete=start+fragment.length===raw.length;
                      return {ok:true,runId:req.runId,sequence:req.sequence,
                        bytes:btoa(String.fromCharCode(...fragment)),complete,
                        state:complete?'AUTHENTICATED_SECOND_PASS':
                          'INACTIVE_STAGING_FRAGMENT',
                        ...(complete?{sha256:cipher}:{})};
                    }
                    if(req.action==='archive.recovery.complete')return {
                      ok:true,runId:req.runId,state:'RECOVERY_VERIFIED',
                      sha256:cipher,activation:'OFF'};
                    if(req.action==='restore.abort')return {ok:true,
                      runId:req.runId,state:'RESTORE_READER_ABORTED'};
                    throw Error('BAD_TEST_NATIVE');
                  }});
                  const ledger=session.createV2Ledger(db);
                  let row=await ledger.claim(runId,'d'.repeat(64),raw.length);
                  for(const [from,to,patch] of [
                    ['PREPARED','CREATE_POSSIBLE',{}],
                    ['CREATE_POSSIBLE','OPEN_OBSERVED',{}],
                    ['OPEN_OBSERVED','APPEND_POSSIBLE',{}],
                    ['APPEND_POSSIBLE','OPEN_OBSERVED',
                     {acceptedBytes:raw.length,nextSequence:1}],
                    ['OPEN_OBSERVED','FINISH_POSSIBLE',{}],
                    ['FINISH_POSSIBLE','WRITTEN_UNVERIFIED',{}],
                    ['WRITTEN_UNVERIFIED','AUTHENTICATED_INVENTORY_ONLY',
                     {ciphertextSha256:cipher,observedBlobs:0}]
                  ])row=await ledger.advance(runId,row.revision,from,to,patch);
                  const restored=await checker.verifyV2StoredArchive({
                    api:browser,db,runId,password,
                    assertNotRestoring:async()=>true,
                    connectionFactory:native
                  });
                  const after=await ledger.inspect(runId);
                  db.close();
                  done({ok:restored.ok&&restored.state==='RECOVERY_VERIFIED'&&
                    after.state==='RECOVERY_VERIFIED'&&
                    after.preparedSha256===restored.preparedSha256&&
                    restored.activation==='OFF'&&
                    restored.sourceRows===0&&
                    nativeSteps.includes('archive.recovery.complete'),
                    actions:nativeSteps.length,status:after.state});
                })().catch(e=>done({error:String(e)}));"""
                verified_result=call('POST',f'/session/{after}/execute/async',
                                      {'script':v2_verify,'args':[]},timeout=90)
                assert verified_result.get('ok') is True,verified_result
                print('B S02_INSTALLED_READONLY_RESTORABLE_NATIVE_CANDIDATE_LEDGERS_AND_EPHEMERAL_IDB=PASS',flush=True)


                # S02 B: real existing daily I15 runner and durable I15 claim
                # admit a source-complete v2 candidate only through a trusted
                # background-only review-injected branch. Mock native ledger
                # independent of the runner. It MUST remain HELD, not retained.
                v2_auto="""const done=arguments[arguments.length-1];
                (async()=>{
                  const auto=await import('./backup-auto-run.mjs');
                  const state=await import('./backup-auto-store.mjs');
                  const open=()=>new Promise((resolve,reject)=>{
                    const req=indexedDB.open('s02-i15-'+crypto.randomUUID(),1);
                    req.onupgradeneeded=()=>req.result.createObjectStore('meta',{keyPath:'key'});
                    req.onsuccess=()=>resolve(req.result);
                    req.onerror=()=>reject(req.error);
                  });
                  const db=await open();
                  const stored=state.createAutoStore(db);
                  await stored.enabled(true);
                  const calls=[],run='9'.repeat(32);
                  const runner=auto.createAutoRunner(browser,{
                    open:async()=>db,newId:()=>run,
                    reviewedV2:async()=>true,
                    native:async()=>({ok:true,passphrase:'safe-test-only-vault-password'}),
                    captureV2:async()=>({pcms:{schema:1,stores:{
                      entities:[],operations:[],events:[],meta:[],observations:[]}},
                      donorEnvelope:'actual-donor-envelope-encoded-in-fixture'}),
                    verifyV2:async()=>({ok:false,state:'INVENTORY_ONLY'}),
                    dispatchV2:async({runId,checkScope,checkRestoreHold})=>{
                      calls.push(runId);
                      if(!await checkScope()||await checkRestoreHold())
                        throw Error('BACKUP_V2_NOT_ADMITTED');
                      return {ok:true,runId,state:'AUTHENTICATED_INVENTORY_ONLY',
                        plaintextBytes:100,
                        ciphertextSha256:'a'.repeat(64)};
                    }
                  });
                  const first=await runner.tick(),second=await runner.tick();
                  const manual=await runner.manualV2Candidate();
                  const disallowed=auto.createAutoRunner(browser,{
                    reviewedV2:async()=>false});
                  const held=await disallowed.manualV2Candidate();
                  const journal=(await stored.read()).state;
                  done({ok:first.code==='V2_NATIVE_OUTCOME_UNKNOWN'&&
                    second.code==='DOWNLOAD_OUTCOME_UNKNOWN'&&
                    manual.ok===true&&manual.state==='AUTHENTICATED_INVENTORY_ONLY'&&
                    manual.retentionSuccess===false&&
                    held.code==='BACKUP_V2_REVIEW_REQUIRED'&&
                    calls.length===2&&calls[0]==='s02_'+run&&
                    calls[1]==='s02_'+run&&
                    journal.status==='HELD_UNCERTAIN'&&
                    journal.archives.length===0&&
                    journal.lastSuccessDay===-1&&
                    journal.active?.status==='DISPATCH_POSSIBLE',
                    first:first.code,second:second.code,
                    count:calls.length,manual:manual.state,ledgerStatus:journal.status});
                  db.close();
                })().catch(e=>done({ok:false,error:String(e)}));"""
                auto_result=call('POST',f'/session/{after}/execute/async',
                                  {'script':v2_auto,'args':[]},timeout=90)
                assert auto_result.get('ok') is True,auto_result
                print('B S02_EXISTING_I15_DAILY_CANDIDATE_HELD_NO_NATIVE_REPLAY_OR_FALSE_RETENTION=PASS',flush=True)

                # S02 B: native-tested source/donor recovery can be qualified
                # as a real I15 tracked successful file; the provider only
                # supplies synthetic independent-effects observations here.
                v2_success="""const done=arguments[arguments.length-1];
                (async()=>{
                  const auto=await import('./backup-auto-run.mjs');
                  const journal=await import('./backup-auto-store.mjs');
                  const open=()=>new Promise((resolve,reject)=>{
                    const req=indexedDB.open('s02-native-success-'+crypto.randomUUID(),1);
                    req.onupgradeneeded=()=>req.result.createObjectStore('meta',{keyPath:'key'});
                    req.onsuccess=()=>resolve(req.result);
                    req.onerror=()=>reject(req.error);
                  });
                  const db=await open(),save=journal.createAutoStore(db);
                  await save.enabled(true);
                  let nativeExports=0,nativeRestores=0,prunes=0;
                  const key='7'.repeat(32);
                  const app=auto.createAutoRunner(browser,{
                    open:async()=>db,newId:()=>key,
                    reviewedV2:async()=>true,
                    native:async()=>({ok:true,passphrase:'long-synthetic-key-not-saved'}),
                    captureV2:async()=>({pcms:{schema:1,stores:{
                      entities:[],operations:[],events:[],meta:[],observations:[]}},
                      donorEnvelope:'long-synthetic-native-envelope'}),
                    dispatchV2:async({runId})=>{
                      nativeExports++;
                      return {ok:true,runId,state:'AUTHENTICATED_INVENTORY_ONLY',
                        plaintextBytes:1024,ciphertextSha256:'a'.repeat(64)};
                    },
                    verifyV2:async({runId,password})=>{
                      nativeRestores++;
                      if(password!=='long-synthetic-key-not-saved')
                        throw Error('MISSING_OS_VAULT');
                      return {ok:true,runId,state:'RECOVERY_VERIFIED',
                        sha256:'a'.repeat(64),preparedSha256:'b'.repeat(64)};
                    },
                    nativeRetention:async()=>{prunes++;return {ok:true,
                      state:'NO_ELIGIBLE_DELETE'};}
                  });
                  const first=await app.tick(),second=await app.tick();
                  const inspected=(await save.read()).state,report=await app.status();
                  db.close();
                  done({ok:first.ok===true&&
                    first.code==='NATIVE_READONLY_SOURCE_RECOVERY'&&
                    second.code==='BACKUP_ALREADY_DONE'&&
                    nativeExports===1&&nativeRestores===1&&prunes===1&&
                    inspected.active===null&&inspected.archives.length===1&&
                    inspected.archives[0].kind==='AUTO_NATIVE'&&
                    inspected.archives[0].tier===3&&
                    inspected.lastSuccessDay>=0&&
                    report.tier===3&&
                    report.proof==='NATIVE_READONLY_SOURCE_RECOVERY',
                    first:first.code,second:second.code,retained:report.retained});
                })().catch(e=>done({error:String(e)}));"""
                v2_success_result=call('POST',f'/session/{after}/execute/async',
                                       {'script':v2_success,'args':[]},timeout=90)
                assert v2_success_result.get('ok') is True,v2_success_result
                print('B S02_EXISTING_I15_DAILY_NATIVE_SOURCE_RECOVERY_QUALIFIED_ONCE=PASS',flush=True)


                # S02 B: actual separate Firefox IndexedDB staging is
                # strictly inactive until full second-pass native receipt,
                # and survives DB reopen without promoting partial fragments.
                v2_stage="""const done=arguments[arguments.length-1];
                (async()=>{
                  const module=await import('./restore-v2-inactive-stage.mjs');
                  const digest='a'.repeat(64),id='s02_'+('f'.repeat(32));
                  let authorized=true;
                  const guard=()=>Promise.resolve(authorized);
                  let db=await module.openV2StageDB();
                  let stage=module.createV2InactiveStage(db,{assertHeld:guard});
                  await stage.begin(id,{state:'INACTIVE_STAGING_REQUIRED',
                    plaintextBytes:6,sha256:digest});
                  const part1=new Uint8Array([0,255,1]);
                  const part2=new Uint8Array([17,0,42]);
                  const a=await stage.append(id,0,part1);
                  const sealedRow=await new Promise(resolve=>{
                    const t=db.transaction('chunks','readonly');
                    t.objectStore('chunks').get(id+':000000000000000').onsuccess=e=>
                      resolve(e.target.result||null);
                  });
                  const diskCipherOnly=sealedRow?.data===undefined&&
                    typeof sealedRow?.ciphertext==='string'&&
                    typeof sealedRow?.iv==='string'&&
                    sealedRow.ciphertext!==btoa(String.fromCharCode(...part1));
                  let early=false;
                  try{const it=stage.fragments(id);await it.next();}
                  catch{early=true;}
                  authorized=false;let guardFailed=false;
                  try{await stage.append(id,1,part2)}catch{guardFailed=true;}
                  authorized=true;
                  let sequenceFailed=false;
                  try{await stage.append(id,0,part2)}catch{sequenceFailed=true;}
                  await stage.append(id,1,part2);
                  let wrongReceipt=false;
                  try{await stage.finish(id,{state:'AUTHENTICATED_SECOND_PASS',
                    sha256:'0'.repeat(64),complete:true},2)}
                  catch{wrongReceipt=true;}
                  await stage.finish(id,{state:'AUTHENTICATED_SECOND_PASS',
                    sha256:digest,complete:true},2);
                  db.close();db=await module.openV2StageDB();
                  stage=module.createV2InactiveStage(db,{assertHeld:guard});
                  const out=[];for await(const item of stage.fragments(id))out.push(...item);
                  const info=await stage.inspect(id);
                  const frameCodec=await import('./backup-v2-codec.mjs');
                  const second='s02_'+('1'.repeat(32));
                  const donorBytes=new TextEncoder().encode('opaque donor fixture');
                  const endBytes=new TextEncoder().encode('{"schema":2}');
                  const parts=[
                    frameCodec.frameHeader(frameCodec.V2_FRAME.DONOR,donorBytes.length),donorBytes,
                    frameCodec.frameHeader(frameCodec.V2_FRAME.END,endBytes.length),endBytes
                  ];
                  const framed=new Uint8Array(parts.reduce((total,v)=>total+v.length,0));
                  let cursor=0;
                  for(const part of parts){framed.set(part,cursor);cursor+=part.length;}
                  await stage.begin(second,{state:'INACTIVE_STAGING_REQUIRED',
                    sha256:digest,plaintextBytes:framed.length});
                  await stage.append(second,0,framed);
                  await stage.finish(second,{state:'AUTHENTICATED_SECOND_PASS',
                    sha256:digest,complete:true},1);
                  const frames=[];
                  for await(const frame of stage.frames(second))frames.push(frame.kind);
                  db.close();
                  done({ok:early&&guardFailed&&sequenceFailed&&wrongReceipt&&
                    diskCipherOnly&&
                    JSON.stringify(frames)==='["DONOR_FRAGMENT","DONOR_END","END"]'&&
                    a.acceptedBytes===3&&info.state==='READY_FOR_INACTIVE_DECODER'&&
                    JSON.stringify(out)==='[0,255,1,17,0,42]'&&
                    info.acceptedBytes===6,info});
                })().catch(e=>done({error:String(e)}));"""
                stage_result=call('POST',f'/session/{after}/execute/async',
                                  {'script':v2_stage,'args':[]},timeout=90)
                assert stage_result.get('ok') is True,stage_result
                print('B S02_INACTIVE_STAGE_BLOCKS_PARTIAL_AUTH_AND_REOPENS_EXACT_BYTES=PASS',flush=True)

                # CI diagnosis: never print donor values, identities or secrets.
                donor_probe_script="""const done=arguments[arguments.length-1];
                const port=browser.runtime.connect({name:'pcms-s02-backup-donor-readonly'});
                let once=false;
                const finish=data=>{if(once)return;once=true;
                  done(data);try{port.disconnect()}catch{}};
                port.onMessage.addListener(v=>finish({
                  ok:v?.ok===true&&!!v?.state&&Array.isArray(v?.containers),
                  response:!!v,hasState:!!v?.state,
                  hasContainers:Array.isArray(v?.containers),
                  keys:v&&typeof v==='object'?Object.keys(v).sort():[]}));
                port.onDisconnect.addListener(()=>finish({ok:false,disconnected:true}));
                port.postMessage({action:'SNAPSHOT'});"""
                def donor_probe(stage):
                    result=call('POST',f'/session/{after}/execute/async',
                      {'script':donor_probe_script,'args':[]},timeout=45)
                    print('B S02_DONOR_WITNESS_'+stage+'=',result,flush=True)
                    return result
                assert donor_probe('BEFORE_STRESS').get('ok') is True

                # S02 B F3: unique source assets and revisions, actual Firefox
                # IndexedDB second-pass restore. No native privilege/source
                # provider effect, and the native terminal is synthetic.
                v2_fleet="""const done=arguments[arguments.length-1];
                (async()=>{
                  const codec=await import('./backup-v2-codec.mjs');
                  const store=await import('./restore-v2-inactive-stage.mjs');
                  const restore=await import('./restore-v2-prep.mjs');
                  const core=await import('./backup-core.mjs');
                  const donor=await import('../lib/backup-package.js');
                  const timer=performance.now();
                  const before=await navigator.storage.estimate();
                  const text=new TextEncoder();
                  const pcms={schema:1,stores:{entities:[],operations:[],
                    events:[],meta:[],observations:[]}};
                  for(let i=0;i<50;i++)
                    pcms.stores.meta.push({key:'account:stress-'+i,
                      value:{account:{state:'ARCHIVED',accountId:'stress-'+i}}});
                  for(let i=0;i<1024;i++){
                    const raw=[
                      ['main.pjs',text.encode('output="source-'+i+'";')],
                      ['index.html',text.encode('<b>source</b>')],
                      ['src/asset.bin',Uint8Array.from({length:80+i%512},
                        (_,n)=>n===0?(i&255):n===1?((i>>8)&255):
                          (i*37+n*19+(n>>3))&255)]
                    ];
                    const files=await Promise.all(raw.map(async([path,bytes])=>({
                      path,size:bytes.length,sha256:await core.digest(bytes)})));
                    files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
                    const fingerprint=await core.digest('PCMS_STAGED_SOURCE_V1'+
                      String.fromCharCode(10)+files.map(f=>
                        JSON.stringify([f.path,f.size,f.sha256])).join(String.fromCharCode(10)));
                    const source={ok:true,fingerprint,files,
                      blobs:files.map(f=>({path:f.path,base64:btoa(
                        String.fromCharCode(...raw.find(x=>x[0]===f.path)[1]))}))};
                    pcms.stores.meta.push({key:'stage-history:stress-'+i,
                      value:{record:{candidate:source,previous:source}}});
                  }
                  const password='s02-test-only-bounded-fleet';
                  const sealed=await donor.encodeBackupEnvelope({payload:
                    donor.createPortableBackupPayload({state:{},containers:[],
                      selection:{kind:'full'}}),password});
                  const plan=await codec.compileV2(pcms,sealed);
                  const chunks=[],size=plan.plaintextBytes;
                  for await(const frag of codec.streamV2Frames(plan))chunks.push(frag);
                  const assembled=new Uint8Array(size);let offset=0;
                  for(const chunk of chunks){assembled.set(chunk,offset);offset+=chunk.length;}
                  const db=await store.openV2StageDB();
                  const staged=store.createV2InactiveStage(db,{assertHeld:async()=>true});
                  const runId='s02_'+crypto.randomUUID().replaceAll('-','');
                  const proof='f'.repeat(64);
                  await staged.begin(runId,{state:'INACTIVE_STAGING_REQUIRED',
                    plaintextBytes:size,sha256:proof});
                  let seq=0;
                  for(let i=0;i<assembled.length;i+=49152)
                    await staged.append(runId,seq++,assembled.subarray(i,i+49152));
                  await staged.finish(runId,{state:'AUTHENTICATED_SECOND_PASS',
                    sha256:proof,complete:true},seq);
                  db.close();
                  const reopened=await store.openV2StageDB(),hold=store.createV2InactiveStage(
                    reopened,{assertHeld:async()=>true});
                  const empty={schema:1,stores:{entities:[],operations:[],
                    events:[],meta:[],observations:[]}};
                  const qualified=await restore.prepareInactiveV2FromStage({
                    stage:hold,runId,readback:{state:'AUTHENTICATED_SECOND_PASS',
                      sha256:proof,complete:true},
                    expectedCiphertextSha256:proof,
                    currentPcms:empty,mode:'replace',password,
                    decodeDonor:donor.decodeBackupEnvelope});
                  const last=qualified.prepared.stores.meta.find(x=>
                    x.key==='stage-history:stress-1023');
                  const after=await navigator.storage.estimate();
                  reopened.close();
                  done({ok:qualified.status==='INACTIVE_PREPARED_NOT_APPLIED'&&
                    qualified.activation==='OFF'&&
                    qualified.prepared.stores.meta.length===1074&&
                    plan.terminal.uniqueBlobs>1800&&
                    last?.value.record.candidate.files.length===3&&
                    last.value.record.candidate.blobs.length===3,
                    accounts:50,records:1024,uniqueBlobs:plan.terminal.uniqueBlobs,
                    plaintextBytes:size,idbFragments:seq,
                    idbUsageDelta:(after.usage||0)-(before.usage||0),
                    elapsedMs:Math.round(performance.now()-timer)});
                })().then(done).catch(e=>done({error:String(e)}));"""
                fleet_result=call('POST',f'/session/{after}/execute/async',
                                   {'script':v2_fleet,'args':[]},timeout=120)
                assert fleet_result.get('ok') is True,fleet_result
                print('B S02_HETEROGENEOUS_50_1024_SOURCE_IDB_INACTIVE_RECOVERY=PASS',
                      fleet_result,flush=True)

                assert donor_probe('AFTER_STRESS').get('ok') is True

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
                if 'Browser reported complete (tier 2)' not in backup_status:
                    donor_probe('MANUAL_FAILURE')
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

                # I15: real installed combined XPI. No provider/native-vault effects.
                i15_ui=execute(after,"return {enabled:!!document.getElementById('pcms-auto-backup-enabled'),vault:!!document.getElementById('pcms-auto-backup-vault'),status:!!document.getElementById('pcms-auto-backup-status')}")
                assert i15_ui=={'enabled':True,'vault':True,'status':True},i15_ui
                i15_code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const core=await import('./backup-auto-core.mjs');
                  const runnerModule=await import('./backup-auto-run.mjs');
                  const storeModule=await import('./backup-auto-store.mjs');
                  async function portStatus(){
                    return new Promise((resolve,reject)=>{
                      const port=browser.runtime.connect({name:core.AUTO_PORT});
                      port.onMessage.addListener(value=>{port.disconnect();resolve(value)});
                      port.onDisconnect.addListener(()=>reject(Error('STATUS_PORT_DISCONNECTED')));
                      port.postMessage({action:'STATUS'});
                    });
                  }
                  const actual=await portStatus();
                  if(!actual.ok||actual.enabled!==false||actual.tier!==0)
                    throw Error('CANONICAL_AUTO_BACKUP_NOT_OFF');
                  async function makeDb(){
                    return new Promise((resolve,reject)=>{
                      const req=indexedDB.open('pcms-i15-b-'+crypto.randomUUID(),1);
                      req.onupgradeneeded=()=>req.result.createObjectStore('meta',{keyPath:'key'});
                      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
                    });
                  }
                  const db=await makeDb(),secondDb=await makeDb();
                  const timestamp=25*86400000,runId='auto_'+('2'.repeat(32));
                  const state=storeModule.createAutoStore(db,()=>timestamp);
                  await state.enabled(true);
                  let downloads=0,filename='',nativeCalls=0;
                  const downloadsAPI={
                    async download(request){downloads++;filename=request.filename;return 700;},
                    async search({id}){return id===700?[{id,filename:'/home/fixture/Downloads/'+filename,
                      state:'complete',exists:true,fileSize:3}]:[];},
                    onChanged:{addListener(){},removeListener(){}},
                    async removeFile(){throw Error('SHOULD_NOT_REMOVE_IN_1_ARCHIVE')}
                  };
                  const api={storage:{local:browser.storage.local},downloads:downloadsAPI,
                    runtime:{getManifest:()=>browser.runtime.getManifest()}};
                  const runner=runnerModule.createAutoRunner(api,{
                    open:async()=>db,clock:()=>timestamp,newId:()=>('2'.repeat(32)),
                    native:async()=>{nativeCalls++;return {ok:true,passphrase:'synthetic-portable-recovery-passphrase'};},
                    seal:async()=>({bytes:new Uint8Array([2,3,4]),sha256:'b'.repeat(64)})
                  });
                  const first=await runner.tick(),duplicate=await runner.tick();
                  const saved=await state.read();
                  if(first.ok!==true||duplicate.code!=='BACKUP_ALREADY_DONE'||
                    downloads!==1||nativeCalls!==1||saved.state.archives.length!==1||
                    saved.state.archives[0].state!=='COMPLETE'||saved.state.archives[0].kind!=='AUTO'||
                    saved.state.archives[0].filename!==('/home/fixture/Downloads/'+filename))
                    throw Error('SYNTHETIC_DOWNLOAD_OR_DUPLICATE');
                  const blockedStore=storeModule.createAutoStore(secondDb,()=>timestamp);
                  await blockedStore.enabled(true);
                  let blockedDownloads=0;
                  const locked=runnerModule.createAutoRunner({
                    storage:{local:browser.storage.local},
                    downloads:{...downloadsAPI,download:async()=>{blockedDownloads++;return 701;}}
                  },{
                    open:async()=>secondDb,clock:()=>timestamp,newId:()=>('3'.repeat(32)),
                    native:async()=>({ok:false,code:'LOCKED'}),
                    seal:async()=>{throw Error('ENCRYPTION_ON_LOCKED_VAULT');}
                  });
                  const held=await locked.tick(),heldState=await blockedStore.read();
                  if(held.code!=='SUSPENDED_KEY_UNAVAILABLE'||blockedDownloads!==0||
                    heldState.state.archives.length!==0||heldState.state.status!=='SUSPENDED')
                    throw Error('LOCKED_VAULT_FALLBACK_FAILED');
                  db.close();secondDb.close();
                  return {ok:true,actual,downloads,held:held.code};
                })().then(done).catch(e=>done({ok:false,code:String(e)}));"""
                i15=call('POST',f'/session/{after}/execute/async',{'script':i15_code,'args':[]},timeout=90)
                assert i15.get('ok') is True,i15
                print('B I15_INSTALLED_BACKGROUND_PORT_DAILY_VAULT_SUSPENSION_AND_TRACKED_DOWNLOAD=PASS',flush=True)

                # I16 B: actual installed XPI, extension Settings DOM and real
                # canonical IDB + Firefox local-storage guard. Independent
                # synthetic archives only; no donor/provider/live mutation.
                i16_ui=execute(after,"return {archive:!!document.getElementById('pcms-restore-archive'),checkpoint:!!document.getElementById('pcms-restore-checkpoint'),preview:!!document.getElementById('pcms-restore-preview'),stage:!!document.getElementById('pcms-restore-verify')}")
                assert all(i16_ui.values()),i16_ui

                # I16 B/UX: exercise actual file-input UI, not just existence.
                # The checkpoint is a separate on-disk file that Firefox must
                # read via WebDriver's native file input.
                ui_seal="""const done=arguments[arguments.length-1];
                (async()=>{
                  const pkg=await import('../lib/backup-package.js');
                  const core=await import('./backup-core.mjs');
                  const journal=await import('./journal.mjs');
                  const hist=await import('../lib/automation-history.js');
                  const db=await journal.openCanonicalDatabase();
                  const pcms=await core.snapshotCanonical(db);db.close();
                  const donor=await (await import('./donor-snapshot.mjs')).readProtectedDonorSnapshot(browser);
                  const local=await browser.storage.local.get(null),userscriptData={};
                  for(const [key,value] of Object.entries(local))
                    if(key==='automationJobs'||key.startsWith('gm-values:'))
                      userscriptData[key]=value;
                  const opts={state:donor.state,containers:donor.containers,
                    userscriptData,selection:{kind:'full'},
                    automationHistory:hist.filterOrdinaryAutomationJobs(
                      Object.values(userscriptData.automationJobs||{}))};
                  const first=pkg.createPortableBackupPayload(opts),cookies={};
                  const mappings={};
                  for(const persona of first.personas){
                    mappings[persona.key]=persona.sourceId;
                    cookies[persona.sourceId]=await browser.runtime.sendMessage({
                      type:'PERSONA_COOKIES_LIST',profileId:persona.sourceId});
                    if(!Array.isArray(cookies[persona.sourceId]))
                      throw Error('UI_COOKIE_RETRIEVAL_FAILED');
                  }
                  const password='i16-ui-file-checkpoint-local-only-passphrase';
                  const wrapped=await pkg.encodeBackupEnvelope({
                    payload:pkg.createPortableBackupPayload({...opts,cookiesByProfile:cookies}),
                    password,scope:{kind:'full'}});
                  const archive=await core.encodeIntegrated({
                    pcms,donorEnvelope:wrapped,passphrase:password});
                  return {archive:archive.text,password,mappings};
                })().then(done).catch(e=>done({error:String(e)}));"""
                ui_data=call('POST',f'/session/{after}/execute/async',
                             {'script':ui_seal,'args':[]},timeout=90)
                assert isinstance(ui_data.get('archive'),str),ui_data
                path_a=pathlib.Path(folder)/'i16-ui-import.encrypted'
                path_b=pathlib.Path(folder)/'i16-pre-restore-on-disk.encrypted'
                path_a.write_text(ui_data['archive'])
                path_b.write_text(ui_data['archive'])
                for css,filepath in [('#pcms-restore-archive',path_a),
                                      ('#pcms-restore-checkpoint',path_b)]:
                    element=call('POST',f'/session/{after}/element',
                                 {'using':'css selector','value':css})
                    element_id=element['element-6066-11e4-a52e-4f735466cecf']
                    call('POST',f'/session/{after}/element/{element_id}/value',
                         {'text':str(filepath),'value':list(str(filepath))})
                setup_ui="const p=document.getElementById('pcms-restore-passphrase');p.value="+json.dumps(ui_data['password'])+";document.getElementById('pcms-restore-mappings').value="+json.dumps(json.dumps(ui_data['mappings']))+";document.getElementById('pcms-restore-preview').click();return true"
                assert execute(after,setup_ui) is True
                preview_result=None
                for _ in range(80):
                    preview_result=execute(after,"return {status:document.getElementById('pcms-restore-status').textContent,plan:document.getElementById('pcms-restore-details').textContent,verifyDisabled:document.getElementById('pcms-restore-verify').disabled}")
                    if not preview_result['verifyDisabled'] or 'Restore held:' in preview_result['status']:break
                    time.sleep(.1)
                assert preview_result['verifyDisabled'] is False,preview_result
                assert 'Authenticated plan:' in preview_result['plan'],preview_result
                assert execute(after,"document.getElementById('pcms-restore-verify').click();return true")
                disk_result=None
                for _ in range(80):
                    disk_result=execute(after,"return {status:document.getElementById('pcms-restore-status').textContent,button:document.getElementById('pcms-restore-apply').disabled}")
                    if 'Checkpoint file independently re-read' in disk_result['status'] or 'Checkpoint not proven' in disk_result['status']:break
                    time.sleep(.1)
                assert 'Checkpoint file independently re-read' in disk_result['status'],disk_result
                assert disk_result['button'] is True,disk_result
                print('B I16_REAL_FILE_INPUT_AUTHENTICATED_PREVIEW_CHECKPOINT_UI=PASS',flush=True)

                i16_code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const restore=await import('./restore-core.mjs');
                  const gateModule=await import('./restore-gate.mjs');
                  const stages=await import('./restore-stage.mjs');
                  const core=await import('./backup-core.mjs');
                  const pkg=await import('../lib/backup-package.js');
                  const journal=await import('./journal.mjs');
                  const db=await journal.openCanonicalDatabase();
                  const currentPcms=await core.snapshotCanonical(db);db.close();
                  const password='I16-real-packaged-synthetic-passphrase';
                  const currentDonor={state:{},containers:[]};
                  const portable=pkg.createPortableBackupPayload({
                    state:{},containers:[],selection:{kind:'full'}});
                  const inner=await pkg.encodeBackupEnvelope({payload:portable,password});
                  const a=await core.encodeIntegrated({
                    pcms:currentPcms,donorEnvelope:inner,passphrase:password});
                  const pre=await restore.previewRestore({
                    archiveText:a.text,password,decodeDonor:pkg.decodeBackupEnvelope,
                    mode:'merge',fresh:false,mappings:{},currentPcms,
                    currentDonor,currentPortable:portable,containers:[]});
                  let wrongPasswordHeld=false;
                  try{await restore.previewRestore({
                    archiveText:a.text,password:'wrong',
                    decodeDonor:pkg.decodeBackupEnvelope,mode:'merge',
                    mappings:{},currentPcms,currentDonor,currentPortable:portable,containers:[]});}
                  catch{wrongPasswordHeld=true;}
                  let tier2Held=false;
                  try{await restore.verifyCheckpoint({
                    checkpointText:a.text,password,
                    decodeDonor:pkg.decodeBackupEnvelope,currentPcms,
                    currentPortable:portable,archivedAtLeastTier:2});}
                  catch{tier2Held=true;}
                  const disk=await restore.verifyCheckpoint({
                    checkpointText:a.text,password,
                    decodeDonor:pkg.decodeBackupEnvelope,currentPcms,
                    currentPortable:portable,archivedAtLeastTier:3});
                  const gate=gateModule.createRestoreGate(browser.storage.local);
                  const before=await gate.inspect();
                  if(before.held)throw Error('UNEXPECTED_EXISTING_RESTORE_HOLD');
                  const row=await gate.begin({
                    planSha256:pre.planSha256,reviewedPlanSha256:pre.planSha256,
                    archiveSha256:pre.plan.archiveSha256,
                    destinationSha256:pre.plan.destinationSha256,
                    checkpointSha256:disk.sha256,checkpointTier:3,fresh:true});
                  const sentinel=await journal.createRestoreSentinel(browser.storage.local).inspect();
                  const read=await gateModule.createRestoreGate(browser.storage.local).inspect();
                  let unintended=0;
                  const engine=stages.createRestoreStageEngine(gate,{
                    dispatch:async()=>{unintended++;},readback:async()=>({
                      source:'INDEPENDENT_READBACK',digest:'f'.repeat(64)})});
                  const forbidden=await engine.execute({epoch:row.epoch,
                    revision:row.revision,group:'donor-personas',step:'synthetic',
                    fingerprint:'a'.repeat(64)});
                  if(unintended!==1||forbidden.groups['donor-personas'].status!=='HELD_UNCERTAIN')
                    throw Error('STAGED_HOLD_NOT_DURABLE');
                  let duplicateBlocked=false;
                  try{await engine.execute({epoch:row.epoch,revision:forbidden.revision,
                    group:'donor-personas',step:'synthetic',
                    fingerprint:'a'.repeat(64)});}
                  catch{duplicateBlocked=true;}
                  if(!wrongPasswordHeld||!tier2Held||!disk.verified||
                    !sentinel.held||!read.held||!duplicateBlocked)
                    throw Error('RESTORE_SECURITY_ORACLE_MISSING');
                  done({ok:true,wrongPasswordHeld,tier2Held,
                    canonicalRecords:currentPcms.stores.meta.length,
                    noBlindReplay:duplicateBlocked,restoreHold:sentinel.code,
                    controller:read.controller,sha:a.sha256});
                })().catch(e=>done({ok:false,error:String(e)}));"""
                proof=call('POST',f'/session/{after}/execute/async',
                           {'script':i16_code,'args':[]},timeout=90)
                assert proof.get('ok') is True,proof
                assert proof.get('controller')=='INACTIVE',proof
                assert re.fullmatch('[a-f0-9]{64}',proof.get('sha','')),proof
                # The extension page cannot remove the independent restore
                # sentinel. A full page navigation must retain the hold.
                call('POST',f'/session/{after}/url',{'url':url+'#settings'})
                persistence=execute(after,"return browser.storage.local.get('pcmsRestoreInProgress').then(v=>v.pcmsRestoreInProgress?.active===true)")
                assert persistence is True,persistence
                print('B I16_INSTALLED_AUTHENTICATED_PREVIEW_DURABLE_GUARD_NO_REPLAY=PASS',flush=True)



                i16_db_code="""const done=arguments[arguments.length-1];
                (async()=>{
                  const journal=await import('./journal.mjs');
                  const core=await import('./backup-core.mjs');
                  const sanitize=await import('./restore-sanitize.mjs');
                  const idb=await import('./restore-idb.mjs');
                  const gate=await import('./restore-gate.mjs');
                  const db=await journal.openCanonicalDatabase();
                  try{
                    const before=await core.snapshotCanonical(db);
                    const incoming={schema:1,stores:Object.fromEntries(
                      core.DB_STORES.map(s=>[s,[]]))};
                    incoming.stores.meta.push({key:'release:restore-b',
                      value:core.serializeClone({key:'release:restore-b',
                        release:{state:'APPROVED',approval:{human:true},
                          dispatchPossible:false}})});
                    const prepared=sanitize.prepareRestoredCanonical({
                      incoming,current:before,mode:'replace',uidRemap:{}});
                    let unheldBlocked=false;
                    try{await idb.applyCanonicalSnapshot(db,prepared,{
                      assertHeld:async()=>false,expectedBefore:before});}
                    catch{unheldBlocked=true;}
                    const untouched=await core.snapshotCanonical(db);
                    if(!unheldBlocked||
                      JSON.stringify(before)!==JSON.stringify(untouched))
                      throw Error('CANONICAL_UNGUARDED_WRITE');
                    const sentinel=gate.createRestoreGate(browser.storage.local);
                    if(!(await sentinel.inspect()).held)
                      throw Error('RESTORE_SENTINEL_NOT_DURABLE');
                    const receipt=await idb.applyCanonicalSnapshot(db,prepared,{
                      assertHeld:async()=>(await sentinel.inspect()).held,expectedBefore:before});
                    const after=await core.snapshotCanonical(db);
                    const release=after.stores.meta.find(r=>r.key==='release:restore-b');
                    if(receipt.source!=='INDEPENDENT_READBACK'||
                       release?.value?.release?.state!=='RESTORE_REVIEW_REQUIRED'||
                       release?.value?.release?.approval!==null)
                      throw Error('IMPORTED_APPROVAL_NOT_INERT');
                    return {ok:true,hold:true,
                      receiptDigest:receipt.digest,
                      status:release.value.release.state};
                  }finally{db.close();}
                })().then(done).catch(e=>done({ok:false,error:String(e)}));"""
                i16_db=call('POST',f'/session/{after}/execute/async',
                            {'script':i16_db_code,'args':[]},timeout=75)
                assert i16_db.get('ok') is True,i16_db
                print('B I16_REAL_IDB_GUARDED_ATOMIC_RESTORE_AND_APPROVAL_HOLD=PASS',flush=True)

                # I16 actual same-XPI restore port, actual guarded donor state
                # manager and real IndexedDB, all within isolated Firefox CI.
                # Clearing the previous fake-test guard is harness-only fixture
                # cleanup; shipped UI/runtime expose no guard-clear command.
                i16_end_to_end="""const done=arguments[arguments.length-1];
                (async()=>{
                  await browser.storage.local.remove('pcmsRestoreInProgress');
                  const core=await import('./backup-core.mjs');
                  const restore=await import('./restore-core.mjs');
                  const journal=await import('./journal.mjs');
                  const pkg=await import('../lib/backup-package.js');
                  const automation=await import('../lib/automation-history.js');
                  const db=await journal.openCanonicalDatabase();
                  const current=await core.snapshotCanonical(db);db.close();
                  const donor=await (await import('./donor-snapshot.mjs')).readProtectedDonorSnapshot(browser);
                  if(!donor?.state||!Array.isArray(donor.containers))
                    throw Error('DONOR_SNAPSHOT_UNAVAILABLE');
                  const stored=await browser.storage.local.get(null);
                  const extra=Object.create(null);
                  for(const [k,v] of Object.entries(stored))
                    if(k==='automationJobs'||k.startsWith('gm-values:'))extra[k]=v;
                  const args={state:donor.state,containers:donor.containers,
                    userscriptData:extra,selection:{kind:'full'},
                    automationHistory:automation.filterOrdinaryAutomationJobs(
                      Object.values(extra.automationJobs||{}))};
                  const initial=pkg.createPortableBackupPayload(args),cookies={};
                  const mappings={};
                  for(const person of initial.personas){
                    mappings[person.key]=person.sourceId;
                    cookies[person.sourceId]=await browser.runtime.sendMessage({
                      type:'PERSONA_COOKIES_LIST',profileId:person.sourceId});
                    if(!Array.isArray(cookies[person.sourceId]))
                      throw Error('COOKIE_READ_MISSING');
                  }
                  const portable=pkg.createPortableBackupPayload({...args,cookiesByProfile:cookies});
                  const password='synthetic-i16-installed-local-restore-passphrase';
                  const donorFile=await pkg.encodeBackupEnvelope({
                    payload:portable,password,scope:{kind:'full'}});
                  const checkpoint=await core.encodeIntegrated({
                    pcms:current,donorEnvelope:donorFile,passphrase:password});
                  const incoming=structuredClone(current);
                  incoming.stores.meta.push({key:'release:i16-new-historical',
                    value:core.serializeClone({key:'release:i16-new-historical',
                      release:{state:'APPROVED',approval:{old:true},dispatchPossible:false}})});
                  const source=await core.encodeIntegrated({
                    pcms:incoming,donorEnvelope:donorFile,passphrase:password});
                  const reviewed=await restore.previewRestore({
                    archiveText:source.text,password,mode:'merge',mappings,
                    currentPcms:current,currentDonor:donor,currentPortable:portable,
                    containers:donor.containers,decodeDonor:pkg.decodeBackupEnvelope
                  });
                  const answer=await new Promise(resolve=>{
                    const port=browser.runtime.connect({name:'pcms-i16-restore'});
                    let complete=false;
                    const done=result=>{
                      if(complete)return;complete=true;
                      try{port.disconnect();}catch{}
                      resolve(result);
                    };
                    port.onMessage.addListener(done);
                    port.onDisconnect.addListener(()=>done({ok:false,code:'RESTORE_PORT_CLOSED'}));
                    port.postMessage({action:'APPLY',params:{
                      archiveText:source.text,checkpointText:checkpoint.text,
                      password,mode:'merge',fresh:false,mappings,
                      reviewedPlanSha256:reviewed.planSha256}});
                  });
                  const marker=(await browser.storage.local.get('pcmsRestoreInProgress'))
                    .pcmsRestoreInProgress;
                  const checked=await journal.openCanonicalDatabase();
                  const after=await core.snapshotCanonical(checked);checked.close();
                  const extraRelease=after.stores.meta.find(r=>r.key==='release:i16-new-historical');
                  if(!answer.ok||marker?.status!=='COMPLETE_INACTIVE'||
                    !marker.active||extraRelease?.value?.release?.state!=='RESTORE_REVIEW_REQUIRED'||
                    extraRelease.value.release.approval!==null)
                    throw Error('RESTORE_COMPLETE_OR_AUTHORITY_INCORRECT:'+JSON.stringify({
                      code:answer.code,marker:marker?.status,release:extraRelease?.value?.release?.state
                    }));
                  return {ok:true,groups:Object.keys(marker.groups).length,
                    status:marker.status,source:source.sha256};
                })().then(done).catch(e=>done({ok:false,error:String(e)}));"""
                i16_full=call('POST',f'/session/{after}/execute/async',
                              {'script':i16_end_to_end,'args':[]},timeout=120)
                assert i16_full.get('ok') is True,i16_full
                assert i16_full.get('groups')==4,i16_full
                print('B I16_REAL_GUARDED_DONOR_AND_CANONICAL_STAGED_RESTORE_INACTIVE=PASS',flush=True)

                # Full Firefox process restart, not just UI navigation.
                close(after)
                after=open_session(browser,profile)
                uuid=addons_uuid(profile)
                call('POST',f'/session/{after}/url',
                     {'url':f'moz-extension://{uuid}/pcms/index.html#settings'})
                recovery=execute(after,"return Promise.all([browser.storage.local.get('pcmsRestoreInProgress'),import('./journal.mjs').then(j=>j.openCanonicalDatabase()).then(async db=>{try{const r=await new Promise(resolve=>{const q=db.transaction('meta','readonly').objectStore('meta').get('release:restore-b');q.onsuccess=()=>resolve(q.result)});return r?.release?.state;}finally{db.close()}})]).then(([s,r])=>({held:s.pcmsRestoreInProgress?.active===true,release:r}))")
                assert recovery=={'held':True,'release':'RESTORE_REVIEW_REQUIRED'},recovery
                print('B I16_PACKAGED_FULL_FIREFOX_RESTART_INACTIVE_RESTORE_PERSISTED=PASS',flush=True)


                # I16 fresh disposable Firefox profile, separate from the old
                # controller. Only synthetic local Persona/IDB writes. A
                # pre-existing UID forces donor-authoritative collision remap.
                close(after)
                # Old controller process genuinely alive in parallel with NEW.
                # Both profiles are CI-disposable and use the same installed XPI.
                old_daemon=subprocess.Popen([
                    str(browser),'-headless','-no-remote','-profile',str(profile)],
                    stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
                time.sleep(.7)
                assert old_daemon.poll() is None,'OLD_PROFILE_NOT_RUNNING'
                fresh_profile=pathlib.Path(folder)/'fresh-profile'
                fresh_profile.mkdir()
                (fresh_profile/'user.js').write_text('user_pref("xpinstall.signatures.required", false);\n')
                fresh_initial=open_session(browser,fresh_profile)
                try:
                    installed=call('POST',f'/session/{fresh_initial}/moz/addon/install',
                                   {'path':str(archive),'temporary':False},timeout=45)
                    assert installed==ID,installed
                finally: close(fresh_initial)
                after=open_session(browser,fresh_profile)
                new_uuid=addons_uuid(fresh_profile)
                call('POST',f'/session/{after}/url',
                     {'url':f'moz-extension://{new_uuid}/pcms/index.html#settings'})
                wait_donor_ready(after)  # No synthetic CREATE before donor bootstrap.
                fresh_script="""const done=arguments[arguments.length-1];
                (async()=>{
                  const core=await import('./backup-core.mjs');
                  const review=await import('./restore-core.mjs');
                  const journal=await import('./journal.mjs');
                  const pkg=await import('../lib/backup-package.js');
                  const automation=await import('../lib/automation-history.js');
                  const previousUid='11111111-1111-4111-8111-111111111111';
                  const holder=await browser.runtime.sendMessage({
                    type:'CREATE_PERSONA',input:{name:'CI collision holder',
                      routeId:'__block__',profile:{personaUid:previousUid,
                        killSwitch:true,blockLocalNetwork:true}}});
                  const sourceId=holder?.container?.cookieStoreId;
                  if(!sourceId||holder?.profile?.personaUid!==previousUid)
                    throw Error('DONOR_HOLDER_NOT_CREATED');
                  const donor=await (await import('./donor-snapshot.mjs')).readProtectedDonorSnapshot(browser);
                  const db=await journal.openCanonicalDatabase();
                  const canonical=await core.snapshotCanonical(db);db.close();
                  const stored=await browser.storage.local.get(null);
                  const extras=Object.create(null);
                  for(const [k,v] of Object.entries(stored||{}))
                    if(k==='automationJobs'||k.startsWith('gm-values:'))extras[k]=v;
                  const params={state:donor.state,containers:donor.containers,
                    userscriptData:extras,selection:{kind:'full'},
                    automationHistory:automation.filterOrdinaryAutomationJobs(
                      Object.values(extras.automationJobs||{}))};
                  const initial=pkg.createPortableBackupPayload(params);
                  const cookieData=Object.create(null);
                  for(const p of initial.personas){
                    const found=await browser.runtime.sendMessage({
                      type:'PERSONA_COOKIES_LIST',profileId:p.sourceId});
                    if(!Array.isArray(found))throw Error('COOKIE_LIST_UNAVAILABLE');
                    cookieData[p.sourceId]=found;
                  }
                  const currentPortable=pkg.createPortableBackupPayload({
                    ...params,cookiesByProfile:cookieData});
                  const password='synthetic-i16-fresh-profile-backup-passphrase';
                  const prevEnvelope=await pkg.encodeBackupEnvelope({
                    payload:currentPortable,password,scope:{kind:'full'}});
                  const checkpoint=await core.encodeIntegrated({
                    pcms:canonical,donorEnvelope:prevEnvelope,passphrase:password});
                  const importedProfile=structuredClone(holder.profile);
                  importedProfile.containerId='firefox-container-old';
                  importedProfile.personaUid=previousUid;
                  importedProfile.routeId='__block__';
                  importedProfile.killSwitch=true;
                  importedProfile.blockLocalNetwork=true;
                  importedProfile.managed=true;
                  const incomingDonor=structuredClone(donor.state);
                  incomingDonor.profiles={'firefox-container-old':importedProfile};
                  incomingDonor.scripts={};incomingDonor.workflows={};
                  const importedPortable=pkg.createPortableBackupPayload({
                    state:incomingDonor,selection:{kind:'full'},
                    containers:[{cookieStoreId:'firefox-container-old',name:'CI imported'}],
                    cookiesByProfile:{'firefox-container-old':[]}});
                  if(importedPortable.personas.length!==1)
                    throw Error('IMPORT_FIXTURE_PERSONA_MISSING');
                  const portableEnvelope=await pkg.encodeBackupEnvelope({
                    payload:importedPortable,password,scope:{kind:'full'}});
                  const restoredPcms={schema:1,stores:Object.fromEntries(
                    core.DB_STORES.map(k=>[k,[]]))};
                  restoredPcms.stores.meta.push({key:'account:restored-fresh',
                    value:core.serializeClone({key:'account:restored-fresh',
                      account:{accountId:'restored-fresh',personaUid:previousUid,
                        state:'VERIFIED',revision:1,identity:{session:'old-evidence'}}})});
                  const archive=await core.encodeIntegrated({
                    pcms:restoredPcms,donorEnvelope:portableEnvelope,passphrase:password});
                  const mappings={[importedPortable.personas[0].key]:'__create__'};
                  const inspected=await review.previewRestore({
                    archiveText:archive.text,password,mode:'merge',fresh:true,
                    mappings,currentPcms:canonical,currentDonor:donor,
                    currentPortable,containers:donor.containers,
                    decodeDonor:pkg.decodeBackupEnvelope});
                  if(inspected.plan.risk.newContainers!==1||
                     inspected.plan.groups[0].status!=='CREATE_REQUESTED')
                    throw Error('FRESH_RESTORE_RISK_NOT_DISCLOSED');
                  async function send(action,params){
                    return new Promise(resolve=>{
                      const port=browser.runtime.connect({name:'pcms-i16-restore'});
                      let settled=false;
                      function settle(x){
                        if(settled)return;settled=true;
                        try{port.disconnect();}catch{}
                        resolve(x);
                      }
                      port.onMessage.addListener(settle);
                      port.onDisconnect.addListener(()=>settle({ok:false,code:'PORT_CLOSED'}));
                      port.postMessage({action,params});
                    });
                  }
                  const result=await send('APPLY',{
                    archiveText:archive.text,checkpointText:checkpoint.text,
                    password,mode:'merge',fresh:true,mappings,
                    reviewedPlanSha256:inspected.planSha256});
                  const after=await (await import('./donor-snapshot.mjs')).readProtectedDonorSnapshot(browser);
                  const marker=(await browser.storage.local.get('pcmsRestoreInProgress'))
                    .pcmsRestoreInProgress;
                  const imported=Object.entries(after.state.profiles||{})
                    .filter(([id,p])=>id!==sourceId&&p.managed===true&&
                      p.routeId==='__block__'&&p.personaUid!==previousUid);
                  const saved=await journal.openCanonicalDatabase();
                  const receipt=await new Promise(resolve=>{
                    const req=saved.transaction('meta','readonly').objectStore('meta')
                      .get('account:restored-fresh');
                    req.onsuccess=()=>resolve(req.result);
                  });
                  saved.close();
                  const again=await send('APPLY',{});
                  const activate=await send('ACTIVATE',{});
                  if(!result.ok||marker?.status!=='COMPLETE_INACTIVE'||
                    marker.fresh!==true||
                    after.state.profiles[sourceId]?.personaUid!==previousUid||
                    imported.length!==1||
                    receipt?.account?.personaUid!==imported[0][1].personaUid||
                    receipt?.account?.identity!==null||
                    receipt?.account?.state!=='VERIFICATION_PENDING'||
                    again.code!=='RESTORE_INPUT_INVALID'&&again.code!=='RESTORE_ALREADY_HELD'||
                    activate.code!=='RESTORE_COMMAND_NOT_ALLOWED')
                    throw Error('FRESH_RESTORE_COLLISION_OR_HOLD:'+JSON.stringify({
                      code:result.code,status:marker?.status,fresh:marker?.fresh,
                      imported:imported.length,account:receipt?.account?.state,
                      reapply:again.code,activate:activate.code
                    }));
                  return {ok:true,targetUid:imported[0][1].personaUid,
                    originalUid:previousUid,sourceContainer:sourceId,
                    status:marker.status,groups:Object.keys(marker.groups).length};
                })().then(done).catch(e=>done({ok:false,error:String(e)}));"""
                fresh_result=call('POST',f'/session/{after}/execute/async',
                                  {'script':fresh_script,'args':[]},timeout=120)
                assert fresh_result.get('ok') is True,fresh_result
                assert old_daemon.poll() is None,'OLD_CONTROLLER_NOT_CONCURRENT'
                assert fresh_result.get('groups')==4,fresh_result
                close(after)
                after=open_session(browser,fresh_profile)
                new_uuid=addons_uuid(fresh_profile)
                call('POST',f'/session/{after}/url',
                     {'url':f'moz-extension://{new_uuid}/pcms/index.html#settings'})
                fresh_restored=execute(after,"return browser.storage.local.get('pcmsRestoreInProgress').then(s=>({active:s.pcmsRestoreInProgress?.active,fresh:s.pcmsRestoreInProgress?.fresh,status:s.pcmsRestoreInProgress?.status}))")
                assert fresh_restored=={'active':True,'fresh':True,'status':'COMPLETE_INACTIVE'},fresh_restored
                print('B I16_FRESH_PROFILE_UID_COLLISION_BLOCK_ROUTE_INACTIVE_RESTART=PASS',flush=True)
                # S02 B: the same persistently installed production XPI,
                # in the disposable *fresh* Firefox profile, reconstructs
                # complete v2 source and applies inactive canonical records
                # through actual I16 guarded IDB production module. This uses
                # a fixture native terminal receipt, NOT H disk/native proof.
                fresh_v2="""const done=arguments[arguments.length-1];
                (async()=>{
                  const v2=await import('./backup-v2-codec.mjs');
                  const prepare=await import('./restore-v2-prep.mjs');
                  const restore=await import('./restore-idb.mjs');
                  const core=await import('./backup-core.mjs');
                  const donor=await import('../lib/backup-package.js');
                  const password='s02-disposable-fresh-restore-passphrase';
                  const text=new TextEncoder();
                  const names=[['main.pjs',text.encode('output = "V2 fresh"')],
                    ['index.html',text.encode('<b>V2 fresh</b>')],
                    ['src/asset.bin',new Uint8Array([0,255,7,0,12])]];
                  const files=await Promise.all(names.map(async([path,bytes])=>({
                    path,size:bytes.length,sha256:await core.digest(bytes)})));
                  files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
                  const blobs=names.map(([path,bytes])=>({path,base64:
                    btoa(String.fromCharCode(...bytes))})).sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
                  const fingerprint=await core.digest('PCMS_STAGED_SOURCE_V1'+String.fromCharCode(10)+files.map(
                    f=>JSON.stringify([f.path,f.size,f.sha256])).join(String.fromCharCode(10)));
                  const src={ok:true,fingerprint,files,blobs};
                  const empty={schema:1,stores:Object.fromEntries(
                    core.DB_STORES.map(k=>[k,[]]))};
                  const incoming=structuredClone(empty);
                  incoming.stores.meta.push({key:'stage:v2-fresh',
                    value:{key:'stage:v2-fresh',record:{candidate:src,previous:src}}});
                  const sealed=await donor.encodeBackupEnvelope({payload:
                    donor.createPortableBackupPayload({state:{},containers:[],selection:{kind:'full'}}),
                    password});
                  const plan=await v2.compileV2(incoming,sealed);
                  const chunks=[];for await(const part of v2.streamV2Frames(plan))chunks.push(part);
                  const plain=new Uint8Array(plan.plaintextBytes);let i=0;
                  for(const part of chunks){plain.set(part,i);i+=part.length;}
                  const digest='a'.repeat(64);
                  const restored=await prepare.prepareInactiveV2({
                    authenticatedPlaintext:plain,
                    readback:{state:'AUTHENTICATED_SECOND_PASS',sha256:digest},
                    expectedCiphertextSha256:digest,password,
                    decodeDonor:donor.decodeBackupEnvelope,
                    currentPcms:empty,mode:'replace'});
                  const dbName='s02-fresh-'+crypto.randomUUID();
                  const open=()=>new Promise((resolve,reject)=>{
                    const req=indexedDB.open(dbName,1);
                    req.onupgradeneeded=()=>{
                      for(const [name,keyPath] of Object.entries({
                        entities:'id',operations:'operationId',meta:'key',observations:'id'}))
                        req.result.createObjectStore(name,{keyPath});
                      req.result.createObjectStore('events',{autoIncrement:true});
                    };
                    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
                  });
                  let db=await open();
                  const held=async()=>{
                    const state=(await browser.storage.local.get('pcmsRestoreInProgress'))
                      .pcmsRestoreInProgress;
                    return state?.active===true&&state.status==='COMPLETE_INACTIVE';
                  };
                  const applied=await restore.applyCanonicalSnapshot(db,restored.prepared,{
                    assertHeld:held,expectedBefore:empty});
                  db.close();db=await open();
                  const after=await core.snapshotCanonical(db);
                  db.close();
                  // F2: even a receipt-shaped UI object cannot authorize
                  // restore without a matching previously committed v2
                  // source/cut/run ledger AND the actual one-port terminal ACK.
                  const protectedRestore=await import('./restore-v2-candidate.mjs');
                  const v2Ledger=await import('./backup-v2-session.mjs');
                  const traceDb=await open();
                  const runId='s02_'+crypto.randomUUID().replaceAll('-','');
                  const ledger=v2Ledger.createV2Ledger(traceDb);
                  let active=await ledger.claim(runId,'c'.repeat(64),plain.length);
                  for(const [prior,next,patch] of [
                    ['PREPARED','CREATE_POSSIBLE',{}],
                    ['CREATE_POSSIBLE','OPEN_OBSERVED',{}],
                    ['OPEN_OBSERVED','APPEND_POSSIBLE',{}],
                    ['APPEND_POSSIBLE','OPEN_OBSERVED',
                      {acceptedBytes:plain.length,nextSequence:1}],
                    ['OPEN_OBSERVED','FINISH_POSSIBLE',{}],
                    ['FINISH_POSSIBLE','WRITTEN_UNVERIFIED',{}],
                    ['WRITTEN_UNVERIFIED','AUTHENTICATED_INVENTORY_ONLY',
                      {ciphertextSha256:digest,observedBlobs:3}]
                  ])active=await ledger.advance(runId,active.revision,prior,next,patch);
                  const nativeCalls=[],nativeBytes=[];
                  for(let j=0;j<plain.length;j+=30000)
                    nativeBytes.push(plain.subarray(j,j+30000));
                  const conn=()=>({close(){},
                    async exchange(cmd){
                      nativeCalls.push(cmd.action);
                      if(cmd.action==='restore.begin')return {ok:true,runId:cmd.runId,
                        state:'INACTIVE_STAGING_REQUIRED',
                        plaintextBytes:plain.length,sha256:digest};
                      if(cmd.action==='archive.recovery.complete')return {
                        ok:true,state:'RECOVERY_VERIFIED',runId,
                        sha256:digest,activation:'OFF'};
                      if(cmd.action==='restore.read'){
                        const bytes=nativeBytes[cmd.sequence];
                        if(!bytes)throw Error('NO_MORE_NATIVE_BYTES');
                        const complete=cmd.sequence===nativeBytes.length-1;
                        return {ok:true,sequence:cmd.sequence,runId:cmd.runId,complete,
                          bytes:btoa(String.fromCharCode(...bytes)),
                          state:complete?'AUTHENTICATED_SECOND_PASS':
                            'INACTIVE_STAGING_FRAGMENT',
                          ...(complete?{sha256:digest}:{})};
                      }
                      return {ok:false,code:'UNEXPECTED_NATIVE'};
                    }});
                  let falseReceiptDenied=false;
                  try{await protectedRestore.prepareTrackedV2Restore({
                    api:browser,canonicalDb:traceDb,
                    runId:'s02_'+crypto.randomUUID().replaceAll('-',''),
                    currentPcms:empty,connectionFactory:conn,
                    guard:{inspect:async()=>({held:true,activation:'OFF'})}
                  });}catch{falseReceiptDenied=true;}
                  const nativeStaged=await protectedRestore.prepareTrackedV2Restore({
                    api:browser,canonicalDb:traceDb,runId,currentPcms:empty,
                    uidRemap:{},mode:'replace',
                    vaultRead:async()=>({ok:true,passphrase:password}),
                    connectionFactory:conn,
                    guard:{inspect:async()=>({held:true,activation:'OFF'})}
                  });
                  traceDb.close();
                  const provenanceOkay=falseReceiptDenied&&
                    nativeStaged.status==='INACTIVE_PREPARED_NOT_APPLIED'&&
                    nativeStaged.nativeReceipt==='RECOVERY_VERIFIED'&&
                    nativeStaged.prepared.prepared.stores.meta[0].value.record.candidate
                      .blobs.some(x=>x.path==='src/asset.bin'&&x.base64==='AP8HAAw=')&&
                    nativeCalls[0]==='restore.begin'&&
                    nativeCalls.filter(x=>x==='restore.read').length===nativeBytes.length;
                  done({ok:applied.source==='INDEPENDENT_READBACK'&&
                    provenanceOkay&&
                    restored.activation==='OFF'&&restored.controller==='RESTORE_HELD'&&
                    after.stores.meta.length===1&&
                    after.stores.meta[0].value.record.candidate.blobs.find(x=>
                      x.path==='src/asset.bin')?.base64==='AP8HAAw='&&
                    (await held())===true,
                    sourceStatus:restored.status,rows:after.stores.meta.length});
                })().then(done).catch(e=>done({error:String(e)}));"""
                fresh_v2_result=call('POST',f'/session/{after}/execute/async',
                                     {'script':fresh_v2,'args':[]},timeout=120)
                assert fresh_v2_result.get('ok') is True,fresh_v2_result
                print('B S02_FRESH_FIREFOX_PROFILE_INACTIVE_V2_SOURCE_CANONICAL_RESTORE=PASS',flush=True)

                print('B PACKAGED_RESTART/NAVIGATION/DISABLED/ADVANCED: PASS',flush=True)
                close(after)
                after=None
                s01_add_account_profile(browser,archive,pathlib.Path(folder))
            finally:
                if after: close(after)
        finally:
            if old_daemon is not None:
                old_daemon.terminate()
                try: old_daemon.wait(timeout=5)
                except subprocess.TimeoutExpired: old_daemon.kill()
            server.terminate()
            try: server.wait(timeout=4)
            except subprocess.TimeoutExpired: server.kill()


if __name__=='__main__':
    if len(sys.argv)!=2: raise SystemExit('browser-i00-smoke.py path/to/combined.xpi')
    try: main()
    except Exception as exc:
        print('B HARNESS_OR_PRODUCT_FAILURE:',repr(exc),file=sys.stderr)
        raise
