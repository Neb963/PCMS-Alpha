/**
 * A01 independent product-oracle assertions. These deliberately fail on R4.
 * The required test records their violations; the standalone RED suite
 * throws their assertions to demonstrate the actual red-to-green boundary.
 */
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createGitCredentialResolver} from '../src/runtime/git-credential.mjs';
const read=p=>readFile(new URL('../'+p,import.meta.url),'utf8');
export const PRODUCT_ORACLES=Object.freeze([
  ['A01_RED_P0_GIT_NO_NATIVE_VAULT',async()=>{
    let nativeCalls=0;
    const api={storage:{local:{get:async()=>({pcmsS03Git:{
      repositoryId:'123456',repository:'Neb963/per-gens'}})}},
      runtime:{sendNativeMessage:async()=>{nativeCalls++;throw Error('UNREGISTERED');}}};
    const out=await createGitCredentialResolver(api)();
    assert.equal(nativeCalls,0,'normal Git auth called forbidden PCMS native host');
    assert.equal(out.ok,true,'stored browser-local token unusable without OS vault');
  }],
  ['A01_RED_P0_BACKUP_PASSWORDLESS',async()=>{
    assert.doesNotMatch(await read('donor/personamonkey/extension/options/data-management.js'),
      /\b(?:backupPassword|password|passphrase|encryptBackup|decryptBackup)\b/i,
      'current donor backup still includes password/encryption flow');
  }],
  ['A01_RED_P0_NO_EXTRA_HOSTS',async()=>{
    assert.doesNotMatch(await read('scripts/build-operator-package.mjs'),
      /backup_vault_host|backup_v2_host|s08_isolated_browser_host|pcms_witness/,
      'old operator package ships forbidden PCMS helpers');
  }],
  ['A01_RED_P0_PRIMARY_UI_DIRECT',async()=>{
    assert.doesNotMatch(await read('src/ui/faithful/bridge.mjs'),
      /function nativeAction\(|pcms-native-open|nativeControl\(/,
      'primary UI delegates to hidden legacy DOM');
  }],
  ['A01_RED_P0_PUBLISH_DISPATCH',async()=>{
    assert.doesNotMatch(await read('src/ui/faithful/bridge.mjs'),
      /does not itself publish/,
      'primary UI approval explicitly is not provider publication');
  }],
  ['A01_RED_P0_CLOCK_NATIVE_FREE',async()=>{
    assert.doesNotMatch(await read('src/runtime/refresher-qualified-clock.mjs'),
      /nativeClock|witness|bootId|monotonic/i,
      'old active-time clock depends on witness evidence');
  }]
]);
export async function inspectProductOracles(){
  const entries=[];
  for(const [id,assertProduct] of PRODUCT_ORACLES){
    try {await assertProduct();entries.push({id,state:'ASSERTION_GREEN'});}
    catch(e){
      if(e?.code!=='ERR_ASSERTION')throw e;
      entries.push({id,state:'ASSERTION_RED',reason:String(e.message).slice(0,200)});
    }
  }
  return {schema:'pcms.a01.oracle-observations/1',scope:'R4_SOURCE_AND_MOCK_NO_PROVIDER',
    productAcceptance:'NOT_ACCEPTED_BY_A01',entries};
}
