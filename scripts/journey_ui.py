#!/usr/bin/env python3
"""J07 actual primary presentation/keyboard/scale proof, disposable Firefox.
Provider facts in the reused J02 canonical fixture are OFFLINE, never L proof.
"""
import base64,json,os,pathlib,subprocess,sys,tempfile,time
from urllib.request import urlopen
import journey_generators_ui as g
b=g.b;a=g.a
def wait(s,expression,label,seconds=35):
    try:return g.wait(s,expression,label,seconds)
    except Exception:
        print('J07_FOCUS_CONTEXT='+json.dumps(b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot,e=sh.activeElement;return {active:e?.outerHTML,inert:sh.querySelector('.app').inert,dialog:!!sh.querySelector('[role=dialog]')}")),flush=True)
        raise
def key(s,value,shift=False,control=False):
    modifier='\ue009' if control else '\ue008'
    actions=([{'type':'keyDown','value':modifier}] if shift or control else [])+[{'type':'keyDown','value':value},{'type':'keyUp','value':value}]+([{'type':'keyUp','value':modifier}] if shift or control else [])
    b.call('POST',f'/session/{s}/actions',{'actions':[{'type':'key','id':'j07-keyboard','actions':actions}]})
def capture(s,name,evidence):
    b.execute(s,"document.getElementById('pcms-faithful-host').shadowRoot.querySelector('#main').scrollTop=0")
    pathlib.Path('build/j07-'+name+'.png').write_bytes(base64.b64decode(b.call('GET',f'/session/{s}/screenshot')))
    evidence[name]=b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;return {width:innerWidth,height:innerHeight,theme:sh.host.dataset.theme,density:sh.host.dataset.density,page:sh.querySelector('#page').innerText,dialogs:[...sh.querySelectorAll('[role=dialog]')].map(x=>x.getAttribute('aria-label')),overflow:document.documentElement.scrollWidth>innerWidth}")
def zoom(s,value):
    b.call('POST',f'/session/{s}/moz/context',{'context':'chrome'})
    try:result=b.execute(s,"const browser=Services.wm.getMostRecentWindow('navigator:browser').gBrowser.selectedBrowser;browser.fullZoom="+str(value)+";return browser.fullZoom")
    finally:b.call('POST',f'/session/{s}/moz/context',{'context':'content'})
    assert result==value,result
def navigate(s,route):
    visible=b.execute(s,"return !!document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[data-nav="+route+"]').getClientRects().length")
    if not visible:g.click(s,'#pcms-menu-toggle')
    g.click(s,'[data-nav='+route+']');wait(s,"sh.querySelector('#page')?.dataset.view==="+json.dumps(route),'J07_ROUTE_'+route)
    if route=='generators':wait(s,"sh.querySelector('tbody')?.getAttribute('aria-busy')==='false'&&!!sh.querySelector('tbody tr[data-item-index]')",'J07_LOADED_GENERATOR_ROUTE')
    if route=='accounts':wait(s,"sh.querySelectorAll('.account-row').length>0",'J07_LOADED_ACCOUNT_ROUTE')
def dialog_geometry(s,label):
    wait(s,"(()=>{const d=sh.querySelector('[role=dialog]');if(!d)return false;const r=d.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1})()",label)
def geometry(s,label):
    value=b.execute(s,"""const sh=document.getElementById('pcms-faithful-host').shadowRoot,p=sh.querySelector('#page'),r=p.getBoundingClientRect(),m=sh.querySelector('#main');return {width:innerWidth,left:r.left,right:r.right,pageOverflow:document.documentElement.scrollWidth>innerWidth,mainScroll:m.scrollHeight>=m.clientHeight,heading:!!sh.querySelector('#page-heading'),menu:sh.querySelector('#pcms-menu-toggle').getClientRects().length>0}""")
    assert value['heading'] and not value['pageOverflow'] and value['left']>=-1 and value['right']<=value['width']+1,(label,value)
    return value
def run(browser,archive,folder):
    profile=pathlib.Path(folder)/'j07-primary-ui';profile.mkdir();(profile/'user.js').write_text('user_pref("xpinstall.signatures.required",false);\n')
    s=b.open_session(browser,profile)
    try:assert b.call('POST',f'/session/{s}/moz/addon/install',{'path':str(archive),'temporary':False},timeout=45)==b.ID
    finally:b.close(s)
    s=b.open_session(browser,profile);evidence={'scope':'Actual packaged primary UI/IDB/preferences/OS process; OFFLINE provider fixture, no live resources.'}
    try:
        uuid=b.addons_uuid(profile);url=f'moz-extension://{uuid}/pcms/index.html#generators'
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);wait(s,"!!sh.querySelector('[data-display-tools]')",'J07_PRIMARY_PRESENTATION')
        g.fixture(s)
        # Adverse readiness cut: real hidden host with existing navigation DOM.
        # A native click must wait for the same observable mount condition as
        # a cold dashboard; no programmatic click or suppressed failure.
        hidden=b.execute(s,"document.body.classList.remove('pcms-faithful-ready');return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[data-nav=generators]')")
        try:
            b.call('POST',f'/session/{s}/element/{hidden[a.ELEMENT]}/click',{})
            raise AssertionError('J07_HIDDEN_HOST_NEGATIVE_CONTROL_DID_NOT_FAIL')
        except RuntimeError as error:assert 'element not interactable' in str(error),str(error)
        finally:b.execute(s,"document.body.classList.add('pcms-faithful-ready')")
        b.execute(s,"document.body.classList.remove('pcms-faithful-ready');window.__j07mountClick=null;const e=document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[data-nav=generators]');e.addEventListener('click',()=>{window.__j07mountClick=document.body.classList.contains('pcms-faithful-ready')&&e.getClientRects().length>0},{once:true});setTimeout(()=>document.body.classList.add('pcms-faithful-ready'),400)")
        g.click(s,'[data-nav=generators]');assert b.execute(s,"return window.__j07mountClick") is True
        wait(s,"sh.querySelector('tbody')?.getAttribute('aria-busy')==='false'&&sh.querySelectorAll('tbody tr[data-item-index]').length===24",'J07_DELAYED_PRIMARY_MOUNT_REAL_CLICK_RECOVERY')
        assert b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('.preview-label').textContent")=='PCMS 1.2.15'
        g.click(s,'[data-filter="generators:PUBLISHED"]');wait(s,"sh.querySelector('.pagination').textContent.includes('600')",'J07_GLOBAL_FILTER')
        g.click(s,'[data-action=generator-filters]');g.change(s,'#generator-source','GIT');wait(s,"sh.querySelector('.pagination').textContent.includes('200')",'J07_GLOBAL_SOURCE_FILTER')
        g.click(s,'[data-generator-select]');g.click_text(s,'Columns');wait(s,"!!sh.querySelector('[aria-label="+'"Generator columns"'+"]')",'J07_COLUMN_CONTROLS')
        g.fill(s,'[aria-label="Account width in pixels"]','20');g.click_text(s,'Save columns');wait(s,"sh.querySelector('[role=dialog]').textContent.includes('between 70 and 500')",'J07_INVALID_WIDTH_RECOVERY')
        g.fill(s,'[aria-label="Account width in pixels"]','180');g.click(s,'[aria-label="Show GitHub source"]');g.click(s,'[aria-label="Move Account up"]');g.click_text(s,'Save columns')
        wait(s,"!sh.querySelector('[role=dialog]')&&sh.querySelector('table th:nth-child(2)').dataset.presentationColumn==='account'&&sh.querySelector('th[data-presentation-column=source]').hidden",'J07_REAL_COLUMN_ORDER_AND_VISIBILITY')
        g.click_text(s,'Saved views');g.click_text(s,'Save current view');wait(s,"sh.querySelector('[role=dialog]').textContent.includes('at least two')",'J07_VIEW_INPUT_RECOVERY')
        g.fill(s,'#pcms-view-name','Published Git sources');g.click_text(s,'Save current view');wait(s,"sh.querySelector('.presentation-view')?.textContent.includes('Published Git sources')",'J07_VIEW_PERSISTED')
        key(s,'\ue00c');wait(s,"!sh.querySelector('[role=dialog]')&&sh.activeElement?.textContent==='Saved views'",'J07_ESCAPE_RESTORES_FOCUS')
        g.change(s,'#generator-source','ALL');g.click(s,'[data-filter="generators:ALL"]');wait(s,"sh.querySelector('.pagination').textContent.includes('1200')",'J07_CLEAR_FILTERS')
        g.click_text(s,'Saved views');g.click_text(s,'Apply','[role=dialog]');wait(s,"!sh.querySelector('[role=dialog]')&&sh.querySelector('.pagination').textContent.includes('200')&&sh.querySelector('#generator-source').value==='GIT'&&sh.querySelectorAll('tbody tr[data-item-index]').length===24",'J07_SAVED_VIEW_ACTUAL_QUERY_AND_LAYOUT')
        assert '1 selected' in b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[data-selection-count]').textContent")
        # Independent real canonical facets, not copied from the workflow label.
        facets=g.oracle(s,"""const {openCanonicalDatabase}=await import('./journal.mjs');const {emptyShadow,REFRESHER_KEY}=await import('./refresher-core.mjs');const db=await openCanonicalDatabase({open:(_name,version)=>indexedDB.open('pcms-j02-ui-fixture',version)});
        const state=emptyShadow();state.lastTurnAt=Date.now();state.provider.state='HEALTHY';state.accounts.account_j02_000={health:'HEALTHY',paused:true};state.rows=[{stableId:'generator_j07_facet',slug:'j02-owned-000-000',accountId:'account_j02_000',phase:'ACTIVE',ordinal:1,activeRemaining:9000,sleepRemaining:0,ownerVerified:true,releaseVerified:true,listing:'PUBLIC'}];
        await new Promise((resolve,reject)=>{const tx=db.transaction('meta','readwrite'),meta=tx.objectStore('meta');
        for(const row of [{key:'release:j02-owned-000-000',release:{slug:'j02-owned-000-000',state:'CONFIRMED_PUBLIC'}},{key:REFRESHER_KEY,state},
        {key:'ai-job:j02-owned-000-001',job:{slug:'j02-owned-000-001',state:'AWAITING_REVIEW'}},
        {key:'attention:j07fixture',scopeId:'j07_attention_fixture',code:'SOURCE_CONFLICT',state:'ACTIVE',revision:1,target:{kind:'GENERATOR',id:'j02-owned-000-002'}}])meta.put(row);
        tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)});db.close();return {ok:true};""");assert facets.get('ok'),facets
        for title,total in [('All','1200'),('Needs Attention','1'),('Awaiting Review','1'),('Managed','1199')]:
            g.click_text(s,'Saved views');g.click(s,'[data-builtin-view='+json.dumps(title)+']');wait(s,"!sh.querySelector('[role=dialog]')&&sh.querySelector('.pagination').textContent.includes("+json.dumps('of '+total+' generators')+")",'J07_BUILTIN_'+title.replace(' ','_'))
        g.click_text(s,'Saved views');g.click_text(s,'Apply','[role=dialog]');wait(s,"!sh.querySelector('[role=dialog]')&&sh.querySelector('.pagination').textContent.includes('200')",'J07_CUSTOM_VIEW_AFTER_BUILTINS')
        g.click(s,'tbody tr[data-item-index="0"] .name-cell');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('confirmed public')&&sh.querySelector('[role=dialog]')?.textContent.includes('active · account pause')&&sh.querySelector('[role=dialog]')?.textContent.includes('historical')",'J07_INDEPENDENT_CANONICAL_FACETS_IN_DETAILS')
        key(s,'\ue00c');wait(s,"!sh.querySelector('[role=dialog]')",'J07_FACET_DETAILS_CLOSE')
        b.execute(s,"document.getElementById('pcms-faithful-host').shadowRoot.querySelector('tbody tr').focus()")
        key(s,'\ue010') # End: real key event must scroll the focused last row into its labeled region.
        focused=b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot,e=sh.activeElement,r=e.getBoundingClientRect(),box=e.closest('.table-scroll').getBoundingClientRect();return {index:e.dataset.itemIndex,visible:r.top>=box.top-1&&r.bottom<=box.bottom+1,scroll:e.closest('.table-scroll').scrollTop}")
        assert focused['index']=='23' and focused['visible'] and focused['scroll']>0,focused
        key(s,'\ue007');wait(s,"!!sh.querySelector('[aria-label="+'"Generator details"'+"]')",'J07_KEYBOARD_REAL_DETAILS')
        b.execute(s,"document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[role=separator]').focus()")
        key(s,'\ue012') # ArrowLeft expands the right-hand details panel.
        wait(s,"sh.querySelector('[role=separator]')?.getAttribute('aria-valuenow')==='545'",'J07_KEYBOARD_PANEL_RESIZE')
        # Native Tab/Shift+Tab stay within the actual dialog.
        b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;sh.querySelector('[role=dialog] button').focus()")
        key(s,'\ue004',True)
        assert b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;return sh.querySelector('[role=dialog]').contains(sh.activeElement)")
        key(s,'\ue00c');wait(s,"!sh.querySelector('[role=dialog]')",'J07_DETAILS_ESCAPE_CLEANUP')
        navigate(s,'settings');g.click(s,'[data-settings=appearance]');g.change(s,'#pcms-appearance-theme','dark');g.change(s,'#pcms-appearance-density','comfortable');g.click_text(s,'Save appearance')
        wait(s,"sh.host.dataset.theme==='dark'&&sh.host.dataset.density==='comfortable'",'J07_REAL_APPEARANCE')
        # Real background admission, not a mocked successful preference reply.
        assert g.oracle(s,"await browser.storage.local.set({pcmsRestoreInProgress:{active:true,status:'PREPARING'}});return {ok:true}").get('ok')
        g.change(s,'#pcms-appearance-theme','light');g.click_text(s,'Save appearance');wait(s,"sh.querySelector('.appearance-card').textContent.includes('could not be saved')&&sh.host.dataset.theme==='dark'",'J07_RESTORE_HOLDS_ACTUAL_PRESENTATION_SAVE')
        assert g.oracle(s,"const v=await browser.storage.local.get('pcmsUiWorkspaceV1');return {ok:v.pcmsUiWorkspaceV1.theme==='dark'}").get('ok')
        assert g.oracle(s,"await browser.storage.local.remove('pcmsRestoreInProgress');return {ok:true}").get('ok')
        g.click_text(s,'Save appearance');wait(s,"sh.host.dataset.theme==='light'",'J07_RESTORE_HOLD_INPUT_RETRY_RECOVERY')
        g.change(s,'#pcms-appearance-theme','dark');g.click_text(s,'Save appearance');wait(s,"sh.host.dataset.theme==='dark'",'J07_FINAL_DARK_APPEARANCE')
        capture(s,'dark-appearance',evidence)
        before=b.owned_firefox_pids(profile);b.close(s);b.require_owned_exit(profile,before);s=None
        s=b.open_session(browser,profile);assert not before.intersection(b.owned_firefox_pids(profile));b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s)
        source=pathlib.Path(__file__).with_name('fixtures').joinpath('j02-ui.mjs').read_text().replace('export async function installGeneratorFixture','async function installGeneratorFixture')
        installed=g.oracle(s,source+';return await installGeneratorFixture();');assert installed.get('ok'),installed
        navigate(s,'generators')
        wait(s,"sh.host.dataset.theme==='dark'&&sh.host.dataset.density==='comfortable'&&sh.querySelector('.pagination').textContent.includes('200')&&sh.querySelector('th[data-presentation-column=source]').hidden",'J07_FILTER_LAYOUT_THEME_DENSITY_COLD_RESTART')
        capture(s,'persisted-workspace',evidence)
        # Actual browser full-page zoom, not a CSS transform or fake viewport.
        b.call('POST',f'/session/{s}/window/rect',{'width':640,'height':1000});zoom(s,2)
        wait(s,"innerWidth>=300&&innerWidth<=330",'J07_ACTUAL_200_PERCENT_320_CSS_VIEWPORT')
        evidence['responsive']={}
        g.click(s,'#pcms-menu-toggle');wait(s,"sh.host.hasAttribute('data-menu-open')",'J07_NARROW_MENU_OPEN');key(s,'\ue00c');wait(s,"!sh.host.hasAttribute('data-menu-open')&&sh.activeElement?.id==='pcms-menu-toggle'",'J07_NATIVE_ESCAPE_MENU_RECOVERY')
        for route in ['overview','generators','work-queue','accounts','refresher','settings']:
            navigate(s,route);evidence['responsive'][route]=geometry(s,route)
            if route=='generators':
                g.click_text(s,'Columns');wait(s,"!!sh.querySelector('[aria-label="+'"Generator columns"'+"]')",'J07_NARROW_COLUMNS')
                wait(s,"(()=>{const r=sh.querySelector('[role=dialog]').getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&r.top>=0&&r.bottom<=innerHeight+1})()",'J07_NARROW_COLUMNS_SETTLED_INSIDE_VIEWPORT')
                dialog=b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot,r=sh.querySelector('[role=dialog]').getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight}")
                assert dialog['left']>=0 and dialog['right']<=dialog['width']+1 and dialog['top']>=0 and dialog['bottom']<=dialog['height']+1,dialog
                key(s,'\ue00c');wait(s,"!sh.querySelector('[role=dialog]')",'J07_NARROW_DIALOG_FOCUS_RECOVERY')
                g.click(s,'[data-action=git-sources]');dialog_geometry(s,'J07_NARROW_GIT_SOURCE_DIALOG');key(s,'\ue00c');wait(s,"!sh.querySelector('[role=dialog]')",'J07_NARROW_GIT_CLOSE')
            if route=='accounts':
                g.click_text(s,'Manage');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Open Perchance')",'J07_NARROW_REAL_ACCOUNT_ACTIONS');dialog_geometry(s,'J07_NARROW_ACCOUNT_DIALOG')
                key(s,'k',control=True);wait(s,"sh.querySelectorAll('[role=dialog]').length===1&&sh.querySelector('[role=dialog]').getAttribute('aria-label')==='Account management'&&sh.querySelector('#pcms-live-toast').textContent.includes('Close the current dialog')",'J07_NATIVE_SEARCH_SHORTCUT_RESPECTS_ACTIVE_MODAL')
                key(s,'\ue00c');wait(s,"!sh.querySelector('[role=dialog]')",'J07_NARROW_ACCOUNT_CLOSE')
                key(s,'k',control=True);wait(s,"sh.querySelector('[role=dialog]')?.getAttribute('aria-label')==='Search PCMS records'",'J07_NATIVE_GLOBAL_SEARCH_AFTER_MODAL');dialog_geometry(s,'J07_NARROW_SEARCH_DIALOG');key(s,'\ue00c');wait(s,"!sh.querySelector('[role=dialog]')",'J07_NARROW_SEARCH_CLOSE')
            if route=='refresher':
                wait(s,"sh.querySelector('#refresher-capacity')?.textContent!=='Not observed'",'J07_REF_POLICY_LOADED');g.click(s,'[data-action=edit-timing]');dialog_geometry(s,'J07_NARROW_TIMING_DIALOG');key(s,'\ue00c');wait(s,"!sh.querySelector('[role=dialog]')",'J07_NARROW_TIMING_CLOSE')
            if route=='settings':
                for category in ['connections','automation','ai','backups','diagnostics','appearance','advanced']:
                    g.click(s,'[data-settings='+category+']');geometry(s,category)
            capture(s,'320-'+route,evidence)
        g.click(s,'[data-settings=appearance]');g.change(s,'#pcms-appearance-theme','light');g.click_text(s,'Save appearance');wait(s,"sh.host.dataset.theme==='light'",'J07_THEME_RECOVERY_AT_ZOOM')
        zoom(s,1);b.call('POST',f'/session/{s}/window/rect',{'width':1366,'height':900})
        navigate(s,'generators');g.click_text(s,'Saved views');g.click_text(s,'Remove','[role=dialog]');wait(s,"!sh.querySelector('.presentation-view')",'J07_REMOVE_SAVED_VIEW_ACTUAL_STORAGE')
        key(s,'\ue00c');capture(s,'final-wide',evidence)
        pathlib.Path('build/j07-primary-ui.json').write_text(json.dumps(evidence,indent=2))
        print('B J07_PRIMARY_VIEWS_COLUMNS_APPEARANCE_KEYBOARD_1200_RESTART_320_CSS_200_PERCENT=PASS',flush=True)
    finally:
        if s:b.close(s)
def main():
    browser=pathlib.Path(os.environ['FIREFOX_BINARY']);driver=pathlib.Path(os.environ['GECKODRIVER_BINARY'])
    daemon=subprocess.Popen([str(driver),'--port',str(b.PORT),'--allow-system-access'],stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
    try:
        for _ in range(80):
            try:
                with urlopen(b.HOST+'/status',timeout=1) as response:
                    if json.load(response).get('value',{}).get('ready'):break
            except Exception:time.sleep(.2)
        else:raise AssertionError('J07_DRIVER_NOT_READY')
        with tempfile.TemporaryDirectory(prefix='pcms-j07-ui-') as folder:run(browser,pathlib.Path(sys.argv[1]).resolve(),folder)
    finally:daemon.terminate();daemon.wait(timeout=15)
if __name__=='__main__':main()
