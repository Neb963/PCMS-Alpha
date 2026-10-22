#!/usr/bin/env python3
"""A01 exact-byte read-only package/host census, never installs a native helper.

Usage: python3 scripts/a01-package-census.py build/pcms-alpha-i00.xpi [build/pcms-alpha-operator.tar.gz]
All observations concern build artifacts, not current operator host registrations.
"""
import hashlib
import io
import json
import pathlib
import re
import sys
import tarfile
import zipfile

DONOR_HOST='com.persona.mullvad_router'
GID='persona-route-manager@local'
FORBIDDEN=re.compile(rb'local[.]pcms[.][a-z_]+')
def sha(raw):return hashlib.sha256(raw).hexdigest()

def inspect(xpi_bytes,tar_bytes=None):
    with zipfile.ZipFile(io.BytesIO(xpi_bytes),'r') as z:
        names=set(z.namelist())
        if 'manifest.json' not in names:raise AssertionError('XPI_MANIFEST_MISSING')
        manifest=json.loads(z.read('manifest.json'))
        if manifest.get('browser_specific_settings',{}).get('gecko',{}).get('id')!=GID:
            raise AssertionError('GECKO_ID_DRIFT')
        if manifest.get('background',{}).get('scripts')!=['pcms/entry.mjs']:
            raise AssertionError('BACKGROUND_BOOTSTRAP_DRIFT')
        if not {'pcms/index.html','pcms/entry.mjs','lib/mullvad-native.js'}<=names:
            raise AssertionError('PACKAGED_REQUIRED_ENTRY_MISSING')
        donor=z.read('lib/mullvad-native.js')
        if DONOR_HOST.encode() not in donor:
            raise AssertionError('DONOR_NATIVE_BRIDGE_REMOVED')
        host_refs={}
        for name in sorted(names):
            if not name.endswith(('.js','.mjs','.json','.html')):continue
            data=z.read(name)
            hits=sorted(set(x.decode() for x in FORBIDDEN.findall(data)))
            if hits:host_refs[name]=hits
        packaged={
            'xpiSha256':sha(xpi_bytes),'geckoId':GID,
            'version':manifest.get('version'),
            'backgroundEntry':'pcms/entry.mjs',
            'donorBridgePresent':True,
            'optionalUserScriptsDeclared':'userScripts' in manifest.get('optional_permissions',[]),
            'nativeHostsReferencedByPackagedCode':host_refs,
            'installedHostRegistration':'UNKNOWN_NOT_INSPECTED',
            'userScriptsGranted':'UNKNOWN_NOT_INSPECTED',
            'completeOperatorWorkflow':'NOT_TESTED'}
    package=None
    if tar_bytes is not None:
        with tarfile.open(fileobj=io.BytesIO(tar_bytes),mode='r:gz') as tf:
            members=sorted(x for x in tf.getnames() if tf.getmember(x).isfile())
            inner=tf.extractfile('pcms-alpha-operator/pcms-alpha.xpi').read()
            if sha(inner)!=sha(xpi_bytes):raise AssertionError('OPERATOR_XPI_MISMATCH')
            helpers=[x for x in members if '/native/' in x or
                x.endswith(('/install.sh','/pcms-native-check.py','/pcms_witness.py'))]
            package={'operatorTarSha256':sha(tar_bytes),
                'containsSameXpi':True,'oldPcmsHelperEntries':helpers,
                'installedOsHostStatus':'NOT_TESTED'}
    return {'schema':'pcms.a01.packaging-census/1',
            'source':'EXACT_LOCAL_BUILD_BYTES_NO_INSTALLATION',
            'installedProductAcceptance':'NOT_TESTED',
            'xpi':packaged,'operatorTar':package}

def main():
    if len(sys.argv) not in (2,3):raise SystemExit(__doc__)
    xpi=pathlib.Path(sys.argv[1]).read_bytes()
    tar=pathlib.Path(sys.argv[2]).read_bytes() if len(sys.argv)==3 else None
    print(json.dumps(inspect(xpi,tar),sort_keys=True,indent=2))

if __name__=='__main__':main()
