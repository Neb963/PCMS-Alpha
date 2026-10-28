import {readFile} from 'node:fs/promises';
export async function fixture() {
  const pkg=JSON.parse(await readFile(new URL('./module-v1.json',import.meta.url)));
  const stores=['firefox-container-17','firefox-container-29'];
  return {
    core:{records:[{id:'account-a',personaId:'persona-a',slug:'synthetic-only'}],config:{backupHours:6,journalMinutes:30,retentionDays:90},paused:false,queue:['safe','unknown'],jobs:[{id:'safe',status:'Waiting',effect:'none',jobABI:1,input:'retained'},{id:'unknown',status:'Unknown',effect:'sent',jobABI:1,requestId:'mutation-1',lease:'stale'}],schedule:{activeRemaining:86400000,sleepUntil:1900000000000},exportReceipts:[]},
    modules:{package:pkg,settings:{test:{draft:'unsaved input'}},enabled:true},
    sources:{'main.pjs':'output\n  synthetic ✓\n','index.html':'<p>synthetic</p>','src/image.bin':{base64:'AAH+/w==',mime:'application/octet-stream'},instructionCopies:{'src/agents.md':'unchanged input'}},
    history:[{version:1,source:'old\n'},{version:2,source:'new\n'}],
    journal:[{sequence:1,operation:'fixture-created',result:'Complete'}],
    credentials:{githubToken:'SYNTHETIC_NOT_A_TOKEN_☃',otherSecret:'fake-password\u0000tail'},
    personas:{items:stores.map((cookieStoreId,i)=>({id:i?'persona-b':'persona-a',cookieStoreId,name:`Synthetic ${i}`,routeId:`route-${i}`})),routes:[{id:'route-0',mode:'protected',entry:'entry-a',proxyPassword:'SYNTHETIC_PROXY_SECRET'},{id:'route-1',mode:'protected',entry:'entry-b'}],mappings:{'account-a':'persona-a'},routeVerification:'Required'},
    cookies:stores.flatMap(storeId=>[{storeId,name:'session',value:'SYNTHETIC_SESSION',domain:'127.0.0.1',hostOnly:true,path:'/',secure:false,httpOnly:true,sameSite:'lax',session:true,firstPartyDomain:''},{storeId,name:'session',value:'SYNTHETIC_PARTITION',domain:'127.0.0.1',hostOnly:true,path:'/',secure:false,httpOnly:false,sameSite:'lax',session:false,expirationDate:1900000000,firstPartyDomain:'',partitionKey:{topLevelSite:'http://localhost',hasCrossSiteAncestor:true}}]),
    localStorage:stores.map(storeId=>({storeId,origin:'http://127.0.0.1:8765',values:{login:'SYNTHETIC_LOGIN',aiAgentSid:'sid-1',aiAgentRoutingKey:'SYNTHETIC_AI_ROUTE',repair:'pending'}})),
    indexedDB:stores.map(storeId=>({storeId,origin:'http://127.0.0.1:8765',databases:[{name:'pcms-synthetic',version:1,stores:[{name:'records',keyPath:null,autoIncrement:false,indexes:[{name:'byKind',keyPath:'kind',unique:false,multiEntry:false}],records:[{key:'draft',value:{kind:'draft',text:'unsaved\n☃',binary:{type:'Uint8Array',base64:'AAH+/w=='}}},{key:'chat',value:{kind:'chat',sid:'sid-1',cursor:7,entries:['synthetic chat']}}]}]}]})),
    opfs:stores.map(storeId=>({storeId,origin:'http://127.0.0.1:8765',files:{'agent/sid-1/workspace/main.pjs':'c3ludGhldGljCg==','attachments/sid-1/image.bin':'AAH+/w==','empty.bin':''}})),
    ai:{chatIds:['sid-1'],draft:'not sent',workspace:'agent/sid-1/workspace',attachments:['attachments/sid-1/image.bin'],serverConversation:'external prerequisite; not reconstructible from display log'},
    native:{status:'synthetic bundle supplied; no host installed',version:'0.3.0',root:'/etc/persona-mullvad-router',files:{'configs/entry-a.conf':'[Interface]\nPrivateKey = SYNTHETIC_INVALID_KEY\nAddress = 10.0.0.2/32\n[Peer]\nPublicKey = SYNTHETIC_INVALID_PUBLIC_KEY\nEndpoint = 192.0.2.1:51820\nAllowedIPs = 0.0.0.0/0\n','state.json':'{"entry_id":"entry-a"}','prm-mv.conf':'SYNTHETIC_ACTIVE_CONFIG'},prerequisites:['combined extension','existing donor native bridge','Linux','Python 3','WireGuard','iproute','systemd','native host allowlist matches extension ID'],liveLeasesRestored:false}
  };
}
