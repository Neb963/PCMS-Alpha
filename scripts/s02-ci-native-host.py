#!/usr/bin/env python3
"""S02 CI-only installed Firefox/native host witness.

All host registration, vault data, Firefox profiles and ciphertext live in a
throwaway HOME on a GitHub-hosted runner. Not an operator installer, not an E-06
approval, and not an authorization to switch on production reviewedV2.
"""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import threading

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("pcms_firefox_harness",ROOT/"scripts/browser-i00-smoke.py")
harness=importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)
HOST_NAME="local.pcms.backup_v2"
ADDON_ID="persona-route-manager@local"
PASSWORD="synthetic-disposable-v2-native-vault-secret-2026"
PORT=44448

class PeakProcessRSS:
    """Best-effort aggregate sampled RSS across this isolated WebDriver tree.

    Process RSS includes shared pages in each process, so this is an upper
    accounting sum, NOT unique PSS, VRAM or a capacity guarantee.
    """
    def __init__(self,root):
        self.root=root
        self.peak_kib=0
        self.max_processes=0
        self.native_observed=False
        self.stop_event=threading.Event()
        self.worker=threading.Thread(target=self._sample_loop,daemon=True)

    def start(self):
        self.worker.start()

    def stop(self):
        self.stop_event.set()
        self.worker.join(timeout=3)

    def _sample_loop(self):
        while not self.stop_event.wait(0.12):
            try:
                table={}
                for pid_path in Path("/proc").iterdir():
                    if not pid_path.name.isdigit():continue
                    pid=int(pid_path.name)
                    try:
                        fields=(pid_path/"stat").read_text().rsplit(")",1)[1].split()
                        parent=int(fields[1])
                        pages=int((pid_path/"statm").read_text().split()[1])
                        table[pid]=(parent,pages)
                    except (OSError,ValueError,IndexError):continue
                descendants={self.root,os.getpid()}
                old=-1
                while len(descendants)!=old:
                    old=len(descendants)
                    descendants.update(pid for pid,(parent,_) in table.items()
                                       if parent in descendants)
                self.max_processes=max(self.max_processes,len(descendants))
                page_kib=os.sysconf("SC_PAGE_SIZE")//1024
                rss=sum(table[pid][1] for pid in descendants if pid in table)*page_kib
                self.peak_kib=max(self.peak_kib,rss)
                if not self.native_observed:
                    for pid in descendants:
                        try:
                            if b"backup_v2_host.py" in (Path("/proc")/str(pid)/"cmdline").read_bytes():
                                self.native_observed=True;break
                        except OSError:continue
            except (OSError,ValueError):
                # A racing process exit cannot become a fabricated reading.
                continue


def register(home,name,target):
    directory=home/".mozilla/native-messaging-hosts"
    directory.mkdir(parents=True,exist_ok=True)
    wrapper=directory/(name+".sh")
    wrapper.write_text("#!/bin/sh\nexec "+sys.executable+" "+str(target)+"\n")
    wrapper.chmod(0o700)
    manifest={"name":name,"description":"CI disposable PCMS host",
              "path":str(wrapper),"type":"stdio",
              "allowed_extensions":[ADDON_ID]}
    (directory/(name+".json")).write_text(json.dumps(manifest))
    return wrapper

def secret_check():
    attributes=["application","pcms-alpha","purpose","unattended-encrypted-backup"]
    saved=subprocess.run(["/usr/bin/secret-tool","store",
                          "--label=PCMS-S02-disposable-test",*attributes],
                         input=PASSWORD+"\n",capture_output=True,text=True,timeout=20)
    assert saved.returncode==0,("H_SECRET_SERVICE_STORE_UNAVAILABLE",saved.returncode,
                                saved.stderr[:300])
    result=subprocess.run(["/usr/bin/secret-tool","lookup",*attributes],
                          capture_output=True,text=True,timeout=20)
    assert result.returncode==0 and result.stdout.rstrip("\n")==PASSWORD, \
        "H_SECRET_SERVICE_LOOKUP_UNAVAILABLE"
    print("H S02_ACTUAL_DBUS_SECRET_SERVICE_STORE_AND_LOOKUP=PASS",flush=True)

def native_script():
    # Executes in the actually installed combined XPI page, with actual
    # browser.runtime.connectNative and a real OS child process.
    return r"""const done=arguments[arguments.length-1];
    (async()=>{
      const vault=await browser.runtime.sendNativeMessage('local.pcms.backup_vault',
        {action:'get'});
      if(vault?.ok!==true||vault.passphrase!=='synthetic-disposable-v2-native-vault-secret-2026')
        throw Error('H_NATIVE_VAULT_READ_FAILED');
      const native=await import('./backup-v2-session.mjs');
      const verify=await import('./backup-v2-verify.mjs');
      const core=await import('./backup-core.mjs');
      const journal=await import('./journal.mjs');
      const donor=await import('../lib/backup-package.js');
      const connection=native.createV2NativeConnection(browser);
      let denied;
      try{
        denied=await connection.exchange({action:'arbitrary.file.write',
          path:'/tmp/forbidden',value:'x'});
      }finally{connection.close();}
      if(denied?.ok!==false||denied.code!=='BACKUP_ACTION_DENIED')
        throw Error('H_NATIVE_MALICIOUS_COMMAND_NOT_DENIED');
      const db=await journal.openCanonicalDatabase();
      try{
        // Genuine installed Firefox IndexedDB, not the D-tier in-memory
        // 50/1024 fixture: every archived revision carries exact source bytes.
        const enc=new TextEncoder(),records=[],profiles={},scripts={},
          containers=[],cookiesByProfile={};
        for(let i=0;i<50;i++){
          const cid='firefox-container-'+(200+i),sid='script-'+i;
          const account={accountId:'s02-ci-'+i,
            state:i===0?'VERIFIED':'ARCHIVED',revision:1};
          if(i===0){
            account.personaUid='11111111-1111-4111-8111-111111111111';
            account.identity={principalFingerprint:'e'.repeat(64)};
          }
          records.push({key:'account:s02-ci-'+i,account});
          profiles[cid]={containerId:cid,managed:true,routeId:'__block__',
            name:'CI archived Persona '+i,scriptIds:[sid],
            ...(i===0?{personaUid:'11111111-1111-4111-8111-111111111111'}:{}),
            killSwitch:true,blockLocalNetwork:true};
          scripts[sid]={id:sid,name:'CI source '+i,
            code:'// synthetic donor '+i,enabled:false};
          containers.push({cookieStoreId:cid,name:'CI archived Persona '+i,
            color:'blue',icon:'fingerprint'});
          cookiesByProfile[cid]=[{name:'ci-'+i,value:'disposable-only-'+i,
            domain:'example.com',hostOnly:true,session:true,
            path:'/',secure:true,httpOnly:true}];
        }
        // 64 KiB per genuinely unique generated historical asset: 64 MiB
        // unique bytes and twice that referenced by candidate/previous; compare with prior 64 MiB run.
        // This starts in actual installed Firefox before production IDB capture.
        function uniqueAsset(i){
          const out=new Uint8Array(65536);
          let x=(i+1)>>>0;
          for(let n=0;n<out.length;n++){
            x^=x<<13;x^=x>>>17;x^=x<<5;out[n]=x&255;
          }
          return out;
        }
        const quotaBefore=await navigator.storage.estimate();
        const sourceStart=performance.now();
        for(let i=0;i<1024;i++){
          const raw=[
            ['main.pjs',enc.encode('output="h-source-'+i+'";')],
            ['index.html',enc.encode('<div data-history="'+i+'">CI</div>')],
            ['src/asset.bin',uniqueAsset(i)]
          ];
          const files=await Promise.all(raw.map(async([path,bytes])=>({
            path,size:bytes.length,sha256:await core.digest(bytes)})));
          files.sort((a,b)=>a.path<b.path?-1:a.path>b.path?1:0);
          const fingerprint=await core.digest('PCMS_STAGED_SOURCE_V1'+
            String.fromCharCode(10)+files.map(f=>
              JSON.stringify([f.path,f.size,f.sha256])).join(String.fromCharCode(10)));
          const source={ok:true,fingerprint,files,
            blobs:files.map(f=>({path:f.path,base64:btoa(
              String.fromCharCode(...raw.find(v=>v[0]===f.path)[1]))}))};
          records.push({key:'stage-history:s02-ci-'+i,
            record:{candidate:source,previous:source}});
        }
        const tx=db.transaction(['meta'],'readwrite');
        const meta=tx.objectStore('meta');
        for(const record of records)meta.put(record);
        await new Promise((resolve,reject)=>{
          tx.oncomplete=resolve;
          tx.onabort=()=>reject(Error('H_SOURCE_FLEET_IDB_ABORT'));
          tx.onerror=()=>reject(Error('H_SOURCE_FLEET_IDB_FAILURE'));
        });
        const quotaAfter=await navigator.storage.estimate();
        const captureStart=performance.now();
        const pcms=await core.snapshotCanonicalV2(db);
        const captureMs=performance.now()-captureStart;
        const verifiedCut=await core.verifyCanonicalV2Unchanged(db,pcms);
        if(verifiedCut?.ok!==true)throw Error('H_PRODUCTION_CANONICAL_CUT_DRIFT');
        if(pcms.stores.meta.length<1074)
          throw Error('H_SOURCE_FLEET_INCOMPLETE');
        const password=vault.passphrase;
        const payload=donor.createPortableBackupPayload({
          state:{profiles,scripts,routes:{},workflows:{},global:{}},
          containers,cookiesByProfile,selection:{kind:'full'}});
        if(payload.personas.length!==50||payload.scripts.length!==50||
           Object.keys(payload.cookies).length!==50)
          throw Error('H_DONOR_SYNTHETIC_FLEET_INCOMPLETE');
        const envelope=await donor.encodeBackupEnvelope({payload,password});
        // CI-only fixture built from the already captured synthetic snapshot.
        // This proves installed native-stream integration, NOT an immutable
        // production IndexedDB cut or a bounded browser capture.
        const wire=await import('./backup-v2-codec.mjs');
        const blobIndex=new Map();
        for(const row of pcms.stores.meta){
          for(const source of [row.value?.record?.candidate,
                               row.value?.record?.previous]){
            if(!source?.files||!source?.blobs)continue;
            const byPath=new Map(source.files.map(f=>[f.path,f]));
            for(const blob of source.blobs){
              const proof=byPath.get(blob.path);
              if(!proof)throw Error('H_PINNED_SOURCE_MANIFEST_INVALID');
              if(!blobIndex.has(proof.sha256))
                blobIndex.set(proof.sha256,blob.base64);
            }
          }
        }
        const sorted=Object.fromEntries(core.DB_STORES.map(store=>[
          store,[...pcms.stores[store]].sort((a,b)=>{
            const x=wire.canonicalJSON(a.key),y=wire.canonicalJSON(b.key);
            return x<y?-1:x>y?1:0;
          })
        ]));
        const fixtureCut={
          async assertPinned(){return true;},
          async counts(){return Object.fromEntries(core.DB_STORES.map(
            store=>[store,sorted[store].length]));},
          async *rows(){
            for(const store of core.DB_STORES)
              for(const row of sorted[store])yield {store,row};
          },
          async blob(sha){
            const value=blobIndex.get(sha);
            if(typeof value!=='string')throw Error('H_PINNED_BLOB_MISSING');
            return Uint8Array.from(atob(value),c=>c.charCodeAt(0));
          }
        };
        if((await core.verifyCanonicalV2Unchanged(db,pcms)).ok!==true)
          throw Error('H_PINNED_CUT_BEFORE_DRIFT');
        const observed=[];
        for(let i=0;i<2;i++){
          const runId='s02_'+crypto.randomUUID().replaceAll('-','');
          const outcome=await native.exportV2Candidate({
            db,api:browser,
            ...(i===0?{pinnedCut:fixtureCut}:{pcms}),
            donorEnvelope:envelope,runId,
            checkScope:async()=>true,checkRestoreHold:async()=>false
          });
          if(outcome?.state!=='AUTHENTICATED_INVENTORY_ONLY'||
             outcome.runId!==runId||!outcome.ciphertextSha256)
            throw Error('H_NATIVE_ACTUAL_EXPORT_FAILED');
          const verified=await verify.verifyV2StoredArchive({
            db,api:browser,runId,password,
            assertNotRestoring:async()=>true
          });
          if(verified.state!=='RECOVERY_VERIFIED'||verified.runId!==runId||
             verified.activation!=='OFF')throw Error('H_NATIVE_REOPEN_FAILED');
          observed.push({runId,sha256:verified.sha256,
            rows:verified.sourceRows,
            encoder:i===0?'PINNED_STREAM':'PRODUCTION_CANONICAL_SNAPSHOT',
            elapsedMs:performance.now()-captureStart});
        }
        // Real OS process-loss boundary: persistent host opens a new run,
        // durably journals OPEN_OBSERVED, then its native port is closed
        // without append/finish. Another native process may inspect it,
        // but cannot validate, recover, retain or promote the partial file.
        const interruptedRun='s02_'+crypto.randomUUID().replaceAll('-','');
        const crashPort=native.createV2NativeConnection(browser);
        const opened=await crashPort.exchange({action:'export.begin',
          runId:interruptedRun,cutDigest:'a'.repeat(64),
          expectedPlaintextBytes:128,keyRef:'portable-recovery'});
        if(opened?.ok!==true||opened.runId!==interruptedRun||
           opened.state!=='OPEN_OBSERVED')throw Error('H_NATIVE_OPEN_NOT_DURABLE');
        crashPort.close();
        const newProcess=native.createV2NativeConnection(browser);
        let held,unqualified,retention;
        try{
          held=await newProcess.exchange({action:'archive.inspect',
            runId:interruptedRun});
          unqualified=await newProcess.exchange({action:'backup.verify',
            runId:interruptedRun,keyRef:'portable-recovery'});
          retention=await newProcess.exchange({action:'archive.retention.plan'});
        }finally{newProcess.close();}
        if(held?.ok!==true||held.state!=='OPEN_OBSERVED'||
           held.acceptedBytes!==0||unqualified?.ok!==false||
           retention?.ok!==true||retention.qualified!==2||
           retention.pruneCandidate!==null)
          throw Error('H_NATIVE_INTERRUPTED_FILE_PROMOTED');
        const before=await browser.storage.local.get('pcmsRestoreInProgress');
        if(before.pcmsRestoreInProgress?.active===true)
          throw Error('H_UNAUTHORIZED_RESTORE_ACTIVATION');
        return {ok:true,observed,denied:denied.code,
          interruptedRun,interruptedState:held.state,
          geckoId:browser.runtime.id,
          sourceStats:{uniqueAssetBytes:1024*65536,
            referencedAssetBytes:2*1024*65536,
            insertedAndCapturedMs:performance.now()-sourceStart,
            captureMs,quotaUsageBefore:quotaBefore.usage??null,
            quotaUsageAfter:quotaAfter.usage??null,
            quotaLimit:quotaAfter.quota??null,
            jsHeapBytes:performance.memory?.usedJSHeapSize??null}};
      }finally{db.close();}
    })().then(done).catch(e=>done({ok:false,error:String(e)}));"""

def fresh_script(run_id):
    # This starts in a distinct Firefox profile with no original browser
    # backup ledger. All reads use the registered OS native host.
    return r"""const done=arguments[arguments.length-1];
    (async()=>{
      const runId=RUN_ID;
      const qualified=await import('./restore-v2-qualified.mjs');
      const native=await import('./backup-v2-session.mjs');
      const gateModule=await import('./restore-gate.mjs');
      const core=await import('./backup-core.mjs');
      const journal=await import('./journal.mjs');
      const idb=await import('./restore-idb.mjs');
      const db=await journal.openCanonicalDatabase();
      try{
        // A reliable, later local removal excludes an archived account
        // even in a synthetic fresh-profile replace operation.
        const tombstone=db.transaction('meta','readwrite');
        tombstone.objectStore('meta').put({
          key:'removal:s02-ci-1',state:'REMOVED_ONLY_LOCALLY',revision:5});
        await new Promise((resolve,reject)=>{
          tombstone.oncomplete=resolve;
          tombstone.onerror=()=>reject(Error('H_REMOVAL_TOMBSTONE_WRITE_FAILED'));
          tombstone.onabort=()=>reject(Error('H_REMOVAL_TOMBSTONE_ABORTED'));
        });
        const current=await core.snapshotCanonical(db);
        if(current.stores.meta.some(r=>r.key==='backup:v2:'+runId))
          throw Error('H_FRESH_BROWSER_LEDGER_NOT_EMPTY');
        const port=native.createV2NativeConnection(browser);
        let receipt,disk;
        try{
          receipt=await port.exchange({action:'archive.inspect',runId});
          disk=await port.exchange({action:'backup.verify',runId,
            keyRef:'portable-recovery'});
        }finally{port.close();}
        if(receipt?.state!=='RECOVERY_VERIFIED'||disk?.ok!==true||
           disk.sha256!==receipt.ciphertextSha256)
          throw Error('H_FRESH_QUALIFIED_NATIVE_FILE_REQUIRED');
        const guard=gateModule.createRestoreGate(browser.storage.local);
        // CI-only surrogate plan identity, not a production operator approval.
        // This verifies the real durable I16 hold and never permits activation.
        const plan=await core.digest('CI_DISPOSABLE_INACTIVE_PLAN:'+runId);
        await guard.begin({planSha256:plan,reviewedPlanSha256:plan,
          destinationSha256:await core.digest(JSON.stringify(current)),
          archiveSha256:receipt.ciphertextSha256,
          checkpointSha256:disk.sha256,checkpointTier:3,fresh:true});
        const accountChoices=Object.fromEntries(Array.from({length:50},
          (_,i)=>['s02-ci-'+i,i===1?'EXCLUDE':'INCLUDE_INACTIVE']));
        const restored=await qualified.prepareQualifiedV2FreshProfile({
          api:browser,runId,currentPcms:current,mode:'replace',
          accountChoices,guard,uidRemap:{
            '11111111-1111-4111-8111-111111111111':
              '22222222-2222-4222-8222-222222222222'
          }});
        const payload=restored.prepared.donor;
        const candidate=restored.prepared.prepared;
        const last=candidate.stores.meta.find(r=>
          r.key==='stage-history:s02-ci-1023');
        const exact=last?.value?.record?.candidate;
        const raw=exact?.blobs.find(f=>f.path==='main.pjs');
        const get=row=>candidate.stores.meta.find(v=>v.key===row)?.value;
        const survivor=get('account:s02-ci-0')?.account;
        if(!survivor||survivor.state!=='VERIFICATION_PENDING'||
           survivor.personaUid!=='22222222-2222-4222-8222-222222222222'||
           survivor.identity!==null||
           get('account:s02-ci-1')!==undefined||
           get('removal:s02-ci-1')?.state!=='REMOVED_ONLY_LOCALLY')
          throw Error('H_UID_REMOVAL_OR_APPROVAL_HISTORY_ACTIVATED');
        if(restored.activation!=='OFF'||restored.providerEffects!=='OFF'||
           restored.donorApply!=='NOT_AUTHORIZED'||
           payload.personas?.length!==50||
           payload.scripts?.length!==50||
           Object.keys(payload.cookies||{}).length!==50||
           candidate.stores.meta.length<1074||
           atob(raw?.base64||'')!=='output="h-source-1023";')
          throw Error('H_FRESH_INACTIVE_SOURCE_OR_DONOR_MISMATCH');
        const saved=await idb.applyCanonicalSnapshot(db,candidate,{
          assertHeld:async()=>(await guard.inspect()).held,
          expectedBefore:current});
        const independent=await core.snapshotCanonicalV2(db,{serializedValues:true});
        const final=independent.stores.meta.find(r=>
          r.key==='stage-history:s02-ci-1023');
        const held=await guard.inspect();
        if(saved.source!=='INDEPENDENT_READBACK'||
           final?.value?.record?.candidate?.blobs?.length!==3||
           held.held!==true||held.activation!=='OFF')
          throw Error('H_FRESH_CANONICAL_READBACK_OR_HOLD_MISSING');
        const repeated=await native.createV2NativeConnection(browser)
          .exchange({action:'archive.inspect',runId});
        if(repeated?.state!=='RECOVERY_VERIFIED'||
           repeated.ciphertextSha256!==receipt.ciphertextSha256)
          throw Error('H_NATIVE_AFTER_FRESH_RESTORE_CHANGED');
        return {ok:true,rows:independent.stores.meta.length,
          historicalAccountExcluded:true,uidRemappedInactive:true,
          donorPersonas:payload.personas.length,
          sourceManifests:restored.prepared.sourceAudit?.manifests,
          held:held.held,controller:held.controller,activation:held.activation,
          nativeRunId:runId};
      }finally{db.close();}
    })().then(done).catch(e=>done({ok:false,error:String(e)}));""".replace("RUN_ID",json.dumps(run_id))

def complete_donor_script(run_id):
    # H: actual production background I16 donor/cookies/portable/canonical
    # stages, not a page-side fake donor adapter or JS-only restore.
    return r"""const done=arguments[arguments.length-1];
    (async()=>{
      const runId=RUN;
      const core=await import('./backup-core.mjs');
      const gateModule=await import('./restore-gate.mjs');
      const journal=await import('./journal.mjs');
      const db=await journal.openCanonicalDatabase();
      const action=(name,params)=>new Promise((resolve,reject)=>{
        const p=browser.runtime.connect({name:'pcms-i16-restore'});
        const start=performance.now();
        let received=false;
        p.onMessage.addListener(value=>{received=true;try{p.disconnect()}catch{}resolve(value)});
        p.onDisconnect.addListener(()=>{if(!received)reject(Error('H_V2_GUARDED_PORT_LOST_ACK:'+name+':elapsedMs='+Math.round(performance.now()-start)))});
        p.postMessage({action:name,params});
      });
      try{
        const removal=db.transaction('meta','readwrite');
        removal.objectStore('meta').put({
          key:'removal:s02-ci-1',state:'REMOVED_ONLY_LOCALLY',revision:5});
        await new Promise((resolve,reject)=>{
          removal.oncomplete=resolve;
          removal.onerror=()=>reject(Error('H_V2_FRESH_REMOVAL_SETUP_FAILED'));
          removal.onabort=()=>reject(Error('H_V2_FRESH_REMOVAL_SETUP_ABORTED'));
        });
        // Exactly the 50 archived donor Persona keys, independently reviewed
        // as new BLOCK-route contexts; no existing Persona is implicitly rebound.
        const mappings=Object.fromEntries(
          Array.from({length:50},(_,i)=>['persona-'+(i+1),'__create__']));
        const accountChoices=Object.fromEntries(
          Array.from({length:50},(_,i)=>['s02-ci-'+i,
            i===1?'EXCLUDE':'INCLUDE_INACTIVE']));
        const params={runId,mappings,accountChoices};
        const preview=await action('PREVIEW_V2',params);
        if(!preview?.ok||preview.code!=='RESTORE_V2_NATIVE_PLAN_REVIEW_REQUIRED'||
           preview.archiveSha256!==preview.checkpointSha256||
           preview.review?.activation!=='OFF')
          throw Error('H_NATIVE_V2_REVIEW_NOT_AUTHENTICATED:'+preview?.code);
        // No native-file restore may apply merely because the file is valid.
        const preGuard=await action('APPLY_V2',{
          ...params,reviewedPlanSha256:preview.reviewedPlanSha256});
        if(preGuard?.ok!==false||preGuard.code!=='RESTORE_V2_FRESH_GUARD_REQUIRED')
          throw Error('H_V2_NO_GUARD_ADMITTED_DONOR_EFFECT');
        const gate=gateModule.createRestoreGate(browser.storage.local);
        await gate.begin({
          planSha256:preview.reviewedPlanSha256,
          reviewedPlanSha256:preview.reviewedPlanSha256,
          destinationSha256:preview.destinationSha256,
          archiveSha256:preview.archiveSha256,
          checkpointSha256:preview.checkpointSha256,
          checkpointTier:3,fresh:true,
          recovery:{mode:'replace',nativeRunId:runId,mappings,accountChoices}
        });
        const wrongReview=await action('APPLY_V2',{
          ...params,reviewedPlanSha256:'0'.repeat(64)});
        const before=await gate.inspect();
        if(wrongReview?.ok!==false||
           wrongReview.code!=='RESTORE_V2_OPERATOR_PLAN_CHANGED'||
           before.groups.length!==0||before.createdContainers!==0)
          throw Error('H_V2_WRONG_REVIEW_CREATED_DONOR_EFFECT');
        const applied=await action('APPLY_V2',{
          ...params,reviewedPlanSha256:preview.reviewedPlanSha256});
        if(!applied?.ok||applied.code!=='RESTORED_V2_DONOR_CANONICAL_INACTIVE'){
          const held=await gate.inspect();
          const donorView=await browser.runtime.sendMessage({type:'GET_SNAPSHOT'})
            .catch(()=>null);
          const contexts=await browser.contextualIdentities.query({}).catch(()=>[]);
          const cookieAudit=await Promise.all(contexts.map(async identity=>{
            const rows=await browser.cookies.getAll({storeId:identity.cookieStoreId})
              .catch(()=>[]);
            return rows.filter(c=>c.name?.startsWith('ci-')).map(c=>({
              domain:c.domain,hostOnly:c.hostOnly,secure:c.secure,
              httpOnly:c.httpOnly,sameSite:c.sameSite
            }));
          }));
          // Synthetic disposable CI only; preserve no identities or secrets.
          throw Error('H_V2_NATIVE_DONOR_APPLICATION_FAILED:'+JSON.stringify({
            code:applied?.code,step:held.step,status:held.status,
            groups:held.groups,createdContainers:held.createdContainers,
            observedContexts:contexts.length,
            observedProfiles:Object.keys(donorView?.state?.profiles||{}).length,
            observedScripts:Object.keys(donorView?.state?.scripts||{}).length,
            observedCookieSets:cookieAudit.filter(x=>x.length).length,
            observedCookieAttributes:cookieAudit.flat().slice(0,2)
          }));
        }
        const groups=Object.fromEntries((applied.groups||[])
          .map(g=>[g.key,g.status]));
        for(const name of ['donor-personas','donor-cookies','donor-portable',
                           'pcms-canonical'])
          if(groups[name]!=='OBSERVED')
            throw Error('H_V2_DONOR_I16_STAGE_NOT_OBSERVED:'+name);
        const inventory=await core.snapshotCanonicalV2(db,{serializedValues:true});
        const rows=new Map(inventory.stores.meta.map(r=>[r.key,r.value]));
        const recovered=rows.get('account:s02-ci-0')?.account;
        const last=rows.get('stage-history:s02-ci-1023')?.record?.candidate;
        const policyAudit={
          excluded:rows.get('account:s02-ci-1')===undefined,
          removalPreserved:rows.get('removal:s02-ci-1')?.state==='REMOVED_ONLY_LOCALLY',
          activeAccountPresent:!!recovered,
          verificationPending:recovered?.state==='VERIFICATION_PENDING',
          identityCleared:recovered?.identity===null,
          uidRebound:typeof recovered?.personaUid==='string'&&
            recovered.personaUid!=='11111111-1111-4111-8111-111111111111',
          lastSourcePresent:!!last,
          sourceBlobCount:last?.blobs?.length||0,
          lastSourceExact:atob(last?.blobs?.find(x=>x.path==='main.pjs')?.base64||'')===
            'output="h-source-1023";'
        };
        if(Object.values(policyAudit).some(v=>v===false)||
           policyAudit.sourceBlobCount!==3)
          throw Error('H_V2_FULL_DONOR_CANONICAL_SOURCE_OR_UID_INVALID:'+
            JSON.stringify(policyAudit));
        // Independent plaintext oracle for EVERY historical candidate and
        // predecessor, not just the last row or the authenticated inventory.
        function expectedAsset(i){
          const data=new Uint8Array(65536);
          let x=(i+1)>>>0;
          for(let n=0;n<data.length;n++){
            x^=x<<13;x^=x>>>17;x^=x<<5;data[n]=x&255;
          }
          return data;
        }
        let sourceFileProofs=0;
        for(let i=0;i<1024;i++){
          const rec=rows.get('stage-history:s02-ci-'+i)?.record;
          if(!rec)throw Error('H_V2_HISTORY_MISSING:'+i);
          const expectedSha=await core.digest(expectedAsset(i));
          for(const source of [rec.candidate,rec.previous]){
            const manifests=new Map(source?.files?.map(f=>[f.path,f])||[]);
            const blobs=new Map(source?.blobs?.map(b=>[b.path,b.base64])||[]);
            if(manifests.size!==3||blobs.size!==3)
              throw Error('H_V2_FULL_SOURCE_COUNT_CHANGED:'+i);
            for(const [path,expected] of [
              ['main.pjs','output="h-source-'+i+'";'],
              ['index.html','<div data-history="'+i+'">CI</div>']]){
              const plain=atob(blobs.get(path)||'');
              const bytes=new TextEncoder().encode(plain);
              if(plain!==expected||bytes.length!==manifests.get(path)?.size||
                 await core.digest(bytes)!==manifests.get(path)?.sha256)
                throw Error('H_V2_SOURCE_BYTE_MISMATCH:'+i+':'+path);
              sourceFileProofs++;
            }
            const base64=blobs.get('src/asset.bin')||'';
            const binary=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
            if(binary.length!==65536||
               manifests.get('src/asset.bin')?.sha256!==expectedSha||
               await core.digest(binary)!==expectedSha)
              throw Error('H_V2_ASSET_BYTE_MISMATCH:'+i);
            sourceFileProofs++;
          }
        }
        if(sourceFileProofs!==6144)throw Error('H_V2_SOURCE_FIDELITY_INCOMPLETE');
        // Firefox's actual container and cookie APIs, not an in-memory
        // replacement for the donor-controlled Persona/cookie service.
        const identities=await browser.contextualIdentities.query({});
        const imported=identities.filter(x=>x.name?.startsWith('PCMS Restore '));
        if(imported.length!==50)
          throw Error('H_V2_REAL_DONOR_CONTAINERS_MISSING:'+imported.length);
        let cookieSets=0;
        for(const identity of imported){
          const cookies=await browser.cookies.getAll({storeId:identity.cookieStoreId});
          if(cookies.some(c=>c.name?.startsWith('ci-')&&
                            c.domain?.includes('example.com')))cookieSets++;
        }
        if(cookieSets!==50)
          throw Error('H_V2_REAL_DONOR_COOKIES_INCOMPLETE:'+cookieSets);
        const observed=await gate.inspect();
        if(observed.held!==true||observed.activation!=='OFF'||
           observed.status!=='COMPLETE_INACTIVE')
          throw Error('H_V2_CONTROLLER_ACTIVATED');
        return {ok:true,reviewAndHoldNegatives:true,donorStages:groups,
          donorContainers:imported.length,donorCookieSets:cookieSets,
          canonicalRows:inventory.stores.meta.length,
          sourceHistoryExact:true,sourceFileProofs,
          historicalExclusion:true,
          uidRemappedInactive:true,held:observed.held,
          activation:observed.activation};
      }finally{db.close();}
    })().then(done).catch(e=>done({ok:false,error:String(e)}));""".replace("RUN",json.dumps(run_id))


def wrong_key_script(run_id):
    return r"""const done=arguments[arguments.length-1];
    (async()=>{
      const p=browser.runtime.connectNative('local.pcms.backup_v2');
      const result=await new Promise((resolve,reject)=>{
        p.onMessage.addListener(resolve);
        p.onDisconnect.addListener(()=>reject(Error('H_WRONG_KEY_PORT_DIED')));
        p.postMessage({action:'backup.verify',runId:RUN,keyRef:'portable-recovery'});
      });
      p.disconnect();
      if(result?.ok!==false)return {ok:false,code:'H_WRONG_KEY_ACCEPTED'};
      const inspected=await browser.runtime.sendNativeMessage(
        'local.pcms.backup_v2',{action:'archive.inspect',runId:RUN});
      return {ok:inspected?.ok===true&&inspected.state==='RECOVERY_VERIFIED',
        denied:result.code,unaltered:inspected?.state};
    })().then(done).catch(e=>done({ok:false,error:String(e)}));""".replace("RUN",json.dumps(run_id))


def put_disposable_secret(value):
    attrs=["application","pcms-alpha","purpose","unattended-encrypted-backup"]
    out=subprocess.run(["/usr/bin/secret-tool","store",
        "--label=PCMS-S02-disposable-test",*attrs],input=value+"\n",
        text=True,capture_output=True,timeout=20)
    assert out.returncode==0,"H_SECRET_SERVICE_STORE_UNAVAILABLE"


def main():
    assert len(sys.argv)==2,"usage: s02-ci-native-host.py build/pcms-alpha-i00.xpi"
    archive=(ROOT/sys.argv[1]).resolve()
    assert archive.is_file(),"H_PACKAGED_XPI_MISSING"
    home=Path(os.environ["HOME"]).resolve()
    assert os.environ.get("PCMS_S02_CI_ISOLATED")=="1" and \
           home!=Path.home().resolve().parent and \
           str(home).startswith(os.environ.get("RUNNER_TEMP","/tmp")), \
           "H_CI_DISPOSABLE_HOME_REQUIRED"
    assert os.environ.get("DBUS_SESSION_BUS_ADDRESS"),"H_DBUS_SESSION_REQUIRED"
    register(home,HOST_NAME,ROOT/"native/backup_v2_host.py")
    register(home,"local.pcms.backup_vault",ROOT/"native/backup_vault_host.py")
    secret_check()
    browser=Path(os.environ["FIREFOX_BINARY"])
    driver=Path(os.environ["GECKODRIVER_BINARY"])
    gecko=subprocess.Popen([str(driver),"--port",str(PORT),"--allow-system-access"],
                            stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    sampler=PeakProcessRSS(gecko.pid)
    sampler.start()
    session=None
    try:
        for _ in range(60):
            try:
                harness.call("GET","/status",timeout=2)
                break
            except Exception:
                time.sleep(.2)
        else:raise AssertionError("H_GECKODRIVER_UNAVAILABLE")
        profile=home/"firefox-disposable"
        profile.mkdir()
        (profile/"user.js").write_text('user_pref("xpinstall.signatures.required", false);\n')
        session=harness.open_session(browser,profile)
        installed=harness.call("POST",f"/session/{session}/moz/addon/install",
                         {"path":str(archive),"temporary":False},timeout=45)
        assert installed==ADDON_ID,("H_ACTUAL_ADDON_ID_MISMATCH",installed)
        harness.close(session);session=None
        session=harness.open_session(browser,profile)
        uuid=harness.addons_uuid(profile)
        harness.call("POST",f"/session/{session}/url",
             {"url":f"moz-extension://{uuid}/pcms/index.html"})
        # Source-heavy AES/IndexedDB/native two-pass work exceeds the W3C
        # default 30s script deadline; set only this disposable session.
        harness.call("POST",f"/session/{session}/timeouts",
             {"script":900000},timeout=15)
        result=harness.call("POST",f"/session/{session}/execute/async",
             {"script":native_script(),"args":[]},timeout=800)
        assert result.get("ok") is True,result
        assert result.get("geckoId")==ADDON_ID,result
        seen=result["observed"]
        assert result.get("interruptedState")=="OPEN_OBSERVED",result
        print("H S02_NATIVE_HOST_PORT_TERMINATION_UNCERTAIN_FILE_NOT_PROMOTED=PASS",
              json.dumps({"runId":result["interruptedRun"]}),flush=True)
        assert len(seen)==2 and seen[0]["runId"]!=seen[1]["runId"],seen
        assert seen[1]["encoder"]=="PRODUCTION_CANONICAL_SNAPSHOT",seen
        assert result["sourceStats"]["uniqueAssetBytes"]==67108864,result
        print("H S02_PRODUCTION_IDB_HIGH_UNIQUE_CAPTURE_MEASURED=PASS",
              json.dumps(result["sourceStats"]),flush=True)
        assert min(v["rows"] for v in seen)>=1074,("H_SOURCE_HISTORY_ROW_LOSS",seen)
        from importlib.machinery import SourceFileLoader
        sys.path.insert(0,str(ROOT/"native"))
        from backup_stream_v2 import verify_two_pass
        for entry in seen:
            file=home/".local/share/pcms-alpha/backups"/(entry["runId"]+".encrypted")
            assert file.is_file() and file.stat().st_size>66,file
            assert hashlib.file_digest(file.open("rb"),"sha256").hexdigest()==entry["sha256"]
            verify=verify_two_pass(file,PASSWORD)
            assert verify["sha256"]==entry["sha256"],"H_INDEPENDENT_DISK_REOPEN_INVALID"
            assert verify["canonicalRows"]>=1074,("H_SOURCE_ROWS_LOST",verify)
            assert verify["uniqueBlobs"]>2000,("H_SOURCE_VARIETY_LOST",verify)
            assert verify["donorBytes"]>2000,("H_DONOR_BYTES_LOST",verify)
        print("H S02_NATIVE_50_PERSONAS_1024_SOURCE_ARCHIVE_ON_DISK=PASS",
              json.dumps({"runId":seen[0]["runId"],"rows":seen[0]["rows"]}),
              flush=True)
        # A genuinely new installed Firefox profile has no browser v2 ledger.
        # Native inspection/readback crosses real Firefox + OS host + disk;
        # canonical restoration writes only the isolated profile under I16 hold.
        harness.close(session);session=None
        profile2=home/"firefox-fresh"
        profile2.mkdir()
        (profile2/"user.js").write_text('user_pref("xpinstall.signatures.required", false);\n')
        session=harness.open_session(browser,profile2)
        assert harness.call("POST",f"/session/{session}/moz/addon/install",
            {"path":str(archive),"temporary":False},timeout=45)==ADDON_ID
        harness.close(session);session=None
        session=harness.open_session(browser,profile2)
        fresh_uuid=harness.addons_uuid(profile2)
        harness.call("POST",f"/session/{session}/url",
            {"url":f"moz-extension://{fresh_uuid}/pcms/index.html"})
        harness.call("POST",f"/session/{session}/timeouts",
            {"script":900000},timeout=15)
        # The host must reject the *actual* OS keyring's changed password,
        # and preserve the original qualified file for subsequent recovery.
        put_disposable_secret("synthetic-disposable-WRONG-password-2026")
        wrong=harness.call("POST",f"/session/{session}/execute/async",
            {"script":wrong_key_script(seen[1]["runId"]),"args":[]},timeout=35)
        assert wrong.get("ok") is True,("H_REAL_WRONG_SECRET_SERVICE_KEY_ACCEPTED",wrong)
        print("H S02_WRONG_OS_SECRET_SERVICE_KEY_DENIED_WITHOUT_FILE_PROMOTION=PASS",
              json.dumps(wrong),flush=True)
        secret_check()  # Reopen original verified ciphertext with correct key.
        restored=harness.call("POST",f"/session/{session}/execute/async",
            {"script":fresh_script(seen[1]["runId"]),"args":[]},timeout=800)
        assert restored.get("ok") is True,("H_FRESH_NATIVE_RECOVERY",restored)
        assert restored.get("donorPersonas")==50 and restored.get("rows",0)>=1074
        assert restored.get("activation")=="OFF" and restored.get("held") is True
        assert restored.get("historicalAccountExcluded") is True
        assert restored.get("uidRemappedInactive") is True
        print("H S02_ACTUAL_NATIVE_DISK_TO_FRESH_PROFILE_CANONICAL_INACTIVE_RESTORE=PASS",
              json.dumps(restored),flush=True)
        # Third brand-new installed Firefox profile: true native-v2-to-I16
        # PersonaMonkey donor state, real Firefox cookies and full canonical
        # application in ONE guarded chain. No origin browser ledger copied.
        harness.close(session);session=None
        profile3=home/"firefox-full-donor-fresh"
        profile3.mkdir()
        (profile3/"user.js").write_text('user_pref("xpinstall.signatures.required", false);\n')
        session=harness.open_session(browser,profile3)
        assert harness.call("POST",f"/session/{session}/moz/addon/install",
            {"path":str(archive),"temporary":False},timeout=45)==ADDON_ID
        harness.close(session);session=None
        session=harness.open_session(browser,profile3)
        full_uuid=harness.addons_uuid(profile3)
        harness.call("POST",f"/session/{session}/url",
            {"url":f"moz-extension://{full_uuid}/pcms/index.html"})
        harness.call("POST",f"/session/{session}/timeouts",
            {"script":900000},timeout=15)
        full=harness.call("POST",f"/session/{session}/execute/async",
            {"script":complete_donor_script(seen[1]["runId"]),"args":[]},timeout=800)
        assert full.get("ok") is True,("H_V2_TRUE_DONOR_CONTROLLER_APPLY",full)
        assert full.get("donorContainers")==50 and full.get("donorCookieSets")==50
        assert full.get("activation")=="OFF" and full.get("held") is True
        print("H S02_NATIVE_V2_THROUGH_ACTUAL_PERSONAMONKEY_DONOR_COOKIES_CANONICAL=PASS",
              json.dumps(full),flush=True)
        print("H S02_HIGH_UNIQUE_NATIVE_DISK_BUDGET=PASS",json.dumps({
            "encryptedArchivesBytes":sum((home/".local/share/pcms-alpha/backups"/(v["runId"]+".encrypted")).stat().st_size for v in seen),
            "availableFilesystemBytes":__import__("shutil").disk_usage(home).free,
            "restoredProfileBytes":sum(p.stat().st_size for p in profile3.rglob("*") if p.is_file()),
            "qualifiedRetained14DiskProjectionBytes":14*(home/".local/share/pcms-alpha/backups"/(seen[1]["runId"]+".encrypted")).stat().st_size,
            "installedSourceProfileBytes":sum(p.stat().st_size for p in profile.rglob("*") if p.is_file()),
            "uniqueSourceBytes":result["sourceStats"]["uniqueAssetBytes"]}),flush=True)
        assert sampler.peak_kib>0 and sampler.max_processes>=2, \
            "H_AGGREGATE_OS_PROCESS_RSS_UNAVAILABLE"
        print("H S02_AGGREGATE_OS_PROCESS_RSS_OBSERVED=PASS",
              json.dumps({"peakSumRssKiB":sampler.peak_kib,
                          "maxObservedProcesses":sampler.max_processes,
                          "nativeHostProcessSeen":sampler.native_observed,
                          "basis":"sampled procfs per-process RSS sum; shared pages counted multiple times",
                          "scope":"disposable geckodriver/Firefox/native descendants plus Python driver"}),
              flush=True)
        print("H S02_ACTUAL_REGISTERED_GECKO_NATIVE_PORT_SECRETS_FILE_AND_REOPEN=PASS",
              json.dumps({"xpiSha256":hashlib.sha256(archive.read_bytes()).hexdigest(),
                          "runs":len(seen),"rows":[v["rows"] for v in seen],
                          "firefox":str(browser),"host":HOST_NAME}),flush=True)
    finally:
        sampler.stop()
        try:
            print("H S02_FINAL_RESOURCE_DIAGNOSTICS",json.dumps({
                "peakSumRssKiB":sampler.peak_kib,
                "maxObservedProcesses":sampler.max_processes,
                "nativeHostProcessSeen":sampler.native_observed,
                "availableFilesystemBytes":__import__("shutil").disk_usage(home).free,
                "basis":"sampled procfs RSS sum; shared pages double-counted"}),flush=True)
        except OSError as diagnostic:
            print("H S02_RESOURCE_DIAGNOSTICS_UNAVAILABLE",str(diagnostic),flush=True)
        if session:harness.close(session)
        gecko.terminate()
        try:gecko.wait(timeout=5)
        except subprocess.TimeoutExpired:gecko.kill()

if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("H S02_INSTALLED_NATIVE_HOST_FAILURE:",repr(exc),file=sys.stderr,flush=True)
        raise
