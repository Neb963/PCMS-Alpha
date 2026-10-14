// Narrow background-only donation of existing PersonaMonkey portable reads.
// This module has no runtime port, page API, native call, or capability mutation.
let source=null;
export function attachPcmsBackupDonor(value){
 if(source)throw Error('BACKUP_DONOR_ALREADY_ATTACHED');
 if(typeof value?.snapshot!=='function'||typeof value?.cookies!=='function')
   throw Error('BACKUP_DONOR_INVALID');
 source=Object.freeze({snapshot:value.snapshot,cookies:value.cookies});
}
export function getPcmsBackupDonor(){
 if(!source)throw Error('BACKUP_DONOR_UNAVAILABLE');
 return source;
}
