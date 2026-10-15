// Operator/local-agent helper. No network, provider writes or private source.
// Run using Node 22+. Keep the private key outside ChatGPT and the extension.
import {webcrypto} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
const canonical=x=>JSON.stringify(x,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?
  Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
const hash=async x=>Buffer.from(await webcrypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical(x)))).toString('hex');
const [, ,action,...args]=process.argv;
if(action==='key'){
  if(args.length!==1)throw Error('Usage: node i17-h04-review.mjs key <new-key-directory>');
  await mkdir(args[0],{recursive:false,mode:0o700});
  const pair=await webcrypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
  const secret=await webcrypto.subtle.exportKey('jwk',pair.privateKey),raw=await webcrypto.subtle.exportKey('jwk',pair.publicKey);
  const publicKey={kty:raw.kty,crv:raw.crv,x:raw.x,y:raw.y};
  await writeFile(path.join(args[0],'private-key.json'),JSON.stringify(secret)+'\n',{flag:'wx',mode:0o600});
  await writeFile(path.join(args[0],'public-key.json'),JSON.stringify(publicKey,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Public reviewer fingerprint: '+await hash(publicKey));
  console.log('Pin only public-key.json in PCMS. Do not upload or paste private-key.json.');
}else if(action==='sign'){
  if(args.length!==7||args[6]!=='--approve-repeated-use')throw Error(
    'Usage: node i17-h04-review.mjs sign <private-key.json> <challenge.json> <evidence-reference> <min-interval-minutes> <max-turn-ms> <output.json> --approve-repeated-use');
  const [privatePath,challengePath,evidence,min,max,output]=args;
  const envelope=JSON.parse(await readFile(challengePath,'utf8')),challenge=envelope.challenge;
  if(challenge?.kind!=='PCMS_H04_REVIEW'||challenge.method!=='GUARDED_SOURCE_SAVE'||challenge.policy!=='html_prefix_v1'||
    !/^[A-Za-z0-9_.:/-]{8,240}$/.test(evidence)||!Number.isSafeInteger(Number(min))||Number(min)<10||Number(min)>1440||
    !Number.isSafeInteger(Number(max))||Number(max)<envelope.resource?.turnMs||Number(max)>10000)
    throw Error('Invalid challenge or reviewed interval/resource limit');
  // The review flag is a deliberate reviewer decision, never an automated
  // assertion that one feed appearance proves unlimited repeated efficacy.
  const now=Date.now(),payload={...challenge,reviewedAt:now,validUntil:now+86400000,
    repeatedUsePermitted:true,permissionEvidence:evidence,minimumIntervalMs:Number(min)*60000,maxTurnMs:Number(max)};
  const secret=JSON.parse(await readFile(privatePath,'utf8'));
  const key=await webcrypto.subtle.importKey('jwk',secret,{name:'ECDSA',namedCurve:'P-256'},false,['sign']);
  const signature=Buffer.from(await webcrypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},key,
    new TextEncoder().encode(canonical(payload)))).toString('base64');
  await writeFile(output,JSON.stringify({payload,signature},null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('Signed exact target '+payload.slug+'; review expires '+new Date(payload.validUntil).toISOString());
}else throw Error('Use key or sign. No action was taken.');
