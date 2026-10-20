import { cp, mkdir, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { verifyDonor } from './verify-donor.mjs';
import { applyI01Overlay } from '../src/runtime/overlay.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const donor = path.join(root, 'donor/personamonkey');
const sourceExtension = path.join(donor, 'extension');
const stage = path.join(root, 'build/xpi-root');
const output = path.join(root, 'build/pcms-alpha-i00.xpi');
const PIN = '9995f6eadfa54be6cc0001f4e04f2a2d9b9401bf';
const ID = 'persona-route-manager@local';

export async function buildI00({ packageArchive = true } = {}) {
  // Verify all original donor bytes, modes and canonical pinned Git tree.
  await verifyDonor();
  await stat(path.join(donor, 'LICENSE'));
  await rm(stage, {recursive:true,force:true});
  await mkdir(stage,{recursive:true});
  await cp(sourceExtension, stage, {
    recursive:true,force:false,
    filter:source => path.relative(sourceExtension,source).split(path.sep)[0] !== 'tests'
  });
  const original = JSON.parse(await readFile(path.join(sourceExtension,'manifest.json'),'utf8'));
  if(original.browser_specific_settings?.gecko?.id !== ID) throw new Error('Donor Gecko ID changed');
  if(original.background?.scripts?.[0] !== 'lib/recovery-bootstrap.js') throw new Error('Unexpected donor fail-closed bootstrap');
  if(original.manifest_version !== 3) throw new Error('Unexpected donor manifest version');
  // Do not rewrite the donor background, guards, integration, permissions or native host.
  await rm(path.join(stage,'pcms'),{recursive:true,force:true});
  await cp(path.join(root,'src/ui'),path.join(stage,'pcms'),{recursive:true});
  await applyI01Overlay(root,stage);
  const combined = structuredClone(original);
  combined.name = 'PCMS Alpha + PersonaMonkey';
  combined.description = 'PCMS dashboard with PersonaMonkey protected routing and operator-authorized generator management.';
  // An action popup suppresses Firefox's action.onClicked listener.
  // The full dashboard is the sole everyday operator interface.
  combined.action = {...original.action,default_title:'Open PCMS dashboard'};
  delete combined.action.default_popup;
  // Static entry imports the donor routing gate first; background guard uses
  // the existing donor lease registry, never an independent routing controller.
  combined.background = { scripts: ['pcms/entry.mjs'], type: 'module' };
  combined.options_ui = { page:'pcms/index.html', open_in_tab:true };
  await writeFile(path.join(stage,'manifest.json'),JSON.stringify(combined,null,2)+'\n');
  if(packageArchive){
    execFileSync('python3',[path.join(root,'scripts/zip-xpi.py'),stage,output],{stdio:'inherit'});
    console.log(output);
  }
  return {original,combined,stage,output};
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  buildI00().catch(e=>{console.error(e.message);process.exitCode=1});
}
