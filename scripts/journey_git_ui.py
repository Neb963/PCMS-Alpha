#!/usr/bin/env python3
"""J03 primary Git journey in an installed, persistent disposable Firefox.
All Git/provider effects are OFFLINE external models. Production UI, typed
boundaries, actual IDB, credential store, scanners and writers execute.
"""
import base64,json,os,pathlib,subprocess,sys,tempfile,time
from urllib.request import urlopen
import journey_generators_ui as g
b=g.b;a=g.a
click=g.click;click_text=g.click_text;fill=g.fill

def wait(s,expression,label,seconds=45):
    try:return g.wait(s,expression,label,seconds)
    except Exception:
        details=b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;return {dialogs:[...sh.querySelectorAll('[role=dialog]')].map(x=>({label:x.getAttribute('aria-label'),text:x.innerText.slice(0,2500)}))}")
        print('J03_FAILURE_CONTEXT='+json.dumps(details),flush=True)
        raise

def oracle(s,body='return await window.__j03.inspect()'):return g.oracle(s,body)
def fixture(s,empty=False):
    directory=pathlib.Path(__file__).with_name('fixtures')
    source='\n'.join(directory.joinpath(name).read_text().replace('export async function','async function') for name in ['j03-git-model.mjs','j02-ui.mjs','j03-ui.mjs'])
    out=oracle(s,source+';return await installGitFixture({empty:'+str(empty).lower()+'});');assert out.get('ok'),out

def capture(s,name,evidence):
    time.sleep(.2);pathlib.Path('build/j03-'+name+'.png').write_bytes(base64.b64decode(b.call('GET',f'/session/{s}/screenshot')))
    evidence[name]=b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;return {page:sh.querySelector('#page')?.innerText.slice(0,8000),dialog:sh.querySelector('[role=dialog]')?.innerText.slice(0,8000),overflow:document.documentElement.scrollWidth>innerWidth,width:innerWidth}")
def button(s,text):click_text(s,text)
def run(browser,archive,folder):
    profile=pathlib.Path(folder)/'j03-primary-git';profile.mkdir();downloads=profile/'downloads';downloads.mkdir()
    # Production background network is kept offline as well as the external
    # fixture. Only the test HTTP model can answer Git/provider operations.
    (profile/'user.js').write_text('user_pref("xpinstall.signatures.required",false);\nuser_pref("network.dns.forceResolve","127.0.0.1");\nuser_pref("browser.download.folderList",2);\nuser_pref("browser.download.useDownloadDir",true);\nuser_pref("browser.download.dir",'+json.dumps(str(downloads))+');\n')
    s=b.open_session(browser,profile)
    try:assert b.call('POST',f'/session/{s}/moz/addon/install',{'path':str(archive),'temporary':False},timeout=45)==b.ID
    finally:b.close(s)
    evidence={};s=b.open_session(browser,profile)
    try:
        uuid=b.addons_uuid(profile);url=f'moz-extension://{uuid}/pcms/index.html#generators'
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);wait(s,"!!sh.querySelector('[data-action=git-sources]')",'J03_PRIMARY')
        fixture(s);click(s,'[data-nav=settings]');wait(s,"!!sh.querySelector('[aria-label=\"GitHub access token\"]')",'J03_CONNECT_FORM')
        fill(s,'[aria-label="GitHub access token"]','offline-j03-test-credential-only');button(s,'Connect')
        wait(s,"!!sh.querySelector('[data-main-review]')",'J03_CONNECTED_EXACT_IMPORT_SCOPE')
        before=oracle(s);assert not before['git']['effects'] and not before['provider']['ledger']['effects'],before['commands']
        assert all(before['policy']['record']['grants'].values()),before['policy']
        assert b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[aria-label=\"GitHub access token\"]').value")==''
        capture(s,'initial-import-plan',evidence)
        assert '1 planned new' in evidence['initial-import-plan']['page'] and '1 already owned' in evidence['initial-import-plan']['page'],evidence['initial-import-plan']
        # Source workspace is reachable from the main Generators page before
        # import and includes >100 real files, exact UTF8 and binary download.
        click(s,'[data-nav=generators]');click(s,'[data-action=git-sources]');wait(s,"sh.querySelector('[aria-label=\"Git sources\"]')?.textContent.includes('j03-created-alpha')",'J03_SOURCE_ENTRY')
        rows=b.execute(s,"return [...document.getElementById('pcms-faithful-host').shadowRoot.querySelectorAll('[role=dialog] .queue-item')].find(x=>x.textContent.includes('j03-created-alpha')).querySelector('button')")
        b.call('POST',f'/session/{s}/element/{rows[a.ELEMENT]}/click',{})
        wait(s,"!!sh.querySelector('[aria-label=\"Source main.pjs\"]')",'J03_FULL_SOURCE_WORKSPACE')
        fill(s,'[aria-label="Find a source file"]','src/file-107.txt');click(s,'[data-source-path="src/file-107.txt"]')
        wait(s,"sh.querySelector('[aria-label=\"Source src/file-107.txt\"]')?.value==='File 107\\n'",'J03_FILE_BEYOND_100_ACTUAL_BYTES')
        fill(s,'[aria-label="Find a source file"]','src/binary.dat');click(s,'[data-source-path="src/binary.dat"]');wait(s,"sh.querySelector('.source-file')?.textContent.includes('Binary asset')",'J03_BINARY_BYTES')
        button(s,'Download file')
        for _ in range(60):
            files=list(downloads.glob('binary*.dat'))
            if files:break
            time.sleep(.1)
        assert files and files[0].read_bytes()==bytes([0,255,128,1]),files
        capture(s,'full-source-binary',evidence);g.close(s)
        assert not oracle(s)['provider']['ledger']['effects']
        # The one initial bounded approval starts ordinary background work;
        # there is no per-folder create/rename/READY Start sequence.
        click(s,'[data-nav=settings]');button(s,'Read GitHub main');wait(s,"[...sh.querySelectorAll('button')].some(x=>x.textContent==='Start initial import')",'J03_INITIAL_APPROVAL')
        button(s,'Start initial import');wait(s,"sh.querySelector('[data-main-review]')?.textContent.includes('Initial import queued')",'J03_INITIAL_IMPORT_QUEUED')
        progressed=oracle(s,'return await window.__j03.tick(9)')
        created=next(r for r in progressed['provider']['records'] if r['slug']=='j03-created-alpha')
        assert created['state']=='ASSOCIATED_NOT_READY',created
        assert len(progressed['provider']['ledger']['effects'])==2,progressed['provider']['ledger']['effects']
        ready=oracle(s,'return await window.__j03.ready()');assert any(r['slug']=='j03-created-alpha' for r in ready['items']),ready
        print('B J03_INITIAL_IMPORT_ACTUAL_PRIVATE_CREATE_READONLY_READY_FOLDER_LINK_AUTOMATIC_READY_QUEUE=PASS',flush=True)
        # Prompt editing uses the real browser credential, journal, conditional
        # Git writer and independent exact-byte HTTP readback.
        click(s,'[data-settings=ai]');wait(s,"sh.querySelector('[aria-label=\"Default AI testing instructions\"]')?.value.startsWith('Existing authoritative')",'J03_GIT_CANONICAL_PROMPT')
        assert not b.execute(s,"return !!document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[aria-label=\"AI development guidance\"]')")
        fill(s,'[aria-label="Default AI testing instructions"]','Reviewed operator instructions. Keep exact source and test actual behavior.\n');button(s,'Save to GitHub')
        wait(s,"sh.querySelector('[data-git-prompt]')?.textContent.includes('Saved and verified on GitHub main')",'J03_PROMPT_REAL_CONDITIONAL_WRITE')
        saved=oracle(s);assert len(saved['git']['effects'])==1 and not saved['git']['effects'][0]['force']
        capture(s,'canonical-prompt',evidence)
        # Concurrent external edit preserves both versions and asks a real
        # conflict decision, without a blind overwrite or fabricated success.
        fill(s,'[aria-label="Default AI testing instructions"]','My preserved concurrent draft\n')
        oracle(s,"return await window.__j03.merge({'pcms/prompts/default-chat1.md':'Concurrent Git instructions\\n'},'external prompt edit')")
        button(s,'Save to GitHub');wait(s,"sh.querySelector('[data-git-prompt]')?.textContent.includes('Your draft is preserved')",'J03_PROMPT_CONFLICT_PRESERVES_DRAFT')
        assert b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[aria-label=\"Default AI testing instructions\"]').value")=='My preserved concurrent draft\n'
        assert len(oracle(s)['git']['effects'])==1
        button(s,'Compare latest Git version');wait(s,"sh.querySelector('[aria-label=\"Latest GitHub prompt\"]')?.value==='Concurrent Git instructions\\n'",'J03_REAL_CONFLICT_COMPARISON')
        capture(s,'prompt-conflict',evidence);button(s,'Keep my edits on this reviewed version')
        oracle(s,'return await window.__j03.loseNextRef()');button(s,'Save to GitHub')
        wait(s,"sh.querySelector('[data-git-prompt]')?.textContent.includes('Save outcome unknown')",'J03_PROMPT_LOST_REF_ACK')
        effects=len(oracle(s)['git']['effects']);assert effects==2
        button(s,'Check pending save');wait(s,"sh.querySelector('[data-git-prompt]')?.textContent.includes('Previous save verified')",'J03_READONLY_RECONCILE_NO_REPLAY')
        assert len(oracle(s)['git']['effects'])==effects
        # Full process restart retains actual stored credential and source
        # journals. Newly merged main folders remain automatic after setup.
        pids=b.owned_firefox_pids(profile);b.close(s);b.require_owned_exit(profile,pids);s=None
        s=b.open_session(browser,profile);b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);fixture(s)
        click(s,'[data-nav=settings]');button(s,'Read GitHub main');wait(s,"sh.querySelector('[data-main-review]')?.textContent.includes('Connected. Newly merged')",'J03_COLD_RESTART_REUSES_SAVED_CREDENTIAL')
        oracle(s,"return await window.__j03.merge({'generators/j03-later/DEPLOYMENT.md':'Status: NOT_READY\\n'},'reviewed new main folder')")
        later=oracle(s,'return await window.__j03.tick(9)');new=next(r for r in later['provider']['records'] if r['slug']=='j03-later');assert new['state']=='ASSOCIATED_NOT_READY',new
        assert len(later['provider']['ledger']['effects'])==4
        button(s,'Read GitHub main');wait(s,"sh.querySelector('[data-main-review]')?.textContent.includes('j03-later')",'J03_LATER_MAIN_FOLDER_AUTOMATIC')
        assert not b.execute(s,"return [...document.getElementById('pcms-faithful-host').shadowRoot.querySelectorAll('button')].some(x=>x.textContent==='Start initial import'&&!x.hidden)")
        capture(s,'automatic-after-restart',evidence)
        # Search opens an actual nested Git file, not only a generator match.
        click(s,'[data-action=search]');fill(s,'[aria-label="Search generators, accounts, source paths and operations"]','src/file-107.txt')
        wait(s,"sh.querySelector('.overlay')?.textContent.includes('generators/j03-created-alpha/src/file-107.txt')",'J03_GIT_FILE_GLOBAL_SEARCH')
        click_text(s,'Open','.overlay');wait(s,"sh.querySelector('[aria-label=\"Source src/file-107.txt\"]')?.value==='File 107\\n'",'J03_SEARCH_OPENS_EXACT_FILE')
        capture(s,'source-search',evidence);g.close(s)
        # Existing-source identity choice is a single consequential approval,
        # followed by the real bounded prepare/one-attempt/readback/link job.
        click(s,'[data-nav=generators]');fill(s,'#generator-search','j02-owned-000-002')
        wait(s,"sh.querySelectorAll('.workspace-surface tbody tr').length===1&&sh.querySelector('.workspace-surface tbody .name-cell')?.textContent==='j02-owned-000-002'",'J03_RENAME_ORIGINAL')
        click(s,'.workspace-surface tbody .name-cell');button(s,'Inspect source');wait(s,"!!sh.querySelector('[aria-label=\"Source main.pjs\"]')",'J03_RENAME_SOURCE_LINK');g.close(s)
        oracle(s,"return await window.__j03.moveFolder('j02-owned-000-002','j03-renamed-original')")
        held=oracle(s,'return await window.__j03.tick(1)');assert not held['git'].get('renameEffects')
        click(s,'[data-nav=work-queue]');wait(s,"sh.querySelector('.queue-list')?.textContent.includes('Review possible source-folder rename')",'J03_REAL_RENAME_CHOICE')
        button(s,'Rename verified existing');a.alert_accept(s)
        wait(s,"sh.querySelector('.queue-list')?.textContent.includes('Rename queued')",'J03_ONE_RENAME_DECISION')
        prepared=oracle(s,"return await window.__j03.renameStep('j03-renamed-original')");assert prepared['state']=='RENAME_PREPARED',prepared
        oracle(s,"return await window.__j03.merge({'generators/j03-renamed-original/src/reviewed-update.txt':'New reviewed Git source\\n'},'external source changed after rename preparation')")
        blocked=oracle(s,"return await window.__j03.renameStep('j03-renamed-original')");assert not blocked['ok'] and blocked['code']=='RENAME_GIT_IDENTITY_CHANGED',blocked
        assert not oracle(s)['git'].get('renameEffects')
        oracle(s,'return await window.__j03.tick(1)');click(s,'[data-nav=work-queue]')
        wait(s,"sh.querySelector('.queue-list')?.textContent.includes('The Git source changed')",'J03_CHANGED_SOURCE_HELD_BEFORE_RENAME')
        button(s,'Update source review');wait(s,"[...sh.querySelectorAll('.queue-list button')].some(x=>x.textContent==='Rename verified existing')",'J03_CURRENT_SOURCE_REVIEW_RECOVERY')
        button(s,'Rename verified existing');a.alert_accept(s);wait(s,"sh.querySelector('.queue-list')?.textContent.includes('Rename queued')",'J03_CHANGED_SCOPE_APPROVED')
        renamed=oracle(s,'return await window.__j03.tick(5)');assert len(renamed['git'].get('renameEffects',[]))==1,renamed['git'].get('renameEffects')
        newrow=next(r for r in renamed['provider']['inventory'] if r['slug']=='j03-renamed-original');assert newrow['remoteId']=='public_0_2' and newrow['ownerState']=='OBSERVED_OWNER',newrow
        oldrow=next(r for r in renamed['provider']['inventory'] if r['slug']=='j02-owned-000-002');assert oldrow['ownerState']=='UNOBSERVED' and oldrow['remoteId']=='public_0_2'
        click(s,'[data-nav=generators]');fill(s,'#generator-search','j03-renamed-original');wait(s,"sh.querySelector('.workspace-surface tbody')?.textContent.includes('j03-renamed-original')",'J03_RENAMED_IDENTITY_VISIBLE')
        capture(s,'rename-completed',evidence)
        # The alternative choice preserves the old provider resource and
        # creates a distinct new one through the ordinary coordinator.
        oracle(s,"return await window.__j03.moveFolder('j03-later','j03-separate')");oracle(s,'return await window.__j03.tick(1)')
        click(s,'[data-nav=work-queue]');wait(s,"sh.querySelector('.queue-list')?.textContent.includes('j03-separate')",'J03_SEPARATE_CHOICE')
        button(s,'Create separate generator');a.alert_accept(s)
        wait(s,"![...sh.querySelectorAll('.queue-list .queue-item')].some(x=>x.textContent.includes('Review possible source-folder rename')&&x.textContent.includes('j03-separate'))",'J03_SEPARATE_CHOICE_COMMITTED')
        separate=oracle(s,'return await window.__j03.tick(9)');resources=separate['provider']['ledger']['resources'];old=next(x for x in resources if x['slug']=='j03-later');matches=[x for x in resources if x['slug']=='j03-separate'];assert matches,{'records':[r for r in separate['provider']['records'] if r['slug']=='j03-separate'],'commands':separate['commands'][-8:]};new=matches[0];assert old['id']!=new['id']
        assert len(separate['git']['renameEffects'])==1
        operation=next(r['createOperationId'] for r in separate['provider']['records'] if r['slug']=='j03-separate')
        click(s,'[data-action=search]');fill(s,'[aria-label="Search generators, accounts, source paths and operations"]',operation)
        wait(s,"sh.querySelector('.overlay')?.textContent.includes("+json.dumps(operation)+")",'J03_OPERATION_ID_SEARCH')
        click_text(s,'Open','.overlay');wait(s,"sh.querySelector('#queue-search')?.value==="+json.dumps(operation),'J03_SEARCH_OPENS_EXACT_OPERATION')
        capture(s,'operation-search',evidence)
        print('B J03_PRIMARY_EXISTING_RENAME_ONE_LOST_ACK_NO_REPLAY_ORIGINALS_RETAINED_AND_CREATE_SEPARATE=PASS',flush=True)
        print('B J03_PRIMARY_CONNECT_IMPORT_FULL_SOURCE_PROMPT_CONFLICT_LOST_ACK_COLD_RESTART_AUTOMATIC_MAIN=PASS',flush=True)
    finally:
        if s:b.close(s)
        pathlib.Path('build/j03-ui-evidence.json').write_text(json.dumps(evidence,indent=2))

def run_empty(browser,archive,folder):
    profile=pathlib.Path(folder)/'j03-empty-repository';profile.mkdir()
    (profile/'user.js').write_text('user_pref("xpinstall.signatures.required",false);\nuser_pref("network.dns.forceResolve","127.0.0.1");\n')
    s=b.open_session(browser,profile)
    try:assert b.call('POST',f'/session/{s}/moz/addon/install',{'path':str(archive),'temporary':False},timeout=45)==b.ID
    finally:b.close(s)
    s=b.open_session(browser,profile);evidence={}
    try:
        uuid=b.addons_uuid(profile);url=f'moz-extension://{uuid}/pcms/index.html#settings'
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);fixture(s,empty=True)
        click(s,'[data-nav=settings]');wait(s,"!!sh.querySelector('[aria-label=\"GitHub access token\"]')",'J03_EMPTY_CONNECT')
        fill(s,'[aria-label="GitHub access token"]','offline-j03-test-credential-only');button(s,'Connect')
        wait(s,"sh.querySelector('[data-main-review]')?.textContent.includes('not initialized')",'J03_EMPTY_PROVEN_NOT_MISSING_BRANCH')
        assert len(oracle(s)['git']['effects'])==0
        click(s,'[data-settings=ai]');wait(s,"sh.querySelector('[aria-label=\"Default AI testing instructions\"]')?.value.includes('Test the selected saved generator')",'J03_REVIEW_VISIBLE_STARTER')
        fill(s,'[aria-label="Default AI testing instructions"]','Reviewed exact starter for this repository.\n');button(s,'Create prompt on main')
        wait(s,"sh.querySelector('[data-git-prompt]')?.textContent.includes('Saved and verified on GitHub main')",'J03_EMPTY_INITIAL_REF_AND_EXACT_PROMPT_READBACK')
        initialized=oracle(s);assert len(initialized['git']['effects'])==1 and initialized['git']['effects'][0]['method']=='POST'
        main=oracle(s,'return await window.__j03.main()');assert main['prompt']['text']=='Reviewed exact starter for this repository.\n' and main['recognizedCount']==0
        capture(s,'empty-repository-initialized',evidence)
        oracle(s,"return await window.__j03.merge({'generators/j03-empty-first/DEPLOYMENT.md':'Status: NOT_READY\\n'},'first reviewed main folder after empty setup')")
        automatic=oracle(s,'return await window.__j03.tick(9)');created=next(r for r in automatic['provider']['records'] if r['slug']=='j03-empty-first');assert created['state']=='ASSOCIATED_NOT_READY',created
        assert len(automatic['provider']['ledger']['effects'])==2
        print('B J03_EMPTY_REPOSITORY_EXACT_REVIEWED_STARTER_FUTURE_MAIN_CREATION_WITHOUT_REPEAT_IMPORT=PASS',flush=True)
    finally:
        b.close(s)
        target=pathlib.Path('build/j03-ui-evidence.json');all_evidence=json.loads(target.read_text()) if target.exists() else {};all_evidence.update(evidence);target.write_text(json.dumps(all_evidence,indent=2))

if __name__=='__main__':
    browser=pathlib.Path(os.environ['FIREFOX_BINARY']);driver=pathlib.Path(os.environ['GECKODRIVER_BINARY']);archive=pathlib.Path(sys.argv[1]).resolve()
    with tempfile.TemporaryDirectory(prefix='pcms-j03-firefox-') as folder:
        server=subprocess.Popen([str(driver),'--port',str(b.PORT),'--allow-system-access'],stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
        try:
            for _ in range(80):
                try:
                    with urlopen(b.HOST+'/status',timeout=1) as r:
                        if json.load(r).get('value',{}).get('ready'):break
                except Exception:time.sleep(.25)
            else:raise RuntimeError('geckodriver not ready')
            run(browser,archive,pathlib.Path(folder))
            run_empty(browser,archive,pathlib.Path(folder))
        finally:server.terminate();server.wait(timeout=10)
