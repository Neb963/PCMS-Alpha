"""S01 disposable candidate: bounded IPv4+IPv6 selected-exit measurement.

Runs exclusively inside a locally staged copy of PersonaMonkey routerd.
Reuses donor fetch_through_relay; NEVER introduces direct sockets or a router.
Not a route admission/TTL receipt until independently proven on a real host.
"""
import base64
import ipaddress
import json
import secrets
import time

V4_URL="https://api4.ipify.org/?format=json"
V6_URL="https://api6.ipify.org/?format=json"
NATIVE_LIFETIME_ID="native_"+secrets.token_hex(16)


def read_fixed_exit(fetch, relay_ip, relay_port, url, expected_family):
    # The native adapter is given *no* page-provided HTTP options. Donor's
    # fetch_through_relay owns SOCKS5 remote DNS, TLS and WireGuard binding.
    packet=fetch(relay_ip,relay_port,{
        "url":url,"method":"GET","headers":{},
        "max_redirects":0,"timeout_seconds":8,
    })
    if not isinstance(packet,dict) or packet.get("ok") is not True or (
        packet.get("status")!=200 or packet.get("final_url")!=url
    ):
        raise ValueError("FIXED_PROBE_HTTP_UNVERIFIED")
    raw=base64.b64decode(packet.get("body_base64",""),validate=True)
    if not 1<=len(raw)<=128:
        raise ValueError("FIXED_PROBE_BODY_UNVERIFIED")
    try:
        value=json.loads(raw.decode("ascii"))
        ip=ipaddress.ip_address(value["ip"])
    except (ValueError,UnicodeError,KeyError,TypeError) as exc:
        raise ValueError("FIXED_PROBE_ADDRESS_UNVERIFIED") from exc
    if ip.version!=expected_family or not ip.is_global or (
        isinstance(ip,ipaddress.IPv6Address) and ip.ipv4_mapped
    ):
        raise ValueError("FIXED_PROBE_FAMILY_UNVERIFIED")
    return ip.compressed.lower()


def measure_prepared_exit(router,route_id,context_id,fetch):
    if (not isinstance(route_id,str) or not 1<=len(route_id)<=128 or
        not isinstance(context_id,str) or not 8<=len(context_id)<=128):
        return {"ok":False,"code":"CANDIDATE_ID_INVALID"}
    try:
        with router.lock:
            forwarder=router.forwarders.get(route_id)
            if not forwarder:
                return {"ok":False,"code":"CANDIDATE_NOT_PREPARED"}
            initial=router.status()
            if not initial.get("ready") or not initial.get("base_route_bound") or (
                not initial.get("base_proxy_reachable")
            ):
                return {"ok":False,"code":"PROTECTION_UNVERIFIED"}
            relay_ip=forwarder.relay_ip
            relay_port=forwarder.relay_port
            router._validate_relay_target(relay_ip,relay_port)
        v4=read_fixed_exit(fetch,relay_ip,relay_port,V4_URL,4)
        v6=read_fixed_exit(fetch,relay_ip,relay_port,V6_URL,6)
        with router.lock:
            final=router.status()
            if(router.forwarders.get(route_id) is not forwarder or
               forwarder.relay_ip!=relay_ip or forwarder.relay_port!=relay_port or
               not final.get("ready") or not final.get("base_route_bound") or
               not final.get("base_proxy_reachable") or
               final.get("selected_entry")!=initial.get("selected_entry")):
                return {"ok":False,"code":"CANDIDATE_CHANGED_DURING_PROBE"}
        return {"ok":True,"source":"DONOR_FIXED_PROBE",
           "routeId":route_id,"contextId":context_id,
           "nativeLifetimeId":NATIVE_LIFETIME_ID,
           "evidenceId":"evidence_"+secrets.token_hex(16),
           "ipv4":{"state":"VERIFIED","address":v4},
           "ipv6":{"state":"VERIFIED","address":v6},
           "dns":"VERIFIED_PROTECTED",
           "protection":"READY",
           "observedAtMs":int(time.time()*1000),
           # No arbitrary 'validUntilMs': E01/E04 must qualify TTL first.
           "disposition":"HOLD_TTL_UNQUALIFIED"}
    except (ValueError,OSError,RuntimeError,TypeError,UnicodeError):
        # Never return an IPv4-only success if IPv6 fails. Failed or
        # inconclusive IPv6 blocking requires a SEPARATE positive proof.
        return {"ok":False,"code":"FIXED_FAMILY_PROBE_UNVERIFIED"}
