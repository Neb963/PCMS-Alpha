// Compatibility entry for historical automation: A08 is XPI-only.
// Never package installers, patched donor hosts, vaults or auxiliary services.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {buildI00} from './build-i00.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export async function buildOperatorPackage(){
  const {output,combined}=await buildI00();
  const xpi=await readFile(output);
  const digest=createHash('sha256').update(xpi).digest('hex');
  return {xpi:output,xpiSha256:digest,geckoId:combined.browser_specific_settings.gecko.id,
    distribution:'XPI_ONLY',extraNativeServices:0};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  buildOperatorPackage().then(result=>console.log(JSON.stringify(result,null,2)))
    .catch(error=>{console.error(error.message);process.exitCode=1});
}
