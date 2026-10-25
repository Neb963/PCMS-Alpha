#!/usr/bin/env python3
"""J06 primary backup/restore: installed Firefox, actual files/IDB/restarts.
No personal profile, provider resources or private generator Git effects.
"""
import base64,json,os,pathlib,subprocess,sys,tempfile,time
from urllib.request import urlopen
import journey_generators_ui as g
b=g.b;a=g.a

def wait(s,expression,label,seconds=45):
    return g.wait(s,expression,label,seconds)
def capture(s,name,evidence):
    pathlib.Path('build/j06-'+name+'.png').write_bytes(base64.b64decode(b.call('GET',f'/session/{s}/screenshot')))
    evidence[name]=b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;return {page:sh.querySelector('#page')?.innerText,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}")
def run(browser,archive,folder):
    profile=pathlib.Path(folder)/'j06-backup-primary';profile.mkdir();downloads=pathlib.Path(folder)/'j06-downloads';downloads.mkdir()
    (profile/'user.js').write_text('user_pref("xpinstall.signatures.required",false);\nuser_pref("network.dns.forceResolve","127.0.0.1");\nuser_pref("browser.download.folderList",2);\nuser_pref("browser.download.useDownloadDir",true);\nuser_pref("browser.download.dir",'+json.dumps(str(downloads))+');\n')
    s=b.open_session(browser,profile)
    try:assert b.call('POST',f'/session/{s}/moz/addon/install',{'path':str(archive),'temporary':False},timeout=45)==b.ID
    finally:b.close(s)
    s=b.open_session(browser,profile);evidence={'scope':'Real installed UI, IDB, archive codec, disk file and process restart; no provider/private Git effects.'}
    try:
        uuid=b.addons_uuid(profile);url=f'moz-extension://{uuid}/pcms/index.html#settings'
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s)
        wait(s,"!!sh.querySelector('[data-settings=backups]')",'J06_PRIMARY_SETTINGS')
        g.click(s,'[data-settings=diagnostics]')
        wait(s,"!!sh.querySelector('#pcms-check-AC-01')&&!sh.querySelector('#pcms-check-AC-01').disabled",'J06_OPERATOR_CHECKLIST_LOADED')
        g.click(s,'#pcms-diagnostic-independent-run')
        wait(s,"sh.querySelector('#pcms-diagnostic-independent-results')?.textContent.includes('Local data restore — Passed')",'J06_DIAGNOSTICS_ACTUAL_RESTORE_WITHOUT_CREATE',90)
        # Persist real notes through the trusted tracked background port.
        b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;sh.querySelector('#pcms-check-AC-01').closest('details').open=true")
        g.change(s,'#pcms-check-AC-01','PASS');g.fill(s,'#pcms-notes-AC-01','Disposable UI evidence; operator-reported, not live provider acceptance.')
        g.click_text(s,'Save observations')
        wait(s,"sh.querySelector('#pcms-operator-checklist')?.textContent.includes('Observations saved.')",'J06_REAL_NOTES_CANONICAL_SAVE')
        g.click_text(s,'Export Markdown');g.click_text(s,'Export JSON')
        until=time.monotonic()+10
        while time.monotonic()<until and not (downloads/'pcms-operator-observations.json').exists():time.sleep(.1)
        assert json.loads((downloads/'pcms-operator-observations.json').read_text())['checks']['AC-01']['outcome']=='PASS'
        assert 'operator-reported' in (downloads/'pcms-operator-observations.md').read_text()
        b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;sh.querySelector('#pcms-diagnostic-history').closest('details').open=true")
        g.click(s,'#pcms-diagnostic-history-refresh')
        wait(s,"sh.querySelector('#pcms-diagnostic-history')?.options.length>0&&!sh.querySelector('#pcms-diagnostic-history-export').disabled",'J06_CANONICAL_REPORT_HISTORY')
        g.click(s,'#pcms-diagnostic-history-export')
        ticket=g.oracle(s,"return await new Promise(resolve=>{const p=browser.runtime.connect({name:'pcms-s08-startup'});p.onMessage.addListener(r=>{p.disconnect();resolve(r)});p.postMessage({type:'ARM',params:{runId:'s08_1122334455667788'}})})")
        assert ticket.get('ok'),ticket
        capture(s,'diagnostics-notes-history',evidence)
        b.call('POST',f'/session/{s}/refresh',{})
        wait(s,"!!sh.querySelector('[data-settings=backups]')",'J06_DIAGNOSTIC_PAGE_RELOAD')
        unobserved=g.oracle(s,"return await new Promise(resolve=>{const p=browser.runtime.connect({name:'pcms-s08-startup'});p.onMessage.addListener(r=>{p.disconnect();resolve(r)});p.postMessage({type:'STATUS',params:{runId:'s08_1122334455667788'}})})")
        assert unobserved.get('observed') is False,unobserved
        g.click(s,'[data-settings=backups]')
        wait(s,"!!sh.querySelector('#pcms-backup-inspect-file')",'J06_PRIMARY_BACKUP_WORKSPACE')
        g.click_text(s,'Download complete backup')
        wait(s,"sh.querySelector('#page')?.textContent.includes('Backup saved in your Firefox downloads')",'J06_REAL_MANUAL_BACKUP',90)
        files=list(downloads.glob('pcms-backups/*.pcms.jsonl'));assert len(files)==1,files
        saved=files[0];assert saved.stat().st_size>100
        # OS disk input is passed to the actual primary file picker.
        control=b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('#pcms-backup-inspect-file')")
        b.call('POST',f'/session/{s}/element/{control[a.ELEMENT]}/value',{'text':str(saved)})
        g.click_text(s,'Verify selected backup')
        wait(s,"sh.querySelector('#page')?.textContent.includes('Selected file verified')",'J06_INDEPENDENT_DISK_FILE_REOPEN',90)
        # Corrupt an actual file; the UI must reject it and recover on reselection.
        corrupt=downloads/'corrupt.pcms.jsonl';data=saved.read_bytes();corrupt.write_bytes(data[:len(data)//2]+b'CORRUPTED'+data[len(data)//2:])
        b.call('POST',f'/session/{s}/element/{control[a.ELEMENT]}/value',{'text':str(corrupt)})
        g.click_text(s,'Verify selected backup')
        wait(s,"sh.querySelector('#page')?.textContent.includes('This file could not be verified')",'J06_CORRUPT_FILE_REJECTED')
        b.call('POST',f'/session/{s}/element/{control[a.ELEMENT]}/value',{'text':str(saved)})
        g.click_text(s,'Verify selected backup');wait(s,"sh.querySelector('#page')?.textContent.includes('Selected file verified')",'J06_FILE_ERROR_RECOVERY')
        # No configured Git or managed account exists: functional checks remain independent.
        b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;const d=[...sh.querySelectorAll('details')].find(x=>x.querySelector('summary')?.textContent==='Local functional checks');d.open=true;return true")
        g.click_text(s,'Test backup and isolated restore')
        wait(s,"sh.querySelector('#page')?.textContent.includes('Archive and isolated data restore verified')",'J06_REAL_ISOLATED_IDB_RESTORE_NO_CREATE_OR_GIT',90)
        capture(s,'backup-file-functional',evidence)
        g.click(s,'[data-nav=overview]')
        wait(s,"[...sh.querySelectorAll('.stat-card')].some(x=>x.textContent.includes('Last completed backup')&&!x.textContent.includes('No completed'))",'J06_OVERVIEW_LAST_GOOD')
        capture(s,'overview-last-good',evidence)
        before=b.owned_firefox_pids(profile);assert before;b.close(s);b.require_owned_exit(profile,before);s=None
        s=b.open_session(browser,profile);after=b.owned_firefox_pids(profile);assert after and not before.intersection(after)
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s)
        wait(s,"!!sh.querySelector('[data-settings=backups]')",'J06_RESTART_PRIMARY_SETTINGS');g.click(s,'[data-settings=backups]')
        wait(s,"sh.querySelector('#page')?.textContent.includes('Manual backup')",'J06_LAST_GOOD_PERSISTENT_RESTART')
        assert len(list(downloads.glob('pcms-backups/*.pcms.jsonl')))==1,'STATUS_RESTART_REPLAYED_DOWNLOAD'
        receipt=g.oracle(s,"return await new Promise(resolve=>{const p=browser.runtime.connect({name:'pcms-s08-startup'});p.onMessage.addListener(r=>{p.disconnect();resolve(r)});p.postMessage({type:'STATUS',params:{runId:'s08_1122334455667788'}})})")
        assert receipt.get('observed') is True and receipt.get('independentProcessProof') is False,receipt
        g.click(s,'[data-settings=diagnostics]')
        wait(s,"sh.querySelector('#pcms-notes-AC-01')?.value.includes('operator-reported')&&sh.querySelector('#pcms-check-AC-01')?.value==='PASS'",'J06_NOTES_ACTUAL_PROCESS_RESTART')
        capture(s,'restart-backup',evidence)
        pathlib.Path('build/j06-primary-backup.json').write_text(json.dumps(evidence,indent=2))
        print('B J06_ACTUAL_PRIMARY_MANUAL_FILE_REOPEN_CORRUPTION_RECOVERY_FUNCTIONAL_RESTORE_MODULE_INDEPENDENCE_RESTART=PASS',flush=True)
    finally:
        if s:b.close(s)

def main():
    browser=pathlib.Path(os.environ['FIREFOX_BINARY']);driver=pathlib.Path(os.environ['GECKODRIVER_BINARY'])
    daemon=subprocess.Popen([str(driver),'--port',str(b.PORT),'--allow-system-access'],stdout=open(os.environ.get('PCMS_DRIVER_LOG','/tmp/pcms-j06-driver.log'),'w'),stderr=subprocess.STDOUT)
    try:
        for _ in range(80):
            try:
                with urlopen(b.HOST+'/status',timeout=1) as response:
                    if json.load(response).get('value',{}).get('ready'):break
            except Exception:time.sleep(.2)
        else:raise AssertionError('J06_DRIVER_NOT_READY')
        with tempfile.TemporaryDirectory(prefix='pcms-j06-ui-') as folder:run(browser,pathlib.Path(sys.argv[1]).resolve(),folder)
    finally:
        daemon.terminate();daemon.wait(timeout=15)
if __name__=='__main__':main()
