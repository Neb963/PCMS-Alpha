#!/usr/bin/env python3
"""A01 B/H disposable clean-home installed-XPI probe, no provider/private Git/host effects.

Uses the already pinned Firefox/driver from CI, and performs a persistent
install, real process exit, reopening and read-only UI inspection. Never
installs OS native helpers. A green probe is NOT feature or provider acceptance.
"""
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen

def main():
    if len(sys.argv)!=2:raise SystemExit('usage: a01-clean-firefox.py packaged.xpi')
    smoke=pathlib.Path(__file__).with_name('browser-i00-smoke.py')
    spec=importlib.util.spec_from_file_location('pcms_smoke_a01',smoke)
    mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
    mod.PORT=44449
    mod.HOST='http://127.0.0.1:44449'
    xpi=pathlib.Path(sys.argv[1]).resolve()
    assert xpi.is_file() and xpi.stat().st_size>1024
    binary=pathlib.Path(os.environ['FIREFOX_BINARY'])
    driver=pathlib.Path(os.environ['GECKODRIVER_BINARY'])
    with tempfile.TemporaryDirectory(prefix='pcms-a01-clean-home-') as folder:
        base=pathlib.Path(folder)
        home=base/'home';home.mkdir(mode=0o700)
        (home/'.config').mkdir();(home/'.local').mkdir()
        profile=base/'firefox-profile';profile.mkdir()
        (profile/'user.js').write_text('user_pref("xpinstall.signatures.required",false);\n')
        env={**os.environ,'HOME':str(home),'XDG_CONFIG_HOME':str(home/'.config'),
             'XDG_DATA_HOME':str(home/'.local')}
        daemon=subprocess.Popen([str(driver),'--port',str(mod.PORT),'--allow-system-access'],
            env=env,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
        session=None
        try:
            for _ in range(100):
                try:
                    with urlopen(mod.HOST+'/status',timeout=1) as response:
                        if json.load(response).get('value',{}).get('ready'):break
                except Exception:time.sleep(.2)
            else:raise AssertionError('CLEAN_DRIVER_NOT_READY')
            first=mod.open_session(binary,profile)
            prior=mod.owned_firefox_pids(profile)
            assert prior,'FIRST_PROCESS_NOT_VISIBLE'
            try:
                installed=mod.call('POST',f'/session/{first}/moz/addon/install',
                  {'path':str(xpi),'temporary':False},timeout=45)
                assert installed==mod.ID,('GECKO_ID_MISMATCH',installed)
            finally:mod.close(first)
            mod.require_owned_exit(profile,prior)
            session=mod.open_session(binary,profile)
            now=mod.owned_firefox_pids(profile)
            assert now and not prior.intersection(now),'NOT_A_PROCESS_RESTART'
            uuid=mod.addons_uuid(profile)
            mod.call('POST',f'/session/{session}/url',
                {'url':f'moz-extension://{uuid}/pcms/index.html'},timeout=30)
            observation={}
            for _ in range(70):
                observation=mod.execute(session,"""return {
                  title:document.title,
                  main:!!document.getElementById('pcms-faithful-host'),
                  shadow:!!document.getElementById('pcms-faithful-host')?.shadowRoot,
                  legacy:!!document.querySelector('body > .app'),
                  url:location.protocol,
                  manifest:browser.runtime.getManifest().browser_specific_settings?.gecko?.id,
                  storageReady:typeof browser.storage.local.get==='function',
                  alarmsReady:typeof browser.alarms.getAll==='function'
                }""")
                if observation.get('shadow'):break
                time.sleep(.15)
            assert observation.get('manifest')==mod.ID,observation
            assert observation.get('shadow'),('CLEAN_PRIMARY_NOT_MOUNTED',observation)
            assert observation.get('storageReady') and observation.get('alarmsReady'),observation
            routes={}
            for route in ('overview','generators','work-queue','accounts','refresher','settings'):
                mod.execute(session,"""const route=%s;
                  const sh=document.getElementById('pcms-faithful-host')?.shadowRoot;
                  const button=sh?.querySelector('[data-nav="'+route+'"]');
                  if(!button)throw Error('A01_MISSING_PRIMARY_NAV_'+route);
                  button.click();return true;"""%json.dumps(route))
                selected=None
                for _ in range(40):
                    selected=mod.execute(session,"return document.getElementById('pcms-faithful-host')?.shadowRoot?.querySelector('#page')?.dataset.view")
                    if selected==route:break
                    time.sleep(.1)
                if selected!=route:raise AssertionError(('PRIMARY_ROUTE_NOT_RENDERED',route,selected))
                routes[route]='SHOWN_READONLY_NO_EFFECT'
            # A04: exercise the real creator in the persistently installed
            # fully enabled XPI with 110 names (the old hard cap was 100).
            mod.execute(session,"""const sh=document.getElementById('pcms-faithful-host').shadowRoot;
              const nav=sh.querySelector('[data-nav="generators"]');
              if(!nav)throw Error('A04_GENERATORS_NAV_MISSING');
              nav.click();return true;""")
            opened=False
            for _ in range(60):
                opened=mod.execute(session,"""const sh=document.getElementById('pcms-faithful-host').shadowRoot;
                  const create=sh.querySelector('[data-action="create"]');
                  if(!create)return false;
                  create.click();
                  return !!sh.querySelector('.drawer-overlay textarea');""")
                if opened:break
                time.sleep(.15)
            assert opened,'A04_PRIMARY_CREATOR_UNAVAILABLE'
            slugs='\\n'.join('a04-installed-fixture-'+str(i).zfill(4) for i in range(110))
            submitted=mod.execute(session,"""const sh=document.getElementById('pcms-faithful-host').shadowRoot;
              const input=sh.querySelector('.drawer-overlay textarea');
              const action=sh.querySelector('.drawer-overlay button.btn.primary');
              if(!input||!action)throw Error('A04_PRIMARY_CREATOR_INCOMPLETE');
              input.value=%s;action.click();return true;"""%json.dumps(slugs))
            assert submitted
            batch=None
            for _ in range(120):
                reply=mod.coordinator_command(session,{'type':'LIST_CREATE_BATCHES',
                  'params':{'limit':10}})
                if reply.get('ok') and reply.get('items'):
                    batch=reply['items'][0]
                    if batch['state']!='INGESTING':break
                time.sleep(.2)
            assert batch and batch['total']==110 and batch['appended']==110,(
              'A04_UI_DURABLE_110_NOT_ACCEPTED',batch)
            assert batch['state'] in ('QUEUED','INTAKE_COMPLETE'),batch
            print('B A04_FULL_CAPABILITY_PRIMARY_UI_110_ITEM_BATCH=PASS',flush=True)
            before=mod.owned_firefox_pids(profile)
            mod.close(session);session=None
            mod.require_owned_exit(profile,before)
            session=mod.open_session(binary,profile)
            restart=mod.owned_firefox_pids(profile)
            assert restart and not before.intersection(restart),'A04_NOT_REAL_RESTART'
            mod.call('POST',f'/session/{session}/url',
                {'url':f'moz-extension://{uuid}/pcms/index.html#generators'},timeout=30)
            resumed=None
            for _ in range(100):
                resumed=mod.coordinator_command(session,{'type':'GET_CREATE_BATCH',
                  'params':{'batchId':batch['batchId']}})
                if resumed.get('ok') and resumed['batch']['processed']>0:break
                time.sleep(.2)
            assert resumed.get('ok') and resumed['batch']['appended']==110,resumed
            assert resumed['batch']['processed']>0,(
              'A04_BACKGROUND_STARTUP_INTAKE_NOT_PROGRESSING',resumed)
            assert resumed['batch']['state'] in ('QUEUED','INTAKE_COMPLETE'),resumed
            print('B A04_PERSISTENT_FIREFOX_RESTART_BACKGROUND_BATCH_PROGRESS=PASS',flush=True)
            observed={'schema':'pcms.a01.clean-installed-firefox/1',
              'scope':'DISPOSABLE_CLEAN_HOME','xpiInstalledPersistently':True,
              'processExitAndReopenOSObserved':True,'geckoId':mod.ID,
              'primaryShadowMounted':observation['shadow'],
              'primaryRouteReadOnlyInspections':routes,
              'legacyControllerPresent':observation['legacy'],
              'browserStorageAPI':observation['storageReady'],
              'browserAlarmsAPI':observation['alarmsReady'],
              'localPcmsHostsInstalledByHarness':False,
              'donorBridgeRealConnectivity':'NOT_TESTED',
              'operatorJourneys':'NOT_TESTED','providerEffects':'NONE'}
            print('B A01_CLEAN_XPI_READONLY='+json.dumps(observed,sort_keys=True),flush=True)
        finally:
            if session:mod.close(session)
            daemon.terminate()
            try:daemon.wait(timeout=7)
            except subprocess.TimeoutExpired:
                daemon.kill();daemon.wait(timeout=5)
if __name__=='__main__':main()
