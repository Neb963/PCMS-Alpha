#!/usr/bin/env python3
"""Verify the exact signed Stage 7 contents while preserving amended runtime entrypoints."""
import hashlib
import pathlib
import json

ROOT = pathlib.Path(__file__).resolve().parent.parent
ALIASES = {
    "AGENTS.md": "docs/audit/stage7-originals/AGENTS.md",
    "docs/implementation/PHASES.md": "docs/audit/stage7-originals/docs--implementation--PHASES.md",
    "docs/engineering/AGENT-PROTOCOL.md": "docs/audit/stage7-originals/docs--engineering--AGENT-PROTOCOL.md",
    "README.md": "docs/audit/stage7-originals/README.md",
    "docs/implementation/plan.json": "docs/audit/stage7-originals/docs--implementation--plan.json",
}
SIGNOFF = "docs/audit/STAGE-7-OPERATOR-SIGNOFF.md"
MANIFEST = ROOT / "SHA256SUMS.txt"
if not MANIFEST.is_file(): raise SystemExit("BLOCKED: missing SHA256SUMS.txt")
checks = MANIFEST.read_text(encoding="utf-8").splitlines()
count = 0
errors = []
for line in checks:
    if not line.strip(): continue
    digest, name = line.split(maxsplit=1)
    name = name.lstrip("*")
    file = ROOT / ALIASES.get(name, name)
    if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest() != digest:
        errors.append(name)
    count += 1
if count != 29:
    errors.append(f"Expected 29 signed members, got {count}")
if errors: raise SystemExit("BLOCKED: signed Stage 7 document missing or changed: " + ", ".join(errors))
if "S7-Q01 = A — ACCEPTED" not in (ROOT / SIGNOFF).read_text():
    raise SystemExit("BLOCKED: Stage 7 design sign-off missing")
plan = json.loads((ROOT / "docs/implementation/plan.json").read_text())
if plan.get("status") != "STAGE_7_ACCEPTED_I00_IMPLEMENTATION_AUTHORIZED_IN_PROGRESS":
    raise SystemExit("BLOCKED: implementation grant not reconciled in plan.json")
grant = plan.get("implementationAuthorization", {})
if grant.get("scope") != ["BOOTSTRAP", "I00"] or grant.get("noLiveProviderEffects") is not True:
    raise SystemExit("BLOCKED: missing or unsafe I00 authorization record")
print("Stage 7 integrity PASS (29/29 signed originals, separate I00 implementation authorization)")
