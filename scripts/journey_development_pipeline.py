#!/usr/bin/env python3
"""J04 actual persistent Firefox background/primary journey; offline effects only."""
import base64,json,os,pathlib,subprocess,sys,tempfile,time
from urllib.request import urlopen
import journey_development_ui as ui
b=ui.b;g=ui.g;a=g.a

def background(s,body):
    b.call('POST',f'/session/{s}/moz/context',{'context':'chrome'})
    try:
        source="""(async()=>{try{const sandbox=Cu.Sandbox(content,{sandboxPrototype:content,wantXrays:false});const value=await Cu.evalInSandbox(CODE,sandbox,'latest',content.location.href,1);sendAsyncMessage('pcms-j04-background-result',{ok:true,value:JSON.parse(JSON.stringify(value))});}catch(e){sendAsyncMessage('pcms-j04-background-result',{ok:false,error:String(e),stack:String(e.stack)})}})();""".replace('CODE',json.dumps('(async()=>{'+body+'})()'))
        script="""const done=arguments[arguments.length-1];(async()=>{const {ExtensionParent}=ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');const extension=ExtensionParent.GlobalManager.extensionMap.get('persona-route-manager@local');await extension.wakeupBackground('pcms-j04-offline-test-controller');const mm=extension._backgroundPageFrameLoader.messageManager;const topic='pcms-j04-background-result';const listener=msg=>{mm.removeMessageListener(topic,listener);done(msg.data)};mm.addMessageListener(topic,listener);mm.loadFrameScript('data:application/javascript,'+encodeURIComponent(SOURCE),false);})().catch(e=>done({ok:false,error:String(e)}));""".replace('SOURCE',json.dumps(source))
        out=b.call('POST',f'/session/{s}/execute/async',{'script':script,'args':[]},timeout=120)
        assert out.get('ok'),out
        return out.get('value')
    finally:b.call('POST',f'/session/{s}/moz/context',{'context':'content'})

def install(s):
    directory=pathlib.Path(__file__).with_name('fixtures')
    source='\n'.join(directory.joinpath(n).read_text().replace('export async function','async function') for n in ['j03-git-model.mjs','j04-pipeline.mjs'])
    oracle=pathlib.Path('src/runtime/perchance-ai-oracle.mjs').read_text();oracle=oracle[oracle.index('export function perchanceAiPreviewCheck'):].replace('export function','function')
    preview="""async function j04ActualPreview(slug,name,html){
      const realDocument=window.document,frame=realDocument.createElement('iframe');frame.style.cssText='width:900px;height:600px;position:absolute;left:0;top:0';
      const settled=new Promise(resolve=>frame.addEventListener('load',resolve,{once:true}));frame.srcdoc=html;realDocument.body.append(frame);await settled;
      const location={origin:'https://perchance.org',pathname:'/'+slug,hash:'#edit'},document={getElementById:id=>id==='outputIframeEl'?frame:null};
      ORACLE
      try{return perchanceAiPreviewCheck(slug,name)}finally{frame.remove()}
    }""".replace('ORACLE',oracle)
    return background(s,preview+source+';return await installDevelopmentPipelineFixture();')

def inspect(s):
    value=background(s,'return window.__j04flow?await window.__j04flow.inspect():null;')
    if value is None:
        assert install(s).get('ok');print('B J04_OFFLINE_DEPENDENCIES_REOPENED_AFTER_ACTUAL_BACKGROUND_SUSPEND',flush=True)
        value=background(s,'return await window.__j04flow.inspect();')
    return value
def alarm(s):return background(s,'return await window.__j04flow.alarm();')
def attach(s):
    return g.oracle(s,"""const bg=await browser.runtime.getBackgroundPage();if(!bg.__j04flow)return {ok:false};const ports=new Set(['pcms-i10-ai','pcms-i13-release','pcms-j04-clean-publication','pcms-s03-catalog','pcms-i02-canonical-readonly','pcms-s05-ready-operator']);const original=browser.runtime.connect.bind(browser.runtime),sender={id:browser.runtime.id,url:browser.runtime.getURL('pcms/index.html')};browser.runtime.connect=function(...args){const name=args.at(-1)?.name;if(!ports.has(name))return original(...args);const messages=new Set(),disconnected=new Set();let closed=false;return {onMessage:{addListener:f=>messages.add(f)},onDisconnect:{addListener:f=>disconnected.add(f)},disconnect(){closed=true},postMessage(msg){Promise.resolve(bg.__j04flow.command(name,msg,sender)).then(out=>{if(!closed)for(const f of messages)f(out)}).catch(()=>{if(!closed)for(const f of disconnected)f()})}}};return {ok:true};""")

def progress(s,predicate,label,steps=160):
    for _ in range(steps):
        before=inspect(s)
        if predicate(before):print('B '+label,flush=True);return before
        count=before['completedWakes'];alarm(s)
        deadline=time.time()+12
        while time.time()<deadline:
            time.sleep(.12);out=inspect(s)
            if out['completedWakes']>count:break
    detail=inspect(s);pathlib.Path('build/j04-pipeline-failure.json').write_text(json.dumps(detail,indent=2));raise AssertionError((label,detail['events'][-15:]))

def run(browser,archive,folder):
    profile=pathlib.Path(folder)/'j04-autonomous-background';profile.mkdir();(profile/'user.js').write_text('user_pref("xpinstall.signatures.required",false);\nuser_pref("network.dns.forceResolve","127.0.0.1");\n')
    s=b.open_session(browser,profile)
    try:assert b.call('POST',f'/session/{s}/moz/addon/install',{'path':str(archive),'temporary':False},timeout=45)==b.ID
    finally:b.close(s)
    s=b.open_session(browser,profile);evidence={'scope':{'externalServices':'OFFLINE Git/provider/native models','effectAuthority':'fixture effect gates true; production standing gates remain separately tested','clock':'actual Date.now; no acceleration','alarmCadence':'100ms test wake of real browser alarm; production periodic READY alarm is one minute','process':'owned disposable persistent profile; nonempty disjoint old/new Firefox PID sets','livePrivateGitOrProvider':'NOT_TESTED'}}
    try:
        url=f'moz-extension://{b.addons_uuid(profile)}/pcms/index.html#work-queue';b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s)
        assert install(s).get('ok');assert attach(s).get('ok')
        # Remove the actual dashboard entirely. Real browser alarms now drive
        # production background controllers, independent of a page-side tick.
        b.call('POST',f'/session/{s}/url',{'url':'about:blank'})
        state=progress(s,lambda x:len([w for w in x['writebacks'] if w['state']=='CONFIRMED'])==4,'J04_DASHBOARD_CLOSED_READY_STAGE_DOM_FAIL_REPAIR_PASS_GIT_CONFIRMED')
        assert any(x.get('result')=='FAIL' for x in state['provider']['assertions']),state['provider']['assertions']
        assert any(x.get('result')=='PASS' for x in state['provider']['assertions'])
        assert len([x for x in state['provider']['effects'] if x['kind']=='STAGE'])==4
        assert not [x for x in state['provider']['effects'] if x['kind']=='PUBLISH']
        assert all(x['slug']!='j04-flow-held' for x in state['provider']['effects'])
        assert len(state['git']['effects'])==4 and not any(x['force'] for x in state['git']['effects'])
        evidence['background-complete-before-review']=state
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);assert attach(s).get('ok');ui.click(s,'[data-nav=generators]');ui.click(s,'[data-nav=work-queue]')
        adopted=next(x for x in state['stages'] if x['slug']=='j04-flow-adopted');assert adopted['sourceOrigin']=='ADOPTED_PRIVATE'
        assert next(x for x in adopted['previous']['blobs'] if x['path']=='src/original-only.bin')['base64']=='CQD/'
        assert not [x for x in state['provider']['effects'] if x['slug']=='j04-flow-adopted' and x['kind']=='UNLIST']
        ui.search(s,'j04-flow-adopted');ui.button(s,'Inspect candidate','.candidate-item:has([data-clean-select="j04-flow-adopted"])');ui.wait(s,"[...sh.querySelectorAll('button')].some(x=>x.textContent==='Approve and publish exact candidate')",'J04_ADOPTED_NONEMPTY_PRIVATE_SOURCE_TESTED_REVIEW')
        ui.click(s,'[role=dialog] .setting-option input[type=checkbox]');ui.button(s,'Approve and publish exact candidate');a.alert_accept(s)
        ui.wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Publication may have occurred')||sh.querySelector('[role=dialog]')?.textContent.includes('Published:')",'J04_PRIVATE_EXISTING_ONE_APPROVAL')
        b.call('POST',f'/session/{s}/url',{'url':'about:blank'})
        state=progress(s,lambda x:any(r['slug']=='j04-flow-adopted' and r['state']=='CONFIRMED_PUBLIC' for r in x['releases']),'J04_PRIVATE_EXISTING_PUBLICATION_WITHOUT_PUBLIC_UPDATE_RESERVATION')
        assert next(r for r in state['releases'] if r['slug']=='j04-flow-adopted')['kind']=='PRIVATE_EXISTING'
        evidence['adopted-private-full-original']=state
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);assert attach(s).get('ok');ui.click(s,'[data-nav=generators]');ui.click(s,'[data-nav=work-queue]')
        # A public target stays listed and unchanged until the operator
        # explicitly requests its safe early update. Its active budget stays.
        assert state['provider']['resources']['j04-flow-public']['visibility']=='PUBLIC'
        assert not [x for x in state['provider']['effects'] if x['slug']=='j04-flow-public']
        ui.search(s,'j04-flow-public');ui.button(s,'Update now','.candidate-item:has([data-clean-select="j04-flow-public"])');ui.button(s,'Update now','[role=dialog]');a.alert_accept(s)
        ui.wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Update requested.')",'J04_PRIMARY_SAFE_UPDATE_NOW_INTENT')
        b.call('POST',f'/session/{s}/url',{'url':'about:blank'})
        state=progress(s,lambda x:any(w['slug']=='j04-flow-public' and w['state']=='CONFIRMED' for w in x['writebacks']),'J04_PUBLIC_EMPTY_P_UPDATE_UNLIST_STAGE_TEST_GIT')
        update=next(x for x in state['existing'] if x['slug']=='j04-flow-public');assert update['priorSource']['totalBytes']==0 and update['previousFingerprint']==next(x for x in state['stages'] if x['slug']=='j04-flow-public')['previous']['fingerprint']
        row=state['shadow']['rows'][0];assert [row['phase'],row['slot'],row['activeRemaining'],row['sleepRemaining']]==['ACTIVE',True,123456,0]
        assert len([x for x in state['provider']['effects'] if x['slug']=='j04-flow-public' and x['kind']=='UNLIST'])==1
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);assert attach(s).get('ok');ui.click(s,'[data-nav=generators]');ui.click(s,'[data-nav=work-queue]')
        ui.search(s,'j04-flow-public');ui.button(s,'Inspect candidate','.candidate-item:has([data-clean-select="j04-flow-public"])');ui.wait(s,"[...sh.querySelectorAll('button')].some(x=>x.textContent==='Approve and publish exact candidate')",'J04_PUBLIC_UPDATE_EXACT_REVIEW')
        ui.click(s,'[role=dialog] .setting-option input[type=checkbox]');ui.button(s,'Approve and publish exact candidate');a.alert_accept(s)
        ui.wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Publication may have occurred')||sh.querySelector('[role=dialog]')?.textContent.includes('Published:')",'J04_PUBLIC_UPDATE_ONE_APPROVAL')
        b.call('POST',f'/session/{s}/url',{'url':'about:blank'})
        state=progress(s,lambda x:any(r['slug']=='j04-flow-public' and r['state']=='CONFIRMED_PUBLIC' for r in x['releases']),'J04_PUBLIC_UPDATE_OVERRIDE_INDEPENDENT_PUBLICATION')
        assert next(r for r in state['releases'] if r['slug']=='j04-flow-public')['kind']=='EXISTING_UPDATE'
        evidence['public-update-now-empty-P']=state
        background(s,'return await window.__j04flow.loseNextPublish();')
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);assert attach(s).get('ok');ui.click(s,'[data-nav=generators]');ui.click(s,'[data-nav=work-queue]')
        ui.search(s,'j04-flow-repair');ui.button(s,'Inspect candidate','.candidate-item:has([data-clean-select="j04-flow-repair"])');ui.wait(s,"[...sh.querySelectorAll('button')].some(x=>x.textContent==='Approve and publish exact candidate')",'J04_REAL_GIT_FINAL_F_REVIEW')
        assert b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('[role=dialog]').getAttribute('aria-label')")=='Review exact candidate for j04-flow-repair'
        ui.capture(s,'autonomous-tested-review',evidence)
        parent=next(j for j in state['jobs'] if j['slug']=='j04-flow-repair')
        ui.fill(s,'[aria-label="Request changes to candidate"]','Use the revised greeting and preserve binary assets.')
        ui.button(s,'Request changes');a.alert_accept(s)
        ui.wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Changes requested.')",'J04_PRIMARY_REQUEST_CHANGES_CAPTURED')
        b.call('POST',f'/session/{s}/url',{'url':'about:blank'})
        state=progress(s,lambda x:any(w['slug']=='j04-flow-repair' and w['state']=='CONFIRMED' and w['stageRevision']>parent['stageRevision'] for w in x['writebacks']),'J04_REQUEST_CHILD_RETESTED_AND_NEW_GIT_F_CONFIRMED')
        child=next(j for j in state['jobs'] if j['slug']=='j04-flow-repair')
        assert child['parentFingerprint'] and child['verifiedFinal']!=child['parentFingerprint']
        assert len([x for x in state['provider']['effects'] if x.get('text')=='Use the revised greeting and preserve binary assets.'])==1
        evidence['requested-child-retested']=state
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);assert attach(s).get('ok');ui.click(s,'[data-nav=generators]');ui.click(s,'[data-nav=work-queue]')
        ui.search(s,'j04-flow-repair');ui.button(s,'Inspect candidate','.candidate-item:has([data-clean-select="j04-flow-repair"])')
        ui.wait(s,"[...sh.querySelectorAll('button')].some(x=>x.textContent==='Approve and publish exact candidate')",'J04_FRESH_CHILD_REQUIRES_FRESH_REVIEW')
        ui.click(s,'.candidate-human-review > summary');ui.button(s,'Defer for human editing')
        ui.wait(s,"[...sh.querySelectorAll('button')].some(x=>x.textContent==='Adopt saved human changes')",'J04_PRIMARY_DEFER_PRESERVES_HUMAN_WORK')
        background(s,"return await window.__j04flow.humanSave('j04-flow-repair',true);")
        ui.button(s,'Adopt saved human changes');ui.wait(s,"sh.querySelector('.candidate-human-review')?.textContent.includes('Save your edits and stop any running helper')",'J04_DIRTY_HUMAN_ADOPTION_REJECTED_WITH_RECOVERY')
        before=inspect(s);assert next(j for j in before['jobs'] if j['slug']=='j04-flow-repair')['revision']==child['revision']
        background(s,"return await window.__j04flow.humanSave('j04-flow-repair',false);")
        ui.button(s,'Adopt saved human changes')
        ui.wait(s,"sh.querySelector('.candidate-human-review')?.textContent.includes('Human source adopted.')",'J04_SAVED_HUMAN_SOURCE_NEW_UNTESTED_CHILD')
        adopted=inspect(s);human=next(j for j in adopted['jobs'] if j['slug']=='j04-flow-repair');assert human['verifiedFinal'] is None and human['sourceFingerprint']!=child['sourceFingerprint']
        ui.capture(s,'human-adoption-recovery',evidence)
        b.call('POST',f'/session/{s}/url',{'url':'about:blank'})
        state=progress(s,lambda x:any(w['slug']=='j04-flow-repair' and w['state']=='CONFIRMED' and w['stageRevision']>child['stageRevision'] for w in x['writebacks']),'J04_HUMAN_ADOPTED_SOURCE_RETESTED_AND_GIT_RECONFIRMED')
        evidence['human-new-candidate']=state
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);assert attach(s).get('ok');ui.click(s,'[data-nav=generators]');ui.click(s,'[data-nav=work-queue]')
        ui.search(s,'j04-flow-repair');ui.button(s,'Inspect candidate','.candidate-item:has([data-clean-select="j04-flow-repair"])')
        ui.wait(s,"[...sh.querySelectorAll('button')].some(x=>x.textContent==='Approve and publish exact candidate')",'J04_HUMAN_SOURCE_FRESH_REVIEW_REQUIRED')
        # Actual exact-source approval is the one consequential decision.
        ui.click(s,'[role=dialog] .setting-option input[type=checkbox]');ui.button(s,'Approve and publish exact candidate');a.alert_accept(s)
        ui.wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Publication may have occurred')||sh.querySelector('[role=dialog]')?.textContent.includes('Published:')",'J04_ONE_APPROVAL_ATTEMPT')
        b.call('POST',f'/session/{s}/url',{'url':'about:blank'})
        state=progress(s,lambda x:any(r['slug']=='j04-flow-repair' and r['state']=='CONFIRMED_PUBLIC' for r in x['releases']),'J04_LOST_PUBLICATION_ACK_BACKGROUND_READBACK_NO_REPLAY')
        assert len([x for x in state['provider']['effects'] if x['kind']=='PUBLISH' and x['slug']=='j04-flow-repair'])==1
        evidence['independent-publication']=state
        # Select the complete tested unchanged set once. The modified child
        # stays excluded; no second per-item approval is part of this path.
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);assert attach(s).get('ok');ui.click(s,'[data-nav=generators]');ui.click(s,'[data-nav=work-queue]')
        for slug in ['j04-flow-clean-a','j04-flow-clean-b']:
            ui.search(s,slug);ui.click(s,'[data-clean-select="'+slug+'"]')
        ui.click(s,'[data-clean-selection]');ui.wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('2 included')",'J04_REAL_CLEAN_SET_FROZEN')
        ui.capture(s,'clean-bulk-approved',evidence)
        ui.button(s,'Approve 2 unchanged candidates');a.alert_accept(s)
        ui.wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Approval saved.')",'J04_ONE_CLEAN_SET_APPROVAL')
        # Kill/relaunch the actual owned Firefox process after the decision.
        # Test-only external dependencies are reopened in the new background;
        # all canonical/effect ledgers are read from the original disk profile.
        pids=b.owned_firefox_pids(profile);assert pids,'J04_PIPELINE_OLD_FIREFOX_PROCESS_MISSING';b.close(s);b.require_owned_exit(profile,pids);s=None
        s=b.open_session(browser,profile);replacement=b.owned_firefox_pids(profile);assert replacement and not pids.intersection(replacement),'J04_PIPELINE_REPLACEMENT_PROCESS_NOT_DISTINCT';b.call('POST',f'/session/{s}/url',{'url':'about:blank'});assert install(s).get('ok')
        state=progress(s,lambda x:len([r for r in x['releases'] if r['state']=='CONFIRMED_PUBLIC'])==5,'J04_CLEAN_SET_SURVIVES_PROCESS_RESTART_AND_PUBLISHES_EACH_EXACT_SOURCE')
        effects=[x for x in state['provider']['effects'] if x['kind']=='PUBLISH'];assert len(effects)==5 and len(set(x['slug'] for x in effects))==5
        assert all(x['slug']!='j04-flow-held' for x in state['provider']['effects'])
        assert all(next(f for f in r['source'] if f['path']=='src/retained.bin')['base64']=='AP+AEQ==' for r in state['provider']['resources'].values() if r['slug']!='j04-flow-held')
        original=next(x for x in state['stages'] if x['slug']=='j04-flow-adopted')['previous'];assert next(x for x in original['blobs'] if x['path']=='src/original-only.bin')['base64']=='CQD/'
        evidence['clean-bulk-process-restart']=state
        pathlib.Path('build/j04-autonomous-pipeline.json').write_text(json.dumps(evidence,indent=2));print('B J04_AUTONOMOUS_BACKGROUND_PRIMARY_REPAIR_GIT_APPROVAL_PUBLICATION=PASS',flush=True)
    finally:
        if s:b.close(s)

if __name__=='__main__':
    browser=pathlib.Path(os.environ['FIREFOX_BINARY']);driver=pathlib.Path(os.environ['GECKODRIVER_BINARY']);archive=pathlib.Path(sys.argv[1]).resolve()
    with tempfile.TemporaryDirectory(prefix='pcms-j04-pipeline-firefox-') as folder:
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
