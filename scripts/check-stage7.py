#!/usr/bin/env python3
"""Signed Stage 7 completeness guard; fail before any claim of official I00 acceptance."""
import hashlib
import pathlib
import sys

ROOT=pathlib.Path(__file__).resolve().parent.parent
REQUIRED=['SHA256SUMS.txt','docs/audit/STAGE-7-OPERATOR-SIGNOFF.md','docs/engineering/CI-ENGINEER.md','docs/engineering/VERIFICATION.md','docs/implementation/plan.json','docs/implementation/PHASES.md','docs/specs/PCMS-Alpha-Stage-4-UI-UX-Specification.md']
missing=[p for p in REQUIRED if not (ROOT/p).is_file()]
if missing:
    raise SystemExit('BLOCKED: Stage 7 accepted baseline is not installed in GitHub checkout: '+', '.join(missing))
checks=(ROOT/'SHA256SUMS.txt').read_text().splitlines()
fail=[]
for line in checks:
    if not line.strip(): continue
    digest,name=line.split(maxsplit=1)
    name=name.lstrip('*')
    candidate=ROOT/name
    if not candidate.is_file() or hashlib.sha256(candidate.read_bytes()).hexdigest()!=digest:
        fail.append(name)
if fail: raise SystemExit('BLOCKED: signed Stage 7 document hash mismatch/missing: '+', '.join(fail))
print('Stage 7 signed package members: all verified')
