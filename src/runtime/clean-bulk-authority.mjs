// Background-realm capability, never serialized or accepted from a UI port.
const receipts=new WeakMap();
export function issueCleanBulkAuthorization(record,index){
 const receipt=Object.freeze({});receipts.set(receipt,{id:record.id,digest:record.digest,index});return receipt;
}
export const cleanBulkAuthorization=receipt=>receipt&&receipts.has(receipt)?receipts.get(receipt):null;
