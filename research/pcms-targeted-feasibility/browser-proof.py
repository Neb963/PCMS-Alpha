#!/usr/bin/env python3
"""Disposable normal-sandbox Firefox lifecycle and disk archive round trip.
Uses only Python standard library and Alpha's pinned Firefox/geckodriver setup.
"""
import base64,functools,hashlib,http.server,json,os,pathlib,signal,socket,subprocess,sys,tempfile,threading,time,zipfile
from urllib.request import Request,urlopen
from urllib.error import HTTPError
from verify_archive import verify
ROOT=pathlib.Path(__file__).resolve().parent
ID='pcms-targeted-feasibility@example.invalid'
PORT=44449;BASE=f'http://127.0.0.1:{PORT}'
records=[]
def record(id,oracle,**observed):
    item={'id':id,'status':'PASS','tier':'NORMAL_SANDBOX_FIREFOX_SYNTHETIC','oracle':oracle,**observed}
    records.append(item);print(json.dumps(item,sort_keys=True),flush=True)
def call(method,path,data=None,timeout=30):
    req=Request(BASE+path,data=None if data is None else json.dumps(data).encode(),method=method,headers={'Content-Type':'application/json'})
    try:
        with urlopen(req,timeout=timeout) as r: obj=json.load(r)
    except HTTPError as e: raise RuntimeError(e.read().decode()[:2000]) from e
    v=obj.get('value');
    if isinstance(v,dict) and v.get('error'):raise RuntimeError(v)
    return v
def sync(s,code,args=[]):return call('POST',f'/session/{s}/execute/sync',{'script':code,'args':args})
def asyncjs(s,code,args=[]):return call('POST',f'/session/{s}/execute/async',{'script':code,'args':args})
def chrome(s,code,args=[],asynchronous=False):
    call('POST',f'/session/{s}/moz/context',{'context':'chrome'})
    try:return (asyncjs if asynchronous else sync)(s,code,args)
    finally:call('POST',f'/session/{s}/moz/context',{'context':'content'})
def command(s,m):
    r=asyncjs(s,'const done=arguments[arguments.length-1]; window.proof(arguments[0]).then(x=>done({result:x}),e=>done({failure:String(e)}));',[m])
    if 'failure' in r:raise RuntimeError(r['failure'])
    return r['result']
def nav(s,url):call('POST',f'/session/{s}/url',{'url':url})
def ui(s,url):
    nav(s,url)
    for _ in range(100):
        if sync(s,"return typeof window.proof==='function'"):return
        time.sleep(.05)
    raise AssertionError('packaged UI not loaded')
def wait_state(s,predicate,timeout=12):
    until=time.monotonic()+timeout;last=None
    while time.monotonic()<until:
        last=command(s,{'op':'state'})
        if predicate(last):return last
        time.sleep(.15)
    raise AssertionError(('state timeout',last))
def start(firefox,profile,downloads):
    profile.mkdir(exist_ok=True);downloads.mkdir(exist_ok=True)
    data=call('POST','/session',{'capabilities':{'alwaysMatch':{'browserName':'firefox','moz:firefoxOptions':{'binary':str(firefox),'args':['-headless','-no-remote','-profile',str(profile)],'prefs':{'xpinstall.signatures.required':False,'extensions.autoDisableScopes':0,'browser.download.folderList':2,'browser.download.dir':str(downloads),'browser.download.useDownloadDir':True}}}}},timeout=50)
    s=data['sessionId'];call('POST',f'/session/{s}/timeouts',{'script':30000})
    pid=data['capabilities']['moz:processID']
    return s,pid
def stop(s,pid):
    call('DELETE',f'/session/{s}',timeout=20)
    for _ in range(80):
        status=pathlib.Path(f'/proc/{pid}/status')
        if not status.exists() or 'State:\tZ' in status.read_text():return
        time.sleep(.05)
    raise AssertionError('owned Firefox parent still running')
def extension_url(s):
    return chrome(s,'return WebExtensionPolicy.getByID(arguments[0])?.extension.baseURI.spec;',[ID])+'ui.html'
def mount(s):return asyncjs(s,'const done=arguments[arguments.length-1]; window.mountProofModule().then(()=>done(true),e=>done({error:String(e)}));')
def click_module(s):
    element=call('POST',f'/session/{s}/element',{'using':'css selector','value':'#module iframe'})
    call('POST',f'/session/{s}/frame',{'id':element})
    try:
        for _ in range(60):
            found=call('POST',f'/session/{s}/elements',{'using':'css selector','value':'button'})
            if found:break
            time.sleep(.05)
        else:raise AssertionError('dynamic module UI button missing')
        key='element-6066-11e4-a52e-4f735466cecf';call('POST',f'/session/{s}/element/{found[0][key]}/click',{})
    finally:call('POST',f'/session/{s}/frame',{'id':None})
def main():
    for k in ['MOZ_DISABLE_CONTENT_SANDBOX','MOZ_DISABLE_GMP_SANDBOX','MOZ_DISABLE_RDD_SANDBOX','MOZ_DISABLE_SOCKET_PROCESS_SANDBOX']:
        assert not os.environ.get(k),'weakened sandbox forbidden: '+k
    firefox=pathlib.Path(os.environ['FIREFOX_BINARY']);gecko=pathlib.Path(os.environ['GECKODRIVER_BINARY'])
    with tempfile.TemporaryDirectory(prefix='pcms-targeted-') as tmp:
        t=pathlib.Path(tmp);xpi=t/'proof.xpi'
        with zipfile.ZipFile(xpi,'w') as z:
            for f in sorted((ROOT/'extension').iterdir()):z.write(f,f.name)
        handler=functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT/'fixtures'))
        web=http.server.ThreadingHTTPServer(('127.0.0.1',8765),handler);threading.Thread(target=web.serve_forever,daemon=True).start()
        env=dict(os.environ);env['MOZ_REMOTE_ALLOW_SYSTEM_ACCESS']='1'
        log=open(t/'geckodriver.log','w+')
        driver=subprocess.Popen([str(gecko),'--port',str(PORT),'--allow-system-access'],env=env,stdout=log,stderr=subprocess.STDOUT)
        s=None;pid=None
        try:
            for _ in range(100):
                try:
                    if call('GET','/status').get('ready'):break
                except Exception:time.sleep(.05)
            p1=t/'source-profile';downloads=t/'downloads';s,pid=start(firefox,p1,downloads)
            sandbox=chrome(s,"return {level:Services.prefs.getIntPref('security.sandbox.content.level'),version:Services.appinfo.version,build:Services.appinfo.appBuildID};")
            assert sandbox['level']>0
            assert call('POST',f'/session/{s}/moz/addon/install',{'path':str(xpi),'temporary':False})==ID
            url=extension_url(s);ui(s,url)
            p1pkg=json.loads((ROOT/'fixtures/module-v1.json').read_text());p2pkg=json.loads((ROOT/'fixtures/module-v2.json').read_text())
            command(s,{'op':'install','package':p1pkg});mount(s);click_module(s)
            initial=wait_state(s,lambda x:len(x['jobs'])==1);job=initial['jobs'][0]['id']
            nav(s,'about:blank');time.sleep(2)
            ui(s,url);one=wait_state(s,lambda x:len(x['effects'])>=1)
            assert one['jobs'][0]['id']==job
            record('A1','clicked supplied UI; closed all extension UI; durable v1 effect appeared',effects=len(one['effects']),job=job)
            oldBoot=one['liveBoot'];nav(s,'about:blank')
            suspended=chrome(s,"""const done=arguments[arguments.length-1];const e=WebExtensionPolicy.getByID(arguments[0]).extension;const before=e.backgroundState;(e.backgroundState==='stopped'?Promise.resolve():e.terminateBackground()).then(()=>done({before,after:e.backgroundState}),x=>done({error:String(x)}));""",[ID],True)
            assert suspended['after']=='stopped',suspended
            ui(s,url);two=command(s,{'op':'state'});assert oldBoot!=two['liveBoot'];assert two['jobs'][0]['id']==job
            command(s,{'op':'wakeProof'});wait_state(s,lambda x:len(x['effects'])>len(one['effects']))
            record('A2','Firefox reports background stopped; new event page resumes same job',state=suspended)
            # Rebind lastOldBinding in current background before replacement.
            before=command(s,{'op':'state'});command(s,{'op':'install','package':p2pkg});mount(s)
            replay=command(s,{'op':'replayOld'});assert 'revoked generation' in replay['rejection'] and replay['before']==replay['after'],replay
            marker=len(command(s,{'op':'state'})['effects']);command(s,{'op':'wakeProof'});updated=wait_state(s,lambda x:len(x['effects'])>marker)
            assert all(e['version']=='2' for e in updated['effects'][marker:]);assert updated['jobs'][0]['id']==job
            record('A3','unfinished job/input survives replacement; stale binding rejected; only v2 effects follow fence',replay=replay)
            originalPID=pid;count=len(updated['effects']);stop(s,pid);s=None
            s,pid=start(firefox,p1,downloads);assert pid!=originalPID;url=extension_url(s);ui(s,url)
            restarted=command(s,{'op':'state'});assert restarted['jobs'][0]['id']==job and restarted['module']['version']=='2'
            command(s,{'op':'wakeProof'});wait_state(s,lambda x:len(x['effects'])>count)
            record('A4','OS observes old process exit; persistently installed XPI resumes same job after fresh Firefox process',oldPID=originalPID,newPID=pid,xpiSHA=hashlib.sha256(xpi.read_bytes()).hexdigest(),**sandbox)
            command(s,{'op':'disable'});disabled=command(s,{'op':'state'});n=len(disabled['effects']);command(s,{'op':'wakeProof'});time.sleep(1.3)
            after=command(s,{'op':'state'});assert len(after['effects'])==n and after['jobs']==disabled['jobs'];assert after['module']['package']==p2pkg
            record('A5','disabled host produces no additional effect, retains package and jobs',effects=n)
            command(s,{'op':'enable'});command(s,{'op':'wakeProof'});wait_state(s,lambda x:len(x['effects'])>n);command(s,{'op':'disable'})
            record('A6','explicit Enable resumes retained unfinished job without extension reinstall')
            f=json.loads((ROOT/'fixtures/source.json').read_text());seed=command(s,{'op':'seed','fixture':f})
            try:command(s,{'op':'capture','interrupt':True});raise AssertionError('missing fault')
            except RuntimeError as e:assert 'INJECTED_CAPTURE_INTERRUPTION' in str(e)
            assert command(s,{'op':'state'})['maintenance'] is True
            assert not list(downloads.rglob('*.zip'))
            cut=sync(s,"return browser.storage.local.get(['captureStage','captureReceipt']);")
            assert cut.get('captureStage',{}).get('complete') is False and 'captureReceipt' not in cut
            stop(s,pid);s=None;s,pid=start(firefox,p1,downloads);url=extension_url(s);ui(s,url)
            assert command(s,{'op':'state'})['maintenance'] is True
            record('B1','capture cut retains durable hold; no final archive or receipt')
            receipt=command(s,{'op':'capture'});disk=pathlib.Path(receipt['filename']);src=verify(disk)
            assert src['sha256']==receipt['sha256'] and src['bytes']==receipt['bytes']
            source=src['sections'];assert source['credentials']==f['credentials'] and source['sources']==f['sources']
            (ROOT/'evidence/firefox-export.zip').write_bytes(disk.read_bytes())
            print('PCMS_SYNTHETIC_ARCHIVE_BASE64='+base64.b64encode(disk.read_bytes()).decode(),flush=True)
            # Actual indexedDB keys, values and OPFS bytes are read back from the archive.
            for i in range(2):
                assert source['localStorage'][i]['values']==f['localStorage'][i]['values']
                assert source['opfs'][i]['files']==f['opfs'][i]['files']
                assert sorted(source['indexedDB'][i]['databases'][0]['stores'][0]['records'],key=lambda x:x['key'])==sorted(f['indexedDB'][i]['databases'][0]['stores'][0]['records'],key=lambda x:x['key'])
            assert len(source['cookies'])==4
            record('B2','Downloads archive independently reopened with Python CRC/SHA; all source categories present',bytes=src['bytes'],sha256=src['sha256'],sourceMapping=seed['mapping'])
            stop(s,pid);s=None
            p2=t/'fresh-target-profile';assert not p2.exists();s,pid=start(firefox,p2,t/'target-downloads')
            call('POST',f'/session/{s}/moz/addon/install',{'path':str(xpi),'temporary':False});url=extension_url(s);ui(s,url)
            archiveBytes=list(disk.read_bytes());bad=archiveBytes.copy();bad[200]^=1
            try:command(s,{'op':'restore','bytes':bad});raise AssertionError('corrupt accepted')
            except RuntimeError:pass
            untouched=sync(s,"return browser.storage.local.get(['activeSnapshot','restoreStage']);");assert untouched=={}
            try:command(s,{'op':'restore','bytes':archiveBytes,'interrupt':True});raise AssertionError('cut absent')
            except RuntimeError as e:assert 'INJECTED_RESTORE_INTERRUPTION' in str(e)
            staged=sync(s,"return browser.storage.local.get(['activeSnapshot','restoreStage']);");assert 'activeSnapshot' not in staged and staged['restoreStage']['phase']=='prepared'
            stop(s,pid);s=None;s,pid=start(firefox,p2,t/'target-downloads');url=extension_url(s);ui(s,url)
            assert command(s,{'op':'state'})['maintenance'] is True
            restored=command(s,{'op':'continueRestore'});actual=command(s,{'op':'verifyRestore'})
            mapping=restored['mapping'];assert all(k!=v for k,v in mapping.items())
            expected=json.loads(json.dumps(source))
            for p in expected['personas']['items']:p['cookieStoreId']=mapping[p['cookieStoreId']]
            for c in expected['cookies']:c['storeId']=mapping[c['storeId']]
            for category in ['localStorage','indexedDB','opfs']:
                for item in expected[category]:item['storeId']=mapping[item['storeId']]
            observed=actual['actual']
            for category in ['modules','sources','history','journal','credentials','ai','native','localStorage','indexedDB','opfs','personas']:assert observed[category]==expected[category],category
            def cookie_key(c):return (c['storeId'],c['name'],json.dumps(c.get('partitionKey',{}),sort_keys=True))
            assert sorted(observed['cookies'],key=cookie_key)==sorted(expected['cookies'],key=cookie_key),'cookie metadata'
            assert [j['status'] for j in observed['core']['jobs']]==['Recover','Reconcile']
            assert observed['core']['paused'] and observed['core']['maintenance'];assert actual['state']['effects']==[]
            record('B3','fresh profile, changed container IDs, exact data/cookie readback; uncertain mutation not replayed',mapping=mapping,jobs=restored['jobs'])
            record('B4','actual partial restore then OS restart retains hold; resumes same staging map and commits verified data',receipt=actual['receipt'])
            record('B5','corrupt archive rejected before restore writes; empty fresh target unchanged')
            command(s,{'op':'enable'});command(s,{'op':'resumeRestoredProof'});command(s,{'op':'wakeProof'})
            recovered=wait_state(s,lambda x:any(e['job']=='safe' for e in x['effects']))
            assert not any(e['job']=='unknown' for e in recovered['effects'])
            assert next(j for j in recovered['jobs'] if j['id']=='unknown')['status']=='Reconcile'
            record('B6','after explicit enable and synthetic validation, safe job resumes; uncertain job still has no replay effect',effects=recovered['effects'])
        finally:
            if s:
                try:stop(s,pid)
                except Exception:pass
            driver.terminate();
            try:driver.wait(timeout=5)
            except subprocess.TimeoutExpired:driver.kill()
            web.shutdown();log.flush();log.seek(0);out=log.read()
            if any(w in out for w in ['uid_map: EPERM','CanCreateUserNamespace() clone() failure']):
                print('NORMAL_SANDBOX_ENVIRONMENT_WARNING '+out[-2500:],flush=True)
            (ROOT/'evidence/browser-results.json').write_text(json.dumps(records,indent=2)+'\n')
if __name__=='__main__':main()
