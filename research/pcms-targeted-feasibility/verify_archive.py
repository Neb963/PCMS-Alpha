#!/usr/bin/env python3
"""Independent disk oracle: Python ZIP/CRC + SHA-256, no JavaScript reader."""
import hashlib,json,sys,zipfile
from pathlib import Path
REQUIRED={'core','modules','sources','history','journal','credentials','personas','cookies','localStorage','indexedDB','opfs','ai','native'}
def verify(path):
    raw=Path(path).read_bytes()
    with zipfile.ZipFile(path) as z:
        assert z.testzip() is None,'CRC'
        names=z.namelist();assert len(names)==len(set(names)),'duplicate'
        mb=z.read('manifest.json');m=json.loads(mb)
        assert z.read('manifest.sha256').decode()==hashlib.sha256(mb).hexdigest(),'manifest hash'
        assert (m['format'],m['version'],m['coreABI'])==('pcms-proof-zip',1,1),'compatibility'
        assert m['complete'] and not m['missing'] and m['credentialsIncluded'] and m['unencrypted'],'incomplete'
        assert set(m['required'])==REQUIRED,'inventory'
        assert {f['category'] for f in m['files']}==REQUIRED,'coverage'
        assert set(names)=={'manifest.json','manifest.sha256'}|{f['path'] for f in m['files']},'extras/missing'
        data={}
        for f in m['files']:
            b=z.read(f['path']);assert len(b)==f['bytes'] and hashlib.sha256(b).hexdigest()==f['sha256'],'bytes/hash'
            data[f['category']]=json.loads(b)
    return {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest(),'sections':data}
if __name__=='__main__':
    r=verify(sys.argv[1]);print(json.dumps({k:v for k,v in r.items() if k!='sections'},sort_keys=True))
