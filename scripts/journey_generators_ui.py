#!/usr/bin/env python3
"""J02 installed primary UI, disposable profile, OFFLINE provider/Git fixtures.
Exercises real clicks, typed boundaries, canonical IDB, runner and independent
provider ledger. This is B engineering evidence, never live provider acceptance.
"""
import base64,json,os,pathlib,subprocess,sys,tempfile,time
from urllib.request import urlopen
import journey_accounts_ui as a
b=a.b

def wait(s,expression,label,seconds=45):
    print('B '+label,flush=True)
    return a.wait(s,expression,label,seconds)
def click(s,selector):return a.click(s,selector)
def click_text(s,label,scope=''):
    container=("[...sh.querySelectorAll('.batch-item')].find(x=>x.querySelector('strong')?.textContent==="+json.dumps(scope[5:])+")" if scope.startswith('file:') else "sh.querySelector("+json.dumps(scope)+")" if scope else "sh")
    node=b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;const p="+container+";const e=[...p.querySelectorAll('button')].find(x=>x.textContent.trim()==="+json.dumps(label)+");if(e)e.scrollIntoView({block:'center',behavior:'instant'});return e")
    assert node and a.ELEMENT in node,(label,scope)
    b.call('POST',f'/session/{s}/element/{node[a.ELEMENT]}/click',{})
def fill(s,selector,text):
    node=b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector("+json.dumps(selector)+")")
    if text=='':
        b.call('POST',f'/session/{s}/element/{node[a.ELEMENT]}/value',{'text':'\ue009a\ue000\ue003'})
    else:
        b.call('POST',f'/session/{s}/element/{node[a.ELEMENT]}/clear',{})
        b.call('POST',f'/session/{s}/element/{node[a.ELEMENT]}/value',{'text':text})
def change(s,selector,value):
    b.execute(s,"const e=document.getElementById('pcms-faithful-host').shadowRoot.querySelector("+json.dumps(selector)+");e.value="+json.dumps(value)+";e.dispatchEvent(new Event('change',{bubbles:true}));")
def oracle(s,body='return await window.__j02.inspect()'):
    return b.call('POST',f'/session/{s}/execute/async',{'script':'const done=arguments[arguments.length-1];(async()=>{'+body+'})().then(done).catch(e=>done({error:String(e),stack:String(e.stack)}))','args':[]},timeout=120)
def fixture(s):
    source=pathlib.Path(__file__).with_name('fixtures').joinpath('j02-ui.mjs').read_text().replace('export async function installGeneratorFixture','async function installGeneratorFixture')
    result=oracle(s,source+';return await installGeneratorFixture();')
    assert result.get('ok') is True,result
    click(s,'[data-nav="generators"]')
    wait(s,"sh.querySelector('.pagination')?.textContent.includes("+str(result['inventory'])+")",'J02_1200_REAL_IDB')
def capture(s,name,evidence):
    time.sleep(.25) # capture the settled dialog, after its short CSS entrance
    directory=pathlib.Path('build');directory.mkdir(exist_ok=True)
    directory.joinpath('j02-'+name+'.png').write_bytes(base64.b64decode(b.call('GET',f'/session/{s}/screenshot')))
    evidence[name]=b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;return {text:sh.querySelector('#page').innerText,dialog:sh.querySelector('[role=dialog]')?.innerText||'',width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}")
def close(s):click(s,'[role="dialog"] .drawer-head button')

def run(browser,archive,folder):
    profile=pathlib.Path(folder)/'j02-primary-generators';profile.mkdir()
    (profile/'user.js').write_text('user_pref("xpinstall.signatures.required",false);\n')
    s=b.open_session(browser,profile)
    try:assert b.call('POST',f'/session/{s}/moz/addon/install',{'path':str(archive),'temporary':False},timeout=45)==b.ID
    finally:b.close(s)
    evidence={};s=b.open_session(browser,profile)
    try:
        uuid=b.addons_uuid(profile);url=f'moz-extension://{uuid}/pcms/index.html#generators'
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s)
        wait(s,"!!sh.querySelector('[data-action=create]')",'J02_PRIMARY')
        fixture(s)
        # Global facets are evaluated before slicing the 1200-record fleet.
        click(s,'[data-filter="generators:PUBLISHED"]')
        wait(s,"sh.querySelector('.pagination').textContent.includes('600')",'J02_PUBLISHED_GLOBAL')
        click(s,'[data-action="generator-filters"]');change(s,'#generator-source','GIT')
        wait(s,"sh.querySelector('.pagination').textContent.includes('200')",'J02_SOURCE_GLOBAL')
        capture(s,'global-filters',evidence)
        change(s,'#generator-source','ALL');click(s,'[data-filter="generators:ALL"]')
        wait(s,"sh.querySelector('.pagination').textContent.includes('1200')",'J02_ALL_FLEET')
        click(s,'[data-generator-select]');click(s,'[data-action="gen-next"]')
        wait(s,"sh.querySelector('.pagination').textContent.includes('25–48')",'J02_PAGE2')
        click(s,'[data-generator-select]')
        wait(s,"sh.querySelector('[data-selection-count]')?.textContent.includes('2 selected')",'J02_SELECTION_ACROSS_PAGES')
        click(s,'[data-action="review-generator-selection"]')
        wait(s,"sh.querySelector('[aria-label="+'"Selected generators"'+"]')?.textContent.includes('2 selected records')",'J02_SELECTION_DRAWER')
        capture(s,'selection',evidence);close(s)
        # A complete process restart must retain the selection and full fleet.
        pids=b.owned_firefox_pids(profile);b.close(s);b.require_owned_exit(profile,pids);s=None
        s=b.open_session(browser,profile);b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);fixture(s)
        wait(s,"sh.querySelector('[data-selection-count]')?.textContent.includes('2 selected')",'J02_SELECTION_COLD_RESTART')
        # Account-level adoption captures exact original bytes automatically;
        # the primary UI can inspect them while Git is unavailable.
        captured=oracle(s,'return await window.__j02.adopt();');assert captured.get('ok'),captured
        fill(s,'#generator-search','j02-owned-000-002')
        wait(s,"sh.querySelector('.pagination')?.textContent.includes('of 1 generators')",'J02_ORIGINAL_TARGET')
        click(s,'.workspace-surface tbody tr .name-cell');click_text(s,'Original source')
        wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('src/binary.dat')",'J02_ORIGINAL_MANIFEST')
        click_text(s,'View original','file:main.pjs')
        wait(s,"sh.querySelector('[aria-label=\"Original main.pjs\"]')?.value.includes('Original source é')",'J02_ORIGINAL_ACTUAL_BYTES')
        click_text(s,'Retry preservation')
        wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Original source is saved locally')",'J02_ORIGINAL_RECOVERY_CONTROL')
        assert any(c['type']=='RETRY_ADOPTION' and c['ok'] is True and c.get('code')=='ADOPTION_AUTO_CHECKPOINT' for c in oracle(s)['commands'])
        capture(s,'original-source-git-outage',evidence);close(s)
        fill(s,'#generator-search','');wait(s,"sh.querySelector('.pagination').textContent.includes('1200')",'J02_ORIGINAL_FLEET_RESTORE')
        # Open uses the account-bound production capability and independent tab oracle.
        click(s,'.workspace-surface tbody tr .open-col button')
        assert len(oracle(s)['ledger']['opened'])==1
        click(s,'[data-action=create]')
        wait(s,"[...sh.querySelectorAll('[role=dialog] button')].some(b=>b.textContent==='Pause creation'&&!b.disabled)",'J02_SCOPED_POLICY')
        click_text(s,'Pause creation');wait(s,"[...sh.querySelectorAll('[role=dialog] button')].some(b=>b.textContent==='Resume creation'&&!b.disabled)",'J02_PAUSE_INDEPENDENT_NO_GIT')
        click_text(s,'Resume creation');wait(s,"[...sh.querySelectorAll('[role=dialog] button')].some(b=>b.textContent==='Pause creation'&&!b.disabled)",'J02_RESUME_INDEPENDENT_NO_GIT')
        fill(s,'[aria-label="Generator names"]','INVALID NAME')
        click_text(s,'Preview assignments')
        wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('lowercase')",'J02_INVALID_INPUT_RECOVERY')
        # Large paste is one input event, as pasting 1001 lines in Firefox.
        names='\n'.join('j02-preview-'+str(i) for i in range(1001))
        b.execute(s,"const e=document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[aria-label=\"Generator names\"]');e.value="+json.dumps(names)+";e.dispatchEvent(new Event('input',{bubbles:true}));")
        click_text(s,'Preview assignments')
        wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('1001 new')",'J02_1001_PREVIEW',90)
        assert not oracle(s)['ledger']['effects']
        capture(s,'1001-frozen-preview',evidence);close(s)
        # One healthy resource, a coalesced input, a held account and I17 input.
        click(s,'[data-action=create]')
        fill(s,'[aria-label="Generator names"]','j02-created-alpha\nj02-held\npcms-test-esr-chain-20261015-a01\nj02-created-alpha')
        click_text(s,'Preview assignments');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('1 new')",'J02_MIXED_PREVIEW')
        click_text(s,'Submit batch');wait(s,"!!sh.querySelector('[aria-label="+'"Batch progress"'+"]')",'J02_DURABLE_BATCH')
        state=oracle(s,'return await window.__j02.tick(18)');assert 'error' not in state,state
        healthy=[r for r in state['records'] if r['slug']=='j02-created-alpha'];assert healthy and healthy[0]['state']=='GIT_INIT_PENDING',{'records':state['records'],'ledger':state['ledger']}
        effects=state['ledger']['effects'];assert [x['kind'] for x in effects]==['CREATE','RENAME'],effects
        assert not any(r['slug']=='pcms-test-esr-chain-20261015-a01' for r in state['records']),state['records']
        click_text(s,'Refresh','[aria-label="Batch progress"]')
        wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('1 generator confirmed')",'J02_CONFIRMED_REAL_CREATION')
        capture(s,'mixed-progress-git-outage',evidence)
        # Readback/identity recovery after actual production-shaped slug census.
        result=oracle(s,'const d=await window.__j02.inspect();const r=d.records.find(r=>r.slug===\'j02-created-alpha\');await window.__j02.census(r.accountId);return await window.__j02.recheck();')
        assert 'error' not in result,result
        confirmed=[]
        for _ in range(100):
            confirmed=oracle(s,"return (await window.__j02.inspect()).inventory.filter(r=>r.slug==='j02-created-alpha');")
            if confirmed and confirmed[0]['ownerState']=='OBSERVED_OWNER':break
            time.sleep(.15)
        assert confirmed[0]['ownerState']=='OBSERVED_OWNER',confirmed
        # Unavailable account resumes independently, retaining the existing pin.
        oracle(s,'await window.__j02.recover();return true;')
        click_text(s,'Refresh','[aria-label="Batch progress"]')
        click(s,'[data-batch-index="1"] button')
        recovered=oracle(s,'return await window.__j02.tick(18);')
        held=[r for r in recovered['records'] if r['slug']=='j02-held'];assert held[0]['state']=='GIT_INIT_PENDING',held
        assert held[0]['accountId']=='account_j02_049',held
        assert [x['kind'] for x in recovered['ledger']['effects']]==['CREATE','RENAME','CREATE','RENAME'],recovered['ledger']
        # Inspect canonical outcomes even if cooldown defers automatic retry.
        close(s);click(s,'[data-action="creation-batches"]');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('4 generator requests')",'J02_HISTORY_REOPEN')
        capture(s,'history',evidence);close(s)
        # Abort a real IDB write after the first bounded chunk, then recover
        # the exact saved input/batch across another complete process restart.
        oracle(s,'await window.__j02.addUnknownAccount();return true;')
        previews=sum(c['type']=='PREVIEW_CREATE_BATCH' for c in oracle(s)['commands'])
        oracle(s,'return window.__j02.holdAccountReads();')
        click(s,'[data-action=create]')
        partial='\n'.join('j02-restart-input-'+str(i) for i in range(40))
        b.execute(s,"const e=document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[aria-label=\"Generator names\"]');e.value="+json.dumps(partial)+";e.dispatchEvent(new Event('input',{bubbles:true}));")
        click_text(s,'Preview assignments')
        deadline=time.monotonic()+15;reply=None
        while time.monotonic()<deadline:
            reply=oracle(s)
            if sum(c['type']=='PREVIEW_CREATE_BATCH' for c in reply['commands'])>previews and reply['pendingAccountReads']>0:break
            time.sleep(.1)
        else:raise AssertionError(('J02_DELAYED_ACCOUNT_READ_NOT_EXERCISED',reply))
        assert b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;return !sh.querySelector('[role=dialog]')?.textContent.includes('40 need attention')&&[...sh.querySelectorAll('button')].some(b=>b.textContent==='Preview assignments'&&b.disabled)"),'J02_PREVIEW_MUST_WAIT_FOR_ITS_CONTEXTUAL_ACCOUNT_ACTION'
        oracle(s,'return window.__j02.releaseAccountReads();')
        wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('40 need attention')&&[...sh.querySelectorAll('button')].some(b=>b.textContent==='Complete inventory · New account'&&!b.disabled)",'J02_AUTOMATIC_INITIAL_UNKNOWN_HOLD_AND_ACCOUNT_ACTION_ATOMIC')
        change(s,'[aria-label="Creation account"]','account_j02_000')
        click_text(s,'Preview assignments');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('40 new')",'J02_PINNED_ACCOUNT_INDEPENDENT_PREVIEW')
        oracle(s,'await window.__j02.interruptInput();await window.__j02.delayInput();return true;')
        click_text(s,'Submit batch')
        for _ in range(100):
            if oracle(s,'return window.__j02.inputWaiting();'):break
            time.sleep(.05)
        else:raise AssertionError('J02_DELAYED_APPEND_NOT_REACHED')
        before_previews=len([c for c in oracle(s)['commands'] if c['type']=='PREVIEW_CREATE_BATCH'])
        locked=b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;const update=[...sh.querySelectorAll('button')].find(b=>b.textContent==='Update preview');update.dispatchEvent(new MouseEvent('click',{bubbles:true}));return {readOnly:sh.querySelector('[aria-label=\"Generator names\"]').readOnly,locked:update.disabled&&update.hidden}")
        assert locked=={'readOnly':True,'locked':True},locked
        node=b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[aria-label=\"Generator names\"]')")
        b.call('POST',f'/session/{s}/element/{node[a.ELEMENT]}/value',{'text':'CHANGED-INPUT'})
        assert b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[aria-label=\"Generator names\"]').value")==partial
        draft=oracle(s,"return (await browser.storage.local.get('pcmsUiCreationDraftV1')).pcmsUiCreationDraftV1;")
        assert draft['slugs']==partial.split('\n'),draft
        assert len([c for c in oracle(s)['commands'] if c['type']=='PREVIEW_CREATE_BATCH'])==before_previews
        oracle(s,'return window.__j02.releaseInput();')
        wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Submission was interrupted')",'J02_REAL_IDB_ABORT')
        assert b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;const update=[...sh.querySelectorAll('button')].find(b=>b.textContent==='Update preview');return sh.querySelector('[aria-label=\"Generator names\"]').readOnly&&update.disabled&&update.hidden")
        print('B J02_DELAYED_APPEND_PREVIEW_EDIT_LOCK_AND_DRAFT_IDENTITY=PASS',flush=True)
        saved=oracle(s,"return (await window.__j02.inspect()).batches.find(b=>b.state==='INGESTING');")
        assert saved['appended']==32 and saved['total']==40,saved
        capture(s,'interrupted-input',evidence)
        pids=b.owned_firefox_pids(profile);b.close(s);b.require_owned_exit(profile,pids);s=None
        s=b.open_session(browser,profile);b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);fixture(s)
        click(s,'[data-action=create]');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('An interrupted submission')",'J02_SAVED_INPUT_COLD_RESTART')
        click_text(s,'Resume saved submission');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Saved submission restored')",'J02_SAME_BATCH_RESUME')
        click_text(s,'Submit batch');wait(s,"!!sh.querySelector('[aria-label=\"Batch progress\"]')",'J02_RESUMED_QUEUED')
        resumed=oracle(s,"return (await window.__j02.inspect()).batches.find(b=>b.batchId==="+json.dumps(saved['batchId'])+");")
        assert resumed['appended']==40 and resumed['state']=='QUEUED',resumed
        chunks=oracle(s,"return (await window.__j02.inspect()).chunks.filter(c=>c.key.startsWith('s04-batch-chunk:'+"+json.dumps(saved['batchId'])+"+':')).sort((a,b)=>a.offset-b.offset).flatMap(c=>c.slugs);")
        assert chunks==partial.split('\n'),chunks
        assert len(oracle(s)['ledger']['effects'])==4,'intake recovery must never itself dispatch providers'
        capture(s,'resumed-same-batch',evidence);close(s)
        # Repair the exact missing account from the preview without losing
        # the entered name; update the frozen plan after real inventory commit.
        click(s,'[data-action=create]');fill(s,'[aria-label="Generator names"]','j02-inventory-context')
        click_text(s,'Preview assignments');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('1 need attention')",'J02_CONTEXTUAL_INVENTORY_HOLD')
        click_text(s,'Complete inventory · New account')
        wait(s,"!!sh.querySelector('.account-dialog')",'J02_CONTEXTUAL_ACCOUNT_OPEN')
        a.command(s,'SYNC_ACCOUNT')
        wait(s,"sh.querySelector('.account-feedback')?.textContent.includes('inventory synchronized')",'J02_CONTEXTUAL_REAL_INVENTORY_COMMIT')
        a.close_dialog(s)
        assert b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[aria-label=\"Generator names\"]').value")=='j02-inventory-context'
        click_text(s,'Update preview');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('1 new')",'J02_CONTEXTUAL_PLAN_RECOVERY')
        capture(s,'contextual-inventory-recovery',evidence);close(s)
        # Explicit cancellation applies only to unfinished intake and cannot
        # report active work or provider success for the canceled manifest.
        click(s,'[data-action=create]')
        canceled_names='\n'.join('j02-cancel-input-'+str(i) for i in range(33))
        b.execute(s,"const e=document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[aria-label=\"Generator names\"]');e.value="+json.dumps(canceled_names)+";e.dispatchEvent(new Event('input',{bubbles:true}));")
        click_text(s,'Preview assignments');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('33 new')",'J02_CANCELABLE_PREVIEW')
        oracle(s,'await window.__j02.interruptInput();return true;')
        click_text(s,'Submit batch');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Submission was interrupted')",'J02_CANCELABLE_INPUT')
        click_text(s,'Cancel unfinished input')
        wait(s,"[...sh.querySelectorAll('[role=dialog] button')].some(b=>b.textContent==='Preview assignments'&&!b.disabled)",'J02_CANCEL_RETURNS_CREATOR')
        canceled=oracle(s,"return (await window.__j02.inspect()).batches.find(b=>b.total===33);")
        assert canceled['state']=='CANCELLED' and canceled['appended']==32,canceled
        click_text(s,'Batch history');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Unsubmitted input canceled')",'J02_CANCELED_HISTORY')
        click_text(s,'View progress','[aria-label="Creation batches"] .batch-item')
        wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('unsubmitted input canceled')",'J02_CANCELED_PROGRESS')
        assert not b.execute(s,"return [...document.getElementById('pcms-faithful-host').shadowRoot.querySelectorAll('[role=dialog] button')].some(b=>b.textContent==='Retry check')")
        assert len(oracle(s)['ledger']['effects'])==4
        capture(s,'canceled-input',evidence);close(s)
        # Narrow geometry and keyboard leave all actions reachable.
        b.call('POST',f'/session/{s}/window/rect',{'width':760,'height':780});click(s,'[data-action=create]')
        capture(s,'narrow-keyboard',evidence);assert not evidence['narrow-keyboard']['overflow'],evidence['narrow-keyboard']
        b.call('POST',f'/session/{s}/actions',{'actions':[{'type':'key','id':'j02keys','actions':[{'type':'keyDown','value':'\ue004'},{'type':'keyUp','value':'\ue004'}]}]})
        assert b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.activeElement?.tagName")=='SELECT'
        b.call('POST',f'/session/{s}/actions',{'actions':[{'type':'key','id':'j02keys','actions':[{'type':'keyDown','value':'\ue00c'},{'type':'keyUp','value':'\ue00c'}]}]})
        wait(s,"!sh.querySelector('[role=dialog]')",'J02_ESCAPE_CLOSE')
        assert b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.activeElement?.dataset.action")=='create'
        print('B J02_PRIMARY_1200_FILTERS_SELECTION_COLD_RESTART_1001_PREVIEW_BATCH_ISOLATION_RECOVERY=PASS',flush=True)
    finally:
        if s:b.close(s)
        pathlib.Path('build/j02-ui-evidence.json').write_text(json.dumps(evidence,indent=2))

if __name__=='__main__':
    browser=pathlib.Path(os.environ['FIREFOX_BINARY']);driver=pathlib.Path(os.environ['GECKODRIVER_BINARY']);archive=pathlib.Path(sys.argv[1]).resolve()
    with tempfile.TemporaryDirectory(prefix='pcms-j02-firefox-') as folder:
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
