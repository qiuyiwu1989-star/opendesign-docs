# Spec037 — OpenDesign Docs 开放接入

Status: local implementation; production publication and public service deployment remain separate.

## Intent and owner decision

The owner approved public product access, initially free, with possible advanced paid services later, and approved continuing the website SDK and MCP implementation. Build one shared HTML handoff contract, retaining the existing local-first editor and exact-source edits. This does not authorize production deployment or a billing system.

## Scope

- Browser SDK `OpenDesign.open({name, html}, {docsUrl, readyTimeoutMs, onReady})`, IIFE and ESM outputs; synchronous popup, receiver window + origin + nonce checks, one payload, explicit committed result. READY timeout 20 seconds by default; no confirmation deadline. Popup blocked/closed/unavailable are distinct outcomes.
- Independent Node HTTP process using official MCP SDK 2.0.0, stateless Streamable HTTP `/mcp`; tool `opendesign_create_document_handoff`. Real MCP client discovery/call validation.
- Same implementation supplies REST creation for backend callers. No source URL fetching. No credentials, permanent storage, document listing or billing.
- In-memory handoffs: cryptographic 256-bit bearer token in URL fragment; 15-minute TTL; 100 items / 60 MiB UTF-8 aggregate / 5 MiB each. Expiry sweep every 30 seconds and on store use. Link GET never consumes a document. Read supports cancellation and retry. Confirmed successful import triggers idempotent deletion; expiry cleans up lost acknowledgements. Restart invalidates all links. UTF-8 bytes bound payload, not exact Node RSS.
- Landing page retrieves source but never executes it; explicit button opens Docs and uses SDK. Documents already sent to Docs may still be confirmed after link expiry. Concurrent holders can import independent copies; no exactly-once delivery claim.
- Configured HTTPS origins (HTTP allowed only on loopback), strict Host/Origin validation, no trusted forwarding headers, no CORS access, no-store/no-referrer/noindex, restricted landing CSP, 30 POST requests/minute/peer, bounded rate map, 4 simultaneous handlers, bounded body/HTTP timeouts. This is a single-process pilot; distributed storage, identity and per-user quotas remain future scope.

## Acceptance

1. MCP initialize → tools/list → tools/call returns structured `ready`, URL and expiry; it never reports imported or returns original HTML.
2. Browser from that URL → confirmation → IndexedDB commit → source success → server read 404. Rejection leaves source available until expiry.
3. SDK rejects foreign window/origin and nonce mismatch, ignores duplicate READY, releases timers/listeners on terminal result, validates before popup.
4. Store tests cover byte-preservation, expiry, capacity, bad Unicode and cleanup; HTTP tests exercise origin/Host rejection, payload bounds and no-execution landing response.
5. Existing source integrity, editor tests, both builds and bundle budgets remain green. Real representative handoff/edit/save/reload and prior Spec036 export/reimport evidence are separately recorded.

## Commercial direction

Initial free access: browser editing, import/export, website SDK, bounded temporary handoffs. Possible later paid value: teams and permissions, long-term cloud storage, larger usage and service guarantees, custom branding/domains. No pricing or entitlement implementation in this scope. Public availability is independent of publishing users' documents: document libraries remain private to the browser.
