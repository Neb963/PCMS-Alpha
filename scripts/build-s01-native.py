#!/usr/bin/env python3
"""Prepare but NEVER install the S01 experimental PersonaMonkey native host.

Keep the signed donor original and existing operator native host untouched.
The generated candidate contains a read-only witness on the original framing
and existing browser-owned native pipe. No additional process/daemon.
"""
from pathlib import Path
import hashlib
import shutil

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "donor/personamonkey/native/native_host.py"
WITNESS = ROOT / "native/s01-runtime-witness.py"
OUT = ROOT / "build/s01-native-candidate"


def unique_replace(text, needle, replacement, label):
    if text.count(needle) != 1:
        raise ValueError("S01 native host anchor mismatch: " + label)
    return text.replace(needle, replacement)


def build():
    host = SOURCE.read_text(encoding="utf-8")
    host = unique_replace(host, "import sys\n", "import sys\nfrom pcms_witness import RuntimeWitness\n\nPCMS_WITNESS = RuntimeWitness()\n", "imports")
    host = unique_replace(host, "            response = call_daemon(req)\n",
        """            if req.get("command") == "pcms.runtime_witness":
                if set(req) - {"command", "id"}:
                    response = {"ok": False, "code": "WITNESS_INVALID_REQUEST"}
                else:
                    response = PCMS_WITNESS.sample()
            else:
                response = call_daemon(req)
            if "id" in req:
                response["id"] = req["id"]
""", "native dispatch")
    OUT.mkdir(parents=True, exist_ok=True)
    target = OUT / "native_host.py"
    target.write_text(host, encoding="utf-8")
    shutil.copyfile(WITNESS, OUT / "pcms_witness.py")
    return {"host": str(target), "sha256": hashlib.sha256(target.read_bytes()).hexdigest()}


if __name__ == "__main__":
    result = build()
    print(result["host"])
    print(result["sha256"])
