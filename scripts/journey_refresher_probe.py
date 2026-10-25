#!/usr/bin/env python3
"""Focused disposable browser diagnosis only. Does not authorize any merge."""
import json,pathlib,subprocess,sys,tempfile,time,os
from urllib.request import urlopen
import journey_development_pipeline as p
b=p.b
def run(browser,archive,folder):
    profile=pathlib.Path(folder)/'j05-timer-probe';profile.mkdir();(profile/'user.js').write_text('user_pref("xpinstall.signatures.required",false);\nuser_pref("network.dns.forceResolve","127.0.0.1");\n')
    s=b.open_session(browser,profile)
    try:
        assert b.call('POST',f'/session/{s}/moz/addon/install',{'path':str(archive),'temporary':False},timeout=45)==b.ID
        b.call('POST',f'/session/{s}/url',{'url':'about:blank'});b.wait_donor_ready(s)
        source=pathlib.Path(__file__).with_name('fixtures').joinpath('j05-clock.mjs').read_text().replace('export async function','async function')
        result=p.background(s,source+';return await installRefresherClockFixture(true);')
        print('J05_TIMER_PROBE='+json.dumps(result),flush=True)
        assert result.get('ok'),('J05_INITIAL_CONTROLLER_TURN_FAILED',result)
    finally:b.close(s)
if __name__=='__main__':
    browser=pathlib.Path(os.environ['FIREFOX_BINARY']);driver=pathlib.Path(os.environ['GECKODRIVER_BINARY']);archive=pathlib.Path(sys.argv[1]).resolve()
    with tempfile.TemporaryDirectory(prefix='pcms-j05-probe-') as folder:
        server=subprocess.Popen([str(driver),'--port',str(b.PORT),'--allow-system-access'],stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
        try:
            for _ in range(80):
                try:
                    with urlopen(b.HOST+'/status',timeout=1) as r:
                        if json.load(r).get('value',{}).get('ready'):break
                except Exception:time.sleep(.25)
            else:raise RuntimeError('geckodriver not ready')
            run(browser,archive,pathlib.Path(folder))
        finally:server.terminate();server.wait(timeout=10)
