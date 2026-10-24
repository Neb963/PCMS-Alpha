#!/usr/bin/env python3
"""J01 B: primary Accounts clicks in an installed XPI and disposable Firefox.
Normal provider/donor responses are OFFLINE fixtures, behind the actual production
boundaries, stores and route pins. A separate test uses the unmodified real ports.
No personal profile, provider resource or private Git repository is accessed.
"""
import base64
import importlib.util
import json
import os
import pathlib
import subprocess
import sys
import tempfile
import time
from urllib.request import urlopen

spec=importlib.util.spec_from_file_location("pcms_browser_smoke",pathlib.Path(__file__).with_name("browser-i00-smoke.py"))
b=importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
ELEMENT="element-6066-11e4-a52e-4f735466cecf"


def wait(session, expression, label, seconds=35):
    last=None
    until=time.monotonic()+seconds
    while time.monotonic()<until:
        last=b.execute(session,"const sh=document.getElementById('pcms-faithful-host')?.shadowRoot;return "+expression)
        if last:return last
        time.sleep(.15)
    context=b.execute(session,"const sh=document.getElementById('pcms-faithful-host')?.shadowRoot;return {page:sh?.querySelector('#page')?.innerText?.slice(0,4000),dialog:sh?.querySelector('.account-dialog')?.innerText?.slice(0,4000)}")
    raise AssertionError((label,last,context))


def click(session, selector):
    node=b.execute(session,"return document.getElementById('pcms-faithful-host').shadowRoot.querySelector("+json.dumps(selector)+")")
    assert node and ELEMENT in node,("J01_CLICK_TARGET_MISSING",selector,node)
    b.call("POST",f"/session/{session}/element/{node[ELEMENT]}/click",{})


def alert_accept(session):
    b.call("POST",f"/session/{session}/alert/accept",{})


def fixture(session):
    source=pathlib.Path(__file__).with_name("fixtures").joinpath("j01-ui.mjs").read_text()
    source=source.replace("export async function installJourneyFixture", "async function installJourneyFixture")
    script="const done=arguments[arguments.length-1];(async()=>{"+source+"return await installJourneyFixture();})().then(done).catch(e=>done({error:String(e),stack:String(e.stack)}));"
    result=b.call("POST",f"/session/{session}/execute/async",{"script":script,"args":[]},timeout=60)
    assert result.get("ok") is True,result
    click(session,'[data-action="refresh-accounts"]')


def oracle(session, body="return await window.__j01.inspect();"):
    return b.call("POST",f"/session/{session}/execute/async",{
        "script":"const done=arguments[arguments.length-1];(async()=>{"+body+"})().then(done).catch(e=>done({error:String(e)}));",
        "args":[]},timeout=45)


def canonical_state(session, account_id, state):
    result=oracle(session)
    assert "error" not in result,result
    rows=[a for a in result["accounts"] if a["accountId"]==account_id]
    return rows and rows[0]["state"]==state


def wait_state(session, account_id, state, seconds=35):
    until=time.monotonic()+seconds
    while time.monotonic()<until:
        if canonical_state(session,account_id,state):return
        time.sleep(.15)
    raise AssertionError(("J01_CANONICAL_STATE",account_id,state,oracle(session)))


def manage(session, account_id):
    click(session,'[data-account-id="'+account_id+'"] [data-account-manage]')
    wait(session,"!!sh?.querySelector('.account-dialog')","J01_DIALOG")
    wait(session,"sh?.querySelector('.account-dialog .account-summary')?.textContent.includes('Checking…')===false","J01_INSPECTOR")


def command(session, kind, confirm=False):
    selector='[data-account-command="'+kind+'"]'
    wait(session,"(()=>{const e=sh?.querySelector("+json.dumps(selector)+");return !!e&&!e.hidden&&!e.disabled})()","J01_COMMAND_AVAILABLE_"+kind)
    click(session,selector)
    if confirm:alert_accept(session)


def close_dialog(session):
    click(session,'.account-dialog-head button')


def capture(session, name, evidence):
    directory=pathlib.Path("build")
    directory.mkdir(exist_ok=True)
    directory.joinpath("j01-"+name+".png").write_bytes(base64.b64decode(b.call("GET",f"/session/{session}/screenshot")))
    evidence[name]=b.execute(session,"""const sh=document.getElementById('pcms-faithful-host').shadowRoot;
      return {text:sh.querySelector('#page').innerText,dialog:sh.querySelector('.account-dialog')?.innerText||'',
       width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,
       enabledCommands:[...sh.querySelectorAll('[data-account-command]')].filter(e=>!e.disabled&&e.getClientRects().length).map(e=>e.dataset.accountCommand)}""")


def run(browser, archive, folder):
    profile=pathlib.Path(folder)/"j01-primary-accounts"
    profile.mkdir()
    (profile/"user.js").write_text('user_pref("xpinstall.signatures.required", false);\n')
    first=b.open_session(browser,profile)
    try:
        assert b.call("POST",f"/session/{first}/moz/addon/install",{"path":str(archive),"temporary":False},timeout=45)==b.ID
    finally:b.close(first)
    session=b.open_session(browser,profile)
    evidence={}
    try:
        uuid=b.addons_uuid(profile)
        url=f"moz-extension://{uuid}/pcms/index.html#accounts"
        b.call("POST",f"/session/{session}/url",{"url":url})
        b.wait_donor_ready(session)
        wait(session,"!!sh?.querySelector('[data-action=\"add-account\"]')","J01_PRIMARY_MOUNT")
        # Actual default UI -> actual runtime port -> donor. No shim yet.
        click(session,'[data-action="add-account"]')
        wait(session,"sh?.querySelectorAll('[data-account-id]').length===1","J01_REAL_ADD")
        wait(session,"sh?.querySelector('.account-list-scroll')?.textContent.includes('helper')||sh?.querySelector('.account-list-scroll')?.textContent.includes('privacy')||sh?.querySelector('.account-list-scroll')?.textContent.includes('relay')","J01_REAL_HELD",140)
        if not b.execute(session,"return !!document.getElementById('pcms-faithful-host').shadowRoot.querySelector('.account-dialog')"):
            click(session,'[data-account-manage]')
        command(session,"ARCHIVE",True)
        wait(session,"sh?.querySelector('.account-state')?.textContent.includes('Archived')","J01_REAL_ARCHIVE",60)
        capture(session,"real-donor-held-archive",evidence)
        close_dialog(session)
        actual=b.account_command(session,{"type":"LIST_ACCOUNTS"})
        assert actual["accounts"][0]["state"]=="ARCHIVED",actual
        actual_network=b.account_command(session,{"type":"NETWORK_STATUS"})
        assert actual_network.get("activePins")==0,actual_network
        print("B J01_REAL_PRIMARY_ADD_HELD_NO_DIRECT_AND_ARCHIVE=PASS",flush=True)

        fixture(session)
        wait(session,"sh?.querySelectorAll('[data-account-id]').length===0","J01_FIXTURE_ISOLATION")
        click(session,'[data-action="add-account"]')
        wait(session,"sh?.querySelectorAll('[data-account-id]').length===1","J01_FIXTURE_ADD")
        data=oracle(session);account_id=data["accounts"][0]["accountId"]
        wait_state(session,account_id,"WAITING_LOGIN")
        if not b.execute(session,"return !!document.getElementById('pcms-faithful-host').shadowRoot.querySelector('.account-dialog')"):manage(session,account_id)
        command(session,"CONFIRM_LOGIN")
        wait(session,"sh?.querySelector('.account-feedback')?.textContent.includes('action could not')","J01_LOGIN_REQUIRED")
        assert canonical_state(session,account_id,"VERIFICATION_PENDING"),oracle(session)
        # A challenge/absent session cannot rotate routes or invent identity.
        before=oracle(session)
        assert len([x for x in before["effects"] if x["kind"]=="ASSIGN"])==1,before
        oracle(session,"await window.__j01.session("+json.dumps(account_id)+",'a'.repeat(64));await window.__j01.inventoryFailure(true);return true;")
        command(session,"CONFIRM_LOGIN")
        wait_state(session,account_id,"INVENTORY_PENDING")
        wait(session,"sh?.querySelector('.account-state')?.textContent.includes('Synchronize inventory')","J01_PENDING_INVENTORY")
        oracle(session,"await window.__j01.inventoryFailure(false);return true;")
        command(session,"SYNC_ACCOUNT")
        wait_state(session,account_id,"VERIFIED")
        wait(session,"sh?.querySelector('.account-summary')?.textContent.includes('1')&&sh?.querySelector('.account-state')?.textContent.includes('Ready')","J01_VERIFIED_UI")
        command(session,"OPEN_LOGIN")
        wait(session,"sh?.querySelector('.account-feedback')?.textContent.includes('opened')","J01_PROTECTED_OPEN")
        data=oracle(session)
        assert data["opened"][-1]["personaUid"]==data["accounts"][0]["personaUid"],data
        first_route=data["ledger"]["bindings"][data["accounts"][0]["bindingId"]]["routeId"]
        command(session,"CHANGE_ROUTE")
        wait(session,"sh?.querySelector('.account-feedback')?.textContent.includes('Protected route checked')","J01_ROUTE_CHANGE")
        data=oracle(session)
        assert data["ledger"]["bindings"][data["accounts"][0]["bindingId"]]["routeId"]!=first_route,data
        assert len(data["ledger"]["owners"])>=2,data
        capture(session,"ready-route-and-inventory",evidence)

        # Advisory uses verified owned counts, never pending or unknown zero.
        oracle(session,"await window.__j01.inventoryCount(60);return true;")
        command(session,"SYNC_ACCOUNT")
        wait(session,"sh?.querySelector('#page .action-callout')?.textContent.includes('Consider adding another account')","J01_GROWTH_ADVICE")
        # The primary Upgrade control migrates a genuine historical account
        # in place; legacy storage is seeded through production transitions.
        close_dialog(session)
        oracle(session,"return await window.__j01.legacy();")
        click(session,'[data-action="refresh-accounts"]')
        wait(session,"sh?.querySelectorAll('[data-account-id]').length===2","J01_LEGACY_ROW")
        manage(session,"j01_legacy_account")
        click(session,'.account-recovery summary')
        command(session,"UPGRADE_ACCOUNT")
        wait(session,"sh?.querySelector('.account-feedback')?.textContent.includes('current account state')","J01_LEGACY_UPGRADED")
        legacy=next(a for a in oracle(session)["accounts"] if a["accountId"]=="j01_legacy_account")
        assert legacy["upgrade"]["phase"]=="COMPLETE" and legacy["boundPrincipal"]=="c"*64,legacy
        command(session,"ARCHIVE",True)
        wait_state(session,"j01_legacy_account","ARCHIVED")
        close_dialog(session)
        manage(session,account_id)

        # Keyboard focus and narrow viewport use the same live dialog.
        focused=b.execute(session,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;sh.querySelector('.account-dialog-head button').focus();return sh.activeElement.textContent")
        assert focused=="Close",focused
        b.call("POST",f"/session/{session}/actions",{"actions":[{"type":"key","id":"j01-keyboard","actions":[{"type":"keyDown","value":"\ue008"},{"type":"keyDown","value":"\ue004"},{"type":"keyUp","value":"\ue004"},{"type":"keyUp","value":"\ue008"}]}]})
        assert b.execute(session,"const sh=document.getElementById('pcms-faithful-host').shadowRoot;return sh.querySelector('.account-dialog').contains(sh.activeElement)"),"J01_FOCUS_ESCAPED"
        b.call("POST",f"/session/{session}/window/rect",{"width":390,"height":800})
        capture(session,"narrow-keyboard",evidence)
        assert not evidence["narrow-keyboard"]["overflow"],evidence["narrow-keyboard"]
        b.call("POST",f"/session/{session}/window/rect",{"width":1280,"height":900})
        close_dialog(session)

        # Persist canonical identity/inventory/route and external effect oracle
        # across genuine OS-observed Firefox exit and a new process.
        old_pids=b.owned_firefox_pids(profile);before=oracle(session)
        b.close(session);session=None;b.require_owned_exit(profile,old_pids)
        session=b.open_session(browser,profile)
        assert not old_pids.intersection(b.owned_firefox_pids(profile)),"J01_PID_REUSED"
        b.call("POST",f"/session/{session}/url",{"url":url})
        wait(session,"!!sh?.querySelector('[data-action=\"refresh-accounts\"]')","J01_RESTART_MOUNT")
        fixture(session)
        wait(session,"sh?.querySelectorAll('[data-account-id]').length===2","J01_RESTART_ROWS")
        assert canonical_state(session,account_id,"VERIFIED"),oracle(session)
        # Controlled production upkeep reconstructs from persisted fixture
        # stores. This is not a claim of real background/provider acceptance.
        recovery=oracle(session,"return await window.__j01.recover();")
        assert recovery.get("ok") is True,recovery
        after=oracle(session)
        # Read-only assigned probes may recur; creation/assignment/removal
        # effects must not replay after process restart.
        mutations=lambda data:[e for e in data["effects"] if e["kind"] not in ("PROBE","PROBE_ASSIGNED")]
        assert mutations(before)==mutations(after),"J01_RESTART_REPLAYED_EFFECT"
        print("B J01_PRIMARY_LOGIN_INVENTORY_ROUTE_AND_COLD_RESTART=PASS; PROVIDERS=OFFLINE_FIXTURES",flush=True)

        # A second held account cannot disable the first or other workspaces.
        oracle(session,"await window.__j01.helperFailure(true);return true;")
        click(session,'[data-action="add-account"]')
        wait(session,"sh?.querySelectorAll('[data-account-id]').length===3","J01_SECOND_ADD")
        until=time.monotonic()+30
        while time.monotonic()<until:
            data=oracle(session)
            second=next((a for a in data["accounts"] if a["accountId"] not in (account_id,"j01_legacy_account")),None)
            if second and second.get("setup",{}).get("phase")=="HELD":break
            time.sleep(.15)
        assert second and second["state"]=="PREPARING" and second["setup"]["phase"]=="HELD",data
        wait(session,"!sh?.querySelector('#page .action-callout')?.textContent.includes('Consider adding another account')","J01_UNKNOWN_COUNT_DEFERS_ADVICE")
        if b.execute(session,"return !!document.getElementById('pcms-faithful-host').shadowRoot.querySelector('.account-dialog')"):close_dialog(session)
        manage(session,account_id)
        # Inventory reading is independent of new route setup/helper failure.
        command(session,"SYNC_ACCOUNT")
        wait(session,"sh?.querySelector('.account-feedback')?.textContent.includes('synchronized')","J01_ACCOUNT_ISOLATION")
        command(session,"VERIFY_ROUTE")
        wait(session,"sh?.querySelector('.account-state')?.textContent.includes('helper')","J01_VERIFIED_ROUTE_HELD")
        close_dialog(session)
        click(session,'#account-filter option:nth-child(3)')
        wait(session,"!!sh?.querySelector('[data-account-id=\""+account_id+"\"]')","J01_HELD_IN_ATTENTION")
        click(session,'#account-filter option:nth-child(2)')
        wait(session,"!sh?.querySelector('[data-account-id=\""+account_id+"\"]')","J01_HELD_NOT_CONNECTED")
        click(session,'#account-filter option:nth-child(1)')
        click(session,'[data-nav="settings"]')
        wait(session,"!!sh?.querySelector('.settings-main')","J01_SETTINGS_INDEPENDENT")
        click(session,'[data-nav="accounts"]')
        wait(session,"sh?.querySelectorAll('[data-account-id]').length===3","J01_ACCOUNTS_RETURN")
        oracle(session,"await window.__j01.helperFailure(false);await window.__j01.dropPersona("+json.dumps(account_id)+");return true;")
        manage(session,account_id)
        click(session,'.account-recovery summary')
        command(session,"REPLACE_PERSONA",True)
        wait_state(session,account_id,"REBIND_PENDING")
        repaired=oracle(session)
        original=next(a for a in after["accounts"] if a["accountId"]==account_id)
        replacement=next(a for a in repaired["accounts"] if a["accountId"]==account_id)
        assert replacement["personaUid"]!=original["personaUid"] and replacement["boundPrincipal"]==original["boundPrincipal"],repaired
        oracle(session,"await window.__j01.session("+json.dumps(account_id)+",'a'.repeat(64));return true;")
        command(session,"CONFIRM_LOGIN")
        wait_state(session,account_id,"VERIFIED")
        command(session,"ARCHIVE",True)
        wait_state(session,account_id,"ARCHIVED")
        wait(session,"sh?.querySelector('.account-state')?.textContent.includes('Archived')","J01_ARCHIVED_UI")
        command(session,"REACTIVATE")
        wait_state(session,account_id,"VERIFIED")
        command(session,"ARCHIVE",True)
        wait_state(session,account_id,"ARCHIVED")
        wait(session,"!!sh?.querySelector('[data-account-remove]')&&!sh.querySelector('[data-account-remove]').hidden","J01_REMOVE_READY")
        before_removal=next(a for a in oracle(session)["accounts"] if a["accountId"]==account_id)
        click(session,'[data-account-remove]')
        click(session,'.account-removal input[type="checkbox"]')
        command(session,"REMOVE_ACCOUNT")
        until=time.monotonic()+30
        while time.monotonic()<until:
            data=oracle(session);removed=next(a for a in data["accounts"] if a["accountId"]==account_id)
            if removed.get("removed"):break
            time.sleep(.15)
        assert removed.get("removed",{}).get("personaDeleted") is True,data
        assert removed["boundPrincipal"] is None and removed["identity"] is None and removed["personaUid"] is None,removed
        assert sum(owner==account_id for owner in data["ledger"]["owners"].values())>=2,data
        assert not any(p["personaUid"]==before_removal["personaUid"] for p in data["profiles"]),data
        assert any(e["kind"]=="PERSONA_REMOVE" and e["personaUid"]==before_removal["personaUid"] for e in data["effects"]),data
        removal=[m for m in data["commands"] if m["type"]=="REMOVE_ACCOUNT"]
        assert removal[-1]["params"]["explicitRemoval"] is True and removal[-1]["params"]["deletePersona"] is True,removal
        capture(session,"recovery-and-removal",evidence)
        print("B J01_PRIMARY_ACCOUNT_ISOLATION_PERSONA_REPAIR_ARCHIVE_REACTIVATE_REMOVE=PASS; PROVIDERS=OFFLINE_FIXTURES",flush=True)

        # Resume the held account, record a limited challenge exception and
        # verify its local-removal scope leaves the Persona and session intact.
        close_dialog(session)
        manage(session,second["accountId"])
        command(session,"RESUME_SETUP")
        wait_state(session,second["accountId"],"WAITING_LOGIN")
        click(session,'.account-recovery summary')
        click(session,'.account-check input[type="checkbox"]')
        command(session,"MANUAL_OVERRIDE")
        wait_state(session,second["accountId"],"OVERRIDDEN")
        exception=next(a for a in oracle(session)["accounts"] if a["accountId"]==second["accountId"])
        assert exception["identity"] is None and exception["override"]["grantsProviderMutation"] is False,exception
        command(session,"ARCHIVE",True)
        wait_state(session,second["accountId"],"ARCHIVED")
        wait(session,"!!sh?.querySelector('[data-account-remove]')&&!sh.querySelector('[data-account-remove]').hidden","J01_KEEP_PERSONA_REMOVE")
        before_keep=next(a for a in oracle(session)["accounts"] if a["accountId"]==second["accountId"])
        click(session,'[data-account-remove]')
        command(session,"REMOVE_ACCOUNT")
        until=time.monotonic()+30
        while time.monotonic()<until:
            final=oracle(session);kept=next(a for a in final["accounts"] if a["accountId"]==second["accountId"])
            if kept.get("removed"):break
            time.sleep(.15)
        assert kept.get("removed",{}).get("personaDeleted") is False,kept
        assert kept["personaUid"] is None and kept["identity"] is None and kept["boundPrincipal"] is None,kept
        assert any(p["personaUid"]==before_keep["personaUid"] for p in final["profiles"]),final
        assert not any(e["kind"]=="PERSONA_REMOVE" and e["personaUid"]==before_keep["personaUid"] for e in final["effects"]),final
        print("B J01_PRIMARY_LEGACY_UPGRADE_LIMITED_EXCEPTION_AND_REMOVAL_SCOPE=PASS; PROVIDERS=OFFLINE_FIXTURES",flush=True)

        pathlib.Path("build/j01-ui-evidence.json").write_text(json.dumps(evidence,indent=2))
    except Exception:
        if session:
            try:capture(session,"failure",evidence)
            except Exception as capture_error:evidence["capture_error"]=str(capture_error)
        pathlib.Path("build/j01-ui-evidence.json").write_text(json.dumps(evidence,indent=2))
        raise
    finally:
        if session:b.close(session)


def main():
    archive=pathlib.Path(sys.argv[1]).resolve()
    browser=pathlib.Path(os.environ["FIREFOX_BINARY"])
    driver=pathlib.Path(os.environ["GECKODRIVER_BINARY"])
    server=subprocess.Popen([str(driver),"--port",str(b.PORT),"--allow-system-access"],stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
    try:
        for _ in range(80):
            try:
                with urlopen(b.HOST+"/status",timeout=1) as response:
                    if json.load(response).get("value",{}).get("ready"):break
            except Exception:time.sleep(.25)
        else:raise RuntimeError("J01_GECKODRIVER_UNAVAILABLE")
        with tempfile.TemporaryDirectory(prefix="pcms-j01-ui-") as folder:run(browser,archive,folder)
    finally:
        server.terminate()
        try:server.wait(timeout=4)
        except subprocess.TimeoutExpired:server.kill()


if __name__=="__main__":main()
