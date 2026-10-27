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
        # Use real IndexedDB/codec for ownership collisions: an existing scope
        # and concurrent same-scope prepares cannot overwrite its receipt/rows.
        collision=g.oracle(s,"""
const {DB_STORES}=await import('./backup-core.mjs'),codec=await import('./portable-archive.mjs'),stage=await import('./portable-restore-stage.mjs');
const pcms={schema:1,stores:Object.fromEntries(DB_STORES.map(k=>[k,[]]))};pcms.stores.meta.push({key:'ownership-oracle',value:{exact:'original stage bytes'}});
const donor={version:1,settings:null,routes:[],personas:[],scripts:[],workflows:[],cookies:{},gmValues:{},automationHistory:[]};
const archive=await codec.encodePortableArchive({pcms,donor}),scope='portable_'+crypto.randomUUID().replaceAll('-','');
const readRaw=async()=>{const db=await stage.openRestoreStage();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(['sessions','rows'],'readonly'),out={};tx.objectStore('sessions').get(scope).onsuccess=e=>out.session=e.target.result;tx.objectStore('rows').getAll().onsuccess=e=>out.rows=e.target.result.filter(r=>r.scope===scope);tx.oncomplete=()=>resolve(out);tx.onabort=reject})}finally{db.close()}};
try{
const attempts=await Promise.allSettled([stage.preparePortableStage(archive.blob,{scope}),stage.preparePortableStage(archive.blob,{scope})]);
const before=await readRaw();let reused=false;try{await stage.preparePortableStage(new Blob(['corrupt different bytes']),{scope})}catch(e){reused=e.message==='PORTABLE_STAGE_REUSED'}
const after=await readRaw(),opened=await stage.readPortableStage(scope);
return {ok:attempts.filter(r=>r.status==='fulfilled').length===1&&attempts.filter(r=>r.status==='rejected'&&r.reason.message==='PORTABLE_STAGE_REUSED').length===1&&reused&&JSON.stringify(before)===JSON.stringify(after)&&after.session.status==='READY'&&opened.canonical.stores.meta[0].value.exact==='original stage bytes',rows:after.rows.length,session:after.session.status};
}finally{await stage.discardPortableStage(scope)}
""")
        assert collision.get('ok'),collision
        evidence['real-idb-stage-ownership']=collision
        print('B J06_REAL_IDB_ATOMIC_STAGE_CLAIM_COLLISION_PRESERVES_SESSION_AND_ROWS=PASS',flush=True)
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
        # Historical results retain an operator-visible resource reference;
        # the exported diagnostic stays sanitized and distinguishes manifest proof.
        history=g.oracle(s,"""
const {createOperatorRecords}=await import('./operator-records.mjs'),{createDiagnosticRun,diagnosticReport}=await import('./s08-diagnostic-core.mjs');
const run=createDiagnosticRun({accountId:'account_history_fixture',personaUid:'persona_history_fixture',repositoryId:'42',namespace:'pcms-test-history'},'123456789abc1122',Date.now()).run;
run.created=true;run.remoteVisibility='PUBLIC';run.remoteObservedAt=Date.now();run.status='HELD';run.stage='PUBLICATION';run.restoredHistorical=true;run.build={version:browser.runtime.getManifest().version,extensionId:browser.runtime.id};
const out=await createOperatorRecords().put('ui:diagnostic-report:'+run.runId,{schema:1,run,report:diagnosticReport(run)},{expectedRevision:0});return {...out,slug:run.slug};
""")
        assert history.get('ok'),history
        g.click(s,'#pcms-diagnostic-history-refresh')
        wait(s,"[...sh.querySelector('#pcms-diagnostic-history').options].some(x=>x.value==='ui:diagnostic-report:s08_123456789abc1122')",'J06_SAVED_DISPOSABLE_ARTIFACT_REPORT')
        g.change(s,'#pcms-diagnostic-history','ui:diagnostic-report:s08_123456789abc1122')
        wait(s,"sh.querySelector('#pcms-diagnostic-history-status').textContent.includes('PUBLIC')&&!sh.querySelector('#pcms-diagnostic-history-locate').disabled",'J06_REMAINING_PUBLIC_TEST_RESOURCE_DISCLOSED')
        g.click(s,'#pcms-diagnostic-history-locate')
        wait(s,"sh.querySelector('#generator-search')?.value==='pcms-test-history-123456789abc'",'J06_HISTORICAL_TEST_RESOURCE_PRIMARY_HANDOFF')
        g.click(s,'[data-nav=settings]');g.click(s,'[data-settings=diagnostics]')
        wait(s,"!!sh.querySelector('#pcms-diagnostic-history')",'J06_DIAGNOSTICS_RETURN_FROM_HISTORY')
        ticket=g.oracle(s,"return await new Promise(resolve=>{const p=browser.runtime.connect({name:'pcms-s08-startup'});p.onMessage.addListener(r=>{p.disconnect();resolve(r)});p.postMessage({type:'ARM',params:{runId:'s08_1122334455667788'}})})")
        assert ticket.get('ok'),ticket
        capture(s,'diagnostics-notes-history',evidence)
        b.call('POST',f'/session/{s}/refresh',{})
        wait(s,"!!sh.querySelector('[data-settings=backups]')",'J06_DIAGNOSTIC_PAGE_RELOAD')
        unobserved=g.oracle(s,"return await new Promise(resolve=>{const p=browser.runtime.connect({name:'pcms-s08-startup'});p.onMessage.addListener(r=>{p.disconnect();resolve(r)});p.postMessage({type:'STATUS',params:{runId:'s08_1122334455667788'}})})")
        assert unobserved.get('observed') is False,unobserved
        attention=pathlib.Path(__file__).with_name('fixtures').joinpath('j06-attention.mjs').read_text().replace('export async function','async function')
        installed=g.oracle(s,attention+';return await installAttentionFixture();');assert installed.get('ok'),installed
        g.click(s,'[data-nav=work-queue]')
        wait(s,"sh.querySelector('#page')?.textContent.includes('Source needs verification')",'J06_ACTIONABLE_ATTENTION')
        g.click_text(s,'Mark reviewed')
        wait(s,"sh.querySelector('#pcms-live-toast')?.textContent.includes('Review not confirmed')&&!sh.querySelector('.queue-list button:last-child')?.disabled",'J06_FAILED_ACK_RETRY_REMAINS_AVAILABLE')
        first=g.oracle(s,'return await window.__j06attention.inspect()');assert first['notice']['reviewed'] is False and first['acknowledgments']==1,first
        g.oracle(s,'return await window.__j06attention.escalate()')
        g.click_text(s,'Mark reviewed')
        wait(s,"[...sh.querySelectorAll('button')].some(x=>x.textContent==='Mark reviewed'&&!x.disabled)",'J06_STALE_ESCALATION_RELOADS_CURRENT_INCIDENT')
        stale=g.oracle(s,'return await window.__j06attention.inspect()');assert stale['notice']['revision']==2 and stale['notice']['reviewed'] is False and stale['acknowledgments']==1,stale
        g.click_text(s,'Mark reviewed')
        wait(s,"sh.querySelector('#page')?.textContent.includes('Reviewed — still active')",'J06_LOST_ACK_OBSERVED_WITHOUT_DUPLICATE_WRITE')
        reviewed=g.oracle(s,'return await window.__j06attention.inspect()');assert reviewed['notice']['reviewed'] and reviewed['notice']['state']=='ACTIVE' and reviewed['acknowledgments']==2,reviewed
        evidence['attention-fault-recovery']=reviewed
        capture(s,'attention-reviewed-still-active',evidence)
        # The saved SOURCE_HELD incident intentionally carries an unrelated
        # typed Settings/Backups target. It is not an affected generator.
        # Opening it must inspect its true cause without false navigation.
        g.click_text(s,'Inspect cause')
        wait(s,"sh.querySelector('[role=dialog]')?.getAttribute('aria-label')==='Incident details'&&location.hash==='#work-queue'",'J06_MISMATCHED_TARGET_OPENS_REAL_CAUSE_NOT_SETTINGS')
        g.click_text(s,'Close','[role=dialog]')
        g.click(s,'.top-search');g.fill(s,'[role=dialog] input','incident_j06_source')
        wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('incident_j06_source')",'J06_GLOBAL_SEARCH_INCLUDES_INCIDENTS')
        g.click_text(s,'Open','[role=dialog]')
        wait(s,"sh.querySelector('[role=dialog]')?.getAttribute('aria-label')==='Incident details'&&location.hash==='#work-queue'",'J06_SEARCH_OPENS_CAUSAL_INSPECTION_WITHOUT_MISROUTING')
        g.click_text(s,'Close','[role=dialog]')
        g.click(s,'[data-nav=settings]');g.click(s,'[data-settings=backups]')
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
        wait(s,"sh.querySelector('#page')?.textContent.includes('This file could not be verified')&&!sh.querySelector('#pcms-backup-inspect-file').disabled&&[...sh.querySelectorAll('button')].some(x=>x.textContent==='Verify selected backup'&&!x.disabled)",'J06_CORRUPT_FILE_REJECTED')
        chosen=b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('#pcms-backup-inspect-file').files[0].name")
        assert chosen==corrupt.name,chosen
        b.call('POST',f'/session/{s}/element/{control[a.ELEMENT]}/value',{'text':str(saved)})
        chosen=b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('#pcms-backup-inspect-file').files[0].name")
        assert chosen==saved.name,chosen
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
        # Daily scheduling is a real primary control and physical download,
        # independent of CREATE/Git. A same-day turn and cold wake cannot
        # manufacture another archive or lose the enabled schedule.
        g.click(s,'[data-settings=backups]');g.click(s,'#pcms-backup-daily');g.click_text(s,'Save daily schedule')
        until=time.monotonic()+45
        while time.monotonic()<until and len(list(downloads.glob('pcms-backups/*.pcms.jsonl')))<2:time.sleep(.1)
        daily_files=list(downloads.glob('pcms-backups/*auto_*.pcms.jsonl'));assert len(daily_files)==1,daily_files
        wait(s,"[...sh.querySelectorAll('button')].some(x=>x.textContent==='Check status'&&!x.disabled)",'J06_DAILY_SCHEDULE_SAVED')
        g.click_text(s,'Check status')
        wait(s,"sh.querySelector('#page').textContent.includes('Daily backup ·')&&sh.querySelector('#page').textContent.includes('1 successful daily copies tracked')",'J06_ACTUAL_DAILY_DOWNLOAD_COMPLETION')
        control=b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('#pcms-backup-inspect-file')")
        b.call('POST',f'/session/{s}/element/{control[a.ELEMENT]}/value',{'text':str(daily_files[0])})
        g.click_text(s,'Verify selected backup');wait(s,"sh.querySelector('#page').textContent.includes('Selected file verified')",'J06_DAILY_PHYSICAL_FILE_REOPEN')
        g.click_text(s,'Run daily backup now')
        wait(s,"[...sh.querySelectorAll('button')].some(x=>x.textContent==='Run daily backup now'&&!x.disabled)",'J06_SAME_DAY_DAILY_TURN_SETTLED')
        assert len(list(downloads.glob('pcms-backups/*.pcms.jsonl')))==2,'SAME_DAY_DAILY_TURN_DUPLICATED'
        before=b.owned_firefox_pids(profile);b.close(s);b.require_owned_exit(profile,before);s=None
        s=b.open_session(browser,profile);assert not before.intersection(b.owned_firefox_pids(profile))
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s)
        wait(s,"!!sh.querySelector('[data-settings=backups]')",'J06_DAILY_RESTART_SETTINGS');g.click(s,'[data-settings=backups]')
        wait(s,"sh.querySelector('#pcms-backup-daily')?.checked&&sh.querySelector('#page').textContent.includes('Daily backup ·')",'J06_DAILY_ENABLED_AND_LAST_GOOD_SURVIVE_PROCESS')
        assert len(list(downloads.glob('pcms-backups/*.pcms.jsonl')))==2,'DAILY_STARTUP_REPLAYED_DOWNLOAD'
        g.click(s,'#pcms-backup-daily');g.click_text(s,'Save daily schedule')
        wait(s,"!sh.querySelector('#pcms-backup-daily').checked&&sh.querySelector('#page').textContent.includes('Daily backups off')",'J06_DAILY_DISABLE_ACTUAL_STATE')
        capture(s,'daily-physical-file-restart',evidence)
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
