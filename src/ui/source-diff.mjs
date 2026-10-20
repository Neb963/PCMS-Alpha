// Pure, bounded line diff for exact-source review (Myers O(ND)). Rendering
// stays in the page; no source leaves the extension.
export function isText(bytes){
  if(!(bytes instanceof Uint8Array))return false;
  if(bytes.includes(0))return false;
  try{new TextDecoder('utf-8',{fatal:true}).decode(bytes);return true;}catch{return false;}
}
export function splitLines(text){
  if(text==='')return [];
  const lines=text.replace(/\r\n/g,'\n').split('\n');
  if(lines.at(-1)==='')lines.pop();
  return lines;
}
// Returns edit script [{op:'=',a,b}|{op:'-',a}|{op:'+',b}] or null when the
// edit distance exceeds maxD (caller then shows full before/after instead).
export function diffLines(a,b,{maxD=4000}={}){
  const n=a.length,m=b.length,max=Math.min(n+m,maxD),off=max+1;
  const v=new Int32Array(2*max+3),trace=[];
  for(let d=0;d<=max;d++){
    trace.push(v.slice());
    for(let k=-d;k<=d;k+=2){
      let x=(k===-d||(k!==d&&v[off+k-1]<v[off+k+1]))?v[off+k+1]:v[off+k-1]+1;
      let y=x-k;
      while(x<n&&y<m&&a[x]===b[y]){x++;y++;}
      v[off+k]=x;
      if(x>=n&&y>=m)return backtrack(trace,a,b,off,d);
    }
  }
  return null;
}
function backtrack(trace,a,b,off,d){
  const out=[];let x=a.length,y=b.length;
  for(;d>0;d--){
    const v=trace[d],k=x-y;
    const prevK=(k===-d||(k!==d&&v[off+k-1]<v[off+k+1]))?k+1:k-1;
    const px=v[off+prevK],py=px-prevK;
    while(x>px&&y>py){out.push({op:'=',a:x-1,b:y-1});x--;y--;}
    if(x===px)out.push({op:'+',b:y-1});else out.push({op:'-',a:x-1});
    x=px;y=py;
  }
  while(x>0&&y>0){out.push({op:'=',a:x-1,b:y-1});x--;y--;}
  return out.reverse();
}
// Unified hunks with context; bounded by maxOutput lines.
export function unifiedHunks(a,b,script,{context=3,maxOutput=4000}={}){
  const keep=new Uint8Array(script.length);
  script.forEach((e,i)=>{
    if(e.op==='=')return;
    for(let j=Math.max(0,i-context);j<=Math.min(script.length-1,i+context);j++)keep[j]=1;
  });
  const hunks=[];let current=null,emitted=0,truncated=false,aLine=0,bLine=0;
  for(let i=0;i<script.length;i++){
    const e=script[i];
    if(keep[i]){
      if(emitted>=maxOutput){truncated=true;break;}
      if(!current){current={aStart:aLine+1,bStart:bLine+1,lines:[]};hunks.push(current);}
      current.lines.push(e.op==='='?' '+a[e.a]:e.op==='-'?'-'+a[e.a]:'+'+b[e.b]);
      emitted++;
    }else current=null;
    if(e.op!=='+')aLine++;
    if(e.op!=='-')bLine++;
  }
  return {hunks,truncated};
}
export const IMAGE_TYPES=Object.freeze({png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',
  gif:'image/gif',webp:'image/webp',avif:'image/avif',bmp:'image/bmp',ico:'image/x-icon'});
export function imageType(path){
  const ext=String(path).split('.').pop().toLowerCase();
  return IMAGE_TYPES[ext]||null;
}
