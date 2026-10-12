#!/usr/bin/env bash
set -euo pipefail
# Browser-specific I00 acceptance: exact Firefox Developer Edition, never a release/ESR fallback.
version='154.0b10'
root="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/pcms-firefox-i00"
mkdir -p "$root"; cd "$root"
base="https://archive.mozilla.org/pub/devedition/releases/$version"
name="firefox-$version.tar.xz"
curl --fail --location --silent --show-error --retry 2 --retry-connrefused --max-time 180 "$base/linux-x86_64/en-US/$name" -o "$name"
curl --fail --location --silent --show-error --max-time 60 "$base/SHA512SUMS" -o SHA512SUMS
# Refuse silent fallback and unsigned/unchecked browser downloads.
match="$(grep -F "linux-x86_64/en-US/$name" SHA512SUMS | head -n 1)"
if [[ -z "$match" ]]; then echo 'Pinned Firefox SHA512 line absent' >&2; exit 1; fi
expected="${match%% *}"
printf '%s  %s\n' "$expected" "$name" | sha512sum --check --status
mkdir -p browser
tar -xJf "$name" -C browser
browser="$root/browser/firefox/firefox"
"$browser" --version | tee firefox-version.txt
grep -F "$version" firefox-version.txt
# Pinned geckodriver binary version; SHA is logged as evidence, not represented as a verified official digest.
geo="geckodriver-v0.36.0-linux64.tar.gz"
curl --fail --location --silent --show-error --max-time 180 "https://github.com/mozilla/geckodriver/releases/download/v0.36.0/$geo" -o "$geo"
sha256sum "$geo" > geckodriver-download.sha256
mkdir -p driver
tar -xzf "$geo" -C driver
"$root/driver/geckodriver" --version | head -n1
printf 'FIREFOX_BINARY=%s\nGECKODRIVER_BINARY=%s\n' "$browser" "$root/driver/geckodriver" >> "${GITHUB_ENV:-/dev/null}"
