#!/usr/bin/env python3
"""J05 actual primary interactions in an installed disposable Firefox profile.
External route/feed facts are offline; no live provider or private Git claims.
"""
import base64,json,pathlib,time
import journey_generators_ui as g
b=g.b;a=g.a
click=g.click;button=g.click_text;fill=g.fill
def wait(s,expression,label,seconds=45):
    try:return g.wait(s,expression,label,seconds)
    except Exception:
        detail=b.execute(s,"const sh=document.getElementById('pcms-faithful-host')?.shadowRoot;return {page:sh?.querySelector('#page')?.innerText,dialog:sh?.querySelector('[role=dialog]')?.innerText,fixture:!!window.__j05}")
        state=oracle(s);detail['runtime']={'revision':state.get('state',{}).get('revision'),'commands':state.get('commands',[])[-15:]}
        pathlib.Path('build/j05-ui-failure.json').write_text(json.dumps(detail,indent=2));print('J05_FAILURE_CONTEXT='+json.dumps(detail),flush=True)
        raise
def oracle(s,body='return await window.__j05.inspect()'):return g.oracle(s,body)
def fixture(s):
    source=pathlib.Path(__file__).with_name('fixtures').joinpath('j05-ui.mjs').read_text().replace('export async function','async function')
    out=oracle(s,source+';return await installRefresherFixture();');assert out.get('ok'),out
    click(s,'[data-nav=generators]');click(s,'[data-nav=refresher]')
    wait(s,"sh.querySelector('.ref-pagination')?.textContent.includes('1200')",'J05_REAL_1200_SCHEDULE_ROWS')
def capture(s,name,evidence):
    time.sleep(.2);pathlib.Path('build/j05-'+name+'.png').write_bytes(base64.b64decode(b.call('GET',f'/session/{s}/screenshot')))
    evidence[name]=b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;return {page:sh.querySelector('#page')?.innerText,dialog:sh.querySelector('[role=dialog]')?.innerText,width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth}")
def confirm(s,label):button(s,label);a.alert_accept(s)
def run(browser,archive,folder):
    profile=pathlib.Path(folder)/'j05-primary-refresher';profile.mkdir();(profile/'user.js').write_text('user_pref("xpinstall.signatures.required",false);\nuser_pref("network.dns.forceResolve","127.0.0.1");\n')
    s=b.open_session(browser,profile)
    try:assert b.call('POST',f'/session/{s}/moz/addon/install',{'path':str(archive),'temporary':False},timeout=45)==b.ID
    finally:b.close(s)
    s=b.open_session(browser,profile);evidence={'scope':'Installed real UI/IDB/typed boundaries; offline feed/route facts, no live provider/Git.'}
    try:
        uuid=b.addons_uuid(profile);url=f'moz-extension://{uuid}/pcms/index.html#refresher'
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);fixture(s)
        wait(s,"sh.querySelector('#refresher-coverage')?.textContent==='25 / 100 · 25.0%'",'J05_ACTUAL_DENOMINATOR_SHARE')
        wait(s,"sh.querySelector('#refresher-account')?.options.length===56",'J05_ALL_55_ACCOUNTS_INCLUDING_EMPTY')
        assert b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('.ref-table-scroll').textContent.includes('Source saved')")
        capture(s,'coverage-capacity-placement',evidence)
        click(s,'[data-action=ref-next]');wait(s,"sh.querySelector('.ref-pagination').textContent.includes('26–50')",'J05_FLEET_PAGING')
        fill(s,'#refresher-search','j05-generator-1199');wait(s,"sh.querySelector('.ref-pagination').textContent.includes('1–1 of 1')",'J05_FIND_BEYOND_1000')
        fill(s,'#refresher-search','')
        g.change(s,'#refresher-account','account-j05-54');wait(s,"sh.querySelector('#refresher-account-state')?.textContent.includes('No observed inventory')",'J05_EMPTY_ACCOUNT')
        confirm(s,'Pause account');wait(s,"sh.querySelector('#refresher-account-pause')?.textContent==='Resume account'",'J05_PAUSE_FUTURE_ACCOUNT')
        assert (oracle(s)['state']['accounts']['account-j05-54']['paused']) is True
        g.change(s,'#refresher-account','account-j05-53');wait(s,"sh.querySelector('#refresher-account-state')?.textContent.includes('grace remaining')",'J05_SCOPED_ROUTE_OUTAGE_GRACE')
        g.change(s,'#refresher-account','');confirm(s,'Pause Refresher')
        wait(s,"sh.querySelector('[data-action=pause-refresher]')?.textContent==='Resume Refresher'",'J05_GLOBAL_PAUSE')
        confirm(s,'Resume Refresher')
        click(s,'[data-toggle=refresher]');a.alert_accept(s)
        wait(s,"sh.querySelector('[data-toggle=refresher]')?.checked===true",'J05_ONE_ENABLE_PERSISTED')
        # Timing defaults preserve exact current budgets, and a later setting
        # uses a fresh revision rather than the background's changing clock revision.
        before=oracle(s)['state'];button(s,'Edit timing')
        fill(s,'[aria-label="Active period (minutes)"]','30');fill(s,'[aria-label="Rest period (minutes)"]','60')
        confirm(s,'Save default timing');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Saved and verified.')",'J05_DEFAULT_TIMING')
        after=oracle(s)['state'];assert after['rows'][0]['activeRemaining']==before['rows'][0]['activeRemaining'];assert after['rows'][1]['sleepRemaining']==before['rows'][1]['sleepRemaining']
        g.close(s);fill(s,'#refresher-search','j05-generator-0000');wait(s,"sh.querySelectorAll('tr[data-item-index]').length===1",'J05_GENERATOR_TIMING')
        click(s,'tr[data-item-index]');wait(s,"!!sh.querySelector('[role=dialog] input')",'J05_GENERATOR_DRAWER')
        confirm(s,'Pause this generator');wait(s,"[...sh.querySelectorAll('[role=dialog] button')].some(x=>x.textContent==='Resume this generator')",'J05_GENERATOR_PAUSE_READBACK')
        confirm(s,'Resume this generator')
        fill(s,'[aria-label="Active period (minutes)"]','0');button(s,'Save generator timing')
        wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Use 1 to 525,600')",'J05_INVALID_INPUT_PRESERVED')
        fill(s,'[aria-label="Active period (minutes)"]','90');fill(s,'[aria-label="Rest period (minutes)"]','180')
        oracle(s,'return window.__j05.loseAck()');confirm(s,'Save generator timing')
        wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Custom timing')&&sh.querySelector('[role=dialog]')?.textContent.includes('Saved and verified.')",'J05_LOST_ACK_RECONCILED')
        state=oracle(s);assert len([c for c in state['commands'] if c['type']=='SET_GENERATOR_POLICY'])==1
        confirm(s,'Use default timing');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Using default timing')",'J05_RESET_INHERITANCE')
        capture(s,'timing-pause-recovery',evidence);g.close(s)
        button(s,'Edit timing');fill(s,'[aria-label="Active period (minutes)"]','45');oracle(s,'return await window.__j05.touch()')
        confirm(s,'Save default timing');wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Your input is preserved')",'J05_CONCURRENT_POLICY_PRESERVES_INPUT')
        assert b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[aria-label=\"Active period (minutes)\"]').value")=='45';g.close(s)
        click(s,'#refresher-edit-capacity');click(s,'[aria-label="Use automatic capacity"]');fill(s,'[aria-label="Manual active generator limit"]','150');button(s,'Save capacity')
        wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('bounded below your requested 150')",'J05_OBSERVED_BOUND_CAPACITY')
        assert oracle(s)['state']['policy']['manualCap']==150;capture(s,'bounded-capacity',evidence);g.close(s)
        oracle(s,'return await window.__j05.staleFeed()');click(s,'[data-nav=generators]');click(s,'[data-nav=refresher]')
        wait(s,"sh.querySelector('#refresher-coverage-age')?.textContent.startsWith('Historical')",'J05_UNKNOWN_FEED_IS_NOT_GREEN')
        # Unrelated outage and absent Git did not block any local operation.
        click(s,'[data-action=feed-check]');wait(s,"sh.querySelector('[data-action=feed-check]')?.disabled===false",'J05_OBSERVATION_FAILURE_RECOVERY',90)
        capture(s,'stale-feed-isolation',evidence)
        old=b.owned_firefox_pids(profile);assert old;b.close(s);b.require_owned_exit(profile,old);s=None
        s=b.open_session(browser,profile);new=b.owned_firefox_pids(profile);assert new and not old.intersection(new)
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);fixture(s)
        persisted=oracle(s)['state'];assert persisted['policy']['refreshEnabled'] and persisted['policy']['manualCap']==150 and persisted['accounts']['account-j05-54']['paused'];assert persisted['rows'][0]['timingOverride'] is False
        # Keyboard close restores focus to the actual timing button.
        button(s,'Edit timing');b.call('POST',f'/session/{s}/actions',{'actions':[{'type':'key','id':'keyboard','actions':[{'type':'keyDown','value':'\ue00c'},{'type':'keyUp','value':'\ue00c'}]}]})
        wait(s,"!sh.querySelector('[role=dialog]')&&sh.activeElement?.textContent.includes('Edit timing')",'J05_KEYBOARD_CLOSE_FOCUS')
        b.call('POST',f'/session/{s}/window/rect',{'width':760,'height':850});capture(s,'responsive-restart',evidence)
        assert not evidence['responsive-restart']['overflow']
        pathlib.Path('build/j05-primary-ui.json').write_text(json.dumps(evidence,indent=2));print('B J05_PRIMARY_REF_ENABLE_PAUSE_DEFAULT_CUSTOM_RESET_COVERAGE_CAPACITY_RECOVERY_RESTART=PASS',flush=True)
    finally:
        if s:b.close(s)
