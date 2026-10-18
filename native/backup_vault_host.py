#!/usr/bin/env python3
"""PCMS I15 restricted native-messaging host. No route, shell or file APIs.
Install separately with local.pcms.backup_vault.json in Firefox's native host directory.
The portable recovery secret is owned by the operator's Secret Service vault.
"""
import json
import os
import struct
import subprocess
import sys

HOST = "local.pcms.backup_vault"
TOOL = "/usr/bin/secret-tool"
ATTR = ["application", "pcms-alpha", "purpose", "unattended-encrypted-backup"]
MAX_INPUT = 8192
MAX_SECRET = 4096


def git_action(packet, run=subprocess.run):
    """Fixed-purpose OS Secret Service credential scope; never a file/route API."""
    import re
    if not isinstance(packet, dict):
        return {"ok": False, "code": "DENIED"}
    method = packet.get("action")
    if method not in ("git.store", "git.status", "git.get", "git.remove"):
        return {"ok": False, "code": "DENIED"}
    expected = {"action", "repositoryId", "credential"} if method == "git.store" else {"action", "repositoryId"}
    if set(packet) != expected:
        return {"ok": False, "code": "DENIED"}
    repo_id = packet.get("repositoryId")
    if not isinstance(repo_id, str) or not re.fullmatch(r"[1-9][0-9]{0,19}", repo_id):
        return {"ok": False, "code": "DENIED"}
    attrs = ["application", "pcms-alpha", "purpose", "github-credential-v1",
             "repository-id", repo_id]
    value = None
    if method == "git.store":
        secret = packet.get("credential")
        if not isinstance(secret, str) or not re.fullmatch(r"[!-~]{12,512}", secret):
            return {"ok": False, "code": "DENIED"}
        args = [TOOL, "store", "--label=PCMS Alpha GitHub credential", *attrs]
        value = (secret + "\n").encode("ascii")
    elif method == "git.remove":
        args = [TOOL, "clear", *attrs]
    else:
        args = [TOOL, "lookup", *attrs]
    try:
        completed = run(args, input=value, stdout=subprocess.PIPE,
                        stderr=subprocess.DEVNULL, check=False, timeout=6,
                        env={k: v for k, v in os.environ.items()
                             if k in ("PATH", "HOME", "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR")})
    except subprocess.TimeoutExpired:
        return {"ok": False, "code": "TIMEOUT"}
    except (OSError, ValueError):
        return {"ok": False, "code": "UNAVAILABLE"}
    # A failed lookup does NOT establish that the secret is absent: the
    # Secret Service may be locked or unreachable. Fail closed.
    if completed.returncode != 0:
        return {"ok": False, "code": "UNAVAILABLE"}
    if method in ("git.store", "git.remove"):
        return {"ok": True}
    try:
        found = completed.stdout.decode("ascii").rstrip("\n")
    except UnicodeError:
        return {"ok": False, "code": "UNAVAILABLE"}
    if not re.fullmatch(r"[!-~]{12,512}", found):
        return {"ok": False, "code": "MISSING_OR_INVALID"}
    return {"ok": True, "credential": found} if method == "git.get" else {"ok": True, "present": True}


def action(packet, run=subprocess.run):
    if isinstance(packet, dict) and isinstance(packet.get("action"), str) and packet["action"].startswith("git."):
        return git_action(packet, run)
    if not isinstance(packet, dict) or set(packet) - {"action", "passphrase"}:
        return {"ok": False, "code": "DENIED"}
    method = packet.get("action")
    if method not in ("get", "set"):
        return {"ok": False, "code": "DENIED"}
    if method == "get" and "passphrase" in packet:
        return {"ok": False, "code": "DENIED"}
    if method == "set":
        secret = packet.get("passphrase")
        if not isinstance(secret, str) or len(secret) < 12 or len(secret.encode("utf8")) > MAX_SECRET or "\x00" in secret or "\n" in secret:
            return {"ok": False, "code": "DENIED"}
        args = [TOOL, "store", "--label=PCMS Alpha portable backup recovery", *ATTR]
        value = (secret + "\n").encode("utf8")
    else:
        args, value = [TOOL, "lookup", *ATTR], None
    try:
        completed = run(args, input=value, stdout=subprocess.PIPE,
                        stderr=subprocess.DEVNULL, check=False, timeout=6,
                        env={k: v for k, v in os.environ.items()
                             if k in ("PATH", "HOME", "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR")})
    except subprocess.TimeoutExpired:
        return {"ok": False, "code": "TIMEOUT"}
    except (OSError, ValueError):
        return {"ok": False, "code": "UNAVAILABLE"}
    if completed.returncode != 0:
        return {"ok": False, "code": "UNAVAILABLE"}
    if method == "set":
        return {"ok": True}
    try:
        secret = completed.stdout.decode("utf8").rstrip("\n")
    except UnicodeError:
        return {"ok": False, "code": "UNAVAILABLE"}
    if len(secret) < 12 or len(secret.encode("utf8")) > MAX_SECRET or "\n" in secret:
        return {"ok": False, "code": "MISSING"}
    return {"ok": True, "passphrase": secret}


def main():
    length_bytes = sys.stdin.buffer.read(4)
    if len(length_bytes) != 4:
        return
    size = struct.unpack("<I", length_bytes)[0]
    if size == 0 or size > MAX_INPUT:
        response = {"ok": False, "code": "DENIED"}
    else:
        data = sys.stdin.buffer.read(size)
        try:
            response = action(json.loads(data.decode("utf8"))) if len(data) == size else {"ok": False, "code": "DENIED"}
        except (ValueError, UnicodeError):
            response = {"ok": False, "code": "DENIED"}
    encoded = json.dumps(response, separators=(",", ":")).encode("utf8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)) + encoded)
    sys.stdout.buffer.flush()


if __name__ == "__main__":
    main()
