#!/usr/bin/env python3
"""J06 populated primary restore. Real donor/IDB/files/processes; offline source and owner history fixtures. No provider/private Git actions."""
import base64,json,os,pathlib,tempfile,time
import journey_backups_ui as backup
b=backup.b;g=backup.g;a=backup.a

def pick(s,selector,path):
    e=b.execute(s,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector("+json.dumps(selector)+")")
    b.call('POST',f'/session/{s}/element/{e[a.ELEMENT]}/value',{'text':str(path)})
def port(s,name,message):
    print('B J06_TYPED_BOUNDARY '+name+' '+message.get('type',''),flush=True)
    return g.oracle(s,"return await new Promise(resolve=>{const p=browser.runtime.connect({name:"+json.dumps(name)+"});p.onMessage.addListener(r=>{resolve(r);try{p.disconnect()}catch{}});p.onDisconnect.addListener(()=>resolve({code:'PORT_DISCONNECTED'}));p.postMessage("+json.dumps(message)+")})")
def snapshot(s):
    return g.oracle(s,"const {readProtectedDonorSnapshot}=await import('./donor-snapshot.mjs');return await readProtectedDonorSnapshot(browser)")
def rows(s):
    return g.oracle(s,"const {openCanonicalDatabase}=await import('./journal.mjs');const db=await openCanonicalDatabase();const data=await new Promise((resolve,reject)=>{const out=[],t=db.transaction('meta','readonly');t.oncomplete=()=>resolve(out);t.onabort=reject;t.objectStore('meta').openCursor().onsuccess=e=>{const c=e.target.result;if(c){out.push(c.value);c.continue()}}});db.close();return {data}")['data']
def apply_selected(s,saved,downloads,unchecked=False):
    pick(s,'#pcms-restore-archive',saved);g.click(s,'#pcms-restore-preview')
    backup.wait(s,"!sh.querySelector('#pcms-restore-options').hidden&&!!sh.querySelector('#pcms-restore-personas select')",'J06_REPEATED_OR_FRESH_PRIMARY_INSPECTION')
    chosen=b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;return sh.querySelector('#pcms-restore-accounts input').checked")
    if unchecked:assert chosen is False,'REMOVED_OR_FRESH_ACCOUNT_WAS_PRESELECTED'
    if not chosen:g.click(s,'#pcms-restore-accounts input')
    g.change(s,'#pcms-restore-mode','replace');g.change(s,'#pcms-restore-personas select','__create__')
    before=set(downloads.glob('pcms-backups/*.pcms.jsonl'));g.click(s,'#pcms-restore-save-checkpoint')
    until=time.monotonic()+90;added=[]
    while time.monotonic()<until:
        added=list(set(downloads.glob('pcms-backups/*.pcms.jsonl'))-before)
        if added and b.execute(s,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;return !sh.querySelector('#pcms-restore-save-checkpoint').disabled&&sh.querySelector('#pcms-restore-copy-status').textContent.includes('Safety copy saved')"):break
        time.sleep(.15)
    assert len(added)==1,added
    pick(s,'#pcms-restore-checkpoint',added[0]);g.click(s,'#pcms-restore-verify')
    backup.wait(s,"sh.querySelector('#pcms-restore-status')?.textContent.includes('Review the import above')",'J06_FRESH_OR_REMOVAL_SAFETY_FILE_REOPEN')
    g.click(s,'#pcms-restore-consent');g.click(s,'#pcms-restore-apply')
    backup.wait(s,"!sh.querySelector('#pcms-restore-reactivate-box').hidden",'J06_FRESH_OR_REMOVAL_INACTIVE_APPLY',90)

def run_fresh(browser,archive,folder,saved,evidence):
    profile=pathlib.Path(folder)/'j06-fresh-destination';profile.mkdir();downloads=pathlib.Path(folder)/'j06-fresh-downloads';downloads.mkdir()
    (profile/'user.js').write_text('user_pref("xpinstall.signatures.required",false);\nuser_pref("network.dns.forceResolve","127.0.0.1");\nuser_pref("browser.download.folderList",2);\nuser_pref("browser.download.useDownloadDir",true);\nuser_pref("browser.download.dir",'+json.dumps(str(downloads))+');\n')
    s=b.open_session(browser,profile)
    try:assert b.call('POST',f'/session/{s}/moz/addon/install',{'path':str(archive),'temporary':False},timeout=45)==b.ID
    finally:b.close(s)
    s=b.open_session(browser,profile)
    try:
        uuid=b.addons_uuid(profile);url=f'moz-extension://{uuid}/pcms/index.html#settings'
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);backup.wait(s,"!!sh.querySelector('[data-settings=backups]')",'J06_ACTUAL_FRESH_PROFILE');g.click(s,'[data-settings=backups]')
        apply_selected(s,saved,downloads,unchecked=True)
        current=rows(s);account=next(r['account'] for r in current if r.get('key')=='account:account_j06_restore')
        assert account['state']=='VERIFICATION_PENDING' and account.get('bindingId') is None
        original=next(r['adoption']['original'] for r in current if r.get('key')=='adoption:j06-original');assert original['blobs'][-1]['base64']=='AP+AAQ=='
        assert (port(s,'pcms-i16-restore',{'action':'STATUS'})).get('held') is True
        backup.capture(s,'fresh-profile-source-restore',evidence)
        print('B J06_ACTUAL_FRESH_PROFILE_EXPLICIT_ACCOUNT_SELECTION_FULL_SOURCE_RESTORE=PASS',flush=True)
    finally:b.close(s)

def run(browser,archive,folder):
    profile=pathlib.Path(folder)/'j06-populated-restore';profile.mkdir();downloads=pathlib.Path(folder)/'j06-restore-downloads';downloads.mkdir()
    (profile/'user.js').write_text('user_pref("xpinstall.signatures.required",false);\nuser_pref("network.dns.forceResolve","127.0.0.1");\nuser_pref("browser.download.folderList",2);\nuser_pref("browser.download.useDownloadDir",true);\nuser_pref("browser.download.dir",'+json.dumps(str(downloads))+');\n')
    s=b.open_session(browser,profile)
    try:assert b.call('POST',f'/session/{s}/moz/addon/install',{'path':str(archive),'temporary':False},timeout=45)==b.ID
    finally:b.close(s)
    s=b.open_session(browser,profile);evidence={'scope':'Real primary restore, guarded donor commit, source bytes, physical safety copy and restart. Canonical owner/exit history is an offline fixture; no provider/private Git proof.'}
    try:
        uuid=b.addons_uuid(profile);url=f'moz-extension://{uuid}/pcms/index.html#settings'
        made=b._options(s,uuid,"await send({type:'CREATE_PERSONA',input:{name:'J06 source Persona',routeId:'__block__',allowDirect:false,profile:{killSwitch:true,blockLocalNetwork:true}}});const snap=await send({type:'GET_SNAPSHOT'});return Object.values(snap.state.profiles).find(p=>p.name==='J06 source Persona')")
        assert made.get('personaUid'),made
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s)
        seeded=g.oracle(s,"const {openCanonicalDatabase}=await import('./journal.mjs');const {createAccountStore}=await import('./accounts.mjs');const db=await openCanonicalDatabase();const out=await createAccountStore(db).apply({type:'ENROLL',accountId:'account_j06_restore',personaUid:"+json.dumps(made['personaUid'])+",expectedRevision:0});db.close();return out")
        assert seeded.get('ok'),seeded
        backup.wait(s,"!!sh.querySelector('[data-settings=backups]')",'J06_POPULATED_UI_READY')
        upgraded=port(s,'pcms-i03-accounts',{'type':'UPGRADE_ACCOUNT','params':{'accountId':'account_j06_restore','expectedRevision':1}})
        assert upgraded.get('code') not in ['PERSONA_TAG_UNCONFIRMED','UNTRUSTED_SENDER'],upgraded
        source=snapshot(s);source_profile=source['state']['profiles'][made['containerId']];binding=source_profile.get('pcmsBindingId');assert binding,source_profile
        # Exact source closure is produced by the production byte verifier.
        seed_code="""
const {openCanonicalDatabase}=await import('./journal.mjs');const {verifyOriginal}=await import('./adoption.mjs');
const db=await openCanonicalDatabase(),accountId='account_j06_restore',personaUid=UID,H='a'.repeat(64);
const bytes=new Uint8Array([0,255,128,1]),sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
const original=await verifyOriginal({ok:true,source:'DONOR_GUARDED_ORIGINAL_READBACK',slug:'j06-original',accountId,personaUid,principalFingerprint:H,ownerResult:'IS_OWNER',visibility:'PUBLIC',remotePublicId:'public_j06_original',observedAt:100,pjs:'output\\n  Exact original é\\n',html:'<p>Exact original</p>\\n',assets:[{path:'src/binary.dat',base64:btoa(String.fromCharCode(...bytes)),size:4,sha256}]},{slug:'j06-original',accountId,visibility:'PUBLIC'},{personaUid,identity:{principalFingerprint:H}});
if(!original.ok)return original;
await new Promise((ok,bad)=>{const t=db.transaction('meta','readwrite'),m=t.objectStore('meta');
m.put({key:'adoption:j06-original',adoption:{slug:'j06-original',accountId,personaUid,bindingVersion:1,accountRevision:1,revision:1,principalFingerprint:H,remotePublicId:'public_j06_original',original,archiveState:'ARCHIVE_PENDING'}});
m.put({key:'inventory:j06-original',generator:{slug:'j06-original',accountId,personaUid,bindingVersion:1,accountRevision:1,revision:1,ownerState:'OBSERVED_OWNER',visibility:'PUBLIC',remoteId:'public_j06_original',source:'SOURCE_VERIFIED'}});
m.put({key:'source-link:j06-original',link:{slug:'j06-original',accountId,personaUid,bindingVersion:1,remoteId:'public_j06_original',folder:'generators/j06-original'}});
m.put({key:'network:s01:exit-ownership-v1',schema:2,revision:1,owners:{'IPv4:8.8.8.8':accountId},bindings:{[BINDING]:{bindingId:BINDING,accountId,personaUid,contextId:CONTEXT,routeId:'route_j06_offline_history',pin:'HELD',history:[]}}});
t.oncomplete=ok;t.onabort=bad;});db.close();
await browser.storage.local.set({pcmsR4MissingGitFolders:{repositoryId:'1234',slugs:['j06-missing']}});
return {ok:true,fingerprint:original.fingerprint};
""".replace('UID',json.dumps(made['personaUid'])).replace('BINDING',json.dumps(binding)).replace('CONTEXT',json.dumps(made['containerId']))
        ordinary_delete=b._options(s,uuid,"""
const id=CONTEXT,before=await send({type:'GET_SNAPSHOT'});let reply;
try{reply=await send({type:'DELETE_PERSONA',profileId:id})}catch(e){reply={error:String(e)}}
const after=await send({type:'GET_SNAPSHOT'}),containers=await browser.contextualIdentities.query({});
return {reply,unchanged:JSON.stringify(before.state.profiles[id])===JSON.stringify(after.state.profiles[id]),containerPresent:containers.some(c=>c.cookieStoreId===id)};
""".replace('CONTEXT',json.dumps(made['containerId'])))
        assert ordinary_delete['unchanged'] and ordinary_delete['containerPresent'] and not ordinary_delete['reply'].get('removed'),ordinary_delete
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s)
        original=g.oracle(s,seed_code);assert original.get('ok'),original
        source_fixture=pathlib.Path(__file__).with_name('fixtures').joinpath('j06-restored-source.mjs').read_text().replace('export async function','async function')
        seeded_source=g.oracle(s,source_fixture+';return await seedRestoredSourceFixture();');assert seeded_source.get('ok'),seeded_source
        donor_sources=b._options(s,uuid,"""
const snap=await send({type:'GET_SNAPSHOT'}),state=structuredClone(snap.state);
const {normalizeScript,normalizeWorkflow}=await import('../lib/storage.js');
state.scripts.j06_source=normalizeScript({id:'j06_source',name:'J06 exact source',code:'// Exact donor source é\\n',enabled:false,autoRun:false,profileIds:[CONTEXT]},'j06_source');
state.workflows.j06_flow=normalizeWorkflow({id:'j06_flow',name:'J06 source workflow',enabled:false,steps:[{type:'script',profileId:CONTEXT,scriptIds:['j06_source']}]},'j06_flow');
const preview=await send({type:'PREVIEW_STATE_CHANGE',state});
if(!preview?.previewId)return {error:'PREVIEW_NOT_OBSERVED',preview};
const approval=await send({type:'AUTHORIZE_SECURITY_PREVIEW',previewId:preview.previewId,approvedDelta:preview.delta});
const committed=await send({type:'COMMIT_STATE_PREVIEW',authorizationId:preview.previewId});
const after=await send({type:'GET_SNAPSHOT'});
if(!after?.state?.scripts?.j06_source||!after?.state?.workflows?.j06_flow)return {error:'SOURCE_COMMIT_NOT_OBSERVED',approval,committed,preview};
return {ok:true};
""".replace('CONTEXT',json.dumps(made['containerId'])))
        assert donor_sources.get('ok'),donor_sources
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s)
        backup.wait(s,"!!sh.querySelector('[data-settings=backups]')",'J06_POPULATED_PRIMARY')
        g.click(s,'[data-settings=backups]');g.click_text(s,'Download complete backup')
        backup.wait(s,"sh.querySelector('#page')?.textContent.includes('Backup saved in your Firefox downloads')",'J06_POPULATED_SOURCE_COMPLETE_FILE',90)
        saved=next(downloads.glob('pcms-backups/*.pcms.jsonl'));assert 'Exact original' in saved.read_text() or saved.stat().st_size>1000
        # A later destination Persona/source is unrelated to this older backup.
        unrelated=b._options(s,uuid,"await send({type:'CREATE_PERSONA',input:{name:'J06 unrelated Persona',routeId:'__block__',allowDirect:false,profile:{killSwitch:true,blockLocalNetwork:true}}});const snap=await send({type:'GET_SNAPSHOT'});return Object.values(snap.state.profiles).find(p=>p.name==='J06 unrelated Persona')")
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);g.click(s,'[data-settings=backups]')
        baseline=snapshot(s);scripts_before=baseline['state']['scripts'];workflows_before=baseline['state']['workflows'];unrelated_before=baseline['state']['profiles'][unrelated['containerId']]
        pick(s,'#pcms-restore-archive',saved);g.click(s,'#pcms-restore-preview')
        backup.wait(s,"!sh.querySelector('#pcms-restore-options').hidden&&!!sh.querySelector('#pcms-restore-personas select')",'J06_ACTUAL_RESTORE_FILE_INSPECTION')
        g.change(s,'#pcms-restore-mode','replace');g.change(s,'#pcms-restore-personas select','__create__')
        g.click(s,'#pcms-restore-save-checkpoint')
        backup.wait(s,"sh.querySelector('#pcms-restore-copy-status')?.textContent.includes('Safety copy saved')",'J06_OWNED_PHYSICAL_SAFETY_COPY',90)
        copies=list(downloads.glob('pcms-backups/*.pcms.jsonl'));assert len(copies)==2,copies
        checkpoint=next(p for p in copies if p!=saved);pick(s,'#pcms-restore-checkpoint',checkpoint)
        g.click(s,'#pcms-restore-verify')
        backup.wait(s,"sh.querySelector('#pcms-restore-status')?.textContent.includes('Review the import above')",'J06_SAFETY_COPY_DISK_READBACK_PLAN')
        g.click(s,'#pcms-restore-consent');g.click(s,'#pcms-restore-apply')
        backup.wait(s,"!sh.querySelector('#pcms-restore-reactivate-box').hidden",'J06_POPULATED_REAL_DONOR_AND_CANONICAL_APPLY',90)
        restored=rows(s);account=next(r['account'] for r in restored if r.get('key')=='account:account_j06_restore')
        after=snapshot(s);target=next(p for p in after['state']['profiles'].values() if p.get('personaUid')==account['personaUid'])
        assert account['personaUid']!=made['personaUid'] and account.get('bindingId') is None and account['state']=='VERIFICATION_PENDING',account
        assert target.get('pcmsBindingId') is None and target['routeId']=='__block__',target
        assert after['state']['profiles'][unrelated['containerId']]==unrelated_before,'UNRELATED_PERSONA_CHANGED'
        adoption=next(r['adoption'] for r in restored if r.get('key')=='adoption:j06-original');assert adoption['original']['fingerprint']==original['fingerprint']
        assert adoption['original']['blobs'][-1]['base64']=='AP+AAQ=='
        assert adoption['personaUid']==account['personaUid'] and adoption['bindingVersion']==account['bindingVersion']
        exits=next(r for r in restored if r.get('key')=='network:s01:exit-ownership-v1');assert exits['owners']['IPv4:8.8.8.8']=='account_j06_restore'
        assert binding not in exits['bindings'] and exits['restoredBindingHistory'][binding]['destinationRetired'] is True
        assert after['state']['scripts']['j06_source']==scripts_before['j06_source']
        assert after['state']['workflows']['j06_flow']==workflows_before['j06_flow']
        assert len(after['state']['scripts'])==2*len(scripts_before) and len(after['state']['workflows'])==2*len(workflows_before),{'scripts':after['state']['scripts'],'workflows':after['state']['workflows']}
        imported_script=next(v for k,v in after['state']['scripts'].items() if k!='j06_source')
        assert imported_script['code']==scripts_before['j06_source']['code'] and imported_script['enabled'] is False
        backup.capture(s,'populated-restore-held',evidence)
        # Real OS restart retains the completed inactive guard, without replay.
        before=b.owned_firefox_pids(profile);b.close(s);b.require_owned_exit(profile,before);s=None
        s=b.open_session(browser,profile);assert not before.intersection(b.owned_firefox_pids(profile))
        b.call('POST',f'/session/{s}/url',{'url':url});b.wait_donor_ready(s);backup.wait(s,"!!sh.querySelector('[data-settings=backups]')",'J06_POPULATED_RESTART');g.click(s,'[data-settings=backups]')
        backup.wait(s,"!sh.querySelector('#pcms-restore-reactivate-box').hidden",'J06_RESTORE_INACTIVE_GUARD_SURVIVES_PROCESS')
        assert len(list(downloads.glob('pcms-backups/*.pcms.jsonl')))==2
        g.click(s,'#pcms-restore-predecessor');g.click(s,'#pcms-restore-reactivate')
        backup.wait(s,"sh.querySelector('#pcms-restore-status')?.textContent.includes('PCMS can continue')",'J06_EXPLICIT_SAFE_CONTINUATION')
        current=next(r['account'] for r in rows(s) if r.get('key')=='account:account_j06_restore')
        retry=port(s,'pcms-i03-accounts',{'type':'UPGRADE_ACCOUNT','params':{'accountId':'account_j06_restore','expectedRevision':current['revision']}})
        assert retry.get('code') not in ['BINDING_PERSONA_CONFLICT','EXIT_LEDGER_MISSING','ACCOUNT_HAS_OTHER_BINDING','PERSONA_TAG_UNCONFIRMED','UNTRUSTED_SENDER'],retry
        final=next(r['account'] for r in rows(s) if r.get('key')=='account:account_j06_restore');profile_after=snapshot(s)['state']['profiles'][target['containerId']]
        assert final['bindingId']==profile_after['pcmsBindingId'] and final['personaUid']==profile_after['personaUid']
        installed_source=g.oracle(s,source_fixture+';return await installRestoredSourceFixture();');assert installed_source.get('ok'),installed_source
        g.click(s,'[data-nav=work-queue]')
        backup.wait(s,"[...sh.querySelectorAll('button')].some(x=>x.textContent==='Recover restored source')",'J06_RESTORED_READY_PRIMARY_ACTION')
        g.click_text(s,'Recover restored source');g.click_text(s,'Recheck restored source')
        backup.wait(s,"sh.querySelector('[role=dialog]')?.textContent.includes('Restored source is verified')",'J06_CURRENT_SOURCE_REQUALIFICATION_REAL_UI')
        qualified=g.oracle(s,'return await window.__j06source.inspect()');assert qualified['stage']['personaUid']==final['personaUid'] and qualified['stage']['nonce']!='1'*32 and not qualified.get('job') and not qualified.get('release'),qualified
        prepared=g.oracle(s,'return await window.__j06source.prepare()');assert prepared.get('ok'),prepared
        qualified=g.oracle(s,'return await window.__j06source.inspect()');assert qualified['job']['state']=='PENDING_NATIVE_SESSION' and qualified['job'].get('verifiedFinal') is None,qualified
        assert any(e['kind']=='ACTUAL_OWNED_TAB_CREATED' for e in qualified['events']),qualified
        evidence['restored-source-requalification']=qualified
        backup.capture(s,'restored-source-new-untested-job',evidence)
        g.oracle(s,'await window.__j06source.close();return {ok:true}')
        g.click(s,'[role=dialog] .drawer-head button')
        g.click(s,'[data-nav=settings]');g.click(s,'[data-settings=backups]')
        final=next(r['account'] for r in rows(s) if r.get('key')=='account:account_j06_restore')
        archived=port(s,'pcms-i03-accounts',{'type':'ARCHIVE','params':{'accountId':'account_j06_restore','expectedRevision':final['revision']}})
        assert archived.get('ok'),archived
        local_archived=next(r['account'] for r in rows(s) if r.get('key')=='account:account_j06_restore')
        removed=port(s,'pcms-i03-accounts',{'type':'REMOVE_ACCOUNT','params':{'accountId':'account_j06_restore','expectedRevision':local_archived['revision'],'explicitRemoval':True,'deletePersona':True}})
        assert removed.get('ok'),removed
        tombstone=next(r['account'] for r in rows(s) if r.get('key')=='account:account_j06_restore')
        assert tombstone['state']=='ARCHIVED' and tombstone['removed'] and tombstone['personaUid'] is None,tombstone
        assert target['containerId'] not in snapshot(s)['state']['profiles']
        # C-74 uses the actual ARCHIVED+removed tombstone, not an invented REMOVED state.
        apply_selected(s,saved,downloads,unchecked=True)
        recovered=next(r['account'] for r in rows(s) if r.get('key')=='account:account_j06_restore')
        assert recovered['state']=='VERIFICATION_PENDING' and recovered.get('removed') is None and recovered['restoredRemovalRevision']==tombstone['revision'],recovered
        backup.capture(s,'explicit-removed-account-recovery',evidence)
        evidence['actual-holds']={'initialUpgrade':upgraded,'restoredUpgrade':retry,'liveProvider':'NOT_TESTED','privateGit':'NOT_TESTED'}
        backup.capture(s,'restore-continuation',evidence)
        pathlib.Path('build/j06-populated-restore.json').write_text(json.dumps(evidence,indent=2))
        print('B J06_POPULATED_PRIMARY_PHYSICAL_SAFETY_COPY_SOURCE_BINARY_UID_TAG_HISTORY_UNRELATED_PERSONA_RESTART_RECOVERY=PASS; PROVIDER_GIT=OFFLINE_NOT_TESTED',flush=True)
    finally:
        if s:b.close(s)
    run_fresh(browser,archive,folder,saved,evidence)
    pathlib.Path('build/j06-populated-restore.json').write_text(json.dumps(evidence,indent=2))
if __name__=='__main__':
    # Reuse the scoped standalone loopback-driver lifecycle.
    backup.run=run;backup.main()
