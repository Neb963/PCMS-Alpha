// Minimal deterministic ZIP writer: two known safe UTF-8 files only. Stored
// entries, no source data, no zip library, no external modules or credentials.
function u16(buf, n, x) { buf[n]=x & 255;buf[n+1]=(x>>>8)&255; }
function u32(buf, n, x) { u16(buf,n,x);u16(buf,n+2,x>>>16); }
function crc32(bytes) {
  let crc=0xffffffff;
  for (const b of bytes) {
    crc ^= b;
    for (let i=0;i<8;i++) crc = (crc>>>1) ^ (crc&1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff)>>>0;
}
export function makeSafeArchive(safeReport) {
  if (!safeReport || safeReport.schema !== 'PCMS_SAFE_DIAGNOSTIC_V1')
    throw new TypeError('Unvalidated diagnostic report');
  // Recreate from EXPLICIT known fields. No unknown property is serialized.
  const { createSafeReport } = makeSafeArchive;
  const validated = createSafeReport({
    wakeCount:safeReport.wake?.count,
    alarmCount:safeReport.wake?.alarmCount,
    lastWake:safeReport.wake?.lastEvent,
    previousBoot:safeReport.wake?.previousBootObserved,
    restoreActive:safeReport.sections?.restore==='RESTORE_IN_PROGRESS' ? true : undefined
  });
  const safeJson=JSON.stringify(validated,null,2)+'\n';
  const markdown='# PCMS Alpha — emergency diagnostics\n\n'
    +'This export is redacted. It is not a backup and contains no provider secrets.\n\n'
    +'Canonical data: section_unavailable (independent recovery view).\n'
    +'No remote effects were performed to create this report.\n';
  const encoder=new TextEncoder();
  const entries=[['report.json',safeJson],['README.md',markdown]];
  const chunks=[], central=[];
  let offset=0;
  for (const [filename,source] of entries) {
    const name=encoder.encode(filename), body=encoder.encode(source);
    const crc=crc32(body), length=body.length;
    if (length>65536) throw Error('Diagnostic size limit');
    const local=new Uint8Array(30+name.length+length);
    u32(local,0,0x04034b50);u16(local,4,20);u16(local,8,0);u16(local,10,0);
    u32(local,14,crc);u32(local,18,length);u32(local,22,length);u16(local,26,name.length);
    local.set(name,30);local.set(body,30+name.length);chunks.push(local);
    const directory=new Uint8Array(46+name.length);
    u32(directory,0,0x02014b50);u16(directory,4,20);u16(directory,6,20);
    u32(directory,16,crc);u32(directory,20,length);u32(directory,24,length);
    u16(directory,28,name.length);u32(directory,42,offset);
    directory.set(name,46);central.push(directory);
    offset+=local.length;
  }
  const end=new Uint8Array(22);
  u32(end,0,0x06054b50);u16(end,8,entries.length);u16(end,10,entries.length);
  const directoryLength=central.reduce((n,x)=>n+x.length,0);
  u32(end,12,directoryLength);u32(end,16,offset);
  const zip=new Uint8Array(offset+directoryLength+22);
  let pos=0;
  for(const part of [...chunks,...central,end]) {zip.set(part,pos);pos+=part.length;}
  return zip;
}
import { createSafeReport as safeReportFactory } from './safe-report.mjs';
makeSafeArchive.createSafeReport=safeReportFactory;
