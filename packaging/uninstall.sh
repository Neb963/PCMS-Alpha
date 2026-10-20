#!/usr/bin/env bash
# Remove PCMS native-host registrations. Keeps backups, Secret Service entries
# and Firefox data. Restores the original PersonaMonkey host if PCMS replaced it.
set -euo pipefail
for dest in "$HOME/.mozilla/native-messaging-hosts" "$HOME/.librewolf/native-messaging-hosts"; do
  for name in local.pcms.backup_vault local.pcms.backup_v2 local.pcms.diagnostic_browser; do
    rm -f "$dest/$name.json" "$dest/$name.sh"
  done
done
HOSTDIR=/usr/local/lib/persona-mullvad-router
if [[ -f "$HOSTDIR/native_host.py.pcms-original" ]]; then
  sudo install -m 0755 "$HOSTDIR/native_host.py.pcms-original" "$HOSTDIR/native_host.py"
  sudo rm -f "$HOSTDIR/pcms_witness.py" "$HOSTDIR/native_host.py.pcms-original"
  echo 'Restored the original PersonaMonkey native host.'
fi
echo 'PCMS native hosts unregistered. Installed files remain in ~/.local/share/pcms-alpha.'
