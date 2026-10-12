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
                    view=execute(after,"return {title:document.title, selected:[...document.querySelectorAll('[data-view]')].filter(x=>!x.hidden).map(x=>x.dataset.view), links:[...document.querySelectorAll('[data-workspace]')].map(x=>x.getAttribute('href')), enabled:[...document.querySelectorAll('.workspace button')].filter(x=>!x.disabled).length}")
                    if view.get('selected'): break
                    time.sleep(.15)
                assert view['selected']==['overview'],view
                assert view['links']==['#overview','#generators','#work-queue','#accounts','#refresher','#settings'],view
                assert view['enabled']==0,view
                # The exact installed XPI must expose a read-only guarded
                # background status; no valid status enables PCMS effects.
                guard=guard_status(after)
                assert guard and guard.get('phase')=='I01',f'Missing I01 wake status: {guard}'
                assert guard.get('providerEffects')=='OFF',guard
                canonical=canonical_command(after,{'type':'SUMMARY'})
                assert canonical.get('ok') is True and canonical.get('storage')=='READY',canonical
                assert canonical.get('providerEffects')=='OFF',canonical
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
                view=execute(after,"return {selected:[...document.querySelectorAll('[data-view]')].filter(x=>!x.hidden).map(x=>x.dataset.view),active:document.querySelector('[aria-current=page]')?.dataset.workspace,blocked:document.querySelector('#view-accounts button')?.disabled}")
                assert view=={'selected':['accounts'],'active':'accounts','blocked':True},view
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
