#!/usr/bin/env python3
"""Finite, user-invoked S08 Firefox restart witness. Isolated profile; no provider API."""
import fcntl, hashlib, importlib.util, json, os, pathlib, re, shutil, signal
import socket, struct, subprocess, sys, tempfile, time

ROOT=pathlib.Path(__file__).resolve().parent.parent
SHA=re.compile(r'^[a-f0-9]{64}$')

def receive():
    head=sys.stdin.buffer.read(4)
    if len(head)!=4:return None
    size=struct.unpack('=I',head)[0]
    if not 2<=size<=512:return None
    content=sys.stdin.buffer.read(size)
    if len(content)!=size:return None
    try:return json.loads(content)
    except (ValueError,UnicodeDecodeError):return None

def reply(response):
    output=json.dumps(response,separators=(',',':')).encode()
    sys.stdout.buffer.write(struct.pack('=I',len(output))+output)
    sys.stdout.buffer.flush()

def observe(archive,firefox,driver):
    module=ROOT/'scripts'/'browser-i00-smoke.py'
    if not module.is_file():return 'ISOLATED_HARNESS_MISSING'
    spec=importlib.util.spec_from_file_location('pcms_isolated_browser_helpers',module)
    h=importlib.util.module_from_spec(spec);spec.loader.exec_module(h)
    with tempfile.TemporaryDirectory(prefix='pcms-s08-isolated-') as home:
        profile=pathlib.Path(home)/'profile';profile.mkdir()
        (profile/'user.js').write_text('user_pref("xpinstall.signatures.required", false);\n')
        with socket.socket() as sock:
            sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        h.PORT=port;h.HOST='http://127.0.0.1:'+str(port)
        server=subprocess.Popen([driver,'--port',str(port),'--allow-system-access'],
              stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT,start_new_session=True)
        session=None
        try:
            for _ in range(80):
                try:
                    with h.urlopen(h.HOST+'/status',timeout=1) as response:
                        if json.load(response).get('value',{}).get('ready'):break
                except Exception:time.sleep(.25)
            else:return 'GECKODRIVER_NOT_READY'
            session=h.open_session(pathlib.Path(firefox),profile)
            first=h.owned_firefox_pids(profile)
            if not first:return 'FIRST_FIREFOX_PROCESS_NOT_OBSERVED'
            installed=h.call('POST',f'/session/{session}/moz/addon/install',
                 {'path':str(archive),'temporary':False},timeout=45)
            if installed!='persona-route-manager@local':return 'GECKO_ID_MISMATCH'
            h.close(session);session=None
            try:h.require_owned_exit(profile,first)
            except Exception:return 'FIREFOX_PROCESS_EXIT_UNVERIFIED'
            session=h.open_session(pathlib.Path(firefox),profile)
            second=h.owned_firefox_pids(profile)
            if not second or first.intersection(second):
                return 'FIREFOX_EXIT_RESTART_NOT_VERIFIED'
            uuid=h.addons_uuid(profile)
            if not uuid:return 'PERSISTENT_XPI_MISSING_AFTER_RESTART'
            h.call('POST',f'/session/{session}/url',
                   {'url':'moz-extension://'+uuid+'/pcms/index.html'},timeout=30)
            actual=h.call('POST',f'/session/{session}/execute/async',{
                'script':'''const done=arguments[arguments.length-1];
                Promise.all([browser.action.getPopup({}),browser.action.getTitle({})])
                .then(([popup,title])=>done({popup,title,ui:
                  !!document.getElementById('pcms-diagnostic-run') &&
                  !!document.getElementById('pcms-s06-grant-development')}))
                .catch(()=>done({code:'TOOLBAR_ACTION_UNAVAILABLE'}));''',
                'args':[]},timeout=30)
            if actual!={'popup':'','title':'Open PCMS dashboard','ui':True}:
                return 'INSTALLED_DASHBOARD_CONTRACT_FAILED'
            return None
        finally:
            if session:
                try:h.close(session)
                except Exception:pass
            try:server.terminate();server.wait(timeout=8)
            except Exception:
                try:os.killpg(server.pid,signal.SIGKILL)
                except ProcessLookupError:pass


def verify_isolated_archive(archive,firefox,driver):
    """Run the installed production backup-v2 and I16 restore H witness
    inside a new HOME and private D-Bus/Secret Service, never operator state.
    """
    if any(shutil.which(name) is None for name in
           ('dbus-run-session','gnome-keyring-daemon','secret-tool','bash')):
        return 'ISOLATED_SECRET_SERVICE_DEPENDENCIES_REQUIRED'
    script_path=ROOT/'scripts'/'s02-ci-native-host.py'
    if not script_path.is_file():return 'ISOLATED_PRODUCTION_HARNESS_REQUIRED'
    with tempfile.TemporaryDirectory(prefix='pcms-s08-recovery-') as d:
        root=pathlib.Path(d);home=root/'home';home.mkdir(mode=0o700)
        runtime=home/'runtime';runtime.mkdir(mode=0o700)
        env=os.environ.copy()
        env.update({'HOME':str(home),'XDG_RUNTIME_DIR':str(runtime),
           'RUNNER_TEMP':str(root),'PCMS_S02_CI_ISOLATED':'1',
           'FIREFOX_BINARY':firefox,'GECKODRIVER_BINARY':driver,
           'PCMS_S08_PYTHON':sys.executable,'PCMS_S08_RUNNER':str(script_path)})
        program='set -euo pipefail\n' \
          'eval "$(printf "pcms-s02-disposable-keyring\\n" | gnome-keyring-daemon --unlock --components=secrets)"\n' \
          'exec "$PCMS_S08_PYTHON" "$PCMS_S08_RUNNER" build/pcms-alpha-i00.xpi\n'
        process=subprocess.Popen(['dbus-run-session','--','bash','-c',program],
          cwd=str(ROOT),env=env,stdout=subprocess.PIPE,
          stderr=subprocess.PIPE,text=True,start_new_session=True)
        try:
            stdout,stderr=process.communicate(timeout=1100)
        except subprocess.TimeoutExpired:
            try:os.killpg(process.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            process.communicate()
            return 'ISOLATED_ARCHIVE_TIME_BUDGET_EXCEEDED'
        if process.returncode!=0:return 'ISOLATED_ARCHIVE_H_WITNESS_FAILED'
        required=('S02_NATIVE_50_PERSONAS_1024_SOURCE_ARCHIVE_ON_DISK=PASS',
          'S02_ACTUAL_NATIVE_DISK_TO_FRESH_PROFILE_CANONICAL_INACTIVE_RESTORE=PASS',
          'S02_NATIVE_V2_THROUGH_ACTUAL_PERSONAMONKEY_DONOR_COOKIES_CANONICAL=PASS',
          'S02_AGGREGATE_OS_PROCESS_RSS_OBSERVED=PASS')
        if any(token not in stdout for token in required):
            return 'ISOLATED_ARCHIVE_H_RECEIPTS_INCOMPLETE'
        return None

def run(request):
    if not isinstance(request,dict) or set(request)!={'action','expectedSha256'} or request.get('action') not in ('RUN_ISOLATED_BROWSER','RUN_ISOLATED_BACKUP_RESTORE') or not isinstance(request.get('expectedSha256'),str) or not SHA.fullmatch(request['expectedSha256']):
        return {'ok':False,'code':'DIAGNOSTIC_REQUEST_DENIED'}
    archive=ROOT/'build'/'pcms-alpha-i00.xpi'
    if not archive.is_file():return {'ok':False,'code':'ISOLATED_XPI_BUILD_REQUIRED'}
    actual=hashlib.sha256(archive.read_bytes()).hexdigest()
    if actual!=request['expectedSha256']:
        return {'ok':False,'code':'XPI_DIGEST_MISMATCH'}
    firefox=next((shutil.which(b) for b in
      ('firefox-developer-edition','firefox-esr','firefox') if shutil.which(b)),None)
    driver=shutil.which('geckodriver')
    if not firefox or not driver:return {'ok':False,'code':'FIREFOX_GECKODRIVER_REQUIRED'}
    locks=pathlib.Path.home()/'.cache'/'pcms-alpha'
    locks.mkdir(parents=True,exist_ok=True,mode=0o700)
    with (locks/'s08-isolated.lock').open('a+b') as lock:
        try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
        except BlockingIOError:
            return {'ok':False,'code':'ISOLATED_BROWSER_ALREADY_RUNNING'}
        error=verify_isolated_archive(archive,firefox,driver) if request['action']=='RUN_ISOLATED_BACKUP_RESTORE' else observe(archive,firefox,driver)
    if error:return {'ok':False,'code':error}
    if request['action']=='RUN_ISOLATED_BACKUP_RESTORE':
        return {'ok':True,'code':'ISOLATED_PRODUCTION_BACKUP_RESTORE_VERIFIED',
          'xpiSha256':actual,'nativeArchive':'REOPENED_AUTHENTICATED',
          'restore':'FRESH_PROFILE_INACTIVE_VERIFIED',
          'testOnly':True,'liveProvider':'NOT_TESTED'}
    return {'ok':True,'code':'ISOLATED_CANDIDATE_FIREFOX_RESTART_VERIFIED',
       'xpiSha256':actual,'firefoxRestart':'OS_OBSERVED',
       'persistentXpi':'VERIFIED_IN_TEST_PROFILE','liveProvider':'NOT_TESTED'}

if __name__=='__main__':
    try:reply(run(receive()))
    except Exception:reply({'ok':False,'code':'ISOLATED_BROWSER_UNAVAILABLE'})
