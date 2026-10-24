#!/usr/bin/env python3
"""A08 exact distributable XPI audit; no native services installed or invoked."""
import hashlib
import json
import pathlib
import posixpath
import re
import sys
import zipfile

ID = 'persona-route-manager@local'
DONOR = 'com.persona.mullvad_router'
CRITICAL = ('lib/recovery-bootstrap.js', 'lib/routing-gate.js',
            'lib/mullvad-native.js', 'content/userscript-trigger.js')

def inspect(path, *, donor_root=pathlib.Path('donor/personamonkey/extension')):
    raw=pathlib.Path(path).read_bytes()
    with zipfile.ZipFile(path) as z:
        names=z.namelist()
        if len(names)!=len(set(names)):
            raise AssertionError('A08_DUPLICATE_ZIP_PATH')
        if any(n.startswith('/') or '..' in pathlib.PurePosixPath(n).parts for n in names):
            raise AssertionError('A08_ZIP_PATH_ESCAPE')
        if any(n.endswith(('.sh','.py','.tar','.gz','.deb','.rpm')) or n.startswith(('native/','packaging/','scripts/')) for n in names):
            raise AssertionError('A08_NATIVE_INSTALLER_OR_SCRIPT_PACKAGED')
        manifest=json.loads(z.read('manifest.json'))
        if manifest.get('browser_specific_settings',{}).get('gecko',{}).get('id')!=ID:
            raise AssertionError('A08_GECKO_ID_DRIFT')
        if manifest.get('version')!='1.2.6':
            raise AssertionError('A08_DISTRIBUTION_VERSION_NOT_ADVANCED')
        if manifest.get('manifest_version')!=3 or manifest.get('background',{}).get('scripts')!=['pcms/entry.mjs']:
            raise AssertionError('A08_BACKGROUND_NOT_PRODUCTION')
        if manifest.get('action',{}).get('default_popup'):
            raise AssertionError('A08_HIDDEN_POPUP_REACTIVATED')
        if 'nativeMessaging' not in manifest.get('permissions',[]):
            raise AssertionError('A08_DONOR_NATIVE_PERMISSION_REMOVED')
        if 'userScripts' not in manifest.get('optional_permissions',[]):
            raise AssertionError('A08_USERSCRIPTS_GRANT_MISSING')
        required=('pcms/index.html','pcms/entry.mjs','pcms/faithful/bridge.mjs',
                  'pcms/portable-runner.mjs','pcms/restore-boundary.mjs',
                  'pcms/refresher-browser-clock.mjs','lib/mullvad-native.js')
        if not set(required).issubset(names):
            raise AssertionError('A08_REQUIRED_PRODUCTION_MODULE_MISSING')
        for file in CRITICAL:
            if z.read(file)!=(donor_root/file).read_bytes():
                raise AssertionError('A08_DONOR_BYTES_CHANGED:'+file)
        if DONOR.encode() not in z.read('lib/mullvad-native.js'):
            raise AssertionError('A08_DONOR_ROUTING_HOST_MISSING')
        # Reachability is proved from the actual installed Firefox roots,
        # not by grepping historical mock fixtures that old B tests import
        # directly. Traverse imported PCMS modules conservatively and reject
        # missing relative imports. No UI/background entry may invoke a
        # supplemental native host; donor-owned bridge remains separate.
        nameset=set(names)
        roots={'pcms/entry.mjs'}
        for html in names:
            if not html.startswith('pcms/') or not html.endswith('.html'):
                continue
            data=z.read(html)
            for ref in re.findall(rb'<script\b[^>]*\bsrc=[\x22\x27]([^\x22\x27]+)',data):
                module=posixpath.normpath(posixpath.join(
                    posixpath.dirname(html),ref.decode().split('?')[0]))
                if module.startswith('pcms/') and module.endswith(('.mjs','.js')):
                    roots.add(module)
        visited=set()
        pending=list(roots)
        while pending:
            member=pending.pop()
            if member in visited:
                continue
            if member not in nameset:
                raise AssertionError('A08_PRODUCTION_MODULE_IMPORT_MISSING:'+member)
            visited.add(member)
            body=z.read(member)
            if re.search(rb'\b(?:connectNative|sendNativeMessage)\s*\(',body):
                raise AssertionError('A08_PCMS_NATIVE_DISPATCH_REACHABLE:'+member)
            # Static imports, re-exports and literal dynamic imports. Variable
            # imports are not proof of safety and are independently browser-
            # exercised by the packaged smoke test.
            references=re.findall(
                rb'(?:\bfrom\s*|\bimport\s*(?:\(\s*)?)[\x22\x27](\.{1,2}/[^\x22\x27]+)[\x22\x27]',
                body)
            for ref in references:
                child=posixpath.normpath(posixpath.join(
                    posixpath.dirname(member),ref.decode().split('?')[0]))
                if child.startswith('pcms/') and child.endswith(('.mjs','.js')):
                    pending.append(child)
        retired=set(n for n in names if n.startswith('pcms/') and
            n.endswith(('.mjs','.js')))-visited
        for forbidden in ('pcms/backup-v2-session.mjs',
                          'pcms/backup-auto-run.mjs',
                          'pcms/restore-v2-candidate.mjs'):
            if forbidden not in retired:
                raise AssertionError('A08_RETIRED_NATIVE_MODULE_REACHABLE:'+forbidden)
        # The modern startup module must retain full browser-local automation.
        entry=z.read('pcms/entry.mjs')
        auto=z.read('pcms/backup-auto-boundary.mjs')
        restore=z.read('pcms/restore-boundary.mjs')
        if b'./backup-auto-boundary.mjs' not in entry or b'createPortableRunner' not in auto:
            raise AssertionError('A08_PORTABLE_AUTOBACKUP_DISABLED')
        if b'APPLY_PORTABLE' not in restore or b'RECONCILE_PORTABLE' not in restore:
            raise AssertionError('A08_PORTABLE_RESTORE_DISABLED')
        # No PCMS native host manifest or executable can be packaged. Only the
        # original donor's own nativeMessaging capability is retained.
        host_manifest=[n for n in names if n.endswith('.json') and (
            '/native-messaging-hosts/' in '/'+n or n.startswith('native/'))]
        if host_manifest:
            raise AssertionError('A08_EXTRA_NATIVE_HOST_MANIFEST')
        return {'schema':'pcms.a08.distribution/1',
                'scope':'EXACT_ZIP_BYTES_NOT_OPERATOR_ENVIRONMENT',
                'xpiSha256':hashlib.sha256(raw).hexdigest(),
                'geckoId':ID,'version':manifest['version'],
                'zipEntries':len(names),'donorCriticalFilesVerified':len(CRITICAL),
                'donorNativeBridge':'PRESERVED_BY_BYTE_COMPARISON',
                'productionPcmsModulesReachable':len(visited),
                'retiredHistoricalModulesOutsideProductionGraph':len(retired),
                'pcmsInstalledNativeServices':0,'pcmsInstallerFiles':0,
                'livePerchance':'NOT_TESTED','privateGit':'NOT_TESTED',
                'operatorHost':'NOT_TESTED'}

def main():
    if len(sys.argv)!=2: raise SystemExit('usage: a08-xpi-audit.py FILE.xpi')
    print(json.dumps(inspect(sys.argv[1]),indent=2,sort_keys=True))
if __name__=='__main__':main()
