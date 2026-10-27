#!/usr/bin/env python3
"""Rebuild the previously verified combined XPI from its exact public Git tree.

CI/developer fixture only. Never accesses the user's Firefox profile, secrets,
private repositories, or live provider. Used to prove real installed 1.2.18
-> 1.2.19 update, rather than testing solely donor 1.2.0 -> 1.2.19.
"""
import hashlib
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import zipfile

BASE_COMMIT = 'a3081ad84d25dbc4d73b2bcb30af6761af2083fb'
BASE_TREE = '3d1aae973f91319f9f9672e6d6d6df4d6277cbf8'
BASE_XPI_SHA256 = 'aa372c2aae803cab093f8453331b7f48c2ff274872594bc99c834160201e3fcc'
GECKO_ID = 'persona-route-manager@local'


def git(root, *args, capture=False):
    return subprocess.run(['git', *args], cwd=root, check=True,
                          text=capture, stdout=subprocess.PIPE if capture else subprocess.DEVNULL,
                          stderr=subprocess.PIPE if capture else None).stdout


def rebuild(output):
    root = pathlib.Path(__file__).resolve().parent.parent
    output = pathlib.Path(output).resolve()
    # A shallow Actions PR checkout normally lacks the previous release tree.
    # Fetch an exact public SHA; never fetch, checkout or mutate a shared branch.
    if subprocess.run(['git', 'cat-file', '-e', BASE_COMMIT + '^{commit}'],
                      cwd=root, capture_output=True).returncode:
        git(root, 'fetch', '--no-tags', '--depth=1', 'origin', BASE_COMMIT)
    with tempfile.TemporaryDirectory(prefix='pcms-f4-previous-') as temp:
        checkout = pathlib.Path(temp) / 'previous'
        git(root, 'worktree', 'add', '--detach', str(checkout), BASE_COMMIT)
        try:
            assert git(checkout, 'rev-parse', 'HEAD', capture=True).strip() == BASE_COMMIT
            assert git(checkout, 'rev-parse', 'HEAD^{tree}', capture=True).strip() == BASE_TREE
            subprocess.run(['node', 'scripts/build-i00.mjs'], cwd=checkout,
                           check=True, stdout=subprocess.DEVNULL)
            old = checkout / 'build/pcms-alpha-i00.xpi'
            raw = old.read_bytes()
            digest = hashlib.sha256(raw).hexdigest()
            assert digest == BASE_XPI_SHA256, ('F4_PREVIOUS_RELEASE_BYTES_CHANGED', digest)
            with zipfile.ZipFile(old) as archive:
                manifest = json.loads(archive.read('manifest.json'))
            assert manifest['version'] == '1.2.18', manifest
            assert manifest['browser_specific_settings']['gecko']['id'] == GECKO_ID, manifest
            output.parent.mkdir(parents=True, exist_ok=True)
            output.write_bytes(raw)
            print('D F4_PINNED_PREVIOUS_SOURCE_TREE_AND_XPI=PASS', flush=True)
            return output
        finally:
            git(root, 'worktree', 'remove', '--force', str(checkout))


if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('usage: f4-previous-package.py /tmp/old-combined.xpi')
    rebuild(sys.argv[1])
