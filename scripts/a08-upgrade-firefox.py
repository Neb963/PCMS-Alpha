#!/usr/bin/env python3
"""A08 persistent donor 1.2.0 -> same-Gecko-ID PCMS upgrade in isolated Firefox.

No extra PCMS native host registration, user profile, Git credential, route or
Perchance side effect. Uses developer-only geckodriver and a disposable HOME.
"""
import hashlib
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen
import importlib.util
module_path=pathlib.Path(__file__).with_name('browser-i00-smoke.py')
spec=importlib.util.spec_from_file_location('pcms_browser_smoke',module_path)
b=importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)

def main():
    target=pathlib.Path(sys.argv[1]).resolve()
    firefox=pathlib.Path(os.environ['FIREFOX_BINARY'])
    driver=pathlib.Path(os.environ['GECKODRIVER_BINARY'])
    root=pathlib.Path(__file__).resolve().parent.parent
    with tempfile.TemporaryDirectory(prefix='pcms-a08-upgrade-') as tmp:
        folder=pathlib.Path(tmp)
        old=folder/'persona-donor.xpi'
        subprocess.run([sys.executable,str(root/'scripts/zip-xpi.py'),
            str(root/'donor/personamonkey/extension'),str(old)],check=True,
            stdout=subprocess.DEVNULL)
        import zipfile
        with zipfile.ZipFile(old) as z:
            m=json.loads(z.read('manifest.json'))
            assert m['version']=='1.2.0',m['version']
            assert m['browser_specific_settings']['gecko']['id']==b.ID
        profile=folder/'profile'
        profile.mkdir()
        (profile/'user.js').write_text(
            'user_pref("xpinstall.signatures.required",false);\n')
        # Firefox driver receives no native service or secret-service setup.
        home=folder/'home'
        home.mkdir()
        for name in ('local.pcms.backup_vault','local.pcms.backup_v2',
                     'local.pcms.diagnostic_browser'):
            assert not any(home.rglob(name+'.json'))
        env={**os.environ,'HOME':str(home),'XDG_CONFIG_HOME':str(home/'.config'),
             'XDG_DATA_HOME':str(home/'.local')}
        server=subprocess.Popen([str(driver),'--port',str(b.PORT),
                                 '--allow-system-access'],env=env,
            stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
        session=None
        try:
            for _ in range(100):
                try:
                    with urlopen(b.HOST+'/status',timeout=1) as response:
                        if json.load(response).get('value',{}).get('ready'):break
                except Exception:time.sleep(.2)
            else:raise AssertionError('A08_GECKODRIVER_NOT_READY')
            session=b.open_session(firefox,profile)
            before=b.owned_firefox_pids(profile)
            assert before,'A08_DONOR_PROCESS_NOT_OBSERVED'
            assert b.call('POST',f'/session/{session}/moz/addon/install',
                {'path':str(old),'temporary':False},timeout=45)==b.ID
            b.close(session);session=None
            b.require_owned_exit(profile,before)
            session=b.open_session(firefox,profile)
            uuid_before=b.addons_uuid(profile)
            b.call('POST',f'/session/{session}/url',{
                'url':f'moz-extension://{uuid_before}/options/options.html'},timeout=30)
            marker={'schema':1,'label':'a08-upgrade-checkpoint','items':['owner-safe',42]}
            stored=b.execute(session,"""return browser.storage.local.set({
                'a08UpgradeCheckpoint':%s}).then(async()=>({
                  marker:(await browser.storage.local.get('a08UpgradeCheckpoint')).a08UpgradeCheckpoint,
                  version:browser.runtime.getManifest().version,
                  gecko:browser.runtime.getManifest().browser_specific_settings?.gecko?.id
                }));"""%json.dumps(marker))
            assert stored=={'marker':marker,'version':'1.2.0','gecko':b.ID},stored
            print('B A08_DONOR_PRE_UPGRADE_PERSISTED_STATE=PASS',flush=True)
            # Gecko refuses replacing a currently running installed XPI on
            # this pinned build (ERROR_FILE_ACCESS). Close only our owned CI
            # process, then replace exactly its own persisted add-on archive.
            # This tests process-cold package cutover, not Firefox UI update.
            exiting=b.owned_firefox_pids(profile)
            b.close(session);session=None
            b.require_owned_exit(profile,exiting)
            installed_path=profile/'extensions'/(b.ID+'.xpi')
            assert installed_path.is_file(),'A08_DONOR_PERSISTENT_XPI_NOT_FOUND'
            assert hashlib.sha256(installed_path.read_bytes()).hexdigest()==hashlib.sha256(old.read_bytes()).hexdigest(), 'A08_BASELINE_PACKAGE_MISMATCH'
            import shutil
            shutil.copyfile(target,installed_path)
            assert hashlib.sha256(installed_path.read_bytes()).hexdigest()==hashlib.sha256(target.read_bytes()).hexdigest(), 'A08_REPLACEMENT_PACKAGE_MISMATCH'
            session=b.open_session(firefox,profile)
            fresh=b.owned_firefox_pids(profile)
            assert fresh and not exiting.intersection(fresh),'A08_NOT_PROCESS_COLD'
            uuid_after=b.addons_uuid(profile)
            assert uuid_before==uuid_after,'A08_GECKO_PRINCIPAL_UUID_CHANGED'
            b.call('POST',f'/session/{session}/url',{
                'url':f'moz-extension://{uuid_after}/pcms/index.html'},timeout=30)
            verified=None
            for _ in range(100):
                verified=b.execute(session,"""return {
                   version:browser.runtime.getManifest().version,
                   gecko:browser.runtime.getManifest().browser_specific_settings?.gecko?.id,
                   state:null,main:!!document.getElementById('pcms-faithful-host')?.shadowRoot,
                   storageAPI:!!browser.storage.local,alarms:!!browser.alarms
                };""")
                if verified['main']:break
                time.sleep(.12)
            assert verified['version']=='1.2.4',verified
            assert verified['gecko']==b.ID and verified['main'],verified
            assert verified['storageAPI'] and verified['alarms'],verified
            retained=b.execute(session,"""return browser.storage.local.get(
                'a08UpgradeCheckpoint').then(s=>s.a08UpgradeCheckpoint);""")
            assert retained==marker,('A08_UPGRADE_STORAGE_LOST',retained)
            b.wait_donor_ready(session)
            assert not any(home.rglob('local.pcms.*.json')), 'A08_PCMS_HOST_REGISTERED'
            print('B A08_PROCESS_STOPPED_XPI_REPLACEMENT_ID_AND_STORAGE_SURVIVE=PASS',
                  flush=True)
            print('B A08_ENABLED_PRIMARY_UI_NO_EXTRA_NATIVE_HOSTS=PASS',flush=True)
            print('B A08_XPI_SHA256='+hashlib.sha256(target.read_bytes()).hexdigest(),
                  flush=True)
            print('B A08_PRIVATE_GIT_AND_LIVE_PROVIDER=NOT_TESTED',flush=True)
        finally:
            if session:b.close(session)
            server.terminate()
            try:server.wait(timeout=7)
            except subprocess.TimeoutExpired:
                server.kill();server.wait(timeout=5)

if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit('usage: a08-upgrade-firefox.py FILE.xpi')
    main()
