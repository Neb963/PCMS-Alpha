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


def wait_upgraded_runtime(session, expected_version, timeout_seconds=12):
    """A written archive/registry is not proof that the new extension started.

    Observe the actual extension API and primary UI before shutdown and again
    after cold restart. These are read-only probes; the upgrade is never replayed.
    """
    until=time.monotonic()+timeout_seconds
    last=None
    while time.monotonic()<until:
        last=b.execute(session,"""return typeof browser==='undefined' ? null : {
            version:browser.runtime.getManifest().version,
            gecko:browser.runtime.getManifest().browser_specific_settings?.gecko?.id,
            main:!!document.getElementById('pcms-faithful-host')?.shadowRoot,
            storageAPI:!!browser.storage.local,alarms:!!browser.alarms
        };""")
        if last and last.get('gecko')!=b.ID:
            raise AssertionError(('A08_WRONG_RUNTIME_PRINCIPAL',last))
        if (last and last.get('version')==expected_version and last.get('main')
                and last.get('storageAPI') and last.get('alarms')):
            return last
        time.sleep(.12)
    raise AssertionError(('A08_UPGRADED_RUNTIME_NOT_READY',last))


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
            # Use the real Firefox add-on-manager update path. Replacing a
            # cached XPI file under profile/extensions broke Gecko startup and
            # is not a valid install/upgrade test. No profile filesystem edit.
            # Developer-only privileged browser context is explicitly enabled
            # by the disposable geckodriver's --allow-system-access flag.
            # AOM must run from its own stable browser tab. Updating the
            # currently selected donor extension document invalidates its
            # Marionette actor before the upgrade has completed.
            b.call('POST',f'/session/{session}/url',{'url':'about:addons'},timeout=30)
            b.call('POST',f'/session/{session}/moz/context',{'context':'chrome'})
            upgrade_js="""const done=arguments[arguments.length-1];
            (async()=>{
              const {AddonManager}=ChromeUtils.importESModule(
                'resource://gre/modules/AddonManager.sys.mjs');
              const io=Components.classes['@mozilla.org/network/io-service;1']
                .getService(Components.interfaces.nsIIOService);
              const path=TARGET;
              const file=Components.classes['@mozilla.org/file/local;1']
                .createInstance(Components.interfaces.nsIFile);
              file.initWithPath(path);
              const before=await AddonManager.getAddonByID(ADDON_ID);
              if(!before || before.version!=='1.2.0')
                throw Error('A08_PRE_UPGRADE_ADDON_VERSION_CHANGED');
              const install=await AddonManager.getInstallForFile(file);
              if(!install)throw Error('A08_ADDON_INSTALL_NOT_CREATED');
              // Perform the single real update from about:addons after the
              // test-controller callback; disk and runtime observations below
              // establish completion separately from scheduling this intent.
              const existing=!!install.existingAddon;
              if(!existing)throw Error('A08_UPDATE_EXISTING_ADDON_NOT_DETECTED');
              const browserTab=window.gBrowser?.selectedBrowser||null;
              window.setTimeout(()=>{
                AddonManager.installAddonFromAOMWithOptions(
                  browserTab,io.newURI('about:addons'),install,
                  {preferUpdateOverInstall:true});
              },250);
              done({ok:true,stage:'UPDATE_SCHEDULED_NOT_YET_ACCEPTED',
                oldVersion:before.version,existingAddon:existing});
            })().catch(e=>done({ok:false,error:String(e),stack:String(e.stack)}));"""
            upgrade_js=upgrade_js.replace('TARGET',json.dumps(str(target))).replace(
                'ADDON_ID',json.dumps(b.ID))
            b.call('POST',f'/session/{session}/timeouts',{
                'script':40000,'pageLoad':15000})
            upgraded=b.call('POST',f'/session/{session}/execute/async',
                {'script':upgrade_js,'args':[]},timeout=35)
            assert upgraded=={'ok':True,'stage':'UPDATE_SCHEDULED_NOT_YET_ACCEPTED',
                'oldVersion':'1.2.0','existingAddon':True},upgraded
            print('B A08_UPGRADE_INTENT_SCHEDULED_NOT_ACCEPTED',flush=True)
            installed_path=profile/'extensions'/(b.ID+'.xpi')
            expected=hashlib.sha256(target.read_bytes()).hexdigest()
            observed=None
            for _ in range(60):
                if installed_path.is_file():
                    observed=hashlib.sha256(installed_path.read_bytes()).hexdigest()
                    if observed==expected:break
                time.sleep(.2)
            assert observed==expected,('A08_UPDATE_NOT_INSTALLED_BY_FIREFOX',
                {'expected':expected,'observed':observed})
            print('H A08_UPGRADED_PROFILE_XPI_BYTES_MATCH_CI_ARTIFACT=PASS',
                  flush=True)
            # An XPI filesystem write can precede the AddonManager's durable
            # extensions.json version transition. Never close/restart Firefox
            # until the manager's independent disk registry confirms 1.2.17;
            # an uncommitted candidate remains a failed upgrade, not success.
            registry=profile/'extensions.json'
            registry_version=None
            for _ in range(100):
                try:
                    state=json.loads(registry.read_text())
                    rows=[a for a in state.get('addons',[])
                          if a.get('id')==b.ID]
                    registry_version=rows[0].get('version') if len(rows)==1 else None
                except (OSError,ValueError,IndexError,TypeError):
                    registry_version=None
                if registry_version=='1.2.17':break
                time.sleep(.15)
            assert registry_version=='1.2.17',(
                'A08_ADDON_REGISTRY_UPDATE_NOT_COMMITTED',registry_version)
            print('H A08_FIREFOX_ADDON_REGISTRY_UPDATED_BEFORE_SHUTDOWN=PASS',
                  flush=True)
            # The old extension tab can outlive the on-disk registration.
            # Leave that document and prove actual target-runtime startup
            # before requesting a clean WebDriver shutdown. No cache edits,
            # reinstallation, profile mutation or assertion relaxation.
            b.call('POST',f'/session/{session}/moz/context',{'context':'content'})
            b.call('POST',f'/session/{session}/url',{'url':'about:blank'},timeout=30)
            b.call('POST',f'/session/{session}/url',{
                'url':f'moz-extension://{uuid_before}/pcms/index.html'},timeout=30)
            wait_upgraded_runtime(session,'1.2.17')
            print('B A08_TARGET_RUNTIME_READY_BEFORE_SHUTDOWN=PASS',flush=True)
            exiting=b.owned_firefox_pids(profile)
            b.close(session);session=None
            # The single disposable CI profile may lose Marionette during a
            # legitimate browser-level extension upgrade. Never terminate any
            # process unless /proc verifies the exact temporary profile owner.
            import signal
            for pid in b.owned_firefox_pids(profile)&exiting:
                os.kill(pid,signal.SIGTERM)
            b.require_owned_exit(profile,exiting)
            server.terminate()
            try:server.wait(timeout=7)
            except subprocess.TimeoutExpired:
                server.kill();server.wait(timeout=5)
            server=subprocess.Popen([str(driver),'--port',str(b.PORT),
                                     '--allow-system-access'],env=env,
                stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
            for _ in range(70):
                try:
                    with urlopen(b.HOST+'/status',timeout=1) as resp:
                        if json.load(resp).get('value',{}).get('ready'):break
                except Exception:time.sleep(.2)
            else:raise AssertionError('A08_REOPEN_DRIVER_NOT_READY')
            session=b.open_session(firefox,profile)
            fresh=b.owned_firefox_pids(profile)
            assert fresh and not exiting.intersection(fresh),'A08_NOT_PROCESS_COLD'
            uuid_after=b.addons_uuid(profile)
            assert uuid_before==uuid_after,'A08_GECKO_PRINCIPAL_UUID_CHANGED'
            b.call('POST',f'/session/{session}/url',{
                'url':f'moz-extension://{uuid_after}/pcms/index.html'},timeout=30)
            verified=wait_upgraded_runtime(session,'1.2.17')
            retained=b.execute(session,"""return browser.storage.local.get(
                'a08UpgradeCheckpoint').then(s=>s.a08UpgradeCheckpoint);""")
            assert retained==marker,('A08_UPGRADE_STORAGE_LOST',retained)
            b.wait_donor_ready(session)
            assert not any(home.rglob('local.pcms.*.json')), 'A08_PCMS_HOST_REGISTERED'
            print('B A08_GENUINE_ADDON_MANAGER_UPGRADE_ID_AND_STORAGE_SURVIVE=PASS',
                  flush=True)
            print('B A08_ENABLED_PRIMARY_UI_NO_EXTRA_NATIVE_HOSTS=PASS',flush=True)
            print('B A08_XPI_SHA256='+hashlib.sha256(target.read_bytes()).hexdigest(),
                  flush=True)
            print('B A08_PRIVATE_GIT_AND_LIVE_PROVIDER=NOT_TESTED',flush=True)
        except Exception:
            print('A08_FAILURE_LIFECYCLE='+json.dumps({
                'ownedFirefoxPids':sorted(b.owned_firefox_pids(profile)),
                'driverReturncode':server.poll(),
                'installedArchiveMatches':installed_path.is_file() and
                    hashlib.sha256(installed_path.read_bytes()).hexdigest()==expected
                    if 'installed_path' in locals() else None
            }),flush=True)
            raise
        finally:
            if session:b.close(session)
            server.terminate()
            try:server.wait(timeout=7)
            except subprocess.TimeoutExpired:
                server.kill();server.wait(timeout=5)

if __name__=='__main__':
    if len(sys.argv)!=2:raise SystemExit('usage: a08-upgrade-firefox.py FILE.xpi')
    main()
