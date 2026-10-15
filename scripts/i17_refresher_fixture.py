"""Loopback-only HTTPS Perchance fixture; never proxies a live destination."""
import http.server
import json
import os
import pathlib
import shutil
import socket
import socketserver
import select
import re
import ssl
import subprocess
import sys
import tempfile
import threading
import time
import urllib.request

DATA = {}
LOCK = threading.Lock()
def generator(slug):
    with LOCK:
        return DATA.setdefault(slug, {'name':slug,'publicId':slug,
            'isPrivate':False,'modelText':'output = fixture',
            'outputTemplate':'<!doctype html>\n<main>[output]</main>', 'srcManifest':{},'saves':0})

class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def reply(self, body, status=200, kind='application/json'):
        b=body.encode() if isinstance(body,str) else json.dumps(body).encode()
        self.send_response(status);self.send_header('Content-Type',kind)
        self.send_header('Content-Length',str(len(b)));self.send_header('Cache-Control','no-store')
        if status==429:self.send_header('Retry-After','900')
        self.end_headers();self.wfile.write(b)
    def do_GET(self):
        path=self.path.split('?')[0]
        host=self.headers.get('Host','').split(':')[0]
        if host.endswith('.dnsleak.am.i.mullvad.net'):
            self.reply([{'ip':'203.0.113.53','mullvad_dns':True}]);return
        if host in ('am.i.mullvad.net','ipv4.am.i.mullvad.net'):
            self.reply({'ip':'203.0.113.10','mullvad_exit_ip':True});return
        if path=='/__fixtureLedger':
            with LOCK:self.reply(DATA)
            return
        if path=='/api/getGeneratorList':
            with LOCK: rows=[{'name':s,'views':43} for s in DATA if not s.endswith('-absent')]
            self.reply({'status':'success','generators':rows});return
        slug=path.strip('/')
        if not slug or not slug.replace('-','').isalnum():self.reply({},404);return
        g=generator(slug)
        # Provider fixture only. The packaged native adapter is injected by
        # the real browser scripting API; no production script is replaced.
        self.reply('''<!doctype html><html><body><p>Isolated provider fixture</p><script>
const initial=INITIAL;
localStorage.setItem('app-storage',JSON.stringify({user:{loggedIn:true,email:'fixture@example.invalid',sessionToken:'synthetic-fixture-token-only'}}));
localStorage.setItem('sessionTokenLastChangeTime','fixture_session_v1');
localStorage.setItem('perchanceTabsOpen',JSON.stringify({[initial.name]:{fixture:{}}}));
let pjs=initial.modelText,html=initial.outputTemplate;
window.__editorReady=true;window.__saveInFlight=false;window.userOwnsThisGenerator=true;
window.editorCollabInitialSyncIsPending=false;window.__collabRoomFailed=false;
window.menuBar={saveState:initial.name.endsWith('-dirty')?'unsaved':'saved'};
window.modelTextEditor={getValue:()=>pjs,isClean:()=>menuBar.saveState==='saved'};
window.outputTemplateEditor={getValue:()=>html,isClean:()=>menuBar.saveState==='saved',setValue:v=>{html=v;menuBar.saveState='unsaved';}};
window.srcState={ready:async()=>{},list:()=>[],readFile:async()=>null,isDirty:async()=>false,hasPending:()=>false,conflictPaths:()=>[]};
window.saveCheckpointManager={isDivergenceBlocked:()=>false};window.aiAgentWorkspaceSnapshot=async()=>null;
window.app={data:{generator:initial},saveGenerator:async()=>{
  const response=await fetch('/fixture/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:initial.name,modelText:pjs,outputTemplate:html})});
  if(!response.ok)throw Error('synthetic lost ACK');menuBar.saveState='saved';return true;
}};
</script></body></html>'''.replace('INITIAL',json.dumps(g).replace('<',r'\u003c')),kind='text/html')
    def do_POST(self):
        length=int(self.headers.get('Content-Length','0'))
        if length>1048576:self.reply({},413);return
        try:p=json.loads(self.rfile.read(length))
        except ValueError:self.reply({},400);return
        path=self.path.split('?')[0]
        if path=='/fixture/save':
            g=generator(p.get('name','invalid'))
            with LOCK:
                g['saves']+=1
                if not g['name'].endswith('-no-persist'):
                    g['modelText']=p['modelText'];g['outputTemplate']=p['outputTemplate']
            self.reply({'status':'saved'},503 if g['name'].endswith('-lost-ack') else 200);return
        if path=='/api/getGeneratorsByUser':
            with LOCK:rows=[{'name':s,'isPrivate':g['isPrivate']} for s,g in DATA.items()]
            self.reply({'status':'success','generators':rows,'generatorFolderMap':{}});return
        if path=='/api/checkGeneratorOwnership':self.reply({'status':'is-owner'});return
        if path=='/api/getGeneratorPageData':
            self.reply({'status':'success','generator':generator(p.get('generatorName','invalid'))});return
        self.reply({},404)

class Proxy(socketserver.StreamRequestHandler):
    def handle(self):
        line=self.rfile.readline(4096).decode('ascii','replace').strip()
        while self.rfile.readline(4096).strip():pass
        words=line.split()
        if len(words)!=3 or words[0]!='CONNECT':return
        target=words[1].lower()
        allowed=target in ('perchance.org:443','am.i.mullvad.net:443','ipv4.am.i.mullvad.net:443') or bool(
            re.fullmatch(r'[0-9a-f-]{36}\.dnsleak\.am\.i\.mullvad\.net:443',target))
        if not allowed:
            self.wfile.write(b'HTTP/1.1 403 Forbidden\r\nContent-Length: 0\r\n\r\n');return
        # Every allowed destination terminates at THIS loopback fixture.
        # No DNS lookup, production socket, forwarding or Direct fallback.
        with socket.create_connection(('127.0.0.1',self.server.tls_port),timeout=5) as upstream:
            self.wfile.write(b'HTTP/1.1 200 Connection Established\r\n\r\n');self.wfile.flush()
            connections=(self.connection,upstream)
            while True:
                ready,_,_=select.select(connections,[],[],20)
                if not ready:return
                for source in ready:
                    data=source.recv(65536)
                    if not data:return
                    (upstream if source is self.connection else self.connection).sendall(data)

class Fixture:
    def __enter__(self):
        DATA.clear()
        for scenario in ('present','absent','no-persist','lost-ack','dirty','idb-abort'):
            generator('i17-native-'+scenario)
        generator('i17-entry-present')
        self.folder=tempfile.TemporaryDirectory(prefix='i17-local-provider-')
        root=pathlib.Path(self.folder.name);cert=root/'cert.pem';key=root/'key.pem'
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1',
            '-subj','/CN=perchance.org','-addext','subjectAltName=DNS:perchance.org,DNS:am.i.mullvad.net,DNS:ipv4.am.i.mullvad.net,DNS:*.dnsleak.am.i.mullvad.net,IP:127.0.0.1',
            '-keyout',str(key),'-out',str(cert)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        self.server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler)
        self.server.daemon_threads=True
        context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(cert,key)
        self.server.socket=context.wrap_socket(self.server.socket,server_side=True)
        self.proxy=socketserver.ThreadingTCPServer(('127.0.0.1',0),Proxy);self.proxy.daemon_threads=True
        self.proxy.tls_port=self.server.server_address[1]
        self.proxy_port=self.proxy.server_address[1]
        for server in (self.server,self.proxy):
            threading.Thread(target=server.serve_forever,daemon=True).start()
        return self
    def ledger(self):
        with LOCK:return json.loads(json.dumps(DATA))
    def __exit__(self,*_):
        for server in (self.proxy,self.server):server.shutdown();server.server_close()
        self.folder.cleanup()
