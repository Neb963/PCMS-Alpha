#!/usr/bin/env python3
"""J05 command-free real background clock / owned-process restart evidence."""
import json,pathlib,time
import journey_development_pipeline as p
b=p.b;g=p.g
def open_clock_session(browser,profile):
    # Other suites deliberately force idle death at 1.5s. This production
    # cadence proof uses Firefox's actual default from the first install.
    data=b.call('POST','/session',{'capabilities':{'alwaysMatch':{'browserName':'firefox','moz:firefoxOptions':{'binary':str(browser),'args':['-headless','-no-remote','-profile',str(profile)],'prefs':{'xpinstall.signatures.required':False,'extensions.autoDisableScopes':0}}}}},timeout=60)
    return data['sessionId'] if 'sessionId' in data else data['value']['sessionId']
def idle_settings(s):
    b.call('POST',f'/session/{s}/moz/context',{'context':'chrome'})
    try:
        return b.execute(s,"const prefs=Components.classes['@mozilla.org/preferences-service;1'].getService(Components.interfaces.nsIPrefService),branch=prefs.getBranch(''),key='extensions.background.idle.timeout';const read=b=>{try{return b.getIntPref(key)}catch{return null}};return {effectiveMs:read(branch),defaultMs:read(prefs.getDefaultBranch('')),userOverride:branch.prefHasUserValue(key),source:branch.getPrefType(key)===0?'FIREFOX_INTERNAL_DEFAULT_NO_PREF':'FIREFOX_PREF'}")
    finally:b.call('POST',f'/session/{s}/moz/context',{'context':'content'})
def raw(s,name):
    return p.background(s,"""const db=await new Promise((resolve,reject)=>{const q=indexedDB.open(NAME);q.onsuccess=()=>resolve(q.result);q.onerror=reject});const state=await new Promise((resolve,reject)=>{const q=db.transaction('meta').objectStore('meta').get('refresher:shadow:v1');q.onsuccess=()=>resolve(q.result?.state);q.onerror=reject});db.close();return {state,alive:!!window.__j05clock,boot:window.__j05clock?.boot};""".replace('NAME',json.dumps(name)))
def run(browser,archive,folder):
    evidence={'scope':{'clock':'Actual Date.now/performance; production 20s work timer, 1m cold alarm. No acceleration.','transport':'Only per-message test keepalive; released before 72s with no WebDriver, port or background calls.','provider':'Offline protected route + complete feed facts; no provider/source effects.','process':'Owned disposable profile, nonempty disjoint PIDs on restart.'}}
    for enabled in [False,True]:
        profile=pathlib.Path(folder)/('j05-clock-on' if enabled else 'j05-clock-off');profile.mkdir()
        (profile/'user.js').write_text('user_pref("xpinstall.signatures.required",false);\nuser_pref("network.dns.forceResolve","127.0.0.1");\n')
        s=open_clock_session(browser,profile)
        try:assert b.call('POST',f'/session/{s}/moz/addon/install',{'path':str(archive),'temporary':False},timeout=45)==b.ID
        finally:b.close(s)
        s=open_clock_session(browser,profile)
        try:
            idle=idle_settings(s);assert idle['effectiveMs']==idle['defaultMs'] and not idle['userOverride'],('J05_IDLE_NOT_ACTUAL_FIREFOX_DEFAULT',idle)
            print('B J05_ACTUAL_FIREFOX_IDLE='+json.dumps(idle),flush=True)
            uuid=b.addons_uuid(profile);b.call('POST',f'/session/{s}/url',{'url':f'moz-extension://{uuid}/pcms/index.html#refresher'});b.wait_donor_ready(s)
            # Close the dashboard before installing the background fixture.
            # The following 72 seconds contains no driver commands at all.
            b.call('POST',f'/session/{s}/url',{'url':'about:blank'})
            source=pathlib.Path(__file__).with_name('fixtures').joinpath('j05-clock.mjs').read_text().replace('export async function','async function')
            first=p.background(s,source+';return await installRefresherClockFixture('+str(enabled).lower()+');')
            assert first.get('ok'),first
            start=time.monotonic();print('B J05_COMMAND_FREE_CLOCK_GAP_BEGIN enabled='+str(enabled),flush=True)
            time.sleep(36);print('B J05_COMMAND_FREE_CLOCK_GAP_CONTINUES enabled='+str(enabled),flush=True);time.sleep(36)
            elapsed=(time.monotonic()-start)*1000;second=raw(s,first['dbName'])
            state=second['state'];credit=first['state']['rows'][0]['activeRemaining']-state['rows'][0]['activeRemaining']
            if enabled:
                assert second['alive'] and second['boot']==first['state']['bootId'],('J05_PULSE_LOST_BACKGROUND',second)
                assert 15000<=credit<=elapsed+1500,('J05_DEFAULT_PULSE_NO_REAL_ACTIVE_CREDIT',credit,elapsed)
                assert state['diagnostics']['turns']>=first['state']['diagnostics']['turns']+3
            else:
                assert credit==0,('J05_DISABLED_PULSE_FABRICATED_IDLE_CREDIT',credit)
                assert not second['alive'],'J05_NEGATIVE_CONTROL_DID_NOT_ACTUALLY_SUSPEND'
            assert state['rows'][2]['sleepRemaining']==3600000,'J05_PAUSED_REST_ADVANCED'
            evidence['on' if enabled else 'off']={'idle':idle,'elapsedMs':elapsed,'creditedMs':credit,'before':first['state'],'after':state,'fixtureSurvived':second['alive']}
            if enabled:
                # Freeze the active timer before recording the exact durable
                # pre-exit anchor; production Pause goes through its real store.
                paused=p.background(s,"await window.__j05clock.controller.tick();const x=await window.__j05clock.store.read();const r=await window.__j05clock.store.pause(x.state.revision,'GENERATOR',x.state.rows[0].stableId,true,Date.now());return {ok:r.ok,state:(await window.__j05clock.store.read()).state};")
                assert paused['ok'];old=b.owned_firefox_pids(profile);assert old;b.close(s);b.require_owned_exit(profile,old);s=None
                closed_start=time.monotonic();time.sleep(3);s=open_clock_session(browser,profile);new=b.owned_firefox_pids(profile);assert new and not old.intersection(new)
                b.call('POST',f'/session/{s}/url',{'url':'about:blank'})
                resumed=p.background(s,source+';return await installRefresherClockFixture(true);')
                assert resumed['ok'];post=resumed['state'];pre=paused['state']
                assert post['bootId']!=pre['bootId'],'J05_RESTART_REUSED_EPOCH'
                assert post['rows'][0]['activeRemaining']==pre['rows'][0]['activeRemaining'],'J05_SHUTDOWN_ACTIVE_TIME_FABRICATED'
                closed_elapsed=(time.monotonic()-closed_start)*1000
                rest_elapsed=post['rows'][1]['restCheckpointAt']-pre['rows'][1]['restCheckpointAt']
                rest_used=pre['rows'][1]['sleepRemaining']-post['rows'][1]['sleepRemaining']
                assert rest_elapsed>=3000 and abs(rest_used-rest_elapsed)<=1,('J05_SHUTDOWN_REST_NOT_EXACT_WALL_TIME',rest_used,rest_elapsed,closed_elapsed)
                assert rest_used>=closed_elapsed-1500,('J05_CLOSED_INTERVAL_MISSING_FROM_REST',rest_used,closed_elapsed)
                assert post['rows'][2]['sleepRemaining']==pre['rows'][2]['sleepRemaining'],'J05_RESTART_PAUSED_REST_ADVANCED'
                evidence['restart']={'oldPids':sorted(old),'newPids':sorted(new),'before':pre,'after':post}
            print('B J05_COMMAND_FREE_CLOCK_'+('ON' if enabled else 'OFF')+'=PASS credit='+str(credit),flush=True)
        finally:
            if s:b.close(s)
    pathlib.Path('build/j05-background-clock.json').write_text(json.dumps(evidence,indent=2));print('B J05_REAL_BACKGROUND_IDLE_NEGATIVE_ACTIVE_REST_PAUSE_OS_RESTART=PASS',flush=True)
