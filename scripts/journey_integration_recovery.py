#!/usr/bin/env python3
"""Issue60 full-XPI integration: actual SOCKS/TLS, primary clicks and real IDB.
Native Messaging/provider are offline protocol fixtures; no real OS tunnel,
Perchance account or private Git effect is claimed. No product capability off.
"""
import base64,hashlib,json,os,pathlib,shutil,subprocess,sys,tempfile,time
from urllib.request import urlopen
import journey_accounts_ui as a
import journey_generators_ui as g
import journey_development_pipeline as pipeline
sys.path.insert(0,str(pathlib.Path(__file__).with_name('fixtures')))
from issue60_provider import Oracle
b=a.b;ROOT=pathlib.Path(__file__).resolve().parents[1]

def background(s,body):return pipeline.background(s,body)
def hold_background(s,enabled):
    b.call('POST',f'/session/{s}/moz/context',{'context':'chrome'})
    try:
        script="""const {ExtensionParent}=ChromeUtils.importESModule('resource://gre/modules/ExtensionParent.sys.mjs');
const ext=ExtensionParent.GlobalManager.extensionMap.get('persona-route-manager@local');
window.__issue60Release?.();window.__issue60Release=null;
if(ENABLED){const promise=new Promise(resolve=>window.__issue60Release=resolve);ext.emit('background-script-idle-waituntil',{promise,reason:'listeners'});}return true;""".replace('ENABLED',str(enabled).lower())
        return b.execute(s,script)
    finally:b.call('POST',f'/session/{s}/moz/context',{'context':'content'})
def install_native(s,oracle):
    source=ROOT.joinpath('scripts/fixtures/issue60_background.mjs').read_text().replace('export async function','async function')
    out=background(s,source+';return await installIssue60NativeFixture('+json.dumps({'url':f'http://127.0.0.1:{oracle.control.server_address[1]}/native','key':oracle.key})+');')
    assert out.get('ok'),out
    hold_background(s,True)
def inspect(s):return background(s,'return await window.__issue60.inspect();')
def command(s,account_id,kind):
    # The click must complete its own handler. A previously PINNED record
    # cannot prove that a new Verify/Change action has finished.
    a.command(s,kind)
    a.wait(s,"(()=>{const text=sh.querySelector('.account-feedback')?.textContent||'';return text!==''&&!text.includes('Working')&&!text.includes('Finishing')})()",'ISSUE60_'+kind+'_HANDLER_SETTLED',120)
    deadline=time.monotonic()+120
    while time.monotonic()<deadline:
        account=b.account_command(s,{'type':'INSPECT_ACCOUNT','params':{'accountId':account_id}})['account']
        if not account['working']:return account
        time.sleep(.2)
    raise AssertionError(('ISSUE60_COMMAND_STILL_RUNNING',kind,account))
def wait_new_protected_tab(s,before_tabs,context_id,timeout=10,read_tabs=None,clock=time.monotonic,pause=time.sleep):
    # tabs.create can acknowledge a tab before its first navigation changes
    # about:blank. Observe the exact new tab/context/URL; never repeat Open.
    before=set(before_tabs);deadline=clock()+timeout;last=[]
    if not isinstance(context_id,str) or not context_id:
        raise AssertionError('ISSUE60_PROTECTED_CONTEXT_UNVERIFIED')
    if read_tabs is None:
        read_tabs=lambda:background(s,'return (await browser.tabs.query({})).map(t=>({id:t.id,url:t.url,cookieStoreId:t.cookieStoreId}));')
    while clock()<deadline:
        last=read_tabs()
        for tab in last:
            if type(tab.get('id')) is int and tab['id'] not in before and tab.get('url')=='https://perchance.org/' and tab.get('cookieStoreId')==context_id:
                return tab
        pause(.1)
    raise AssertionError(('ISSUE60_PROTECTED_TAB_NAVIGATION_UNCONFIRMED',context_id,last))

def wait_record(s,account_id,state=None,route=None,seconds=55):
    deadline=time.monotonic()+seconds;last=None
    while time.monotonic()<deadline:
        data=inspect(s);last=next((x for x in data['accounts'] if x['accountId']==account_id),None)
        if last and (state is None or last['state']==state) and (route is None or last.get('route',{}).get('status')==route):return last
        time.sleep(.2)
    raise AssertionError(('ISSUE60_ACCOUNT_STATE',state,route,last))
def cert_browser(browser,folder):
    certs=folder/'certs';certs.mkdir()
    def openssl(*args):subprocess.run(['openssl',*args],cwd=certs,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    openssl('req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.pem','-days','2','-subj','/CN=PCMS Issue60 disposable fixture CA','-addext','basicConstraints=critical,CA:TRUE')
    openssl('req','-newkey','rsa:2048','-nodes','-keyout','server.key','-out','server.csr','-subj','/CN=perchance.org')
    (certs/'server.ext').write_text('basicConstraints=CA:FALSE\nextendedKeyUsage=serverAuth\nsubjectAltName=DNS:perchance.org,DNS:*.perchance.org,DNS:*.am.i.mullvad.net,DNS:*.dnsleak.am.i.mullvad.net,DNS:am.i.mullvad.net\n')
    openssl('x509','-req','-in','server.csr','-CA','ca.pem','-CAkey','ca.key','-CAcreateserial','-out','server.pem','-days','2','-extfile','server.ext')
    owned=folder/'firefox';shutil.copytree(browser.parent,owned,symlinks=True)
    distribution=owned/'distribution';distribution.mkdir(exist_ok=True)
    (distribution/'policies.json').write_text(json.dumps({'policies':{'Certificates':{'Install':[str(certs/'ca.pem')]}}}))
    return owned/browser.name,certs
def baseline(folder):
    revision='14cba259d2b209533ad0a9f4b5da6c1397820977'
    if subprocess.run(['git','cat-file','-e',revision+'^{commit}'],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode:
        subprocess.run(['git','fetch','--no-tags','--depth=1','origin',revision],cwd=ROOT,check=True,timeout=60,stdout=subprocess.DEVNULL)
    checkout=folder/'baseline';checkout.mkdir()
    archive=subprocess.Popen(['git','archive',revision],cwd=ROOT,stdout=subprocess.PIPE)
    subprocess.run(['tar','--no-same-owner','-x','-C',str(checkout)],stdin=archive.stdout,check=True);archive.stdout.close();assert archive.wait()==0
    subprocess.run(['node','scripts/build-i00.mjs'],cwd=checkout,check=True,stdout=subprocess.DEVNULL)
    old=checkout/'build/pcms-alpha-i00.xpi'
    assert hashlib.sha256(old.read_bytes()).hexdigest()=='196a5c8acc7fb75580f59120761f38d4d4e675d3e9349c8f009d3643241e597f'
    return old
def configure_routes(s,uuid):
    return b._options(s,uuid,"""const snap=await send({type:'GET_SNAPSHOT'}),state=structuredClone(snap.state);
state.global.mullvadNative={...state.global.mullvadNative,enabled:true,autoStart:true,autoStopMinutes:0};
for(let i=0;i<4;i++){const id='issue60-mullvad-'+i;state.routes[id]={id,name:'Offline protected route '+i,provider:'mullvad',type:'socks',host:'10.124.0.'+(7+i),port:1080,proxyDNS:true,enabled:true};}
const preview=await send({type:'PREVIEW_STATE_CHANGE',state});
await send({type:'AUTHORIZE_SECURITY_PREVIEW',previewId:preview.previewId,approvedDelta:preview.delta});
await send({type:'COMMIT_STATE_PREVIEW',authorizationId:preview.previewId});return {ok:true};""")
def screenshot(s,name,evidence):
    pathlib.Path('build').mkdir(exist_ok=True)
    pathlib.Path('build/issue60-'+name+'.png').write_bytes(base64.b64decode(b.call('GET',f'/session/{s}/screenshot')))
    evidence[name]=b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;return {page:sh.querySelector('#page')?.innerText,dialog:sh.querySelector('[role=dialog]')?.innerText||'',overflow:document.documentElement.scrollWidth>innerWidth}")
def cold(s,browser,profile,url,oracle):
    hold_background(s,False);old=b.owned_firefox_pids(profile);b.close(s);b.require_owned_exit(profile,old)
    s=b.open_session(browser,profile);assert not old.intersection(b.owned_firefox_pids(profile))
    b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);install_native(s,oracle);return s
def drive_creation(s,slug,seconds=90):
    until=time.monotonic()+seconds;last=None
    while time.monotonic()<until:
        records=[x.get('record') for x in inspect(s)['creates']];last=next((x for x in records if x and x['slug']==slug),None)
        if last and last['state']=='GIT_INIT_PENDING':return last
        if last and last.get('lastAttempt',{}).get('ok') is False:
            raise AssertionError(('ISSUE60_CREATION_CAUSAL_HOLD',last))
        background(s,"await browser.alarms.create('pcms-s04-creation-followup',{when:Date.now()+150});return true;")
        time.sleep(.45)
    raise AssertionError(('ISSUE60_CREATION_FIRST_CAUSAL_STATE',last))
def run(browser,archive,folder):
    folder=pathlib.Path(folder)/'issue60-integration';folder.mkdir()
    browser,certs=cert_browser(pathlib.Path(browser),folder);oracle=Oracle(certs/'server.pem',certs/'server.key')
    profile=folder/'profile';profile.mkdir();downloads=folder/'downloads';downloads.mkdir()
    # Default browser traffic goes to a closed LOOPBACK proxy. Only the
    # production donor's explicit authenticated fixture SOCKS routes override
    # it. DNS is forced to loopback as a second layer; DoH is disabled.
    (profile/'user.js').write_text('user_pref("xpinstall.signatures.required",false);\nuser_pref("network.dns.forceResolve","127.0.0.1");\nuser_pref("network.trr.mode",5);\nuser_pref("network.proxy.type",1);\nuser_pref("network.proxy.http","127.0.0.1");\nuser_pref("network.proxy.http_port",9);\nuser_pref("network.proxy.ssl","127.0.0.1");\nuser_pref("network.proxy.ssl_port",9);\nuser_pref("network.proxy.no_proxies_on","localhost,127.0.0.1");\nuser_pref("browser.download.folderList",2);\nuser_pref("browser.download.useDownloadDir",true);\nuser_pref("browser.download.dir",'+json.dumps(str(downloads))+');\n')
    s=None;evidence={'scope':{'network':'real authenticated SOCKS/TLS; no Internet forwarding','native':'Native Messaging API protocol fixture, no OS bridge mutation','provider':'offline Perchance protocol/page; actual production isolated-world readers','background':'test controller holds mock native-port lifetime; actual process cold restarts separately observed','sandboxOverride':os.environ.get('MOZ_DISABLE_CONTENT_SANDBOX')=='1','realMullvadPerchancePrivateGit':'NOT_TESTED'}}
    try:
        old=baseline(folder);s=b.open_session(browser,profile)
        assert b.call('POST',f'/session/{s}/moz/addon/install',{'path':str(old),'temporary':False},timeout=45)==b.ID
        b.close(s);s=b.open_session(browser,profile)
        uuid=b.addons_uuid(profile);url=f'moz-extension://{uuid}/pcms/index.html#accounts';b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s)
        install_native(s,oracle);configure_routes(s,uuid);b.call('POST',f'/session/{s}/url',{'url':url})
        a.wait(s,"!!sh.querySelector('[data-action=add-account]')",'ISSUE60_PRIMARY')
        ids=[]
        for index in range(3):
            a.click(s,'[data-action=add-account]')
            deadline=time.monotonic()+65
            while time.monotonic()<deadline:
                rows=inspect(s)['accounts'];new=[x for x in rows if x['accountId'] not in ids]
                if new and new[0]['state']=='WAITING_LOGIN':break
                time.sleep(.2)
            else:raise AssertionError(('ISSUE60_BASELINE_PROTECTED_SETUP',rows,oracle.inspect()))
            account_id=new[0]['accountId'];ids.append(account_id)
            if b.execute(s,"return !!document.getElementById('pcms-faithful-host').shadowRoot.querySelector('.account-dialog')"):a.close_dialog(s)
            a.manage(s,account_id)
            # Only the historical baseline is being seeded here. Its first
            # one-minute upkeep can overlap the third enrollment on a slow
            # machine. Observe its actual owner finishing before issuing
            # another baseline intent; never bypass or cancel that owner.
            deadline=time.monotonic()+100
            while time.monotonic()<deadline:
                current=b.account_command(s,{'type':'INSPECT_ACCOUNT','params':{'accountId':account_id}})['account']
                if not current['working']:break
                time.sleep(.2)
            else:raise AssertionError(('ISSUE60_BASELINE_OWNER_DID_NOT_SETTLE',current))
            command(s,account_id,'CONFIRM_LOGIN');wait_record(s,account_id,'VERIFIED' if index<2 else 'INVENTORY_PENDING')
            a.close_dialog(s)
        seeded=inspect(s);assert len(seeded['inventories'])==2,seeded
        background(s,'return await window.__issue60.seedLegacy('+json.dumps(ids[0])+');')
        evidence['baseline']={'version':'1.2.14','accounts':ids,'knownInventories':2,'third':'INVENTORY_PENDING'}
        original=inspect(s)
        historic=lambda data:[data['legacy'],[x for x in data['operations'] if x['operationId'] in ('supply_issue60_legacy','supply_original_i17_uncertain')]]
        preserved=json.dumps(historic(original),sort_keys=True)
        screenshot(s,'baseline-three-accounts',evidence)
        print('B ISSUE60_BASELINE_REAL_DONOR_THREE_ACCOUNTS_TWO_CENSUSES_UNKNOWN_THIRD=PASS',flush=True)
        hold_background(s,False);pids=b.owned_firefox_pids(profile);b.close(s);b.require_owned_exit(profile,pids);s=None
        s=b.open_session(browser,profile)
        assert b.call('POST',f'/session/{s}/moz/addon/install',{'path':str(archive),'temporary':False},timeout=45)==b.ID
        b.close(s);s=b.open_session(browser,profile);assert not pids.intersection(b.owned_firefox_pids(profile))
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);install_native(s,oracle)
        assert b.execute(s,'return browser.runtime.getManifest().version')=='1.2.20'
        assert len(inspect(s)['accounts'])==3
        a.manage(s,ids[0]);a.wait(s,"!sh.querySelector('.account-state')?.textContent.includes('helper')",'ISSUE60_STALE_SETUP_MESSAGE_CLEARED')
        oracle.helper_down=True;command(s,ids[0],'VERIFY_ROUTE');wait_record(s,ids[0],route='HELD')
        a.wait(s,"sh.querySelector('.account-state')?.textContent.includes('helper')",'ISSUE60_NATIVE_DOWN_REAL_UI')
        oracle.helper_down=False;oracle.proxy_down=True;command(s,ids[0],'VERIFY_ROUTE');wait_record(s,ids[0],route='HELD')
        a.wait(s,"sh.querySelector('.account-state')?.textContent.includes('SOCKS proxy is unreachable')",'ISSUE60_TUNNEL_UP_PROXY_DOWN_REAL_UI')
        screenshot(s,'tunnel-up-proxy-down',evidence)
        # F1: host readback alone is insufficient. The real Check connection
        # handler must wake existing enrollment, verify the affected original
        # account route/principal, then commit a newer successful readback.
        prior_route=next(x for x in inspect(s)['accounts'] if x['accountId']==ids[0])['route']
        oracle.proxy_down=False;g.click_text(s,'Check connection','.account-dialog')
        recovered=wait_record(s,ids[0],route='PINNED',seconds=90)
        assert recovered['route']['at']>prior_route['at'] and recovered['route']['code'] is None
        evidence['f1CheckConnection']={'automaticAccountRecovery':True,'freshRouteReadback':True,'hostReadyAloneAdmits':False}
        a.wait(s,"!sh.querySelector('.account-state')?.textContent.includes('helper')",'ISSUE60_HEALTHY_RECOVERY_CLEARS_FAILURE')
        command(s,ids[0],'OPEN_LOGIN');a.wait(s,"sh.querySelector('.account-feedback')?.textContent.includes('Perchance opened')",'ISSUE60_OPEN_PROTECTED_TAB')
        command(s,ids[0],'SYNC_ACCOUNT');a.wait(s,"sh.querySelector('.account-feedback')?.textContent.includes('synchronized')",'ISSUE60_SYNC_RECOVERED_ACCOUNT')
        # An enabled Open during a held, real protected inventory request
        # accepts intent and waits for the donor lease; no ownership bypass.
        before_tabs=background(s,'return (await browser.tabs.query({})).map(t=>t.id);')
        oracle.inventory_release.clear();oracle.inventory_started.clear();oracle.delay_inventory=True
        a.command(s,'SYNC_ACCOUNT');assert oracle.inventory_started.wait(10),'real protected inventory did not enter'
        a.command(s,'OPEN_LOGIN');time.sleep(.2)
        assert not b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('.account-feedback').textContent.includes('Perchance opened')")
        oracle.delay_inventory=False;oracle.inventory_release.set()
        a.wait(s,"sh.querySelector('.account-feedback')?.textContent.includes('Perchance opened')",'ISSUE60_OPEN_AFTER_ACTUAL_READ_LEASE_RELEASE',55)
        context=next(x for x in inspect(s)['ledger']['bindings'].values() if x['accountId']==ids[0])
        opened=wait_new_protected_tab(s,before_tabs,context['contextId'])
        assert opened['id'] not in before_tabs and opened['url']=='https://perchance.org/' and opened['cookieStoreId']==context['contextId'],opened
        a.close_dialog(s)
        print('B ISSUE60_NATIVE_AND_PROXY_RECOVERY_PRIMARY_ACTIONS=PASS',flush=True)
        # The old operation has a real no-dispatch receipt and exact account
        # handoff. Rechecking it never rewrites/replays the historical request.
        a.click(s,'[data-nav=work-queue]');g.fill(s,'#queue-search','supply_issue60_legacy')
        a.wait(s,"sh.querySelector('.queue-item')?.textContent.includes('Prerequisites failed')",'ISSUE60_LEGACY_STATE_VISIBLE_IN_NEEDS_ACTION')
        g.click_text(s,'Inspect','.queue-item')
        a.wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('No creation or rename was sent')",'ISSUE60_EXACT_LEGACY_NO_DISPATCH_CONTEXT')
        g.click_text(s,'Check saved status');g.click_text(s,'Check saved status')
        a.wait(s,"sh.querySelectorAll('[data-operation-failure]').length===1",'ISSUE60_RECHECK_DOES_NOT_DUPLICATE_REASON')
        # Real Firefox should interact with the recovery action without
        # scrolling a nested offscreen form out of its enclosing drawer.
        bounds=b.execute(s,"""const sh=document.getElementById('pcms-faithful-host').shadowRoot;
const dialog=sh.querySelector('[aria-label="Recorded operation details"]');
const button=[...dialog.querySelectorAll('button')].find(x=>x.textContent.trim()==='Open account');
const rect=button.getBoundingClientRect();return {footer:!!button.closest('.drawer-foot'),
  y:rect.y,bottom:rect.bottom,viewport:innerHeight,disabled:button.disabled,
  visible:rect.height>0&&rect.y>=0&&rect.bottom<=innerHeight};""")
        assert bounds['footer'] and bounds['visible'] and not bounds['disabled'],('ISSUE60_RECOVERY_BUTTON_GEOMETRY',bounds)
        g.click_text(s,'Open account');a.wait(s,"!!sh.querySelector('.account-dialog')",'ISSUE60_CONTEXTUAL_ACCOUNT_RECOVERY_ACTION');a.close_dialog(s)
        assert not oracle.effects
        # No human Perchance tab is a requirement for background creation.
        # Remove only this disposable account's fixture tabs, retaining login.
        create_context=next(x for x in inspect(s)['ledger']['bindings'].values() if x['accountId']==ids[0])['contextId']
        background(s,"const tabs=await browser.tabs.query({cookieStoreId:"+json.dumps(create_context)+"});for(const t of tabs)if(t.url?.startsWith('https://perchance.org/'))await browser.tabs.remove(t.id);return true;")
        # Unknown third inventory still holds Automatic. A pinned healthy
        # account goes through actual durable intake and protected API writes.
        a.click(s,'[data-nav=generators]');a.click(s,'[data-action=create]')
        g.fill(s,'[aria-label="Generator names"]','issue60-created-through-ui');g.click_text(s,'Preview assignments')
        a.wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('1 need attention')",'ISSUE60_AUTOMATIC_RETAINS_UNKNOWN_INITIAL_COUNT')
        a.click(s,'[aria-label="Creation account"] option[value="'+ids[0]+'"]');g.click_text(s,'Preview assignments')
        a.wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('1 new')",'ISSUE60_PINNED_ACCOUNT_INDEPENDENT')
        g.click_text(s,'Submit batch');a.wait(s,"!!sh.querySelector('[aria-label="+'"Batch progress"'+"]')",'ISSUE60_DURABLE_BATCH_SUBMITTED')
        b.call('POST',f'/session/{s}/url',{'url':'about:blank'})
        created=drive_creation(s,'issue60-created-through-ui')
        assert created['accountId']==ids[0] and created.get('remoteId'),created
        assert [x['kind'] for x in oracle.effects]==['CREATE','RENAME'],oracle.inspect()
        assert oracle.resources['issue60-created-through-ui']['isPrivate'] is True
        assert oracle.resources['issue60-created-through-ui']['modelText']==''
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s)
        print('B ISSUE60_REAL_PRIMARY_INTAKE_PROTECTED_CREATE_RENAME_READBACK_DASHBOARD_CLOSED_GIT_OUTAGE_INDEPENDENT=PASS',flush=True)
        # Initial inventory completes in place once the provider observer is
        # healthy. Principal/Persona are retained; unknown was never zero.
        oracle.inventory_unknown.clear();a.click(s,'[data-nav=accounts]');a.manage(s,ids[2]);command(s,ids[2],'SYNC_ACCOUNT')
        wait_record(s,ids[2],'VERIFIED');a.close_dialog(s)
        # Lost ACK: an authentic forwarder exists but IPv6 remains unknown.
        # Existing good authenticated HTTP tunnels must not mask a bad token.
        route_id=b.account_command(s,{'type':'INSPECT_ACCOUNT','params':{'accountId':ids[0]}})['protection']['routeId']
        s=cold(s,browser,profile,url,oracle)
        with oracle.lock:
            removed=oracle.exits.pop(route_id,None);oracle.lost_prepare.add(route_id);oracle.ipv6_unverified.add(route_id)
        if removed:removed['server'].shutdown();removed['server'].server_close()
        before_prepare=len([x for x in oracle.native if x['command']=='prepare_exit' and x['route']==route_id])
        a.manage(s,ids[0]);command(s,ids[0],'VERIFY_ROUTE');wait_record(s,ids[0],route='HELD')
        a.wait(s,"sh.querySelector('.account-state')?.textContent.includes('unconfirmed outcome')",'ISSUE60_LOST_NATIVE_ACK_PERSISTED_HOLD')
        assert inspect(s)['pending'];assert oracle.inspect()['openAuthenticatedConnections']>0
        background(s,'return await window.__issue60.corruptPending('+json.dumps(route_id)+');');oracle.ipv6_unverified.clear()
        failures=sum(not x['accepted'] for x in oracle.auth)
        command(s,ids[0],'VERIFY_ROUTE');wait_record(s,ids[0],route='HELD')
        assert sum(not x['accepted'] for x in oracle.auth)>failures,'fresh SOCKS handshake must reject wrong pending credential despite old healthy connections'
        assert len([x for x in oracle.native if x['command']=='prepare_exit' and x['route']==route_id])==before_prepare+1
        background(s,'return await window.__issue60.restorePending();');a.close_dialog(s)
        # Backup is independent of that held account and excludes the private
        # native credential while preserving its portable uncertainty metadata.
        a.click(s,'[data-nav=settings]');a.click(s,'[data-settings=backups]');g.click_text(s,'Download complete backup')
        deadline=time.monotonic()+55;files=[]
        while time.monotonic()<deadline:
            files=list(downloads.glob('pcms-backups/*.pcms.jsonl'))
            if files:break
            time.sleep(.2)
        if not files:
            backup_receipt=background(s,"""const {openCanonicalDatabase}=await import(browser.runtime.getURL('pcms/journal.mjs'));
              const db=await openCanonicalDatabase();
              try{
                const row=await new Promise((resolve,reject)=>{
                  const tx=db.transaction('meta','readonly'),q=tx.objectStore('meta').get('backup:manual-active');
                  q.onsuccess=()=>resolve(q.result);tx.onabort=()=>reject(Error('READ_UNAVAILABLE'));
                });
                const codes=new Set(['PREPARING','BACKUP_INFLIGHT','BACKUP_RESTORE_HOLD',
                  'BACKUP_SOURCE_CUT_CHANGED','BACKUP_LOCAL_DRIFT','BACKUP_OPERATION_FAILED',
                  'BACKUP_SOURCE_INCOMPLETE_RELEASE','BACKUP_SOURCE_INCOMPLETE_ADOPTION',
                  'PORTABLE_DONOR_UNAVAILABLE','PORTABLE_COOKIE_UNAVAILABLE','DOWNLOAD_OUTCOME_UNKNOWN']);
                const statuses=new Set(['PREPARING','INTERNAL_VERIFIED','DISPATCH_POSSIBLE',
                  'DOWNLOAD_STARTED','BROWSER_REPORTED_COMPLETE','FAILED','HELD_UNCERTAIN']);
                return {status:statuses.has(row?.status)?row.status:'UNKNOWN',
                  code:codes.has(row?.code)?row.code:'OTHER'};
              }finally{db.close()}""")
            raise AssertionError({'message':'held route must not block backup','receipt':backup_receipt})
        selected=b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector('#pcms-backup-inspect-file')")
        b.call('POST',f'/session/{s}/element/{selected[a.ELEMENT]}/value',{'text':str(files[-1])})
        absence=g.oracle(s,"const file=document.getElementById('pcms-faithful-host').shadowRoot.querySelector('#pcms-backup-inspect-file').files[0],text=await file.text(),all=await browser.storage.local.get(null),row=Object.entries(all).find(([k])=>k.startsWith('personaMullvadPendingPrepare:'))?.[1];return {containsNativeCredential:!!row&&text.includes(row.password),bytes:file.size};")
        assert absence['containsNativeCredential'] is False and absence['bytes']>1000,absence
        s=cold(s,browser,profile,url,oracle);a.manage(s,ids[0]);command(s,ids[0],'VERIFY_ROUTE');wait_record(s,ids[0],route='PINNED')
        assert not inspect(s)['pending'],'full fresh token/IPv4/DNS/IPv6 observation must reconcile cold receipt'
        assert len([x for x in oracle.native if x['command']=='prepare_exit' and x['route']==route_id])==before_prepare+1,'read-only recovery must not replay native preparation'
        command(s,ids[0],'OPEN_LOGIN');command(s,ids[0],'SYNC_ACCOUNT');a.wait(s,"sh.querySelector('.account-feedback')?.textContent.includes('synchronized')",'ISSUE60_RECONCILED_ACCOUNT_OPERATES')
        time.sleep(8.2);command(s,ids[0],'VERIFY_ROUTE');wait_record(s,ids[0],route='PINNED')
        assert len([x for x in oracle.native if x['command']=='prepare_exit' and x['route']==route_id])==before_prepare+1,'8s status renewal must preserve the confirmed credential'
        screenshot(s,'cold-native-reconciled',evidence);a.close_dialog(s)
        print('B ISSUE60_LOST_NATIVE_ACK_WRONG_TOKEN_EXISTING_CONNECTION_COLD_RECONCILIATION_NO_REPLAY_BACKUP_INDEPENDENT=PASS',flush=True)
        # Explicit Change route revalidates the original session on a new
        # historical-safe exit; an observed cross-account old exit holds.
        a.manage(s,ids[0]);command(s,ids[0],'CHANGE_ROUTE');wait_record(s,ids[0],route='PINNED')
        changed=b.account_command(s,{'type':'INSPECT_ACCOUNT','params':{'accountId':ids[0]}})
        assert changed['protection']['routeId']!=route_id;assert changed['account']['identity']=='VERIFIED';a.close_dialog(s)
        oracle.wrong_exit=0;a.manage(s,ids[1]);command(s,ids[1],'VERIFY_ROUTE');wait_record(s,ids[1],route='HELD')
        oracle.wrong_exit=None;command(s,ids[1],'VERIFY_ROUTE');wait_record(s,ids[1],route='PINNED');a.close_dialog(s)
        assert [x['kind'] for x in oracle.effects]==['CREATE','RENAME']
        current=inspect(s);assert json.dumps(historic(current),sort_keys=True)==preserved
        # Actual provider persistence with a lost CREATE ACK has no proven
        # temporary identity. Preserve that uncertainty through cold restart;
        # never guess an orphan or issue CREATE/RENAME again.
        oracle.lost_create=True;a.click(s,'[data-nav=generators]');a.click(s,'[data-action=create]')
        g.fill(s,'[aria-label="Generator names"]','issue60-uncertain-create');a.click(s,'[aria-label="Creation account"] option[value="'+ids[0]+'"]');g.click_text(s,'Preview assignments')
        a.wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('1 new')",'ISSUE60_UNCERTAIN_INTAKE_PREVIEW');g.click_text(s,'Submit batch')
        a.wait(s,"!!sh.querySelector('[aria-label="+'"Batch progress"'+"]')",'ISSUE60_UNCERTAIN_BATCH_DURABLE');b.call('POST',f'/session/{s}/url',{'url':'about:blank'})
        deadline=time.monotonic()+90;uncertain=None
        while time.monotonic()<deadline:
            uncertain=next((x['record'] for x in inspect(s)['creates'] if x.get('record',{}).get('slug')=='issue60-uncertain-create'),None)
            if uncertain and uncertain['state']=='CREATE_UNCERTAIN':break
            background(s,"await browser.alarms.create('pcms-s04-creation-followup',{when:Date.now()+150});return true;");time.sleep(.4)
        assert uncertain and uncertain['state']=='CREATE_UNCERTAIN',uncertain
        assert [x['kind'] for x in oracle.effects]==['CREATE','RENAME','CREATE']
        s=cold(s,browser,profile,url,oracle)
        for _ in range(5):
            background(s,"await browser.alarms.create('pcms-s04-creation-followup',{when:Date.now()+150});return true;");time.sleep(.4)
        assert [x['kind'] for x in oracle.effects]==['CREATE','RENAME','CREATE'],'cold uncertain CREATE must not replay or infer an unrelated temporary generator'
        a.click(s,'[data-nav=work-queue]');g.fill(s,'#queue-search',uncertain['createOperationId'])
        # Search is debounced and background paging is asynchronous. A prior
        # attention row is not the requested operation, even if it is clickable.
        a.wait(s,"(()=>{const rows=[...sh.querySelectorAll('.queue-item')];return rows.length===1&&rows[0].textContent.includes('Outcome not confirmed')&&[...rows[0].querySelectorAll('button')].some(x=>x.textContent.trim()==='Inspect')})()",'ISSUE60_EXACT_UNCERTAIN_OPERATION_SEARCH_RESULT')
        g.click_text(s,'Inspect','.queue-item')
        a.wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('issue60-uncertain-create')",'ISSUE60_MODERN_UNCERTAIN_CONTEXT_EXACT_SLUG')
        g.click_text(s,'Open account');a.wait(s,"!!sh.querySelector('.account-dialog')",'ISSUE60_MODERN_UNCERTAIN_ACCOUNT_ACTION');a.close_dialog(s)
        print('B ISSUE60_REAL_CREATE_LOST_ACK_COLD_NO_REPLAY_CONTEXTUAL_ACCOUNT_RECOVERY=PASS',flush=True)
        screenshot(s,'recovered-accounts',evidence)
        evidence['schema']='pcms.issue60.integration/1';evidence['status']='PASS'
        evidence['oracle']=oracle.inspect();evidence['xpiSha256']=hashlib.sha256(pathlib.Path(archive).read_bytes()).hexdigest()
        pathlib.Path('build/issue60-ui-evidence.json').write_text(json.dumps(evidence,indent=2))
        print('B ISSUE60_UPGRADE_NATIVE_PROXY_FAILURE_RECOVERY_REAL_UI_IDB_AND_SOCKS=PASS',flush=True)
    except Exception:
        if s:
            try:screenshot(s,'failure',evidence)
            except Exception:pass
        current=oracle.inspect()
        print('B ISSUE60_FAILURE='+json.dumps({'ui':evidence.get('failure'),'native':current['native'][-25:],'effects':current['effects'],'requests':current['requests'][-18:]}),flush=True)
        raise
    finally:
        if s:
            try:hold_background(s,False)
            except Exception:pass
            b.close(s)
        oracle.close()

def main():
    archive=pathlib.Path(sys.argv[1]).resolve();browser=pathlib.Path(os.environ['FIREFOX_BINARY']);driver=pathlib.Path(os.environ['GECKODRIVER_BINARY'])
    server=subprocess.Popen([str(driver),'--port',str(b.PORT),'--allow-system-access'],stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
    try:
        for _ in range(80):
            try:
                with urlopen(b.HOST+'/status',timeout=1) as response:
                    if json.load(response).get('value',{}).get('ready'):break
            except Exception:time.sleep(.25)
        else:raise RuntimeError('ISSUE60_GECKODRIVER_UNAVAILABLE')
        with tempfile.TemporaryDirectory(prefix='pcms-issue60-') as folder:run(browser,archive,folder)
    finally:
        server.terminate()
        try:server.wait(timeout=4)
        except subprocess.TimeoutExpired:server.kill()
if __name__=='__main__':main()
