import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const read=path=>readFile(new URL(path,root),'utf8');

test('R4 operator package cannot report success with inaccessible native helpers',async()=>{
 const installer=await read('packaging/install.sh');
 const check=await read('packaging/pcms-native-check.py');
 const pkg=await read('scripts/build-operator-package.mjs');
 assert.match(installer,/sha256sum --quiet -c SHA256SUMS/);
 assert.match(installer,/if ! python3 "\$PKG\/pcms-native-check\.py"; then/);
 assert.doesNotMatch(installer,/pcms-native-check\.py" \|\| true/);
 assert.match(installer,/exit 1\nfi/);
 for(const host of ['local.pcms.backup_vault','local.pcms.backup_v2',
   'local.pcms.diagnostic_browser'])assert.ok(installer.includes(host));
 assert.match(installer,/persona-route-manager@local/);
 assert.match(check,/report\("FAIL", "diagnostic browser host"/);
 assert.match(check,/report\("FAIL", "Refresher clock witness"/);
 assert.match(check,/return 1 if failures else 0/);
 assert.match(pkg,/await cp\(path\.join\(root,'packaging',f\),path\.join\(out,f\)\)/);
 assert.match(pkg,/SHA256SUMS/);
});
