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
        const pcms=await core.snapshotCanonicalV2(db);
        const password=vault.passphrase;
        const payload=donor.createPortableBackupPayload({
          state:{},containers:[],selection:{kind:'full'}});
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
        result=harness.call("POST",f"/session/{session}/execute/async",
             {"script":native_script(),"args":[]},timeout=180)
        assert result.get("ok") is True,result
        assert result.get("geckoId")==ADDON_ID,result
        seen=result["observed"]
        assert len(seen)==2 and seen[0]["runId"]!=seen[1]["runId"],seen
        from importlib.machinery import SourceFileLoader
        sys.path.insert(0,str(ROOT/"native"))
        from backup_stream_v2 import verify_two_pass
        for entry in seen:
            file=home/".local/share/pcms-alpha/backups"/(entry["runId"]+".encrypted")
            assert file.is_file() and file.stat().st_size>66,file
            assert hashlib.sha256(file.read_bytes()).hexdigest()==entry["sha256"]
            verify=verify_two_pass(file,PASSWORD)
            assert verify["sha256"]==entry["sha256"],"H_INDEPENDENT_DISK_REOPEN_INVALID"
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
