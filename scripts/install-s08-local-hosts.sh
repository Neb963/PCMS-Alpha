#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "$0")/.." && pwd -P)"
DEST="$HOME/.mozilla/native-messaging-hosts"
command -v python3 >/dev/null && command -v secret-tool >/dev/null || {
  echo 'Python 3 and secret-tool are required.' >&2; exit 1;
}
python3 -c 'from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes' || exit 1
mkdir -p "$DEST"
chmod 700 "$DEST"
ROOT="$ROOT" DEST="$DEST" python3 - <<'PYS'
import os, pathlib, json, shlex
root=pathlib.Path(os.environ['ROOT']); dest=pathlib.Path(os.environ['DEST'])
for name,file in [('local.pcms.backup_vault','backup_vault_host.py'),
                  ('local.pcms.backup_v2','backup_v2_host.py')]:
    source=root/'native'/file
    if not source.is_file(): raise SystemExit('Missing host '+str(source))
    wrapper=dest/(name+'.sh')
    wrapper.write_text('#!/bin/sh\nexec /usr/bin/env python3 '+shlex.quote(str(source))+'\n')
    wrapper.chmod(0o700)
    manifest={'name':name,'description':'PCMS user-scoped native host',
              'path':str(wrapper),'type':'stdio',
              'allowed_extensions':['persona-route-manager@local']}
    path=dest/(name+'.json')
    path.write_text(json.dumps(manifest,indent=2)+'\n')
    path.chmod(0o600)
    print('Configured '+name)
PYS
printf '%s\n' 'Restart Firefox to load the native-message host manifests.'
