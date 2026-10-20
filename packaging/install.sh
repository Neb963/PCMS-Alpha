#!/usr/bin/env bash
# PCMS Alpha operator installer (Fedora / Firefox, user-scoped).
# Installs the PCMS native hosts into a stable per-user location and registers
# them for Firefox (and LibreWolf when present). Optional, explicit:
#   --with-runtime-witness  replace the installed PersonaMonkey native host
#                           with the same host plus the read-only PCMS clock
#                           witness (needs sudo; original backed up).
# No credentials are read or stored. Nothing is sent to any network service.
set -euo pipefail
PKG="$(cd -- "$(dirname -- "$0")" && pwd -P)"
EXT_ID='persona-route-manager@local'
WITH_WITNESS=0
for arg in "$@"; do
  case "$arg" in
    --with-runtime-witness) WITH_WITNESS=1 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 2 ;;
  esac
done
missing=()
command -v python3 >/dev/null || missing+=(python3)
python3 -c 'import cryptography.hazmat.primitives.ciphers' 2>/dev/null || missing+=(python3-cryptography)
command -v secret-tool >/dev/null || missing+=(libsecret)
if ((${#missing[@]})); then
  echo "Missing prerequisites: ${missing[*]}" >&2
  echo "On Fedora: sudo dnf install ${missing[*]}" >&2
  exit 1
fi
( cd "$PKG" && sha256sum --quiet -c SHA256SUMS ) || { echo 'Package checksum mismatch; re-download it.' >&2; exit 1; }
VERSION="$(cat "$PKG/VERSION")"
TARGET="${XDG_DATA_HOME:-$HOME/.local/share}/pcms-alpha/$VERSION"
mkdir -p "$TARGET"; chmod 700 "$TARGET" "$(dirname "$TARGET")"
cp -a "$PKG/native" "$PKG/scripts" "$PKG/build" "$TARGET/"
ln -sfn "$TARGET" "$(dirname "$TARGET")/current"
STABLE="$(dirname "$TARGET")/current"
dirs=("$HOME/.mozilla/native-messaging-hosts")
[[ -d "$HOME/.librewolf" ]] && dirs+=("$HOME/.librewolf/native-messaging-hosts")
for dest in "${dirs[@]}"; do
  mkdir -p "$dest"; chmod 700 "$dest"
  for pair in local.pcms.backup_vault:backup_vault_host.py \
              local.pcms.backup_v2:backup_v2_host.py \
              local.pcms.diagnostic_browser:s08_isolated_browser_host.py; do
    name="${pair%%:*}"; file="${pair#*:}"
    wrapper="$dest/$name.sh"
    printf '#!/bin/sh\nexec /usr/bin/env python3 %q\n' "$STABLE/native/$file" > "$wrapper"
    chmod 700 "$wrapper"
    python3 - "$dest/$name.json" "$name" "$wrapper" "$EXT_ID" <<'PY'
import json,sys
path,name,wrapper,ext=sys.argv[1:]
open(path,'w').write(json.dumps({'name':name,'description':'PCMS Alpha native host',
  'path':wrapper,'type':'stdio','allowed_extensions':[ext]},indent=2)+'\n')
PY
    chmod 600 "$dest/$name.json"
    echo "Registered $name in $dest"
  done
done
if ((WITH_WITNESS)); then
  HOSTDIR=/usr/local/lib/persona-mullvad-router
  [[ -f "$HOSTDIR/native_host.py" ]] || { echo "PersonaMonkey bridge not installed at $HOSTDIR (run its install.sh first)." >&2; exit 1; }
  current="$(sha256sum "$HOSTDIR/native_host.py" | cut -d' ' -f1)"
  original="$(cat "$PKG/personamonkey-host/ORIGINAL_SHA256")"
  patched="$(sha256sum "$PKG/personamonkey-host/native_host.py" | cut -d' ' -f1)"
  if [[ "$current" == "$patched" ]]; then
    echo 'PersonaMonkey host already carries the PCMS runtime witness.'
  elif [[ "$current" != "$original" ]]; then
    echo "Installed PersonaMonkey host ($current) is not the pinned version PCMS was built against; not replaced." >&2
    exit 1
  else
    sudo cp -a "$HOSTDIR/native_host.py" "$HOSTDIR/native_host.py.pcms-original"
    sudo install -m 0644 "$PKG/personamonkey-host/pcms_witness.py" "$HOSTDIR/pcms_witness.py"
    sudo install -m 0755 "$PKG/personamonkey-host/native_host.py" "$HOSTDIR/native_host.py"
    echo "Installed PCMS runtime witness into the PersonaMonkey host (backup: native_host.py.pcms-original)."
  fi
fi
echo
python3 "$PKG/pcms-native-check.py" || true
echo
echo "Restart Firefox, then install $PKG/pcms-alpha.xpi (see OPERATOR-GUIDE.md)."
