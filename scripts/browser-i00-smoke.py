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
            'prefs':{'xpinstall.signatures.required':False,'extensions.autoDisableScopes':0}
        }
    }}}, timeout=60)
    return data['sessionId'] if 'sessionId' in data else data['value']['sessionId']


def execute(session, script):
    return call('POST',f'/session/{session}/execute/sync', {'script':script,'args':[]}, timeout=30)


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
        server=subprocess.Popen([str(driver),'--port',str(PORT)],stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
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
                call('POST',f'/session/{after}/url',{'url':url+'#accounts'})
                view=execute(after,"return {selected:[...document.querySelectorAll('[data-view]')].filter(x=>!x.hidden).map(x=>x.dataset.view),active:document.querySelector('[aria-current=page]')?.dataset.workspace,blocked:document.querySelector('#view-accounts button')?.disabled}")
                assert view=={'selected':['accounts'],'active':'accounts','blocked':True},view
                call('POST',f'/session/{after}/url',{'url':f'moz-extension://{uuid}/options/options.html'})
                title=execute(after,'return document.title')
                assert title, 'Original donor advanced option page not available'
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
