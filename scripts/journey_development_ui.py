#!/usr/bin/env python3
"""J04 installed primary interactions, real IDB/typed production controllers.
Offline external provider models only; never live Git/provider acceptance.
"""
import base64,json,os,pathlib,subprocess,sys,tempfile,time
from urllib.request import urlopen
import journey_generators_ui as g
b=g.b;a=g.a
click=g.click;button=g.click_text;fill=g.fill
def wait(s,expression,label,seconds=45):
    try:return g.wait(s,expression,label,seconds)
    except Exception:
        detail=b.execute(s,"const sh=document.getElementById('pcms-faithful-host')?.shadowRoot;return {url:location.href,dialog:sh?.querySelector('[role=dialog]')?.innerText.slice(0,3500),dialogLabel:sh?.querySelector('[role=dialog]')?.getAttribute('aria-label'),fixture:!!window.__j04}")
        data=oracle(s,"const x=await window.__j04.inspect();return {jobs:x.jobs.map(j=>({slug:j.slug,revision:j.revision,paused:j.operatorPaused,instructions:j.operatorInstruction})),commands:x.commands.slice(-12)}")
        pathlib.Path('build/j04-ui-failure.json').write_text(json.dumps({'ui':detail,'runtime':data},indent=2));print('J04_FAILURE_CONTEXT='+json.dumps({'ui':detail,'runtime':data}),flush=True)
        raise

def oracle(s,body='return await window.__j04.inspect()'):return g.oracle(s,body)
def fixture(s):
    source=pathlib.Path(__file__).with_name('fixtures').joinpath('j04-ui.mjs').read_text().replace('export async function','async function')
    out=oracle(s,source+';return await installDevelopmentFixture();');assert out.get('ok'),out
def capture(s,name,evidence):
    time.sleep(.2);pathlib.Path('build/j04-'+name+'.png').write_bytes(base64.b64decode(b.call('GET',f'/session/{s}/screenshot')))
    evidence[name]=b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;return {dialog:sh.querySelector('[role=dialog]')?.innerText.slice(0,6000),queue:sh.querySelector('#page')?.innerText.slice(0,6000),width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}")
def search(s,text):
    fill(s,'#queue-search',text);wait(s,"sh.querySelectorAll('.candidate-item').length===1&&!!sh.querySelector("+json.dumps('[data-clean-select=\"'+text+'\"]')+")",'J04_SEARCH_'+text)

def run(browser,archive,folder):
    profile=pathlib.Path(folder)/'j04-primary-development';profile.mkdir();downloads=profile/'downloads';downloads.mkdir()
    (profile/'user.js').write_text('user_pref("xpinstall.signatures.required",false);\nuser_pref("network.dns.forceResolve","127.0.0.1");\nuser_pref("browser.download.folderList",2);\nuser_pref("browser.download.useDownloadDir",true);\nuser_pref("browser.download.dir",'+json.dumps(str(downloads))+');\n')
    s=b.open_session(browser,profile)
    try:assert b.call('POST',f'/session/{s}/moz/addon/install',{'path':str(archive),'temporary':False},timeout=45)==b.ID
    finally:b.close(s)
    evidence={};s=b.open_session(browser,profile)
    try:
        uuid=b.addons_uuid(profile);url=f'moz-extension://{uuid}/pcms/index.html#work-queue'
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);fixture(s)
        click(s,'[data-nav=generators]');click(s,'[data-nav=work-queue]');wait(s,"!!sh.querySelector('[data-filter=\"queue:All\"]')",'J04_ALL_TAB');click(s,'[data-filter="queue:All"]');wait(s,"!!sh.querySelector('[data-clean-selection]')",'J04_PRIMARY_QUEUE')
        search(s,'j04-paged-1000');wait(s,"[...sh.querySelectorAll('button')].some(x=>x.textContent==='Inspect candidate'&&!x.disabled)",'J04_INSPECTION_BEYOND_1000_NOT_DISABLED')
        search(s,'j04-review-modified');button(s,'Inspect candidate')
        wait(s,"sh.querySelector('[aria-label=\"Candidate main.pjs\"]')?.value.startsWith('output\\n  Modified final source é')",'J04_ACTUAL_FULL_SOURCE_BYTES_WITHOUT_GIT')
        assert b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[aria-label=\"Previous main.pjs\"]').value")=='output\n  Previous saved source\n'
        # All current and deleted files remain navigable; the source is read
        # from actual canonical rows through revision-bound chunk/hash checks.
        button(s,'Next files');click(s,'[data-compare-path="src/file-057.txt"]')
        wait(s,"sh.querySelector('[aria-label=\"Candidate src/file-057.txt\"]')?.value==='Full asset 57\\n'",'J04_FILE_BEYOND_50')
        fill(s,'[aria-label="Find a comparison file"]','deleted');click(s,'[data-compare-path="src/deleted.txt"]')
        wait(s,"sh.querySelector('[aria-label=\"Previous src/deleted.txt\"]')?.value==='Preserved deleted file é\\n'",'J04_DELETED_SOURCE_PRESERVED')
        assert b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('.source-file').textContent.includes('File absent')")
        fill(s,'[aria-label="Find a comparison file"]','binary');click(s,'[data-compare-path="src/binary.dat"]');wait(s,"sh.querySelector('.source-file')?.textContent.includes('Binary asset')",'J04_BINARY_ASSET')
        button(s,'Download candidate')
        files=[]
        for _ in range(60):
            files=list(downloads.glob('candidate-binary*.dat'))
            if files and files[0].stat().st_size==4:break
            time.sleep(.1)
        assert files and files[0].read_bytes()==bytes([0,255,128,29]),files
        click(s,'.source-history > summary');wait(s,"sh.querySelector('.source-history')?.textContent.includes('Revision 5')",'J04_FULL_HISTORY_AVAILABLE');button(s,'Inspect checkpoint')
        wait(s,"[...sh.querySelectorAll('[aria-label=\"Candidate main.pjs\"]')].some(x=>x.value.startsWith('output\\n  Clean candidate é'))",'J04_HISTORY_EXACT_BYTES')
        capture(s,'complete-source-history',evidence);g.close(s)
        # Pause and Resume are actual persisted controls. A concurrent source
        # checkpoint causes a stale CAS, preserving the operator's text.
        search(s,'j04-repair');button(s,'Manage development','.candidate-item:has([data-clean-select="j04-repair"])');wait(s,"!!sh.querySelector('[aria-label=\"New development instructions\"]')",'J04_MEANINGFUL_DEVELOPMENT_CONTROLS')
        button(s,'Pause development');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Paused ·')",'J04_PAUSE_PERSISTED')
        fill(s,'[aria-label="New development instructions"]','Keep my exact recovery instructions.')
        touched=oracle(s,'return await window.__j04.touchRepair()');assert touched.get('ok'),touched
        button(s,'Give new instructions');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Your instructions are preserved')",'J04_STALE_CONTROL_PRESERVES_INPUT')
        assert b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[aria-label=\"New development instructions\"]').value")=='Keep my exact recovery instructions.'
        oracle(s,'return window.__j04.loseControl()');button(s,'Give new instructions');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Queued: Keep my exact recovery instructions.')",'J04_LOST_CONTROL_ACK_READS_DURABLE_QUEUE')
        assert len([j for j in oracle(s)['jobs'] if j['slug']=='j04-repair' and j.get('operatorInstruction')])==1
        button(s,'Resume development');wait(s,"[...sh.querySelectorAll('[role=dialog] button')].some(x=>x.textContent==='Pause development')",'J04_RESUME_PERSISTED_QUEUED_CAPACITY')
        capture(s,'operator-controls-recovery',evidence);g.close(s)
        # Selected-set review freezes actual source hashes, excludes modified
        # bytes, and stores one explicit decision. It cannot publish without
        # the independent Git/provider gates, which are offline in this phase.
        search(s,'j04-review-clean');click(s,'[data-clean-select="j04-review-clean"]')
        search(s,'j04-review-modified');click(s,'[data-clean-select="j04-review-modified"]');click(s,'[data-clean-selection]')
        wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('1 included · 1 require separate attention')",'J04_FROZEN_CLEAN_SET_EXCLUDES_MODIFIED')
        capture(s,'frozen-clean-selection',evidence);button(s,'Approve 1 unchanged candidates');a.alert_accept(s)
        wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Approval saved.')",'J04_ONE_SELECTED_SET_APPROVAL_RECORDED')
        assert len([x for x in oracle(s)['batches'] if x['state']=='APPROVED'])==1;assert not oracle(s)['effects'];g.close(s)
        search(s,'j04-manual');button(s,'Inspect candidate');wait(s,"!!sh.querySelector('.candidate-exception-review')",'J04_MANUAL_ROUTE_PRIMARY')
        click(s,'.candidate-exception-review > summary');fill(s,'[aria-label="Manual observation for default_generator_smoke"]','I opened the saved generator and checked the output and keyboard behavior.')
        click(s,'.candidate-exception-review input[type=checkbox]');button(s,'Save exceptional review')
        wait(s,"sh.querySelector('.candidate-exception-review')?.textContent.includes('Exceptional review saved.')",'J04_MANUAL_RECORD_NOT_AI_PASS')
        manual=next(j for j in oracle(s)['jobs'] if j['slug']=='j04-manual');assert manual['verifiedFinal'] is None and manual['chat1']['tests']=={} and manual['exceptionFrozen']
        capture(s,'manual-source-review',evidence);g.close(s)
        # Actual process restart retains source, queued instructions, frozen
        # set approval and manual evidence; no test-provider effect is replayed.
        old=b.owned_firefox_pids(profile);assert old,'J04_OLD_FIREFOX_PROCESS_MISSING';b.close(s);b.require_owned_exit(profile,old);s=None
        s=b.open_session(browser,profile);replacement=b.owned_firefox_pids(profile);assert replacement and not old.intersection(replacement),'J04_REPLACEMENT_FIREFOX_PROCESS_NOT_DISTINCT';b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);fixture(s)
        click(s,'[data-nav=generators]');click(s,'[data-nav=work-queue]');wait(s,"!!sh.querySelector('[data-filter=\"queue:All\"]')",'J04_ALL_TAB');click(s,'[data-filter="queue:All"]');search(s,'j04-repair');button(s,'Manage development','.candidate-item:has([data-clean-select="j04-repair"])')
        wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Queued: Keep my exact recovery instructions.')",'J04_COLD_RESTART_INSTRUCTIONS')
        persisted=oracle(s);assert len([x for x in persisted['batches'] if x['state']=='APPROVED'])==1 and len(persisted['exceptions'])==1 and not persisted['effects']
        capture(s,'persistent-restart',evidence)
        pathlib.Path('build/j04-primary-ui.json').write_text(json.dumps(evidence,indent=2));print('B J04_PRIMARY_SOURCE_BYTES_HISTORY_BINARY_CONTROLS_STALE_LOSTACK_FROZEN_SELECTION_MANUAL_RESTART=PASS',flush=True)
    finally:
        if s:b.close(s)

if __name__=='__main__':
    browser=pathlib.Path(os.environ['FIREFOX_BINARY']);driver=pathlib.Path(os.environ['GECKODRIVER_BINARY']);archive=pathlib.Path(sys.argv[1]).resolve()
    with tempfile.TemporaryDirectory(prefix='pcms-j04-firefox-') as folder:
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
