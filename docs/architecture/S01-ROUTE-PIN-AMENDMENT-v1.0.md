# S01 technical amendment v1.0 — donor route pin replaces the per-request grant join

**Status:** Proposed with the S01 implementation PR. Effective only after independent review and merge to `main`. Replaces one Gate B v1.1 **engineering mechanism** (§4.1 `assignment.stage/admit` grant, §4.2 cross-store join, §4.2.1 `TrustedAdmission`, the S01 native fixed-probe derivative). It changes **no** accepted client behavior (C-04–C-09, C-56–C-60, AC-01–AC-03) and does not modify signed or accepted documents.

## 1. Original mechanism

Gate B §4.2 required a donor-held, expiring per-binding network grant, published only after a PCMS IndexedDB join (13-field `AdmissionKey`, safety generations, revocation latches, snapshot TTL), plus a modified native host (`pcms.verify_exit`) for dual-family exit proof. Account traffic admission was to depend on a TTL that Gate B itself said could not be chosen until E-01/E-04 measured it.

## 2. Why it was disproportionate (source evidence on PR #23 head `85ae5cf`)

- **Never connected.** `overlay.mjs` replaced the committed observer callback with `readCommitted: () => ({allow:false})`; `createProtectedJoin()` existed only in tests. The installed XPI denied every enrollment (`PROTECTED_ADMISSION_UNPROVEN`, `getHealth().admission` hard-coded).
- **Could not have worked.** `stageBlockedBinding` required `routeId === 'block'`; the donor's Block route ID is `"__block__"` (`donor/.../lib/constants.js`). The native verifier required an uninstalled routerd derivative.
- **Protected nothing extra.** The grant's only property beyond "this Persona is on its reserved route" is the TTL. Between probes, provider-side exit drift is unobservable either way (Gate B §4.3 says so); periodic re-verification detects it. A TTL expiry would block a human's protected tab without improving exit uniqueness.

## 3. PersonaMonkey capabilities reused (pinned donor `9995f6e`, tree `9d59d80`)

| Responsibility | Class | Donor source reused |
|---|---|---|
| Fail-closed proxy + blocking listener, blackhole on error/not-ready | A | `lib/routing-gate.js`, `background.js handleProxyRequest/handleBeforeRequest` |
| No Direct for protected routes; kill switch; strict proxy match | A | `lib/policy.js routeDecision/proxyInfoMatches` |
| Mullvad route via WireGuard-bound SOCKS relay; native forwarders | A | `lib/mullvad-runtime.js`, `native/routerd.py prepare_exit` |
| Exit + DNS-leak verification, context-fenced cache (15 min) | A | `background.js performProfileTest/testProfile`, `persona-intelligence.js` |
| Persona create, route assign, mutation fence, leases | A | `persona-platform.js`, `localMutationFence`, management-integration leases |
| Relay list, route creation via security preview | B | `fetchMullvadRelays`, `createMullvadRoute` + `authorizePreview` (one exact `proxy-destination-added` delta, `10.124.0.0/16:1080` only) |
| Probe an unassigned candidate route; IPv6 echo | B | same route-test override + `ipv6.am.i.mullvad.net`; positive IPv6 blocking only from relay SOCKS reply 3/8 via existing `fetch_exit` |
| Historical exit ledger, account↔Persona↔route binding, Add Account/Confirm/repair orchestration | C | `network-ledger.mjs`, `enrollment.mjs`, `accounts.mjs` |
| Tagged Persona may only use its reserved route | D (missing invariant) | `route-pin.mjs` + 2 checks per donor handler |

Prior donor evidence (Phase 08 record, `docs/history/planning/phase-08-...md`): real Firefox route/egress test with an installed compatible `0.3.0` host, fail-closed routing and recovery. It is reused as capability evidence for the unchanged donor mechanisms above; it is **not** an L-tier proof of the pinned revision or of the new PCMS paths.

## 4. The remaining genuinely new guard (class D)

**Exploit without it:** a human (or any donor state writer) reassigns account A's Persona to a route whose exit is recorded for account B; A's logged-in session cookies leave through B's exit before any PCMS job notices (C-05/C-06 violation).

**Remedy — route pin:** a donor Persona carrying the durable `pcmsBindingId` tag may send a request only if the PCMS ledger holds an `ACTIVE` pin for exactly that binding, Persona UID, container and route. Checked synchronously at the donor's first decision **and** again after the donor's last await, in both the proxy and blocking hooks. Table starts empty each background boot and is loaded only from the committed ledger; storage close/version change clears it; PCMS withdraws a pin synchronously (`holdRoutePin`) before any ledger write or donor route mutation. Untagged ordinary Personas never consult PCMS storage. The donor fence forbids adding, removing or transplanting tags except one same-XPI one-commit permit that creates a new Block-routed tagged Persona.

All PCMS effects additionally pass `persona-guard.inspect`, which now requires the pin (untagged → `ROUTE_RESERVATION_REQUIRED`).

## 5. Safety equivalence and tests

| Gate B intent | Now enforced by | D test |
|---|---|---|
| No traffic before committed exclusive reservation | empty pin table; pin ACTIVE only after assigned re-probe | `i00-s01-enrollment` restart/lost-ACK; `i00-s01-donor-routing` (staged `background.js`) |
| Revocation before mutation | `holdRoutePin` before ledger/assign | enrollment repair order (`HOLD` precedes `ASSIGN`) |
| Route change/drift | per-request route compare; ledger `EXIT_DRIFT_CONFLICT` hold | route-edited-outside-PCMS, drift tests |
| Historical exclusivity v4/v6, no shared route/Persona | ledger transitions, IDB single transaction | `i00-s01-network-ledger`, concurrency test |
| No Direct, no fallback | donor `routeDecision` + pin non-proxy denial | donor-routing Direct test |
| Restart/storage loss | boot-empty table; corrupt ledger closes pins | restart test |
| Ordinary Personas unaffected | untagged bypass, no PCMS wait | donor-routing + B oracle |
| Unknown IPv6 never admitted | parser accepts only OBSERVED or relay-reported unreachable | ledger parser test, adapter test |

Mutation checks (removing the exit-history check, pin route comparison, boot-empty rule, hold-before-assign, principal pin, drift check or IPv6 rule) each turn a test red.

## 6. Migration and recovery

- Ledger key unchanged (`network:s01:exit-ownership-v1`), schema 2. Schema-1 owners (exit history) are preserved; schema-1 reservations were never admitted and grant nothing.
- Accounts from the pre-S01 manual flow have no binding tag: held with an explicit message (archive, then Add Account). No production fleet exists to migrate.
- Archive keeps the pin (human protected browsing may continue; automation stops by account state) and never releases exit history. Idle forwarder release is left to the donor's existing auto-stop.
- Removed: `protected-admission.mjs`, `network-join.mjs`, `native/s01-fixed-exit-probe.py`, the routerd derivative in `build-s01-native.py`. Kept: native runtime witness and `qualified-clock.mjs` (E-04).

## 7. What this does not prove

D and staged-background tests use fake donor primitives with independent effect ledgers. B proves the installed XPI runs Add Account to an honest hold without a native host and that an unpinned tagged Persona's request never reaches a local proxy oracle. Real Mullvad exit observation, IPv6 behavior of Mullvad SOCKS relays, repair on a real outage and live login remain **L/H holds**.
