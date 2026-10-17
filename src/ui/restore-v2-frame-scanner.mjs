// S02 second-pass authenticated-plaintext frame scanner.
// This function provides NO cryptographic authority: the caller must first
// obtain terminal native authentication and a held inactive restore stage.
// It never buffers plaintext in proportion to the full archive: BLOB, CANONICAL
// and END are capped independently, while DONOR is emitted as bounded chunks.
import {V2_FRAME,V2_LIMITS} from './backup-v2-codec.mjs';
const HEADER=9,MAX_BLOBS=100000,MAX_ROWS=100000;
const check=(v,c)=>{if(!v)throw Error(c)};
const maxFor={1:V2_LIMITS.blob,2:V2_LIMITS.canonical,
  3:V2_LIMITS.donor,255:V2_LIMITS.end};
const category={1:'BLOB',2:'CANONICAL',3:'DONOR',255:'END'};

export async function* scanV2AuthenticatedFrames(parts){
  check(parts&&typeof parts[Symbol.asyncIterator]==='function',
    'RESTORE_V2_AUTHENTICATED_ITERATOR_REQUIRED');
  let header=new Uint8Array(HEADER),headerUsed=0,kind=null,
      expected=0,received=0,body=null,phase=0,
      blobs=0,rows=0,donors=0,ends=0,streamBytes=0;
  for await(const part of parts){
    check(ArrayBuffer.isView(part)&&part.byteLength>0&&
      part.byteLength<=65536,'RESTORE_V2_STREAM_FRAGMENT_INVALID');
    const bytes=new Uint8Array(part.buffer,part.byteOffset,part.byteLength);
    let offset=0;
    while(offset<bytes.length){
      if(phase===4)throw Error('RESTORE_V2_TRAILING_DATA');
      if(kind===null){
        const take=Math.min(HEADER-headerUsed,bytes.length-offset);
        header.set(bytes.subarray(offset,offset+take),headerUsed);
        headerUsed+=take;offset+=take;streamBytes+=take;
        if(headerUsed<HEADER)continue;
        const tag=header[0],len=new DataView(header.buffer).getBigUint64(1,false);
        check(Object.hasOwn(maxFor,tag),'RESTORE_V2_FRAME_TAG_INVALID');
        check(len>0n&&len<=BigInt(maxFor[tag]),'RESTORE_V2_FRAME_BOUND_INVALID');
        check(tag!==V2_FRAME.BLOB||len>=32n,'RESTORE_V2_BLOB_INVALID');
        if(tag===V2_FRAME.BLOB){
          check(phase===0&&blobs<MAX_BLOBS,'RESTORE_V2_ORDER_INVALID');
          blobs++;
        }else if(tag===V2_FRAME.CANONICAL){
          check(phase<=1&&rows<MAX_ROWS,'RESTORE_V2_ORDER_INVALID');
          rows++;phase=1;
        }else if(tag===V2_FRAME.DONOR){
          check(phase<=1&&donors===0,'RESTORE_V2_ORDER_INVALID');
          donors++;phase=2;
        }else{
          check(phase===2&&ends===0,'RESTORE_V2_ORDER_INVALID');
          ends++;phase=3;
        }
        kind=tag;expected=Number(len);received=0;headerUsed=0;
        body=tag===V2_FRAME.DONOR?null:new Uint8Array(expected);
      }
      const take=Math.min(expected-received,bytes.length-offset);
      const slice=bytes.subarray(offset,offset+take);
      if(body)body.set(slice,received);
      received+=take;offset+=take;streamBytes+=take;
      if(kind===V2_FRAME.DONOR&&take){
        // Caller may persist the opaque envelope incrementally, without an
        // archive-sized buffer, but must still invoke the donor decoder.
        yield {kind:'DONOR_FRAGMENT',bytes:Uint8Array.from(slice),
          offset:received-take,remaining:expected-received};
      }
      if(received===expected){
        const tag=kind;kind=null;expected=0;received=0;
        if(tag===V2_FRAME.DONOR){
          yield {kind:'DONOR_END',bytes:streamBytes};continue;
        }
        yield {kind:category[tag],bytes:body};
        body=null;
        if(tag===V2_FRAME.END)phase=4;
      }
    }
  }
  check(phase===4&&kind===null&&headerUsed===0&&donors===1&&ends===1,
    'RESTORE_V2_INCOMPLETE');
}
