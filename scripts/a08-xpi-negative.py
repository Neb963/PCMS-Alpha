#!/usr/bin/env python3
"""Independent A08 negative controls on exact built XPI, no Firefox or effects."""
import importlib.util
import json
import pathlib
import sys
import tempfile
import zipfile

def load():
    src=pathlib.Path(__file__).with_name('a08-xpi-audit.py')
    spec=importlib.util.spec_from_file_location('a08_audit',src)
    module=importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

def modify(src,dst,replace=None,add=None,omit=()):
    replace=replace or {}
    with zipfile.ZipFile(src) as incoming, zipfile.ZipFile(dst,'w',compression=zipfile.ZIP_DEFLATED) as outgoing:
        for meta in incoming.infolist():
            if meta.filename not in omit:
                outgoing.writestr(meta,replace.get(meta.filename,incoming.read(meta.filename)))
        for name,payload in (add or {}).items():
            outgoing.writestr(name,payload)

def main():
    if len(sys.argv)!=2: raise SystemExit('usage: a08-xpi-negative.py FILE.xpi')
    source=pathlib.Path(sys.argv[1]).resolve()
    audit=load()
    assert audit.inspect(source)['pcmsInstalledNativeServices']==0
    with zipfile.ZipFile(source) as archive:
        original=archive.read('manifest.json')
        manifest=json.loads(original)
        def altered(fn):
            item=json.loads(original)
            fn(item)
            return json.dumps(item).encode()
        donor=archive.read('lib/mullvad-native.js')
        entry=archive.read('pcms/entry.mjs')
        auto=archive.read('pcms/backup-auto-boundary.mjs')
    cases=[
      ('wrong-gecko', {'manifest.json':altered(lambda m:m['browser_specific_settings']['gecko'].update(id='wrong@local'))},None,(), 'A08_GECKO_ID_DRIFT'),
      ('old-version',{'manifest.json':altered(lambda m:m.update(version='1.2.4'))},None,(),'A08_DISTRIBUTION_VERSION_NOT_ADVANCED'),
      ('donor-modification',{'lib/mullvad-native.js':donor+b'\\n// tamper\\n'},None,(),'A08_DONOR_BYTES_CHANGED'),
      ('extra-host',None,{'native/local.pcms.bad.json':'{}'},(),'A08_NATIVE_INSTALLER_OR_SCRIPT_PACKAGED'),
      ('native-dispatch',{'pcms/entry.mjs':entry+b"\\nbrowser.runtime.connectNative ('local.pcms.bad');\\n"},None,(),'A08_PCMS_NATIVE_DISPATCH_PACKAGED'),
      ('userScripts-removed',{'manifest.json':altered(lambda m:m.update(optional_permissions=[]))},None,(),'A08_USERSCRIPTS_GRANT_MISSING'),
      ('backup-disabled',{'pcms/backup-auto-boundary.mjs':auto.replace(b'createPortableRunner',b'createPlaceholderRunner')},None,(),'A08_PORTABLE_AUTOBACKUP_DISABLED'),
      ('missing-clock',None,None,('pcms/refresher-browser-clock.mjs',),'A08_REQUIRED_PRODUCTION_MODULE_MISSING')
    ]
    with tempfile.TemporaryDirectory(prefix='a08-negative-') as tmp:
        for n,(name,replace,add,omit,expected) in enumerate(cases):
            target=pathlib.Path(tmp)/(str(n)+'.xpi')
            modify(source,target,replace,add,omit)
            try:audit.inspect(target)
            except AssertionError as error:
                assert str(error).startswith(expected),(name,str(error),expected)
            else:raise AssertionError('A08_NEGATIVE_ORACLE_DID_NOT_FAIL:'+name)
            print('D A08_ADVERSE_'+name+'=PASS',flush=True)

if __name__=='__main__':main()
