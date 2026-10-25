"""Developer-only independent SOCKS/TLS/native/provider oracle; never packaged.

No Internet forwarding, WireGuard, real accounts or OS host registration.
Only the native-messaging API is substituted; Firefox performs real SOCKS
authentication, TLS, protected page requests and production isolated readers.
"""
import hashlib,json,secrets,socket,socketserver,ssl,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from types import SimpleNamespace

def read_exact(stream,n):
    result=b''
    while len(result)<n:
        part=stream.recv(n-len(result))
        if not part:raise EOFError()
        result+=part
    return result

class Oracle:
    def __init__(self,cert,key):
        self.lock=threading.RLock();self.key=secrets.token_hex(24)
        self.tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER);self.tls.load_cert_chain(cert,key)
        self.exits={};self.native=[];self.auth=[];self.effects=[];self.requests=[];self.resources={}
        self.helper_down=False;self.proxy_down=False;self.inventory_unknown={2};self.lost_prepare=set();self.lost_create=False
        self.sequence=0;self.wrong_exit=None
        for owner,count in [(0,2),(1,1),(2,1)]:
            for i in range(count):
                name=f'issue60-existing-{owner}-{i}';self.resources[name]=self.generator(name,owner,'original source '+name)
        oracle=self
        class Control(BaseHTTPRequestHandler):
            def log_message(self,*args):pass
            def do_POST(self):
                if self.headers.get('X-Fixture-Key')!=oracle.key:self.send_error(403);return
                raw=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))))
                try:value=oracle.command(raw)
                except Exception as error:value={'ok':False,'error':str(error)}
                body=json.dumps(value).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        self.control=ThreadingHTTPServer(('127.0.0.1',0),Control);threading.Thread(target=self.control.serve_forever,daemon=True).start()

    def generator(self,name,owner,pjs=''):
        self.sequence+=1
        return {'name':name,'owner':owner,'isPrivate':True,'publicId':'fixture_'+str(self.sequence),'modelText':pjs,'outputTemplate':'','srcManifest':{}}
    def owner(self,route):return int(route['relay_ip'].split('.')[-1])-7
    def credentials(self,owner):return {'loggedIn':True,'email':f'fixture{owner}@pcms.invalid','sessionToken':f'offline-session-{owner}-not-live'}
    def status(self):
        return {'ok':True,'version':'0.3.0','interface_up':True,'base_route_bound':True,'base_proxy_reachable':not self.proxy_down,
                'ready':not self.proxy_down,'active_exits':[self.endpoint(k,v) for k,v in self.exits.items()]}
    def endpoint(self,route_id,value):
        return {'route_id':route_id,'relay_ip':value['relay_ip'],'relay_port':1080,'local_host':'127.0.0.1','local_port':value['server'].server_address[1]}
    def command(self,m):
        with self.lock:
            command=m.get('command');route_id=m.get('route_id')
            self.native.append({'command':command,'route':route_id})
            if self.helper_down:return {'ok':False,'error':'The specified native messaging host was not found'}
            if command=='status':return self.status()
            if command=='prepare_exit':
                if self.proxy_down:return {'ok':False,'error':'Mullvad tunnel is not ready'}
                if m.get('relay_port')!=1080 or not str(m.get('relay_ip','')).startswith('10.124.0.'):return {'ok':False,'error':'invalid Mullvad relay target'}
                if route_id not in self.exits:
                    self.exits[route_id]={'relay_ip':m['relay_ip'],'password':None,'server':self.forwarder(route_id)}
                route=self.exits[route_id];route['password']=m['forwarder_token']
                result={'ok':True,'ready':True,**self.endpoint(route_id,route)}
                if route_id in self.lost_prepare:self.lost_prepare.remove(route_id);return {'ok':False,'error':'timed out'}
                return result
            if command=='release_exit':
                route=self.exits.pop(route_id,None)
                if route:threading.Thread(target=route['server'].shutdown,daemon=True).start()
                return {'ok':True,'released':bool(route)}
            if command=='list_entries':return {'ok':True,'entries':[]}
            return {'ok':False,'error':'unsupported fixture native command'}
    def forwarder(self,route_id):
        oracle=self
        class Forwarder(socketserver.BaseRequestHandler):
            def handle(self):
                stream=self.request;stream.settimeout(40)
                try:
                    version,count=read_exact(stream,2);methods=read_exact(stream,count)
                    if version!=5 or 2 not in methods:stream.sendall(b'\x05\xff');return
                    stream.sendall(b'\x05\x02');auth_version,size=read_exact(stream,2);username=read_exact(stream,size)
                    password=read_exact(stream,read_exact(stream,1)[0]).decode()
                    with oracle.lock:
                        route=oracle.exits.get(route_id);accepted=bool(route and not oracle.proxy_down and username==b'persona' and password==route['password'])
                        oracle.auth.append({'route':route_id,'accepted':accepted,'passwordSha256':hashlib.sha256(password.encode()).hexdigest()})
                    stream.sendall(b'\x01'+(b'\x00' if accepted else b'\x01'))
                    if not accepted:return
                    version,command,reserved,kind=read_exact(stream,4)
                    if kind!=3:stream.sendall(b'\x05\x08\x00\x01'+bytes(6));return
                    domain=read_exact(stream,read_exact(stream,1)[0]).decode();port=int.from_bytes(read_exact(stream,2),'big')
                    allowed=domain in ('perchance.org','ipv4.am.i.mullvad.net','ipv6.am.i.mullvad.net','am.i.mullvad.net') or domain.endswith('.dnsleak.am.i.mullvad.net')
                    if command!=1 or port!=443 or not allowed:stream.sendall(b'\x05\x02\x00\x01'+bytes(6));return
                    stream.sendall(b'\x05\x00\x00\x01\x7f\x00\x00\x01\x00\x00')
                    wrapped=oracle.tls.wrap_socket(stream,server_side=True)
                    Provider(wrapped,self.client_address,SimpleNamespace(oracle=oracle,route_id=route_id,domain=domain,server_name='offline-fixture',server_port=443))
                except (EOFError,OSError,ssl.SSLError):pass
        server=socketserver.ThreadingTCPServer(('127.0.0.1',0),Forwarder);server.daemon_threads=True
        threading.Thread(target=server.serve_forever,daemon=True).start();return server
    def inspect(self):
        with self.lock:return {'native':list(self.native),'auth':list(self.auth),'effects':list(self.effects),'requests':list(self.requests),
                               'resources':{k:{x:v for x,v in value.items() if x!='owner'} for k,value in self.resources.items()}}
    def close(self):
        for value in list(self.exits.values()):value['server'].shutdown();value['server'].server_close()
        self.control.shutdown();self.control.server_close()

class Provider(BaseHTTPRequestHandler):
    protocol_version='HTTP/1.1'
    def log_message(self,*args):pass
    def reply(self,value,kind='application/json'):
        body=value.encode() if isinstance(value,str) else json.dumps(value).encode()
        self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(body)
    def do_GET(self):
        oracle=self.server.oracle
        with oracle.lock:
            route=oracle.exits.get(self.server.route_id)
            if not route:self.send_error(503);return
            owner=oracle.owner(route);domain=self.server.domain
            oracle.requests.append({'domain':domain,'method':'GET','path':self.path,'owner':owner})
            if domain.endswith('.dnsleak.am.i.mullvad.net'):return self.reply([{'ip':'10.64.0.1','mullvad_dns':True}])
            if domain!='perchance.org':
                exit_owner=oracle.wrong_exit if oracle.wrong_exit is not None else owner
                return self.reply({'mullvad_exit_ip':True,'ip':f'2a03:1b20:{exit_owner+1}::1' if domain.startswith('ipv6.') else f'45.83.{exit_owner+1}.1'})
            user=json.dumps(oracle.credentials(owner))
            self.reply('<!doctype html><meta charset="utf-8"><title>Offline Perchance fixture</title><h1>Disposable protected session</h1><script>localStorage.setItem("app-storage",JSON.stringify({user:'+user+'}));localStorage.setItem("sessionTokenLastChangeTime","fixture-stable");</script>','text/html')
    def do_POST(self):
        oracle=self.server.oracle
        with oracle.lock:
            route=oracle.exits.get(self.server.route_id)
            if not route:self.send_error(503);return
            owner=oracle.owner(route);data=json.loads(self.rfile.read(int(self.headers.get('Content-Length',0))));endpoint=self.path.split('/')[-1]
            oracle.requests.append({'domain':self.server.domain,'method':'POST','path':self.path,'owner':owner})
            user=oracle.credentials(owner)
            if endpoint!='getGeneratorPageData' and (data.get('email')!=user['email'] or data.get('sessionToken')!=user['sessionToken']):return self.reply({'status':'session-token-error'})
            name=data.get('generatorName');generator=oracle.resources.get(name)
            if endpoint=='getGeneratorsByUser':
                return self.reply({'status':'success','generators':[{'name':k,'isPrivate':v['isPrivate']} for k,v in oracle.resources.items() if v['owner']==owner],'generatorFolderMap':{}})
            if endpoint=='checkGeneratorOwnership':return self.reply({'status':'unknown' if owner in oracle.inventory_unknown else 'is-owner' if generator and generator['owner']==owner else 'is-not-owner'})
            if endpoint=='getGeneratorPageData':
                if name=='minimal':return self.reply({'status':'success','generator':{'name':'minimal','isPrivate':False,'publicId':'minimal_fixture','modelText':'template','outputTemplate':'','srcManifest':{}}})
                return self.reply({'status':'success','generator':{k:v for k,v in generator.items() if k!='owner'}} if generator else {'status':'generator-does-not-exist'})
            if endpoint=='save':
                value=data.get('generator',{});assert value.get('isPrivate') is True and value.get('modelText')=='' and value.get('outputTemplate')==''
                name='temporary-issue60-'+str(oracle.sequence+1);oracle.resources[name]=oracle.generator(name,owner)
                oracle.effects.append({'kind':'CREATE','name':name,'owner':owner})
                if oracle.lost_create:oracle.lost_create=False;return self.reply({'status':'unverified'})
                return self.reply({'status':'created','name':name})
            if endpoint=='changeGeneratorName':
                old,new=data.get('currentName'),data.get('newName');value=oracle.resources.get(old)
                if not value or value['owner']!=owner or new in oracle.resources:return self.reply({'status':'conflict'})
                del oracle.resources[old];value['name']=new;oracle.resources[new]=value;oracle.effects.append({'kind':'RENAME','old':old,'name':new,'owner':owner});return self.reply({'status':'success'})
            self.reply({'status':'unsupported-fixture-endpoint'})
