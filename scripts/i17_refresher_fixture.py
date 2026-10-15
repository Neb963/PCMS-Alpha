"""Loopback-only HTTPS Perchance fixture; never proxies a live destination."""
import http.server
import json
import os
import pathlib
import shutil
import socket
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
        return DATA.setdefault(slug, {'name':slug,'publicId':'public_'+slug,
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
window.menuBar={saveState:'saved'};
window.modelTextEditor={getValue:()=>pjs,isClean:()=>menuBar.saveState==='saved'};
window.outputTemplateEditor={getValue:()=>html,isClean:()=>menuBar.saveState==='saved',setValue:v=>{html=v;menuBar.saveState='unsaved';}};
window.srcState={ready:async()=>{},list:()=>[],readFile:async()=>null,isDirty:async()=>false,hasPending:()=>false,conflictPaths:()=>[]};
window.saveCheckpointManager={isDivergenceBlocked:()=>false};window.aiAgentWorkspaceSnapshot=async()=>null;
window.app={data:{generator:initial},saveGenerator:async()=>{
  const response=await fetch('/fixture/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:initial.name,modelText:pjs,outputTemplate:html})});
  if(!response.ok)throw Error('synthetic lost ACK');menuBar.saveState='saved';return true;
}};
</script></body></html>'''.replace('INITIAL',json.dumps(g).replace('<','\\u003c')),kind='text/html')
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

class Fixture:
    def __enter__(self):
        self.folder=tempfile.TemporaryDirectory(prefix='i17-local-provider-')
        root=pathlib.Path(self.folder.name);cert=root/'cert.pem';key=root/'key.pem'
        subprocess.run(['openssl','req','-x509','-newkey','rsa:2048','-nodes','-days','1',
            '-subj','/CN=perchance.org','-addext','subjectAltName=DNS:perchance.org,IP:127.0.0.1',
            '-keyout',str(key),'-out',str(cert)],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        # Refuse to run without a local listener. Never fall through to the
        # real site. A privileged helper, when necessary on CI, ONLY binds
        # this loopback fixture; the Firefox/test process stays unprivileged.
        probe=socket.socket()
        try:probe.bind(('127.0.0.1',443));prefix=[]
        except PermissionError:
            if not shutil.which('sudo'):raise RuntimeError('Loopback HTTPS port unavailable')
            prefix=['sudo','-n']
        finally:probe.close()
        self.proc=subprocess.Popen(prefix+[sys.executable,str(pathlib.Path(__file__).resolve()),'--serve',str(cert),str(key)],
            stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        for _ in range(50):
            try:self.ledger();return self
            except Exception:
                if self.proc.poll() is not None:raise RuntimeError('Local provider fixture failed: '+self.proc.stderr.read().decode()[:300])
                time.sleep(.05)
        raise RuntimeError('Local provider fixture did not start')
    def ledger(self):
        # Disable host proxy explicitly: this is always local fixture traffic.
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}),
            urllib.request.HTTPSHandler(context=ssl._create_unverified_context()))
        with opener.open('https://127.0.0.1/__fixtureLedger',timeout=3) as r:return json.load(r)
    def __exit__(self,*_):
        self.proc.terminate()
        try:self.proc.wait(timeout=5)
        except subprocess.TimeoutExpired:self.proc.kill()
        self.folder.cleanup()

if __name__=='__main__':
    if len(sys.argv)!=4 or sys.argv[1]!='--serve':raise SystemExit('fixture server arguments required')
    for scenario in ('present','absent','no-persist','lost-ack'):
        generator('i17-native-'+scenario)
    server=http.server.ThreadingHTTPServer(('127.0.0.1',443),Handler)
    context=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);context.load_cert_chain(sys.argv[2],sys.argv[3])
    server.socket=context.wrap_socket(server.socket,server_side=True);server.serve_forever()
