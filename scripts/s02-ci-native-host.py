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

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location("pcms_firefox_harness",ROOT/"scripts/browser-i00-smoke.py")
harness=importlib.util.module_from_spec(spec)
spec.loader.exec_module(harness)
HOST_NAME="local.pcms.backup_v2"
ADDON_ID="persona-route-manager@local"
PASSWORD="synthetic-disposable-v2-native-vault-secret-2026"
PORT=44448

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
          records.push({key:'account:s02-ci-'+i,account:{
            accountId:'s02-ci-'+i,state:'ARCHIVED',revision:1}});
          profiles[cid]={containerId:cid,managed:true,routeId:'__block__',
            name:'CI archived Persona '+i,scriptIds:[sid],
            killSwitch:true,blockLocalNetwork:true};
          scripts[sid]={id:sid,name:'CI source '+i,
            code:'// synthetic donor '+i,enabled:false};
          containers.push({cookieStoreId:cid,name:'CI archived Persona '+i,
            color:'blue',icon:'fingerprint'});
          cookiesByProfile[cid]=[{name:'ci-'+i,value:'disposable-only-'+i,
            domain:'example.invalid',path:'/',secure:true,httpOnly:true}];
        }
        for(let i=0;i<1024;i++){
          const raw=[
            ['main.pjs',enc.encode('output="h-source-'+i+'";')],
            ['index.html',enc.encode('<div data-history="'+i+'">CI</div>')],
            ['src/asset.bin',Uint8Array.from({length:160+i%256},
              (_,n)=>(i*67+n*31+(n>>3))&255)]
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
        const pcms=await core.snapshotCanonicalV2(db);
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
        const observed=[];
        for(let i=0;i<2;i++){
          const runId='s02_'+crypto.randomUUID().replaceAll('-','');
          const outcome=await native.exportV2Candidate({
            db,api:browser,pcms,donorEnvelope:envelope,runId,
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
            rows:verified.sourceRows});
        }
        const before=await browser.storage.local.get('pcmsRestoreInProgress');
        if(before.pcmsRestoreInProgress?.active===true)
          throw Error('H_UNAUTHORIZED_RESTORE_ACTIVATION');
        return {ok:true,observed,denied:denied.code,
          geckoId:browser.runtime.id};
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
          (_,i)=>['s02-ci-'+i,'INCLUDE_INACTIVE']));
        const restored=await qualified.prepareQualifiedV2FreshProfile({
          api:browser,runId,currentPcms:current,mode:'replace',
          accountChoices,guard});
        const payload=restored.prepared.donor;
        const candidate=restored.prepared.prepared;
        const last=candidate.stores.meta.find(r=>
          r.key==='stage-history:s02-ci-1023');
        const exact=last?.value?.record?.candidate;
        const raw=exact?.blobs.find(f=>f.path==='main.pjs');
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
        const independent=await core.snapshotCanonical(db);
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
          donorPersonas:payload.personas.length,
          sourceManifests:restored.prepared.sourceAudit?.manifests,
          held:held.held,controller:held.controller,activation:held.activation,
          nativeRunId:runId};
      }finally{db.close();}
    })().then(done).catch(e=>done({ok:false,error:String(e)}));""".replace("RUN_ID",json.dumps(run_id))

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
             {"script":240000},timeout=15)
        result=harness.call("POST",f"/session/{session}/execute/async",
             {"script":native_script(),"args":[]},timeout=180)
        assert result.get("ok") is True,result
        assert result.get("geckoId")==ADDON_ID,result
        seen=result["observed"]
        assert len(seen)==2 and seen[0]["runId"]!=seen[1]["runId"],seen
        assert min(v["rows"] for v in seen)>=1074,("H_SOURCE_HISTORY_ROW_LOSS",seen)
        from importlib.machinery import SourceFileLoader
        sys.path.insert(0,str(ROOT/"native"))
        from backup_stream_v2 import verify_two_pass
        for entry in seen:
            file=home/".local/share/pcms-alpha/backups"/(entry["runId"]+".encrypted")
            assert file.is_file() and file.stat().st_size>66,file
            assert hashlib.sha256(file.read_bytes()).hexdigest()==entry["sha256"]
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
            {"script":240000},timeout=15)
        restored=harness.call("POST",f"/session/{session}/execute/async",
            {"script":fresh_script(seen[0]["runId"]),"args":[]},timeout=220)
        assert restored.get("ok") is True,("H_FRESH_NATIVE_RECOVERY",restored)
        assert restored.get("donorPersonas")==50 and restored.get("rows",0)>=1074
        assert restored.get("activation")=="OFF" and restored.get("held") is True
        print("H S02_ACTUAL_NATIVE_DISK_TO_FRESH_PROFILE_CANONICAL_INACTIVE_RESTORE=PASS",
              json.dumps(restored),flush=True)
        print("H S02_ACTUAL_REGISTERED_GECKO_NATIVE_PORT_SECRETS_FILE_AND_REOPEN=PASS",
              json.dumps({"xpiSha256":hashlib.sha256(archive.read_bytes()).hexdigest(),
                          "runs":len(seen),"rows":[v["rows"] for v in seen],
                          "firefox":str(browser),"host":HOST_NAME}),flush=True)
    finally:
        if session:harness.close(session)
        gecko.terminate()
        try:gecko.wait(timeout=5)
        except subprocess.TimeoutExpired:gecko.kill()

if __name__=="__main__":
    try:main()
    except Exception as exc:
        print("H S02_INSTALLED_NATIVE_HOST_FAILURE:",repr(exc),file=sys.stderr,flush=True)
        raise
