#!/usr/bin/env python3
"""PCMS Alpha native-host health check. Read-only except a disposable
Secret Service probe entry that is stored, read back and removed again.

Prints one line per check: OK / WARN / FAIL with an actionable hint.
Exit status is non-zero when a required check fails.
"""
import json
import os
import pathlib
import shutil
import struct
import subprocess
import sys

EXT_ID = "persona-route-manager@local"
HOME = pathlib.Path.home()
USER_DIRS = [HOME / ".mozilla/native-messaging-hosts", HOME / ".librewolf/native-messaging-hosts"]
SYSTEM_DIRS = [pathlib.Path(p) for p in ("/usr/lib/mozilla/native-messaging-hosts",
    "/usr/lib64/mozilla/native-messaging-hosts", "/usr/lib/librewolf/native-messaging-hosts",
    "/usr/lib64/librewolf/native-messaging-hosts")]
failures = 0


def report(level, name, detail):
    global failures
    if level == "FAIL":
        failures += 1
    print(f"{level:4} {name}: {detail}")


def manifest(name, dirs):
    for d in dirs:
        p = d / (name + ".json")
        if p.is_file():
            try:
                data = json.loads(p.read_text())
            except ValueError:
                return None, f"{p} is not valid JSON"
            if data.get("name") != name or EXT_ID not in data.get("allowed_extensions", []):
                return None, f"{p} does not allow {EXT_ID}"
            exe = pathlib.Path(data.get("path", ""))
            if not exe.is_file() or not os.access(exe, os.X_OK):
                return None, f"{p} points to missing/non-executable {exe}"
            return data, str(p)
    return None, "not registered (run install.sh)"


def exchange(path, message, timeout=20):
    body = json.dumps(message).encode()
    try:
        proc = subprocess.run([path], input=struct.pack("<I", len(body)) + body,
                              capture_output=True, timeout=timeout)
    except (OSError, subprocess.TimeoutExpired) as exc:
        return None, type(exc).__name__
    out = proc.stdout
    if len(out) < 4:
        return None, "no reply"
    (n,) = struct.unpack("<I", out[:4])
    try:
        return json.loads(out[4:4 + n]), None
    except ValueError:
        return None, "invalid reply"


def main():
    if sys.version_info < (3, 9):
        report("FAIL", "python", "Python 3.9+ required")
    try:
        import cryptography  # noqa: F401
        report("OK", "python3-cryptography", "available")
    except ImportError:
        report("FAIL", "python3-cryptography", "sudo dnf install python3-cryptography")
    tool = shutil.which("secret-tool")
    if not tool:
        report("FAIL", "secret-tool", "sudo dnf install libsecret")
    elif not os.environ.get("DBUS_SESSION_BUS_ADDRESS"):
        report("WARN", "Secret Service", "no D-Bus session in this shell; run from your desktop session")
    else:
        attrs = ["application", "pcms-alpha", "purpose", "health-check"]
        ok = subprocess.run([tool, "store", "--label=PCMS health check", *attrs],
                            input=b"pcms-health-check\n", capture_output=True, timeout=10).returncode == 0
        got = subprocess.run([tool, "lookup", *attrs], capture_output=True, timeout=10)
        subprocess.run([tool, "clear", *attrs], capture_output=True, timeout=10)
        if ok and got.returncode == 0 and got.stdout.strip() == b"pcms-health-check":
            report("OK", "Secret Service", "keyring unlocked; store/lookup works")
        else:
            report("FAIL", "Secret Service", "keyring locked or unavailable; unlock it (log in to the desktop) and retry")

    data, where = manifest("local.pcms.backup_vault", USER_DIRS)
    if not data:
        report("FAIL", "vault host", where)
    else:
        reply, err = exchange(data["path"], {"action": "git.status", "repositoryId": "1"})
        if reply is None:
            report("FAIL", "vault host", f"{where}: {err}")
        else:
            report("OK", "vault host", f"{where} answers ({'credential present' if reply.get('ok') else 'no test credential, as expected'})")

    data, where = manifest("local.pcms.backup_v2", USER_DIRS)
    if not data:
        report("FAIL", "source-complete backup host", where)
    else:
        reply, err = exchange(data["path"], {"action": "resource.inspect"})
        if reply and reply.get("ok") is True:
            report("OK", "source-complete backup host", f"{where} answers")
        else:
            report("FAIL", "source-complete backup host", f"{where}: {err or reply}")

    data, where = manifest("local.pcms.diagnostic_browser", USER_DIRS)
    if not data:
        report("FAIL", "diagnostic browser host", where + " (required for complete installed-XPI restart/backup diagnostics)")
    else:
        browsers = [b for b in ("firefox-developer-edition", "firefox-esr", "firefox") if shutil.which(b)]
        if browsers and shutil.which("geckodriver"):
            report("OK", "diagnostic browser host", f"{where}; uses {browsers[0]} + geckodriver")
        else:
            report("FAIL", "diagnostic browser host", "install geckodriver and supported Firefox for full isolated restart/backup diagnostics")

    data, where = manifest("com.persona.mullvad_router", SYSTEM_DIRS + USER_DIRS)
    if not data:
        report("FAIL", "PersonaMonkey bridge", "not installed — install PersonaMonkey's Mullvad bridge first (its install.sh)"
               if where.startswith("not registered") else where)
    else:
        reply, err = exchange(data["path"], {"command": "pcms.runtime_witness", "id": 1})
        if reply and reply.get("ok") is True and reply.get("schema") == 1:
            report("OK", "Refresher clock witness", "PersonaMonkey host provides the PCMS runtime witness")
        else:
            report("FAIL", "Refresher clock witness",
                   "PersonaMonkey host lacks the PCMS witness; Refresher timers will not advance. "
                   "Run: ./install.sh --with-runtime-witness")
    print()
    print("All required checks passed." if not failures else f"{failures} required check(s) failed.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
